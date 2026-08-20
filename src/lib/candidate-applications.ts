import { google } from "googleapis";
import { getGoogleServiceAccountPrivateKey } from "@/lib/google-service-account";
import { cachedSheetsRead } from "@/lib/sheets-cache";
import { demoActiveBookingLinkRoleIds, demoApplicantRows, demoInterviewBookings } from "@/lib/demo-data";
import { isDemoMode, isDemoWindowRecord } from "@/lib/demo-mode";
import { getRoleRequestById, type RoleRequestDetails } from "@/lib/google-sheets";
import { evaluationFieldsForSetup, type EvaluationField } from "@/lib/recruitment-setup-schema";

export {
  getCandidateStatusHistory,
  syncPastAvailableInterviewSlots,
  syncPastBookedInterviewsNoShow,
  type CandidateStatusHistoryEntry,
} from "./applicant-workflow";

const spreadsheetId = process.env.GOOGLE_CANDIDATE_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const privateKey = getGoogleServiceAccountPrivateKey();

if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
  throw new Error("Candidate spreadsheet access is not configured.");
}

const auth = new google.auth.JWT({
  email: serviceAccountEmail,
  key: privateKey,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

export type ApplicantSummary = {
  applicationId: string;
  candidateName: string;
  email: string;
  contactNumber: string;
  roleId: string;
  selectedRole: string;
  department: string;
  appliedAt: string;
  matchScore: string;
  recommendation: string;
  cvRecommendation: string;
  resumeStatus: string;
  voiceStatus: string;
  finalInterviewStatus: string;
  finalStatus: string;
  currentStage: string;
  nextAction: string;
};

export type ApplicantDetails = ApplicantSummary & {
  roleDetails?: RoleRequestDetails;
  aiAnalysisSummary: string;
  interviewQuestions: string;
  resumeText: string;
  resumeFileId: string;
  resumeFileName: string;
  resumeFileMimeType: string;
  resumeFileExpiresAt: string;
  strengths: string;
  gaps: string;
  resumeDecision: string;
  resumeDecisionDate: string;
  resumeReviewer: string;
  resumeComments: string;
  resumeEvaluationFields: { key: string; label: string; value: string }[];
  voiceDecision: string;
  voiceComments: string;
  voiceScore: string;
  voiceRecommendation: string;
  voiceSummary: string;
  voiceStrengths: string;
  voiceConcerns: string;
  voiceCommunicationQuality: string;
  voiceAnswerCompleteness: string;
  voiceFollowUpQuestions: string;
  voiceEvaluationFields: { key: string; label: string; value: string }[];
  voiceTranscript: string;
  voiceScheduledDate: string;
  voiceScheduledTime: string;
  voiceBookingStatus: string;
  voiceBookingLink: string;
  bookingTokenStatus: string;
  bookingTokenExpiresAt: string;
  finalBookingStatus: string;
  finalScheduledDate: string;
  finalScheduledTime: string;
  finalTimezone: string;
  finalBookingLink: string;
  finalBookingTokenExpiresAt: string;
  finalComments: string;
  lastUpdated: string;
  voiceInterviewResult?: Record<string, string>;
  voiceCallLog?: Record<string, string>;
  finalInterview?: Record<string, string>;
  voiceInterviewSlot?: Record<string, string>;
  finalInterviewSlot?: Record<string, string>;
  interviewSlot?: Record<string, string>;
};

export type ApplicantMetrics = {
  total: number;
  today: number;
  screened: number;
  interviewed: number;
  resumeApproved: number;
  voiceBookingPending: number;
  voiceScheduled: number;
  voiceReviewPending: number;
  approvedForFinal: number;
  finalScheduled: number;
  finalDecisionPending: number;
  rejected: number;
  passedFinalInterview: number;
  /** One current stage per applicant; these values always reconcile to total. */
  stageCounts: ApplicantStageCount[];
};

export type ApplicantStageCount = {
  key: string;
  label: string;
  tone: "blue" | "purple" | "green" | "teal" | "orange" | "red" | "gray";
  value: number;
};

export type InterviewBooking = {
  slotId: string;
  interviewType: string;
  roleId: string;
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
  status: string;
  applicationId: string;
  candidateName: string;
  candidateEmail: string;
  bookedAt: string;
  lastUpdated: string;
  calendarEventId: string;
  calendarEventLink: string;
  calendarEventStatus: string;
  calendarEventError: string;
};

export type BulkResumeQueueItem = {
  driveFileId: string;
  driveFileName: string;
  driveFileUrl: string;
  roleId: string;
  candidateName: string;
  candidateEmail: string;
  status: string;
  applicationId: string;
  errorMessage: string;
  discoveredAt: string;
  processingStartedAt: string;
  processedAt: string;
  attemptCount: string;
  lastUpdated: string;
};

type SheetRow = Record<string, string>;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeHeader(value: unknown) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function toRecord(headers: unknown[], row: unknown[]): SheetRow {
  return Object.fromEntries(headers.map((header, index) => {
    const key = normalizeHeader(header);
    return [key, text(row[index])];
  }).filter(([key]) => Boolean(key)));
}

function field(record: SheetRow, ...names: string[]) {
  for (const name of names) {
    const key = normalizeHeader(name);
    if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
  }
  return "";
}

function configuredEvaluationValues(
  fields: EvaluationField[],
  result: SheetRow | undefined,
  fallback: SheetRow | undefined,
) {
  return fields
    .filter((configured) => !["score", "recommendation", "strengths", "concerns"].includes(configured.key))
    .map((configured) => {
      const value = field(result || {}, configured.key, configured.label)
        || field(fallback || {}, configured.key, configured.label);
      return { key: configured.key, label: configured.label, value: value || "Not provided." };
    });
}

async function readTab(tabName: string, endColumn: string): Promise<{ headers: string[]; rows: SheetRow[] }> {
  const escapedTabName = tabName.replace(/'/g, "''");
  const values = await cachedSheetsRead(`${tabName}:${endColumn}:${spreadsheetId}`, async () => {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      // Google Sheets rejects mixed open-ended ranges such as A1:R. Use
      // whole-column notation so newly appended queue rows are included.
      range: `'${escapedTabName}'!A:${endColumn}`,
    });
    return response.data.values ?? [];
  });
  const headers = (values[0] ?? []).map((value) => text(value));
  const rows = values.slice(1)
    .filter((row) => row.some((value) => text(value) !== ""))
    .map((row) => toRecord(headers, row));
  return { headers, rows };
}

function applicationId(record: SheetRow) {
  return field(record, "Application_ID", "Application ID");
}

/** Keep legacy sheet/status keys intact while presenting the new HR-facing label. */
function displayHrInterviewText(value: string) {
  return value.replace(/final interview/gi, "HR Interview").replace(/final-interview/gi, "HR-interview");
}

function stageFor(record: SheetRow) {
  const stages = [
    field(record, "Final_Status"),
    field(record, "Status 3 (Final Interview)"),
    field(record, "Status 2 (Voice Interview)"),
    field(record, "Status (Resume Processing)"),
  ];
  // New rows carry Pending placeholders for later interview stages. Do not
  // let those defaults hide the completed resume handoff from HR.
  // New or unprocessed applications are waiting for the first HR review; do
  // not expose a separate "Submitted" bucket in the applicant pipeline.
  const stage = stages.find((value) => !["", "pending", "not started", "submitted"].includes(value.trim().toLowerCase())) || "Pending HR Review";
  return ["processed", "for hr review"].includes(stage.trim().toLowerCase()) ? "Pending HR Review" : stage;
}

function nextActionFor(record: SheetRow) {
  const finalStatus = field(record, "Final_Status").toLowerCase();
  const voiceStatus = field(record, "Status 2 (Voice Interview)").toLowerCase();
  const voiceDecision = field(record, "Voice_HR_Decision").toLowerCase();
  const finalInterviewStatus = field(record, "Status 3 (Final Interview)").toLowerCase();

  if (voiceStatus.includes("no show") || finalStatus.includes("voice interview no show")) return "Reschedule Voice Interview";
  if (finalInterviewStatus.includes("no show") || finalStatus.includes("final interview no show")) return "Reschedule Final Interview";
  if (finalStatus.includes("approved for ai voice") || voiceStatus === "awaiting schedule") return "Schedule Voice Interview";
  if (["calling", "initiated", "in progress"].includes(voiceStatus)) return "Voice Interview In Progress";
  if (voiceStatus === "scheduled" || finalStatus.includes("voice interview scheduled")) return "Complete Voice Interview";
  // Attendance is complete before HR makes the pass/reject decision.
  if (["interviewed", "completed"].includes(voiceStatus) && ["pending", ""].includes(voiceDecision)) return "Review Voice Interview";
  const finalStagePending = finalInterviewStatus.includes("awaiting schedule") || finalInterviewStatus.includes("not started") || finalInterviewStatus.includes("pending");
  if (!finalStagePending && (finalInterviewStatus.includes("scheduled") || finalInterviewStatus.includes("booked") || finalStatus.includes("final interview scheduled"))) return "Attend Final Interview";
  if (finalStatus.includes("approved for final") || finalInterviewStatus === "awaiting schedule") return "Schedule Final Interview";
  return "Review Application";
}

function workflowRecommendationFor(record: SheetRow) {
  const currentStage = stageFor(record);
  const normalizedStage = currentStage.toLowerCase();
  const finalStatus = field(record, "Final_Status").toLowerCase();
  const voiceStatus = field(record, "Status 2 (Voice Interview)").toLowerCase();
  const voiceDecision = field(record, "Voice_HR_Decision").toLowerCase();
  const finalInterviewStatus = field(record, "Status 3 (Final Interview)").toLowerCase();

  if (voiceStatus.includes("no show") || finalStatus.includes("voice interview no show")) return "AI Voice Interview No Show";
  if (finalInterviewStatus.includes("no show") || finalStatus.includes("final interview no show")) return "Final Interview No Show";
  if (["calling", "initiated", "in progress"].includes(voiceStatus) || finalStatus.includes("voice interview in progress")) {
    return "AI Voice Interview In Progress";
  }

  // Nothing about the final interview is meaningful until the voice stage is
  // decided. "Status 3 (Final Interview)" starts at "Pending" on every new
  // applicant, which the final-stage branch below reads as "awaiting
  // scheduling" — so a candidate whose voice call had not happened yet was
  // reported as waiting on a final interview. Report the voice stage instead
  // while it is still open; approved and rejected candidates fall through to
  // the final-interview wording as before.
  if (!["approve", "reject"].includes(voiceDecision)) {
    if (voiceStatus === "scheduled") return "AI Voice Interview Scheduled";
    if (voiceStatus === "awaiting schedule" || finalStatus.includes("approved for ai voice")) return "Awaiting AI Voice Interview Schedule";
    if (["interviewed", "completed"].includes(voiceStatus)) return "Voice Interview Awaiting HR Review";
  }

  const finalStagePending = finalInterviewStatus.includes("awaiting schedule") || finalInterviewStatus.includes("not started") || finalInterviewStatus.includes("pending");
  if (!finalStagePending && (finalInterviewStatus.includes("scheduled") || finalInterviewStatus.includes("booked") || finalStatus.includes("final interview scheduled"))) {
    return "Final Interview Scheduled";
  }

  if (finalStagePending || finalStatus.includes("final interview booking link sent") || finalStatus.includes("approved for final")) {
    return "Awaiting Final Interview Scheduling";
  }

  // The summary recommendation must reflect the applicant's current workflow
  // stage. The original CV recommendation is kept separately for the CV panel.
  if (currentStage && currentStage !== "Submitted" && normalizedStage !== "processed") {
    return currentStage;
  }

  return field(record, "Recommendation") || "Pending HR Review";
}

function hasFinalInterviewOutcome(record: SheetRow) {
  const finalStatus = field(record, "Final_Status").toLowerCase();
  const finalInterviewStatus = field(record, "Status 3 (Final Interview)").toLowerCase();
  return [finalStatus, finalInterviewStatus].some((value) =>
    /(final interview (passed|rejected)|interview (completed|passed|rejected)|hired|not selected)/i.test(value),
  );
}

const applicantStageDefinitions: Omit<ApplicantStageCount, "value">[] = [
  { key: "resume_review", label: "Resume HR Review", tone: "blue" },
  { key: "resume_approved", label: "Resume Approved", tone: "blue" },
  { key: "voice_booking_pending", label: "Voice Booking Pending", tone: "purple" },
  { key: "voice_scheduled", label: "Voice Interview Scheduled", tone: "purple" },
  { key: "voice_review_pending", label: "Voice HR Review", tone: "green" },
  { key: "approved_for_final", label: "Approved for HR Interview", tone: "teal" },
  { key: "final_scheduled", label: "HR Interview Scheduled", tone: "orange" },
  { key: "final_decision_pending", label: "HR Decision Pending", tone: "orange" },
  { key: "passed_final", label: "Passed HR Interview", tone: "green" },
  { key: "rejected", label: "Rejected", tone: "red" },
];

function currentApplicantStage(record: SheetRow) {
  const finalStatus = field(record, "Final_Status").toLowerCase();
  const resumeStatus = field(record, "Status (Resume Processing)").toLowerCase();
  const resumeDecision = field(record, "Resume_HR_Decision").toLowerCase();
  const voiceStatus = field(record, "Status 2 (Voice Interview)").toLowerCase();
  const voiceDecision = field(record, "Voice_HR_Decision").toLowerCase();
  const finalInterviewStatus = field(record, "Status 3 (Final Interview)").toLowerCase();

  // Resolve the latest workflow stage first so stale earlier decisions cannot
  // make one applicant appear in multiple terminal buckets.
  if (finalStatus.includes("passed final") || finalStatus.includes("hired") || finalInterviewStatus.includes("passed final") || finalInterviewStatus === "passed") return "passed_final";
  // A few legacy rows used the short `Rejected` value instead of a
  // stage-qualified status. Check this after a passed outcome so a stale
  // rejection cannot override the later HR decision.
  if (finalStatus === "rejected" || finalInterviewStatus === "rejected" || finalStatus.includes("final interview rejected") || finalInterviewStatus.includes("final interview rejected")) return "rejected";
  if (finalInterviewStatus === "interview completed" || finalStatus.includes("final interview completed")) return "final_decision_pending";
  if (finalInterviewStatus.includes("scheduled") || finalStatus.includes("final interview scheduled")) return "final_scheduled";
  if (finalStatus.includes("approved for final") || finalStatus.includes("final interview booking link sent") || finalInterviewStatus.includes("awaiting schedule")) return "approved_for_final";
  if (voiceDecision.includes("reject") || finalStatus.includes("voice interview rejected")) return "rejected";
  if (voiceStatus === "interviewed" || voiceStatus === "completed") {
    if (voiceDecision === "approve") return "approved_for_final";
    if (voiceDecision === "pending" || voiceDecision === "") return "voice_review_pending";
  }
  if (voiceStatus === "scheduled" || finalStatus.includes("voice interview scheduled")) return "voice_scheduled";
  if (finalStatus.includes("approved for ai voice") || voiceStatus === "awaiting schedule") return "voice_booking_pending";
  if (resumeDecision.includes("reject") || finalStatus.includes("resume rejected")) return "rejected";
  if (resumeDecision === "approve") return "resume_approved";
  if (["processed", "for hr review", "pending hr review"].includes(resumeStatus) || finalStatus.includes("pending hr review")) return "resume_review";
  // Keep new rows in the reconciled pipeline without introducing a separate
  // Submitted stage that would duplicate the initial HR review queue.
  return "resume_review";
}

function applyFinalBookingState(summary: ApplicantSummary, record: SheetRow, finalSlot?: SheetRow) {
  if (field(finalSlot ?? {}, "Status").toLowerCase() !== "booked" || hasFinalInterviewOutcome(record)) return summary;

  // A booked final slot is the source of truth for scheduling. This protects
  // the profile from stale tracking rows that contain an outcome such as
  // "Passed" before the final interview has happened.
  return {
    ...summary,
    recommendation: "HR Interview Scheduled",
    finalInterviewStatus: "Interview Scheduled",
    finalStatus: "HR Interview Scheduled",
    currentStage: "HR Interview Scheduled",
    nextAction: "Attend HR Interview",
  };
}

function mapApplicant(record: SheetRow): ApplicantSummary {
  const finalStatus = field(record, "Final_Status");
  const voiceStatus = field(record, "Status 2 (Voice Interview)");
  const finalInterviewStatus = field(record, "Status 3 (Final Interview)");
  return {
    applicationId: applicationId(record),
    candidateName: field(record, "Candidate_Name", "Candidate Name", "Name"),
    email: field(record, "Email", "Candidate_Email"),
    contactNumber: field(record, "Contact_Number", "Contact Number", "Phone"),
    roleId: field(record, "Role_ID", "Role ID"),
    selectedRole: field(record, "Selected_Role", "Selected Role", "Role"),
    department: field(record, "Department"),
    appliedAt: field(record, "Date_of_Application", "Date of Application"),
    matchScore: field(record, "Match_Score", "Match Score"),
    recommendation: displayHrInterviewText(workflowRecommendationFor(record)),
    cvRecommendation: field(record, "Recommendation"),
    resumeStatus: field(record, "Status (Resume Processing)"),
    voiceStatus,
    finalInterviewStatus: displayHrInterviewText(finalInterviewStatus),
    finalStatus: displayHrInterviewText(finalStatus),
    currentStage: displayHrInterviewText(stageFor(record)),
    nextAction: displayHrInterviewText(nextActionFor(record)),
  };
}

function calendarDate(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function calculateApplicantMetrics(rows: SheetRow[], now = new Date(), timeZone = process.env.PORTAL_TIMEZONE || "Asia/Singapore"): ApplicantMetrics {
  const today = calendarDate(now.toISOString(), timeZone);
  const stageCounts = applicantStageDefinitions.map((stage) => ({ ...stage, value: 0 }));
  return rows.reduce<ApplicantMetrics>((result, record) => {
    const resumeStatus = field(record, "Status (Resume Processing)").toLowerCase();
    const voiceStatus = field(record, "Status 2 (Voice Interview)").toLowerCase();
    const stage = currentApplicantStage(record);

    result.total += 1;
    if (calendarDate(field(record, "Date_of_Application", "Date of Application"), timeZone) === today) result.today += 1;
    // Treat every completed resume handoff as screened, including the
    // normalized HR-review label used by the bulk and public workflows.
    if (["processed", "for hr review", "pending hr review"].includes(resumeStatus)) result.screened += 1;
    if (voiceStatus === "interviewed" || voiceStatus === "completed") result.interviewed += 1;
    const stageCount = result.stageCounts.find((entry) => entry.key === stage);
    if (stageCount) stageCount.value += 1;
    if (stage === "resume_approved") result.resumeApproved += 1;
    if (stage === "voice_booking_pending") result.voiceBookingPending += 1;
    if (stage === "voice_scheduled") result.voiceScheduled += 1;
    if (stage === "voice_review_pending") result.voiceReviewPending += 1;
    if (stage === "approved_for_final") result.approvedForFinal += 1;
    if (stage === "final_scheduled") result.finalScheduled += 1;
    if (stage === "final_decision_pending") result.finalDecisionPending += 1;
    if (stage === "rejected") result.rejected += 1;
    if (stage === "passed_final") result.passedFinalInterview += 1;
    return result;
  }, { total: 0, today: 0, screened: 0, interviewed: 0, resumeApproved: 0, voiceBookingPending: 0, voiceScheduled: 0, voiceReviewPending: 0, approvedForFinal: 0, finalScheduled: 0, finalDecisionPending: 0, rejected: 0, passedFinalInterview: 0, stageCounts });
}

/**
 * Demo pages use a large synthetic history, but keep records created after the
 * demo cutoff visible so a presenter can submit and review a real test
 * applicant without losing it from the workflow UI.
 */
function withDemoHistory(rows: SheetRow[]): SheetRow[] {
  if (!isDemoMode()) return rows;
  const recentLive = rows.filter((row) => isDemoWindowRecord(field(
    row,
    "Date_of_Application",
    "Date of Application",
    "Applied_At",
    "Applied At",
    "Created_At",
    "Created At",
    "Submitted_At",
    "Submitted At",
  )));
  return [...demoApplicantRows(), ...recentLive];
}

function withDemoBookings(bookings: InterviewBooking[]): InterviewBooking[] {
  if (!isDemoMode()) return bookings;
  const recentLive = bookings.filter((booking) => isDemoWindowRecord(`${booking.date}T${booking.startTime}:00`));
  return [...demoInterviewBookings(), ...recentLive];
}

/**
 * Guards destructive profile edits while demo mode is on. Internal review
 * decisions are intentionally allowed so new test applicants can complete the
 * workflow; booking and contact actions have their own downstream guards.
 */
export async function demoActionBlockReason(targetApplicationId: string): Promise<string | null> {
  if (!isDemoMode()) return null;
  void targetApplicationId;
  return "Demo mode is read-only: applicant emails, calls, bookings, and calendar changes are disabled.";
}

export async function getApplicants(): Promise<ApplicantSummary[]> {
  // No-show maintenance runs in the background. Keep the Applicants page
  // focused on reading the data it needs to render.
  const live = (await readTab("High_Match_Profile", "BH")).rows;
  return withDemoHistory(live)
    .map(mapApplicant)
    .filter((applicant) => applicant.applicationId !== "")
    .sort((left, right) => Date.parse(right.appliedAt) - Date.parse(left.appliedAt));
}

export async function getApplicantMetrics(): Promise<ApplicantMetrics> {
  // The scheduled interview maintenance handles past no-show updates. Keep
  // dashboard metrics read-only so the dashboard does not wait on that work.
  const rows = withDemoHistory((await readTab("High_Match_Profile", "BH")).rows);
  return calculateApplicantMetrics(rows.filter((record) => applicationId(record) !== ""));
}

export async function getInterviewBookings(): Promise<InterviewBooking[]> {
  // Maintenance runs from the server background task. Keep this read-only so
  // the Bookings page is not blocked by several reconciliation sheet reads
  // and writes before it can render.
  const { rows } = await readTab("Interview_Slots", "X");
  const live = rows.map((record) => ({
    slotId: field(record, "Slot_ID", "Slot ID"),
    interviewType: field(record, "Interview_Type", "Interview Type"),
    roleId: field(record, "Role_ID", "Role ID"),
    date: field(record, "Date"),
    startTime: field(record, "Start_Time", "Start Time"),
    endTime: field(record, "End_Time", "End Time"),
    timezone: field(record, "Timezone", "Time Zone"),
    status: field(record, "Status").toLowerCase() === "available" && (() => { const date = field(record, "Date"); const time = field(record, "Start_Time", "Start Time"); const parsed = Date.parse(`${date}T${time || "00:00"}:00`); return Number.isFinite(parsed) && parsed <= Date.now(); })() ? "Expired" : field(record, "Status"),
    applicationId: field(record, "Application_ID", "Application ID"),
    candidateName: field(record, "Candidate_Name", "Candidate Name"),
    candidateEmail: field(record, "Candidate_Email", "Candidate Email"),
    bookedAt: field(record, "Booked_At", "Booked At"),
    lastUpdated: field(record, "Last_Updated", "Last Updated"),
    calendarEventId: field(record, "Google_Calendar_Event_ID"),
    calendarEventLink: field(record, "Google_Calendar_Event_Link"),
    calendarEventStatus: field(record, "Google_Calendar_Event_Status"),
    calendarEventError: field(record, "Google_Calendar_Event_Error"),
  })).filter((booking) => booking.slotId).sort((left, right) => `${left.date} ${left.startTime}`.localeCompare(`${right.date} ${right.startTime}`));
  return withDemoBookings(live);
}

function hasActiveBookingLink(record: SheetRow, kind: "voice" | "final") {
  const token = kind === "voice"
    ? field(record, "Booking_Token") || field(record, "Booking_Token_Hash")
    : field(record, "Final_Interview_Booking_Token") || field(record, "Final_Interview_Booking_Token_Hash");
  if (!token) return false;
  const status = (kind === "voice"
    ? field(record, "Booking_Token_Status")
    : field(record, "Final_Interview_Booking_Token_Status")).toLowerCase();
  if (["used", "booked", "expired", "revoked"].includes(status)) return false;
  const expiresAt = kind === "voice"
    ? field(record, "Booking_Token_Expires_At")
    : field(record, "Final_Interview_Booking_Token_Expires_At");
  const expiryTime = Date.parse(expiresAt);
  return !expiresAt || !Number.isFinite(expiryTime) || expiryTime >= Date.now();
}

/**
 * Candidate booking links are tracked separately from the admin calendar's
 * generated availability. Persisted bookings are still returned separately so
 * completed appointments remain visible even when a link has expired.
 */
export async function getActiveBookingLinkRoleIds() {
  const { rows } = await readTab("High_Match_Profile", "BH");
  const voice = new Set<string>();
  const final = new Set<string>();
  rows.forEach((record) => {
    const roleId = field(record, "Role_ID", "Role ID").trim().toLowerCase();
    if (!roleId) return;
    if (hasActiveBookingLink(record, "voice")) voice.add(roleId);
    if (hasActiveBookingLink(record, "final")) final.add(roleId);
  });
  if (isDemoMode()) {
    const demoIds = demoActiveBookingLinkRoleIds().map((roleId) => roleId.toLowerCase());
    void voice;
    void final;
    return { voice: demoIds, final: demoIds };
  }
  return { voice: [...voice], final: [...final] };
}

export async function getBulkResumeQueue(roleId = ""): Promise<BulkResumeQueueItem[]> {
  const { rows } = await readTab("Bulk_Resume_Queue", "R");
  const normalizedRoleId = roleId.trim().toLowerCase();
  const latestByFile = new Map<string, BulkResumeQueueItem>();
  const eventTimestamp = (item: BulkResumeQueueItem) => {
    const timestamp = Date.parse(item.lastUpdated || item.processedAt || item.processingStartedAt || item.discoveredAt);
    return Number.isFinite(timestamp) ? timestamp : 0;
  };
  rows
    .map((record) => ({
      driveFileId: field(record, "Drive_File_ID", "Drive File ID", "driveFileId"),
      driveFileName: field(record, "Drive_File_Name", "Drive File Name", "driveFileName"),
      driveFileUrl: field(record, "Drive_File_URL", "Drive File URL", "driveFileUrl"),
      roleId: field(record, "Role_ID", "Role ID", "roleId"),
      candidateName: field(record, "Candidate_Name", "Candidate Name", "candidateName"),
      candidateEmail: field(record, "Candidate_Email", "Candidate Email", "candidateEmail"),
      status: field(record, "Status"),
      applicationId: field(record, "Application_ID", "Application ID", "applicationId"),
      errorMessage: field(record, "Error_Message", "Error Message", "errorMessage"),
      discoveredAt: field(record, "Discovered_At", "Discovered At", "discoveredAt"),
      processingStartedAt: field(record, "Processing_Started_At", "Processing Started At", "processingStartedAt"),
      processedAt: field(record, "Processed_At", "Processed At", "processedAt"),
      attemptCount: field(record, "Attempt_Count", "Attempt Count", "attemptCount"),
      lastUpdated: field(record, "Last_Updated", "Last Updated", "lastUpdated"),
    }))
    .filter((item) => item.driveFileId && (!normalizedRoleId || item.roleId.toLowerCase() === normalizedRoleId))
    .forEach((item) => {
      const previous = latestByFile.get(item.driveFileId);
      const itemTime = eventTimestamp(item);
      const previousTime = previous ? eventTimestamp(previous) : Number.NEGATIVE_INFINITY;
      // Queue rows are append-only events. Prefer the most recently timestamped
      // event so a reordered or manually edited sheet cannot make a Screened
      // resume look Queued and send it through AI again.
      if (!previous || (Number.isFinite(itemTime) && (!Number.isFinite(previousTime) || itemTime >= previousTime))) {
        latestByFile.set(item.driveFileId, item);
      }
    });
  return [...latestByFile.values()].sort((left, right) => eventTimestamp(right) - eventTimestamp(left));
}

export async function getApplicantById(id: string): Promise<ApplicantDetails | null> {
  const [{ rows: applicantRows }, { rows: voiceResults }, { rows: callLogs }, { rows: finalInterviews }, { rows: slots }] = await Promise.all([
    readTab("High_Match_Profile", "BH"),
    readTab("Voice_Interview_Results", "AF"),
    readTab("Voice_Call_Logs", "AD"),
    readTab("Final_Interview_Tracking", "AE"),
    readTab("Interview_Slots", "X"),
  ]);
  const normalizedId = text(id).toLowerCase();
  const record = applicantRows.find((row) => applicationId(row).toLowerCase() === normalizedId);
  if (!record) return null;

  const summary = mapApplicant(record);
  // A retry creates a new result/log row for the same applicant. Always use
  // the most recent event; selecting the first row can surface an older
  // no-answer result instead of the completed retry with its transcript.
  const latestRelated = (rows: SheetRow[], timestampFields: string[]) => rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => applicationId(row).toLowerCase() === normalizedId)
    .sort((left, right) => {
      const timestamp = (row: SheetRow) => timestampFields
        .map((fieldName) => field(row, fieldName))
        .map((value) => Date.parse(value))
        .find((value) => !Number.isNaN(value)) ?? Number.NEGATIVE_INFINITY;
      return timestamp(right.row) - timestamp(left.row) || right.index - left.index;
    })
    .at(0)?.row;
  const voiceResult = latestRelated(voiceResults, ["Result_Received_At", "Call_Completed_At", "Last_Updated", "Created_At"]);
  const callLog = latestRelated(callLogs, ["Result_Received_At", "Call_Completed_At", "Last_Updated", "Date"]);
  const finalInterview = latestRelated(finalInterviews, ["Last_Updated", "Booked_At", "Created_At"]);
  const applicantSlots = slots.filter((row) => applicationId(row).toLowerCase() === normalizedId);
  const voiceInterviewSlot = applicantSlots.find((row) => field(row, "Interview_Type", "Interview Type").toLowerCase().includes("voice"));
  const finalInterviewSlot = applicantSlots.find((row) => field(row, "Interview_Type", "Interview Type").toLowerCase().includes("final"));
  const interviewSlot = voiceInterviewSlot || applicantSlots[0];
  const displaySummary = applyFinalBookingState(summary, record, finalInterviewSlot);
  const role = field(record, "Voice_HR_Decision").toLowerCase() === "approve" || voiceResult || callLog
    ? await getRoleRequestById(summary.roleId)
    : null;
  const configuredEvaluationFields = evaluationFieldsForSetup(role?.evaluationFieldToggles, role?.customEvaluationFields);

  return {
    ...displaySummary,
    roleDetails: role || undefined,
    aiAnalysisSummary: field(record, "AI_Analysis_Summary", "AI Analysis Summary"),
    interviewQuestions: field(record, "Interview_Questions", "Interview Questions"),
    resumeText: field(record, "Resume_Text", "Resume_CV", "Resume/CV", "Resume Text"),
    resumeFileId: field(record, "Resume_File_Id"),
    resumeFileName: field(record, "Resume_File_Name"),
    resumeFileMimeType: field(record, "Resume_File_Mime_Type"),
    resumeFileExpiresAt: field(record, "Resume_File_Expires_At"),
    strengths: field(record, "Strengths"),
    gaps: field(record, "Gaps"),
    resumeDecision: field(record, "Resume_HR_Decision"),
    resumeDecisionDate: field(record, "Resume_HR_Decision_Date"),
    resumeReviewer: field(record, "Resume_HR_Reviewer"),
    resumeComments: field(record, "Resume_HR_Comments"),
    resumeEvaluationFields: configuredEvaluationValues(configuredEvaluationFields, record, undefined),
    voiceDecision: field(record, "Voice_HR_Decision"),
    voiceComments: field(record, "Voice_HR_Comments"),
    // Voice_Interview_Results is canonical. The call log is a safe fallback
    // while the result workflow is retrying or when a provider webhook only
    // updated the audit log.
    voiceScore: field(voiceResult ?? {}, "Voice_Score", "Voice Score") || field(callLog ?? {}, "Voice_Score", "Voice Score"),
    voiceRecommendation: field(voiceResult ?? {}, "Voice_Recommendation", "Voice Recommendation") || field(callLog ?? {}, "Voice_Recommendation", "Voice Recommendation"),
    voiceSummary: field(voiceResult ?? {}, "AI_Voice_Summary", "AI Voice Summary") || field(callLog ?? {}, "AI_Voice_Summary", "AI Voice Summary"),
    voiceStrengths: field(voiceResult ?? {}, "Voice_Strengths", "Voice Strengths") || field(callLog ?? {}, "Voice_Strengths", "Voice Strengths"),
    voiceConcerns: field(voiceResult ?? {}, "Voice_Concerns", "Voice Concerns") || field(callLog ?? {}, "Voice_Concerns", "Voice Concerns"),
    voiceCommunicationQuality: field(voiceResult ?? {}, "Communication_Quality", "Communication Quality") || field(callLog ?? {}, "Communication_Quality", "Communication Quality"),
    voiceAnswerCompleteness: field(voiceResult ?? {}, "Answer_Completeness", "Answer Completeness") || field(callLog ?? {}, "Answer_Completeness", "Answer Completeness"),
    voiceFollowUpQuestions: field(voiceResult ?? {}, "Recommended_Follow_Up_Questions", "Recommended Follow Up Questions") || field(callLog ?? {}, "Recommended_Follow_Up_Questions", "Recommended Follow Up Questions"),
    voiceEvaluationFields: configuredEvaluationValues(configuredEvaluationFields, voiceResult, callLog),
    voiceTranscript: field(voiceResult ?? {}, "Transcript", "Voice_Transcript", "Call_Transcript") || field(callLog ?? {}, "Transcript", "Voice_Transcript", "Call_Transcript"),
    voiceScheduledDate: field(record, "Voice_Interview_Scheduled_Date"),
    voiceScheduledTime: field(record, "Voice_Interview_Scheduled_Time"),
    voiceBookingStatus: field(record, "Voice_Interview_Booking_Status"),
    voiceBookingLink: field(record, "Voice_Interview_Booking_Link"),
    bookingTokenStatus: field(record, "Booking_Token_Status"),
    bookingTokenExpiresAt: field(record, "Booking_Token_Expires_At"),
    finalBookingStatus: field(record, "Final_Interview_Booking_Token_Status"),
    finalScheduledDate: field(record, "Final_Interview_Scheduled_Date"),
    finalScheduledTime: field(record, "Final_Interview_Scheduled_Time"),
    finalTimezone: field(record, "Final_Interview_Timezone"),
    finalBookingLink: field(record, "Final_Interview_Booking_Link"),
    finalBookingTokenExpiresAt: field(record, "Final_Interview_Booking_Token_Expires_At"),
    finalComments: field(record, "Final_Interview_Comments", "Final Interview Comments"),
    lastUpdated: field(record, "Last_Updated"),
    voiceInterviewResult: voiceResult,
    voiceCallLog: callLog,
    finalInterview,
    voiceInterviewSlot,
    finalInterviewSlot,
    interviewSlot,
  };
}

export function applicantStageClass(stage: string) {
  return `applicant-stage applicant-stage-${stage.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
