import crypto from "node:crypto";
import { google } from "googleapis";
import { z } from "zod";

import { createFinalInterviewEvent } from "@/lib/google-calendar";
import { getRoleRequestById } from "@/lib/google-sheets";

export type BookingKind = "voice" | "final";
export type ApplicantDecisionStage = "resume" | "voice" | "final";
export type ApplicantDecision = "Approve" | "Reject" | "Manual Review";
export type CandidateApplicationSource =
  | "Direct Application"
  | "Referral"
  | "Walk-in"
  | "Agency"
  | "Existing Database"
  | "HR Invitation";

export type CandidateApplicationInput = {
  roleId: string;
  candidateName: string;
  email: string;
  phone: string;
  preferredMobile: string;
  resumeText: string;
  salaryExpectation: string;
  noticePeriod: string;
  availability: string;
  skillsAssessment: string;
  roleExpectations: string;
  applicationSource: CandidateApplicationSource | string;
};

export type CandidateApplicationDuplicate = {
  applicationId: string;
  roleId: string;
  email: string;
  finalStatus: string;
};

export type CandidateApplicationWebhookPayload = {
  eventType: "candidate_application_submitted";
  applicationId: string;
  roleId: string;
  Role_ID: string;
  candidate: {
    name: string;
    email: string;
    phone: string;
    preferredMobile: string;
    resumeText: string;
    salaryExpectation: string;
    noticePeriod: string;
    availability: string;
    skillsAssessment: string;
    roleExpectations: string;
    applicationSource: string;
    consent?: boolean;
  };
  submittedAt: string;
  source: string;
  applicationSource: string;
};

export const candidateApplicationSources = [
  "Direct Application",
  "Referral",
  "Walk-in",
  "Agency",
  "Existing Database",
  "HR Invitation",
] as const;

export const candidateApplicationSubmissionSchema = z.object({
  roleId: z.string().trim().min(1).max(200),
  candidateName: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(50).default(""),
  preferredMobile: z.string().trim().min(1).max(50),
  resumeText: z.string().trim().min(20).max(50000),
  salaryExpectation: z.string().trim().max(1000).default(""),
  noticePeriod: z.string().trim().max(1000).default(""),
  availability: z.string().trim().max(1000).default(""),
  skillsAssessment: z.string().trim().max(10000).default(""),
  roleExpectations: z.string().trim().max(10000).default(""),
  applicationSource: z.enum(candidateApplicationSources).default("Direct Application"),
  consent: z.boolean().optional().default(false),
});

export type CandidateStatusHistoryEntry = {
  historyId: string;
  applicationId: string;
  roleId: string;
  changedAt: string;
  previousStatus: string;
  newStatus: string;
  stage: ApplicantDecisionStage | "final";
  action: ApplicantDecision;
  changedByName: string;
  changedByEmail: string;
  comments: string;
  rejectionReason: string;
  actionSource: string;
};

export type CreateInterviewSlotInput = {
  interviewType: "AI Voice Interview" | "Final Interview";
  roleId: string;
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
};

export type BookingSlot = {
  slotId: string;
  interviewType: string;
  roleId: string;
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
};

export type BookingContext = {
  kind: BookingKind;
  applicationId: string;
  candidateName: string;
  email: string;
  selectedRole: string;
  roleId: string;
  bookingStatus: string;
  scheduledDate: string;
  scheduledTime: string;
  timezone: string;
  slots: BookingSlot[];
};

const spreadsheetId = process.env.GOOGLE_CANDIDATE_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!spreadsheetId || !serviceAccountEmail || !privateKey) throw new Error("Candidate spreadsheet access is not configured.");

