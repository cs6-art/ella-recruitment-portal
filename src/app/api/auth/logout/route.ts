import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/session";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", expires: new Date(0), path: "/" });
  return response;
}
