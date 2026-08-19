import { NextResponse, type NextRequest } from "next/server";

import { isDemoMode } from "@/lib/demo-mode";

/**
 * Demo-mode write guard.
 *
 * The live portal drives n8n workflows that email and phone real candidates.
 * While demo mode is on, refuse every mutating API request so a stray click
 * during a client presentation cannot write to Google Sheets or POST to an n8n
 * webhook. Demo data is read-only and in-memory, so blocking writes costs the
 * presentation nothing.
 *
 * Verified safe to scope to `/api`: this app has no server actions and no route
 * handlers outside `src/app/api`, so every mutation path passes through here.
 *
 * Uses the `proxy` file convention; `middleware` is deprecated in this version
 * of Next.js.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Signing in and out must keep working, or the demo cannot be presented.
const ALLOWED_WRITE_PATHS = new Set(["/api/auth/google", "/api/auth/logout"]);

export function proxy(request: NextRequest) {
  if (!isDemoMode()) return NextResponse.next();
  if (SAFE_METHODS.has(request.method)) return NextResponse.next();
  if (ALLOWED_WRITE_PATHS.has(request.nextUrl.pathname)) return NextResponse.next();

  return NextResponse.json(
    {
      success: false,
      error: "Demo mode is on, so saving is disabled. No candidate email, phone call, or workflow can be triggered while this mode is active.",
    },
    { status: 503 },
  );
}

export const config = { matcher: "/api/:path*" };
