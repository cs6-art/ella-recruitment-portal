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

// --- Mint a session token for cs6@mclinkgroup.com (real account, full HR permissions) ---
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

console.log("=== STEP 1: Submit role request ===");
const roleReq = await call("POST", "/api/roles", {
  requestType: "Staff Addition",
  department: "Customer Support",
  jobTitle: "E2E Test Customer Service Executive",
  numberOfVacancies: 1,
  reasonForRequest: "Full end-to-end test of the recruitment pipeline from role request through AI voice interview.",
  jobDescription: "Handle inbound customer inquiries via phone, email, and chat. Resolve complaints professionally, escalate when needed, and maintain accurate records of every interaction. Requires strong communication skills and a customer-first mindset.",
  targetHiringDate: "2026-09-01",
  employmentType: "Full-Time",
});
console.log(roleReq.status, roleReq.json);
if (!roleReq.json.success) { console.error("FAILED at role creation"); process.exit(1); }
const roleId = roleReq.json.roleId;
console.log("Role ID:", roleId);

console.log("\n=== STEP 2: HR sends for management approval ===");
const step2 = await call("POST", `/api/roles/${encodeURIComponent(roleId)}/status`, {
  action: "send_for_management_approval",
  comments: "E2E test - sending for management approval.",
  actionRequestId: crypto.randomUUID(),
});
console.log(step2.status, step2.json);
if (!step2.json.success) { console.error("FAILED at send_for_management_approval"); process.exit(1); }

console.log("\n=== STEP 3: Management approves role ===");
const step3 = await call("POST", `/api/roles/${encodeURIComponent(roleId)}/status`, {
  action: "approve_role",
  comments: "E2E test - approving role.",
  actionRequestId: crypto.randomUUID(),
});
console.log(step3.status, step3.json);
if (!step3.json.success) { console.error("FAILED at approve_role"); process.exit(1); }

fs.writeFileSync("e2e-state.json", JSON.stringify({ roleId }, null, 2));
console.log("\nSaved roleId to e2e-state.json:", roleId);
