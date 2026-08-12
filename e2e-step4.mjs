import crypto from "node:crypto";
import fs from "node:fs";

const envPath = new URL("./.env.local", import.meta.url);
const raw = fs.readFileSync(envPath, "utf8");
const env = {};
for (const line of raw.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq < 0) continue;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  env[key] = value;
}

const BASE = "http://127.0.0.1:3000";
const roleId = "ETCSE01";

// Pull the real production template straight from the source, so this test
// exercises the exact same prompt real candidates would get.
const promptSource = fs.readFileSync("src/lib/recruitment-prompt.ts", "utf8");
const templateMatch = promptSource.match(/STANDARD_VAPI_SYSTEM_PROMPT_TEMPLATE = `([\s\S]*?)`;/);
const aiSystemPrompt = templateMatch[1];
console.log("Extracted template length:", aiSystemPrompt.length);

function encode(v) { return Buffer.from(v, "utf8").toString("base64url"); }
function sign(p) { return crypto.createHmac("sha256", env.SESSION_SECRET).update(p).digest("base64url"); }
const payload = {
  sub: "e2e-test", name: "Julio Jose Padilla", email: "cs6@mclinkgroup.com", picture: "", active: true,
  exp: Math.floor(Date.now() / 1000) + 3600,
  accessRole: "HR", department: "AI", canCreateRole: true, canReviewRole: true, canApproveRole: true, canEditSettings: true,
};
const encoded = encode(JSON.stringify(payload));
const token = `${encoded}.${sign(encoded)}`;
const cookie = `mclink_session=${token}`;

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const baseSetup = {
  jobDescription: "Handle inbound customer inquiries via phone, email, and chat. Resolve complaints professionally, escalate when needed, and maintain accurate records of every interaction. Requires strong communication skills and a customer-first mindset.",
  screeningCriteria: "Look for prior customer service or call center experience, clear spoken communication, and patience when handling frustrated customers.",
  requiredInterviewQuestion1: "Can you tell me about a time you handled a difficult or upset customer? What did you do?",
  requiredInterviewQuestion2: "How do you stay organized when handling multiple customer inquiries at once?",
  requiredInterviewQuestion3: "What does great customer service mean to you?",
  requiredInterviewQuestion4: "",
  requiredInterviewQuestion5: "",
  aiSystemPrompt,
  initialInterviewBookingLink: "",
  hodInterviewBookingLink: "",
  postingChannels: ["LinkedIn"],
  licenseOrCertificateRequired: "",
  keywordsToLookFor: "customer service, communication, patience, problem solving",
  minimumYearsOfExperience: "1 year",
  transferableSkillsAccepted: "Retail or hospitality experience with direct customer interaction",
  salaryOrBudgetRange: "PHP 25,000 to PHP 32,000 per month",
  earliestAvailabilityRule: "Ask whether the candidate can start within 2 weeks.",
  salaryDisclosureStatus: "Disclosed",
  experienceRequirementStatus: "Preferred",
  licenseRequirementStatus: "Not required",
  hodInterviewRequired: "Required",
  comments: "E2E test setup.",
};

console.log("\n=== STEP 4a: Mark Ready for Publishing ===");
const step4a = await call("POST", `/api/roles/${encodeURIComponent(roleId)}/recruitment-setup`, {
  ...baseSetup,
  setupAction: "mark_ready_for_publishing",
  actionRequestId: crypto.randomUUID(),
});
console.log(step4a.status, JSON.stringify(step4a.json));
if (!step4a.json.success) { console.error("FAILED at mark_ready_for_publishing"); process.exit(1); }

console.log("\n=== STEP 4b: Publish role ===");
const step4b = await call("POST", `/api/roles/${encodeURIComponent(roleId)}/recruitment-setup`, {
  ...baseSetup,
  setupAction: "publish_role",
  actionRequestId: crypto.randomUUID(),
});
console.log(step4b.status, JSON.stringify(step4b.json));
if (!step4b.json.success) { console.error("FAILED at publish_role"); process.exit(1); }

console.log("\nDONE. Role published.");
