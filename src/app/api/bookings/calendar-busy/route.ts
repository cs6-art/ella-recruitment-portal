import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { canManageInterviewAvailability } from "@/lib/access-control";
import { getCalendarBusyWindows } from "@/lib/google-calendar";
import { getRoleRequests } from "@/lib/google-sheets";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  if (user.canReviewRole !== true && user.canApproveRole !== true) {
    return NextResponse.json({ success: false, error: "You are not authorized to view calendar conflicts." }, { status: 403 });
  }

  try {
    const roles = await getRoleRequests();
    const start = new Date();
    const end = new Date(start.getTime() + 180 * 24 * 60 * 60 * 1000);
    const entries = await Promise.all(roles
      .filter((role) => canManageInterviewAvailability(role.status) && role.hodEmail)
      .map(async (role) => {
        const result = await getCalendarBusyWindows({ hodEmail: role.hodEmail, start, end });
        return [role.roleId, result.checked ? result.busy : []] as const;
      }));

    return NextResponse.json({ success: true, busyWindows: Object.fromEntries(entries) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.warn("[Bookings Calendar] Conflict lookup failed:", error);
    return NextResponse.json({ success: false, error: "Unable to load calendar conflicts." }, { status: 500 });
  }
}