const auth = new google.auth.JWT({ email: serviceAccountEmail, key: privateKey, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

type Row = Record<string, string>;
type SheetData = { headers: string[]; rows: Row[]; rowNumbers: number[] };

function text(value: unknown) { return String(value ?? "").trim(); }
function normalize(value: unknown) { return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function field(row: Row, ...names: string[]) { for (const name of names) { const key = normalize(name); if (key in row) return row[key]; } return ""; }
function columnName(index: number) { let name = ""; let value = index + 1; while (value > 0) { const remainder = (value - 1) % 26; name = String.fromCharCode(65 + remainder) + name; value = Math.floor((value - 1) / 26); } return name; }
function hashToken(token: string) { return crypto.createHash("sha256").update(token).digest("hex"); }
function normalizeEmail(value: string) { return text(value).toLowerCase(); }
export function normalizePreferredMobile(value: string) {
  return text(value).replace(/[\s().-]+/g, "");
}

export function isPreferredMobileValid(value: string) {
  const normalized = normalizePreferredMobile(value);
  return /^\+[1-9]\d{7,14}$/.test(normalized);
}

async function readSheet(tab: string, endColumn: string): Promise<SheetData> {
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tab.replace(/'/g, "''")}'!A1:${endColumn}` });
  const values = response.data.values ?? [];
  const headers = (values[0] ?? []).map(text);
  const rows: Row[] = [];
  const rowNumbers: number[] = [];
  values.slice(1).forEach((valuesRow, index) => {
    if (!valuesRow.some((value) => text(value))) return;
    rows.push(Object.fromEntries(headers.map((header, column) => [normalize(header), text(valuesRow[column])])));
    rowNumbers.push(index + 2);
  });
  return { headers, rows, rowNumbers };
}

async function appendRows(tab: string, values: string[][]) {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${tab.replace(/'/g, "''")}'!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
}

function findApplicant(data: SheetData, applicationId: string) {
  const wanted = decodeURIComponent(applicationId).trim().toLowerCase();
  const index = data.rows.findIndex((row) => field(row, "Application ID", "Application_ID").toLowerCase() === wanted);
  return index < 0 ? null : { row: data.rows[index], rowNumber: data.rowNumbers[index] };
}

function bookingKindValue(kind: BookingKind) { return kind === "voice" ? "AI Voice Interview" : "Final Interview"; }

function slotFrom(row: Row): BookingSlot {
  return {
    slotId: field(row, "Slot_ID", "Slot ID"),
    interviewType: field(row, "Interview_Type", "Interview Type"),
    roleId: field(row, "Role_ID", "Role ID"),
    date: field(row, "Date"),
    startTime: field(row, "Start_Time", "Start Time"),
    endTime: field(row, "End_Time", "End Time"),
    timezone: field(row, "Timezone", "Time Zone"),
  };
}

function slotSort(left: BookingSlot, right: BookingSlot) { return `${left.date} ${left.startTime}`.localeCompare(`${right.date} ${right.startTime}`); }

export async function findDuplicateCandidateApplication(roleId: string, email: string): Promise<CandidateApplicationDuplicate | null> {
  const normalizedRoleId = text(roleId).toLowerCase();
  const normalizedEmailAddress = normalizeEmail(email);
  if (!normalizedRoleId || !normalizedEmailAddress) return null;

  const { rows } = await readSheet("High_Match_Profile", "BH");
  const match = rows.find((row) => {
    const sameRole = field(row, "Role_ID", "Role ID").toLowerCase() === normalizedRoleId;
    const sameEmail = normalizeEmail(field(row, "Email", "Candidate_Email")) === normalizedEmailAddress;
    const finalStatus = field(row, "Final_Status").toLowerCase();
    const rejected = finalStatus.includes("reject");
    return sameRole && sameEmail && !rejected;
  });

  if (!match) return null;

  return {
    applicationId: field(match, "Application_ID", "Application ID"),
    roleId: field(match, "Role_ID", "Role ID"),
    email: field(match, "Email", "Candidate_Email"),
    finalStatus: field(match, "Final_Status"),
  };
}

export function buildCandidateApplicationPayload(input: {
  applicationId: string;
  roleId: string;
  source: string;
  candidate: CandidateApplicationInput & { consent?: boolean };
  submittedAt: string;
}): CandidateApplicationWebhookPayload {
  const email = normalizeEmail(input.candidate.email);
  return {
    eventType: "candidate_application_submitted",
    applicationId: input.applicationId,
    roleId: input.roleId,
    Role_ID: input.roleId,
    candidate: {
      name: text(input.candidate.candidateName),
      email,
      phone: text(input.candidate.phone),
      preferredMobile: normalizePreferredMobile(input.candidate.preferredMobile),
      resumeText: text(input.candidate.resumeText),
      salaryExpectation: text(input.candidate.salaryExpectation),
      noticePeriod: text(input.candidate.noticePeriod),
      availability: text(input.candidate.availability),
      skillsAssessment: text(input.candidate.skillsAssessment),
      roleExpectations: text(input.candidate.roleExpectations),
      applicationSource: text(input.candidate.applicationSource),
      consent: input.candidate.consent,
    },
    submittedAt: input.submittedAt,
    source: input.source,
    applicationSource: text(input.candidate.applicationSource),
  };
}

export async function sendCandidateApplicationWebhook(webhookUrl: string, webhookSecret: string, payload: CandidateApplicationWebhookPayload) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Secret": webhookSecret,
      "X-Idempotency-Key": payload.applicationId,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const result = await response.json().catch(() => ({}));
  return { response, result: result as Record<string, unknown> };
}

const candidateHistoryHeaders = [
  "History_ID",
  "Application_ID",
  "Role_ID",
  "Changed_At",
  "Previous_Status",
  "New_Status",
  "Stage",
  "Action",
  "Changed_By_Name",
  "Changed_By_Email",
  "Comments",
  "Rejection_Reason",
  "Action_Source",
] as const;

export function buildCandidateStatusHistoryEntry(input: {
  applicationId: string;
  roleId: string;
  changedAt: string;
  previousStatus: string;
  newStatus: string;
  stage: ApplicantDecisionStage | "final";
  action: ApplicantDecision;
  changedByName: string;
  changedByEmail: string;
  comments: string;
  rejectionReason?: string;
  actionSource?: string;
}) {
  const historyId = `HIST-${crypto.randomUUID()}`;
  return {
    historyId,
    applicationId: input.applicationId,
    roleId: input.roleId,
    changedAt: input.changedAt,
    previousStatus: input.previousStatus,
    newStatus: input.newStatus,
    stage: input.stage,
    action: input.action,
    changedByName: input.changedByName,
    changedByEmail: normalizeEmail(input.changedByEmail),
    comments: input.comments,
    rejectionReason: input.rejectionReason || "",
    actionSource: input.actionSource || "Applicant Review Portal",
  } satisfies CandidateStatusHistoryEntry;
}

function candidateHistoryValues(entry: CandidateStatusHistoryEntry): string[] {
  return [
    entry.historyId,
    entry.applicationId,
    entry.roleId,
    entry.changedAt,
    entry.previousStatus,
    entry.newStatus,
    entry.stage,
    entry.action,
    entry.changedByName,
    entry.changedByEmail,
    entry.comments,
    entry.rejectionReason,
    entry.actionSource,
  ];
}

export async function getCandidateStatusHistory(applicationId: string): Promise<CandidateStatusHistoryEntry[]> {
  try {
    const { rows } = await readSheet("Candidate_Status_History", "M");
    const normalizedApplicationId = text(applicationId).toLowerCase();
    return rows
      .filter((row) => field(row, "Application_ID", "Application ID").toLowerCase() === normalizedApplicationId)
      .map((row): CandidateStatusHistoryEntry => ({
        historyId: field(row, "History_ID", "History ID"),
        applicationId: field(row, "Application_ID", "Application ID"),
        roleId: field(row, "Role_ID", "Role ID"),
        changedAt: field(row, "Changed_At", "Changed At"),
        previousStatus: field(row, "Previous_Status", "Previous Status"),
        newStatus: field(row, "New_Status", "New Status"),
        stage: field(row, "Stage") as CandidateStatusHistoryEntry["stage"],
        action: field(row, "Action") as ApplicantDecision,
        changedByName: field(row, "Changed_By_Name", "Changed By Name"),
        changedByEmail: field(row, "Changed_By_Email", "Changed By Email"),
        comments: field(row, "Comments"),
        rejectionReason: field(row, "Rejection_Reason", "Rejection Reason"),
        actionSource: field(row, "Action_Source", "Action Source"),
      }))
      .sort((left, right) => Date.parse(right.changedAt) - Date.parse(left.changedAt));
  } catch (error) {
    console.warn("[Candidate Status History] Unable to read history:", error);
    return [];
  }
}

export async function getBookingContext(kind: BookingKind, token: string): Promise<BookingContext | null> {
  const [applicantData, slotsData] = await Promise.all([readSheet("High_Match_Profile", "BH"), readSheet("Interview_Slots", "P")]);
  const cleanToken = text(token);
  const tokenHash = hashToken(cleanToken);
  const applicantIndex = applicantData.rows.findIndex((row) => kind === "voice"
    ? field(row, "Booking_Token") === cleanToken || field(row, "Booking_Token_Hash") === tokenHash
    : field(row, "Final_Interview_Booking_Token_Hash") === tokenHash);
  if (applicantIndex < 0) return null;

  const row = applicantData.rows[applicantIndex];
  const expiry = kind === "voice" ? field(row, "Booking_Token_Expires_At") : field(row, "Final_Interview_Booking_Token_Expires_At");
  if (expiry && Date.parse(expiry) < Date.now()) return null;
  const roleId = field(row, "Role_ID", "Role ID");
  const status = kind === "voice" ? field(row, "Booking_Token_Status") : field(row, "Status 3 (Final Interview)");
  const slots = slotsData.rows
    .filter((slot) => field(slot, "Role_ID", "Role ID").toLowerCase() === roleId.toLowerCase())
    .filter((slot) => field(slot, "Interview_Type", "Interview Type") === bookingKindValue(kind))
    .filter((slot) => field(slot, "Status").toLowerCase() === "available")
    .map(slotFrom)
    .filter((slot) => slot.slotId)
    .sort(slotSort);

  return {
    kind,
    applicationId: field(row, "Application ID", "Application_ID"),
    candidateName: field(row, "Candidate Name", "Candidate_Name"),
    email: field(row, "Email"),
    selectedRole: field(row, "Selected Role", "Selected_Role"),
    roleId,
    bookingStatus: status,
    scheduledDate: field(row, "Voice_Interview_Scheduled_Date"),
    scheduledTime: field(row, "Voice_Interview_Scheduled_Time"),
    timezone: field(row, "Voice_Interview_Timezone"),
    slots,
  };
}

type CellUpdate = { tab: string; row: number; header: string; value: string };

async function updateCells(updates: CellUpdate[]) {
  const grouped = new Map<string, CellUpdate[]>();
  updates.forEach((update) => grouped.set(update.tab, [...(grouped.get(update.tab) ?? []), update]));
  for (const [tab, tabUpdates] of grouped) {
    const data = await readSheet(tab, tab === "High_Match_Profile" ? "BH" : tab === "Interview_Slots" ? "P" : "AE");
    const requests = tabUpdates.map((update) => {
      let index = data.headers.findIndex((header) => normalize(header) === normalize(update.header));
      if (index < 0) index = data.headers.length;
      return { range: `'${tab}'!${columnName(index)}${update.row}`, values: [[update.value]] };
    });
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "USER_ENTERED", data: requests } });
  }
}

export async function reserveBooking(kind: BookingKind, token: string, slotId: string) {
  const cleanSlotId = text(slotId);
  if (!cleanSlotId) throw new Error("Choose an interview slot.");
  const [context, slotsData, applicantData] = await Promise.all([getBookingContext(kind, token), readSheet("Interview_Slots", "P"), readSheet("High_Match_Profile", "BH")]);
  if (!context) throw new Error("This booking link is invalid or expired.");
  if (kind === "voice" && (context.bookingStatus.toLowerCase() === "used" || Boolean(context.scheduledDate))) throw new Error("This interview has already been scheduled.");
  if (kind === "final" && context.bookingStatus.toLowerCase().includes("scheduled")) throw new Error("This interview has already been scheduled.");
  const matchingSlotIndex = slotsData.rows.findIndex((row) => field(row, "Slot_ID", "Slot ID") === cleanSlotId);
  if (matchingSlotIndex < 0) throw new Error("The selected interview slot is no longer available.");
  const matchingSlot = slotsData.rows[matchingSlotIndex];
  if (field(matchingSlot, "Status").toLowerCase() !== "available" || field(matchingSlot, "Interview_Type", "Interview Type") !== bookingKindValue(kind) || field(matchingSlot, "Role_ID", "Role ID").toLowerCase() !== context.roleId.toLowerCase()) throw new Error("The selected interview slot is no longer available.");

  const now = new Date().toISOString();
  const slotRow = slotsData.rowNumbers[matchingSlotIndex];
  const applicantIndex = applicantData.rows.findIndex((row) => field(row, "Application ID", "Application_ID") === context.applicationId);
  if (applicantIndex < 0) throw new Error("Applicant record not found.");
  const applicantRow = applicantData.rowNumbers[applicantIndex];
  const updates: CellUpdate[] = [
    { tab: "Interview_Slots", row: slotRow, header: "Status", value: "Booked" },
    { tab: "Interview_Slots", row: slotRow, header: "Application_ID", value: context.applicationId },
    { tab: "Interview_Slots", row: slotRow, header: "Candidate_Name", value: context.candidateName },
    { tab: "Interview_Slots", row: slotRow, header: "Candidate_Email", value: context.email },
    { tab: "Interview_Slots", row: slotRow, header: "Booked_At", value: now },
    { tab: "Interview_Slots", row: slotRow, header: "Last_Updated", value: now },
  ];
  if (kind === "voice") {
    updates.push(
      { tab: "High_Match_Profile", row: applicantRow, header: "Status 2 (Voice Interview)", value: "Scheduled" },
      { tab: "High_Match_Profile", row: applicantRow, header: "Final_Status", value: "AI Voice Interview Scheduled" },
      { tab: "High_Match_Profile", row: applicantRow, header: "Voice_Interview_Booking_Status", value: "Booked" },
      { tab: "High_Match_Profile", row: applicantRow, header: "Booking_Token_Status", value: "Used" },
      { tab: "High_Match_Profile", row: applicantRow, header: "Voice_Interview_Scheduled_Date", value: field(matchingSlot, "Date") },
      { tab: "High_Match_Profile", row: applicantRow, header: "Voice_Interview_Scheduled_Time", value: field(matchingSlot, "Start_Time", "Start Time") },
      { tab: "High_Match_Profile", row: applicantRow, header: "Voice_Interview_Timezone", value: field(matchingSlot, "Timezone", "Time Zone") },
      { tab: "High_Match_Profile", row: applicantRow, header: "Booking_Completed_At", value: now },
      { tab: "High_Match_Profile", row: applicantRow, header: "Last_Updated", value: now },
    );
    // The AI calling workflow (n8n "AI Voice Interview Scheduled Calling")
    // reads scheduled calls from Voice_Call_Queue, not from High_Match_Profile
    // directly. Only the legacy n8n-hosted booking API used to write this row;
    // the portal's own booking route must enqueue it too, or a booking made
    // here never results in an actual call.
    const applicantRecord = applicantData.rows[applicantIndex];
    const queueData = await readSheet("Voice_Call_Queue", "X");
    const queueValues = queueData.headers.map((header) => {
      const key = normalize(header);
      if (key === normalize("Application_ID")) return context.applicationId;
      if (key === normalize("Voice_Interview_Scheduled_Date")) return field(matchingSlot, "Date");
      if (key === normalize("Voice_Interview_Scheduled_Time")) return field(matchingSlot, "Start_Time", "Start Time");
      if (key === normalize("Voice_Interview_Timezone")) return field(matchingSlot, "Timezone", "Time Zone");
      if (key === normalize("Applicant_Country")) return field(applicantRecord, "Applicant_Country");
      if (key === normalize("Contact_Number")) return field(applicantRecord, "Contact Number", "Contact_Number");
      if (key === normalize("Role_ID")) return context.roleId;
      if (key === normalize("Voice_Call_Status")) return "Scheduled";
      if (key === normalize("Voice_Call_Attempts")) return "0";
      if (key === normalize("Voice_Call_Max_Attempts")) return "1";
      if (key === normalize("Last_Updated")) return now;
      return "";
    });
    await appendRows("Voice_Call_Queue", [queueValues]);
  } else {
    updates.push(
      { tab: "High_Match_Profile", row: applicantRow, header: "Status 3 (Final Interview)", value: "Interview Scheduled" },
      { tab: "High_Match_Profile", row: applicantRow, header: "Final_Status", value: "Final Interview Scheduled" },
      { tab: "High_Match_Profile", row: applicantRow, header: "Last_Updated", value: now },
    );
  }
  await updateCells(updates);

  if (kind === "final") {
    // Best-effort: put the event on the HOD's own connected Google Calendar.
    // The role's requester is treated as the HOD for calendar purposes (the
    // person who submits a role request is the HOD or authorized requester
    // per the recruitment workflow). A HOD who hasn't connected their
    // calendar yet, or a transient Calendar API error, must never fail the
    // candidate's booking — this runs after updateCells and only logs.
    try {
      const role = await getRoleRequestById(context.roleId);
      const hodEmail = role?.requesterEmail?.trim();
      if (hodEmail) {
        const result = await createFinalInterviewEvent({
          hodEmail,
          summary: `Final Interview: ${context.candidateName} — ${context.selectedRole}`,
          description: `Final interview for ${context.candidateName} (${context.applicationId}) applying for ${context.selectedRole}.\n\nCandidate email: ${context.email}`,
          date: field(matchingSlot, "Date"),
          startTime: field(matchingSlot, "Start_Time", "Start Time"),
          endTime: field(matchingSlot, "End_Time", "End Time"),
          timezone: field(matchingSlot, "Timezone", "Time Zone"),
          attendeeEmails: [context.email],
        });
        if (result.created) console.log("[Final Interview Calendar] Event created:", result.htmlLink);
        else console.log("[Final Interview Calendar] Not created:", result.reason, "error" in result ? result.error : "");
      } else {
        console.log("[Final Interview Calendar] No requester email found for role:", context.roleId);
      }
    } catch (error) {
      console.error("[Final Interview Calendar] Unexpected failure:", error);
    }
  }

  return { ...context, bookingStatus: kind === "voice" ? "Scheduled" : "Interview Scheduled", scheduledDate: field(matchingSlot, "Date"), scheduledTime: field(matchingSlot, "Start_Time", "Start Time"), timezone: field(matchingSlot, "Timezone", "Time Zone"), slots: [] };
}

export async function createInterviewSlot(input: CreateInterviewSlotInput) {
  const roleId = text(input.roleId);
  const date = text(input.date);
  const startTime = text(input.startTime);
  const endTime = text(input.endTime);
  const timezone = text(input.timezone) || "Asia/Singapore";
  if (!roleId || !date || !startTime || !endTime) throw new Error("Role, date, start time, and end time are required.");
  if (input.interviewType !== "AI Voice Interview" && input.interviewType !== "Final Interview") throw new Error("Choose a valid interview type.");
  if (Number.isNaN(Date.parse(`${date}T${startTime}:00`)) || Number.isNaN(Date.parse(`${date}T${endTime}:00`)) || startTime >= endTime) throw new Error("Choose a valid interview time range.");
  const data = await readSheet("Interview_Slots", "P");
  const duplicate = data.rows.some((row) => field(row, "Interview_Type", "Interview Type") === input.interviewType && field(row, "Role_ID", "Role ID").toLowerCase() === roleId.toLowerCase() && field(row, "Date") === date && field(row, "Start_Time", "Start Time") === startTime);
  if (duplicate) throw new Error("This role already has the same interview slot.");
  const slotId = `SLOT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const values = data.headers.map((header) => {
    const key = normalize(header);
    if (key === normalize("Slot_ID")) return slotId;
    if (key === normalize("Interview_Type")) return input.interviewType;
    if (key === normalize("Role_ID")) return roleId;
    if (key === normalize("Date")) return date;
    if (key === normalize("Start_Time")) return startTime;
    if (key === normalize("End_Time")) return endTime;
    if (key === normalize("Timezone")) return timezone;
    if (key === normalize("Status")) return "Available";
    if (key === normalize("Last_Updated")) return new Date().toISOString();
    return "";
  });
  await sheets.spreadsheets.values.append({ spreadsheetId, range: "'Interview_Slots'!A1", valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS", requestBody: { values: [values] } });
  return { slotId, interviewType: input.interviewType, roleId, date, startTime, endTime, timezone, status: "Available", applicationId: "", candidateName: "", candidateEmail: "", bookedAt: "", lastUpdated: new Date().toISOString() };
}

/**
 * The n8n workflows own candidate email and booking links for the resume and
 * voice stages. Their pollers claim work by writing the same columns this
 * function used to set, so writing them here fought the workflows:
 *
 * - Voice stage: setting `Voice_Approval_Processed` to "Yes" on approval left
 *   Phase 5's filter (which only proceeds while that flag is blank/pending/error)
 *   permanently unsatisfied, so the final-interview email was never sent.
 * - Resume stage: the booking token and link written here were immediately
 *   overwritten by Phase 2, leaving a discarded token and a stale link.
 *
 * The portal therefore records the HR decision and the human-facing status only.
 * `Final_Status` is safe to write because neither workflow gates on it, and it
 * gives HR immediate feedback before the next poll runs.
 *
 * The final stage has no active n8n owner (Phase 6 is not in production), so the
 * portal still records that outcome itself.
 */
export async function recordApplicantDecision(applicationId: string, stage: ApplicantDecisionStage, decision: ApplicantDecision, reviewer: { name: string; email: string }, comments: string) {
  const data = await readSheet("High_Match_Profile", "BH");
  const found = findApplicant(data, applicationId);
  if (!found) throw new Error("Applicant not found.");
  const now = new Date().toISOString();
  const previousFinalStatus = field(found.row, "Final_Status");
  const set = (header: string, value: string): CellUpdate => ({ tab: "High_Match_Profile", row: found.rowNumber, header, value });
  const updates: CellUpdate[] = [set("Last_Updated", now)];
  let newFinalStatus = previousFinalStatus;
  if (stage === "resume") {
    if (decision === "Manual Review") {
      newFinalStatus = "Pending Manual Review";
      updates.push(set("Resume_HR_Comments", comments), set("Final_Status", newFinalStatus));
    } else {
      newFinalStatus = decision === "Approve" ? "Approved for AI Voice Interview" : "Resume Rejected";
      updates.push(set("Resume_HR_Decision", decision), set("Resume_HR_Decision_Date", now), set("Resume_HR_Reviewer", reviewer.name), set("Resume_HR_Comments", comments), set("Final_Status", newFinalStatus));
    }
  } else if (stage === "voice") {
    if (decision === "Manual Review") {
      newFinalStatus = "Pending Manual Review";
      updates.push(set("Voice_HR_Comments", comments), set("Final_Status", newFinalStatus));
    } else {
      newFinalStatus = decision === "Approve" ? "Approved for Final Interview" : "Voice Interview Rejected";
      updates.push(set("Voice_HR_Decision", decision), set("Voice_HR_Comments", comments), set("Final_Status", newFinalStatus));
    }
  } else {
    if (decision === "Manual Review") {
      newFinalStatus = "Pending Manual Review";
      updates.push(set("Final_Status", newFinalStatus));
    } else {
      newFinalStatus = decision === "Approve" ? "Final Interview Passed" : "Final Interview Rejected";
      updates.push(set("Status 3 (Final Interview)", "Interview Completed"), set("Final_Status", newFinalStatus));
      await upsertFinalTracking(found.row, applicationId, decision, reviewer, now);
    }
  }
  await updateCells(updates);
  const historyEntry = buildCandidateStatusHistoryEntry({
    applicationId,
    roleId: field(found.row, "Role_ID", "Role ID"),
    changedAt: now,
    previousStatus: previousFinalStatus,
    newStatus: newFinalStatus || previousFinalStatus,
    stage,
    action: decision,
    changedByName: reviewer.name,
    changedByEmail: reviewer.email,
    comments,
    rejectionReason: decision === "Reject" ? comments : "",
    actionSource: "Applicant Review Portal",
  });
  await appendRows("Candidate_Status_History", [candidateHistoryValues(historyEntry)]);
  return { decision, stage };
}

async function upsertFinalTracking(applicant: Row, applicationId: string, decision: ApplicantDecision, reviewer: { name: string; email: string }, now: string) {
  const data = await readSheet("Final_Interview_Tracking", "AE");
  const existingIndex = data.rows.findIndex((row) => field(row, "Application_ID", "Application ID") === applicationId);
  const values = data.headers.map((header) => {
    const key = normalize(header);
    if (key === normalize("Application_ID")) return applicationId;
    if (key === normalize("Candidate_Name")) return field(applicant, "Candidate Name");
    if (key === normalize("Candidate_Email")) return field(applicant, "Email");
    if (key === normalize("Contact_Number")) return field(applicant, "Contact Number");
    if (key === normalize("Role_ID")) return field(applicant, "Role_ID");
    if (key === normalize("Selected_Role")) return field(applicant, "Selected Role");
    if (key === normalize("Department")) return field(applicant, "Department");
    if (key === normalize("Match_Score")) return field(applicant, "Match Score");
    if (key === normalize("Voice_Interview_Score")) return field(applicant, "Voice Score");
    if (key === normalize("Voice_Interview_Summary")) return field(applicant, "AI Voice Summary");
    if (key === normalize("HR_Decision")) return decision;
    if (key === normalize("Final_Recommendation")) return decision === "Approve" ? "Passed" : "Rejected";
    if (key === normalize("Last_Updated")) return now;
    if (key === normalize("Interviewer_Name")) return reviewer.name;
    if (key === normalize("Interviewer_Email")) return reviewer.email;
    return "";
  });
  if (existingIndex >= 0) {
    const rowNumber = data.rowNumbers[existingIndex];
    await sheets.spreadsheets.values.update({ spreadsheetId, range: `'Final_Interview_Tracking'!A${rowNumber}:${columnName(data.headers.length - 1)}${rowNumber}`, valueInputOption: "USER_ENTERED", requestBody: { values: [values] } });
  } else {
    await sheets.spreadsheets.values.append({ spreadsheetId, range: "'Final_Interview_Tracking'!A1", valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS", requestBody: { values: [values] } });
  }
}
