/**
 * Demo mode renders a synthetic recruitment history for client presentations
 * while leaving the live system fully operable.
 *
 * The portal is wired to n8n workflows that email and phone real candidates, so
 * demo mode draws a hard line by record age:
 *
 *  - Records created BEFORE the cutoff are the real back catalogue. They are
 *    hidden from every list, so a presenter never sees them and cannot act on
 *    them, and candidate-contacting routes refuse them outright.
 *  - Records created AFTER the cutoff are treated as demo/test data. They stay
 *    fully visible and actionable, so the whole workflow -- role request,
 *    approval, publish, application, screening, voice call, final booking --
 *    can be driven live in front of a client.
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

/** True when a record's timestamp puts it in the actionable demo window. */
export function isDemoWindowRecord(timestamp: string | undefined | null): boolean {
  const parsed = Date.parse(String(timestamp ?? ""));
  return Number.isFinite(parsed) && parsed >= demoCutoffMs();
}
