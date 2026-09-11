import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("public application form collects salary and derives country currency from the role", () => {
  const form = read("public/index.html");

  assert.match(form, /for="salaryExpectation">Expected Salary \(Monthly\)/);
  assert.match(form, /id="salaryExpectation"[^>]*type="number"[^>]*required/);
  assert.match(form, /id="salaryExpectationError"/);
  assert.doesNotMatch(form, /id="salaryCurrency"/);
  assert.doesNotMatch(form, /id="applicantCountry"/);
  assert.match(form, /roleCountryProfiles/);
  assert.match(form, /roleCountry.*country/);
  assert.match(form, /Enter a valid expected monthly salary/);
  assert.match(form, /payload\.append\("salaryExpectation"/);
  assert.match(form, /roleCountryProfiles\[applicantCountry\]/);
});

test("portal resume screening form derives phone country and currency from the selected role", () => {
  const form = read("src/components/CandidateApplicationForm.tsx");
  const route = read("src/app/api/applicants/route.ts");

  assert.match(form, /id="candidate-salary-expectation"[^>]*required[^>]*type="number"/);
  assert.doesNotMatch(form, /candidate-salary-currency/);
  assert.doesNotMatch(form, /CountrySelect/);
  assert.match(form, /Expected Salary \(Monthly\)/);
  assert.match(form, /salaryExpectation/);
  assert.match(form, /roleCountryProfile/);
  assert.match(route, /Expected monthly salary must be greater than zero/);
  assert.match(route, /salaryCurrency: country\.currencyCode/);
});

test("public application API rejects invalid salary and validates the selected role country", () => {
  const route = read("src/app/api/public/applications/route.ts");
  const workflow = read("src/lib/applicant-workflow.ts");

  assert.match(workflow, /candidateSalaryCurrencies/);
  assert.match(workflow, /salaryCurrency: z\.string\(\)\.trim\(\)\.max\(20\)\.default\(""\)/);
  assert.match(route, /Expected monthly salary must be greater than zero/);
  assert.match(route, /field: "salaryExpectation"/);
  assert.match(route, /roleCountryProfile/);
  assert.match(route, /This role does not have a supported country configured/);
});

test("salary survives the webhook/sheet mapping and is visible in the applicant list", () => {
  const workflow = read("src/lib/applicant-workflow.ts");
  const n8n = read("integrations/n8n/candidate-application-foundation.json");
  const applications = read("src/lib/candidate-applications.ts");
  const salaryFormat = read("src/lib/salary-format.ts");
  const list = read("src/components/ApplicantsList.tsx");
  const detail = read("src/app/applicants/[applicationId]/page.tsx");
  const schema = read("docs/GOOGLE-SHEETS-SCHEMA.md");

  assert.match(workflow, /salaryCurrency: text\(input\.candidate\.salaryCurrency\)/);
  assert.match(n8n, /Salary_Expectation:storedSalary/);
  assert.match(n8n, /Salary_Currency:salaryCurrency/);
  assert.match(schema, /Salary_Expectation`, `Salary_Currency`/);
  assert.match(applications, /const salaryExpectation = field\(record, "Salary_Expectation"/);
  assert.match(applications, /const storedSalaryCurrency = field\(record, "Salary_Currency"/);
  assert.match(salaryFormat, /PHP: \{ symbol: "₱", name: "Philippine peso" \}/);
  assert.match(salaryFormat, /formatSalaryExpectation/);
  assert.match(salaryFormat, /new Intl\.NumberFormat\("en-US"/);
  assert.match(list, /<th>Expected Salary<\/th>/);
  assert.match(list, /salaryValue\(applicant\)/);
  assert.match(list, /salaryCurrencyLabel\(applicant\.salaryCurrency\)/);
  assert.match(list, /Not provided/);
  assert.match(detail, /title="Compensation"/);
  assert.match(detail, /label="Expected Salary \(Monthly\)"/);
  assert.match(detail, /label="Salary Currency" value=\{salaryCurrencyLabel\(applicant\.salaryCurrency\)\}/);
  assert.match(detail, /label="Approved Salary \/ Budget Range"/);
  assert.match(read("src/app/globals.css"), /\.applicant-compensation-card \{ margin-bottom: 24px; \}/);
});

test("salary match falls back to the role budget when workflow fields are blank", async () => {
  const { evaluateSalaryMatch } = await import("../src/lib/salary-match.ts");
  assert.deepEqual(evaluateSalaryMatch({
    salaryExpectation: "35000",
    salaryCurrency: "SGD",
    approvedSalaryOrBudgetRange: "SGD 3,500 to SGD 5,000 per month",
  }), {
    status: "Above range",
    notes: "The expected salary is above the approved range.",
  });
  assert.equal(evaluateSalaryMatch({
    salaryExpectation: "4,000",
    salaryCurrency: "SGD",
    approvedSalaryOrBudgetRange: "SGD 3,500 to SGD 5,000 per month",
  }).status, "Matched");
  assert.equal(evaluateSalaryMatch({
    salaryExpectation: "4000",
    salaryCurrency: "PHP",
    approvedSalaryOrBudgetRange: "SGD 3,500 to SGD 5,000 per month",
  }).status, "Not comparable");
});
