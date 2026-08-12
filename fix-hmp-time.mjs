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
const spreadsheetId = env.GOOGLE_CANDIDATE_SPREADSHEET_ID;
const auth = new google.auth.JWT({ email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: (env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n"), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });
function text(v) { return String(v ?? "").trim(); }
function colLetter(index) { let name = ""; let n = index + 1; while (n > 0) { const r = (n - 1) % 26; name = String.fromCharCode(65 + r) + name; n = Math.floor((n - 1) / 26); } return name; }
const applicationId = fs.readFileSync("e2e-application-id.txt", "utf8").trim();

const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: "'High_Match_Profile'!A1:BM" });
const [headers, ...rows] = res.data.values;
const idIdx = headers.findIndex((h) => text(h) === "Application ID");
const rowIdx = rows.findIndex((r) => text(r[idIdx]) === applicationId);
const rowNumber = rowIdx + 2;
const timeIdx = headers.findIndex((h) => text(h) === "Voice_Interview_Scheduled_Time");
await sheets.spreadsheets.values.update({
  spreadsheetId,
  range: `'High_Match_Profile'!${colLetter(timeIdx)}${rowNumber}`,
  valueInputOption: "USER_ENTERED",
  requestBody: { values: [["00:36:00"]] },
});
console.log("Updated High_Match_Profile Voice_Interview_Scheduled_Time to 00:36:00");
