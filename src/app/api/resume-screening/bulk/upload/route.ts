import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { canManagePipeline, canManageRolePipeline } from "@/lib/access-control";
import { appendBulkResumeQueueEvent, getBulkResumeQueue, getBulkResumeScreeningEvidence, getBulkResumeApplicantSubmissionEvidence, type BulkResumeQueueItem } from "@/lib/candidate-applications";
import { enqueueBulkResumeJob } from "@/lib/bulk-resume-queue";
import { bulkResumeEnvironment, bulkResumeIsUatMarked } from "@/lib/bulk-resume-config";
import { notifyBulkResumeBatchComplete } from "@/lib/bulk-resume-notifications";
import { validateCandidateResume } from "@/lib/resume-contact-extraction";
import { getRoleRequestById, isPublishedRoleForIntake } from "@/lib/google-sheets";
import { consumeRateLimit, rateLimitHeaders, requestClientKey } from "@/lib/rate-limit";
import { createResumeUploadSession, deleteResumeFile, getResumeFileRecord, readResumeFile, storeResumeFile, MAX_RESUME_FILE_BYTES } from "@/lib/resume-files";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_FILES_PER_BATCH = 20;
const STALE_JOB_MS = 50 * 60 * 1000;

type PrepareFile = { fileName: string; mimeType: string; size: number; sha256: string };

function errorResponse(error: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

function queueIdForHash(roleId: string, sha256: string) {
  const roleKey = roleId.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "-");
  return `BULK-${roleKey}-${sha256.toLowerCase()}`;
}

function driveFileUrl(fileId: string) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

function fileIdFromUrl(url: string) {
  return url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,80})/)?.[1] || "";
}

function queueAge(item: BulkResumeQueueItem) {
  const timestamp = Date.parse(item.lastUpdated || item.processedAt || item.processingStartedAt || item.discoveredAt);
  return Number.isFinite(timestamp) ? Date.now() - timestamp : Number.MAX_SAFE_INTEGER;
}

function rateLimit(request: Request, email: string) {
  return consumeRateLimit(`bulk-resume-file-upload:${email}:${requestClientKey(request)}`, 120, 15 * 60 * 1000);
}

async function requireRole(request: Request) {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) return { response: errorResponse("Authentication required.", 401) };
  if (!canManagePipeline(user)) return { response: errorResponse("Only HR reviewers can upload bulk resumes.", 403) };
  const rate = rateLimit(request, user.email);
  if (!rate.allowed) return { response: NextResponse.json({ success: false, error: "Too many resume uploads. Try again later." }, { status: 429, headers: rateLimitHeaders(rate) }) };
  return { user };
}

async function loadPublishedRole(user: NonNullable<Awaited<ReturnType<typeof verifySessionToken>>>, roleId: string) {
  const role = await getRoleRequestById(roleId);
  if (!role || !isPublishedRoleForIntake(role)) return { error: errorResponse("The selected role is not available for bulk screening.", 409) };
  if (!canManageRolePipeline(user, role)) return { error: errorResponse("Only HR reviewers can upload bulk resumes for this role.", 403) };
  return { role };
}

async function appendSkippedDuplicate(input: {
  roleId: string;
  queueId: string;
  batchId: string;
  batchSize: number;
  submittedByEmail: string;
  fileName: string;
  mimeType: string;
  applicationId?: string;
  previous?: BulkResumeQueueItem;
  message: string;
}) {
  const now = new Date().toISOString();
  const skippedId = `SKIPPED-${crypto.createHash("sha256").update(`${input.queueId}:${input.batchId}:${crypto.randomUUID()}`).digest("hex").slice(0, 32)}`;
  await appendBulkResumeQueueEvent({
    driveFileId: skippedId,
    driveFileName: input.fileName,
    driveFileUrl: input.previous?.driveFileUrl || "",
    driveFileMimeType: input.mimeType,
    roleId: input.roleId,
    candidateName: input.previous?.candidateName || "",
    candidateEmail: input.previous?.candidateEmail || "",
    status: "Skipped",
    applicationId: input.applicationId || input.previous?.applicationId || "",
    errorMessage: input.message,
    discoveredAt: now,
    processedAt: now,
    attemptCount: "0",
    lastUpdated: now,
    environment: bulkResumeEnvironment(),
    isUat: bulkResumeIsUatMarked(),
    batchId: input.batchId,
    jobId: input.queueId,
    batchSize: String(input.batchSize),
    submittedByEmail: input.submittedByEmail,
  });
  return { queueId: input.queueId, status: "Skipped", message: input.message };
}

