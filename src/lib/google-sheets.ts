import { google } from "googleapis";

import { cachedSheetsRead, invalidateSheetsCache } from "@/lib/sheets-cache";
import { BASELINE_EVALUATION_FIELDS, EVALUATION_FIELD_CATALOG } from "@/lib/recruitment-setup-schema";

const spreadsheetId =
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

const serviceAccountEmail =
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

const privateKey =
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n",
  );

if (!spreadsheetId) {
  throw new Error(
    "GOOGLE_SHEETS_SPREADSHEET_ID is not configured.",
  );
}

if (!serviceAccountEmail) {
  throw new Error(
    "GOOGLE_SERVICE_ACCOUNT_EMAIL is not configured.",
  );
}

if (!privateKey) {
  throw new Error(
    "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is not configured.",
  );
}

const auth = new google.auth.JWT({
  email: serviceAccountEmail,
  key: privateKey,
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
  ],
});

const sheets = google.sheets({
  version: "v4",
  auth,
});

export type DirectoryUser = {
  email: string;
  fullName: string;
  accessRole: string;
  department: string;
  canCreateRole: boolean;
  canReviewRole: boolean;
  canApproveRole: boolean;
  canEditSettings: boolean;
  active: boolean;
};

export type RoleRequestSummary = {
  roleId: string;
  createdAt: string;
  requesterEmail: string;
  targetHiringDate: string;
  requesterName: string;
  department: string;
  requestType: string;
  jobTitle: string;
  numberOfVacancies: number;
  status: string;
  applicationLink?: string;
  recruitmentSetupStatus?: string;
  jobDescription?: string;
  postingChannels?: string;
  hodEmail: string;
  hodAvailabilitySlots: string;
};

export type RoleRequestDetails = {
  roleId: string;
  createdAt: string;

  submittedByEmail: string;
  submittedByName: string;

  requesterEmail: string;
  requesterName: string;
  requesterType: string;
  hodEmail: string;

  requestType: string;
  department: string;
  jobTitle: string;
  numberOfVacancies: number;

  reasonForRequest: string;
  jobDescription: string;
  replacementEmployee: string;
  targetHiringDate: string;
  hodAvailabilityDates: string;
  hodAvailabilityTimes: string;
  hodAvailabilitySlots: string;
  voiceInterviewAvailabilityMode: string;
  voiceInterviewSlots: string;
  voiceInterviewAutoStartDate: string;
  voiceInterviewAutoEndDate: string;
  voiceInterviewTimezone: string;
  voiceInterviewSlotsGeneratedAt: string;
  customScreeningQuestion1: string;
  customScreeningQuestion2: string;
  aiGeneratedScreeningQuestions: string;
  reportingManager: string;
  workLocation: string;
  employmentType: string;

  jobResponsibilities: string;
  requiredSkills: string;
  experienceRequired: string;
  educationRequirements: string;
  preferredQualifications: string;
  roleExpectations: string;

  salaryMin: string;
  salaryMax: string;
  workSchedule: string;
  noticePeriodRequirement: string;
  salaryExpectationGuidance: string;

  screeningCriteria: string;
  requiredInterviewQuestion1?: string;
  requiredInterviewQuestion2?: string;
  requiredInterviewQuestion3?: string;
  requiredInterviewQuestion4?: string;
  requiredInterviewQuestion5?: string;
  aiSystemPrompt: string;
  initialInterviewBookingLink: string;
  hodInterviewBookingLink: string;
  postingChannels: string;
  evaluationFieldToggles?: string;
  customEvaluationFields?: { key: string; label: string; description: string }[];
  recruitmentSetupStatus?: string;
  salaryDisclosureStatus?: string;
  experienceRequirementStatus?: string;
  licenseRequirementStatus?: string;
  hodInterviewRequired?: string;
  recruitmentSetupUpdatedAt?: string;
  recruitmentSetupUpdatedByName?: string;
  recruitmentSetupUpdatedByEmail?: string;
  minimumYearsOfExperience?: string;
  keywordsToLookFor?: string;
  transferableSkillsAccepted?: string;
  salaryOrBudgetRange?: string;
  earliestAvailabilityRule?: string;
  interviewBehavior?: string;
  approvedBy?: string;
  approvedAt?: string;
  managementComments?: string;
  latestComments?: string;
  resumeTargetStatus?: string;
  lastUpdatedAt?: string;
  lastUpdatedByName?: string;
  lastUpdatedByEmail?: string;

  status: string;
  source: string;
  applicationLink?: string;
};

