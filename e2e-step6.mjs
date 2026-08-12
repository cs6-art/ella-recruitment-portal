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
const applicationId = fs.readFileSync("e2e-application-id.txt", "utf8").trim();

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

const res = await fetch(`${BASE}/api/applicants/${encodeURIComponent(applicationId)}/decision`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ stage: "resume", decision: "Approve", comments: "E2E test - strong resume match, approve for voice interview." }),
});
const json = await res.json().catch(() => ({}));
console.log(res.status, JSON.stringify(json, null, 2));
