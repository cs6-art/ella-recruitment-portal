import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createInterviewSlot } from "@/lib/applicant-workflow";
import { consumeRateLimit, rateLimitHeaders, requestClientKey } from "@/lib/rate-limit";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export async function POST(request: Request) {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user || (user.canReviewRole !== true && user.canApproveRole !== true)) return NextResponse.json({ error: "You are not authorized to manage interview availability." }, { status: 403 });
  const rate = consumeRateLimit(`slot-create:${user.email}:${requestClientKey(request)}`, 30, 15 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ error: "Too many availability updates. Try again later." }, { status: 429, headers: rateLimitHeaders(rate) });
  try {
    const body = await request.json();
    const slot = await createInterviewSlot({ interviewType: body.interviewType, roleId: body.roleId, date: body.date, startTime: body.startTime, endTime: body.endTime, timezone: body.timezone });
    return NextResponse.json({ success: true, slot }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create interview availability." }, { status: 400 });
  }
}