export type RoleStatusHistoryEntry = {
  historyId: string;
  roleId: string;
  changedAt: string;
  changedByName: string;
  changedByEmail: string;
  previousStatus: string;
  newStatus: string;
  comments: string;
  actionSource: string;
  actionRequestId: string;
  action: string;
  accessRole: string;
  department: string;
  resumeTargetStatus: string;
  notificationStatus: string;
  notificationError: string;
};

export type RecruitmentTemplateRecord = {
  id: string;
  name: string;
  sourceRoleId: string;
  setup: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdByName: string;
};

export type PortalSetting = {
  key: string;
  value: string;
  category: string;
  description: string;
  updatedAt: string;
  updatedBy: string;
};

export const defaultPortalSettings: PortalSetting[] = [
  { key: "Portal_Name", value: "McLink Recruitment Portal", category: "Portal Settings", description: "The name shown in the portal and candidate-facing pages.", updatedAt: "", updatedBy: "" },
  { key: "Portal_Timezone", value: "Asia/Singapore", category: "Portal Settings", description: "Default timezone used when dates or times are displayed.", updatedAt: "", updatedBy: "" },
  { key: "Booking_Default_Timezone", value: "Asia/Singapore", category: "Booking & Interview", description: "Timezone preselected when HR creates interview availability.", updatedAt: "", updatedBy: "" },
  { key: "Voice_Interview_Duration_Minutes", value: "30", category: "Booking & Interview", description: "Expected duration for an AI Voice Interview slot.", updatedAt: "", updatedBy: "" },
  { key: "Final_Interview_Duration_Minutes", value: "60", category: "Booking & Interview", description: "Expected duration for a Final Interview slot.", updatedAt: "", updatedBy: "" },
  { key: "Booking_Link_Expiry_Days", value: "7", category: "Booking & Interview", description: "Number of days before a candidate booking link expires.", updatedAt: "", updatedBy: "" },
  { key: "Require_Resume_HR_Approval", value: "Yes", category: "Workflow Rules", description: "HR approval is required before the voice booking link is created.", updatedAt: "", updatedBy: "" },
  { key: "Require_Voice_HR_Approval", value: "Yes", category: "Workflow Rules", description: "HR approval is required before the final interview booking link is created.", updatedAt: "", updatedBy: "" },
  { key: "Booking_Invitation_Auto_Send", value: "Yes", category: "Notifications", description: "Allow the connected automation to send candidate booking invitations.", updatedAt: "", updatedBy: "" },
];

function toBoolean(value: unknown): boolean {
  if (value === true) {
    return true;
  }

  return (
    String(value ?? "")
      .trim()
      .toUpperCase() === "TRUE"
  );
}

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeHeader(value: unknown): string {
  return toText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildRowRecord(
  headers: unknown[],
  row: unknown[],
): Record<string, string> {
  const record: Record<string, string> = {};

  headers.forEach((header, index) => {
    const key = normalizeHeader(header);

    if (!key) {
      return;
    }

    record[key] = toText(row[index]);
  });

  return record;
}

function getField(
  record: Record<string, string>,
  possibleNames: string[],
): string {
  for (const name of possibleNames) {
    const normalizedName = normalizeHeader(name);

    if (
      Object.prototype.hasOwnProperty.call(
        record,
        normalizedName,
      )
    ) {
      return record[normalizedName];
    }
  }

  return "";
}

function parseNumber(value: string): number {
  const numericValue = Number(value);

  return Number.isFinite(numericValue)
    ? numericValue
    : 0;
}

function columnName(index: number): string {
  let number = index + 1;
  let name = "";
  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }
  return name;
}

