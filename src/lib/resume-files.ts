import crypto from "node:crypto";
import { Readable } from "node:stream";
import path from "node:path";

import { google } from "googleapis";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";

import { getGoogleServiceAccountPrivateKey } from "@/lib/google-service-account";
import { requireBulkResumeUatConfig, type BulkResumeEnvironment } from "@/lib/bulk-resume-config";
import { createPdfTextParser } from "@/lib/pdf-text-parser";

// This module is the single server-side boundary for resume validation,
// extraction, private storage, download tokens, and retention cleanup.
//
// Storage backend: Google Drive, not local disk. This app is deployed on
// Vercel, whose serverless functions have a read-only filesystem (writes
// only work under /tmp, and /tmp is neither durable nor shared across
// instances) -- so files written to process.cwd()-relative paths, as this
// module used to do, would fail in production and were never actually
// exercised outside local dev. Since the rest of the system is deliberately
// Sheets-only for data, and a 10 MB PDF is far past what a Sheets cell can
// hold, Drive is the natural fit: it's already the service account this app
// uses, needs no new paid infrastructure, and gives real persistence.
export const MAX_RESUME_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_RESUME_REQUEST_BYTES = MAX_RESUME_FILE_BYTES + 512 * 1024;
export const RESUME_RETENTION_DAYS = 30;

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOC_MIME = "application/msword";

export type ResumeFileKind = "pdf" | "docx" | "doc";

export type ResumeFileRecord = {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
  uploadedAt: string;
  expiresAt: string;
  kind: ResumeFileKind;
  uploadQueueId?: string;
  uploadRoleId?: string;
  uploadOwnerEmail?: string;
};

export type StoredResume = {
  record: ResumeFileRecord;
  extractedText: string;
  reused: boolean;
};

function accessSecret() {
  const secret = process.env.N8N_WEBHOOK_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("Resume download signing is not configured.");
  return secret;
}

let driveAuth: ReturnType<typeof createDriveAuth> | null = null;
let driveClient: ReturnType<typeof google.drive> | null = null;

function createDriveAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = getGoogleServiceAccountPrivateKey();
  if (!email || !key) throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is not configured.");
  return new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/drive.file"] });
}

function auth() {
  if (driveAuth) return driveAuth;
  driveAuth = createDriveAuth();
  return driveAuth;
}

function drive() {
  if (driveClient) return driveClient;
  driveClient = google.drive({ version: "v3", auth: auth() });
  return driveClient;
}

function resumeFolderId(environment: BulkResumeEnvironment = "production") {
  if (environment === "uat") {
    requireBulkResumeUatConfig();
    return process.env.BULK_RESUME_UAT_DRIVE_FOLDER_ID!.trim();
  }
  const folderId = process.env.RESUME_STORAGE_DRIVE_FOLDER_ID?.trim();
  if (!folderId) throw new Error("RESUME_STORAGE_DRIVE_FOLDER_ID is not configured.");
  return folderId;
}

function safeFileName(value: string) {
  const base = path.basename(value).replace(/[^a-zA-Z0-9._ -]/g, "_").trim();
  return base.slice(0, 180) || "resume";
}

// Drive file IDs are opaque, service-generated strings (typically 28-44
// base64url-ish characters) -- nothing like the RES-<uuid> format this
// module minted itself when it managed local filenames directly.
function isPlausibleDriveFileId(value: string) {
  return /^[a-zA-Z0-9_-]{10,80}$/.test(value);
}

function detectKind(fileName: string, mimeType: string): ResumeFileKind | null {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".pdf" && (!mimeType || mimeType === PDF_MIME || mimeType === "application/octet-stream")) return "pdf";
  if (extension === ".docx" && (!mimeType || mimeType === DOCX_MIME || mimeType === "application/octet-stream")) return "docx";
  // Legacy binary Word format (pre-2007). Distinct from "docx" (a zip/XML
  // container) -- needs its own OLE compound-file parser below.
  if (extension === ".doc" && (!mimeType || mimeType === DOC_MIME || mimeType === "application/octet-stream")) return "doc";
  return null;
}

