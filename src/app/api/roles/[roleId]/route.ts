import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  deleteRoleRequest,
  getRoleRequestById,
  getRoleStatusHistory,
  updateRoleRequestFields,
} from "@/lib/google-sheets";
import { canDeleteRoleRequest, canEditRoleRequest, canViewRole } from "@/lib/access-control";
import { roleRequestSchema } from "@/lib/role-schema";
import {
  COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    roleId: string;
  }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  console.log(
    "[API Role Details] GET started",
  );

  try {
    const cookieStore = await cookies();

    const user = verifySessionToken(
      cookieStore.get(COOKIE_NAME)?.value,
    );

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required.",
        },
        { status: 401 },
      );
    }

    const { roleId } = await context.params;

    const role =
      await getRoleRequestById(roleId);

    if (!role) {
      return NextResponse.json(
        {
          success: false,
          error: "Role request not found.",
        },
        { status: 404 },
      );
    }

    if (!canViewRole(user, role)) {
      return NextResponse.json(
        { success: false, error: "You do not have permission to view this role request." },
        { status: 403 },
      );
    }

    const history = await getRoleStatusHistory(
      role.roleId,
    );

    console.log(
      "[API Role Details] Returning role:",
      role.roleId,
    );

    return NextResponse.json(
      {
        success: true,
        role,
        history,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error(
      "[API Role Details] GET failed:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load the role request.",
      },
      { status: 500 },
    );
  }
}

async function getRoleAndUser(roleId: string) {
  const cookieStore = await cookies();
  const user = verifySessionToken(cookieStore.get(COOKIE_NAME)?.value);
  if (!user) return { user: null, role: null, error: NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 }) };

  const role = await getRoleRequestById(roleId);
  if (!role) return { user, role: null, error: NextResponse.json({ success: false, error: "Role request not found." }, { status: 404 }) };
  if (!canViewRole(user, role)) return { user, role: null, error: NextResponse.json({ success: false, error: "You do not have permission to manage this role request." }, { status: 403 }) };
  return { user, role, error: null };
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { roleId } = await context.params;
    const access = await getRoleAndUser(roleId);
    if (access.error || !access.user || !access.role) return access.error;
    if (!canEditRoleRequest(access.user, access.role)) {
      return NextResponse.json({ success: false, error: "You do not have permission to edit this role request." }, { status: 403 });
    }

    const body = await request.json() as Record<string, unknown>;
    const input = roleRequestSchema.parse({
      ...body,
      requesterName: access.role.requesterName || access.user.name,
      requesterEmail: access.role.requesterEmail || access.user.email,
      hodEmail: "hrsg@mclinkgroup.com",
      replacementEmployee: body.requestType === "Staff Replacement" ? body.replacementEmployee : "",
    });
    const setupDraft = body.recruitmentSetupDraft && typeof body.recruitmentSetupDraft === "object"
      ? body.recruitmentSetupDraft as Record<string, unknown>
      : {};
    const setupText = (key: string, fallback: string) => {
      const value = setupDraft[key];
      return typeof value === "string" && value.trim() ? value.trim() : fallback;
    };
    const setupList = (key: string, fallback: string) => {
      const value = setupDraft[key];
      const list = Array.isArray(value)
        ? value.map(String).map((item) => item.trim()).filter(Boolean)
        : typeof value === "string"
          ? value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)
          : [];
      return (list.length > 0 ? list : fallback.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)).join(", ");
    };
    const preservedSetupFields = {
      Screening_Criteria: setupText("screeningCriteria", access.role.screeningCriteria),
      Initial_Interview_Questions: [
        setupText("requiredInterviewQuestion1", access.role.requiredInterviewQuestion1 || ""),
        setupText("requiredInterviewQuestion2", access.role.requiredInterviewQuestion2 || ""),
        setupText("requiredInterviewQuestion3", access.role.requiredInterviewQuestion3 || ""),
        setupText("requiredInterviewQuestion4", access.role.requiredInterviewQuestion4 || ""),
        setupText("requiredInterviewQuestion5", access.role.requiredInterviewQuestion5 || ""),
      ].filter(Boolean).join("\n"),
      Required_Interview_Question_1: setupText("requiredInterviewQuestion1", access.role.requiredInterviewQuestion1 || ""),
      Required_Interview_Question_2: setupText("requiredInterviewQuestion2", access.role.requiredInterviewQuestion2 || ""),
      Required_Interview_Question_3: setupText("requiredInterviewQuestion3", access.role.requiredInterviewQuestion3 || ""),
      Required_Interview_Question_4: setupText("requiredInterviewQuestion4", access.role.requiredInterviewQuestion4 || ""),
      Required_Interview_Question_5: setupText("requiredInterviewQuestion5", access.role.requiredInterviewQuestion5 || ""),
      AI_System_Prompt: access.role.aiSystemPrompt,
      Posting_Channels: setupList("postingChannels", access.role.postingChannels),
      License_or_Certificate_Required: setupText("licenseOrCertificateRequired", access.role.licenseOrCertificateRequired || ""),
      Keywords_to_Look_For: setupText("keywordsToLookFor", access.role.keywordsToLookFor || ""),
      Minimum_Years_of_Experience: setupText("minimumYearsOfExperience", access.role.minimumYearsOfExperience || ""),
      Transferable_Skills_Accepted: setupText("transferableSkillsAccepted", access.role.transferableSkillsAccepted || ""),
      Salary_or_Budget_Range: setupText("salaryOrBudgetRange", access.role.salaryOrBudgetRange || ""),
      Earliest_Availability_Rule: setupText("earliestAvailabilityRule", access.role.earliestAvailabilityRule || ""),
    };
    const updatedAt = new Date().toISOString();

    await updateRoleRequestFields(access.role.roleId, {
      Request_Type: input.requestType,
      Department: input.department,
      Job_Title: input.jobTitle,
      Employment_Type: input.employmentType,
      Number_Of_Vacancies: String(input.numberOfVacancies),
      Reason_For_Request: input.reasonForRequest,
      Job_Description: input.jobDescription,
      Replacement_Employee: input.replacementEmployee,
      Target_Hiring_Date: input.targetHiringDate,
      HOD_Email: input.hodEmail,
      HOD_Availability_Dates: input.hodAvailabilityDates,
      HOD_Availability_Times: input.hodAvailabilityTimes,
      HOD_Availability_Slots: JSON.stringify(input.hodAvailabilitySlots),
      Custom_Screening_Question_1: input.customScreeningQuestion1,
      Custom_Screening_Question_2: input.customScreeningQuestion2,
      AI_Screening_Questions: input.aiGeneratedScreeningQuestions.join("\n"),
      Last_Updated_At: updatedAt,
      Last_Updated_By_Name: access.user.name,
      Last_Updated_By_Email: access.user.email,
      ...preservedSetupFields,
    });

    return NextResponse.json({ success: true, roleId: access.role.roleId, status: access.role.status, message: "Role request updated successfully." });
  } catch (error) {
    console.error("[API Role Details] PATCH failed:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to update the role request." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { roleId } = await context.params;
    const access = await getRoleAndUser(roleId);
    if (access.error || !access.user || !access.role) return access.error;
    if (!canDeleteRoleRequest(access.user, access.role)) {
      return NextResponse.json({ success: false, error: "You do not have permission to delete this role request." }, { status: 403 });
    }

    await deleteRoleRequest(access.role.roleId);
    return NextResponse.json({ success: true, roleId: access.role.roleId, message: "Role request deleted successfully." });
  } catch (error) {
    console.error("[API Role Details] DELETE failed:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to delete the role request." }, { status: 400 });
  }
}