function parseStoredEvaluationFields(
  value: string,
): Pick<RoleRequestDetails, "evaluationFieldToggles" | "customEvaluationFields"> {
  if (!value.trim()) return { evaluationFieldToggles: "", customEvaluationFields: [] };

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return { evaluationFieldToggles: "", customEvaluationFields: [] };

    const catalogKeys = new Set<string>(EVALUATION_FIELD_CATALOG.map((field) => field.key));
    const baselineKeys = new Set<string>(BASELINE_EVALUATION_FIELDS.map((field) => field.key));
    const fields = parsed.filter((field): field is { key: string; label: string; description: string } => (
      typeof field === "object" && field !== null
      && typeof (field as { key?: unknown }).key === "string"
      && typeof (field as { label?: unknown }).label === "string"
      && typeof (field as { description?: unknown }).description === "string"
    ));

    return {
      evaluationFieldToggles: fields.filter((field) => catalogKeys.has(field.key)).map((field) => field.key).join(","),
      customEvaluationFields: fields.filter((field) => !catalogKeys.has(field.key) && !baselineKeys.has(field.key)).slice(0, 3),
    };
  } catch {
    return { evaluationFieldToggles: "", customEvaluationFields: [] };
  }
}

function mapRoleRequest(
  record: Record<string, string>,
): RoleRequestDetails {
  const storedEvaluationFields = parseStoredEvaluationFields(getField(record, ["Evaluation_Fields", "Evaluation Fields"]));

  return {
    roleId: getField(record, [
      "Role_ID",
      "Role ID",
      "Submission_ID",
      "Submission ID",
    ]),

    createdAt: getField(record, [
      "Created_At",
      "Created At",
      "Submitted_At",
      "Submitted At",
      "Timestamp",
    ]),

    submittedByEmail: getField(record, [
      "Submitted_By_Email",
      "Submitted By Email",
    ]),

    submittedByName: getField(record, [
      "Submitted_By_Name",
      "Submitted By Name",
    ]),

    requesterEmail: getField(record, [
      "Requester_Email",
      "Requester Email",
    ]),

    requesterName: getField(record, [
      "Requester_Name",
      "Requester Name",
    ]),

    requesterType: getField(record, [
      "Requester_Type",
      "Requester Type",
    ]),

    hodEmail: getField(record, ["HOD_Email", "HOD Email"]) || getField(record, ["Requester_Email", "Requester Email"]),

    requestType: getField(record, [
      "Request_Type",
      "Request Type",
    ]),

    department: getField(record, [
      "Department",
    ]),

    jobTitle: getField(record, [
      "Job_Title",
      "Job Title",
      "Role_Title",
      "Role Title",
    ]),

    numberOfVacancies: parseNumber(
      getField(record, [
        "Number_Of_Vacancies",
        "Number Of Vacancies",
        "Vacancies",
      ]),
    ),

    reasonForRequest: getField(record, [
      "Reason_For_Request",
      "Reason For Request",
    ]),

    jobDescription: getField(record, ["Job_Description", "Job Description"]),

    replacementEmployee: getField(record, [
      "Replacement_Employee",
      "Replacement Employee",
    ]),

    targetHiringDate: getField(record, [
      "Target_Hiring_Date",
      "Target Hiring Date",
    ]),

    hodAvailabilityDates: getField(record, ["HOD_Availability_Dates"]),
    hodAvailabilityTimes: getField(record, ["HOD_Availability_Times"]),
    hodAvailabilitySlots: getField(record, ["HOD_Availability_Slots"]),
    voiceInterviewAvailabilityMode: getField(record, ["Voice_Interview_Availability_Mode"]),
    voiceInterviewSlots: getField(record, ["Voice_Interview_Slots"]),
    voiceInterviewAutoStartDate: getField(record, ["Voice_Interview_Auto_Start_Date"]),
    voiceInterviewAutoEndDate: getField(record, ["Voice_Interview_Auto_End_Date"]),
    voiceInterviewTimezone: getField(record, ["Voice_Interview_Timezone"]),
    voiceInterviewSlotsGeneratedAt: getField(record, ["Voice_Interview_Slots_Generated_At"]),
    customScreeningQuestion1: getField(record, ["Custom_Screening_Question_1"]),
    customScreeningQuestion2: getField(record, ["Custom_Screening_Question_2"]),
    aiGeneratedScreeningQuestions: getField(record, ["AI_Screening_Questions"]),

    reportingManager: getField(record, [
      "Reporting_Manager",
      "Reporting Manager",
    ]),

    workLocation: getField(record, [
      "Work_Location",
      "Work Location",
    ]),

    employmentType: getField(record, [
      "Employment_Type",
      "Employment Type",
    ]),

    jobResponsibilities: getField(record, [
      "Job_Responsibilities",
      "Job Responsibilities",
    ]),

    requiredSkills: getField(record, [
      "Required_Skills",
      "Required Skills",
    ]),

    experienceRequired: getField(record, [
      "Experience_Required",
      "Experience Required",
    ]),

    educationRequirements: getField(record, [
      "Education_Requirements",
      "Education Requirements",
    ]),

    preferredQualifications: getField(record, [
      "Preferred_Qualifications",
      "Preferred Qualifications",
    ]),

    roleExpectations: getField(record, [
      "Role_Expectations",
      "Role Expectations",
    ]),

    salaryMin: getField(record, [
      "Salary_Min",
      "Salary Min",
      "Minimum_Salary",
      "Minimum Salary",
    ]),

    salaryMax: getField(record, [
      "Salary_Max",
      "Salary Max",
      "Maximum_Salary",
      "Maximum Salary",
    ]),

    workSchedule: getField(record, [
      "Work_Schedule",
      "Work Schedule",
    ]),

    noticePeriodRequirement: getField(record, ["Notice_Period_Requirement"]),
    salaryExpectationGuidance: getField(record, ["Salary_Expectation_Guidance"]),

    screeningCriteria: getField(record, [
      "Screening_Criteria",
      "Screening Criteria",
    ]),

    requiredInterviewQuestion1: getField(record, ["Required_Interview_Question_1"]),
    requiredInterviewQuestion2: getField(record, ["Required_Interview_Question_2"]),
    requiredInterviewQuestion3: getField(record, ["Required_Interview_Question_3"]),
    requiredInterviewQuestion4: getField(record, ["Required_Interview_Question_4"]),
    requiredInterviewQuestion5: getField(record, ["Required_Interview_Question_5"]),

    aiSystemPrompt: getField(record, [
      "AI_System_Prompt",
      "AI System Prompt",
    ]),

    initialInterviewBookingLink: getField(record, [
      "Initial_Interview_Booking_Link",
      "Initial Interview Booking Link",
    ]),

    hodInterviewBookingLink: getField(record, [
      "HOD_Interview_Booking_Link",
      "HOD Interview Booking Link",
    ]),

    postingChannels: getField(record, [
      "Posting_Channels",
      "Posting Channels",
    ]),
    ...storedEvaluationFields,

    status:
      getField(record, [
        "Status",
        "Request_Status",
        "Request Status",
      ]) || "Submitted",

  source: getField(record, [
      "Source",
    ]),
    applicationLink: getField(record, ["Application_Link"]),
    recruitmentSetupStatus: getField(record, ["Recruitment_Setup_Status"]),

    lastUpdatedAt: getField(record, [
      "Last_Updated_At",
      "Last Updated At",
    ]),

    lastUpdatedByName: getField(record, [
      "Last_Updated_By_Name",
      "Last Updated By Name",
    ]),

    lastUpdatedByEmail: getField(record, [
      "Last_Updated_By_Email",
      "Last Updated By Email",
    ]),

    latestComments: getField(record, [
      "Latest_Comments",
      "Latest Comments",
    ]),

    managementComments: getField(record, [
      "Management_Comments",
      "Management Comments",
    ]),

    approvedBy: getField(record, [
      "Approved_By",
      "Approved By",
    ]),

    approvedAt: getField(record, [
      "Approved_At",
      "Approved At",
    ]),

    resumeTargetStatus: getField(record, [
      "Resume_Target_Status",
      "Resume Target Status",
    ]),
  };
}

