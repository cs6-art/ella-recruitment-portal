import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("public application form collects and validates monthly salary", () => {
  const form = read("public/index.html");

  assert.match(form, /for="salaryExpectation">Expected Salary \(Monthly\)/);
  assert.match(form, /id="salaryExpectation"[^>]*type="number"[^>]*required/);
  assert.match(form, /id="salaryExpectationError"/);
  assert.match(form, /for="salaryCurrency">Salary Currency/);
  assert.match(form, /id="salaryCurrency"[^>]*required/);
  assert.match(form, /<option value="">Please Select<\/option>/);
  for (const currency of ["SGD", "PHP", "MY", "RUPEE", "RUPIAH"]) {
    assert.match(form, new RegExp(`<option value="${currency}">${currency}<\\/option>`));
  }
  assert.match(form, /Enter a valid expected monthly salary/);
  assert.match(form, /Select a salary currency/);
  assert.match(form, /payload\.append\("salaryExpectation"/);
  assert.match(form, /payload\.append\("salaryCurrency"/);
});

test("portal resume screening form collects the same monthly salary fields", () => {
  const form = read("src/components/CandidateApplicationForm.tsx");
  const route = read("src/app/api/applicants/route.ts");

  assert.match(form, /id="candidate-salary-expectation"[^>]*required[^>]*type="number"/);
  assert.match(form, /id="candidate-salary-currency"[^>]*required/);
  assert.match(form, /Expected Salary \(Monthly\)/);
  assert.match(form, /salaryExpectation/);
  assert.match(form, /salaryCurrency/);
  assert.match(route, /Expected monthly salary must be greater than zero/);
  assert.match(route, /Select a valid salary currency/);
});

test("public application API rejects missing, invalid, and unsupported salary data", () => {
  const route = read("src/app/api/public/applications/route.ts");
  const workflow = read("src/lib/applicant-workflow.ts");

  assert.match(workflow, /candidateSalaryCurrencies = \["SGD", "PHP", "MY", "RUPEE", "RUPIAH"\]/);
  assert.match(workflow, /salaryCurrency: z\.string\(\)\.trim\(\)\.max\(20\)\.default\(""\)/);
  assert.match(route, /Expected monthly salary must be greater than zero/);
  assert.match(route, /Select a valid salary currency/);
  assert.match(route, /field: "salaryExpectation"/);
  assert.match(route, /field: "salaryCurrency"/);
});

test("salary survives the webhook/sheet mapping and is visible in the applicant list", () => {
  const workflow = read("src/lib/applicant-workflow.ts");
  const n8n = read("integrations/n8n/candidate-application-foundation.json");
  const applications = read("src/lib/candidate-applications.ts");
  const list = read("src/components/ApplicantsList.tsx");
  const schema = read("docs/GOOGLE-SHEETS-SCHEMA.md");

  assert.match(workflow, /salaryCurrency: text\(input\.candidate\.salaryCurrency\)/);
  assert.match(n8n, /Salary_Expectation:storedSalary/);
  assert.match(n8n, /Salary_Currency:salaryCurrency/);
  assert.match(schema, /Salary_Expectation`, `Salary_Currency`/);
  assert.match(applications, /const salaryExpectation = field\(record, "Salary_Expectation"/);
  assert.match(applications, /const storedSalaryCurrency = field\(record, "Salary_Currency"/);
  assert.match(list, /<th>Expected Salary<\/th>/);
  assert.match(list, /salaryValue\(applicant\)/);
  assert.match(list, /Not provided/);
});
