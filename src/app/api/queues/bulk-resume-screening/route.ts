import { handleCallback, type MessageMetadata } from "@vercel/queue";

import { getBulkResumeQueue, getBulkResumeScreeningEvidence, getBulkResumeApplicantSubmissionEvidence, appendBulkResumeQueueEvent } from "@/lib/candidate-applications";
import { bulkResumeWebhookConfig } from "@/lib/bulk-resume-config";
import { notifyBulkResumeBatchComplete } from "@/lib/bulk-resume-notifications";
import { extractResumeContactDetails, validateCandidateResume } from "@/lib/resume-contact-extraction";
import { getRoleRequestById, isPublishedRoleForIntake } from "@/lib/google-sheets";
import { validBulkResumeJobMessage, type BulkResumeJobMessage } from "@/lib/bulk-resume-queue";
import { getResumeFileRecord, readResumeFile, storeResumeFile } from "@/lib/resume-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_DELIVERIES = 5;
const WEBHOOK_TIMEOUT_MS = 120_000;
const DUPLICATE_DELIVERY_GUARD_MS = 5 * 60 * 1000;

function driveFileUrl(fileId: string) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

async function postScreeningWebhook(message: BulkResumeJobMessage, resumeText: string, contact: ReturnType<typeof extractResumeContactDetails>, resumeFile: Awaited<ReturnType<typeof storeResumeFile>>["record"]) {
  const { url, secret } = bulkResumeWebhookConfig(message.environment);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": secret,
        "X-Idempotency-Key": message.queueId,
      },
      body: JSON.stringify({
        eventType: "bulk_resume_uploaded",
        batchId: message.batchId,
        batchSize: message.batchSize,
        submittedByEmail: message.submittedByEmail,
        queueId: message.queueId,
        roleId: message.roleId,
        applicationId: message.applicationId,
        fileName: message.fileName,
        mimeType: message.mimeType,
        sha256: message.sha256,
        resumeText,
        candidateName: contact.candidateName,
        candidateEmail: contact.candidateEmail,
        preferredMobile: contact.preferredMobile,
        applicantCountry: contact.applicantCountry,
        resumeFile,
        driveFileUrl: driveFileUrl(resumeFile.fileId),
        submittedAt: new Date().toISOString(),
        source: message.isUat ? "Portal Bulk Upload (UAT)" : "Portal Bulk Upload",
        environment: message.environment,
        isUat: message.isUat,
        is_uat: message.isUat,
        attemptCount: String(message.attemptCount),
        jobId: message.queueId,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("The screening workflow timed out after 120 seconds.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function appendStatus(message: BulkResumeJobMessage, status: string, values: Partial<Parameters<typeof appendBulkResumeQueueEvent>[0]> = {}) {
  const now = new Date().toISOString();
  await appendBulkResumeQueueEvent({
    driveFileId: message.queueId,
    driveFileName: message.fileName,
    driveFileUrl: values.driveFileUrl || driveFileUrl(message.resumeFileId),
    driveFileMimeType: message.mimeType,
    roleId: message.roleId,
    status,
    applicationId: message.applicationId,
    errorMessage: values.errorMessage || "",
    discoveredAt: values.discoveredAt || now,
    processingStartedAt: values.processingStartedAt || "",
    processedAt: values.processedAt || "",
    attemptCount: String(message.attemptCount),
    lastUpdated: now,
    environment: message.environment,
    isUat: message.isUat,
    batchId: message.batchId,
    jobId: message.queueId,
    batchSize: String(message.batchSize),
    submittedByEmail: message.submittedByEmail,
    candidateName: values.candidateName || "",
    candidateEmail: values.candidateEmail || "",
  });
}

async function markFailed(message: BulkResumeJobMessage, reason: string, candidate: { candidateName?: string; candidateEmail?: string } = {}) {
  await appendStatus(message, "Failed", { ...candidate, errorMessage: reason, processedAt: new Date().toISOString() });
  console.error("[Bulk Resume Queue] Screening failed", { roleId: message.roleId, queueId: message.queueId, attemptCount: message.attemptCount, reason });
  await notifyBulkResumeBatchComplete(message.roleId, message.batchId);
}

async function processMessage(rawMessage: unknown, metadata: MessageMetadata) {
  if (!validBulkResumeJobMessage(rawMessage)) {
    throw new Error("The durable bulk resume queue message is malformed.");
  }
  const message = rawMessage;
  if (metadata.deliveryCount >= MAX_DELIVERIES) {
    await markFailed(message, "Automatic retries were exhausted after repeated worker failures. Review the saved applicant record before retrying.");
    return;
  }
  const role = await getRoleRequestById(message.roleId);
  if (!role || !isPublishedRoleForIntake(role)) {
    await markFailed(message, "This role is no longer published. Contact HR to select a current role and retry.");
    return;
  }

  const [queue, resumeRecord] = await Promise.all([
    getBulkResumeQueue(message.roleId, { fresh: true }),
    getResumeFileRecord(message.resumeFileId),
  ]);
  const current = queue.find((item) => item.jobId === message.queueId || item.driveFileId === message.queueId);
  if (!current) throw new Error("The queue record could not be read. The durable job will retry.");

  const savedResult = await getBulkResumeScreeningEvidence([current]);
  if (savedResult.has(`${current.roleId.toLowerCase()}|${current.driveFileId.toLowerCase()}`)) {
    if (current.status.toLowerCase() !== "screened") await appendStatus(message, "Screened", { processedAt: new Date().toISOString() });
    await notifyBulkResumeBatchComplete(message.roleId, message.batchId);
    return;
  }
  const submitted = await getBulkResumeApplicantSubmissionEvidence([current]);
  if (submitted.has(`${current.roleId.toLowerCase()}|${current.driveFileId.toLowerCase()}`)) {
    await appendStatus(message, "Processing", {
      candidateName: current.candidateName,
      candidateEmail: current.candidateEmail,
      processingStartedAt: current.processingStartedAt || new Date().toISOString(),
      errorMessage: "The candidate application already exists. Waiting for its saved screening result; duplicate screening was blocked.",
    });
    return;
  }
  const currentStatus = current.status.toLowerCase();
  const lastUpdate = Date.parse(current.lastUpdated || current.processingStartedAt || current.discoveredAt);
  const currentAge = Number.isFinite(lastUpdate) ? Date.now() - lastUpdate : Number.MAX_SAFE_INTEGER;
  if (["screened", "processed"].includes(currentStatus) && currentAge < 50 * 60 * 1000) {
    // The n8n callback already acknowledged this job. Give its result write a
    // chance to arrive before another AI call is made for the same candidate.
    return;
  }
  if (currentStatus === "processing" && currentAge < DUPLICATE_DELIVERY_GUARD_MS) return;
  if (!resumeRecord || resumeRecord.sha256.toLowerCase() !== message.sha256.toLowerCase()) {
    await markFailed(message, "The stored resume could not be verified. Upload the file again to retry screening.", current);
    return;
  }

  let dispatchStarted = false;
  let contactDetails: ReturnType<typeof extractResumeContactDetails> | null = null;
  try {
    const bytes = await readResumeFile(resumeRecord);
    const file = new File([bytes], resumeRecord.fileName, { type: resumeRecord.mimeType });
    const stored = await storeResumeFile(file, { environment: message.environment });
    const validation = validateCandidateResume(stored.extractedText);
    if (!validation.valid || !validation.details) {
      await markFailed(message, validation.error, validation.details || current);
      return;
    }
    const contact = validation.details;
    contactDetails = contact;
    const startedAt = new Date().toISOString();
    await appendStatus(message, "Processing", {
      candidateName: contact.candidateName,
      candidateEmail: contact.candidateEmail,
      driveFileUrl: driveFileUrl(stored.record.fileId),
      discoveredAt: current.discoveredAt || startedAt,
      processingStartedAt: startedAt,
      errorMessage: "Dispatching to the AI screening workflow.",
    });

    dispatchStarted = true;
    const response = await postScreeningWebhook(message, stored.extractedText, contact, stored.record);
    const result = await response.json().catch(() => ({})) as Record<string, unknown>;
    const reportedStatus = String(result.status || "").trim().toLowerCase();
    if (response.status >= 400 && response.status < 500) {
      await markFailed(message, String(result.error || result.message || `The screening workflow rejected this resume (HTTP ${response.status}).`), contact);
      return;
    }
    if (!response.ok || result.success === false) {
      throw new Error(String(result.error || result.message || `The screening workflow returned HTTP ${response.status}.`));
    }
    if (reportedStatus === "failed") {
      await markFailed(message, String(result.errorMessage || result.error || "The AI screening workflow could not process this resume."), contact);
      return;
    }
    const savedAfterHandoff = await getBulkResumeScreeningEvidence([current]);
    if (savedAfterHandoff.has(`${current.roleId.toLowerCase()}|${current.driveFileId.toLowerCase()}`)) {
      await appendStatus(message, "Screened", {
        candidateName: contact.candidateName,
        candidateEmail: contact.candidateEmail,
        driveFileUrl: driveFileUrl(stored.record.fileId),
        discoveredAt: current.discoveredAt || startedAt,
        processingStartedAt: startedAt,
        processedAt: new Date().toISOString(),
      });
      await notifyBulkResumeBatchComplete(message.roleId, message.batchId);
      return;
    }
    // A 2xx response from n8n may only mean its candidate workflow accepted
    // the record. Role Total becomes Completed only when the persisted
    // High_Match_Profile row contains screening evidence.
    await appendStatus(message, "Processing", {
      candidateName: contact.candidateName,
      candidateEmail: contact.candidateEmail,
      driveFileUrl: driveFileUrl(stored.record.fileId),
      discoveredAt: current.discoveredAt || startedAt,
      processingStartedAt: startedAt,
      errorMessage: "The workflow accepted this resume; waiting for the saved screening result.",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "The screening workflow failed unexpectedly.";
    if (dispatchStarted) {
      await markFailed(message, `The workflow request ended without a confirmed result and may have reached candidate screening. Verify the applicant record before retrying. ${reason}`, contactDetails || current);
      return;
    }
    if (metadata.deliveryCount >= MAX_DELIVERIES) {
      await markFailed(message, `Automatic retries were exhausted. ${reason}`, contactDetails || current);
      return;
    }
    await appendStatus(message, "Queued", {
      candidateName: contactDetails?.candidateName || current.candidateName,
      candidateEmail: contactDetails?.candidateEmail || current.candidateEmail,
      errorMessage: `Temporary processing error. Automatic retry ${metadata.deliveryCount + 1} of ${MAX_DELIVERIES} is scheduled.`,
    });
    console.warn("[Bulk Resume Queue] Screening attempt will retry", { roleId: message.roleId, queueId: message.queueId, deliveryCount: metadata.deliveryCount, reason });
    throw error;
  }
}

const queueCallback = handleCallback(processMessage, {
  // The worker is capped at five minutes. Ten minutes gives a timed-out
  // invocation room to release its lease, while repeated failures reach the
  // explicit delivery-count failure guard before HR can safely retry.
  visibilityTimeoutSeconds: 600,
  retry: (_error, metadata) => metadata.deliveryCount >= MAX_DELIVERIES
    ? { acknowledge: true }
    : { afterSeconds: Math.min(300, 15 * metadata.deliveryCount) },
});

export async function POST(request: Request) {
  return queueCallback(request);
}
