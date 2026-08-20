import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getBulkResumeQueue } from "@/lib/candidate-applications";
import { getRoleRequests, isPublishedRoleForIntake } from "@/lib/google-sheets";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

function errorResponse(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request: Request) {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) return errorResponse("Authentication required.", 401);
  if (user.canReviewRole !== true && user.canApproveRole !== true) return errorResponse("Only HR reviewers can view bulk screening status.", 403);

  const roleId = new URL(request.url).searchParams.get("roleId")?.trim() || "";
  try {
    const roles = await getRoleRequests({ liveOnly: true });
    const publishedRoleIds = new Set(
      roles
        .filter(isPublishedRoleForIntake)
        .map((role) => role.roleId.toLowerCase()),
    );
    if (roleId && !publishedRoleIds.has(roleId.toLowerCase())) return errorResponse("The selected role is not published.", 409);

    const items = (await getBulkResumeQueue(roleId)).filter((item) => publishedRoleIds.has(item.roleId.toLowerCase()));
    const counts = items.reduce<Record<string, number>>((result, item) => {
      const status = item.status || "Queued";
      result[status] = (result[status] || 0) + 1;
      return result;
    }, {});

    return NextResponse.json({
      success: true,
      configured: true,
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