function previousForQueue(queue: BulkResumeQueueItem[], queueId: string) {
  // Skipped duplicate submissions are separate audit rows that carry the
  // stable queue ID in jobId. They must never shadow the actual resume row.
  return queue.find((item) => item.driveFileId === queueId)
    || queue.filter((item) => item.jobId === queueId && !item.driveFileId.startsWith("SKIPPED-"))
      .sort((left, right) => Date.parse(right.lastUpdated || right.discoveredAt) - Date.parse(left.lastUpdated || left.discoveredAt))[0];
}

async function prepare(request: Request, body: Record<string, unknown>) {
  const roleId = String(body.roleId || "").trim();
  const batchId = String(body.batchId || "").trim();
  const files = Array.isArray(body.files) ? body.files as PrepareFile[] : [];
  if (!roleId) return errorResponse("Select a published role before uploading resumes.", 422);
  if (!/^[a-zA-Z0-9_-]{12,80}$/.test(batchId)) return errorResponse("The upload batch identifier is invalid.", 422);
  if (!files.length) return errorResponse("Choose at least one PDF, DOC, or DOCX resume.", 422);
  if (files.length > MAX_FILES_PER_BATCH) return errorResponse(`Upload up to ${MAX_FILES_PER_BATCH} resumes per batch.`, 422);

  const access = await requireRole(request);
  if (access.response) return access.response;
  const { user } = access;
  const roleResult = await loadPublishedRole(user, roleId);
  if (roleResult.error) return roleResult.error;

  const invalid = files.filter((file) => !file || !/\.(pdf|docx?)$/i.test(String(file.fileName || ""))
    || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_RESUME_FILE_BYTES
    || !/^[a-f0-9]{64}$/i.test(String(file.sha256 || ""))
    || (file.mimeType && !["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream"].includes(file.mimeType)));
  if (invalid.length) return errorResponse("One or more uploads have invalid file metadata. Use non-empty PDF, DOC, or DOCX files up to 10 MB each.", 422);

  const queue = await getBulkResumeQueue(roleId, { fresh: true });
  const screeningEvidence = await getBulkResumeScreeningEvidence(queue);
  const submittedApplications = await getBulkResumeApplicantSubmissionEvidence(queue);
  const claimedInBatch = new Set<string>();
  const prepared: Array<Record<string, unknown>> = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const sha256 = file.sha256.toLowerCase();
    const queueId = queueIdForHash(roleId, sha256);
    const previous = previousForQueue(queue, queueId);
    if (claimedInBatch.has(queueId)) {
      prepared.push({ ...await appendSkippedDuplicate({ roleId, queueId, batchId, batchSize: files.length, submittedByEmail: user.email, fileName: file.fileName, mimeType: file.mimeType, previous, message: "Duplicate file selected in this same upload." }), fileIndex: index });
      continue;
    }
    claimedInBatch.add(queueId);

    const hasSavedResult = Boolean(previous && screeningEvidence.has(`${previous.roleId.toLowerCase()}|${previous.driveFileId.toLowerCase()}`));
    const alreadySubmitted = Boolean(previous && submittedApplications.has(`${previous.roleId.toLowerCase()}|${previous.driveFileId.toLowerCase()}`));
    const status = previous?.status.toLowerCase() || "";
    const activeOrRecent = ["queued", "processing", "screened", "processed"].includes(status) && queueAge(previous!) < STALE_JOB_MS;
    if (previous && (hasSavedResult || alreadySubmitted || activeOrRecent)) {
      const message = hasSavedResult || ["screened", "processed"].includes(status)
        ? "This resume has already been screened for this role."
        : alreadySubmitted ? "A candidate application already exists for this resume. It was not submitted again to avoid duplicate screening."
        : status === "queued" ? "This resume is already waiting in the screening queue." : "This resume is already being screened for this role.";
      prepared.push({ ...await appendSkippedDuplicate({ roleId, queueId, batchId, batchSize: files.length, submittedByEmail: user.email, fileName: file.fileName, mimeType: file.mimeType, previous, message }), fileIndex: index });
      continue;
    }

    try {
      const session = await createResumeUploadSession({
        fileName: file.fileName,
        mimeType: file.mimeType,
        size: file.size,
        sha256,
        roleId,
        queueId,
        ownerEmail: user.email,
        environment: bulkResumeEnvironment(),
      });
      prepared.push({ queueId, fileName: session.fileName, mimeType: session.mimeType, status: "Uploading", uploadUrl: session.uploadUrl, fileIndex: index });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Private resume storage could not start the upload.";
      const now = new Date().toISOString();
      await appendBulkResumeQueueEvent({
        driveFileId: queueId,
        driveFileName: file.fileName,
        driveFileUrl: "",
        driveFileMimeType: file.mimeType,
        roleId,
        status: "Failed",
        errorMessage: message,
        discoveredAt: now,
        processedAt: now,
        attemptCount: "0",
        lastUpdated: now,
        environment: bulkResumeEnvironment(),
        isUat: bulkResumeIsUatMarked(),
        batchId,
        jobId: queueId,
        batchSize: String(files.length),
        submittedByEmail: user.email,
      });
      prepared.push({ queueId, fileName: file.fileName, status: "Failed", error: message, fileIndex: index });
    }
  }

  await notifyBulkResumeBatchComplete(roleId, batchId);
  return NextResponse.json({ success: true, roleId, batchId, batchSize: files.length, files: prepared });
}

