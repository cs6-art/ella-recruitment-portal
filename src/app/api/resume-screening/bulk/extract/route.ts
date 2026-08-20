import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { extractDocumentText } from "@/lib/document-extraction";
import { isDemoMode } from "@/lib/demo-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidSecret(request: Request) {
  const expected = process.env.N8N_WEBHOOK_SECRET?.trim();
  const received = request.headers.get("x-webhook-secret")?.trim();
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function POST(request: Request) {
  if (isDemoMode()) return NextResponse.json({ success: false, error: "Demo mode is read-only: resume storage and applicant processing are disabled." }, { status: 503 });
  if (!isValidSecret(request)) return NextResponse.json({ success: false, error: "Invalid workflow secret." }, { status: 401 });

  try {
    const url = new URL(request.url);
    const fileName = url.searchParams.get("fileName")?.trim() || "resume.pdf";
    const mimeType = request.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength) return NextResponse.json({ success: false, error: "The resume file is empty." }, { status: 422 });

    const file = new File([bytes], fileName, { type: mimeType });
    const extracted = await extractDocumentText(file);
    return NextResponse.json({
      success: true,
      fileName: extracted.fileName,
      kind: extracted.kind,
      text: extracted.text,
      driveFileId: url.searchParams.get("driveFileId") || "",
      roleId: url.searchParams.get("roleId") || "",
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to extract resume text." }, { status: 422 });
  }
}
