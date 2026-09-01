import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { filterVisibleApplicants } from "@/lib/access-control";
import { getNotificationSourceRows } from "@/lib/candidate-applications";
import { getNotificationReadState } from "@/lib/google-sheets";
import { applyReadState, deriveNotifications } from "@/lib/notifications";
import { COOKIE_NAME, verifySessionToken, type SessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same audience as the Applicants page: operational HR, decision-making
// Management, and department reviewers. Everyone else gets an empty feed
// rather than a 403 so the bell can simply render nothing.
function canSeeNotifications(user: SessionUser): boolean {
  return user.canReviewRole === true || user.canApproveRole === true || user.canReviewDepartmentRole === true;
}

export async function GET() {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  if (!canSeeNotifications(user)) {
    return NextResponse.json({ success: true, notifications: [], unreadCount: 0 }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const [rows, readState] = await Promise.all([
      getNotificationSourceRows(),
      getNotificationReadState(user.email),
    ]);
    // filterVisibleApplicants enforces the confidential-department wall and
    // HOD department scoping — the exact filter the Applicants list uses.
    const visibleRows = filterVisibleApplicants(rows, user);
    const derived = deriveNotifications(visibleRows);
    const { notifications, unreadCount } = applyReadState(derived, readState);
    return NextResponse.json(
      { success: true, notifications, unreadCount, generatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[API Notifications] GET failed:", error);
    return NextResponse.json({ success: false, error: "Unable to load notifications." }, { status: 500 });
  }
}