async function getRoleRequestRecords(): Promise<
  Record<string, string>[]
> {
  console.log(
    "[Role Requests] Reading Role_Requests sheet",
  );

  const rows = await cachedSheetsRead(`Role_Requests:ZZ:${spreadsheetId}`, async () => {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      // Role_Requests contains workflow and requester fields beyond column
      // AN. Reading through ZZ keeps the mapper aligned with the full sheet
      // schema instead of silently dropping later columns.
      range: "Role_Requests!A1:ZZ",
    });
    return response.data.values ?? [];
  });

  if (rows.length === 0) {
    console.log(
      "[Role Requests] Sheet contains no rows",
    );

    return [];
  }

  const [headers, ...dataRows] = rows;

  console.log(
    "[Role Requests] Data rows read:",
    dataRows.length,
  );

  return dataRows
    .filter((row) =>
      row.some(
        (cell) => toText(cell) !== "",
      ),
    )
    .map((row) =>
      buildRowRecord(headers, row),
    );
}

export async function findDirectoryUser(
  email: string,
): Promise<DirectoryUser | null> {
  console.log("[User Directory] Looking up:", email);

  // Cached: this runs on essentially every authenticated request, so it is
  // the single hottest read in the app. A short cache turns repeated
  // per-request permission checks into one real API read per TTL window.
  const rows = await cachedSheetsRead(`User_Directory:I:${spreadsheetId}`, async () => {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "User_Directory!A2:I",
    });
    return response.data.values ?? [];
  });

  console.log(
    "[User Directory] Rows read:",
    rows.length,
  );

  const normalizedEmail = email
    .trim()
    .toLowerCase();

  for (const row of rows) {
    const [
      sheetEmail,
      fullName,
      accessRole,
      department,
      canCreateRole,
      canReviewRole,
      canApproveRole,
      canEditSettings,
      active,
    ] = row;

    const normalizedSheetEmail =
      toText(sheetEmail).toLowerCase();

    if (
      normalizedSheetEmail !== normalizedEmail
    ) {
      continue;
    }

    const user: DirectoryUser = {
      email: normalizedSheetEmail,
      fullName: toText(fullName),
      accessRole: toText(accessRole),
      department: toText(department),
      canCreateRole: toBoolean(canCreateRole),
      canReviewRole: toBoolean(canReviewRole),
      canApproveRole: toBoolean(canApproveRole),
      canEditSettings:
        toBoolean(canEditSettings),
      active: toBoolean(active),
    };

    console.log(
      "[User Directory] Match found:",
      {
        email: user.email,
        fullName: user.fullName,
        accessRole: user.accessRole,
        department: user.department,
        active: user.active,
      },
    );

    return user;
  }

  console.log(
    "[User Directory] No match found:",
    normalizedEmail,
  );

  return null;
}

