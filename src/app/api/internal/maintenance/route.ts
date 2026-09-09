import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { syncPastBookedInterviewsNoShow, syncPastAvailableInterviewSlots } from "@/lib/applicant-workflow";
import { cleanupExpiredResumeFiles } from "@/lib/resume-files";
import { isDemoMode } from "@/lib/demo-mode";
import { deploymentEnvironment, isBackgroundMaintenanceAllowed } from "@/lib/deployment-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A full maintenance pass reads several Sheets tabs behind the shared pacing
// limiter; give it room without letting it run unbounded.
export const maxDuration = 300;

// The single controlled scheduler (n8n) authenticates with this shared secret.
// Kept separate from N8N_WEBHOOK_SECRET so the maintenance trigger can be
// rotated independently of the candidate/role workflow webhooks.
function isAuthorized(request: Request): boolean {
  const expected = process.env.INTERNAL_API_SECRET?.trim();
  if (!expected) return false;
  const header = request.headers.get("x-internal-secret")?.trim()
    || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!header) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(header);
  return expectedBuffer.length === receivedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

type JobName = "interview-no-show" | "interview-slots" | "resume-cleanup";
const ALL_JOBS: JobName[] = ["interview-no-show", "interview-slots", "resume-cleanup"];

async function runJob(job: JobName): Promise<{ job: JobName; ok: boolean; result?: unknown; skipped?: string; error?: string; ms: number }> {
  const start = Date.now();
  try {
    if (job === "interview-no-show") {
      const result = await syncPastBookedInterviewsNoShow();
      return { job, ok: true, result: { changed: result }, ms: Date.now() - start };
    }
    if (job === "interview-slots") {
      const result = await syncPastAvailableInterviewSlots();
      return { job, ok: true, result: { expired: result }, ms: Date.now() - start };
    }
    // resume-cleanup: demo mode deliberately keeps scheduled Drive cleanup away
    // from protected historical files (matches the pre-cron behaviour).
    if (isDemoMode()) return { job, ok: true, skipped: "demo-mode", ms: Date.now() - start };
    const result = await cleanupExpiredResumeFiles();
    return { job, ok: true, result, ms: Date.now() - start };
  } catch (error) {
    return { job, ok: false, error: error instanceof Error ? error.message : String(error), ms: Date.now() - start };
  }
}

/**
 * Protected maintenance trigger. One external scheduler (n8n) POSTs here on a
 * cron; nothing else runs these jobs. Idempotent — every job only reconciles
 * state that is already past-due, and each has its own in-flight guard, so
 * overlapping calls are harmless.
 *
 * Body (optional): { "jobs": ["interview-no-show" | "interview-slots" | "resume-cleanup"] }
 * With no body, all three run in sequence.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  // Preview deployments share production credentials + spreadsheet. They must
  // never run background maintenance, write shared Sheets, or fire candidate
  // side effects — refuse regardless of a valid secret.
  if (!isBackgroundMaintenanceAllowed()) {
    return NextResponse.json(
      { success: false, error: "Maintenance is disabled on non-production deployments.", environment: deploymentEnvironment() },
      { status: 403 },
    );
  }

  let jobs: JobName[] = ALL_JOBS;
  try {
    const body = await request.json().catch(() => null);
    if (body && Array.isArray(body.jobs)) {
      const requested = body.jobs.filter((value: unknown): value is JobName => ALL_JOBS.includes(value as JobName));
      if (requested.length > 0) jobs = requested;
    }
  } catch {
    // No/invalid body — run the full pass.
  }

  const results = [];
  for (const job of jobs) {
    results.push(await runJob(job));
  }

  const success = results.every((entry) => entry.ok);
  return NextResponse.json(
    { success, environment: deploymentEnvironment(), ranAt: new Date().toISOString(), results },
    { status: success ? 200 : 500, headers: { "Cache-Control": "no-store" } },
  );
}
