import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const authSource = fs.readFileSync("src/app/api/auth/google/route.ts", "utf8");
const logoutSource = fs.readFileSync("src/app/api/auth/logout/route.ts", "utf8");
const statusSource = fs.readFileSync("src/app/api/roles/[roleId]/status/route.ts", "utf8");
const setupSource = fs.readFileSync("src/app/api/roles/[roleId]/recruitment-setup/route.ts", "utf8");
const promptSource = fs.readFileSync("src/lib/recruitment-prompt.ts", "utf8");

test("authentication and logout use secure HTTP-only cookie settings", () => {
  assert.match(authSource, /httpOnly: true/);
  assert.match(authSource, /secure: process\.env\.NODE_ENV === "production"/);
  assert.match(authSource, /maxAge: 8 \* 60 \* 60/);
  assert.match(logoutSource, /httpOnly: true/);
  assert.match(logoutSource, /sameSite: "lax"/);
});

test("status and setup payloads preserve idempotency and event contracts", () => {
  assert.match(statusSource, /eventType: "role_status_transition"/);
  assert.match(statusSource, /X-Idempotency-Key/);
  assert.match(setupSource, /eventType: "recruitment_setup_updated"/);
  assert.match(setupSource, /X-Idempotency-Key/);
});

test("structured Recruitment Setup can generate a readable prompt", () => {
  assert.match(promptSource, /Job description/);
  assert.match(promptSource, /KEYWORDS TO LOOK FOR/);
  assert.match(promptSource, /LICENSE OR CERTIFICATE REQUIRED/);
  assert.match(promptSource, /\{\{interview_questions\}\}/);
  assert.match(promptSource, /\{\{system_prompt\}\}/);
});

test("the generated prompt no longer depends on the retired voice sub-fields", () => {
  for (const retired of ["aiInterviewerBehavior", "interviewBehavior", "finalAiEvaluationTemplate", "initialInterviewQuestions"]) {
    assert.doesNotMatch(promptSource, new RegExp(retired));
  }
});

test("Recruitment Setup keeps one editable VAPI prompt plus the three required questions", () => {
  const schema = fs.readFileSync("src/lib/recruitment-setup-schema.ts", "utf8");
  const readiness = fs.readFileSync("src/lib/recruitment-setup-readiness.ts", "utf8");
  const setupApi = fs.readFileSync("src/app/api/roles/[roleId]/recruitment-setup/route.ts", "utf8");
  for (const field of ["aiSystemPrompt", "requiredInterviewQuestion1", "requiredInterviewQuestion2", "requiredInterviewQuestion3"]) assert.match(schema, new RegExp(field));
  for (const retired of ["aiInterviewerName", "aiInterviewerBehavior", "finalAiEvaluationTemplate", "initialInterviewQuestions", "interviewBehavior"]) assert.doesNotMatch(schema, new RegExp(retired));
  assert.match(readiness, /AI_System_Prompt/);
  assert.doesNotMatch(readiness, /AI_Interviewer_Name/);
  assert.doesNotMatch(readiness, /Final_AI_Evaluation_Template/);
  assert.match(setupApi, /Status: setupAction === "publish_role" \? "Job Posted"/);
  assert.match(setupApi, /Recruitment_Setup_Status: setupStatusForAction/);
});