export async function getRoleRequests(): Promise<
  RoleRequestSummary[]
> {
  const records =
    await getRoleRequestRecords();

  const roles: RoleRequestSummary[] =
    records
      .map((record) =>
        mapRoleRequest(record),
      )
      .filter(
        (role) => role.roleId !== "",
      )
      .map((role) => ({
        roleId: role.roleId,
        createdAt: role.createdAt,
        requesterEmail: role.requesterEmail,
        targetHiringDate: role.targetHiringDate,
        requesterName:
          role.requesterName,
        department: role.department,
        requestType: role.requestType,
        jobTitle: role.jobTitle,
        numberOfVacancies:
          role.numberOfVacancies,
        status: role.status,
        applicationLink: role.applicationLink,
        recruitmentSetupStatus: role.recruitmentSetupStatus,
        jobDescription: role.jobDescription,
        postingChannels: role.postingChannels,
        hodEmail: role.hodEmail,
        hodAvailabilitySlots: role.hodAvailabilitySlots,
      }));

  // Role_ID is the identity used by every role list and detail link. A
  // duplicated sheet row must not produce two records with the same identity
  // in the UI, so keep the first row (which is also what getRoleRequestById
  // returns) and ignore later duplicates.
  const uniqueRoles = new Map<string, RoleRequestSummary>();
  for (const role of roles) {
    const identity = role.roleId.trim().toLowerCase();
    if (uniqueRoles.has(identity)) {
      console.warn("[Role Requests] Ignoring duplicate role row:", role.roleId);
      continue;
    }

    uniqueRoles.set(identity, role);
  }

  return JSON.parse(
    JSON.stringify([...uniqueRoles.values()]),
  ) as RoleRequestSummary[];
}

