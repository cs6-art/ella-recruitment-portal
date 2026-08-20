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
import { candidateBodyForValidation, readCandidateIntakeRequest } from "@/lib/candidate-intake";
import { getRoleRequestById } from "@/lib/google-sheets";
import { evaluationFieldsForSetup } from "@/lib/recruitment-setup-schema";
import { consumeRateLimit, rateLimitHeaders, requestClientKey } from "@/lib/rate-limit";
import { deleteResumeFile, MAX_RESUME_REQUEST_BYTES, storeResumeFile } from "@/lib/resume-files";

export const runtime = "nodejs";

function responseError(error: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

export async function POST(request: Request) {
  let storedResume: Awaited<ReturnType<typeof storeResumeFile>> | null = null;
  try {
    // Demo mode still accepts new applications so the complete intake and
    // screening pipeline can be demonstrated. Applicant-facing side effects
    // remain disabled in the downstream contact workflows.
    const rate = consumeRateLimit(`public-application:${requestClientKey(request)}`, 10, 15 * 60 * 1000);
    if (!rate.allowed) return NextResponse.json({ success: false, error: "Too many applications from this network. Try again later." }, { status: 429, headers: rateLimitHeaders(rate) });
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_RESUME_REQUEST_BYTES) return responseError("Application uploads must be 10 MB or smaller.", 413);

    const intake = await readCandidateIntakeRequest(request);
    const parsed = candidateApplicationSubmissionSchema.safeParse(candidateBodyForValidation(intake.body, intake.resumeFile));

    if (!parsed.success) {
      return responseError("Full name, contact number, role, resume, and consent are required.", 422);
    }

    if (!parsed.data.consent) {
      return responseError("Full name, contact number, role, resume, and consent are required.", 422);
    }

    if (!isPreferredMobileValid(parsed.data.preferredMobile)) {
      return responseError("Contact number must include a valid country code and local number.", 422, { field: "preferredMobile" });
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
    if (intake.resumeFile) storedResume = await storeResumeFile(intake.resumeFile);
    const payload = buildCandidateApplicationPayload({
      applicationId,
      roleId,
      jobTitle: role.jobTitle,
      department: role.department,
      evaluationFields: evaluationFieldsForSetup(role.evaluationFieldToggles, role.customEvaluationFields),
      source: "Public Application Page",
      submittedAt,
      candidate: {
        ...parsed.data,
        resumeText: storedResume?.extractedText || parsed.data.resumeText,
        ...(storedResume ? { resumeFile: storedResume.record } : {}),
        preferredMobile: normalizePreferredMobile(parsed.data.preferredMobile),
      },
    });

    const { response, result } = await sendCandidateApplicationWebhook(webhookUrl, webhookSecret, payload);
    if (!response.ok || result.success !== true) {
      if (storedResume) await deleteResumeFile(storedResume.record).catch(() => undefined);
      return responseError("The application could not be submitted.", response.status === 409 ? 409 : 502);
    }

    return NextResponse.json({
      success: true,
      applicationId,
      roleId: role.roleId,
      message: "Application submitted successfully.",
    }, { status: 201 });
  } catch (error) {
    if (storedResume) await deleteResumeFile(storedResume.record).catch(() => undefined);
    console.error("[API Public Applications] POST failed:", error);
    return responseError(error instanceof Error ? error.message : "Unable to submit the application.", 400);
  }
}
