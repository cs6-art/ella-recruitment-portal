import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { deleteCalendarConnection } from "@/lib/calendar-tokens";
import { consumeRateLimit, rateLimitHeaders, requestClientKey } from "@/lib/rate-limit";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export async function POST(request: Request) {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  const rate = consumeRateLimit(`calendar-disconnect:${user.email}:${requestClientKey(request)}`, 10, 15 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ success: false, error: "Too many calendar disconnect attempts. Try again later." }, { status: 429, headers: rateLimitHeaders(rate) });

  try {
    await deleteCalendarConnection(user.email);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Google Calendar] Disconnect failed:", error);
    return NextResponse.json({ success: false, error: "Unable to disconnect calendar." }, { status: 500 });
  }
}
