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
const applicationId = fs.readFileSync("e2e-application-id.txt", "utf8").trim();

const now = new Date();
const manila = new Date(now.getTime() + 8 * 3600 * 1000 - 60 * 1000); // 1 min ago, in Manila wall-clock
const hh = String(manila.getUTCHours()).padStart(2, "0");
const mm = String(manila.getUTCMinutes()).padStart(2, "0");
const timeStr = `${hh}:${mm}:00`;
console.log("Setting scheduled time to (Manila wall-clock):", timeStr);

const auth = new google.auth.JWT({ email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: (env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n"), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });
function text(v) { return String(v ?? "").trim(); }
function colLetter(index) { let name = ""; let n = index + 1; while (n > 0) { const r = (n - 1) % 26; name = String.fromCharCode(65 + r) + name; n = Math.floor((n - 1) / 26); } return name; }

async function updateSheet(spreadsheetId, tab, idHeader) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tab}'!A1:BM` });
  const [headers, ...rows] = res.data.values;
  const idIdx = headers.findIndex((h) => text(h) === idHeader);
  const rowIdx = rows.findIndex((r) => text(r[idIdx]) === applicationId);
  if (rowIdx < 0) { console.log(`Not found in ${tab}`); return; }
  const rowNumber = rowIdx + 2;
  const timeIdx = headers.findIndex((h) => text(h) === "Voice_Interview_Scheduled_Time");
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tab}'!${colLetter(timeIdx)}${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[timeStr]] },
  });
  console.log(`Updated ${tab}`);
}

await updateSheet(env.GOOGLE_CANDIDATE_SPREADSHEET_ID, "Voice_Call_Queue", "Application_ID");
await updateSheet(env.GOOGLE_CANDIDATE_SPREADSHEET_ID, "High_Match_Profile", "Application ID");
