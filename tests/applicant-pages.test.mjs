import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("portal timestamps use the shared Singapore/Manila timezone", () => {
  const time = read("src/lib/portal-time.ts");
  assert.match(time, /PORTAL_TIME_ZONE = "Asia\/Singapore"/);
  assert.match(time, /timeZone: PORTAL_TIME_ZONE/);
});

test("applicant data reader uses the shared candidate workbook tabs", () => {
  const source = read("src/lib/candidate-applications.ts");
  assert.match(source, /High_Match_Profile/);
  assert.match(source, /Voice_Interview_Results/);
  assert.match(source, /Voice_Call_Logs/);
  assert.match(source, /Final_Interview_Tracking/);
  assert.match(source, /Resume_Text/);
  assert.doesNotMatch(source, /Finance_Resume/);
});

test("dashboard includes candidate pipeline metrics without exposing them to creator-only users", () => {
  const api = read("src/app/api/dashboard/metrics/route.ts");
  const dashboard = read("src/components/DashboardMetrics.tsx");
  const applicantMetrics = read("src/lib/candidate-applications.ts");
  assert.match(api, /getApplicantMetrics/);
  assert.match(api, /canReviewRole === true \|\| user\.canApproveRole === true/);
  assert.match(dashboard, /Pipeline Progress/);
  assert.match(dashboard, /Decision Snapshot/);
  assert.match(dashboard, /Each applicant appears once/);
  assert.match(dashboard, /stageCounts/);
  assert.match(applicantMetrics, /Resume HR Review/);
  assert.match(applicantMetrics, /label: "Rejected"/);
  assert.doesNotMatch(applicantMetrics, /label: "Submitted"/);
  assert.match(applicantMetrics, /Passed HR Interview/);
  assert.match(applicantMetrics, /currentApplicantStage/);
  assert.match(dashboard, /Role Request Actions/);
  assert.match(dashboard, /Pending HR Review/);
  assert.match(dashboard, /Pending Approval/);
});

test("candidate contact side effects stay disabled while workflow processing remains wired", () => {
  const workflow = read("src/lib/applicant-workflow.ts");
  assert.match(workflow, /attendeeEmails: \[\]/);
});

test("resume extraction uses the supported PDF parser entrypoint", () => {
  const resumeFiles = read("src/lib/resume-files.ts");
  const pdfTextParser = read("src/lib/pdf-text-parser.ts");
  assert.match(resumeFiles, /createPdfTextParser/);
  assert.match(pdfTextParser, /requireNodeModule\("@napi-rs\/canvas"\)/);
  assert.match(pdfTextParser, /requireNodeModule\("pdf-parse"\)/);
  assert.match(pdfTextParser, /requireNodeModule\("pdf-parse\/worker"\)/);
  assert.match(pdfTextParser, /PDFParse\.setWorker\(getData\(\)\)/);
  assert.match(pdfTextParser, /"ImageData"/);
  assert.match(pdfTextParser, /"Path2D"/);
  assert.match(resumeFiles, /await parser\.destroy\(\)/);
  assert.doesNotMatch(pdfTextParser, /pdf-parse\/lib\/pdf-parse/);
});

