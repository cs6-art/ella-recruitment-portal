import { NextResponse } from "next/server";

import { getApplicantById } from "@/lib/candidate-applications";
import { publicCorsOptionsResponse, withPublicCors } from "@/lib/public-cors";
import { getResumeScreeningInvitationByToken } from "@/lib/resume-screening-invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return publicCorsOptionsResponse(request);
}

// Read-only lookup used by the static apply page to lock the role and
// pre-fill the candidate's details before showing the form. It never
// consumes the invitation — that only happens once an application is
// actually accepted (see /api/public/applications).
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token: routeToken } = await context.params;
  let token: string;
  try {
    token = decodeURIComponent(routeToken || "").trim();
  } catch {
    return withPublicCors(request, NextResponse.json({ success: false, valid: false, reason: "invalid" }, { status: 400 }));
  }

  try {
    const invitation = await getResumeScreeningInvitationByToken(token);
    if (!invitation) {
      return withPublicCors(request, NextResponse.json({ success: true, valid: false, reason: "invalid" }));
    }
    let applicationStatus = "";
    if (!invitation.valid && invitation.reason === "used" && invitation.applicationId) {
      try {
        const applicant = await getApplicantById(invitation.applicationId);
        applicationStatus = applicant?.currentStage || applicant?.finalStatus || "";
      } catch (error) {
        // A successful invitation is still known to be at HR review even if
        // a later status read is temporarily unavailable.
        console.error("[API Public Resume Screening Invite] Could not read application status:", error);
      }
    }
    return withPublicCors(request, NextResponse.json({
      success: true,
      valid: invitation.valid,
      reason: invitation.reason,
      roleId: invitation.roleId,
      roleTitle: invitation.roleTitle,
      candidateName: invitation.candidateName,
      candidateEmail: invitation.candidateEmail,
      applicationId: invitation.applicationId,
      applicationStatus: applicationStatus || (invitation.reason === "used" ? "Pending HR Review" : ""),
      expiresAt: invitation.expiresAt,
    }));
  } catch (error) {
    console.error("[API Public Resume Screening Invite] GET failed:", error);
    return withPublicCors(request, NextResponse.json({ success: false, error: "Unable to check this application link." }, { status: 500 }));
  }
}
