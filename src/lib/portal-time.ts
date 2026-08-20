// All user-facing portal timestamps use the shared HR operating timezone.
// Singapore and Manila are both UTC+8; keeping one canonical IANA zone avoids
// browser/server timezone differences in applicant and audit views.
export const PORTAL_TIME_ZONE = "Asia/Singapore";

function parsePortalDate(value: string, dateOnly = false) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatPortalDateTime(value: string, includeTime = true) {
  const parsed = parsePortalDate(value, !includeTime);
  if (!parsed) return value || "Not Provided";
  return new Intl.DateTimeFormat(undefined, {
    timeZone: PORTAL_TIME_ZONE,
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" } : {}),
  }).format(parsed);
}

export function formatPortalDateKey(value: Date | string) {
  const parsed = value instanceof Date ? value : parsePortalDate(value);
  if (!parsed) return String(value || "");
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PORTAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}
