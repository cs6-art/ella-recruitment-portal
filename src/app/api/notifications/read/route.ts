import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { filterVisibleApplicants } from "@/lib/access-control";
import { getNotificationSourceRows } from "@/lib/candidate-applications";
import { getNotificationReadState, saveNotificationReadState } from "@/lib/google-sheets";
import {
  applyReadState,
  deriveNotifications,
  withAllNotificationsRead,
  withNotificationRead,
} from "@/lib/notifications";
import { consumeRateLimit, rateLimitHeaders, requestClientKey } from "@/lib/rate-limit";
import { COOKIE_NAME, verifySessionToken, type SessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canSeeNotifications(user: SessionUser): boolean {
  return user.canReviewRole === true || user.canApproveRole === true || user.canReviewDepartmentRole === true;
}

export async function POST(request: Request) {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  if (!canSeeNotifications(user)) {
    return NextResponse.json({ success: false, error: "You do not have access to notifications." }, { status: 403 });
  }

  const rate = consumeRateLimit(`notif-read:${user.email}:${requestClientKey(request)}`, 60, 5 * 60 * 1000);
  if (!rate.allowed) {
    return NextResponse.json({ success: false, error: "Too many updates. Try again shortly." }, { status: 429, headers: rateLimitHeaders(rate) });
  }

  const body = await request.json().catch(() => ({}));
  const markAll = body?.all === true;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!markAll && !id) {
    return NextResponse.json({ success: false, error: "Provide a notification id or set all=true." }, { status: 422 });
  }

  try {
    const current = await getNotificationReadState(user.email);
    const next = markAll ? withAllNotificationsRead() : withNotificationRead(current, id);
    await saveNotificationReadState(user.email, next);

    const rows = filterVisibleApplicants(await getNotificationSourceRows(), user);
    const { unreadCount } = applyReadState(deriveNotifications(rows), next);
    return NextResponse.json({ success: true, unreadCount }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[API Notifications] mark-read failed:", error);
    return NextResponse.json({ success: false, error: "Unable to update notifications." }, { status: 500 });
  }
}
