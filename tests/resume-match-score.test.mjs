import assert from "node:assert/strict";
import test from "node:test";

test("resume match score is repeatable and based on role requirements", async () => {
  const { calculateResumeMatchScore } = await import("../src/lib/resume-match-score.ts");
  const role = {
    jobDescription: "Implement and configure SAP Business One for clients.",
    screeningCriteria: "Bachelor's degree with at least 3 years of SAP B1 experience.",
    educationRequirements: "Bachelor's degree in IT or a related field.",
    keywordsToLookFor: "SAP Business One, ASAP methodology, SQL, HANA, Crystal Reports, ERP implementation, end-user training, system testing, integration",
    minimumYearsOfExperience: "3",
  };
  const resume = "Bachelor's degree in Information Technology. 5 years of ERP support, UAT, user training, system testing, and integration work with Microsoft Dynamics 365 Business Central.";

  const first = calculateResumeMatchScore(resume, role);
  const second = calculateResumeMatchScore(resume, role);

  assert.deepEqual(second, first);
  assert.equal(first.score, 50);
  assert.deepEqual(first.matchedRequirements, ["end-user training", "system testing", "integration"]);
  assert.ok(first.missingRequirements.includes("SAP Business One"));
  assert.equal(first.experienceScore, 15);
  assert.equal(first.educationScore, 10);
});

test("missing role requirements do not receive credit from unrelated words", async () => {
  const { calculateResumeMatchScore } = await import("../src/lib/resume-match-score.ts");
  const result = calculateResumeMatchScore("Bachelor's degree. 4 years of Microsoft Dynamics support.", {
    jobDescription: "SAP Business One Functional Consultant",
    educationRequirements: "Bachelor's degree",
    keywordsToLookFor: "SAP Business One, SQL, HANA",
    minimumYearsOfExperience: "3",
  });

  assert.ok(result);
  assert.equal(result.matchedRequirements.length, 0);
  assert.equal(result.score, 10);
});

test("negated and unrelated evidence does not inflate the score", async () => {
  const { calculateResumeMatchScore } = await import("../src/lib/resume-match-score.ts");
  const role = {
    jobDescription: "Implement and configure SAP Business One for clients.",
    screeningCriteria: "Bachelor's degree with at least 3 years of SAP B1 implementation experience.",
    educationRequirements: "Bachelor's degree in IT or a related field.",
    keywordsToLookFor: "SAP Business One, HANA, ERP implementation, end-user training, system testing, integration",
    minimumYearsOfExperience: "3",
  };

  const partial = calculateResumeMatchScore(
    "Bachelor's degree in Information Technology. 5 years of retail operations. No SAP Business One or HANA experience. Some user training, system testing, and integration work.",
    role,
  );
  const unrelated = calculateResumeMatchScore(
    "Bachelor's degree in Fine Arts. 4 years of retail sales and customer service.",
    role,
  );

  assert.deepEqual(partial.matchedRequirements, ["end-user training", "system testing", "integration"]);
  assert.equal(partial.experienceScore, 15);
  assert.equal(partial.educationScore, 10);
  assert.equal(partial.score, 63);
  assert.deepEqual(unrelated.matchedRequirements, []);
  assert.equal(unrelated.experienceScore, 0);
  assert.equal(unrelated.educationScore, 0);
  assert.equal(unrelated.score, 0);
});

test("protected and role metadata do not affect the result", async () => {
  const { calculateResumeMatchScore } = await import("../src/lib/resume-match-score.ts");
  const resume = "Bachelor's degree in Information Technology. 5 years of SAP Business One implementation, SQL, and integration.";
  const baseRole = {
    jobDescription: "Implement and configure SAP Business One for clients.",
    educationRequirements: "Bachelor's degree in IT or a related field.",
    keywordsToLookFor: "SAP Business One, SQL, integration",
    minimumYearsOfExperience: "3",
  };
  const withMetadata = calculateResumeMatchScore(resume, {
    ...baseRole,
    jobDescription: `${baseRole.jobDescription} Work location: Singapore. Salary: SGD 10,000. Candidate must be young and male.`,
  });

  assert.deepEqual(withMetadata, calculateResumeMatchScore(resume, baseRole));
});
