import { cookies } from "next/headers";
import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { canEditRecruitmentSetup, canUseRecruitmentSetup, canViewRole } from "@/lib/access-control";
import { getRoleRequestById } from "@/lib/google-sheets";
import { recruitmentSetupSchema } from "@/lib/recruitment-setup-schema";
import { getSetupReadiness, setupStatusForAction } from "@/lib/recruitment-setup-readiness";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ roleId: string }> };

export async function POST(request: Request, context: Context) {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  if (!canEditRecruitmentSetup(user)) return NextResponse.json({ success: false, error: "Only HR reviewers can edit recruitment setup." }, { status: 403 });

  const { roleId: encodedRoleId } = await context.params;
  const roleId = decodeURIComponent(encodedRoleId);
  const role = await getRoleRequestById(roleId);
  if (!role || !canViewRole(user, role)) return NextResponse.json({ success: false, error: "Role request not found." }, { status: 404 });
  if (!canUseRecruitmentSetup(role.status)) return NextResponse.json({ success: false, error: "Recruitment setup is only available for Approved or Recruitment Setup roles." }, { status: 409 });

  try {
    const setup = recruitmentSetupSchema.parse(await request.json());
    const setupAction = setup.setupAction || "save_draft";
    const readinessLevel = setupAction === "mark_recruitment_ready" ? "recruitment-ready" : setupAction === "mark_ready_for_publishing" || setupAction === "publish_role" ? "ready-for-publishing" : "draft";
    const readiness = getSetupReadiness(setup, readinessLevel);
    if (!readiness.valid) return NextResponse.json({ success: false, code: "RECRUITMENT_SETUP_INCOMPLETE", message: setupAction === "save_draft" ? "Complete the three required draft fields before saving." : "The recruitment setup is not ready for this stage.", missingFields: readiness.missingFields.map((field) => field.key), missingFieldLabels: readiness.missingFields.map((field) => field.label) }, { status: 422 });
    if (setupAction === "publish_role" && role.recruitmentSetupStatus !== "Ready for Publishing") return NextResponse.json({ success: false, code: "RECRUITMENT_SETUP_NOT_READY", message: "Mark the setup as Ready for Publishing before publishing the role." }, { status: 409 });
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
    const roleSalaryRange = [role.salaryMin, role.salaryMax].filter((value) => String(value || "").trim()).join(" - ");
    const canonicalSetup = {
      ...setup,
      // These values belong to the original Role Request. Keep legacy setup
      // fields populated for the webhook without allowing a template to
      // overwrite the canonical role data.
      jobDescription: role.jobDescription || setup.jobDescription,
      minimumYearsOfExperience: role.experienceRequired || setup.minimumYearsOfExperience || "",
      salaryOrBudgetRange: roleSalaryRange || role.salaryExpectationGuidance || setup.salaryOrBudgetRange,
      earliestAvailabilityRule: role.noticePeriodRequirement || setup.earliestAvailabilityRule,
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
      recruitmentSetupStatus: setupStatusForAction(setupAction, role.recruitmentSetupStatus || "Draft"),
      targetRoleStatus: setupAction === "publish_role" ? "Job Posted" : role.status === "Approved" ? "Recruitment Setup" : role.status,
      Status: setupAction === "publish_role" ? "Job Posted" : role.status === "Approved" ? "Recruitment Setup" : role.status,
      recruitmentSetup: canonicalSetup,
      Job_Description: role.jobDescription,
      Screening_Criteria: setup.screeningCriteria,
      Required_Interview_Question_1: setup.requiredInterviewQuestion1,
      Required_Interview_Question_2: setup.requiredInterviewQuestion2,
      Required_Interview_Question_3: setup.requiredInterviewQuestion3,
      Required_Interview_Question_4: setup.requiredInterviewQuestion4,
      Required_Interview_Question_5: setup.requiredInterviewQuestion5,
      AI_System_Prompt: setup.aiSystemPrompt,
      Initial_Interview_Booking_Link: role.initialInterviewBookingLink || setup.initialInterviewBookingLink,
      HOD_Interview_Booking_Link: role.hodInterviewBookingLink || setup.hodInterviewBookingLink,
      Posting_Channels: setup.postingChannels.join(", "),
      Application_Link: applicationLink,
      Posting_Confirmed: setupAction === "publish_role" ? "TRUE" : "FALSE",
      License_or_Certificate_Required: setup.licenseOrCertificateRequired,
      Keywords_to_Look_For: setup.keywordsToLookFor,
      Minimum_Years_of_Experience: role.experienceRequired || setup.minimumYearsOfExperience || "",
      Transferable_Skills_Accepted: setup.transferableSkillsAccepted,
      Salary_or_Budget_Range: roleSalaryRange || role.salaryExpectationGuidance || setup.salaryOrBudgetRange,
      Earliest_Availability_Rule: role.noticePeriodRequirement || setup.earliestAvailabilityRule,
      Experience_Required: role.experienceRequired,
      Salary_Minimum: role.salaryMin,
      Salary_Maximum: role.salaryMax,
      Work_Schedule: role.workSchedule,
      Notice_Period_Requirement: role.noticePeriodRequirement,
      HOD_Availability_Dates: role.hodAvailabilityDates,
      HOD_Availability_Times: role.hodAvailabilityTimes,
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
      return NextResponse.json({ success: false, error: "The recruitment setup could not be saved." }, { status: response.status === 409 ? 409 : 502 });
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
      message: "Recruitment setup saved successfully.",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ success: false, error: "Please check the recruitment setup fields." }, { status: 400 });
    console.error("[API Recruitment Setup] POST failed:", error instanceof Error ? { name: error.name, message: error.message } : error);
    return NextResponse.json({ success: false, error: "Unable to save recruitment setup." }, { status: 500 });
  }
}