export async function getRoleRequestById(
  roleId: string,
): Promise<RoleRequestDetails | null> {
  const normalizedRoleId = decodeURIComponent(
    roleId,
  )
    .trim()
    .toLowerCase();

  console.log(
    "[Role Requests] Looking up role:",
    normalizedRoleId,
  );

  const records =
    await getRoleRequestRecords();

  for (const record of records) {
    const role = mapRoleRequest(record);

    if (
      role.roleId
        .trim()
        .toLowerCase() !== normalizedRoleId
    ) {
      continue;
    }

    return JSON.parse(
      JSON.stringify(role),
    ) as RoleRequestDetails;
  }

  console.log(
    "[Role Requests] Role not found:",
    roleId,
  );

  return null;
}

export async function getRoleStatusHistory(
  roleId: string,
): Promise<RoleStatusHistoryEntry[]> {
  const normalizedRoleId = decodeURIComponent(roleId)
    .trim()
    .toLowerCase();

  const rows = await cachedSheetsRead(`Role_Status_History:O:${spreadsheetId}`, async () => {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Role_Status_History!A1:O",
    });
    return response.data.values ?? [];
  });

  if (rows.length < 2) {
    return [];
  }

  const [headers, ...dataRows] = rows;
  const history = dataRows
    .filter((row) => row.some((cell) => toText(cell) !== ""))
    .map((row) => buildRowRecord(headers, row))
    .filter(
      (record) =>
        getField(record, ["Role_ID", "Role ID"])
          .trim()
          .toLowerCase() === normalizedRoleId,
    )
    .map((record): RoleStatusHistoryEntry => ({
      historyId: getField(record, ["History_ID", "History ID"]),
      roleId: getField(record, ["Role_ID", "Role ID"]),
      changedAt: getField(record, ["Changed_At", "Changed At"]),
      changedByName: getField(record, ["Changed_By_Name", "Changed By Name"]),
      changedByEmail: getField(record, ["Changed_By_Email", "Changed By Email"]),
      previousStatus: getField(record, ["Previous_Status", "Previous Status"]),
      newStatus: getField(record, ["New_Status", "New Status"]),
      comments: getField(record, ["Comments"]),
      actionSource: getField(record, ["Action_Source", "Action Source"]),
      actionRequestId: getField(record, ["Action_Request_ID", "Action Request ID"]),
      action: getField(record, ["Action"]),
      accessRole: getField(record, ["Access_Role", "Access Role"]),
      department: getField(record, ["Department"]),
      resumeTargetStatus: getField(record, ["Resume_Target_Status", "Resume Target Status"]),
      notificationStatus: getField(record, ["Notification_Status", "Notification Status"]),
      notificationError: getField(record, ["Notification_Error", "Notification Error"]),
    }));

  return history.sort((a, b) => {
    const aTime = Date.parse(a.changedAt);
    const bTime = Date.parse(b.changedAt);

    if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
      return 0;
    }

    return bTime - aTime;
  });
}

