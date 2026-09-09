import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("instrumentation.register() schedules no recurring maintenance", () => {
  const source = read("src/instrumentation.ts");
  assert.doesNotMatch(source, /setInterval\(/);
  assert.doesNotMatch(source, /setTimeout\(/);
  assert.doesNotMatch(source, /import\(/); // no dynamic maintenance imports
});

test("internal maintenance route is secret-gated, preview-safe, idempotent", () => {
  const source = read("src/app/api/internal/maintenance/route.ts");
  assert.match(source, /export const runtime = "nodejs"/);
  assert.match(source, /INTERNAL_API_SECRET/);
  assert.match(source, /crypto\.timingSafeEqual/);
  assert.match(source, /status: 401/);
  // Preview deployments must be refused even with a valid secret.
  assert.match(source, /isBackgroundMaintenanceAllowed\(\)/);
  assert.match(source, /status: 403/);
  // All three jobs are reachable from the one scheduler.
  assert.match(source, /syncPastBookedInterviewsNoShow/);
  assert.match(source, /syncPastAvailableInterviewSlots/);
  assert.match(source, /cleanupExpiredResumeFiles/);
  assert.match(source, /isDemoMode\(\)/);
});

test("deployment-env treats Preview as unsafe for background maintenance", () => {
  const source = read("src/lib/deployment-env.ts");
  assert.match(source, /VERCEL_ENV/);
  assert.match(source, /isPreviewDeployment/);
  assert.match(source, /isBackgroundMaintenanceAllowed/);
  assert.match(source, /return !isPreviewDeployment\(\)/);
});

test("notification feed polls slowly and only while the tab is visible", () => {
  const source = read("src/components/notification-feed.ts");
  const match = source.match(/const POLL_MS = ([\d_]+);/);
  assert.ok(match, "POLL_MS is defined");
  const pollMs = Number(match[1].replace(/_/g, ""));
  assert.ok(pollMs >= 600_000, `POLL_MS should be >= 10min, got ${pollMs}`);
  assert.match(source, /document\.visibilityState === "visible"/);
  assert.match(source, /addEventListener\("focus"/);
});

test("no-show sync indexes side sheets by application id instead of rescanning", () => {
  const source = read("src/lib/applicant-workflow.ts");
  assert.match(source, /applicantIndexById/);
  assert.match(source, /queueByApplication/);
  assert.match(source, /trackingByApplication/);
  assert.match(source, /const todayFor =/);
  // The per-slot O(n^2) findIndex inside syncPastBookedInterviewsNoShow is gone.
  const syncBody = source.slice(source.indexOf("export async function syncPastBookedInterviewsNoShow"));
  assert.doesNotMatch(syncBody, /applicantsData\.rows\.findIndex/);
  assert.match(syncBody, /applicantIndexById\.get\(applicationIdKey\)/);
});
