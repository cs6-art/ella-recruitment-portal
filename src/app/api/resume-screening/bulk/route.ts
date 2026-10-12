import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { canManagePipeline, passesDepartmentWall } from "@/lib/access-control";
import { getBulkResumeQueue, getBulkResumeScreeningEvidence } from "@/lib/candidate-applications";
import { bulkResumeEnvironment, bulkResumeIsUatMarked, productionUatBatchId } from "@/lib/bulk-resume-config";
import { getRoleRequests, isPublishedRoleForIntake } from "@/lib/google-sheets";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";
const STALE_PROCESSING_MS = 50 * 60 * 1000;

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
    const roles = (await getRoleRequests({ liveOnly: true })).filter((role) => passesDepartmentWall(user, role.department));
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
    // Keep the table and summary cards on the same latest state per resume.
    // Historical queue events remain available in the sheet for audit/retry
    // purposes, but must not inflate the current Role Total.
    // Reconcile every current queue item, including historical rows that were
    // written before jobId existed. The evidence matcher falls back through
    // application ID, SHA, Drive file ID, role-scoped filename, and unique
    // candidate identifiers without allowing cross-role matches.
    let screeningEvidence = new Set<string>();
    let evidenceError = "";
    try {
      screeningEvidence = await getBulkResumeScreeningEvidence(queueItems);
    } catch (error) {
      evidenceError = error instanceof Error ? error.message : "The saved screening results could not be verified.";
      console.error("[Bulk Resume Status] Unable to verify saved screening evidence:", error);
    }
    const now = Date.now();
    const queueAge = (item: (typeof queueItems)[number]) => {
      const timestamp = Date.parse(item.lastUpdated || item.processedAt || item.processingStartedAt || item.discoveredAt);
      return Number.isFinite(timestamp) ? now - timestamp : Number.MAX_SAFE_INTEGER;
    };
    const items = queueItems.map((item) => {
      const rawStatus = item.status.toLowerCase();
      const hasEvidence = screeningEvidence.has(`${item.roleId.toLowerCase()}|${item.driveFileId.toLowerCase()}`);
      if (evidenceError && ["screened", "processed"].includes(rawStatus)) {
        return queueAge(item) >= STALE_PROCESSING_MS
          ? { ...item, status: "Failed", errorMessage: "The saved screening result could not be verified after 50 minutes. Refresh status before retrying." }
          : { ...item, status: "Processing", errorMessage: "The workflow reported completion, but the saved screening result could not be verified. Refresh status or contact support." };
      }
      if (hasEvidence && ["screened", "processed", "processing"].includes(rawStatus)) {
        return { ...item, status: "Screened", errorMessage: "" };
      }
      if (["screened", "processed"].includes(rawStatus)) {
        // A recent Screened event can briefly precede the applicant write. An
        // old one is no longer active work and must be visible as a durable
        // failure rather than an endless Processing item.
        if (queueAge(item) >= STALE_PROCESSING_MS) {
          return { ...item, status: "Failed", errorMessage: "Applicant result could not be persisted." };
        }
        return { ...item, status: "Processing", errorMessage: "Waiting for the saved applicant screening result." };
      }
      if (rawStatus === "processing" && queueAge(item) >= STALE_PROCESSING_MS) {
        return { ...item, status: "Failed", errorMessage: "Screening did not produce a saved result within 50 minutes." };
      }
      if (rawStatus === "queued" && queueAge(item) >= STALE_PROCESSING_MS) {
        return { ...item, status: "Failed", errorMessage: "The queued job did not start within 50 minutes. Retry this resume or upload it again." };
      }
      return item;
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
      evidenceVerified: !evidenceError,
      ...(evidenceError ? { error: "Queue statuses are available, but saved screening results could not be verified. Refresh status before treating any item as complete." } : {}),
      counts,
      // Keep the legacy response property for existing clients, but make it
      // the exact same reconciled current-state distribution as `counts`.
      roleTotals: counts,
      items: items.slice(0, 50),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bulk screening status is not configured.";
    const configured = !message.toLowerCase().includes("bulk_resume_queue") && !message.toLowerCase().includes("unable to parse range");
    return NextResponse.json({
      success: false,
      configured,
      error: configured ? message : "Create the Bulk_Resume_Queue tab to view processing status.",
    }, { status: 503 });
  }
}
