import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getBulkResumeQueue } from "@/lib/candidate-applications";
import { getRoleRequestById, isPublishedRoleForIntake } from "@/lib/google-sheets";
import { consumeRateLimit, rateLimitHeaders, requestClientKey } from "@/lib/rate-limit";
import { deleteResumeFile, MAX_RESUME_FILE_BYTES, storeResumeFile } from "@/lib/resume-files";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES_PER_BATCH = 25;
const MAX_BULK_REQUEST_BYTES = 100 * 1024 * 1024;

function responseError(error: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

function queueIdForHash(roleId: string, sha256: string) {
  const roleKey = roleId.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "-");
  return `BULK-${roleKey}-${sha256}`;
}

function legacyQueueIdForHash(sha256: string) {
  return `BULK-${sha256}`;
}

export async function POST(request: Request) {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) return responseError("Authentication required.", 401);
  if (user.canReviewRole !== true && user.canApproveRole !== true) return responseError("Only HR reviewers can upload bulk resumes.", 403);

  const rate = consumeRateLimit(`bulk-resume-upload:${user.email}:${requestClientKey(request)}`, 5, 15 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ success: false, error: "Too many bulk uploads. Try again later." }, { status: 429, headers: rateLimitHeaders(rate) });

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BULK_REQUEST_BYTES) return responseError("Bulk uploads must be 100 MB or smaller per batch.", 413);

  const webhookUrl = process.env.N8N_BULK_RESUME_UPLOAD_WEBHOOK_URL?.trim();
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET?.trim();
  if (!webhookUrl || !webhookSecret) return responseError("The bulk screening workflow is not configured.", 503);

  try {
    const formData = await request.formData();
    const roleId = String(formData.get("roleId") || "").trim();
    const files = formData.getAll("resumes").filter((value): value is File => value instanceof File);
    if (!roleId) return responseError("Select a published role before uploading resumes.", 422);
    // Keep the API contract explicit: legacy binary DOC is accepted alongside
    // the PDF/DOCX formats supported by the shared extractor.
    if (!files.length) return responseError("Choose at least one PDF, DOC, or DOCX resume.", 422);
    if (files.length > MAX_FILES_PER_BATCH) return responseError(`Upload up to ${MAX_FILES_PER_BATCH} resumes per batch.`, 422);

    const role = await getRoleRequestById(roleId);
    if (!role || !isPublishedRoleForIntake(role)) return responseError("The selected role is not available for bulk screening.", 409);

    const queue = await getBulkResumeQueue(roleId);
    const latestByFile = new Map(queue.map((item) => [item.driveFileId, item]));
    const results: Array<Record<string, unknown>> = [];
    // Keep one correlation id for the complete upload so the internal
    // notification contains a single, auditable batch summary.
    const batchId = `BATCH-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    for (const file of files) {
      let stored: Awaited<ReturnType<typeof storeResumeFile>> | null = null;
      try {
        if (file.size > MAX_RESUME_FILE_BYTES) throw new Error("Resume files must be 10 MB or smaller.");
        stored = await storeResumeFile(file);
        const queueId = queueIdForHash(roleId, stored.record.sha256);
        const previous = latestByFile.get(queueId) || latestByFile.get(legacyQueueIdForHash(stored.record.sha256));
        const previousStatus = previous?.status.toLowerCase() || "";
        if (["screened", "processing", "queued"].includes(previousStatus)) {
          await deleteResumeFile(stored.record);
          results.push({ fileName: file.name, queueId, status: previous?.status || "Queued", skipped: true, message: previousStatus === "screened" ? "This resume was already screened for this role." : previousStatus === "queued" ? "This resume is already queued for this role." : "This resume is already being screened for this role." });
          continue;
        }

        const payload = {
          eventType: "bulk_resume_uploaded",
          batchId,
          queueId,
          roleId,
          applicationId: `APP-${crypto.createHash("sha256").update(`${roleId}:${stored.record.sha256}`).digest("hex").slice(0, 24)}`,
          fileName: stored.record.fileName,
          mimeType: stored.record.mimeType,
          sha256: stored.record.sha256,
          resumeText: stored.extractedText,
          resumeFile: stored.record,
          submittedAt: new Date().toISOString(),
          source: "Portal Bulk Upload",
        };
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Webhook-Secret": webhookSecret, "X-Idempotency-Key": queueId },
          body: JSON.stringify(payload),
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`The screening workflow returned HTTP ${response.status}.`);
        const workflowResult = await response.json().catch(() => ({})) as Record<string, unknown>;
        const terminalStatus = String(workflowResult.status || "Screened");

        latestByFile.set(queueId, {
          driveFileId: queueId,
          driveFileName: stored.record.fileName,
          driveFileUrl: "",
          roleId,
          candidateName: "",
          candidateEmail: "",
          status: terminalStatus,
          applicationId: payload.applicationId,
          errorMessage: "",
          discoveredAt: payload.submittedAt,
          processingStartedAt: payload.submittedAt,
          processedAt: "",
          attemptCount: String(Number(previous?.attemptCount || 0) + 1),
          lastUpdated: payload.submittedAt,
        });
        results.push({ fileName: stored.record.fileName, queueId, applicationId: payload.applicationId, status: terminalStatus });
      } catch (error) {
        if (stored && !results.some((result) => result.queueId === queueIdForHash(roleId, stored?.record.sha256 || ""))) await deleteResumeFile(stored.record).catch(() => undefined);
        results.push({ fileName: file.name, status: "Failed", error: error instanceof Error ? error.message : "Unable to submit this resume." });
      }
    }

    // The bulk webhook returns after each item has been recorded. The API
    // emits one internal completion event only after every selected file has
    // reached a terminal queue status, preserving a single batch summary.
    let notificationStatus: "sent" | "pending" | "not_configured" = "not_configured";
    const notificationUrl = (process.env.N8N_ROLE_REQUEST_WEBHOOK_URL || process.env.N8N_ROLE_WEBHOOK_URL || "").trim();
    if (notificationUrl && webhookSecret && files.length > 0) {
      try {
        const notificationResponse = await fetch(notificationUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Webhook-Secret": webhookSecret, "X-Idempotency-Key": `bulk-batch-${batchId}` },
          body: JSON.stringify({
            eventType: "bulk_resume_batch_complete",
            batchId,
            roleId,
            roleTitle: role.jobTitle || "",
            submittedByEmail: user.email,
            totalFiles: files.length,
            submitted: results.filter((result) => ["Screened", "Processed"].includes(String(result.status))).length,
            skipped: results.filter((result) => result.skipped === true).length,
            failed: results.filter((result) => result.status === "Failed").length,
            results,
            completedAt: new Date().toISOString(),
            source: "Portal Bulk Upload",
          }),
          cache: "no-store",
        });
        notificationStatus = notificationResponse.ok ? "sent" : "pending";
      } catch (error) {
        // Upload success must not be rolled back because an internal alert is
        // temporarily unavailable; the queue records remain authoritative.
        console.error("[Bulk Resume Upload] completion notification failed:", error);
        notificationStatus = "pending";
      }
    }

    return NextResponse.json({ success: true, roleId, batchId, results, notificationStatus, submitted: results.filter((result) => ["Screened", "Processed"].includes(String(result.status))).length }, { status: 202 });
  } catch (error) {
    console.error("[Bulk Resume Upload] POST failed:", error);
    return responseError(error instanceof Error ? error.message : "Unable to upload bulk resumes.", 400);
  }
}