function assertSignature(buffer: Buffer, kind: ResumeFileKind) {
  if (kind === "pdf") {
    const header = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("latin1");
    if (!header.includes("%PDF-")) throw new Error("The uploaded PDF signature is invalid.");
    return;
  }

  if (kind === "docx") {
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
      throw new Error("The uploaded DOCX signature is invalid.");
    }
    return;
  }

  // Legacy .doc files are OLE2 compound documents, signed D0 CF 11 E0 A1 B1
  // 1A E1 -- a completely different container format from DOCX's zip header.
  const oleSignature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (buffer.length < oleSignature.length || !oleSignature.every((byte, index) => buffer[index] === byte)) {
    throw new Error("The uploaded DOC signature is invalid.");
  }
}

const CONTROL_CHAR_PATTERN = new RegExp(String.fromCharCode(0), "g");

function normalizeExtractedText(value: string) {
  return value.replace(CONTROL_CHAR_PATTERN, " ").replace(/[ \t]+/g, " ").replace(/\r?\n\s*/g, "\n").trim().slice(0, 50000);
}

async function extractText(buffer: Buffer, kind: ResumeFileKind) {
  let textValue: string;
  if (kind === "pdf") {
    const parser = createPdfTextParser(buffer);
    try {
      textValue = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  } else if (kind === "docx") {
    textValue = (await mammoth.extractRawText({ buffer })).value;
  } else {
    textValue = await new WordExtractor().extract(buffer).then((document) => document.getBody());
  }
  const text = normalizeExtractedText(textValue || "");
  if (text.length < 20) throw new Error("The uploaded resume does not contain enough readable text.");
  return text;
}

/**
 * Extract a resume for a short-lived screening preparation step without
 * storing the uploaded document. The application submission path still uses
 * storeResumeFile when the candidate submits the full application.
 */
export async function extractResumeText(file: File) {
  const fileName = safeFileName(file.name || "resume");
  const kind = detectKind(fileName, file.type);
  if (!kind) throw new Error("Only PDF, DOC, and DOCX resume files are supported.");
  if (!file.size) throw new Error("The uploaded resume is empty.");
  if (file.size > MAX_RESUME_FILE_BYTES) throw new Error("Resume files must be 10 MB or smaller.");

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length !== file.size) throw new Error("The uploaded resume could not be read completely.");
  assertSignature(buffer, kind);
  return extractText(buffer, kind);
}

function retentionExpiry(uploadedAt: Date) {
  const expiresAt = new Date(uploadedAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + RESUME_RETENTION_DAYS);
  return expiresAt.toISOString();
}

function kindFromProperty(value: string | null | undefined): ResumeFileKind | null {
  return value === "pdf" || value === "docx" || value === "doc" ? value : null;
}

type DriveFileFields = {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  size?: string | null;
  createdTime?: string | null;
  properties?: Record<string, string> | null;
  appProperties?: Record<string, string> | null;
};

function recordFromDriveFile(file: DriveFileFields): ResumeFileRecord | null {
  const kind = kindFromProperty(file.properties?.kind);
  const expiresAt = file.properties?.expiresAt;
  const sha256 = file.properties?.sha256;
  if (!file.id || !file.name || !kind || !expiresAt || !sha256) return null;
  return {
    fileId: file.id,
    fileName: file.name,
    mimeType: file.mimeType || resumeMimeType(kind),
    size: Number(file.size || 0),
    sha256,
    uploadedAt: file.createdTime || new Date(0).toISOString(),
    expiresAt,
    kind,
    uploadQueueId: file.appProperties?.queueId || undefined,
    uploadRoleId: file.appProperties?.roleId || undefined,
    uploadOwnerEmail: file.appProperties?.ownerEmail || undefined,
  };
}

/**
 * Start a private Drive resumable upload so browsers can transfer files larger
 * than Vercel's function request-body limit without routing the binary through
 * a short-lived serverless invocation. The returned session URI is a temporary
 * bearer capability; callers must never log or persist it.
 */
