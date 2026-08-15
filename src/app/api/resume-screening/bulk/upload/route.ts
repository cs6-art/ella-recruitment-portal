import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getBulkResumeQueue } from "@/lib/candidate-applications";
import { getRoleRequestById } from "@/lib/google-sheets";
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
    if (!files.length) return responseError("Choose at least one PDF or DOCX resume.", 422);
    if (files.length > MAX_FILES_PER_BATCH) return responseError(`Upload up to ${MAX_FILES_PER_BATCH} resumes per batch.`, 422);

    const role = await getRoleRequestById(roleId);
    if (!role || role.status !== "Job Posted" || role.recruitmentSetupStatus !== "Published") return responseError("The selected role is not available for bulk screening.", 409);

    const queue = await getBulkResumeQueue(roleId);
    const latestByFile = new Map(queue.map((item) => [item.driveFileId, item]));
    const results: Array<Record<string, unknown>> = [];

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

        latestByFile.set(queueId, {
          driveFileId: queueId,
          driveFileName: stored.record.fileName,
          driveFileUrl: "",
          roleId,
          candidateName: "",
          candidateEmail: "",
          status: "Processing",
          applicationId: payload.applicationId,
          errorMessage: "",
          discoveredAt: payload.submittedAt,
          processingStartedAt: payload.submittedAt,
          processedAt: "",
          attemptCount: String(Number(previous?.attemptCount || 0) + 1),
          lastUpdated: payload.submittedAt,
        });
        results.push({ fileName: stored.record.fileName, queueId, applicationId: payload.applicationId, status: "Processing" });
      } catch (error) {
        if (stored && !results.some((result) => result.queueId === queueIdForHash(roleId, stored?.record.sha256 || ""))) await deleteResumeFile(stored.record).catch(() => undefined);
        results.push({ fileName: file.name, status: "Failed", error: error instanceof Error ? error.message : "Unable to submit this resume." });
      }
    }

    return NextResponse.json({ success: true, roleId, results, submitted: results.filter((result) => result.status === "Processing").length }, { status: 202 });
  } catch (error) {
    console.error("[Bulk Resume Upload] POST failed:", error);
    return responseError(error instanceof Error ? error.message : "Unable to upload bulk resumes.", 400);
  }
}
