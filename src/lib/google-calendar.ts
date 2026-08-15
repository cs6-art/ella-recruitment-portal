import crypto from "node:crypto";
import { google } from "googleapis";

import { getCalendarConnection, saveCalendarConnection } from "@/lib/calendar-tokens";
import { scheduledInstant } from "@/lib/interview-time";

const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

// Reuses the same OAuth 2.0 Web application client already registered for
// "Sign in with Google" (NEXT_PUBLIC_GOOGLE_CLIENT_ID / GOOGLE_CLIENT_ID).
// That flow only ever requests an ID token, so it never needed a client
// secret; the calendar flow uses the authorization-code grant instead
// (offline access, so we can refresh without the HOD present), which does.
// Add GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REDIRECT_URI to enable it.
function oauthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not configured.");
  if (!clientSecret) throw new Error("GOOGLE_OAUTH_CLIENT_SECRET is not configured.");
  if (!redirectUri) throw new Error("GOOGLE_OAUTH_REDIRECT_URI is not configured.");
  return { clientId, clientSecret, redirectUri };
}

function newOAuthClient() {
  const { clientId, clientSecret, redirectUri } = oauthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/** Signed, expiring state param — protects the OAuth redirect against CSRF
 * and carries the session email through the round trip to Google. */
export function createOAuthState(email: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  const payload = JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + 600 });
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyOAuthState(state: string): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { email: string; exp: number };
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload.email;
  } catch {
    return null;
  }
}

export function getGoogleConsentUrl(email: string): string {
  const client = newOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // forces a refresh_token on every connect, not just the first
    scope: CALENDAR_SCOPES,
    state: createOAuthState(email),
    login_hint: email,
  });
}

export async function exchangeCodeAndStore(code: string, email: string): Promise<void> {
  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);
  await saveCalendarConnection({
    email,
    accessToken: tokens.access_token || "",
    refreshToken: tokens.refresh_token || undefined,
    tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : "",
    scope: tokens.scope || CALENDAR_SCOPES.join(" "),
  });
}

/** Returns a ready-to-use OAuth2 client for this HOD, refreshing (and
 * persisting) the access token first if it's expired or close to it. */
async function getAuthorizedClient(email: string) {
  const connection = await getCalendarConnection(email);
  if (!connection || !connection.refreshToken) return null;

  const client = newOAuthClient();
  const expiresAt = connection.tokenExpiresAt ? Date.parse(connection.tokenExpiresAt) : 0;
  const needsRefresh = !connection.accessToken || !expiresAt || expiresAt < Date.now() + 60_000;

  if (needsRefresh) {
    client.setCredentials({ refresh_token: connection.refreshToken });
    const { credentials } = await client.refreshAccessToken();
    await saveCalendarConnection({
      email,
      accessToken: credentials.access_token || "",
      tokenExpiresAt: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : "",
      scope: credentials.scope || CALENDAR_SCOPES.join(" "),
    });
    client.setCredentials(credentials);
  } else {
    client.setCredentials({ access_token: connection.accessToken, refresh_token: connection.refreshToken });
  }

  return client;
}

export type CalendarEventInput = {
  hodEmail: string;
  summary: string;
  description: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm:ss
  endTime: string; // HH:mm:ss
  timezone: string;
  attendeeEmails: string[];
};

export type CalendarEventResult =
  | { created: true; eventId: string; htmlLink: string }
  | { created: false; reason: "not_connected" | "error"; error?: string };

export type CalendarAvailabilityResult =
  | { available: true; checked: true }
  | { available: false; checked: true; reason: "conflict"; busyUntil?: string }
  | { available: false; checked: false; reason: "not_connected" | "error"; error?: string };

/**
 * Creates the final-interview event on the HOD's own connected Google
 * Calendar. Deliberately non-throwing: a HOD who hasn't connected their
 * calendar yet (or a transient API error) must never block the candidate's
 * booking — the caller logs the outcome and moves on.
 */
