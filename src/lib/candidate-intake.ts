export type CandidateIntakeRequest = {
  body: Record<string, unknown>;
  resumeFile: File | null;
};

function formValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : undefined;
}

export async function readCandidateIntakeRequest(request: Request): Promise<CandidateIntakeRequest> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return { body: await request.json() as Record<string, unknown>, resumeFile: null };
  }

  const formData = await request.formData();
  const body: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key === "resumeFile") continue;
    body[key] = formValue(value) ?? "";
  }
  body.consent = body.consent === true || body.consent === "true";
  const file = formData.get("resumeFile");
  return { body, resumeFile: file instanceof File ? file : null };
}

export function candidateBodyForValidation(body: Record<string, unknown>, resumeFile: File | null) {
  return {
    ...body,
    candidateName: body.candidateName ?? body.name,
    preferredMobile: body.preferredMobile ?? body.mobile,
    applicationSource: body.applicationSource || "Direct Application",
    resumeText: resumeFile ? (String(body.resumeText || "").trim() || "Uploaded resume file will be extracted before screening.") : body.resumeText,
  };
}
