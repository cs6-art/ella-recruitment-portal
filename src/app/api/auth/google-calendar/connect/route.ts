import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getGoogleConsentUrl } from "@/lib/google-calendar";
import { consumeRateLimit, rateLimitHeaders, requestClientKey } from "@/lib/rate-limit";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export async function GET(request: Request) {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) return NextResponse.redirect(new URL("/", request.url));
  const rate = consumeRateLimit(`calendar-connect:${user.email}:${requestClientKey(request)}`, 10, 15 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ success: false, error: "Too many calendar connection attempts. Try again later." }, { status: 429, headers: rateLimitHeaders(rate) });

  try {
    // Use the host that initiated OAuth so custom-domain deployments do not
    // accidentally exchange the authorization code against localhost.
    const url = getGoogleConsentUrl(user.email, new URL(request.url).origin);
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("[Google Calendar] Failed to build consent URL:", error);
    return NextResponse.json({ success: false, error: "Calendar connection is not configured yet." }, { status: 500 });
  }
}
