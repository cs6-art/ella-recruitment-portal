import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { canManagePipeline, passesDepartmentWall } from "@/lib/access-control";
import { demoActionBlockReason, getApplicantById } from "@/lib/candidate-applications";
import { requestVoiceBookingLink } from "@/lib/applicant-workflow";
import { consumeRateLimit, rateLimitHeaders, requestClientKey } from "@/lib/rate-limit";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ applicationId: string }> }) {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user || !canManagePipeline(user)) {
    return NextResponse.json({ success: false, error: "Only HR can send voice booking links." }, { status: 403 });
  }
  const rate = consumeRateLimit(`voice-booking-link:${user.email}:${requestClientKey(request)}`, 10, 15 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ success: false, error: "Too many booking-link requests. Try again later." }, { status: 429, headers: rateLimitHeaders(rate) });

  try {
    const applicationId = decodeURIComponent((await params).applicationId);
    const applicant = await getApplicantById(applicationId);
    if (!applicant) return NextResponse.json({ success: false, error: "Applicant not found." }, { status: 404 });
    if (!passesDepartmentWall(user, applicant.department)) {
      return NextResponse.json({ success: false, error: "You do not have permission to manage this applicant." }, { status: 403 });
    }
    const blocked = await demoActionBlockReason(applicationId);
    if (blocked) return NextResponse.json({ success: false, error: blocked }, { status: 503 });

    const result = await requestVoiceBookingLink(applicationId);
    revalidatePath(`/applicants/${encodeURIComponent(applicationId)}`);
    revalidatePath("/applicants");
    revalidatePath("/dashboard");
    return NextResponse.json({ success: true, result, message: result.status });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to send the voice booking link." }, { status: 400 });
  }
}
