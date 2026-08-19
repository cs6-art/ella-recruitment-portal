import { NextResponse, type NextRequest } from "next/server";

import { isDemoMode } from "@/lib/demo-mode";

/**
 * Demo-mode write guard.
 *
 * The portal drives n8n workflows that email and phone real candidates, so
 * while demo mode is on nothing the presenter can click may reach a webhook.
 * Every mutating API request is refused except the narrow set below.
 *
 * The exceptions exist so demo mode can run on the production deployment
 * without pausing live recruitment. They are all paths a presenter cannot
 * reach from the HR screens — real candidates and n8n call them directly:
 *
 *   - /api/public/*  candidates submitting an application or booking an
 *                    interview from a link that was emailed to them.
 *   - /api/resume-screening/bulk/extract  n8n's resume text extraction.
 *   - /api/auth/*    signing in and out, or the demo cannot be presented.
 *
 * Traffic on those paths still writes to Sheets and still triggers n8n. That
 * is ordinary production behaviour, deliberately left running; it is invisible
 * in the demo because demo mode reads a synthetic dataset instead.
 *
 * Everything an HR user can click -- approve, reject, publish, delete, edit
 * settings, upload resumes, save availability -- stays blocked.
 *
 * Verified safe to scope to `/api`: this app has no server actions and no route
 * handlers outside `src/app/api`, so every mutation path passes through here.
 *
 * Uses the `proxy` file convention; `middleware` is deprecated in this version
 * of Next.js.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const ALLOWED_WRITE_PATHS = new Set([
  "/api/auth/google",
  "/api/auth/logout",
  "/api/resume-screening/bulk/extract",
]);

// Prefix match: candidate booking routes are dynamic (/api/public/bookings/:kind/:token).
const ALLOWED_WRITE_PREFIXES = ["/api/public/"];

export function proxy(request: NextRequest) {
  if (!isDemoMode()) return NextResponse.next();
  if (SAFE_METHODS.has(request.method)) return NextResponse.next();

  const path = request.nextUrl.pathname;
  if (ALLOWED_WRITE_PATHS.has(path)) return NextResponse.next();
  if (ALLOWED_WRITE_PREFIXES.some((prefix) => path.startsWith(prefix))) return NextResponse.next();

  return NextResponse.json(
    {
      success: false,
      error: "Demo mode is on, so saving is disabled. No candidate email, phone call, or workflow can be triggered while this mode is active.",
    },
    { status: 503 },
  );
}

export const config = { matcher: "/api/:path*" };
