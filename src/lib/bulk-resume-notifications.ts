import { getBulkResumeQueue, getBulkResumeScreeningEvidence, type BulkResumeQueueItem } from "@/lib/candidate-applications";
import { getRoleRequestById } from "@/lib/google-sheets";

const terminalStatuses = new Set(["screened", "processed", "failed", "skipped"]);

function configured() {
  return String(process.env.BULK_RESUME_NOTIFY_ON_SUCCESS || "").trim().toLowerCase() === "true";
}

async function notifyBatch(items: BulkResumeQueueItem[], savedResults: Set<string>) {
  if (!items.length || items.some((item) => item.isUat || item.environment?.toLowerCase() === "uat")) return;
  const expected = Math.max(1, ...items.map((item) => Number.parseInt(item.batchSize || "1", 10) || 1));
  if (items.length !== expected) return;

  const results = items.map((item) => {
    const evidenceKey = `${item.roleId.toLowerCase()}|${item.driveFileId.toLowerCase()}`;
    const rawStatus = item.status.toLowerCase();
    const status = savedResults.has(evidenceKey)
      ? "Screened"
      : ["screened", "processed"].includes(rawStatus)
        ? "Processing"
        : rawStatus === "failed" ? "Failed"
          : rawStatus === "skipped" ? "Skipped"
            : rawStatus === "processing" ? "Processing" : "Queued";
    return { item, status };
  });
  if (!results.every(({ status }) => terminalStatuses.has(status.toLowerCase()))) return;

  const roleId = items[0].roleId;
  const batchId = items[0].batchId || "";
  if (!batchId) return;
  const url = (process.env.N8N_ROLE_REQUEST_WEBHOOK_URL || process.env.N8N_ROLE_WEBHOOK_URL || "").trim();
  const secret = (process.env.N8N_WEBHOOK_SECRET || "").trim();
  if (!url || !secret) {
    console.info("[Bulk Resume Notification] Batch complete; notification webhook is not configured", { roleId, batchId });
    return;
  }

  const role = await getRoleRequestById(roleId).catch(() => null);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": secret,
        "X-Idempotency-Key": `bulk-batch-${batchId}`,
      },
      body: JSON.stringify({
        eventType: "bulk_resume_batch_complete",
        batchId,
        roleId,
        roleTitle: role?.jobTitle || "",
        submittedByEmail: items.find((item) => item.submittedByEmail)?.submittedByEmail || "",
        totalFiles: expected,
        submitted: results.filter(({ status }) => ["Screened", "Processed"].includes(status)).length,
        skipped: results.filter(({ status }) => status.toLowerCase() === "skipped").length,
        failed: results.filter(({ status }) => status.toLowerCase() === "failed").length,
        results: results.map(({ item, status }) => ({
          fileName: item.driveFileName,
          queueId: item.jobId || item.driveFileId,
          status,
          error: status.toLowerCase() === "failed" ? item.errorMessage : "",
          skipped: status.toLowerCase() === "skipped",
        })),
        completedAt: new Date().toISOString(),
        source: "Portal Bulk Upload",
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`The notification webhook returned HTTP ${response.status}.`);
    console.info("[Bulk Resume Notification] Batch completion sent", { roleId, batchId, totalFiles: expected });
  } catch (error) {
    console.error("[Bulk Resume Notification] Batch completion notification failed", {
      roleId,
      batchId,
      reason: error instanceof Error ? error.message : "Unknown notification error",
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function notifyBulkResumeBatchComplete(roleId: string, batchId: string) {
  if (!configured() || !batchId) return;
  try {
    const items = (await getBulkResumeQueue(roleId, { fresh: true })).filter((item) => item.batchId === batchId);
    if (!items.length) return;
    const evidence = await getBulkResumeScreeningEvidence(items);
    await notifyBatch(items, evidence);
  } catch (error) {
    console.error("[Bulk Resume Notification] Unable to reconcile batch before notification", {
      roleId,
      batchId,
      reason: error instanceof Error ? error.message : "Unknown reconciliation error",
    });
  }
}

export async function notifyReadyBulkResumeBatches() {
  if (!configured()) return;
  try {
    const items = await getBulkResumeQueue("", { fresh: true });
    const batches = new Map<string, BulkResumeQueueItem[]>();
    for (const item of items) {
      if (!item.batchId || item.isUat || item.environment?.toLowerCase() === "uat") continue;
      const key = `${item.roleId.toLowerCase()}|${item.batchId}`;
      batches.set(key, [...(batches.get(key) || []), item]);
    }
    const evidence = await getBulkResumeScreeningEvidence(items);
    const candidates = [...batches.values()].slice(0, 20);
    for (let index = 0; index < candidates.length; index += 5) {
      await Promise.all(candidates.slice(index, index + 5).map((batch) => notifyBatch(batch, evidence)));
    }
  } catch (error) {
    console.error("[Bulk Resume Notification] Batch reconciliation failed", error);
  }
}
