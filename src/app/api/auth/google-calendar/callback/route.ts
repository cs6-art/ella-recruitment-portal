import { NextResponse } from "next/server";

import { exchangeCodeAndStore, verifyOAuthState } from "@/lib/google-calendar";

function calendarErrorReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Keep provider and storage diagnostics useful to HR without exposing raw
  // OAuth responses, tokens, spreadsheet IDs, or other server details.
  if (/redirect_uri_mismatch/i.test(message)) return "The Google OAuth callback URL is not authorized for this portal domain.";
  if (/invalid_grant|authorization.*expired|code.*expired/i.test(message)) return "The Google authorization expired. Please connect again.";
  if (/access_denied|unauthorized_client|forbidden/i.test(message)) return "Google did not grant this account access to the calendar integration.";
  if (/spreadsheet|sheet|permission|storage/i.test(message)) return "The portal could not save the calendar connection. Check Sheets access and try again.";
  return "Google Calendar authorization failed. Please choose the correct account and try again.";
}

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
    dashboardUrl.searchParams.set("calendar_reason", "The Google authorization response was incomplete. Please try again.");
    return NextResponse.redirect(dashboardUrl);
  }

  const email = verifyOAuthState(state);
  if (!email) {
    dashboardUrl.searchParams.set("calendar", "error");
    dashboardUrl.searchParams.set("calendar_reason", "The Google authorization session expired. Please try again.");
    return NextResponse.redirect(dashboardUrl);
  }

  try {
    await exchangeCodeAndStore(code, email, url.origin);
    dashboardUrl.searchParams.set("calendar", "connected");
  } catch (error) {
    console.error("[Google Calendar] Token exchange failed:", error);
    dashboardUrl.searchParams.set("calendar", "error");
    dashboardUrl.searchParams.set("calendar_reason", calendarErrorReason(error));
  }

  return NextResponse.redirect(dashboardUrl);
}