export async function createResumeUploadSession(input: {
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
  roleId: string;
  queueId: string;
  ownerEmail: string;
  environment?: BulkResumeEnvironment;
  /** Origin of the page that will PUT the bytes. Drive only returns CORS headers to the origin named when the session starts. */
  browserOrigin: string;
}) {
  const fileName = safeFileName(input.fileName);
  const kind = detectKind(fileName, input.mimeType);
  if (!kind) throw new Error("Only PDF, DOC, and DOCX resume files are supported.");
  if (!Number.isSafeInteger(input.size) || input.size <= 0) throw new Error("The uploaded resume is empty or has an invalid size.");
  if (input.size > MAX_RESUME_FILE_BYTES) throw new Error("Resume files must be 10 MB or smaller.");
  if (!/^[a-f0-9]{64}$/i.test(input.sha256)) throw new Error("The resume checksum is invalid.");

  await cleanupIfDue(input.environment);
  const uploadedAt = new Date();
  const expiry = retentionExpiry(uploadedAt);
  const folderId = resumeFolderId(input.environment);
  const token = (await auth().getAccessToken()).token;
  if (!token) throw new Error("Google Drive did not issue an upload authorization token.");
  const query = new URLSearchParams({
    uploadType: "resumable",
    supportsAllDrives: "true",
    fields: "id,name,mimeType,size,createdTime,properties,appProperties",
  });
  const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files?${query}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      // Without Origin, Drive omits Access-Control-Allow-Origin on the final
      // 200 response, so the browser reports "Failed to fetch" even though the
      // file was saved.
      Origin: input.browserOrigin,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": resumeMimeType(kind),
      "X-Upload-Content-Length": String(input.size),
    },
    body: JSON.stringify({
      name: fileName,
      parents: [folderId],
      properties: { kind, sha256: input.sha256.toLowerCase(), expiresAt: expiry },
      appProperties: {
        queueId: input.queueId,
        roleId: input.roleId,
        ownerEmail: input.ownerEmail.trim().toLowerCase(),
      },
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    console.error("[Resume Upload] Drive could not start a resumable upload:", response.status);
    throw new Error("Private resume storage could not start the upload. Please try again.");
  }
  const uploadUrl = response.headers.get("location") || "";
  if (!uploadUrl.startsWith("https://www.googleapis.com/upload/drive/v3/files?")) {
    throw new Error("Private resume storage returned an invalid upload session.");
  }
  return { uploadUrl, kind, fileName, mimeType: resumeMimeType(kind), sha256: input.sha256.toLowerCase(), expiresAt: expiry };
}

/** Remove expired resumes from the Drive storage folder. */
export async function cleanupExpiredResumeFiles(now = Date.now(), environment: BulkResumeEnvironment = "production") {
  const client = drive();
  const folderId = resumeFolderId(environment);
  let scanned = 0;
  let deleted = 0;
  let pageToken: string | undefined;

  do {
    const response = await client.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size, createdTime, properties)",
      pageSize: 200,
      pageToken,
      // Service accounts have no personal Drive storage quota. These flags
      // keep retention cleanup compatible with the Shared Drive used for
      // uploaded resumes.
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    const files = response.data.files || [];
    scanned += files.length;
    for (const file of files) {
      const expiresAt = file.properties?.expiresAt;
      if (expiresAt && Date.parse(expiresAt) <= now && file.id) {
        await client.files.delete({ fileId: file.id, supportsAllDrives: true }).catch(() => undefined);
        deleted += 1;
      }
    }
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return { deleted, scanned };
}

const lastCleanupAt = new Map<BulkResumeEnvironment, number>();
const cleanupInFlight = new Map<BulkResumeEnvironment, Promise<unknown>>();
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

async function cleanupIfDue(environment: BulkResumeEnvironment = "production") {
  const now = Date.now();
  const inFlight = cleanupInFlight.get(environment);
  if (inFlight) return inFlight;
  if ((lastCleanupAt.get(environment) || 0) + CLEANUP_INTERVAL_MS > now) return;
  lastCleanupAt.set(environment, now);
  const cleanup = cleanupExpiredResumeFiles(now, environment)
    .catch((error) => console.warn("[Resume Cleanup] Unable to remove expired files:", error))
    .finally(() => { cleanupInFlight.delete(environment); });
  cleanupInFlight.set(environment, cleanup);
  return cleanup;
}

