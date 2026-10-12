import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { appendBulkResumeQueueEvent, getBulkResumeQueue, getBulkResumeScreeningEvidence, getBulkResumeApplicantSubmissionEvidence } from "@/lib/candidate-applications";
import { enqueueBulkResumeJob } from "@/lib/bulk-resume-queue";
import { notifyReadyBulkResumeBatches } from "@/lib/bulk-resume-notifications";
import { getResumeFileRecord } from "@/lib/resume-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RECOVER_AFTER_MS = 5 * 60 * 1000;
const MAX_RECOVERIES_PER_RUN = 100;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!secret || supplied.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}

function fileIdFromUrl(url: string) {
  return url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,80})/)?.[1] || "";
}

function stableQueueId(value: string) {
  return /^BULK-[A-Z0-9_-]+-[a-f0-9]{64}$/i.test(value);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

  try {
    const now = Date.now();
    const queue = await getBulkResumeQueue("", { fresh: true });
    const staleQueued = queue
      .filter((item) => item.status.toLowerCase() === "queued" && stableQueueId(item.driveFileId))
      .filter((item) => {
        const updated = Date.parse(item.lastUpdated || item.discoveredAt);
        return !Number.isFinite(updated) || now - updated >= RECOVER_AFTER_MS;
      })
      .slice(0, MAX_RECOVERIES_PER_RUN);
    const screeningEvidence = await getBulkResumeScreeningEvidence(staleQueued);
    const submittedApplications = await getBulkResumeApplicantSubmissionEvidence(staleQueued);
    let recovered = 0;
    let completed = 0;
    let waitingForResult = 0;
    let failed = 0;

    for (const item of staleQueued) {
      const key = `${item.roleId.toLowerCase()}|${item.driveFileId.toLowerCase()}`;
      const nowIso = new Date().toISOString();
      if (screeningEvidence.has(key)) {
        await appendBulkResumeQueueEvent({ ...item, status: "Screened", errorMessage: "", processedAt: item.processedAt || nowIso, lastUpdated: nowIso });
        completed += 1;
        continue;
      }
      if (submittedApplications.has(key)) {
        await appendBulkResumeQueueEvent({
          ...item,
          status: "Processing",
          errorMessage: "The candidate application already exists. Waiting for its saved screening result; duplicate screening was blocked.",
          processingStartedAt: item.processingStartedAt || nowIso,
          lastUpdated: nowIso,
        });
        waitingForResult += 1;
        continue;
      }

      const resumeFileId = fileIdFromUrl(item.driveFileUrl);
      const record = resumeFileId ? await getResumeFileRecord(resumeFileId) : null;
      const expectedSha = item.driveFileId.match(/-([a-f0-9]{64})$/i)?.[1]?.toLowerCase() || "";
      if (!record || !expectedSha || record.sha256.toLowerCase() !== expectedSha) {
        await appendBulkResumeQueueEvent({
          ...item,
          status: "Failed",
          errorMessage: "The saved resume could not be verified during queue recovery. Upload the file again to retry.",
          processedAt: nowIso,
          lastUpdated: nowIso,
        });
        failed += 1;
        continue;
      }

      const attemptCount = Math.max(1, Number.parseInt(item.attemptCount || "1", 10) || 1);
      const message = {
        queueId: item.driveFileId,
        roleId: item.roleId,
        resumeFileId: record.fileId,
        sha256: record.sha256,
        fileName: item.driveFileName || record.fileName,
        mimeType: record.mimeType,
        applicationId: item.applicationId || `APP-${crypto.createHash("sha256").update(`${item.roleId}:${record.sha256}`).digest("hex").slice(0, 24)}`,
        batchId: item.batchId || `RECOVERY-${item.driveFileId.slice(-16)}`,
        batchSize: Math.max(1, Number.parseInt(item.batchSize || "1", 10) || 1),
        submittedByEmail: item.submittedByEmail || "",
        attemptCount,
        environment: item.environment === "uat" ? "uat" as const : "production" as const,
        isUat: item.isUat === true || item.environment === "uat",
      };
      try {
        await enqueueBulkResumeJob(message);
        await appendBulkResumeQueueEvent({
          ...item,
          driveFileUrl: item.driveFileUrl,
          applicationId: message.applicationId,
          status: "Queued",
          errorMessage: "Queue delivery was recovered automatically.",
          attemptCount: String(attemptCount),
          environment: message.environment,
          isUat: message.isUat,
          batchId: message.batchId,
          jobId: item.driveFileId,
          batchSize: String(message.batchSize),
          submittedByEmail: message.submittedByEmail,
          lastUpdated: nowIso,
        });
        recovered += 1;
      } catch (error) {
        console.error("[Bulk Resume Recovery] Unable to re-enqueue job", { roleId: item.roleId, queueId: item.driveFileId, reason: error instanceof Error ? error.message : "Unknown error" });
        await appendBulkResumeQueueEvent({
          ...item,
          status: "Queued",
          errorMessage: "Automatic queue recovery could not publish this job. It will be retried on the next recovery run.",
          lastUpdated: nowIso,
        }).catch((appendError) => console.error("[Bulk Resume Recovery] Unable to record recovery failure:", appendError));
      }
    }

    await notifyReadyBulkResumeBatches();
    return NextResponse.json({ success: true, examined: staleQueued.length, recovered, completed, waitingForResult, failed, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[Bulk Resume Recovery] Recovery run failed:", error);
    return NextResponse.json({ success: false, error: "Bulk resume queue recovery failed. The next scheduled run will try again." }, { status: 503 });
  }
}
