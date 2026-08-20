import { NextResponse } from "next/server";

import { getBookingContext, reserveBooking, type BookingKind } from "@/lib/applicant-workflow";
import { consumeRateLimit, rateLimitHeaders, requestClientKey } from "@/lib/rate-limit";
import { isDemoMode } from "@/lib/demo-mode";

function validKind(value: string): value is BookingKind { return value === "voice" || value === "final"; }

export async function GET(request: Request, { params }: { params: Promise<{ kind: string; token: string }> }) {
  if (isDemoMode()) return NextResponse.json({ error: "Demo mode is read-only: applicant booking links are disabled." }, { status: 503 });
  const rate = consumeRateLimit(`public-booking-read:${requestClientKey(request)}`, 60, 15 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ error: "Too many booking requests. Try again later." }, { status: 429, headers: rateLimitHeaders(rate) });
  const { kind, token } = await params;
  if (!validKind(kind)) return NextResponse.json({ error: "Booking type not found." }, { status: 404 });
  const context = await getBookingContext(kind, token);
  if (!context) return NextResponse.json({ error: "This booking link is invalid or expired." }, { status: 404 });
  return NextResponse.json({ success: true, context });
}

export async function POST(request: Request, { params }: { params: Promise<{ kind: string; token: string }> }) {
  if (isDemoMode()) return NextResponse.json({ error: "Demo mode is read-only: applicant emails, calls, bookings, and calendar changes are disabled." }, { status: 503 });
  const rate = consumeRateLimit(`public-booking-write:${requestClientKey(request)}`, 20, 15 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ error: "Too many booking attempts. Try again later." }, { status: 429, headers: rateLimitHeaders(rate) });
  const { kind, token } = await params;
  if (!validKind(kind)) return NextResponse.json({ error: "Booking type not found." }, { status: 404 });
  try {
    const body = await request.json() as { slotId?: string; preferredMobile?: string };
    const booking = await reserveBooking(kind, token, String(body.slotId || ""), String(body.preferredMobile || ""));
    return NextResponse.json({ success: true, booking });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to reserve this interview slot." }, { status: 400 });
  }
}
