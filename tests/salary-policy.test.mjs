import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("approved salary or budget range is required before publishing", async () => {
  const { getSetupReadiness } = await import("../src/lib/recruitment-setup-readiness.ts");
  const base = {
    jobDescription: "A complete role description.",
    screeningCriteria: "Assess relevant role evidence.",
    aiSystemPrompt: "Use the approved interview script.",
    requiredInterviewQuestion1: "Tell us about your experience.",
    requiredInterviewQuestion2: "Describe a relevant project.",
    requiredInterviewQuestion3: "How do you solve role-related problems?",
    postingChannels: ["Careers page"],
    salaryDisclosureStatus: "Not disclosed",
    hodInterviewRequired: "Not required",
    licenseRequirementStatus: "Not required",
  };

  const missing = getSetupReadiness({ ...base, salaryOrBudgetRange: "" }, "ready-for-publishing");
  assert.equal(missing.valid, false);
  assert.deepEqual(missing.missingFields.find((field) => field.key === "Salary_or_Budget_Range"), {
    key: "Salary_or_Budget_Range",
    label: "Approved salary or budget range",
  });
  assert.equal(getSetupReadiness({ ...base, salaryOrBudgetRange: "PHP 45,000 to PHP 60,000 per month" }, "ready-for-publishing").valid, true);
  assert.equal(getSetupReadiness({ ...base, salaryOrBudgetRange: "" }, "draft").valid, true);
});

test("role request UI and API require the approved range while retaining draft autosave", () => {
  const form = read("src/components/RoleRequestForm.tsx");
  const route = read("src/app/api/roles/route.ts");
  const setupEditor = read("src/components/RecruitmentSetupEditor.tsx");

  assert.match(form, /id="salaryOrBudgetRange"[^>]*required/);
  assert.match(form, /updateRecruitmentSetup\("salaryOrBudgetRange"/);
  assert.match(form, /salaryOrBudgetRange: result\.draft\.recruitmentSetup\.salaryOrBudgetRange \|\| current\.recruitmentSetupDraft\.salaryOrBudgetRange/);
  assert.match(route, /ROLE_REQUEST_INCOMPLETE: Approved salary or budget range is required/);
  assert.match(route, /clientInput && typeof clientInput === "object" && clientInput\.draft === true/);
  assert.match(setupEditor, /<Field id="vapi-salary"[\s\S]*?\brequired\b/);
  assert.match(setupEditor, /Salary_or_Budget_Range: "#vapi-salary"/);
});

test("CV screening receives the submitted expectation and canonical approved range", () => {
  const workflow = read("src/lib/applicant-workflow.ts");
  const publicRoute = read("src/app/api/public/applications/route.ts");
  const manualRoute = read("src/app/api/applicants/route.ts");
  const prompt = read("src/lib/recruitment-prompt.ts");
  const foundation = JSON.parse(read("integrations/n8n/candidate-application-foundation.json"));
  const code = foundation.nodes.find((node) => node.name === "Validate Candidate Application").parameters.jsCode;

  assert.match(workflow, /approvedSalaryOrBudgetRange: string/);
  assert.match(workflow, /approvedSalaryOrBudgetRange: text\(input\.approvedSalaryOrBudgetRange\)/);
  assert.match(publicRoute, /approvedSalaryOrBudgetRange: role\.salaryOrBudgetRange/);
  assert.match(manualRoute, /approvedSalaryOrBudgetRange: role\.salaryOrBudgetRange/);
  assert.match(prompt, /Expected monthly salary: \{\{salary_expectation\}\} \{\{salary_currency\}\}/);
  assert.match(prompt, /same currency and the same pay period/);
  assert.match(prompt, /Never automatically approve or reject the applicant because of salary/);
  assert.match(code, /approvedSalaryOrBudgetRange/);
  assert.match(code, /Approved_Salary_or_Budget_Range/);
  assert.match(code, /Salary_Match_Status:'Not evaluated'/);
  assert.match(read("src/components/ApplicantsList.tsx"), /Budget: \{applicant\.approvedSalaryOrBudgetRange \|\| "Not configured"\}/);
});

test("bulk resume paths explicitly preserve missing salary as not provided", () => {
  for (const path of [
    "integrations/n8n/bulk-resume-screening.ts",
    "integrations/n8n/bulk-resume-upload-intake.ts",
    "integrations/n8n/jd-role-folder-bulk-resume-screening.ts",
  ]) {
    const source = read(path);
    assert.match(source, /salaryExpectation: ""/);
    assert.match(source, /salaryCurrency: ""/);
  }
});
