import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { canManagePipeline } from "@/lib/access-control";
import { getBulkResumeQueue, getBulkResumeScreeningEvidence } from "@/lib/candidate-applications";
import { bulkResumeEnvironment, bulkResumeIsUatMarked, productionUatBatchId } from "@/lib/bulk-resume-config";
import { getRoleRequests, isPublishedRoleForIntake } from "@/lib/google-sheets";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

function errorResponse(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request: Request) {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) return errorResponse("Authentication required.", 401);
  if (!canManagePipeline(user)) return errorResponse("Only HR reviewers can view bulk screening status.", 403);

  const roleId = new URL(request.url).searchParams.get("roleId")?.trim() || "";
  try {
    const configuredProductionUatBatchId = productionUatBatchId();
    const roles = await getRoleRequests({ liveOnly: true });
    const publishedRoleIds = new Set(
      roles
        .filter(isPublishedRoleForIntake)
        .map((role) => role.roleId.toLowerCase()),
    );
    if (roleId && !publishedRoleIds.has(roleId.toLowerCase())) return errorResponse("The selected role is not published.", 409);

    // n8n is the writer for this tab, so a cached read can hide a completed
    // screening for the entire 20-second Sheets cache TTL. This endpoint is
    // polled while work is active; read the queue fresh so the UI never turns
    // a stale snapshot into a misleading completion state.
    const queueItems = (await getBulkResumeQueue(roleId, { fresh: true })).filter((item) => publishedRoleIds.has(item.roleId.toLowerCase()));
    const terminalItems = queueItems.filter((item) => ["screened", "processed"].includes(item.status.toLowerCase()));
    const screeningEvidence = await getBulkResumeScreeningEvidence(terminalItems.map((item) => item.applicationId));
    const items = queueItems.map((item) => {
      if (!["screened", "processed"].includes(item.status.toLowerCase())) return item;
      if (item.applicationId && screeningEvidence.has(item.applicationId.toLowerCase())) return item;
      // Do not expose a terminal-looking queue event as Completed until the
      // corresponding applicant row contains the saved AI result.
      return {
        ...item,
        status: "Processing",
        errorMessage: "Waiting for the saved applicant screening result.",
      };
    });
    const counts = items.reduce<Record<string, number>>((result, item) => {
      const status = item.status || "Queued";
      result[status] = (result[status] || 0) + 1;
      return result;
    }, {});

    return NextResponse.json({
      success: true,
      configured: true,
      // This is an authenticated, non-secret readiness signal for the
      // controlled Production canary. It lets operators verify the active
      // deployment without uploading a resume just to inspect its config.
      productionUatActive: Boolean(configuredProductionUatBatchId),
      batchId: configuredProductionUatBatchId,
      environment: bulkResumeIsUatMarked() ? "uat" : bulkResumeEnvironment(),
      isUat: bulkResumeIsUatMarked(),
      counts,
      items: items.slice(0, 50),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bulk screening status is not configured.";
    const configured = !message.toLowerCase().includes("bulk_resume_queue") && !message.toLowerCase().includes("unable to parse range");
    return NextResponse.json({
      success: true,
      configured: false,
      counts: {},
      items: [],
      error: configured ? message : "Create the Bulk_Resume_Queue tab to view processing status.",
    });
  }
}
