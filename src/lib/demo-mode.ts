/**
 * Demo mode renders a synthetic recruitment history for client presentations
 * while allowing new test roles and applicants to move through internal
 * workflow steps.
 *
 * The portal is wired to n8n workflows that email and phone real candidates, so
 * demo mode keeps older live history out of presentation views and protects
 * those historical records from applicant-facing side effects. New records
 * after the cutoff remain visible and can complete the live demo workflow.
 *
 * Keep this module dependency-free: `proxy.ts` runs on the Edge runtime.
 */
export function isDemoMode() {
  return process.env.DEMO_MODE === "true";
}

/**
 * Records at or after this instant are active workflow data; anything older
 * is protected historical data.
 *
 * Set `DEMO_CUTOFF` (any parseable timestamp, e.g. "2026-08-20T09:00:00+08:00")
 * to pin it to the moment the demo starts. That is the safest option, because
 * it narrows the window in which a genuine applicant could be mistaken for a
 * test record.
 *
 * Without it, use the fixed production baseline below. Never derive this from
 * "today": a moving daily cutoff would make yesterday's valid applicants
 * historical after midnight and break follow-up workflows.
 */
export function demoCutoffMs(): number {
  const configured = process.env.DEMO_CUTOFF?.trim();
  if (configured) {
    const parsed = Date.parse(configured);
    if (Number.isFinite(parsed)) return parsed;
  }

  // August 20, 2026 is intentionally inclusive. Applications and roles from
  // this instant onward remain valid on every future day and deployment.
  return Date.parse("2026-08-20T00:00:00+08:00");
}

/** True when a record's timestamp is on or after the optional demo cutoff. */
export function isDemoWindowRecord(timestamp: string | undefined | null): boolean {
  const parsed = Date.parse(String(timestamp ?? ""));
  return Number.isFinite(parsed) && parsed >= demoCutoffMs();
}

/** Allow real side effects only for records created during the active demo. */
export function isDemoSideEffectAllowed(timestamp: string | undefined | null): boolean {
  return !isDemoMode() || isDemoWindowRecord(timestamp);
}
