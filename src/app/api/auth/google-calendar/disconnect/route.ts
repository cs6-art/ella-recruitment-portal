import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { deleteCalendarConnection } from "@/lib/calendar-tokens";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export async function POST() {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

  try {
    await deleteCalendarConnection(user.email);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Google Calendar] Disconnect failed:", error);
    return NextResponse.json({ success: false, error: "Unable to disconnect calendar." }, { status: 500 });
  }
}
