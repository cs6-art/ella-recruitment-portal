import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  buildCandidateApplicationPayload,
  candidateApplicationSubmissionSchema,
  findDuplicateCandidateApplication,
  isPreferredMobileValid,
  normalizePreferredMobile,
  sendCandidateApplicationWebhook,
} from "@/lib/applicant-workflow";
import { getRoleRequestById } from "@/lib/google-sheets";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedStatuses = new Set(["Approved", "Recruitment Setup", "Job Posted"]);

function responseError(error: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

export async function POST(request: Request) {
  try {
    const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
    if (!user) return responseError("Authentication required.", 401);
    if (user.canReviewRole !== true) return responseError("Only HR reviewers can add candidates.", 403);

    const rawBody = await request.json() as Record<string, unknown>;
    const parsed = candidateApplicationSubmissionSchema.safeParse({
      ...rawBody,
      candidateName: rawBody.candidateName ?? rawBody.name,
      preferredMobile: rawBody.preferredMobile ?? rawBody.mobile,
      applicationSource: rawBody.applicationSource || "HR Invitation",
    });

    if (!parsed.success) {
      return responseError("Complete the candidate fields before submitting.", 422);
    }

    if (!isPreferredMobileValid(parsed.data.preferredMobile)) {
      return responseError("Preferred mobile must use an international number such as +639171234567 or +6581234567.", 422, { field: "preferredMobile" });
    }

    const roleId = parsed.data.roleId.trim();
    const role = await getRoleRequestById(roleId);
    if (!role || !allowedStatuses.has(role.status)) {
      return responseError("The selected role is not available for manual candidate intake.", 409);
    }

    const duplicate = await findDuplicateCandidateApplication(roleId, parsed.data.email);
    if (duplicate) {
      return responseError("A candidate application already exists for this role.", 409, {
        code: "DUPLICATE_APPLICATION",
        applicationId: duplicate.applicationId,
      });
    }

    const webhookUrl = process.env.N8N_CANDIDATE_APPLICATION_WEBHOOK_URL;
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
    if (!webhookUrl || !webhookSecret) {
      return responseError("The candidate application workflow is not configured.", 503);
    }

    const applicationId = `APP-${crypto.randomUUID()}`;
    const submittedAt = new Date().toISOString();
    const payload = buildCandidateApplicationPayload({
      applicationId,
      roleId,
      source: "HR Manual Intake",
      submittedAt,
      candidate: {
        ...parsed.data,
        preferredMobile: normalizePreferredMobile(parsed.data.preferredMobile),
      },
    });

    const { response, result } = await sendCandidateApplicationWebhook(webhookUrl, webhookSecret, payload);
    if (!response.ok || result.success !== true) {
      return responseError("The application could not be submitted.", response.status === 409 ? 409 : 502);
    }

    return NextResponse.json({
      success: true,
      applicationId,
      roleId,
      message: "Candidate added successfully.",
    }, { status: 201 });
  } catch (error) {
    console.error("[API Applicants] POST failed:", error);
    return responseError("Unable to add the candidate.", 400);
  }
}
