import crypto from "node:crypto";
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

export const runtime = "nodejs";

function responseError(error: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json() as Record<string, unknown>;
    const parsed = candidateApplicationSubmissionSchema.safeParse({
      ...rawBody,
      candidateName: rawBody.candidateName ?? rawBody.name,
      preferredMobile: rawBody.preferredMobile ?? rawBody.mobile,
      applicationSource: rawBody.applicationSource || "Direct Application",
    });

    if (!parsed.success) {
      return responseError("Name, email, preferred mobile, resume details, and consent are required.", 422);
    }

    if (!parsed.data.consent) {
      return responseError("Name, email, preferred mobile, resume details, and consent are required.", 422);
    }

    if (!isPreferredMobileValid(parsed.data.preferredMobile)) {
      return responseError("Preferred mobile must use an international number such as +639171234567 or +6581234567.", 422, { field: "preferredMobile" });
    }

    const roleId = parsed.data.roleId.trim();
    const role = roleId ? await getRoleRequestById(roleId) : null;
    if (!role || role.status !== "Job Posted" || role.recruitmentSetupStatus !== "Published") {
      return responseError("This role is not accepting applications.", 404);
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
      source: "Public Application Page",
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
      roleId: role.roleId,
      message: "Application submitted successfully.",
    }, { status: 201 });
  } catch (error) {
    console.error("[API Public Applications] POST failed:", error);
    return responseError("Unable to submit the application.", 400);
  }
}
