import { google } from "googleapis";
import { cachedSheetsRead } from "@/lib/sheets-cache";

export {
  getCandidateStatusHistory,
  type CandidateStatusHistoryEntry,
} from "./applicant-workflow";

const spreadsheetId = process.env.GOOGLE_CANDIDATE_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");

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
  resumeStatus: string;
  voiceStatus: string;
  finalInterviewStatus: string;
  finalStatus: string;
  currentStage: string;
  nextAction: string;
};

export type ApplicantDetails = ApplicantSummary & {
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
  voiceDecision: string;
  voiceScore: string;
  voiceRecommendation: string;
  voiceSummary: string;
  voiceConcerns: string;
  voiceTranscript: string;
  voiceScheduledDate: string;
  voiceScheduledTime: string;
  voiceBookingStatus: string;
  voiceBookingLink: string;
  bookingTokenStatus: string;
  bookingTokenExpiresAt: string;
  finalBookingLink: string;
  finalBookingTokenExpiresAt: string;
  lastUpdated: string;
  voiceInterviewResult?: Record<string, string>;
  voiceCallLog?: Record<string, string>;
  finalInterview?: Record<string, string>;
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

async function readTab(tabName: string, endColumn: string): Promise<{ headers: string[]; rows: SheetRow[] }> {
  const escapedTabName = tabName.replace(/'/g, "''");
  const values = await cachedSheetsRead(`${tabName}:${endColumn}:${spreadsheetId}`, async () => {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${escapedTabName}'!A1:${endColumn}`,
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

function stageFor(record: SheetRow) {
  return field(record, "Final_Status") ||
    field(record, "Status 3 (Final Interview)") ||
    field(record, "Status 2 (Voice Interview)") ||
    field(record, "Status (Resume Processing)") ||
    "Submitted";
}

function nextActionFor(record: SheetRow) {
  const finalStatus = field(record, "Final_Status").toLowerCase();
  const voiceStatus = field(record, "Status 2 (Voice Interview)").toLowerCase();
  const voiceDecision = field(record, "Voice_HR_Decision").toLowerCase();
  const finalInterviewStatus = field(record, "Status 3 (Final Interview)").toLowerCase();

  if (finalStatus.includes("approved for ai voice") || voiceStatus === "awaiting schedule") return "Schedule Voice Interview";
  if (voiceStatus === "scheduled" || finalStatus.includes("voice interview scheduled")) return "Complete Voice Interview";
  if (voiceStatus === "interviewed" && voiceDecision === "pending") return "Review Voice Interview";
  if (finalStatus.includes("approved for final") || finalInterviewStatus === "awaiting schedule") return "Schedule Final Interview";
  if (finalInterviewStatus.includes("scheduled") || finalStatus.includes("final interview scheduled")) return "Prepare Final Interview";
  return "Review Application";
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
    recommendation: field(record, "Recommendation"),
    resumeStatus: field(record, "Status (Resume Processing)"),
    voiceStatus,
    finalInterviewStatus,
    finalStatus,
    currentStage: stageFor(record),
    nextAction: nextActionFor(record),
  };
}

function calendarDate(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function calculateApplicantMetrics(rows: SheetRow[], now = new Date(), timeZone = process.env.PORTAL_TIMEZONE || "Asia/Singapore"): ApplicantMetrics {
  const today = calendarDate(now.toISOString(), timeZone);
  return rows.reduce<ApplicantMetrics>((result, record) => {
    const finalStatus = field(record, "Final_Status").toLowerCase();
    const resumeStatus = field(record, "Status (Resume Processing)").toLowerCase();
    const resumeDecision = field(record, "Resume_HR_Decision").toLowerCase();
    const voiceStatus = field(record, "Status 2 (Voice Interview)").toLowerCase();
    const voiceDecision = field(record, "Voice_HR_Decision").toLowerCase();
    const finalInterviewStatus = field(record, "Status 3 (Final Interview)").toLowerCase();
    const rejected = [finalStatus, resumeDecision, voiceDecision].some((value) => value.includes("reject"));
    const resumeApproved = resumeDecision === "approve";
    const voiceBookingPending = finalStatus.includes("approved for ai voice") && voiceStatus === "awaiting schedule";
    const voiceScheduled = voiceStatus === "scheduled";
    const voiceReviewPending = (voiceStatus === "interviewed" || voiceStatus === "completed") && (voiceDecision === "pending" || voiceDecision === "");
    const approvedForFinal = finalStatus.includes("approved for final") || finalStatus.includes("final interview booking link sent");
    const finalScheduled = finalInterviewStatus.includes("scheduled");
    const passedFinalInterview = [finalStatus, finalInterviewStatus].some((value) => value.includes("passed final") || value.includes("final interview passed") || value === "passed" || value.includes("hired"));
    const finalDecisionPending = finalInterviewStatus === "interview completed" && !passedFinalInterview && !rejected;

    result.total += 1;
    if (calendarDate(field(record, "Date_of_Application", "Date of Application"), timeZone) === today) result.today += 1;
    if (resumeStatus === "processed") result.screened += 1;
    if (voiceStatus === "interviewed" || voiceStatus === "completed") result.interviewed += 1;
    if (resumeApproved) result.resumeApproved += 1;
    if (voiceBookingPending) result.voiceBookingPending += 1;
    if (voiceScheduled) result.voiceScheduled += 1;
    if (voiceReviewPending) result.voiceReviewPending += 1;
    if (approvedForFinal) result.approvedForFinal += 1;
    if (finalScheduled) result.finalScheduled += 1;
    if (finalDecisionPending) result.finalDecisionPending += 1;
    if (rejected) result.rejected += 1;
    if (passedFinalInterview) result.passedFinalInterview += 1;
    return result;
  }, { total: 0, today: 0, screened: 0, interviewed: 0, resumeApproved: 0, voiceBookingPending: 0, voiceScheduled: 0, voiceReviewPending: 0, approvedForFinal: 0, finalScheduled: 0, finalDecisionPending: 0, rejected: 0, passedFinalInterview: 0 });
}

export async function getApplicants(): Promise<ApplicantSummary[]> {
  const { rows } = await readTab("High_Match_Profile", "BH");
  return rows
    .map(mapApplicant)
    .filter((applicant) => applicant.applicationId !== "")
    .sort((left, right) => Date.parse(right.appliedAt) - Date.parse(left.appliedAt));
}

export async function getApplicantMetrics(): Promise<ApplicantMetrics> {
  const { rows } = await readTab("High_Match_Profile", "BH");
  return calculateApplicantMetrics(rows.filter((record) => applicationId(record) !== ""));
}

export async function getInterviewBookings(): Promise<InterviewBooking[]> {
  const { rows } = await readTab("Interview_Slots", "P");
  return rows.map((record) => ({
    slotId: field(record, "Slot_ID", "Slot ID"),
    interviewType: field(record, "Interview_Type", "Interview Type"),
    roleId: field(record, "Role_ID", "Role ID"),
    date: field(record, "Date"),
    startTime: field(record, "Start_Time", "Start Time"),
    endTime: field(record, "End_Time", "End Time"),
    timezone: field(record, "Timezone", "Time Zone"),
    status: field(record, "Status"),
    applicationId: field(record, "Application_ID", "Application ID"),
    candidateName: field(record, "Candidate_Name", "Candidate Name"),
    candidateEmail: field(record, "Candidate_Email", "Candidate Email"),
    bookedAt: field(record, "Booked_At", "Booked At"),
    lastUpdated: field(record, "Last_Updated", "Last Updated"),
  })).filter((booking) => booking.slotId).sort((left, right) => `${left.date} ${left.startTime}`.localeCompare(`${right.date} ${right.startTime}`));
}

export async function getApplicantById(id: string): Promise<ApplicantDetails | null> {
  const [{ rows: applicantRows }, { rows: voiceResults }, { rows: callLogs }, { rows: finalInterviews }, { rows: slots }] = await Promise.all([
    readTab("High_Match_Profile", "BH"),
    readTab("Voice_Interview_Results", "AF"),
    readTab("Voice_Call_Logs", "AD"),
    readTab("Final_Interview_Tracking", "AE"),
    readTab("Interview_Slots", "P"),
  ]);
  const normalizedId = text(id).toLowerCase();
  const record = applicantRows.find((row) => applicationId(row).toLowerCase() === normalizedId);
  if (!record) return null;

  const summary = mapApplicant(record);
  const related = (rows: SheetRow[]) => rows.find((row) => applicationId(row).toLowerCase() === normalizedId);
  const voiceResult = related(voiceResults);
  const callLog = related(callLogs);
  const finalInterview = related(finalInterviews);
  const interviewSlot = related(slots);

  return {
    ...summary,
    aiAnalysisSummary: field(record, "AI_Analysis_Summary", "AI Analysis Summary"),
    interviewQuestions: field(record, "Interview_Questions", "Interview Questions"),
    resumeText: field(record, "Resume_CV", "Resume/CV", "Resume Text"),
    resumeFileId: field(record, "Resume_File_Id"),
    resumeFileName: field(record, "Resume_File_Name"),
    resumeFileMimeType: field(record, "Resume_File_Mime_Type"),
    resumeFileExpiresAt: field(record, "Resume_File_Expires_At"),
    strengths: field(record, "Strengths"),
    gaps: field(record, "Gaps"),
    resumeDecision: field(record, "Resume_HR_Decision"),
    resumeDecisionDate: field(record, "Resume_HR_Decision_Date"),
    resumeReviewer: field(record, "Resume_HR_Reviewer"),
    voiceDecision: field(record, "Voice_HR_Decision"),
    voiceScore: field(voiceResult ?? {}, "Voice_Score", "Voice Score"),
    voiceRecommendation: field(voiceResult ?? {}, "Voice_Recommendation", "Voice Recommendation"),
    voiceSummary: field(voiceResult ?? {}, "AI_Voice_Summary", "AI Voice Summary"),
    voiceConcerns: field(voiceResult ?? {}, "Voice_Concerns", "Voice Concerns"),
    voiceTranscript: field(voiceResult ?? {}, "Transcript", "Voice_Transcript", "Call_Transcript") || field(callLog ?? {}, "Transcript", "Voice_Transcript", "Call_Transcript"),
    voiceScheduledDate: field(record, "Voice_Interview_Scheduled_Date"),
    voiceScheduledTime: field(record, "Voice_Interview_Scheduled_Time"),
    voiceBookingStatus: field(record, "Voice_Interview_Booking_Status"),
    voiceBookingLink: field(record, "Voice_Interview_Booking_Link"),
    bookingTokenStatus: field(record, "Booking_Token_Status"),
    bookingTokenExpiresAt: field(record, "Booking_Token_Expires_At"),
    finalBookingLink: field(record, "Final_Interview_Booking_Link"),
    finalBookingTokenExpiresAt: field(record, "Final_Interview_Booking_Token_Expires_At"),
    lastUpdated: field(record, "Last_Updated"),
    voiceInterviewResult: voiceResult,
    voiceCallLog: callLog,
    finalInterview,
    interviewSlot,
  };
}

export function applicantStageClass(stage: string) {
  return `applicant-stage applicant-stage-${stage.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
