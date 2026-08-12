import fs from "node:fs";

const BASE = "http://127.0.0.1:3000";
const roleId = "ETCSE01";

const body = {
  roleId,
  candidateName: "Julio Jose Padilla",
  email: "cs6@mclinkgroup.com",
  phone: "+639663551040",
  preferredMobile: "+639663551040",
  resumeText: "Julio Jose Padilla has over 3 years of experience in customer-facing roles, including 2 years as a call center representative handling inbound customer support for a telecommunications company. Strong track record of resolving customer complaints, maintaining high satisfaction scores, and working efficiently under pressure. Comfortable using CRM systems and multitasking across phone, email, and chat channels. Known for clear communication and a calm, patient approach to escalated situations.",
  salaryExpectation: "PHP 28,000 per month",
  noticePeriod: "2 weeks",
  availability: "Immediately available",
  skillsAssessment: "Strong verbal communication, conflict resolution, CRM software proficiency, multitasking.",
  roleExpectations: "Looking for a stable customer service role with growth opportunities into a team lead position.",
  applicationSource: "Direct Application",
  consent: true,
};

const res = await fetch(`${BASE}/api/public/applications`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const json = await res.json().catch(() => ({}));
console.log(res.status, JSON.stringify(json, null, 2));
if (json.success) fs.writeFileSync("e2e-application-id.txt", json.applicationId);
