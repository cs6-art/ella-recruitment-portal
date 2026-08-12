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
const mainSpreadsheetId = env.GOOGLE_SHEETS_SPREADSHEET_ID;
const auth = new google.auth.JWT({ email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: (env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n"), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });
function text(v) { return String(v ?? "").trim(); }

const dirRes = await sheets.spreadsheets.values.get({ spreadsheetId: mainSpreadsheetId, range: "User_Directory!A2:I" });
const rows = dirRes.data.values || [];
const row = rows.find((r) => text(r[0]).toLowerCase() === "cs6@mclinkgroup.com");
console.log("cs6@mclinkgroup.com in User_Directory:", row ? {
  fullName: row[1], accessRole: row[2], department: row[3],
  canCreateRole: row[4], canReviewRole: row[5], canApproveRole: row[6], canEditSettings: row[7], active: row[8],
} : "NOT FOUND");

const roleRes = await sheets.spreadsheets.values.get({ spreadsheetId: mainSpreadsheetId, range: "Role_Requests!A1:ZZ" });
const [headers, ...roleRows] = roleRes.data.values;
const roleIdIdx = headers.findIndex((h) => text(h) === "Role_ID");
const existingIds = roleRows.map((r) => text(r[roleIdIdx])).filter(Boolean);
console.log("\nExisting Role IDs:", existingIds);