export async function getRecruitmentTemplates(): Promise<RecruitmentTemplateRecord[]> {
  const rows = await cachedSheetsRead(`Recruitment_Templates:G:${spreadsheetId}`, async () => {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Recruitment_Templates!A:G",
    });
    return response.data.values ?? [];
  });
  if (rows.length < 2) return [];

  const [headers, ...dataRows] = rows;
  return dataRows
    .filter((row) => row.some((cell) => toText(cell) !== ""))
    .map((row) => buildRowRecord(headers, row))
    .map((record) => {
      let setup: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(getField(record, ["Setup_JSON", "Setup JSON"]));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) setup = parsed;
      } catch {
        setup = {};
      }
      return {
        id: getField(record, ["Template_ID", "Template ID"]),
        name: getField(record, ["Name", "Template_Name", "Template Name"]),
        sourceRoleId: getField(record, ["Source_Role_ID", "Source Role ID"]),
        setup,
        createdAt: getField(record, ["Created_At", "Created At"]),
        updatedAt: getField(record, ["Updated_At", "Updated At"]),
        createdByName: getField(record, ["Created_By_Name", "Created By Name"]),
      };
    })
    .filter((template) => template.id !== "");
}

function templateValues(template: RecruitmentTemplateRecord): string[] {
  return [
    template.id,
    template.name,
    template.sourceRoleId,
    JSON.stringify(template.setup),
    template.createdAt,
    template.updatedAt,
    template.createdByName,
  ];
}

export async function upsertRecruitmentTemplate(template: RecruitmentTemplateRecord): Promise<void> {
  const existing = await getRecruitmentTemplates();
  const rowIndex = existing.findIndex((item) => item.id === template.id);
  const range = rowIndex >= 0
    ? `Recruitment_Templates!A${rowIndex + 2}:G${rowIndex + 2}`
    : "Recruitment_Templates!A:G";

  if (rowIndex >= 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { values: [templateValues(template)] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [templateValues(template)] },
    });
  }
  invalidateSheetsCache("Recruitment_Templates");
}

/**
 * Writes role-owned setup fields directly after a setup action. The n8n
 * mapper still receives the same fields, but this keeps newly introduced
 * setup columns durable even before an imported workflow has been redeployed.
 */
export async function updateRoleRequestFields(roleId: string, fields: Record<string, string>): Promise<void> {
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Role_Requests!A1:ZZ" });
  const rows = response.data.values ?? [];
  if (rows.length < 2) throw new Error("Role_Requests sheet has no data rows.");
  const headers = [...(rows[0] ?? [])].map((header) => toText(header));
  const roleIndex = headers.findIndex((header) => ["role_id", "role id", "submission_id", "submission id"].includes(normalizeHeader(header)));
  if (roleIndex < 0) throw new Error("Role_Requests sheet is missing a role ID column.");
  const rowIndex = rows.slice(1).findIndex((row) => toText(row[roleIndex]) === roleId);
  if (rowIndex < 0) throw new Error("Role request row not found.");

  const rowNumber = rowIndex + 2;
  const updates: { range: string; values: string[][] }[] = [];
  const missingHeaderIndexes: number[] = [];
  for (const [header, value] of Object.entries(fields)) {
    let headerIndex = headers.findIndex((existing) => normalizeHeader(existing) === normalizeHeader(header));
    if (headerIndex < 0) {
      headerIndex = headers.length;
      headers.push(header);
      missingHeaderIndexes.push(headerIndex);
      updates.push({ range: `'Role_Requests'!${columnName(headerIndex)}1`, values: [[header]] });
    }
    updates.push({ range: `'Role_Requests'!${columnName(headerIndex)}${rowNumber}`, values: [[value]] });
  }
  if (updates.length > 0) {
    if (missingHeaderIndexes.length > 0) {
      const metadata = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets(properties(sheetId,title,gridProperties(columnCount)))",
      });
      const sheet = metadata.data.sheets?.find((item) => item.properties?.title === "Role_Requests");
      const sheetId = sheet?.properties?.sheetId;
      const currentColumnCount = sheet?.properties?.gridProperties?.columnCount || 0;
      if (sheetId === undefined || currentColumnCount < headers.length) {
        if (sheetId === undefined) throw new Error("Role_Requests sheet metadata is unavailable.");
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{
              appendDimension: {
                sheetId,
                dimension: "COLUMNS",
                length: Math.max(1, headers.length - currentColumnCount),
              },
            }],
          },
        });
      }
    }
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "USER_ENTERED", data: updates } });
    invalidateSheetsCache("Role_Requests");
  }
}

