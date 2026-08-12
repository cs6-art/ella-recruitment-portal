import fs from "node:fs";
import crypto from "node:crypto";
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

const slotId = `SLOT-E2E${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
const row = ["Slot_ID", "Interview_Type", "Role_ID", "Date", "Start_Time", "End_Time", "Timezone", "Status"].map((h) => {
  if (h === "Slot_ID") return slotId;
  if (h === "Interview_Type") return "AI Voice Interview";
  if (h === "Role_ID") return "ETCSE01";
  if (h === "Date") return "2026-08-12";
  if (h === "Start_Time") return "00:50:00";
  if (h === "End_Time") return "01:20:00";
  if (h === "Timezone") return "Asia/Manila";
  if (h === "Status") return "Available";
  return "";
});
await sheets.spreadsheets.values.append({ spreadsheetId, range: "'Interview_Slots'!A1", valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS", requestBody: { values: [row] } });
console.log("Created voice interview slot:", slotId, "at 00:50 today");
