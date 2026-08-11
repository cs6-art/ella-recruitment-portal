import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getGoogleConsentUrl } from "@/lib/google-calendar";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export async function GET(request: Request) {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) return NextResponse.redirect(new URL("/", request.url));

  try {
    const url = getGoogleConsentUrl(user.email);
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("[Google Calendar] Failed to build consent URL:", error);
    return NextResponse.json({ success: false, error: "Calendar connection is not configured yet." }, { status: 500 });
  }
}
