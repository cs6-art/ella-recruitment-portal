import { NextResponse } from "next/server";

import { exchangeCodeAndStore, verifyOAuthState } from "@/lib/google-calendar";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const dashboardUrl = new URL("/dashboard", url);

  if (oauthError) {
    dashboardUrl.searchParams.set("calendar", "denied");
    return NextResponse.redirect(dashboardUrl);
  }

  if (!code || !state) {
    dashboardUrl.searchParams.set("calendar", "error");
    return NextResponse.redirect(dashboardUrl);
  }

  const email = verifyOAuthState(state);
  if (!email) {
    dashboardUrl.searchParams.set("calendar", "error");
    return NextResponse.redirect(dashboardUrl);
  }

  try {
    await exchangeCodeAndStore(code, email);
    dashboardUrl.searchParams.set("calendar", "connected");
  } catch (error) {
    console.error("[Google Calendar] Token exchange failed:", error);
    dashboardUrl.searchParams.set("calendar", "error");
  }

  return NextResponse.redirect(dashboardUrl);
}
