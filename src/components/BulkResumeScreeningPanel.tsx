"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type RoleOption = { roleId: string; label: string };
type QueueItem = {
  driveFileId: string;
  driveFileName: string;
  driveFileUrl: string;
  roleId: string;
  candidateName: string;
  candidateEmail: string;
  status: string;
  applicationId: string;
  errorMessage: string;
  discoveredAt: string;
  processingStartedAt: string;
  processedAt: string;
  attemptCount: string;
  lastUpdated: string;
  batchId?: string;
  jobId?: string;
};

const statusOrder = ["Queued", "Processing", "Completed", "Failed", "Skipped"];
const MAX_FILES_PER_BATCH = 20;
const MAX_RESUME_FILE_BYTES = 10 * 1024 * 1024;
const POLL_INTERVAL_MS = 15000;
const TERMINAL_STATUSES = new Set(["screened", "processed", "failed", "skipped"]);

function statusClass(status: string) {
  return `bulk-status bulk-status-${status.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

type BulkApiResponse = {
  success?: boolean;
  error?: string;
  validationErrors?: string[];
  [key: string]: unknown;
};

type BulkStatusApiResponse = BulkApiResponse & {
  configured?: boolean;
  counts?: Record<string, number>;
  items?: QueueItem[];
  roleTotals?: Record<string, number>;
  evidenceVerified?: boolean;
};

/**
 * A reverse proxy or an unavailable Next.js route can return plain text or an
 * HTML error page. Read the body as text first so that those failures do not
 * surface as the opaque browser error: `Unexpected token ... is not valid
 * JSON`.
 */
async function readBulkApiResponse<T extends BulkApiResponse = BulkApiResponse>(response: Response, operation: string): Promise<T> {
  const raw = await response.text();
  if (!raw.trim()) {
    throw new Error(`${operation} returned an empty response (HTTP ${response.status}). Please try again.`);
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(
      response.status >= 500
        ? `${operation} is temporarily unavailable (HTTP ${response.status}). Please try again.`
        : `${operation} returned an invalid response (HTTP ${response.status}). Please try again.`,
    );
  }
}

// Human-facing label + result text for the live table, matching the coarse
// Queued / Uploading / Processing / Completed / Failed states HR cares
// about, distinct from the raw sheet status string used for logic.
function displayStatus(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "screened" || normalized === "processed") return { label: "Completed", result: "Screening completed" };
  if (normalized === "processing") return { label: "Processing", result: "AI analysis running" };
  if (normalized === "failed") return { label: "Failed", result: "Retry" };
  if (normalized === "skipped") return { label: "Skipped", result: "Already screened or queued" };
  return { label: "Queued", result: "Waiting" };
}

async function fileQueueId(roleId: string, file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const sha256 = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const roleKey = roleId.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "-");
  return `BULK-${roleKey}-${sha256}`;
}

function fileMimeType(file: File) {
  if (file.type) return file.type;
  if (/\.pdf$/i.test(file.name)) return "application/pdf";
  if (/\.docx$/i.test(file.name)) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/msword";
}

function uploadedFileId(response: Response, body: string) {
  if (response.status !== 200 && response.status !== 201) return "";
  try {
    const result = JSON.parse(body) as { id?: string };
    return typeof result.id === "string" ? result.id : "";
  } catch {
    return "";
  }
}

function driveRangeOffset(response: Response) {
  const range = response.headers.get("Range") || "";
  const match = range.match(/bytes=0-(\d+)/i);
  return match ? Number(match[1]) + 1 : 0;
}

async function driveUploadStatus(uploadUrl: string, totalBytes: number) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Range": `bytes */${totalBytes}` },
    body: new Blob([]),
    credentials: "omit",
  });
  const body = await response.text();
  const fileId = uploadedFileId(response, body);
  if (fileId) return { fileId, offset: totalBytes };
  if (response.status !== 308) throw new Error("Google Drive could not confirm the interrupted upload. Select the file again and retry.");
  return { fileId: "", offset: driveRangeOffset(response) };
}

/** Transfer directly to Drive in resumable chunks, keeping the binary out of Vercel's request body. */
async function uploadToDrive(uploadUrl: string, file: File) {
  const chunkBytes = 2 * 1024 * 1024;
  let offset = 0;
  let retriesWithoutProgress = 0;
  while (offset < file.size) {
    const end = Math.min(offset + chunkBytes, file.size);
    let response: Response;
    try {
      response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": fileMimeType(file),
          "Content-Range": `bytes ${offset}-${end - 1}/${file.size}`,
        },
        body: file.slice(offset, end),
        credentials: "omit",
      });
    } catch {
      retriesWithoutProgress += 1;
      if (retriesWithoutProgress > 4) throw new Error("The network interrupted the resume upload. Select this file again and retry.");
      const state = await driveUploadStatus(uploadUrl, file.size);
      if (state.fileId) return state.fileId;
      if (state.offset > offset) offset = state.offset;
      await new Promise((resolve) => setTimeout(resolve, 400 * retriesWithoutProgress));
      continue;
    }

    const responseBody = await response.text();
    const fileId = uploadedFileId(response, responseBody);
    if (fileId) return fileId;
    if (response.status === 308) {
      let nextOffset = driveRangeOffset(response);
      if (!nextOffset) nextOffset = (await driveUploadStatus(uploadUrl, file.size)).offset;
      if (nextOffset <= offset) {
        retriesWithoutProgress += 1;
        if (retriesWithoutProgress > 4) throw new Error("Google Drive did not confirm upload progress. Select the file again and retry.");
        await new Promise((resolve) => setTimeout(resolve, 400 * retriesWithoutProgress));
      } else {
        offset = nextOffset;
        retriesWithoutProgress = 0;
      }
      continue;
    }
    if (response.status >= 500 || response.status === 429) {
      retriesWithoutProgress += 1;
      if (retriesWithoutProgress > 4) throw new Error(`Google Drive is temporarily unavailable (HTTP ${response.status}). Select the file again and retry.`);
      const state = await driveUploadStatus(uploadUrl, file.size);
      if (state.fileId) return state.fileId;
      if (state.offset > offset) offset = state.offset;
      await new Promise((resolve) => setTimeout(resolve, 400 * retriesWithoutProgress));
      continue;
    }
    throw new Error(`Google Drive rejected the resume upload (HTTP ${response.status}).`);
  }

  const completed = await driveUploadStatus(uploadUrl, file.size);
  if (!completed.fileId) throw new Error("Google Drive received the resume but did not return its file ID. Select the file again and retry.");
  return completed.fileId;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

export default function BulkResumeScreeningPanel({ roleOptions, driveUrl }: { roleOptions: RoleOption[]; driveUrl: string }) {
  const [roleId, setRoleId] = useState("");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [configured, setConfigured] = useState(true);
  const [statusAvailable, setStatusAvailable] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const [error, setError] = useState("");
  const [retryingQueueId, setRetryingQueueId] = useState("");
  // Tracks the resumes submitted in the batch currently in flight, keyed by
  // the same content-hash queue ID the server computes, so the live section
  // below can show real-time progress for exactly this upload rather than
  // the role's entire screening history.
  const [activeBatch, setActiveBatch] = useState<Map<string, string>>(new Map());
  const [activeBatchQueueIds, setActiveBatchQueueIds] = useState<Map<string, string>>(new Map());
  const [batchResultStatuses, setBatchResultStatuses] = useState<Map<string, string>>(new Map());
  const [batchResultMessages, setBatchResultMessages] = useState<Map<string, string>>(new Map());
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const batchFiles = useRef<Map<string, File>>(new Map());
  const refreshInFlight = useRef(false);
  const refreshAbort = useRef<AbortController | null>(null);
  const statusRequestId = useRef(0);

  const selectedRole = useMemo(() => roleOptions.find((role) => role.roleId === roleId), [roleId, roleOptions]);

  const refreshStatus = useCallback(async () => {
    if (!roleId || refreshInFlight.current) return;
    refreshInFlight.current = true;
    const requestId = ++statusRequestId.current;
    const controller = new AbortController();
    refreshAbort.current = controller;
    setLoading(true);
    try {
      const response = await fetch(`/api/resume-screening/bulk?roleId=${encodeURIComponent(roleId)}`, { cache: "no-store", signal: controller.signal });
      const result = await readBulkApiResponse<BulkStatusApiResponse>(response, "Bulk screening status");
      if (!response.ok || result.success !== true) {
        if (result.configured === false) setConfigured(false);
        throw new Error(result.error || "Unable to load bulk screening status.");
      }
      // Ignore a response that belongs to an older role/request. This keeps a
      // slow poll from overwriting a newer queue snapshot.
      if (requestId !== statusRequestId.current) return;
      setItems(result.items || []);
      // Both fields are supported for compatibility with older deployments;
      // the current API returns the same reconciled snapshot in both fields.
      setCounts(result.counts || result.roleTotals || {});
      setConfigured(result.configured !== false);
      setStatusAvailable(true);
      if (result.error) setError(result.error);
      else setError("");
      if (activeBatch.size === 0 && !uploading) {
        const latest = [...(result.items || [])]
          .filter((item) => item.batchId)
          .sort((left, right) => Date.parse(right.lastUpdated || right.discoveredAt) - Date.parse(left.lastUpdated || left.discoveredAt))[0];
        if (latest?.batchId) {
          const batchItems = (result.items || []).filter((item) => item.batchId === latest.batchId);
          const restoredBatch = new Map<string, string>();
          const restoredQueueIds = new Map<string, string>();
          const restoredStatuses = new Map<string, string>();
          const restoredMessages = new Map<string, string>();
          for (const item of batchItems) {
            const entryId = item.driveFileId;
            restoredBatch.set(entryId, item.driveFileName || entryId);
            restoredQueueIds.set(entryId, item.jobId || item.driveFileId);
            restoredStatuses.set(entryId, item.status || "Queued");
            if (item.errorMessage) restoredMessages.set(entryId, item.errorMessage);
          }
          setActiveBatchId(latest.batchId);
          setActiveBatch(restoredBatch);
          setActiveBatchQueueIds(restoredQueueIds);
          setBatchResultStatuses(restoredStatuses);
          setBatchResultMessages(restoredMessages);
        }
      }
    } catch (caught) {
      if (requestId === statusRequestId.current && !(caught instanceof DOMException && caught.name === "AbortError")) {
        setStatusAvailable(false);
        setError(caught instanceof Error ? caught.message : "Unable to load bulk screening status.");
      }
    } finally {
      if (refreshAbort.current === controller) {
        refreshAbort.current = null;
        refreshInFlight.current = false;
        if (requestId === statusRequestId.current) setLoading(false);
      }
    }
  }, [activeBatch.size, roleId, uploading]);

  function selectRole(nextRoleId: string) {
    refreshAbort.current?.abort();
    refreshAbort.current = null;
    refreshInFlight.current = false;
    statusRequestId.current += 1;
    setRoleId(nextRoleId);
    setItems([]);
    setCounts({});
    setStatusAvailable(false);
    setActiveBatchId("");
    setActiveBatch(new Map());
    setActiveBatchQueueIds(new Map());
    setBatchResultStatuses(new Map());
    setBatchResultMessages(new Map());
    batchFiles.current.clear();
    setFiles([]);
    setUploadMessage("");
    setValidationMessage("");
    setError("");
  }

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Polls automatically, without requiring a manual refresh, while any
  // tracked item (from the active batch, or otherwise) is still Queued or
  // Processing. Stops on its own once everything reaches a terminal state.
  const pendingInBatch = useMemo(() => {
    if (activeBatch.size === 0) return false;
    return Array.from(activeBatch.keys()).some((entryId) => {
      const queueId = activeBatchQueueIds.get(entryId) || entryId.split("::")[0];
      const item = items.find((entry) => entry.driveFileId === entryId)
        || items.find((entry) => entry.driveFileId === queueId && entry.batchId === activeBatchId)
        || items.find((entry) => entry.jobId === queueId && entry.batchId === activeBatchId);
      const reportedStatus = batchResultStatuses.get(entryId)?.toLowerCase() || "";
      // A successful response without a queue row is still only an accepted
      // handoff. Local validation/request failures may terminate immediately,
      // but successful completion must come from the queue-backed status API.
      const status = reportedStatus === "skipped" ? reportedStatus : item?.status || reportedStatus || "Queued";
      return !TERMINAL_STATUSES.has(status.toLowerCase());
    });
  }, [activeBatch, activeBatchId, activeBatchQueueIds, batchResultStatuses, items]);
  const anyPending = pendingInBatch || items.some((item) => !TERMINAL_STATUSES.has(item.status.toLowerCase()));

  useEffect(() => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    if (!roleId || !anyPending) return;
    pollTimer.current = setInterval(() => { void refreshStatus(); }, POLL_INTERVAL_MS);
    return () => { if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; } };
  }, [roleId, anyPending, refreshStatus]);

  function addFiles(nextFiles: FileList | File[]) {
    const incoming = Array.from(nextFiles);
    const currentKeys = new Set(files.map((file) => `${file.name}:${file.size}`));
    const accepted: File[] = [];
    const issues: string[] = [];
    for (const file of incoming) {
      const displayName = file.name || "Unnamed file";
      if (!/\.(pdf|docx?|doc)$/i.test(file.name)) {
        issues.push(`${displayName}: use PDF, DOC, or DOCX.`);
      } else if (file.size === 0) {
        issues.push(`${displayName}: file is empty.`);
      } else if (file.size > MAX_RESUME_FILE_BYTES) {
        issues.push(`${displayName}: exceeds the 10 MB limit.`);
      } else if (currentKeys.has(`${file.name}:${file.size}`) || accepted.some((entry) => entry.name === file.name && entry.size === file.size)) {
        issues.push(`${displayName}: already selected.`);
      } else {
        accepted.push(file);
      }
    }
    const availableSlots = Math.max(0, MAX_FILES_PER_BATCH - files.length);
    if (accepted.length > availableSlots) {
      const omitted = accepted.length - availableSlots;
      issues.push(`Only ${MAX_FILES_PER_BATCH} files can be submitted in one batch; ${omitted} file${omitted === 1 ? " was" : "s were"} not added.`);
      accepted.splice(availableSlots);
    }
    setValidationMessage(issues.join(" "));
    setFiles((current) => {
      const seen = new Set(current.map((file) => `${file.name}:${file.size}`));
      const merged = [...current];
      for (const file of accepted) {
        const key = `${file.name}:${file.size}`;
        if (!seen.has(key) && merged.length < MAX_FILES_PER_BATCH) { merged.push(file); seen.add(key); }
      }
      return merged;
    });
  }

  function removeFile(target: File) {
    setFiles((current) => current.filter((file) => file !== target));
  }

  async function uploadResumes(fileList: File[]) {
    if (!roleId || fileList.length === 0 || uploading) return;
    setUploading(true);
    setError("");
    setUploadMessage("");
    setValidationMessage("");
    try {
      const batchId = crypto.randomUUID();
      const entries = await Promise.all(fileList.map(async (file, index) => {
        const queueId = await fileQueueId(roleId, file);
        return { file, index, queueId, sha256: queueId.slice(queueId.lastIndexOf("-") + 1), entryId: `${queueId}::${index}` };
      }));
      const batch = new Map(entries.map((entry) => [entry.entryId, entry.file.name]));
      const queueIds = new Map(entries.map((entry) => [entry.entryId, entry.queueId]));
      batchFiles.current = new Map(entries.map((entry) => [entry.entryId, entry.file]));
      setActiveBatchId(batchId);
      setActiveBatch(batch);
      setActiveBatchQueueIds(queueIds);
      setBatchResultStatuses(new Map());
      setBatchResultMessages(new Map());

      const response = await fetch("/api/resume-screening/bulk/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare", roleId, batchId,
          files: entries.map(({ file, sha256 }) => ({ fileName: file.name, mimeType: fileMimeType(file), size: file.size, sha256 })),
        }),
      });
      const result = await readBulkApiResponse(response, "Bulk resume upload preparation");
      if (!response.ok || result.success !== true) throw new Error(result.error || "Unable to prepare the bulk resumes.");
      const batchSize = Number(result.batchSize) || entries.length;

      const prepared = (result.files || []) as Array<{ queueId?: string; fileName?: string; status?: string; uploadUrl?: string; error?: string; message?: string; fileIndex?: number }>;
      const statuses = new Map<string, string>();
      const messages = new Map<string, string>();
      for (const item of prepared) {
        const entry = entries[Number(item.fileIndex)];
        if (!entry) continue;
        if (item.status && item.status !== "Uploading") statuses.set(entry.entryId, item.status);
        if (item.error || item.message) messages.set(entry.entryId, String(item.error || item.message));
      }
      setBatchResultStatuses(new Map(statuses));
      setBatchResultMessages(new Map(messages));

      const outcomes = await mapWithConcurrency(prepared, 2, async (item) => {
        const index = Number(item.fileIndex);
        const entry = entries[index];
        if (!entry) return { entryId: "", status: "Failed", message: "The upload response did not match a selected resume.", fileIndex: index };
        if (item.status !== "Uploading" || !item.uploadUrl) {
          if (String(item.status).toLowerCase() === "failed") {
            await fetch("/api/resume-screening/bulk/upload", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "upload-failed", roleId, batchId, batchSize, queueId: entry.queueId, fileName: entry.file.name, fileIndex: index, errorMessage: item.error || "Private resume storage could not start the upload." }),
            }).catch(() => undefined);
          }
          return { entryId: entry.entryId, status: String(item.status || "Failed"), message: String(item.message || item.error || ""), fileIndex: index };
        }

        let resumeFileId = "";
        let finalizeResponseReceived = false;
        try {
          resumeFileId = await uploadToDrive(item.uploadUrl, entry.file);
          const finalizeResponse = await fetch("/api/resume-screening/bulk/upload", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "finalize", roleId, batchId, batchSize, queueId: entry.queueId, resumeFileId, fileIndex: index }),
          });
          finalizeResponseReceived = true;
          const finalized = await readBulkApiResponse(finalizeResponse, "Resume validation and queue handoff");
          if (!finalizeResponse.ok || finalized.success !== true) {
            const validationErrors = Array.isArray(finalized.validationErrors) ? finalized.validationErrors.map(String) : [];
            if (validationErrors.length) setValidationMessage((current) => [current, ...validationErrors].filter(Boolean).join(" "));
            const failureMessage = validationErrors.join(" ") || String(finalized.error || "The resume could not be queued for screening.");
            if (!validationErrors.length) {
              await fetch("/api/resume-screening/bulk/upload", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "upload-failed", roleId, batchId, batchSize, queueId: entry.queueId, fileName: entry.file.name, fileIndex: index, resumeFileId, errorMessage: failureMessage }),
              }).catch(() => undefined);
            }
            return { entryId: entry.entryId, status: "Failed", message: failureMessage, fileIndex: index };
          }
          return { entryId: entry.entryId, status: String(finalized.status || "Queued"), message: String(finalized.message || ""), fileIndex: index };
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : "The resume upload was interrupted.";
          if (!finalizeResponseReceived || !resumeFileId) {
            await fetch("/api/resume-screening/bulk/upload", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "upload-failed", roleId, batchId, batchSize, queueId: entry.queueId, fileName: entry.file.name, fileIndex: index, resumeFileId, errorMessage: message }),
            }).catch(() => undefined);
          }
          return { entryId: entry.entryId, status: "Failed", message, fileIndex: index };
        }
      });

      for (const outcome of outcomes) {
        if (!outcome.entryId) continue;
        statuses.set(outcome.entryId, outcome.status);
        if (outcome.message) messages.set(outcome.entryId, outcome.message);
      }
      setBatchResultStatuses(new Map(statuses));
      setBatchResultMessages(new Map(messages));

      const failedIndices = new Set(outcomes.filter((outcome) => outcome.status.toLowerCase() === "failed").map((outcome) => outcome.fileIndex));
      setFiles((current) => current.filter((file) => {
        const index = fileList.indexOf(file);
        return index < 0 || failedIndices.has(index);
      }));
      const failed = outcomes.filter((outcome) => outcome.status.toLowerCase() === "failed").length;
      const skipped = outcomes.filter((outcome) => outcome.status.toLowerCase() === "skipped").length;
      const submitted = outcomes.filter((outcome) => !["failed", "skipped"].includes(outcome.status.toLowerCase())).length;
      setUploadMessage(`${submitted} resume${submitted === 1 ? "" : "s"} queued for screening${skipped ? ` · ${skipped} skipped as duplicates or already screened` : ""}${failed ? ` · ${failed} failed` : ""}. The queue status is refreshed automatically.`);
      await refreshStatus();
    } catch (caught) {
      setActiveBatch(new Map());
      setActiveBatchQueueIds(new Map());
      setBatchResultStatuses(new Map());
      setBatchResultMessages(new Map());
      batchFiles.current.clear();
      setError(caught instanceof Error ? caught.message : "Unable to submit the bulk resumes.");
    } finally {
      setUploading(false);
    }
  }

  async function retryQueueItem(queueId: string) {
    if (!roleId || retryingQueueId) return;
    setRetryingQueueId(queueId);
    setError("");
    try {
      const response = await fetch("/api/resume-screening/bulk/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, queueId }),
      });
      const result = await readBulkApiResponse(response, "Resume retry");
      if (!response.ok || result.success !== true) throw new Error(result.error || "This resume could not be retried.");
      const current = items.find((item) => item.driveFileId === queueId);
      const retryBatchId = String(result.batchId || "existing-result");
      const entryId = `${queueId}::retry::${retryBatchId}`;
      setActiveBatchId(retryBatchId);
      setActiveBatch(new Map([[entryId, current?.driveFileName || queueId]]));
      setActiveBatchQueueIds(new Map([[entryId, queueId]]));
      setBatchResultStatuses(new Map([[entryId, String(result.status || "Queued")]]));
      setBatchResultMessages(new Map());
      await refreshStatus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This resume could not be retried.");
    } finally {
      setRetryingQueueId("");
    }
  }

  function openDriveFolder() {
    if (!driveUrl || !roleId) return;
    window.open(driveUrl, "_blank", "noopener,noreferrer");
  }

  const batchTotal = activeBatch.size;
  const batchTerminal = useMemo(() => {
    if (batchTotal === 0) return { completed: 0, failed: 0, processing: 0, queued: 0, skipped: 0 };
    let completed = 0, failed = 0, processing = 0, queued = 0, skipped = 0;
    for (const entryId of activeBatch.keys()) {
      const queueId = activeBatchQueueIds.get(entryId) || entryId.split("::")[0];
      const item = items.find((entry) => entry.driveFileId === entryId)
        || items.find((entry) => entry.driveFileId === queueId && entry.batchId === activeBatchId)
        || items.find((entry) => entry.jobId === queueId && entry.batchId === activeBatchId);
      const reportedStatus = batchResultStatuses.get(entryId)?.toLowerCase() || "";
      const status = (reportedStatus === "skipped" ? reportedStatus : item?.status || reportedStatus || "Queued").toLowerCase();
      if (status === "screened" || status === "processed") completed += 1;
      else if (status === "skipped") skipped += 1;
      else if (status === "failed") failed += 1;
      else if (status === "processing") processing += 1;
      else queued += 1;
    }
    return { completed, failed, processing, queued, skipped };
  }, [activeBatch, activeBatchId, activeBatchQueueIds, batchResultStatuses, items, batchTotal]);
  const batchProcessed = batchTerminal.completed + batchTerminal.failed + batchTerminal.skipped;
  const batchPercent = batchTotal > 0 ? Math.round((batchProcessed / batchTotal) * 100) : 0;
  const batchFinished = batchTotal > 0 && batchTerminal.queued === 0 && batchTerminal.processing === 0;
  const batchFailureDetails = useMemo(() => {
    return [...activeBatch.keys()].flatMap((entryId) => {
      const queueId = activeBatchQueueIds.get(entryId) || entryId.split("::")[0];
      const item = items.find((entry) => entry.driveFileId === entryId)
        || items.find((entry) => entry.driveFileId === queueId && entry.batchId === activeBatchId)
        || items.find((entry) => entry.jobId === queueId && entry.batchId === activeBatchId);
      const reportedStatus = batchResultStatuses.get(entryId)?.toLowerCase() || "";
      const status = (reportedStatus === "skipped" ? reportedStatus : item?.status || reportedStatus).toLowerCase();
      if (status !== "failed") return [];
      return [{
        queueId,
        entryId,
        item,
        file: batchFiles.current.get(entryId),
        name: item?.driveFileName || activeBatch.get(entryId) || queueId,
        message: item?.errorMessage || batchResultMessages.get(entryId) || "The screening workflow could not process this resume.",
      }];
    });
  }, [activeBatch, activeBatchId, activeBatchQueueIds, batchResultMessages, batchResultStatuses, items]);
  const visibleCounts = useMemo(() => {
    const normalized: Record<string, number> = {};
    for (const [rawStatus, count] of Object.entries(counts)) {
      const label = displayStatus(rawStatus).label;
      normalized[label] = (normalized[label] || 0) + count;
    }
    return normalized;
  }, [counts]);
  // The upload endpoint reserves every item before returning, but a fresh
  // Sheets read can briefly lag or omit one event while concurrent append
  // requests settle. Keep the accepted batch visible from the client-side
  // manifest until the queue snapshot catches up, instead of showing a
  // progress item that has no corresponding row below it.
  const visibleItems = useMemo(() => {
    if (activeBatch.size === 0) return items;
    const itemsById = new Map(items.map((item) => [item.driveFileId, item]));
    const activeItems = [...activeBatch.entries()].map(([queueId, fileName]) => itemsById.get(queueId) || {
      driveFileId: queueId,
      driveFileName: fileName,
      driveFileUrl: "",
      roleId,
      candidateName: "",
      candidateEmail: "",
      status: batchResultStatuses.get(queueId) || "Queued",
      applicationId: "",
      errorMessage: batchResultMessages.get(queueId) || "",
      discoveredAt: "",
      processingStartedAt: "",
      processedAt: "",
      attemptCount: "",
      lastUpdated: "",
    });
    const activeIds = new Set(activeBatch.keys());
    return [...activeItems, ...items.filter((item) => !activeIds.has(item.driveFileId))];
  }, [activeBatch, batchResultMessages, batchResultStatuses, items, roleId]);

  return (
    <section className="bulk-screening-panel" aria-labelledby="bulk-screening-title">
      <div className="bulk-screening-header">
        <div>
          <span className="form-eyebrow">BULK RESUME SCREENING</span>
          <h2 id="bulk-screening-title">Bulk upload resumes</h2>
          <p>Select a published role and upload multiple PDF, DOC, or DOCX resumes directly from this page. Smile processes each file once and records its screening status here.</p>
        </div>
        <span className="bulk-screening-badge">One-time screening</span>
      </div>

      <div className="bulk-screening-body">
        <div className="bulk-screening-controls">
          <label className="field">
            <span>Published role *</span>
            <select value={roleId} onChange={(event) => selectRole(event.target.value)}>
              <option value="">Select a published role</option>
              {roleOptions.map((role) => <option key={role.roleId} value={role.roleId}>{role.label}</option>)}
            </select>
          </label>
          <div className="bulk-screening-action">
            {driveUrl && <button type="button" className="btn btn-secondary" disabled={!roleId} onClick={openDriveFolder}>Upload from Google Drive</button>}
          </div>
        </div>

        <label
          className={`bulk-screening-dropzone${dragActive ? " is-active" : ""}${!roleId ? " is-disabled" : ""}`}
          onDragOver={(event) => { event.preventDefault(); if (roleId) setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            if (roleId && !uploading && event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
          }}
        >
          {/* Match the browser picker with the server PDF/DOC/DOCX allowlist. */}
          <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple disabled={!roleId || uploading} onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }} />
          <div className="bulk-screening-dropzone-copy">
            <strong>Drag and drop resumes here, or click to choose files</strong>
            <span>Up to {MAX_FILES_PER_BATCH} PDF, DOC, or DOCX files per batch, 10 MB each. {files.length > 0 ? `${files.length} file${files.length === 1 ? "" : "s"} selected.` : "No files selected yet."}</span>
          </div>
        </label>

        {files.length > 0 && (
          <div className="bulk-screening-file-list">
            {files.map((file) => (
              <span key={`${file.name}-${file.size}-${file.lastModified}`} className="bulk-screening-file-chip">
                {file.name}
                <button type="button" aria-label={`Remove ${file.name}`} disabled={uploading} onClick={() => removeFile(file)}>&#x2715;</button>
              </span>
            ))}
          </div>
        )}

        <div className="bulk-screening-upload-box">
          <span className="bulk-screening-count">{files.length} file{files.length === 1 ? "" : "s"} ready to submit</span>
          <button type="button" className="btn btn-primary" disabled={!roleId || files.length === 0 || uploading} onClick={() => void uploadResumes(files)}>{uploading ? "Uploading and screening..." : `Start screening${files.length ? ` (${files.length})` : ""}`}</button>
        </div>

        {validationMessage && <div className="warning-box bulk-screening-validation" role="alert">{validationMessage}</div>}
        {uploadMessage && <div className="success-box">{uploadMessage}</div>}
        {batchFailureDetails.length > 0 && !uploading && (
          <div className="error-box bulk-screening-retry-box" role="alert">
            <div>
              <strong>{batchFailureDetails.length} resume{batchFailureDetails.length === 1 ? "" : "s"} failed to process.</strong>
              <ul>{batchFailureDetails.map((failure) => <li key={failure.queueId}><strong>{failure.name}</strong>: {failure.message}</li>)}</ul>
            </div>
            <span>Use Retry on a failed queue row. Upload failures without a saved file can be submitted again from the file picker.</span>
          </div>
        )}

        <div className="bulk-screening-instructions">
          <strong>{selectedRole ? `Upload resumes for ${selectedRole.label}` : "How bulk screening works"}</strong>
          <ol>
            <li>Choose a published role.</li>
            <li>Drag in (or select) multiple PDF, DOC, or DOCX files and start screening.</li>
            <li>Smile extracts the candidate details, submits each resume to the screening workflow, and updates the queue below in real time.</li>
            <li>Files marked Completed are identified by role and file hash and are never analyzed again for that role. Failed files can be retried without re-uploading the whole batch.</li>
          </ol>
        </div>

        {batchTotal > 0 && (
          <div className="bulk-screening-progress" aria-live="polite">
            <div className="bulk-screening-progress-header"><strong>Bulk Resume Processing</strong><span>{batchProcessed} / {batchTotal} resumes processed</span></div>
            <div className="bulk-screening-progress-track"><div className="bulk-screening-progress-fill" style={{ width: `${batchPercent}%` }} /></div>
            <div className="bulk-screening-progress-legend">
              <span>{batchPercent}% complete</span>
              <span>{batchTerminal.queued} queued</span>
              <span>{batchTerminal.processing} processing</span>
              <span>{batchTerminal.completed} completed</span>
              <span>{batchTerminal.failed} failed</span>
              {batchTerminal.skipped > 0 && <span>{batchTerminal.skipped} skipped</span>}
            </div>
          </div>
        )}

        {batchFinished && !uploading && (
          <div className="success-box bulk-screening-finished" aria-live="polite">
            <div>
              <strong>Bulk screening completed</strong>
              <span>{batchTerminal.completed} successfully processed{batchTerminal.failed ? ` · ${batchTerminal.failed} failed` : ""}{batchTerminal.skipped ? ` · ${batchTerminal.skipped} skipped` : ""}</span>
            </div>
            <div className="bulk-screening-finished-actions">
              <a className="btn btn-primary" href="/applicants">View Processed Applicants</a>
            </div>
          </div>
        )}

        <div className="bulk-screening-status-header">
          <div><strong>Role Total</strong><small>{roleId ? statusAvailable ? `Current status for each saved screening record in ${roleId}${anyPending ? " · updating automatically every 15 seconds" : ""}` : "Loading status from the screening queue…" : "Select a role to view its records"}</small></div>
          <button type="button" className="btn btn-secondary" onClick={() => void refreshStatus()} disabled={loading}>{loading ? "Refreshing..." : "Refresh status"}</button>
        </div>

        {!configured && <div className="warning-box" role="alert">{error || "Create the Bulk_Resume_Queue tab to view processing status."}</div>}
        {configured && error && <div className="error-box" role="alert">{error}</div>}

        {statusAvailable && configured && <div className="bulk-screening-counts">
          {statusOrder.map((status) => <div key={status} className="bulk-count-card"><span>{status}</span><strong>{visibleCounts[status] || 0}</strong></div>)}
        </div>}

        {roleId && statusAvailable && visibleItems.length > 0 ? (
          <div className="bulk-screening-table-wrap">
            <table className="bulk-screening-table">
              <thead><tr><th>Resume</th><th>Candidate</th><th>Status</th><th>Result</th><th>Updated</th><th>Action</th></tr></thead>
              <tbody>
                {visibleItems.map((item) => {
                  const { label, result } = displayStatus(item.status || "Queued");
                  return <tr key={item.driveFileId}>
                    <td>{item.driveFileUrl ? <a href={item.driveFileUrl} target="_blank" rel="noreferrer">{item.driveFileName || item.driveFileId}</a> : item.driveFileName || item.driveFileId}</td>
                    <td>{item.candidateName || item.candidateEmail || "Pending extraction"}</td>
                    <td><span className={statusClass(label)}>{label}</span></td>
                    <td>{item.errorMessage || result}</td>
                    <td>{item.lastUpdated || item.processedAt || item.discoveredAt || "—"}</td>
                    <td>{label === "Failed" && item.driveFileUrl && <button type="button" className="btn btn-secondary" disabled={Boolean(retryingQueueId)} onClick={() => void retryQueueItem(item.driveFileId)}>{retryingQueueId === item.driveFileId ? "Retrying…" : "Retry"}</button>}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="bulk-screening-empty">{!roleId ? "Choose a published role to see its bulk screening status." : !statusAvailable ? "Queue status is unavailable until the backend responds; no zero totals are shown." : "No bulk resumes have been detected for this role yet."}</p>}
      </div>
    </section>
  );
}
