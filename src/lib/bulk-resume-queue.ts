import { send } from "@vercel/queue";

export const BULK_RESUME_QUEUE_TOPIC = "bulk-resume-screening";
export const BULK_RESUME_QUEUE_RETENTION_SECONDS = 7 * 24 * 60 * 60;

export type BulkResumeJobMessage = {
  queueId: string;
  roleId: string;
  resumeFileId: string;
  sha256: string;
  fileName: string;
  mimeType: string;
  applicationId: string;
  batchId: string;
  batchSize: number;
  submittedByEmail: string;
  attemptCount: number;
  environment: "production" | "uat";
  isUat: boolean;
};

/** Publish only references and correlation data; candidate text stays in Drive and n8n. */
export async function enqueueBulkResumeJob(message: BulkResumeJobMessage) {
  return send(BULK_RESUME_QUEUE_TOPIC, message, {
    idempotencyKey: `${message.queueId}:${message.attemptCount}`,
    retentionSeconds: BULK_RESUME_QUEUE_RETENTION_SECONDS,
  });
}

export function validBulkResumeJobMessage(value: unknown): value is BulkResumeJobMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<BulkResumeJobMessage>;
  return Boolean(
    typeof message.queueId === "string" && message.queueId.startsWith("BULK-")
    && typeof message.roleId === "string" && message.roleId.trim()
    && typeof message.resumeFileId === "string" && /^[a-zA-Z0-9_-]{10,80}$/.test(message.resumeFileId)
    && typeof message.sha256 === "string" && /^[a-f0-9]{64}$/i.test(message.sha256)
    && typeof message.fileName === "string" && message.fileName.trim()
    && typeof message.mimeType === "string"
    && typeof message.applicationId === "string" && message.applicationId.trim()
    && typeof message.batchId === "string" && message.batchId.trim()
    && Number.isSafeInteger(message.batchSize) && Number(message.batchSize) >= 1 && Number(message.batchSize) <= 20
    && typeof message.submittedByEmail === "string"
    && Number.isSafeInteger(message.attemptCount) && Number(message.attemptCount) >= 1
    && (message.environment === "production" || message.environment === "uat")
    && typeof message.isUat === "boolean",
  );
}
