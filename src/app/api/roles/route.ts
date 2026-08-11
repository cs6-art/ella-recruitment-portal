import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getRoleRequests } from "@/lib/google-sheets";
import { filterVisibleRoles } from "@/lib/access-control";
import { roleRequestSchema } from "@/lib/role-schema";
import { generateRoleId } from "@/lib/role-id";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  console.log("[API Roles] GET started");

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

    if (
      user.canReviewRole !== true &&
      user.canApproveRole !== true &&
      user.canCreateRole !== true
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "You do not have permission to review role requests.",
        },
        { status: 403 },
      );
    }

    const query = new URL(request.url).searchParams;
    const requestedPage = Math.max(1, Number(query.get("page") || "1") || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.get("pageSize") || "25") || 25));
    const status = query.get("status")?.trim() || "";
    const department = query.get("department")?.trim().toLowerCase() || "";
    const requester = query.get("requester")?.trim().toLowerCase() || "";
    const search = query.get("search")?.trim().toLowerCase() || "";
    const sort = query.get("sort") || "newest";
    let roles = filterVisibleRoles(await getRoleRequests(), user).filter((role) =>
      (!status || role.status === status) &&
      (!department || role.department.toLowerCase().includes(department)) &&
      (!requester || `${role.requesterName} ${role.requesterEmail}`.toLowerCase().includes(requester)) &&
      (!search || `${role.roleId} ${role.jobTitle}`.toLowerCase().includes(search)),
    );
    roles = [...roles].sort((left, right) => {
      if (sort === "oldest") return Date.parse(left.createdAt) - Date.parse(right.createdAt);
      if (sort === "target") return (left.targetHiringDate || "9999-12-31").localeCompare(right.targetHiringDate || "9999-12-31");
      return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    });
    const total = roles.length;
    const start = (requestedPage - 1) * pageSize;
    roles = roles.slice(start, start + pageSize);

    console.log(
      "[API Roles] Returning role requests:",
      roles.length,
    );

    return NextResponse.json(
      {
        success: true,
        roles,
        pagination: { page: requestedPage, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
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
      "[API Roles] GET error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error: "Unable to load role requests.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
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

    if (user.canCreateRole !== true) {
      return NextResponse.json(
        {
          success: false,
          error:
            "You do not have permission to create role requests.",
        },
        { status: 403 },
      );
    }

    const sessionEmail = user.email.trim().toLowerCase();
    if (!/^[^\s@]+@mclinkgroup\.com$/i.test(sessionEmail)) {
      return NextResponse.json(
        { success: false, error: "Your authenticated McLink email is not valid." },
        { status: 400 },
      );
    }

    const clientInput = await request.json();
    const input = roleRequestSchema.parse({
      ...clientInput,
      requesterName: user.name,
      requesterEmail: sessionEmail,
      replacementEmployee: clientInput.requestType === "Staff Replacement"
        ? clientInput.replacementEmployee
        : "",
    });

    const webhookUrl =
      process.env.N8N_ROLE_REQUEST_WEBHOOK_URL ||
      process.env.N8N_ROLE_WEBHOOK_URL;

    const webhookSecret =
      process.env.N8N_WEBHOOK_SECRET;

    if (!webhookUrl || !webhookSecret) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The n8n webhook is not configured.",
        },
        { status: 503 },
      );
    }

    const submissionId = crypto.randomUUID();
    const existingRoles = await getRoleRequests();
    const roleId = generateRoleId(
      input.jobTitle,
      existingRoles.map((role) => role.roleId),
    );
    const createdAt = new Date().toISOString();
    const initialStatus = "Pending HR Discussion";
    const performerEmail = user.email.trim().toLowerCase();

    // These values are generated by the server. They are deliberately not
    // part of the client form or the request schema.
    const workflowFields = {
      Role_ID: roleId,
      Created_At: createdAt,
      Status: initialStatus,
      Last_Updated_At: createdAt,
      Last_Updated_By_Name: user.name,
      Last_Updated_By_Email: performerEmail,
      Latest_Comments: "",
      Resume_Target_Status: "",
      History_ID: submissionId,
      Changed_At: createdAt,
      Changed_By_Name: user.name,
      Changed_By_Email: performerEmail,
      Previous_Status: "",
      New_Status: initialStatus,
      Comments: "Role request created",
      Action_Source: "Role Creation Website",
      Action_Request_ID: submissionId,
      Action: "role_request_created",
      Access_Role: user.accessRole,
      Department: user.department,
      Notification_Status: "",
      Notification_Error: "",
      Recruitment_Setup_Status: "Draft",
      Salary_Disclosure_Status: "",
      Experience_Requirement_Status: "",
      License_Requirement_Status: "",
      HOD_Interview_Required: "",
      Recruitment_Ready_At: "",
      Recruitment_Ready_By: "",
      Ready_For_Publishing_At: "",
      Ready_For_Publishing_By: "",
      Posted_At: "",
      Posted_By: "",
      Application_Link: "",
      Posting_Confirmed: "FALSE",
    };

    const payload = {
      eventType: "role_request_created",
      submissionId,
      submittedAt: createdAt,
      roleId,
      createdAt,
      status: initialStatus,

      // Keep the exact sheet column names in the webhook payload so the n8n
      // workflow can auto-map them without relying on requester input.
      workflowFields,
      ...workflowFields,

      submittedBy: {
        name: user.name,
        email: performerEmail,
        googleSub: user.sub,
      },

      requester: {
        name: user.name,
        email: performerEmail,
        type: "HOD or Management",
      },

      role: {
        requestType: input.requestType,
        department: input.department,
        jobTitle: input.jobTitle,
        numberOfVacancies:
          input.numberOfVacancies,
        reasonForRequest:
          input.reasonForRequest,
        jobDescription: input.jobDescription,
        replacementEmployee:
          input.replacementEmployee,
        targetHiringDate:
          input.targetHiringDate,
        hodAvailabilityDates: input.hodAvailabilityDates,
        hodAvailabilityTimes: input.hodAvailabilityTimes,
        customScreeningQuestion1: input.customScreeningQuestion1,
        customScreeningQuestion2: input.customScreeningQuestion2,
        aiGeneratedScreeningQuestions: input.aiGeneratedScreeningQuestions,
        reportingManager:
          input.reportingManager,
        workLocation:
          input.workLocation,
        employmentType:
          input.employmentType,
        jobResponsibilities:
          input.jobResponsibilities,
        requiredSkills:
          input.requiredSkills,
        experienceRequired:
          input.experienceRequired,
        educationRequirements:
          input.educationRequirements,
        preferredQualifications:
          input.preferredQualifications,
        roleExpectations:
          input.roleExpectations,
        salaryMin: input.salaryMin,
        salaryMax: input.salaryMax,
        workSchedule: input.workSchedule,
        noticePeriodRequirement: input.noticePeriodRequirement,
        salaryExpectationGuidance: input.salaryExpectationGuidance,
      },

      recruitmentSetup: {
        jobDescription: "",
        screeningCriteria: "",
        initialInterviewQuestions: "",
        aiSystemPrompt: "",
        initialInterviewBookingLink: "",
        hodInterviewBookingLink: "",
        postingChannels: [],
        salaryDisclosureStatus: "",
        experienceRequirementStatus: "",
        licenseRequirementStatus: "",
        hodInterviewRequired: "",
        recruitmentSetupStatus: "Draft",
      },

      source: "Role Creation Website",
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let webhookResponse: Response;
    try {
      webhookResponse = await fetch(
        webhookUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Secret":
              webhookSecret,
          },
          body: JSON.stringify(payload),
          cache: "no-store",
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeout);
    }

    const raw =
      await webhookResponse.text();

    let result: Record<string, unknown> = {};

    try {
      result = raw
        ? JSON.parse(raw)
        : {};
    } catch {
      result = { raw };
    }

    const returnedRoleId =
      typeof result.roleId === "string"
        ? result.roleId
        : typeof result.Role_ID === "string"
          ? result.Role_ID
          : undefined;
    const returnedStatus =
      typeof result.status === "string"
        ? result.status
        : typeof result.Status === "string"
          ? result.Status
          : undefined;

    if (!webhookResponse.ok) {
      console.error(
        "[API Roles] n8n rejected request:",
        webhookResponse.status,
        result,
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "The role request could not be saved.",
        },
        { status: 502 },
      );
    }

    if (
      typeof returnedRoleId !== "string" ||
      typeof returnedStatus !== "string" ||
      !returnedRoleId.trim() ||
      returnedStatus !== initialStatus
    ) {
      console.error(
        "[API Roles] n8n returned invalid foundation fields:",
        { returnedRoleId, returnedStatus, roleId, initialStatus },
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "The role request workflow did not persist the required foundation fields.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        // n8n may generate the persisted role ID. Use the ID that was
        // actually written so subsequent detail/status requests address the
        // same row in Role_Requests.
        roleId: returnedRoleId,
        status: initialStatus,
        message:
          result.message ||
          "Role request submitted successfully.",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error(
      "[API Roles] POST error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error: "Unable to submit the role request.",
      },
      { status: 400 },
    );
  }
}
