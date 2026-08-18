import crypto from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import mammoth from "mammoth";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import WordExtractor from "word-extractor";

// This module is the single server-side boundary for resume validation,
// extraction, private storage, download tokens, and retention cleanup.
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
};

export type StoredResume = {
  record: ResumeFileRecord;
  extractedText: string;
};

function accessSecret() {
  const secret = process.env.N8N_WEBHOOK_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("Resume download signing is not configured.");
  return secret;
}

function storageDirectory() {
  const configured = process.env.RESUME_STORAGE_DIR?.trim();
  return path.resolve(configured || path.join(process.cwd(), "data", "private-resumes"));
}

function metadataPath(fileId: string) {
  return path.join(storageDirectory(), `${fileId}.json`);
}

function binaryPath(record: ResumeFileRecord) {
  return path.join(storageDirectory(), `${record.fileId}.${record.kind}`);
}

function safeFileName(value: string) {
  const base = path.basename(value).replace(/[^a-zA-Z0-9._ -]/g, "_").trim();
  return base.slice(0, 180) || "resume";
}

function detectKind(fileName: string, mimeType: string): ResumeFileKind | null {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".pdf" && (!mimeType || mimeType === PDF_MIME || mimeType === "application/octet-stream")) return "pdf";
  if (extension === ".docx" && (!mimeType || mimeType === DOCX_MIME || mimeType === "application/octet-stream")) return "docx";
  // Legacy binary Word format (pre-2007). Distinct from "docx" (a zip/XML
  // container) — needs its own OLE compound-file parser below.
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
  // 1A E1 — a completely different container format from DOCX's zip header.
  const oleSignature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (buffer.length < oleSignature.length || !oleSignature.every((byte, index) => buffer[index] === byte)) {
    throw new Error("The uploaded DOC signature is invalid.");
  }
}

function normalizeExtractedText(value: string) {
  return value.replace(/\u0000/g, " ").replace(/[ \t]+/g, " ").replace(/\r?\n\s*/g, "\n").trim().slice(0, 50000);
}

async function extractText(buffer: Buffer, kind: ResumeFileKind) {
  const textValue = kind === "pdf"
    ? (await pdfParse(buffer)).text
    : kind === "docx"
      ? (await mammoth.extractRawText({ buffer })).value
      : (await new WordExtractor().extract(buffer)).getBody();
  const text = normalizeExtractedText(textValue || "");
  if (text.length < 20) throw new Error("The uploaded resume does not contain enough readable text.");
  return text;
}

function retentionExpiry(uploadedAt: Date) {
  const expiresAt = new Date(uploadedAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + RESUME_RETENTION_DAYS);
  return expiresAt.toISOString();
}

function isResumeFileRecord(value: unknown): value is ResumeFileRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ResumeFileRecord>;
  return typeof record.fileId === "string"
    && /^RES-[0-9a-f-]{36}$/i.test(record.fileId)
    && (record.kind === "pdf" || record.kind === "docx" || record.kind === "doc")
    && typeof record.expiresAt === "string"
    && Number.isFinite(Date.parse(record.expiresAt));
}

/** Remove expired metadata/binaries and abandoned binaries from the private store. */
export async function cleanupExpiredResumeFiles(now = Date.now()) {
  const directory = storageDirectory();
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { deleted: 0, scanned: 0 };
    throw error;
  }

  let deleted = 0;
  const metadataIds = new Set<string>();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const fileId = entry.name.slice(0, -5);
    if (!/^RES-[0-9a-f-]{36}$/i.test(fileId)) continue;
    metadataIds.add(fileId.toLowerCase());

    try {
      const record = JSON.parse(await readFile(path.join(directory, entry.name), "utf8")) as unknown;
      if (isResumeFileRecord(record) && record.fileId === fileId && Date.parse(record.expiresAt) <= now) {
        await deleteResumeFile(record);
        deleted += 1;
      }
    } catch {
      // Leave malformed metadata for an operator to inspect rather than
      // deleting an unknown file from a configured storage directory.
    }
  }

  const orphanCutoff = now - RESUME_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(pdf|docx?)$/i.test(entry.name)) continue;
    const fileId = entry.name.replace(/\.(pdf|docx?)$/i, "");
    if (!/^RES-[0-9a-f-]{36}$/i.test(fileId) || metadataIds.has(fileId.toLowerCase())) continue;
    try {
      const details = await stat(path.join(directory, entry.name));
      if (details.mtimeMs <= orphanCutoff) {
        await rm(path.join(directory, entry.name), { force: true });
        deleted += 1;
      }
    } catch {
      // A concurrent cleanup or upload may have removed the file already.
    }
  }

  return { deleted, scanned: entries.length };
}

let lastCleanupAt = 0;
let cleanupInFlight: Promise<unknown> | null = null;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

async function cleanupIfDue() {
  const now = Date.now();
  if (cleanupInFlight) return cleanupInFlight;
  if (lastCleanupAt + CLEANUP_INTERVAL_MS > now) return;
  lastCleanupAt = now;
  cleanupInFlight = cleanupExpiredResumeFiles(now)
    .catch((error) => console.warn("[Resume Cleanup] Unable to remove expired files:", error))
    .finally(() => { cleanupInFlight = null; });
  return cleanupInFlight;
}

export async function storeResumeFile(file: File): Promise<StoredResume> {
  await cleanupIfDue();
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
  const record: ResumeFileRecord = {
    fileId: `RES-${crypto.randomUUID()}`,
    fileName,
    mimeType: resumeMimeType(kind),
    size: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    uploadedAt: uploadedAt.toISOString(),
    expiresAt: retentionExpiry(uploadedAt),
    kind,
  };

  const directory = storageDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(binaryPath(record), buffer, { flag: "wx", mode: 0o600 });
  await writeFile(metadataPath(record.fileId), JSON.stringify(record), { flag: "wx", mode: 0o600 });
  return { record, extractedText };
}

export async function getResumeFileRecord(fileId: string) {
  if (!/^RES-[0-9a-f-]{36}$/i.test(fileId)) return null;
  try {
    const record = JSON.parse(await readFile(metadataPath(fileId), "utf8")) as unknown;
    if (!isResumeFileRecord(record) || record.fileId !== fileId) return null;
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
  return readFile(binaryPath(record));
}

export async function deleteResumeFile(record: ResumeFileRecord) {
  await Promise.all([
    rm(binaryPath(record), { force: true }),
    rm(metadataPath(record.fileId), { force: true }),
  ]);
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
