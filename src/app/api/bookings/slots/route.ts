import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createInterviewSlot } from "@/lib/applicant-workflow";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export async function POST(request: Request) {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user || (user.canReviewRole !== true && user.canApproveRole !== true)) return NextResponse.json({ error: "You are not authorized to manage interview availability." }, { status: 403 });
  try {
    const body = await request.json();
    const slot = await createInterviewSlot({ interviewType: body.interviewType, roleId: body.roleId, date: body.date, startTime: body.startTime, endTime: body.endTime, timezone: body.timezone });
    return NextResponse.json({ success: true, slot }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create interview availability." }, { status: 400 });
  }
}
