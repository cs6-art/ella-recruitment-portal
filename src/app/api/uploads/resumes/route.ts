import { NextResponse } from "next/server";

import { MAX_RESUME_FILE_BYTES, storeResumeFile } from "@/lib/resume-files";

export const runtime = "nodejs";

function failure(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const value = formData.get("resumeFile");
    if (!(value instanceof File)) return failure("Attach one PDF or DOCX resume file.", 422);
    if (value.size > MAX_RESUME_FILE_BYTES) return failure("Resume files must be 10 MB or smaller.", 413);

    const stored = await storeResumeFile(value);
    return NextResponse.json({
      success: true,
      file: {
        fileId: stored.record.fileId,
        fileName: stored.record.fileName,
        mimeType: stored.record.mimeType,
        size: stored.record.size,
        sha256: stored.record.sha256,
        expiresAt: stored.record.expiresAt,
      },
      extractedTextLength: stored.extractedText.length,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process the resume file.";
    console.error("[Resume Upload] POST failed:", message);
    return failure(message, 422);
  }
}
