import crypto from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import mammoth from "mammoth";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

export const MAX_RESUME_FILE_BYTES = 10 * 1024 * 1024;
export const RESUME_RETENTION_DAYS = 30;

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type ResumeFileKind = "pdf" | "docx";

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
  return null;
}

function assertSignature(buffer: Buffer, kind: ResumeFileKind) {
  if (kind === "pdf") {
    const header = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("latin1");
    if (!header.includes("%PDF-")) throw new Error("The uploaded PDF signature is invalid.");
    return;
  }

  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
    throw new Error("The uploaded DOCX signature is invalid.");
  }
}

function normalizeExtractedText(value: string) {
  return value.replace(/\u0000/g, " ").replace(/[ \t]+/g, " ").replace(/\r?\n\s*/g, "\n").trim().slice(0, 50000);
}

async function extractText(buffer: Buffer, kind: ResumeFileKind) {
  const textValue = kind === "pdf"
    ? (await pdfParse(buffer)).text
    : (await mammoth.extractRawText({ buffer })).value;
  const text = normalizeExtractedText(textValue || "");
  if (text.length < 20) throw new Error("The uploaded resume does not contain enough readable text.");
  return text;
}

function retentionExpiry(uploadedAt: Date) {
  const expiresAt = new Date(uploadedAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + RESUME_RETENTION_DAYS);
  return expiresAt.toISOString();
}

export async function storeResumeFile(file: File): Promise<StoredResume> {
  const fileName = safeFileName(file.name || "resume");
  const kind = detectKind(fileName, file.type);
  if (!kind) throw new Error("Only PDF and DOCX resume files are supported.");
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
    mimeType: kind === "pdf" ? PDF_MIME : DOCX_MIME,
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
    const record = JSON.parse(await readFile(metadataPath(fileId), "utf8")) as ResumeFileRecord;
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
  return kind === "pdf" ? PDF_MIME : DOCX_MIME;
}

export const resumeFileConstants = {
  pdfMimeType: PDF_MIME,
  docxMimeType: DOCX_MIME,
};
