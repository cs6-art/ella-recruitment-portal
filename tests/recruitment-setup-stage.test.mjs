import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const readiness = fs.readFileSync("src/lib/recruitment-setup-readiness.ts", "utf8");
const route = fs.readFileSync("src/app/api/roles/[roleId]/recruitment-setup/route.ts", "utf8");
const editor = fs.readFileSync("src/components/RecruitmentSetupEditor.tsx", "utf8");
const roleDetails = fs.readFileSync("src/components/RoleDetails.tsx", "utf8");

test("draft readiness keeps the two minimum fields", () => {
  assert.match(readiness, /Job_Description/);
  assert.match(readiness, /Screening_Criteria/);
  assert.doesNotMatch(readiness, /Initial_Interview_Questions/);
  assert.match(readiness, /level === "draft"/);
});

test("higher readiness requires the VAPI prompt, three questions, and a posting channel", () => {
  assert.match(readiness, /AI_System_Prompt/);
  assert.match(readiness, /Required_Interview_Question_1/);
  assert.match(readiness, /Required_Interview_Question_2/);
  assert.match(readiness, /Required_Interview_Question_3/);
  assert.doesNotMatch(readiness, /Interview_Behavior/);
  assert.match(readiness, /Posting_Channels/);
});

test("publishing uses explicit conditional requirements", () => {
  assert.match(readiness, /Salary_Disclosure_Status/);
  assert.doesNotMatch(readiness, /Experience_Requirement_Status/);
  assert.match(readiness, /HOD_Interview_Required/);
  assert.match(readiness, /License_Requirement_Status/);
});

test("server rejects incomplete stage actions", () => {
  assert.match(route, /RECRUITMENT_SETUP_INCOMPLETE/);
  assert.match(route, /getSetupReadiness/);
  assert.match(route, /setupAction/);
});

test("publishing is blocked until Ready for Publishing", () => {
  assert.match(route, /RECRUITMENT_SETUP_NOT_READY/);
  assert.match(route, /Ready for Publishing/);
  assert.match(route, /Job Posted/);
});

test("setup payload keeps the five canonical questions compatible with n8n", () => {
  assert.match(route, /requiredInterviewQuestion1/);
  assert.match(route, /requiredInterviewQuestion5/);
  assert.match(route, /initialInterviewQuestions/);
  assert.match(route, /Initial_Interview_Questions: initialInterviewQuestions\.join/);
  assert.match(route, /Required_Interview_Question_1/);
  assert.match(route, /Required_Interview_Question_5/);
});

test("editor exposes separate stage actions and readiness", () => {
  assert.match(editor, /Save Draft/);
  assert.match(editor, /Mark as Recruitment Ready/);
  assert.match(editor, /Mark as Ready for Publishing/);
  assert.match(editor, /Publish Role/);
  assert.match(editor, /setup-readiness/);
});

test("recruitment setup uses one guided editor with simple HR-facing fields", () => {
  assert.match(editor, /Interview Setup/);
  assert.match(editor, /What should Ella listen for\?/);
  assert.match(editor, /Advanced: edit full script/);
  assert.match(editor, /Publishing checklist/);
  // The raw {{curly_brace}} template stays hidden behind an explicit
  // "Advanced" action so HR lands on the simple field-based view by default.
  assert.match(editor, /useState\(false\)/);
  assert.doesNotMatch(roleDetails, /EllaSetupFields/);
});

test("VAPI prompt includes time management guardrails", () => {
  const prompt = fs.readFileSync("src/lib/recruitment-prompt.ts", "utf8");
  assert.match(prompt, /\[Time Management\]/);
  assert.match(prompt, /Hard maximum call duration: 15 minutes\./);
  assert.match(prompt, /At around 12 minutes, prioritize and compress the remaining approved questions/);
  assert.match(prompt, /Warmly inform the candidate that time is nearly finished\./);
  assert.match(prompt, /Never interrupt a candidate mid-answer\./);
  assert.match(prompt, /Always complete the existing closing sequence before ending\./);
});
