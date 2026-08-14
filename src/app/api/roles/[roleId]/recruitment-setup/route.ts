import { cookies } from "next/headers";
import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { canEditRecruitmentSetup, canUseRecruitmentSetup, canViewRole } from "@/lib/access-control";
import { getRoleRequestById, updateRoleRequestFields } from "@/lib/google-sheets";
import { invalidateSheetsCache } from "@/lib/sheets-cache";
import { consumeRateLimit, rateLimitHeaders, requestClientKey } from "@/lib/rate-limit";
import { BASELINE_EVALUATION_FIELDS, EVALUATION_FIELD_CATALOG, recruitmentSetupSchema } from "@/lib/recruitment-setup-schema";
import { getSetupReadiness, setupStatusForAction } from "@/lib/recruitment-setup-readiness";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { createConfiguredVoiceInterviewSlots } from "@/lib/applicant-workflow";
import { serializeVoiceInterviewSlots } from "@/lib/voice-interview-availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ roleId: string }> };

export async function POST(request: Request, context: Context) {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  if (!canEditRecruitmentSetup(user)) return NextResponse.json({ success: false, error: "Only HR reviewers can edit recruitment setup." }, { status: 403 });

  const rate = consumeRateLimit(`recruitment-setup:${user.email}:${requestClientKey(request)}`, 30, 15 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ success: false, error: "Too many setup updates. Try again later." }, { status: 429, headers: rateLimitHeaders(rate) });

  const { roleId: encodedRoleId } = await context.params;
  const roleId = decodeURIComponent(encodedRoleId);
  const role = await getRoleRequestById(roleId);
  if (!role || !canViewRole(user, role)) return NextResponse.json({ success: false, error: "Role request not found." }, { status: 404 });

  try {
    const setup = recruitmentSetupSchema.parse(await request.json());
    const setupAction = setup.setupAction || "save_draft";

    // A publish that already landed — a double click, a retried request, or a
    // second click after a slow first response — leaves the role at "Job
    // Posted". Falling through to the status guard below would answer with
    // "Recruitment setup is only available for Approved or Recruitment Setup
    // roles", which reads as a failure even though the publish succeeded.
    // Report the settled state instead of re-running the workflow.
    if (setupAction === "publish_role" && role.status === "Job Posted") {
      return NextResponse.json({
        success: true,
        roleId: role.roleId,
        status: role.status,
        action: "recruitment_setup_updated",
        recruitmentSetupStatus: role.recruitmentSetupStatus || "Published",
        alreadyPublished: true,
        updatedAt: role.recruitmentSetupUpdatedAt || "",
        notificationStatus: "not_configured",
        notificationError: "",
        message: "This role is already published.",
      });
    }

    if (!canUseRecruitmentSetup(role.status)) return NextResponse.json({ success: false, error: "Recruitment setup is only available for Approved or Recruitment Setup roles." }, { status: 409 });
    const readinessLevel = setupAction === "mark_recruitment_ready" ? "recruitment-ready" : setupAction === "mark_ready_for_publishing" || setupAction === "publish_role" ? "ready-for-publishing" : "draft";
    const readiness = getSetupReadiness(setup, readinessLevel);
    if (!readiness.valid) return NextResponse.json({ success: false, code: "RECRUITMENT_SETUP_INCOMPLETE", message: setupAction === "save_draft" ? "Complete the three required draft fields before saving." : "The recruitment setup is not ready for this stage.", missingFields: readiness.missingFields.map((field) => field.key), missingFieldLabels: readiness.missingFields.map((field) => field.label) }, { status: 422 });
    // The staged buttons stay available for HR who want an explicit audit
    // trail, but a setup that already satisfies every ready-for-publishing
    // requirement should not be refused just because the intermediate button
    // was never clicked. Gating on the stored stage left Publish permanently
    // disabled while the checklist read "All required items complete", and
    // publishing then wrote Recruitment_Setup_Status straight to "Published"
    // anyway. The readiness check above is the real gate; this remains as a
    // defensive one.
    if (setupAction === "publish_role" && !readiness.valid) return NextResponse.json({ success: false, code: "RECRUITMENT_SETUP_NOT_READY", message: "Mark the setup as Ready for Publishing before publishing the role." }, { status: 409 });
    const webhookUrl = process.env.N8N_RECRUITMENT_SETUP_WEBHOOK_URL || process.env.N8N_ROLE_REQUEST_WEBHOOK_URL || process.env.N8N_ROLE_WEBHOOK_URL;
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
    if (!webhookUrl || !webhookSecret) return NextResponse.json({ success: false, error: "The recruitment setup workflow is not configured." }, { status: 503 });

    const updatedAt = new Date().toISOString();
    const actionRequestId = setup.actionRequestId || crypto.randomUUID();
    const performerEmail = user.email.trim().toLowerCase();
    const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
    const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
      const appBaseUrl = configuredAppUrl || (forwardedHost ? `${request.headers.get("x-forwarded-proto") || "https"}://${forwardedHost}` : "");
    const applicationLink = appBaseUrl ? `${appBaseUrl}/apply/${encodeURIComponent(role.roleId)}` : `/apply/${encodeURIComponent(role.roleId)}`;
    const nextRecruitmentSetupStatus = setupStatusForAction(setupAction, role.recruitmentSetupStatus || "Draft");
    const initialInterviewQuestions = [
      setup.requiredInterviewQuestion1,
      setup.requiredInterviewQuestion2,
      setup.requiredInterviewQuestion3,
      setup.requiredInterviewQuestion4,
      setup.requiredInterviewQuestion5,
    ].filter((question) => question.trim());
    const canonicalSetup = {
      ...setup,
      // Keep the nested and legacy top-level status fields in sync. The
      // deployed n8n mapper may read either shape during the migration from
      // the original role-request payload.
      recruitmentSetupStatus: nextRecruitmentSetupStatus,
      // The active n8n workflow still consumes its historical aggregate field;
      // keep it as a compatibility projection of the five canonical questions.
      initialInterviewQuestions,
      // Keep role context available to the workflow, but let HR's structured
      // setup values override the initial role-request defaults.
      jobDescription: role.jobDescription || setup.jobDescription,
      initialInterviewBookingLink: role.initialInterviewBookingLink || setup.initialInterviewBookingLink,
      hodInterviewBookingLink: role.hodInterviewBookingLink || setup.hodInterviewBookingLink,
    };
    const payload = {
      eventType: "recruitment_setup_updated",
      roleId: role.roleId,
      Role_ID: role.roleId,
      actionRequestId,
      expectedCurrentStatus: role.status,
      setupAction,
      recruitmentSetupStatus: nextRecruitmentSetupStatus,
      targetRoleStatus: setupAction === "publish_role" ? "Job Posted" : role.status === "Approved" ? "Recruitment Setup" : role.status,
      Status: setupAction === "publish_role" ? "Job Posted" : role.status === "Approved" ? "Recruitment Setup" : role.status,
      recruitmentSetup: canonicalSetup,
      Job_Description: role.jobDescription,
      Screening_Criteria: setup.screeningCriteria,
      Initial_Interview_Questions: initialInterviewQuestions.join("\n"),
      Required_Interview_Question_1: setup.requiredInterviewQuestion1,
      Required_Interview_Question_2: setup.requiredInterviewQuestion2,
      Required_Interview_Question_3: setup.requiredInterviewQuestion3,
      Required_Interview_Question_4: setup.requiredInterviewQuestion4,
      Required_Interview_Question_5: setup.requiredInterviewQuestion5,
      AI_System_Prompt: setup.aiSystemPrompt,
      VAPI_Resolved_System_Prompt: setup.resolvedAiSystemPrompt || "",
      Evaluation_Fields: JSON.stringify([
        ...BASELINE_EVALUATION_FIELDS,
        ...setup.evaluationFieldToggles.map((key) => EVALUATION_FIELD_CATALOG.find((field) => field.key === key)).filter(Boolean),
        ...setup.customEvaluationFields,
      ]),
      Initial_Interview_Booking_Link: role.initialInterviewBookingLink || setup.initialInterviewBookingLink,
      HOD_Interview_Booking_Link: role.hodInterviewBookingLink || setup.hodInterviewBookingLink,
      Posting_Channels: setup.postingChannels.join(", "),
      Application_Link: applicationLink,
      Posting_Confirmed: setupAction === "publish_role" ? "TRUE" : "FALSE",
      License_or_Certificate_Required: setup.licenseOrCertificateRequired,
      Keywords_to_Look_For: setup.keywordsToLookFor,
      Minimum_Years_of_Experience: setup.minimumYearsOfExperience || "",
      Transferable_Skills_Accepted: setup.transferableSkillsAccepted,
      Salary_or_Budget_Range: setup.salaryOrBudgetRange,
      Earliest_Availability_Rule: setup.earliestAvailabilityRule,
      Experience_Required: role.experienceRequired,
      Salary_Minimum: role.salaryMin,
      Salary_Maximum: role.salaryMax,
      Work_Schedule: role.workSchedule,
      Notice_Period_Requirement: role.noticePeriodRequirement,
      HOD_Availability_Dates: role.hodAvailabilityDates,
      HOD_Availability_Times: role.hodAvailabilityTimes,
      HOD_Availability_Slots: role.hodAvailabilitySlots,
      Voice_Interview_Availability_Mode: setup.voiceInterviewAvailabilityMode,
      Voice_Interview_Slots: serializeVoiceInterviewSlots(setup.voiceInterviewSlots),
      Voice_Interview_Auto_Start_Date: setup.voiceInterviewAutoStartDate,
      Voice_Interview_Auto_End_Date: setup.voiceInterviewAutoEndDate,
      Voice_Interview_Timezone: setup.voiceInterviewTimezone,
      Voice_Interview_Slots_Generated_At: setup.voiceInterviewSlotsGeneratedAt,
      HOD_Email: role.hodEmail,
      Recruitment_Setup_Status: setupStatusForAction(setupAction, role.recruitmentSetupStatus || "Draft"),
      Salary_Disclosure_Status: setup.salaryDisclosureStatus,
      Experience_Requirement_Status: setup.experienceRequirementStatus,
      License_Requirement_Status: setup.licenseRequirementStatus,
      HOD_Interview_Required: setup.hodInterviewRequired,
      Recruitment_Ready_At: setupAction === "mark_recruitment_ready" ? updatedAt : "",
      Recruitment_Ready_By: setupAction === "mark_recruitment_ready" ? user.name : "",
      Ready_For_Publishing_At: setupAction === "mark_ready_for_publishing" ? updatedAt : "",
      Ready_For_Publishing_By: setupAction === "mark_ready_for_publishing" ? user.name : "",
      Posted_At: setupAction === "publish_role" ? updatedAt : "",
      Posted_By: setupAction === "publish_role" ? user.name : "",
      Recruitment_Setup_Updated_At: updatedAt,
      Recruitment_Setup_Updated_By_Name: user.name,
      Recruitment_Setup_Updated_By_Email: performerEmail,
      performedByName: user.name,
      performedByEmail: performerEmail,
      performedByAccessRole: user.accessRole,
      performedByDepartment: user.department,
      comments: setup.comments,
      timestamp: updatedAt,
      History_ID: actionRequestId,
      Changed_At: updatedAt,
      Changed_By_Name: user.name,
      Changed_By_Email: performerEmail,
      Previous_Status: role.status,
      New_Status: setupAction === "publish_role" ? "Job Posted" : role.status === "Approved" ? "Recruitment Setup" : role.status,
      Comments: setup.comments,
      Action_Source: "Role Details Website",
      Action_Request_ID: actionRequestId,
      Action: setupAction === "save_draft" ? "recruitment_setup_draft_saved" : setupAction === "mark_recruitment_ready" ? "recruitment_setup_marked_ready" : setupAction === "mark_ready_for_publishing" ? "recruitment_setup_ready_for_publishing" : "role_job_posted",
      Access_Role: user.accessRole,
      Department: user.department,
      portalUrl: appBaseUrl ? `${appBaseUrl}/roles/${encodeURIComponent(role.roleId)}` : "",
    };
    // Persist the HR-entered setup content directly, not just the voice
    // fields. Previously everything else reached Role_Requests only through
    // the n8n mapper, so a saved draft that the mapper did not carry was gone
    // on the next page load — the editor reloaded from the sheet and showed
    // blank fields. These are the same values sent in the payload below, and
    // n8n writes them again immediately after, so the two stay consistent.
    // Role status transitions remain owned by the workflow.
    await updateRoleRequestFields(role.roleId, {
      Voice_Interview_Availability_Mode: setup.voiceInterviewAvailabilityMode,
      Voice_Interview_Slots: serializeVoiceInterviewSlots(setup.voiceInterviewSlots),
      Voice_Interview_Auto_Start_Date: setup.voiceInterviewAutoStartDate,
      Voice_Interview_Auto_End_Date: setup.voiceInterviewAutoEndDate,
      Voice_Interview_Timezone: setup.voiceInterviewTimezone,
      Screening_Criteria: setup.screeningCriteria,
      Initial_Interview_Questions: initialInterviewQuestions.join("\n"),
      Required_Interview_Question_1: setup.requiredInterviewQuestion1,
      Required_Interview_Question_2: setup.requiredInterviewQuestion2,
      Required_Interview_Question_3: setup.requiredInterviewQuestion3,
      Required_Interview_Question_4: setup.requiredInterviewQuestion4,
      Required_Interview_Question_5: setup.requiredInterviewQuestion5,
      AI_System_Prompt: setup.aiSystemPrompt,
      Evaluation_Fields: JSON.stringify([
        ...BASELINE_EVALUATION_FIELDS,
        ...setup.evaluationFieldToggles.map((key) => EVALUATION_FIELD_CATALOG.find((field) => field.key === key)).filter(Boolean),
        ...setup.customEvaluationFields,
      ]),
      Posting_Channels: setup.postingChannels.join(", "),
      License_or_Certificate_Required: setup.licenseOrCertificateRequired,
      Keywords_to_Look_For: setup.keywordsToLookFor,
      Minimum_Years_of_Experience: setup.minimumYearsOfExperience || "",
      Transferable_Skills_Accepted: setup.transferableSkillsAccepted,
      Salary_or_Budget_Range: setup.salaryOrBudgetRange,
      Earliest_Availability_Rule: setup.earliestAvailabilityRule,
      Recruitment_Setup_Status: nextRecruitmentSetupStatus,
      Salary_Disclosure_Status: setup.salaryDisclosureStatus,
      Experience_Requirement_Status: setup.experienceRequirementStatus,
      License_Requirement_Status: setup.licenseRequirementStatus,
      HOD_Interview_Required: setup.hodInterviewRequired,
      Recruitment_Setup_Updated_At: updatedAt,
      Recruitment_Setup_Updated_By_Name: user.name,
      Recruitment_Setup_Updated_By_Email: performerEmail,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Webhook-Secret": webhookSecret, "X-Idempotency-Key": actionRequestId },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    const raw = await response.text();
    let result: Record<string, unknown> = {};
    try { result = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { /* handled below */ }
    if (!response.ok || result.success !== true) {
      console.error("[API Recruitment Setup] n8n rejected update:", response.status, result);
      const workflowMessage = typeof result.message === "string"
        ? result.message
        : typeof result.error === "string"
          ? result.error
          : "The recruitment setup could not be saved.";
      return NextResponse.json({ success: false, error: workflowMessage }, { status: response.status === 409 ? 409 : 502 });
    }
    // n8n has just written the new Status/Recruitment_Setup_Status outside
    // this process. The editor refetches the role immediately after this
    // response, so any cache entry repopulated during the request would serve
    // the pre-action status and make the UI look like nothing happened until
    // a second manual refresh.
    invalidateSheetsCache("Role_Requests");
    invalidateSheetsCache("Role_Status_History");

    let voiceSlotWarning = "";
    let voiceSlotsGeneratedAt = setup.voiceInterviewSlotsGeneratedAt || "";
    if (setupAction === "publish_role" && setup.voiceInterviewAvailabilityMode !== "none") {
      try {
        const voiceSlots = await createConfiguredVoiceInterviewSlots({
          roleId: role.roleId,
          mode: setup.voiceInterviewAvailabilityMode,
          manualSlots: setup.voiceInterviewSlots,
          autoStartDate: setup.voiceInterviewAutoStartDate,
          autoEndDate: setup.voiceInterviewAutoEndDate,
          timezone: setup.voiceInterviewTimezone,
        });
        voiceSlotsGeneratedAt = voiceSlots.created > 0 || voiceSlots.skipped > 0 ? updatedAt : voiceSlotsGeneratedAt;
        await updateRoleRequestFields(role.roleId, { Voice_Interview_Slots_Generated_At: voiceSlotsGeneratedAt });
      } catch (voiceSlotError) {
        voiceSlotWarning = voiceSlotError instanceof Error ? `Role published, but AI Voice Interview slots could not be generated: ${voiceSlotError.message}` : "Role published, but AI Voice Interview slots could not be generated.";
        console.error("[API Recruitment Setup] Voice slot generation failed:", voiceSlotError);
      }
    }
    return NextResponse.json({
      success: true,
      roleId: role.roleId,
      status: typeof result.status === "string" ? result.status : role.status,
      action: "recruitment_setup_updated",
      recruitmentSetupStatus: setupStatusForAction(setupAction, role.recruitmentSetupStatus || "Draft"),
      updatedAt,
      actionRequestId,
      notificationStatus: typeof result.notificationStatus === "string" ? result.notificationStatus : "not_configured",
      notificationError: typeof result.notificationError === "string" ? result.notificationError : "",
      message: voiceSlotWarning || "Recruitment setup saved successfully.",
      voiceSlotWarning,
      voiceSlotsGeneratedAt,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ success: false, error: "Please check the recruitment setup fields." }, { status: 400 });
    console.error("[API Recruitment Setup] POST failed:", error instanceof Error ? { name: error.name, message: error.message } : error);
    return NextResponse.json({ success: false, error: "Unable to save recruitment setup." }, { status: 500 });
  }
}
