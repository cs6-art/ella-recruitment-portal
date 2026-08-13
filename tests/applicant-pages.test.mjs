import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

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
  assert.match(api, /getApplicantMetrics/);
  assert.match(api, /canReviewRole === true \|\| user\.canApproveRole === true/);
  assert.match(dashboard, /Applicants Today/);
  assert.match(dashboard, /Awaiting Voice Booking Invitation/);
  assert.match(dashboard, /Awaiting Final Booking Invitation/);
  assert.match(dashboard, /Rejected Candidates/);
  assert.match(dashboard, /Passed Final Interview/);
  assert.match(dashboard, /Role Request Actions/);
  assert.match(dashboard, /Pending HR Review/);
  assert.match(dashboard, /Pending Approval/);
});

test("applicant routes are protected and render populated sheet data", () => {
  const list = read("src/app/applicants/page.tsx");
  const screening = read("src/app/resume-screening/page.tsx");
  const detail = read("src/app/applicants/[applicationId]/page.tsx");
  assert.match(list, /verifySessionToken/);
  assert.match(list, /getApplicants/);
  assert.match(list, /role\.status === "Job Posted" && role\.recruitmentSetupStatus === "Published"/);
  assert.match(list, /publishedRoles/);
  assert.match(screening, /CandidateApplicationForm/);
  assert.match(screening, /\/api\/applicants/);
  assert.match(screening, /role\.status === "Job Posted" && role\.recruitmentSetupStatus === "Published"/);
  assert.match(screening, /Resume Screening/);
  assert.match(detail, /verifySessionToken/);
  assert.match(detail, /getApplicantById/);
  assert.match(detail, /getCandidateStatusHistory/);
  assert.match(detail, /latestDecisionComment/);
  assert.match(detail, /const resumeComments = applicant\.resumeComments \|\|/);
  assert.match(detail, /Candidate Status History/);
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
});

test("candidate intake forms and decisions expose the required fields", () => {
  const form = read("src/components/CandidateApplicationForm.tsx");
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

  assert.match(form, /Start a resume screening/);
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
  assert.match(editor, /Save as template/);
  assert.match(editor, /SAVED TEMPLATES/);
  assert.match(editor, /AI SUGGESTIONS/);
  assert.match(editor, /Use suggestion/);
  assert.match(roleDetails, /aiGeneratedScreeningQuestions/);
  assert.match(applicantData, /Resume_HR_Comments/);
  assert.match(applicantData, /Voice_HR_Comments/);
  assert.match(decisionPanel, /<h2>HR Decisions<\/h2>/);
  assert.match(decisionPanel, /reviewStage/);
  assert.match(decisionPanel, /CompletedDecision/);
  assert.match(decisionPanel, /router\.refresh\(\)/);
  assert.match(decisionPanel, /Request Manual Review/);
  assert.match(decisionPanel, /Comments \*/);
  assert.match(decisionPanel, /disabled=\{busy \|\|/);
  assert.match(route, /findDuplicateCandidateApplication/);
  assert.match(route, /canReviewRole !== true/);
  assert.match(route, /source: "HR Manual Intake"/);
  assert.match(route, /role\.status !== "Job Posted"/);
  assert.match(route, /role\.recruitmentSetupStatus !== "Published"/);
  assert.match(publicRoute, /buildCandidateApplicationPayload/);
  assert.match(workflow, /preferredMobile/);
  assert.match(workflow, /jobTitle/);
  assert.match(route, /jobTitle: role\.jobTitle/);
  assert.match(publicRoute, /jobTitle: role\.jobTitle/);
  assert.match(workflow, /applicationSource/);
  assert.match(decisionRoute, /Manual Review/);
  assert.match(decisionRoute, /comments/);
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
  assert.match(resumeFiles, /orphanCutoff/);
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
  assert.match(n8nContract, /portal accepts either pasted resume text or one validated PDF\/DOCX file/);
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
