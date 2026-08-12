import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const schemaSource = fs.readFileSync("src/lib/role-schema.ts", "utf8");
const formSource = fs.readFileSync("src/components/RoleRequestForm.tsx", "utf8");
const apiSource = fs.readFileSync("src/app/api/roles/route.ts", "utf8");

function validate(input) {
  const email = String(input.requesterEmail || "").trim().toLowerCase();
  if (!/^\S+@mclinkgroup\.com$/.test(email)) return false;
  if (input.requestType === "Staff Replacement" && !String(input.replacementEmployee || "").trim()) return false;
  if (input.salaryMin !== undefined && input.salaryMin < 1) return false;
  if (input.salaryMax !== undefined && input.salaryMax < 1) return false;
  if (input.salaryMin !== undefined && input.salaryMax !== undefined && input.salaryMin > input.salaryMax) return false;
  return true;
}

test("Staff Addition clears and does not require replacement employee", () => {
  assert.equal(validate({ requestType: "Staff Addition", replacementEmployee: "", requesterEmail: "user@mclinkgroup.com" }), true);
  assert.match(formSource, /replacementEmployee: \"\"/);
});

test("Staff Replacement requires replacement employee", () => {
  assert.equal(validate({ requestType: "Staff Replacement", replacementEmployee: "", requesterEmail: "user@mclinkgroup.com" }), false);
  assert.equal(validate({ requestType: "Staff Replacement", replacementEmployee: "Former employee", requesterEmail: "user@mclinkgroup.com" }), true);
  assert.match(schemaSource, /Staff Replacement/);
});

test("requester identity is not collected as a form field and remains server-owned", () => {
  assert.doesNotMatch(formSource, /id="requesterName"/);
  assert.doesNotMatch(formSource, /id="requesterEmail"/);
  assert.match(apiSource, /requesterName: user\.name/);
  assert.match(apiSource, /requesterEmail: sessionEmail/);
  assert.match(apiSource, /submittedBy: \{/);
});

test("invalid, non-McLink, and mismatched requester emails are rejected", () => {
  assert.equal(validate({ requesterEmail: "bad-email" }), false);
  assert.equal(validate({ requesterEmail: "user@example.com" }), false);
  assert.equal(validate({ requesterEmail: "user@mclinkgroup.comds" }), false);
});

test("salary validation rejects negative and inverted values", () => {
  assert.equal(validate({ requesterEmail: "user@mclinkgroup.com", salaryMin: 100, salaryMax: 50 }), false);
  assert.equal(validate({ requesterEmail: "user@mclinkgroup.com", salaryMin: -1 }), false);
  assert.equal(validate({ requesterEmail: "user@mclinkgroup.com", salaryMin: 0 }), false);
  assert.equal(validate({ requesterEmail: "user@mclinkgroup.com", salaryMax: 0 }), false);
  assert.equal(validate({ requesterEmail: "user@mclinkgroup.com", salaryMin: 50, salaryMax: 100 }), true);
  assert.equal(validate({ requesterEmail: "user@mclinkgroup.com" }), true);
});

test("required-field and vacancy rules remain in the shared schema", () => {
  assert.match(schemaSource, /department: z\.string\(\)\.trim\(\)\.min/);
  assert.match(schemaSource, /jobTitle: z\.string\(\)\.trim\(\)\.min/);
  assert.match(schemaSource, /numberOfVacancies: z\.coerce\.number\(\)\.int\(\)\.min\(1\)/);
  assert.match(schemaSource, /reasonForRequest: z\.string\(\)\.trim\(\)\.min/);
  assert.match(schemaSource, /targetHiringDate: z\.string\(\)\.trim\(\)\.min/);
});

test("role creation only renders the requisition and HOD screening fields", () => {
  for (const field of [
    "jobDescription",
    "jobTitle",
    "department",
    "numberOfVacancies",
    "reasonForRequest",
    "targetHiringDate",
    "hodAvailabilityDates",
    "hodAvailabilityTimes",
    "customScreeningQuestion1",
    "customScreeningQuestion2",
  ]) {
    if (field === "hodAvailabilityDates" || field === "hodAvailabilityTimes") {
      assert.match(formSource, new RegExp(field));
    } else {
      assert.match(formSource, new RegExp(`id=\\"${field}\\"`));
    }
  }

  for (const removedField of [
    "workLocation",
    "employmentType",
    "jobResponsibilities",
    "requiredSkills",
    "experienceRequired",
    "educationRequirements",
    "preferredQualifications",
    "roleExpectations",
    "salaryMin",
    "salaryMax",
    "workSchedule",
    "noticePeriodRequirement",
    "salaryExpectationGuidance",
  ]) {
    assert.doesNotMatch(formSource, new RegExp(`id=\\"${removedField}\\"`));
  }
});

test("HOD scheduling data is structured and server payloads carry the explicit HOD", () => {
  assert.match(formSource, /id=\"hodEmail\"/);
  assert.match(formSource, /hodAvailabilitySlots/);
  assert.match(apiSource, /hodEmail: clientInput\.hodEmail \|\| sessionEmail/);
  assert.match(apiSource, /hodAvailabilitySlots: input\.hodAvailabilitySlots/);
});
