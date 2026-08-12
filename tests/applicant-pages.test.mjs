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
  const detail = read("src/app/applicants/[applicationId]/page.tsx");
  assert.match(list, /verifySessionToken/);
  assert.match(list, /getApplicants/);
  assert.match(list, /CandidateApplicationForm/);
  assert.match(list, /\/api\/applicants/);
  assert.match(detail, /verifySessionToken/);
  assert.match(detail, /getApplicantById/);
  assert.match(detail, /getCandidateStatusHistory/);
  assert.match(detail, /Candidate Status History/);
});

test("applicants are reachable from the reviewer shell and role detail", () => {
  const shell = read("src/components/AppShell.tsx");
  const roleDetails = read("src/components/RoleDetails.tsx");
  assert.match(shell, /\/applicants/);
  assert.match(roleDetails, /\/applicants/);
});

test("candidate intake forms and decisions expose the required fields", () => {
  const form = read("src/components/CandidateApplicationForm.tsx");
  const editor = read("src/components/RecruitmentSetupEditor.tsx");
  const decisionPanel = read("src/components/ApplicantDecisionPanel.tsx");
  const route = read("src/app/api/applicants/route.ts");
  const publicRoute = read("src/app/api/public/applications/route.ts");
  const workflow = read("src/lib/applicant-workflow.ts");
  const decisionRoute = read("src/app/api/applicants/[applicationId]/decision/route.ts");
  const uploadRoute = read("src/app/api/uploads/resumes/route.ts");
  const downloadRoute = read("src/app/api/uploads/resumes/[fileId]/route.ts");

  assert.match(form, /preferredMobile/);
  assert.match(form, /skillsAssessment/);
  assert.match(form, /roleExpectations/);
  assert.match(form, /applicationSource/);
  assert.match(editor, /Save as template/);
  assert.match(editor, /SAVED TEMPLATES/);
  assert.match(decisionPanel, /Request Manual Review/);
  assert.match(decisionPanel, /Comments \*/);
  assert.match(decisionPanel, /disabled=\{busy \|\|/);
  assert.match(route, /findDuplicateCandidateApplication/);
  assert.match(route, /canReviewRole !== true/);
  assert.match(route, /source: "HR Manual Intake"/);
  assert.match(route, /allowedStatuses/);
  assert.match(publicRoute, /buildCandidateApplicationPayload/);
  assert.match(workflow, /preferredMobile/);
  assert.match(workflow, /skillsAssessment/);
  assert.match(workflow, /roleExpectations/);
  assert.match(workflow, /applicationSource/);
  assert.match(decisionRoute, /Manual Review/);
  assert.match(decisionRoute, /comments/);
  assert.match(form, /type="file"/);
  assert.match(form, /\.pdf/);
  assert.match(form, /\.docx/);
  assert.match(uploadRoute, /storeResumeFile/);
  assert.match(downloadRoute, /canReviewRole/);
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