export async function createFinalInterviewEvent(input: CalendarEventInput): Promise<CalendarEventResult> {
  try {
    const client = await getAuthorizedClient(input.hodEmail);
    if (!client) return { created: false, reason: "not_connected" };

    const calendar = google.calendar({ version: "v3", auth: client });
    const start = scheduledInstant(input.date, input.startTime, input.timezone);
    const end = scheduledInstant(input.date, input.endTime, input.timezone);
    const response = await calendar.events.insert({
      calendarId: "primary",
      sendUpdates: "all",
      requestBody: {
        summary: input.summary,
        description: input.description,
        start: { dateTime: start.toISOString(), timeZone: input.timezone },
        end: { dateTime: end.toISOString(), timeZone: input.timezone },
        attendees: input.attendeeEmails.map((email) => ({ email })),
      },
    });

    return { created: true, eventId: response.data.id || "", htmlLink: response.data.htmlLink || "" };
  } catch (error) {
    return { created: false, reason: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

export async function checkCalendarAvailability(input: Pick<CalendarEventInput, "hodEmail" | "date" | "startTime" | "endTime" | "timezone">): Promise<CalendarAvailabilityResult> {
  try {
    const client = await getAuthorizedClient(input.hodEmail);
    if (!client) return { available: false, checked: false, reason: "not_connected" };

    const start = scheduledInstant(input.date, input.startTime, input.timezone);
    const end = scheduledInstant(input.date, input.endTime, input.timezone);
    const calendar = google.calendar({ version: "v3", auth: client });
    try {
      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
          items: [{ id: "primary" }],
        },
      });
      const busy = response.data.calendars?.primary?.busy || [];
      const conflict = busy.find((window) => window.start && window.end);
      if (conflict) return { available: false, checked: true, reason: "conflict", busyUntil: conflict.end || undefined };
      return { available: true, checked: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/insufficient authentication scopes|insufficient permission/i.test(message)) {
        return { available: false, checked: false, reason: "error", error: message };
      }

      // Older connections may have calendar.events but not calendar.freebusy.
      // Read event windows as a compatible fallback until the HOD reconnects.
      const events = await calendar.events.list({
        calendarId: "primary",
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        showDeleted: false,
        maxResults: 2500,
      });
      const conflict = (events.data.items || []).find((event) => {
        const eventStart = event.start?.dateTime || event.start?.date;
        const eventEnd = event.end?.dateTime || event.end?.date;
        if (!eventStart || !eventEnd) return false;
        return Date.parse(eventStart) < end.getTime() && Date.parse(eventEnd) > start.getTime();
      });
      if (conflict) return { available: false, checked: true, reason: "conflict", busyUntil: conflict.end?.dateTime || conflict.end?.date || undefined };
      return { available: true, checked: true };
    }
  } catch (error) {
    return { available: false, checked: false, reason: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

export type CalendarBusyWindow = { start: string; end: string };
export type CalendarBusyWindowsResult =
  | { checked: true; busy: CalendarBusyWindow[] }
  | { checked: false; busy: CalendarBusyWindow[]; reason: "not_connected" | "error"; error?: string };

/**
 * Reads one bounded free/busy range so recurring candidate slots do not cause
 * one Google request per generated time. A failed lookup is non-blocking here;
 * the reservation endpoint performs the authoritative final check.
 */
export async function getCalendarBusyWindows(input: { hodEmail: string; start: Date; end: Date }): Promise<CalendarBusyWindowsResult> {
  try {
    const client = await getAuthorizedClient(input.hodEmail);
    if (!client) return { checked: false, busy: [], reason: "not_connected" };
    const calendar = google.calendar({ version: "v3", auth: client });
    try {
      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin: input.start.toISOString(),
          timeMax: input.end.toISOString(),
          items: [{ id: "primary" }],
        },
      });
      const busy = (response.data.calendars?.primary?.busy || [])
        .filter((window): window is { start: string; end: string } => Boolean(window.start && window.end))
        .map((window) => ({ start: window.start, end: window.end }));
      return { checked: true, busy };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/insufficient authentication scopes|insufficient permission/i.test(message)) {
        return { checked: false, busy: [], reason: "error", error: message };
      }
      const events = await calendar.events.list({
        calendarId: "primary",
        timeMin: input.start.toISOString(),
        timeMax: input.end.toISOString(),
        singleEvents: true,
        showDeleted: false,
        maxResults: 2500,
      });
      const busy = (events.data.items || []).map((event) => ({ start: event.start?.dateTime || event.start?.date, end: event.end?.dateTime || event.end?.date }))
        .filter((window): window is { start: string; end: string } => Boolean(window.start && window.end))
        .map((window) => ({ start: window.start, end: window.end }));
      return { checked: true, busy };
    }
  } catch (error) {
    return { checked: false, busy: [], reason: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteFinalInterviewEvent(hodEmail: string, eventId: string): Promise<{ deleted: true } | { deleted: false; reason: "not_connected" | "error"; error?: string }> {
  if (!eventId) return { deleted: true };
  try {
    const client = await getAuthorizedClient(hodEmail);
    if (!client) return { deleted: false, reason: "not_connected" };
    const calendar = google.calendar({ version: "v3", auth: client });
    await calendar.events.delete({ calendarId: "primary", eventId, sendUpdates: "all" });
    return { deleted: true };
  } catch (error) {
    return { deleted: false, reason: "error", error: error instanceof Error ? error.message : String(error) };
  }
}
