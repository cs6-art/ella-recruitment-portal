import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export async function GET() {
  const cookieStore = await cookies();
  const user = verifySessionToken(cookieStore.get(COOKIE_NAME)?.value);
  if (!user) return NextResponse.json({ success: false, authenticated: false, error: "Authentication required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ success: true, authenticated: true, user }, { headers: { "Cache-Control": "no-store" } });
}
