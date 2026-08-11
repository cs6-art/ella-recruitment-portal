import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { filterVisibleRoles } from "@/lib/access-control";
import { getRoleRequests } from "@/lib/google-sheets";
import { calculateDashboardMetrics } from "@/lib/dashboard-metrics";
import { getApplicantMetrics } from "@/lib/candidate-applications";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  if (!user.canCreateRole && !user.canReviewRole && !user.canApproveRole) {
    return NextResponse.json({ success: false, error: "You do not have permission to view dashboard metrics." }, { status: 403 });
  }
  try {
    const roles = filterVisibleRoles(await getRoleRequests(), user);
    const applicantMetrics = user.canReviewRole === true || user.canApproveRole === true
      ? await getApplicantMetrics()
      : undefined;
    return NextResponse.json({ success: true, metrics: { ...calculateDashboardMetrics(roles), applicantMetrics } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[API Dashboard Metrics] GET failed:", error);
    return NextResponse.json({ success: false, error: "Unable to load dashboard metrics." }, { status: 500 });
  }
}
