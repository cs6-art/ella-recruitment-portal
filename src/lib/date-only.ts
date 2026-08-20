/**
 * Normalizes the date strings that Google Sheets returns for date-only
 * columns. Sheets commonly returns a locale-formatted value (for example,
 * `8/27/2026`), while HTML date inputs accept only `2026-08-27`.
 */
export function normalizeDateOnly(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  const monthFirst = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : monthFirst
      ? { year: Number(monthFirst[3]), month: Number(monthFirst[1]), day: Number(monthFirst[2]) }
      : null;

  if (!parts) return text;
  const candidate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const valid = candidate.getUTCFullYear() === parts.year
    && candidate.getUTCMonth() === parts.month - 1
    && candidate.getUTCDate() === parts.day;
  if (!valid) return text;
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/** Returns a value safe to assign to <input type="date">. */
export function toDateInputValue(value: unknown): string {
  const normalized = normalizeDateOnly(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}
