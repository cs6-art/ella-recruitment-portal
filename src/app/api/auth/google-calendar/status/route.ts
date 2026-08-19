import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getCalendarConnectionStatus } from "@/lib/google-calendar";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export async function GET() {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401, headers: { "Cache-Control": "no-store" } });

  try {
    const connection = await getCalendarConnectionStatus();
    return NextResponse.json({ success: true, connected: connection.connected, accountEmail: connection.accountEmail, accountMismatch: connection.accountMismatch, connectedAt: connection.connectedAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[Google Calendar] Status check failed:", error);
    return NextResponse.json({ success: false, error: "Unable to check calendar connection." }, { status: 500 });
  }
}
