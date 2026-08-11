import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getCalendarConnection } from "@/lib/calendar-tokens";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export async function GET() {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401, headers: { "Cache-Control": "no-store" } });

  try {
    const connection = await getCalendarConnection(user.email);
    return NextResponse.json({ success: true, connected: Boolean(connection?.refreshToken), connectedAt: connection?.connectedAt || null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[Google Calendar] Status check failed:", error);
    return NextResponse.json({ success: false, error: "Unable to check calendar connection." }, { status: 500 });
  }
}