async function finalize(request: Request, body: Record<string, unknown>) {
  const roleId = String(body.roleId || "").trim();
  const batchId = String(body.batchId || "").trim();
  const batchSize = Number(body.batchSize || 1);
  const queueId = String(body.queueId || "").trim();
  const resumeFileId = String(body.resumeFileId || "").trim();
  if (!roleId || !queueId || !resumeFileId || !/^[a-zA-Z0-9_-]{12,80}$/.test(batchId) || !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MAX_FILES_PER_BATCH) return errorResponse("The uploaded resume is missing required screening details.", 422);

  const access = await requireRole(request);
  if (access.response) return access.response;
  const { user } = access;
  const roleResult = await loadPublishedRole(user, roleId);
  if (roleResult.error) return roleResult.error;

  try {
    const uploadRecord = await getResumeFileRecord(resumeFileId);
    if (!uploadRecord || uploadRecord.uploadQueueId !== queueId || uploadRecord.uploadRoleId?.toLowerCase() !== roleId.toLowerCase() || uploadRecord.uploadOwnerEmail?.toLowerCase() !== user.email.toLowerCase()) {
      return errorResponse("The stored file does not match this upload session. Start the upload again.", 403);
    }

    const bytes = await readResumeFile(uploadRecord);
    const actualSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    if (actualSha256 !== uploadRecord.sha256.toLowerCase() || queueId !== queueIdForHash(roleId, actualSha256)) {
      await deleteResumeFile(uploadRecord).catch(() => undefined);
      return errorResponse("The uploaded file changed during transfer. Please select it again and retry.", 422);
    }
    const file = new File([bytes], uploadRecord.fileName, { type: uploadRecord.mimeType });
    const environment = bulkResumeEnvironment();
    const stored = await storeResumeFile(file, { environment });
    const validation = validateCandidateResume(stored.extractedText);
    if (!validation.valid) {
      if (!stored.reused && stored.record.fileId !== uploadRecord.fileId) await deleteResumeFile(stored.record).catch(() => undefined);
      await deleteResumeFile(uploadRecord).catch(() => undefined);
      return errorResponse(validation.error, 422, { validationErrors: [`${uploadRecord.fileName}: ${validation.error}`] });
    }

    const currentQueue = await getBulkResumeQueue(roleId, { fresh: true });
    const previous = previousForQueue(currentQueue, queueId);
    const evidence = await getBulkResumeScreeningEvidence(previous ? [previous] : []);
    const submittedApplications = await getBulkResumeApplicantSubmissionEvidence(previous ? [previous] : []);
    const hasSavedResult = Boolean(previous && evidence.has(`${previous.roleId.toLowerCase()}|${previous.driveFileId.toLowerCase()}`));
    const alreadySubmitted = Boolean(previous && submittedApplications.has(`${previous.roleId.toLowerCase()}|${previous.driveFileId.toLowerCase()}`));
    const previousStatus = previous?.status.toLowerCase() || "";
    const previousIsRecent = Boolean(previous && queueAge(previous) < STALE_JOB_MS);
    if (previous && (hasSavedResult || alreadySubmitted || (previousIsRecent && ["queued", "processing", "screened", "processed"].includes(previousStatus)))) {
      const existingFileId = fileIdFromUrl(previous.driveFileUrl);
      if (stored.record.fileId !== existingFileId && !stored.reused) await deleteResumeFile(stored.record).catch(() => undefined);
      if (uploadRecord.fileId !== existingFileId) await deleteResumeFile(uploadRecord).catch(() => undefined);
      const message = hasSavedResult || ["screened", "processed"].includes(previousStatus)
        ? "This resume has already been screened for this role."
        : alreadySubmitted ? "A candidate application already exists for this resume. It was not submitted again to avoid duplicate screening."
        : "This resume is already waiting in or being processed by the screening queue.";
      const result = await appendSkippedDuplicate({ roleId, queueId, batchId, batchSize, submittedByEmail: user.email, fileName: stored.record.fileName, mimeType: stored.record.mimeType, previous, message });
      await notifyBulkResumeBatchComplete(roleId, batchId);
      return NextResponse.json({ success: true, ...result, batchId, fileIndex: Number(body.fileIndex) });
    }

    if (stored.record.fileId !== uploadRecord.fileId) await deleteResumeFile(uploadRecord).catch(() => undefined);
    const now = new Date().toISOString();
    const attemptCount = Number(previous?.attemptCount || 0) + 1;
    const isUat = bulkResumeIsUatMarked();
    const applicationId = `${isUat ? "UAT-" : ""}APP-${crypto.createHash("sha256").update(`${roleId}:${actualSha256}`).digest("hex").slice(0, 24)}`;
    const message = {
      queueId,
      roleId,
      resumeFileId: stored.record.fileId,
      sha256: actualSha256,
      fileName: stored.record.fileName,
      mimeType: stored.record.mimeType,
      applicationId,
      batchId,
      batchSize,
      submittedByEmail: user.email,
      attemptCount,
      environment,
      isUat,
    } as const;

    await appendBulkResumeQueueEvent({
      driveFileId: queueId,
      driveFileName: stored.record.fileName,
      driveFileUrl: driveFileUrl(stored.record.fileId),
      driveFileMimeType: stored.record.mimeType,
      roleId,
      candidateName: validation.details?.candidateName || "",
      candidateEmail: validation.details?.candidateEmail || "",
      status: "Queued",
      applicationId,
      errorMessage: "",
      discoveredAt: previous?.discoveredAt || now,
      processingStartedAt: "",
      processedAt: "",
      attemptCount: String(attemptCount),
      lastUpdated: now,
      environment,
      isUat,
      batchId,
      jobId: queueId,
      batchSize: String(batchSize),
      submittedByEmail: user.email,
    });

    try {
      await enqueueBulkResumeJob(message);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The durable screening queue is unavailable.";
      await appendBulkResumeQueueEvent({
        driveFileId: queueId,
        driveFileName: stored.record.fileName,
        driveFileUrl: driveFileUrl(stored.record.fileId),
        driveFileMimeType: stored.record.mimeType,
        roleId,
        candidateName: validation.details?.candidateName || "",
        candidateEmail: validation.details?.candidateEmail || "",
        status: "Failed",
        applicationId,
        errorMessage: `The resume is stored, but the screening queue rejected the job: ${reason}`,
        discoveredAt: previous?.discoveredAt || now,
        processedAt: new Date().toISOString(),
        attemptCount: String(attemptCount),
        lastUpdated: new Date().toISOString(),
        environment,
        isUat,
        batchId,
        jobId: queueId,
        batchSize: String(batchSize),
        submittedByEmail: user.email,
      });
      await notifyBulkResumeBatchComplete(roleId, batchId);
      return errorResponse("The resume was stored, but the durable screening queue is unavailable. Use Retry on this file after the queue is restored.", 503, { queueId, status: "Failed" });
    }

    return NextResponse.json({ success: true, queueId, applicationId, batchId, status: "Queued", message: "Resume stored securely and queued for screening.", fileIndex: Number(body.fileIndex) }, { status: 202 });
  } catch (error) {
    console.error("[Bulk Resume Upload] Finalization failed:", error);
    return errorResponse(error instanceof Error ? error.message : "Unable to validate and queue this resume.", 422);
  }
}

