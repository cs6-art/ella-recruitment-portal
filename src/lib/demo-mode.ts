/**
 * Demo mode renders a synthetic recruitment history for client presentations.
 *
 * Two hard guarantees, because the live portal is wired to n8n workflows that
 * email and phone-call real candidates:
 *
 *  1. Demo data is produced entirely in memory and is never written anywhere.
 *     Nothing reaches Google Sheets, so the n8n pollers that watch those tabs
 *     cannot observe a change and cannot fire.
 *  2. `middleware.ts` refuses every mutating API request while demo mode is on,
 *     so a stray click during a presentation cannot POST to a webhook either.
 *
 * Keep this module dependency-free: `middleware.ts` runs on the Edge runtime.
 */
export function isDemoMode() {
  return process.env.DEMO_MODE === "true";
}
