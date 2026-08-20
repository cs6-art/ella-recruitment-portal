/**
 * Demo mode renders a synthetic recruitment history for client presentations
 * as a read-only safety boundary.
 *
 * The portal is wired to n8n workflows that email and phone real candidates, so
 * demo mode keeps live records out of presentation views and disables every
 * applicant-facing side effect. This is intentionally stricter than a date
 * cutoff: a presenter must never accidentally email, call, schedule, or
 * modify a real applicant while the demo environment is enabled.
 *
 * Keep this module dependency-free: `proxy.ts` runs on the Edge runtime.
 */
export function isDemoMode() {
  return process.env.DEMO_MODE === "true";
}

/**
 * Records at or after this instant are demo data; anything older is the
 * protected real history.
 *
 * Set `DEMO_CUTOFF` (any parseable timestamp, e.g. "2026-08-20T09:00:00+08:00")
 * to pin it to the moment the demo starts. That is the safest option, because
 * it narrows the window in which a genuine applicant could be mistaken for a
 * test record.
 *
 * Without it, the cutoff defaults to midnight today in the portal timezone.
 * Every serverless instance derives the same value from the calendar date, so
 * the boundary stays stable across cold starts and redeploys.
 */
export function demoCutoffMs(): number {
  const configured = process.env.DEMO_CUTOFF?.trim();
  if (configured) {
    const parsed = Date.parse(configured);
    if (Number.isFinite(parsed)) return parsed;
  }

  // Asia/Singapore (the portal default) is a fixed +08:00 with no DST, so the
  // date in that zone plus a fixed offset is an exact instant.
  const timeZone = process.env.PORTAL_TIMEZONE || "Asia/Singapore";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const midnight = Date.parse(`${today}T00:00:00+08:00`);
  return Number.isFinite(midnight) ? midnight : Date.now();
}

/** True when a record's timestamp is on or after the optional demo cutoff. */
export function isDemoWindowRecord(timestamp: string | undefined | null): boolean {
  const parsed = Date.parse(String(timestamp ?? ""));
  return Number.isFinite(parsed) && parsed >= demoCutoffMs();
}
