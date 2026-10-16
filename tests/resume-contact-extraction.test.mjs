import assert from "node:assert/strict";
import test from "node:test";

import { extractResumeContactDetails, validateCandidateResume } from "../src/lib/resume-contact-extraction.ts";

const headerResume = [
  "Julio Jose Hidalgo Padilla",
  "AI Engineer / Automation Specialist | Antipolo, Philippines | 09663551040 | padillajuliojose@gmail.com | example.com",
  "Summary",
  "AI engineer and automation specialist building agentic workflows and full-stack products.",
  "Skills",
  "Agentic AI · LLMs · Prompt Engineering · n8n · REST APIs",
].join("\n");

test("a resume whose first line is the candidate name passes validation", () => {
  const result = validateCandidateResume(headerResume);
  assert.equal(result.valid, true, result.error);
  assert.equal(result.details.candidateName, "Julio Jose Hidalgo Padilla");
  assert.equal(result.details.candidateEmail, "padillajuliojose@gmail.com");
  assert.equal(result.details.preferredMobile, "+639663551040");
  assert.equal(result.details.applicantCountry, "PH");
});

test("a labelled name is used even when it is not the first line", () => {
  const details = extractResumeContactDetails("Curriculum Vitae\nName: Maria Santos\nEmail: maria@example.com\nMobile: +65 9123 4567");
  assert.equal(details.candidateName, "Maria Santos");
});

test("a resume without an email is still rejected", () => {
  const result = validateCandidateResume("Maria Santos\nCustomer service specialist\nSkills\nCommunication");
  assert.equal(result.valid, false);
});

test("a job description is still rejected", () => {
  const result = validateCandidateResume([
    "Inside Sales Specialist (AI & IT) Job Description",
    "Job Title: Inside Sales Specialist",
    "Key Responsibilities",
    "We are looking for a driven specialist. Send your CV to hr@example.com",
    "How to Apply",
  ].join("\n"));
  assert.equal(result.valid, false);
  assert.match(result.error, /job description/i);
});
