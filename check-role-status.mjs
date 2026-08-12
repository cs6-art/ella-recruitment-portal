import fs from "node:fs";
import { google } from "googleapis";
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
const spreadsheetId = env.GOOGLE_SHEETS_SPREADSHEET_ID;
const auth = new google.auth.JWT({ email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: (env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n"), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });
function text(v) { return String(v ?? "").trim(); }
const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Role_Requests!A1:ZZ" });
const [headers, ...rows] = res.data.values;
const roleIdIdx = headers.findIndex((h) => text(h) === "Role_ID");
const statusIdx = headers.findIndex((h) => text(h) === "Status");
const row = rows.find((r) => text(r[roleIdIdx]) === "ETCSE01");
console.log("ETCSE01 Status:", row ? text(row[statusIdx]) : "NOT FOUND");
