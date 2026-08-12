import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { markInterviewNoShow } from "@/lib/applicant-workflow";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export async function POST(_request: Request, { params }: { params: Promise<{ slotId: string }> }) {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user || (user.canReviewRole !== true && user.canApproveRole !== true)) {
    return NextResponse.json({ error: "You are not authorized to update interview status." }, { status: 403 });
  }

  try {
    const result = await markInterviewNoShow(decodeURIComponent((await params).slotId));
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to mark interview as No Show." }, { status: 400 });
  }
}