export async function deleteRecruitmentTemplate(id: string): Promise<void> {
  const rows = await cachedSheetsRead(`Recruitment_Templates:G:${spreadsheetId}`, async () => {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Recruitment_Templates!A:G",
    });
    return response.data.values ?? [];
  });
  const rowIndex = rows.slice(1).findIndex((row) => toText(row[0]) === id);
  if (rowIndex < 0) return;

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `Recruitment_Templates!A${rowIndex + 2}:G${rowIndex + 2}`,
  });
  invalidateSheetsCache("Recruitment_Templates");
}

/**
 * The Settings tab opens with a single-cell "System Settings" banner in row 1,
 * so the real header row is row 2 and data starts at row 3. Treating row 1 as
 * the header row parsed every key as blank, which silently fell back to
 * `defaultPortalSettings` and made the Settings page ignore the sheet entirely.
 */
const SETTINGS_HEADER_ROW = 2;

function findSettingsHeaderRow(rows: string[][]): number {
  const index = rows.findIndex((row) => row.some((cell) => normalizeHeader(toText(cell)) === "setting_key"));
  return index < 0 ? SETTINGS_HEADER_ROW - 1 : index;
}

export async function getPortalSettings(): Promise<PortalSetting[]> {
  const rows = await cachedSheetsRead(`Settings:F:${spreadsheetId}`, async () => {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Settings!A1:F",
    });
    return (response.data.values ?? []) as string[][];
  });
  const headerIndex = findSettingsHeaderRow(rows);
  const headers = rows[headerIndex] ?? [];
  const dataRows = rows.slice(headerIndex + 1);
  if (headers.length === 0 || dataRows.length === 0) return [];
  return dataRows
    .filter((row) => row.some((cell) => toText(cell) !== ""))
    .map((row) => buildRowRecord(headers, row))
    .map((record) => ({
      key: getField(record, ["Setting_Key", "Setting Key"]),
      value: getField(record, ["Setting_Value", "Setting Value"]),
      category: getField(record, ["Category"]),
      description: getField(record, ["Description"]),
      updatedAt: getField(record, ["Updated_At", "Updated At"]),
      updatedBy: getField(record, ["Updated_By", "Updated By"]),
    }))
    .filter((setting) => setting.key !== "");
}

export async function upsertPortalSettings(settings: PortalSetting[]): Promise<void> {
  const existingRows = await cachedSheetsRead(`Settings:F:${spreadsheetId}`, async () => {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Settings!A1:F",
    });
    return (response.data.values ?? []) as string[][];
  });
  const headerIndex = findSettingsHeaderRow(existingRows);
  const hasData = existingRows.slice(headerIndex + 1).some((row) => row.some((cell) => toText(cell) !== ""));
  const rows = settings.map((setting) => [
    setting.key,
    setting.value,
    setting.category,
    setting.description,
    setting.updatedAt,
    setting.updatedBy,
  ]);

  if (!hasData) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Settings!A:F",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: rows },
    });
    invalidateSheetsCache("Settings");
    return;
  }

  // Data starts on the row after the header row, which is not row 1 because of
  // the banner. Writing from row 2 would overwrite the header itself.
  const firstDataRow = headerIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Settings!A${firstDataRow}:F${firstDataRow + settings.length - 1}`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });
  invalidateSheetsCache("Settings");
}