test("applicant routes are protected and render populated sheet data", () => {
  const list = read("src/app/applicants/page.tsx");
  const screening = read("src/app/resume-screening/page.tsx");
  const detail = read("src/app/applicants/[applicationId]/page.tsx");
  assert.match(list, /verifySessionToken/);
  assert.match(list, /getApplicants/);
  assert.match(list, /isPublishedRoleForIntake/);
  assert.match(list, /publishedRoles/);
  assert.match(screening, /CandidateApplicationForm/);
  assert.match(screening, /\/api\/applicants/);
  assert.match(screening, /isPublishedRoleForIntake/);
  assert.match(screening, /Resume Screening/);
  assert.doesNotMatch(screening, /BulkResumeScreeningPanel/);
  assert.match(screening, /Upload from Google Drive/);
  assert.match(screening, /GOOGLE_BULK_RESUME_DRIVE_URL/);
  assert.match(screening, /sort\(\(left, right\) => left\.label\.localeCompare\(right\.label/);
  assert.match(detail, /verifySessionToken/);
  assert.match(detail, /getApplicantById/);
  assert.match(detail, /getCandidateStatusHistory/);
  assert.match(detail, /latestDecisionComment/);
  assert.match(detail, /const resumeComments = applicant\.resumeComments \|\|/);
  assert.match(detail, /Candidate Status History/);
  // Applicant timestamps are rendered in the shared HR operating timezone so
  // UTC values from Sheets never appear shifted in the reviewer UI.
  assert.match(detail, /formatPortalDateTime/);
});

test("applicants are reachable from the reviewer shell and role detail", () => {
  const shell = read("src/components/AppShell.tsx");
  const roleDetails = read("src/components/RoleDetails.tsx");
  const hrReview = read("src/components/HrReview.tsx");
  assert.match(shell, /\/applicants/);
  assert.match(shell, /\/resume-screening/);
  assert.match(roleDetails, /\/applicants/);
  assert.match(roleDetails, /updatedStatus/);
  assert.match(hrReview, /data\.status/);
  assert.match(shell, /Applicants[\s\S]*collapseButton[\s\S]*Bookings/);
  const sidebarTop = shell.match(/className=\{styles\.sidebarTop\}>[\s\S]*?<\/div>/);
  assert.ok(sidebarTop);
  assert.doesNotMatch(sidebarTop[0], /collapseButton/);
  // Applicant detail pages own their back navigation, so the shell toolbar
  // should remain hidden on both the list and detail routes.
  assert.match(shell, /!isDashboard && !isRoleRequestArea && !isApplicantDetail && <div className=\{styles\.pageToolbar\}>[\s\S]*portal-back-button/);
  assert.match(shell, /isRoleRequestArea/);
});

test("user account edits update the original directory row", () => {
  const api = read("src/app/api/user-directory/route.ts");
  const sheets = read("src/lib/google-sheets.ts");
  assert.match(api, /updateDirectoryUser\(normalizedOriginalEmail, normalizedUser\)/);
  assert.doesNotMatch(api, /upsertDirectoryUser\(normalizedUser\);\s*\/\/ Leave the old row inactive/);
  assert.match(sheets, /export async function updateDirectoryUser\(originalEmail: string, user: DirectoryUser\)/);
  assert.match(sheets, /range: `User_Directory!A\$\{rowIndex \+ 2\}:J\$\{rowIndex \+ 2\}`/);
});

test("candidate intake forms and decisions expose the required fields", () => {
  const form = read("src/components/CandidateApplicationForm.tsx");
  const screening = read("src/app/resume-screening/page.tsx");
  const countryOptions = read("src/components/CountryOptions.tsx");
  const editor = read("src/components/RecruitmentSetupEditor.tsx");
  const decisionPanel = read("src/components/ApplicantDecisionPanel.tsx");
  const roleDetails = read("src/components/RoleDetails.tsx");
  const applicantData = read("src/lib/candidate-applications.ts");
  const route = read("src/app/api/applicants/route.ts");
  const publicRoute = read("src/app/api/public/applications/route.ts");
  const workflow = read("src/lib/applicant-workflow.ts");
  const decisionRoute = read("src/app/api/applicants/[applicationId]/decision/route.ts");
  const uploadRoute = read("src/app/api/uploads/resumes/route.ts");
  const downloadRoute = read("src/app/api/uploads/resumes/[fileId]/route.ts");
  const scoreFormat = read("src/lib/score-format.ts");

  assert.match(screening, /title="CV Analysis"/);
  assert.match(form, /countryCode/);
  assert.match(form, /localContactNumber/);
  assert.match(form, /Contact Number/);
  assert.match(countryOptions, /flag: "ph"/);
  assert.match(countryOptions, /\+63/);
  assert.match(countryOptions, /flag: "sg"/);
  assert.match(countryOptions, /\+65/);
  assert.match(countryOptions, /flag: "my"/);
  assert.match(countryOptions, /\+60/);
  assert.doesNotMatch(form, /Roles loaded successfully/);
  assert.doesNotMatch(form, /Preferred mobile/);
  assert.doesNotMatch(form, /Salary expectation/);
  assert.doesNotMatch(form, /Skills assessment/);
  assert.doesNotMatch(form, /Role expectations/);
  assert.match(scoreFormat, /percentage > 100/);
  assert.doesNotMatch(editor, /CALL SCRIPT TEMPLATES/);
  assert.doesNotMatch(editor, /SAVED TEMPLATES/);
  assert.match(editor, /Reset changes/);
  assert.match(editor, /AI SUGGESTIONS/);
  assert.doesNotMatch(editor, /Use suggestion/);
  assert.match(roleDetails, /aiGeneratedScreeningQuestions/);
  assert.match(applicantData, /Resume_HR_Comments/);
  assert.match(applicantData, /Voice_HR_Comments/);
  assert.match(decisionPanel, /<h2>HR Decisions<\/h2>/);
  assert.match(decisionPanel, /reviewStage/);
  assert.match(decisionPanel, /CompletedDecision/);
  assert.match(decisionPanel, /Open HR Interview Booking Link/);
  assert.match(decisionPanel, /link=\{props\.finalBookingLink\}/);
  // Decisions refresh the server-backed detail page so every summary and
  // workflow control reflects the saved state without a hard browser reload.
  assert.match(decisionPanel, /useRouter/);
  assert.match(decisionPanel, /router\.refresh\(\)/);
  assert.doesNotMatch(decisionPanel, /window\.location\.reload\(\)/);
  assert.match(decisionPanel, /Request Manual Review/);
  assert.match(decisionPanel, /Comments \*/);
  assert.match(decisionPanel, /disabled=\{busy \|\|/);
  assert.match(route, /findDuplicateCandidateApplication/);
  assert.match(route, /canReviewRole !== true/);
  assert.match(route, /source: "HR Manual Intake"/);
  assert.match(route, /isPublishedRoleForIntake/);
  assert.match(publicRoute, /buildCandidateApplicationPayload/);
  assert.match(workflow, /evaluationFields/);
  // A stale n8n claim must be released when HR approves so final invitations
  // can be retried instead of remaining indefinitely in Processing.
  assert.match(workflow, /Voice_Approval_Processed/,);
  assert.match(workflow, /updates\.push\(set\("Voice_Approval_Processed", ""\)\)/);
  assert.match(workflow, /preferredMobile/);
  assert.match(workflow, /jobTitle/);
  assert.match(route, /jobTitle: role\.jobTitle/);
  assert.match(publicRoute, /jobTitle: role\.jobTitle/);
  assert.match(workflow, /applicationSource/);
  assert.match(decisionRoute, /Manual Review/);
  assert.match(decisionRoute, /comments/);
  assert.match(decisionRoute, /revalidatePath\(`\/applicants\/\$\{encodeURIComponent\(applicationId\)\}`\)/);
  assert.match(decisionRoute, /revalidatePath\("\/applicants"\)/);
  assert.match(decisionRoute, /revalidatePath\("\/dashboard"\)/);
  assert.match(form, /type="file"/);
  assert.match(form, /\.pdf/);
  assert.match(form, /\.docx/);
  assert.match(uploadRoute, /storeResumeFile/);
  assert.match(downloadRoute, /canReviewRole/);
});

test("resume processing is bounded and standalone uploads require HR review access", () => {
  const uploadRoute = read("src/app/api/uploads/resumes/route.ts");
  const publicRoute = read("src/app/api/public/applications/route.ts");
  const resumeFiles = read("src/lib/resume-files.ts");
  const limiter = read("src/lib/rate-limit.ts");
  const instrumentation = read("src/instrumentation.ts");

  assert.match(uploadRoute, /verifySessionToken/);
  assert.match(uploadRoute, /canReviewRole !== true/);
  assert.match(uploadRoute, /MAX_RESUME_REQUEST_BYTES/);
  assert.match(uploadRoute, /consumeRateLimit/);
  assert.match(publicRoute, /consumeRateLimit/);
  assert.match(publicRoute, /MAX_RESUME_REQUEST_BYTES/);
  assert.match(resumeFiles, /cleanupExpiredResumeFiles/);
  assert.match(resumeFiles, /CLEANUP_INTERVAL_MS/);
  assert.match(resumeFiles, /expiresAt/);
  assert.match(limiter, /MAX_BUCKETS/);
  assert.match(instrumentation, /cleanupExpiredResumeFiles/);
  assert.match(instrumentation, /setInterval/);
});

test("candidate screening contract is role-bound and HR-owned", () => {
  const workflow = read("src/lib/applicant-workflow.ts");
  const n8nContract = read("docs/N8N-CONTRACTS.md");
  assert.match(workflow, /candidate_application_submitted/);
  assert.match(workflow, /Role_ID/);
  assert.match(n8nContract, /role-specific AI screening/);
  assert.match(n8nContract, /For HR Review/);
  assert.match(n8nContract, /portal accepts either pasted resume text or one validated PDF, legacy DOC, or DOCX file/);
  assert.match(n8nContract, /Binary or base64 resume content is\s+never sent/);
});

test("final booking links use the public portal host and final tokens are single-use", () => {
  const workflow = read("src/lib/applicant-workflow.ts");
  const decisionRoute = read("src/app/api/applicants/[applicationId]/decision/route.ts");
  const publicUrl = read("src/lib/public-url.ts");
  assert.match(workflow, /Final_Interview_Booking_Token_Status/);
  assert.match(workflow, /Final_Interview_Booking_Token_Used_At/);
  assert.match(workflow, /bookingLink\(baseUrl, "final", token\)/);
  assert.match(workflow, /Final_Interview_Booking_Token_Hash/);
  assert.match(workflow, /\["used", "booked", "expired", "revoked"\]/);
  assert.match(decisionRoute, /getPublicAppBaseUrl\(request\)/);
  assert.match(publicUrl, /NEXT_PUBLIC_APP_URL/);
  assert.match(publicUrl, /x-forwarded-host/);
});

test("booking links render a branded unavailable page when the token is not valid", () => {
  const bookingPage = read("src/app/book/[kind]/[token]/page.tsx");
  const unavailablePage = read("src/app/book/[kind]/[token]/not-found.tsx");
  assert.match(bookingPage, /if \(!context\) notFound\(\)/);
  assert.match(unavailablePage, /booking link is no longer available/i);
  assert.match(unavailablePage, /already been used, expired, or been replaced/i);
});

test("past booked interviews reconcile to No Show without overwriting completed results", () => {
  const workflow = read("src/lib/applicant-workflow.ts");
  const bookings = read("src/components/BookingsList.tsx");
  const applicantWorkflow = read("src/lib/candidate-applications.ts");
  const bookingSelector = read("src/components/BookingSelector.tsx");
  assert.match(workflow, /syncPastBookedInterviewsNoShow/);
  assert.match(workflow, /Automatically marked No Show/);
  assert.match(workflow, /hasCompletedInterviewResult/);
  assert.match(workflow, /header: "Status", value: "Completed"/);
  assert.match(workflow, /Completed - Awaiting HR Review/);
  assert.match(workflow, /\["booked", "completed", "no show"\]/);
  assert.match(workflow, /Final_Interview_Tracking/);
  assert.match(workflow, /canRescheduleNoShow/);
  assert.match(bookings, /summary-no-show/);
  assert.match(bookings, /summary-completed/);
  assert.match(bookings, /Completed/);
  assert.match(bookings, /statusClass\(booking\.status\)/);
  assert.match(bookings, /No Show/);
  assert.match(applicantWorkflow, /\["interviewed", "completed"\]/);
  assert.match(bookingSelector, /const completed/);
  assert.match(workflow, /syncPastAvailableInterviewSlots/);
  assert.match(workflow, /header: "Status", value: "Expired"/);
  assert.match(bookings, /calendarDisplayBookings/);
  assert.doesNotMatch(bookings, /summary-total/);
  assert.doesNotMatch(bookings, /Candidate slots/);
});

test("high-cost and state-changing APIs apply request throttling", () => {
  const routes = [
    "src/app/api/auth/google/route.ts",
    "src/app/api/roles/route.ts",
    "src/app/api/roles/[roleId]/status/route.ts",
    "src/app/api/roles/[roleId]/recruitment-setup/route.ts",
    "src/app/api/settings/route.ts",
    "src/app/api/bookings/slots/route.ts",
    "src/app/api/bookings/[slotId]/status/route.ts",
    "src/app/api/applicants/[applicationId]/decision/route.ts",
    "src/app/api/recruitment-templates/route.ts",
    "src/app/api/public/bookings/[kind]/[token]/route.ts",
  ];

  for (const route of routes) assert.match(read(route), /consumeRateLimit/);
});