export async function storeResumeFile(file: File, options: { environment?: BulkResumeEnvironment } = {}): Promise<StoredResume> {
  await cleanupIfDue(options.environment).catch(() => undefined);
  const fileName = safeFileName(file.name || "resume");
  const kind = detectKind(fileName, file.type);
  if (!kind) throw new Error("Only PDF, DOC, and DOCX resume files are supported.");
  if (!file.size) throw new Error("The uploaded resume is empty.");
  if (file.size > MAX_RESUME_FILE_BYTES) throw new Error("Resume files must be 10 MB or smaller.");

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length !== file.size) throw new Error("The uploaded resume could not be read completely.");
  assertSignature(buffer, kind);
  const extractedText = await extractText(buffer, kind);
  const uploadedAt = new Date();
  const mimeType = resumeMimeType(kind);
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const expiresAt = retentionExpiry(uploadedAt);

  // Queue history can predate the current jobId contract. Reuse a matching
  // non-expired Drive object when it is already present, so re-submitting a
  // resume after a lost historical queue write does not create another file.
  const existing = await drive().files.list({
    q: `'${resumeFolderId(options.environment)}' in parents and trashed = false and properties has { key='sha256' and value='${sha256}' }`,
    fields: "files(id, name, mimeType, size, createdTime, properties)",
    pageSize: 10,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  const existingRecord = (existing.data.files || [])
    .map(recordFromDriveFile)
    .find((record): record is ResumeFileRecord => Boolean(record && new Date(record.expiresAt).getTime() > Date.now()));
  if (existingRecord) return { record: existingRecord, extractedText, reused: true };

  const response = await drive().files.create({
    // Upload into a Shared Drive folder rather than the service account's
    // quota-less personal Drive space.
    supportsAllDrives: true,
    requestBody: {
      name: fileName,
      parents: [resumeFolderId(options.environment)],
      properties: { kind, sha256, expiresAt },
    },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id, name, mimeType, size, createdTime, properties",
  });

  const record = recordFromDriveFile(response.data);
  if (!record) throw new Error("Unable to store the uploaded resume.");
  return { record, extractedText, reused: false };
}

export async function getResumeFileRecord(fileId: string) {
  if (!isPlausibleDriveFileId(fileId)) return null;
  try {
    const response = await drive().files.get({ fileId, fields: "id, name, mimeType, size, createdTime, properties, appProperties, trashed", supportsAllDrives: true });
    if (response.data.trashed) return null;
    const record = recordFromDriveFile(response.data);
    if (!record) return null;
    if (new Date(record.expiresAt).getTime() <= Date.now()) {
      await deleteResumeFile(record).catch(() => undefined);
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

export async function readResumeFile(record: ResumeFileRecord) {
  const response = await drive().files.get({ fileId: record.fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
  return Buffer.from(response.data as ArrayBuffer);
}

export async function deleteResumeFile(record: ResumeFileRecord) {
  await drive().files.delete({ fileId: record.fileId, supportsAllDrives: true }).catch((error) => {
    // Already gone (e.g. a concurrent cleanup) is not a failure worth surfacing.
    if ((error as { code?: number })?.code !== 404) throw error;
  });
}

export function createResumeDownloadToken(fileId: string, expiresAt: string) {
  const payload = Buffer.from(JSON.stringify({ fileId, exp: new Date(expiresAt).getTime() }), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", accessSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyResumeDownloadToken(token: string, fileId: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = crypto.createHmac("sha256", accessSecret()).update(payload).digest("base64url");
  if (signature.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { fileId?: string; exp?: number };
    return decoded.fileId === fileId && typeof decoded.exp === "number" && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

export function resumeMimeType(kind: ResumeFileKind) {
  return kind === "pdf" ? PDF_MIME : kind === "docx" ? DOCX_MIME : DOC_MIME;
}

export const resumeFileConstants = {
  pdfMimeType: PDF_MIME,
  docxMimeType: DOCX_MIME,
  docMimeType: DOC_MIME,
};
