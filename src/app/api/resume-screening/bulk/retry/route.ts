import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { canManagePipeline, canManageRolePipeline } from "@/lib/access-control";
import { appendBulkResumeQueueEvent, getBulkResumeQueue, getBulkResumeScreeningEvidence, getBulkResumeApplicantSubmissionEvidence } from "@/lib/candidate-applications";
import { enqueueBulkResumeJob } from "@/lib/bulk-resume-queue";
import { notifyBulkResumeBatchComplete } from "@/lib/bulk-resume-notifications";
import { bulkResumeEnvironment, bulkResumeIsUatMarked } from "@/lib/bulk-resume-config";
import { getRoleRequestById, isPublishedRoleForIntake } from "@/lib/google-sheets";
import { consumeRateLimit, rateLimitHeaders, requestClientKey } from "@/lib/rate-limit";
import { findUploadedResumeFile, getResumeFileRecord } from "@/lib/resume-files";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STALE_JOB_MS = 50 * 60 * 1000;

function responseError(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

function fileIdFromUrl(url: string) {
  return url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,80})/)?.[1] || "";
}

export async function POST(request: Request) {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) return responseError("Authentication required.", 401);
  if (!canManagePipeline(user)) return responseError("Only HR reviewers can retry bulk resumes.", 403);
  const rate = consumeRateLimit(`bulk-resume-retry:${user.email}:${requestClientKey(request)}`, 60, 15 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ success: false, error: "Too many retry requests. Try again later." }, { status: 429, headers: rateLimitHeaders(rate) });

  try {
    const body = await request.json() as Record<string, unknown>;
    const roleId = String(body.roleId || "").trim();
    const queueId = String(body.queueId || "").trim();
    if (!roleId || !/^BULK-[A-Z0-9_-]+-[a-f0-9]{64}$/i.test(queueId)) return responseError("Choose a valid failed resume to retry.", 422);

    const role = await getRoleRequestById(roleId);
    if (!role || !isPublishedRoleForIntake(role)) return responseError("The selected role is no longer published.", 409);
    if (!canManageRolePipeline(user, role)) return responseError("Only HR reviewers can retry resumes for this role.", 403);

    const queue = await getBulkResumeQueue(roleId, { fresh: true });
    const item = queue.find((candidate) => candidate.driveFileId === queueId && candidate.roleId.toLowerCase() === roleId.toLowerCase());
    if (!item) return responseError("The resume queue record could not be found. Refresh the page and try again.", 404);
    const evidence = await getBulkResumeScreeningEvidence([item]);
    if (evidence.has(`${item.roleId.toLowerCase()}|${item.driveFileId.toLowerCase()}`)) {
      await appendBulkResumeQueueEvent({
        ...item,
        driveFileId: item.driveFileId,
        roleId,
        status: "Screened",
        errorMessage: "",
        processedAt: item.processedAt || new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      });
      return NextResponse.json({ success: true, status: "Screened", queueId, message: "The saved screening result was found; no duplicate screening was started." });
    }
    const submittedApplications = await getBulkResumeApplicantSubmissionEvidence([item]);
    if (submittedApplications.has(`${item.roleId.toLowerCase()}|${item.driveFileId.toLowerCase()}`)) {
      return responseError("A candidate application already exists, but its screening result is not saved yet. Check the applicant record before starting another attempt; duplicate screening was blocked.", 409);
    }

    const age = Date.now() - Date.parse(item.lastUpdated || item.processingStartedAt || item.discoveredAt);
    const stale = !Number.isFinite(age) || age >= STALE_JOB_MS;
    const status = item.status.toLowerCase();
    const ambiguousDispatch = item.errorMessage.toLowerCase().includes("may have reached candidate screening");
    if (ambiguousDispatch && !stale) {
      return responseError("The previous workflow request may still be completing. Wait 50 minutes, then refresh status before retrying to avoid duplicate screening.", 409);
    }
    if (!stale && ["queued", "processing", "screened", "processed"].includes(status)) {
      return responseError("This resume is still active in the queue. Refresh status before retrying it.", 409);
    }
    if (status !== "failed" && !stale) return responseError("Only a failed or abandoned resume can be retried.", 409);

    const resumeFileId = fileIdFromUrl(item.driveFileUrl);
    const environment = item.environment === "uat" ? "uat" : bulkResumeEnvironment();
    // The upload can be saved in Drive while the browser loses the response
    // carrying its file ID; fall back to the file tagged with this queue ID.
    const resumeFile = (resumeFileId ? await getResumeFileRecord(resumeFileId) : null)
      || await findUploadedResumeFile(queueId, environment);
    const expectedSha = queueId.match(/-([a-f0-9]{64})$/i)?.[1]?.toLowerCase();
    if (!resumeFile || !expectedSha || resumeFile.sha256.toLowerCase() !== expectedSha) {
      return responseError("The stored resume is no longer available. Upload the file again to retry screening.", 410);
    }

    const batchId = `RETRY-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const attemptCount = Number(item.attemptCount || 0) + 1;
    const isUat = item.isUat ?? bulkResumeIsUatMarked();
    const now = new Date().toISOString();
    const message = {
      queueId,
      roleId,
      resumeFileId: resumeFile.fileId,
      sha256: resumeFile.sha256,
      fileName: item.driveFileName || resumeFile.fileName,
      mimeType: resumeFile.mimeType,
      applicationId: item.applicationId || `APP-${crypto.createHash("sha256").update(`${roleId}:${resumeFile.sha256}`).digest("hex").slice(0, 24)}`,
      batchId,
      batchSize: 1,
      submittedByEmail: user.email,
      attemptCount,
      environment,
      isUat,
    } as const;

    await appendBulkResumeQueueEvent({
      ...item,
      driveFileId: queueId,
      driveFileName: message.fileName,
      driveFileUrl: item.driveFileUrl || `https://drive.google.com/file/d/${resumeFile.fileId}/view`,
      driveFileMimeType: message.mimeType,
      roleId,
      status: "Queued",
      applicationId: message.applicationId,
      errorMessage: "Retry queued by HR.",
      processingStartedAt: "",
      processedAt: "",
      attemptCount: String(attemptCount),
      lastUpdated: now,
      environment,
      isUat,
      batchId,
      jobId: queueId,
      batchSize: "1",
      submittedByEmail: user.email,
    });
    try {
      await enqueueBulkResumeJob(message);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The durable screening queue is unavailable.";
      await appendBulkResumeQueueEvent({
        ...item,
        driveFileId: queueId,
        roleId,
        status: "Failed",
        errorMessage: `The screening queue rejected this retry: ${reason}`,
        processedAt: new Date().toISOString(),
        attemptCount: String(attemptCount),
        lastUpdated: new Date().toISOString(),
        environment,
        isUat,
        batchId,
        jobId: queueId,
        batchSize: "1",
        submittedByEmail: user.email,
      });
      await notifyBulkResumeBatchComplete(roleId, batchId);
      return responseError("The durable screening queue is unavailable. This file remains saved and can be retried again.", 503);
    }
    return NextResponse.json({ success: true, queueId, batchId, status: "Queued", message: "This resume was queued for another screening attempt." }, { status: 202 });
  } catch (error) {
    console.error("[Bulk Resume Retry] Request failed:", error);
    return responseError(error instanceof Error ? error.message : "Unable to retry this resume.", 400);
  }
}
