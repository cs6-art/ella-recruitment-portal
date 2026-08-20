import { createRequire } from "node:module";

import mammoth from "mammoth";
import WordExtractor from "word-extractor";

export const MAX_DOCUMENT_FILE_BYTES = 10 * 1024 * 1024;

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOC_MIME = "application/msword";

export type DocumentKind = "pdf" | "docx" | "doc";

type PdfTextParser = {
  getText(): Promise<{ text: string }>;
  destroy(): Promise<void>;
};

type PdfTextParserConstructor = new (options: { data: Buffer }) => PdfTextParser;

// Keep the heavyweight PDF implementation out of the route module until a
// PDF is actually uploaded. `createRequire` selects pdf-parse's Node/CJS
// export instead of webpack's browser-oriented import branch on Vercel.
const requirePdfParse = createRequire(import.meta.url);

function createPdfTextParser(data: Buffer): PdfTextParser {
  const { PDFParse } = requirePdfParse("pdf-parse") as { PDFParse: PdfTextParserConstructor };
  return new PDFParse({ data });
}

function detectKind(fileName: string, mimeType: string): DocumentKind | null {
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "pdf" && (!mimeType || mimeType === PDF_MIME || mimeType === "application/octet-stream")) return "pdf";
  if (extension === "docx" && (!mimeType || mimeType === DOCX_MIME || mimeType === "application/octet-stream")) return "docx";
  // Legacy binary Word format (pre-2007). Distinct from "docx" (a zip/XML
  // container) — needs its own OLE compound-file parser below.
  if (extension === "doc" && (!mimeType || mimeType === DOC_MIME || mimeType === "application/octet-stream")) return "doc";
  return null;
}

function assertSignature(buffer: Buffer, kind: DocumentKind) {
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

function normalizeText(value: string) {
  return value.replace(/\u0000/g, " ").replace(/[ \t]+/g, " ").replace(/\r?\n\s*/g, "\n").trim().slice(0, 50000);
}

export async function extractDocumentText(file: File) {
  const fileName = file.name || "job-description";
  const kind = detectKind(fileName, file.type);
  if (!kind) throw new Error("Only PDF, DOC, and DOCX job descriptions are supported.");
  if (!file.size) throw new Error("The uploaded job description is empty.");
  if (file.size > MAX_DOCUMENT_FILE_BYTES) throw new Error("Job description files must be 10 MB or smaller.");

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length !== file.size) throw new Error("The uploaded job description could not be read completely.");
  assertSignature(buffer, kind);

  let extracted: string;
  if (kind === "pdf") {
    // pdf-parse v2 handles current PDF cross-reference and object-stream
    // variants that the old v1 parser rejected as "Invalid PDF structure".
    // Always release parser resources, including when a PDF is malformed.
    const parser = createPdfTextParser(buffer);
    try {
      extracted = (await parser.getText()).text;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "The PDF could not be read.";
      throw new Error(`We could not read text from this PDF (${detail}). Please re-export it as a standard PDF, or upload the original DOC/DOCX file.`);
    } finally {
      await parser.destroy();
    }
  } else if (kind === "docx") {
    extracted = (await mammoth.extractRawText({ buffer })).value;
  } else {
    extracted = await new WordExtractor().extract(buffer).then((document) => document.getBody());
  }
  const text = normalizeText(extracted || "");
  if (text.length < 20) throw new Error("The uploaded job description does not contain enough readable text.");
  return { fileName, kind, text };
}
