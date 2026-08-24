import { NextResponse } from "next/server";

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
    return withPublicCors(request, NextResponse.json({
      success: true,
      valid: invitation.valid,
      reason: invitation.reason,
      roleId: invitation.roleId,
      roleTitle: invitation.roleTitle,
      candidateName: invitation.candidateName,
      candidateEmail: invitation.candidateEmail,
      expiresAt: invitation.expiresAt,
    }));
  } catch (error) {
    console.error("[API Public Resume Screening Invite] GET failed:", error);
    return withPublicCors(request, NextResponse.json({ success: false, error: "Unable to check this application link." }, { status: 500 }));
  }
}
