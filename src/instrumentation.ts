/**
 * Next.js `register()` runs once per server process start. On Vercel Fluid
 * Compute that means once per *warm serverless instance* — and any recurring
 * timer started here keeps burning Active CPU on that instance for as long as
 * it stays warm, even with nobody using the portal, and independently on every
 * Preview deployment.
 *
 * Recurring maintenance therefore does NOT live here any more. The three jobs
 * that used to be scheduled from this file —
 *
 *   - syncPastBookedInterviewsNoShow()   (was every 5 minutes)
 *   - syncPastAvailableInterviewSlots()  (was every 5 minutes)
 *   - cleanupExpiredResumeFiles()        (was every 60 minutes)
 *
 * are now driven by a single external scheduler (n8n) calling the protected
 * endpoint `POST /api/internal/maintenance` with `INTERNAL_API_SECRET`. That
 * gives exactly one controlled execution per job, no idle CPU on warm
 * instances, and no background execution from Preview deployments.
 *
 * See docs/VERCEL-CPU-REDUCTION.md for the scheduler setup.
 */
export async function register() {
  // Intentionally empty. Never schedule recurring timers here — see above.
}
