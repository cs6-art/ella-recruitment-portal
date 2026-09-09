/**
 * Deployment-environment guardrails.
 *
 * Vercel sets `VERCEL_ENV` to "production" | "preview" | "development" on every
 * function invocation. Preview deployments (every non-production branch/PR
 * build) run with the *same* environment variables as production unless they
 * are overridden per-environment — same Google service account, same
 * spreadsheet, same n8n secret. That makes it unsafe for a Preview deployment
 * to run background maintenance: a warm Preview instance would write shared
 * production Google Sheets and could trigger candidate-facing side effects.
 *
 * Non-Vercel environments (local `next dev` / `next start`, CI) report no
 * `VERCEL_ENV`; those are treated as non-preview so an explicitly triggered
 * local maintenance run still works.
 *
 * Keep this module dependency-free so it is safe to import anywhere.
 */

export type DeploymentEnvironment = "production" | "preview" | "development" | "unknown";

export function deploymentEnvironment(): DeploymentEnvironment {
  const value = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (value === "production" || value === "preview" || value === "development") return value;
  return "unknown";
}

/** True on a Vercel Preview deployment (branch/PR build). */
export function isPreviewDeployment(): boolean {
  return deploymentEnvironment() === "preview";
}

/**
 * True only where running background maintenance against the shared production
 * Google Sheets / Drive is safe: real production, or a non-Vercel host (local,
 * CI). Preview deployments are always excluded.
 */
export function isBackgroundMaintenanceAllowed(): boolean {
  return !isPreviewDeployment();
}