async function recordUploadFailure(request: Request, body: Record<string, unknown>) {
  const roleId = String(body.roleId || "").trim();
  const batchId = String(body.batchId || "").trim();
  const batchSize = Number(body.batchSize || 1);
  const queueId = String(body.queueId || "").trim();
  const resumeFileId = String(body.resumeFileId || "").trim();
  const fileName = String(body.fileName || "Resume upload").trim().slice(0, 180);
  const errorMessage = String(body.errorMessage || "The upload did not finish. Select this file again to retry.").trim().slice(0, 500);
  if (!roleId || !/^BULK-[A-Z0-9_-]+-[a-f0-9]{64}$/i.test(queueId) || !/^[a-zA-Z0-9_-]{12,80}$/.test(batchId) || !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MAX_FILES_PER_BATCH) return errorResponse("The failed upload is missing valid queue details.", 422);
  const access = await requireRole(request);
  if (access.response) return access.response;
  const { user } = access;
  const roleResult = await loadPublishedRole(user, roleId);
  if (roleResult.error) return roleResult.error;

  const queue = await getBulkResumeQueue(roleId, { fresh: true });
  const previous = previousForQueue(queue, queueId);
  if (previous && ["queued", "processing", "screened", "processed"].includes(previous.status.toLowerCase()) && queueAge(previous) < STALE_JOB_MS) {
    return NextResponse.json({ success: true, queueId, status: previous.status, fileIndex: Number(body.fileIndex), message: "The screening job is already active; its status was preserved." });
  }
  const evidence = await getBulkResumeScreeningEvidence(previous ? [previous] : []);
  if (previous && evidence.has(`${previous.roleId.toLowerCase()}|${previous.driveFileId.toLowerCase()}`)) {
    return NextResponse.json({ success: true, queueId, status: "Screened", fileIndex: Number(body.fileIndex), message: "A saved screening result was found; it was preserved." });
  }
  const storedFile = resumeFileId ? await getResumeFileRecord(resumeFileId) : null;
  const verifiedStoredFile = storedFile
    && storedFile.uploadQueueId === queueId
    && storedFile.uploadRoleId?.toLowerCase() === roleId.toLowerCase()
    && storedFile.uploadOwnerEmail?.toLowerCase() === user.email.toLowerCase()
    ? storedFile
    : null;
  const now = new Date().toISOString();
  await appendBulkResumeQueueEvent({
    driveFileId: queueId,
    driveFileName: verifiedStoredFile?.fileName || fileName,
    driveFileUrl: previous?.driveFileUrl || (verifiedStoredFile ? driveFileUrl(verifiedStoredFile.fileId) : ""),
    driveFileMimeType: verifiedStoredFile?.mimeType || "",
    roleId,
    candidateName: previous?.candidateName || "",
    candidateEmail: previous?.candidateEmail || "",
    status: "Failed",
    applicationId: previous?.applicationId || "",
    errorMessage,
    discoveredAt: previous?.discoveredAt || now,
    processedAt: now,
    attemptCount: previous?.attemptCount || "0",
    lastUpdated: now,
    environment: bulkResumeEnvironment(),
    isUat: bulkResumeIsUatMarked(),
    batchId,
    jobId: queueId,
    batchSize: String(batchSize),
    submittedByEmail: user.email,
  });
  await notifyBulkResumeBatchComplete(roleId, batchId);
  return NextResponse.json({ success: true, queueId, status: "Failed", fileIndex: Number(body.fileIndex), message: errorMessage });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "").trim().toLowerCase();
    if (action === "prepare") return await prepare(request, body);
    if (action === "finalize") return await finalize(request, body);
    if (action === "upload-failed") return await recordUploadFailure(request, body);
    return errorResponse("Choose an upload action before submitting a resume.", 422);
  } catch (error) {
    console.error("[Bulk Resume Upload] Request failed:", error);
    return errorResponse(error instanceof Error ? error.message : "Unable to start resume upload.", 400);
  }
}
