"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import ActionFeedback from "@/components/ActionFeedback";
import ValidationSummary from "@/components/ValidationSummary";
import { roleCountryProfile } from "@/lib/role-countries";

type RoleOption = {
  roleId: string;
  label: string;
  roleCountry?: string;
  status?: string;
};

type Props = {
  roleId?: string;
  roleOptions?: RoleOption[];
  submitUrl?: string;
  title?: string;
  description?: string;
  submitLabel?: string;
  requireConsent?: boolean;
  showRoleSelect?: boolean;
  roleCountry?: string;
  successRedirectTo?: string;
};

type FormState = {
  candidateName: string;
  email: string;
  localContactNumber: string;
  resumeRoleId: string;
  salaryExpectation: string;
};

// Vercel caps a serverless function's entire request body at ~4.5 MB and
// rejects anything larger at the edge with a plain-text "Request Entity Too
// Large" before our route runs. Keep the resume comfortably under that so the
// multipart overhead (form fields + boundaries) still fits and the applicant
// gets a real validation message instead of a broken JSON-parse error.
const maxResumeFileBytes = 4 * 1024 * 1024;
const maxResumeFileLabel = "4 MB";
// Keep client-side MIME checks aligned with server signature and extractor
// checks, including legacy binary Word documents.
const resumeMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
]);

// Infra in front of the route (Vercel edge, gateways) can answer with a
// plain-text or HTML body — e.g. "Request Entity Too Large". Parsing that as
// JSON unconditionally surfaced a cryptic "Unexpected token ... is not valid
// JSON" as the submission error, so tolerate a non-JSON body here.
async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function cleanDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeCountryCode(value: string) {
  const digits = cleanDigits(value).slice(0, 4);
  return digits ? `+${digits}` : "";
}

function normalizedContactNumber(countryCode: string, localNumber: string) {
  return `${normalizeCountryCode(countryCode)}${cleanDigits(localNumber)}`;
}

function readFieldError(errors: Partial<Record<keyof FormState | "resumeFile", string>>, key: keyof FormState | "resumeFile") {
  return errors[key] || "";
}

const fieldLabels: Record<string, string> = {
  candidateName: "Full Name",
  localContactNumber: "Contact Number",
  email: "Email Address",
  resumeRoleId: "Role Applied For",
  salaryExpectation: "Expected Salary (Monthly)",
  resumeFile: "Resume Upload",
};

const fieldAnchors: Record<string, string> = {
  candidateName: "#candidate-name",
  localContactNumber: "#candidate-contact-number",
  email: "#candidate-email",
  resumeRoleId: "#candidate-role",
  salaryExpectation: "#candidate-salary-expectation",
  resumeFile: "#candidate-resume",
};

export default function CandidateApplicationForm({
  roleId = "",
  roleOptions = [],
  submitUrl = "/api/public/applications",
  title = "Start a resume screening",
  description = "Upload the candidate resume to begin the automated screening process.",
  submitLabel = "Submit My Application",
  requireConsent = true,
  showRoleSelect = false,
  roleCountry = "",
  successRedirectTo,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    candidateName: "",
    email: "",
    localContactNumber: "",
    resumeRoleId: roleId,
    salaryExpectation: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState | "resumeFile", string>>>({});
  const [saving, setSaving] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const selectedRoleLabel = useMemo(
    () => roleOptions.find((option) => option.roleId === form.resumeRoleId)?.label || "",
    [form.resumeRoleId, roleOptions],
  );
  const selectedRoleCountry = useMemo(
    () => roleCountryProfile(roleOptions.find((option) => option.roleId === form.resumeRoleId)?.roleCountry || roleCountry),
    [form.resumeRoleId, roleOptions, roleCountry],
  );

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
    setMessage("");
    setFieldErrors((current) => ({ ...current, [key]: "" }));
  };

  function validate() {
    const nextErrors: Partial<Record<keyof FormState | "resumeFile", string>> = {};
    const contactNumber = normalizedContactNumber(selectedRoleCountry?.dialCode || "", form.localContactNumber);

    if (!form.candidateName.trim()) nextErrors.candidateName = "Full name is required.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim().toLowerCase())) nextErrors.email = "Enter a valid email address.";
    if (!/^\+[1-9]\d{7,14}$/.test(contactNumber)) nextErrors.localContactNumber = "Enter a valid local contact number.";
    if (!resumeFile) nextErrors.resumeFile = "Choose a PDF, DOC, or DOCX resume file.";
    if (showRoleSelect && !form.resumeRoleId.trim()) nextErrors.resumeRoleId = "Choose a role.";
    const salaryAmount = Number(form.salaryExpectation.replace(/,/g, "").trim());
    if (!form.salaryExpectation.trim() || !Number.isFinite(salaryAmount) || salaryAmount <= 0) nextErrors.salaryExpectation = "Enter a valid expected monthly salary.";
    if (!selectedRoleCountry) nextErrors.resumeRoleId = "The selected role has no supported country configured. Please choose another role.";

    setFieldErrors(nextErrors);
    return nextErrors;
  }

  function selectResumeFile(file: File | null) {
    setResumeFile(null);
    setFieldErrors((current) => ({ ...current, resumeFile: "" }));
    if (!file) return;
    const extension = file.name.toLowerCase().split(".").pop();
    if (!extension || !["pdf", "doc", "docx"].includes(extension) || !resumeMimeTypes.has(file.type || "application/octet-stream")) {
      setFieldErrors((current) => ({ ...current, resumeFile: "Please upload a PDF, DOC, or DOCX file." }));
      setError("That file type is not accepted. Please upload your resume as a PDF, DOC, or DOCX file.");
      return;
    }
    if (file.size > maxResumeFileBytes) {
      setFieldErrors((current) => ({ ...current, resumeFile: `Please upload a file that is ${maxResumeFileLabel} or smaller.` }));
      setError(`Your resume file is too big. Please upload a file that is ${maxResumeFileLabel} or smaller.`);
      return;
    }
    setResumeFile(file);
    setError("");
    setMessage("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    const validation = validate();
    if (Object.keys(validation).length > 0) {
      setSaving(false);
      setError("Please fix the highlighted fields before submitting.");
      return;
    }

    try {
      const contactNumber = normalizedContactNumber(selectedRoleCountry?.dialCode || "", form.localContactNumber);
      const body = new FormData();
      body.append("candidateName", form.candidateName.trim());
      body.append("email", form.email.trim().toLowerCase());
      body.append("roleId", form.resumeRoleId || roleId);
      // Keep the two existing backend/sheet aliases identical while the UI
      // exposes one contact number only.
      body.append("contactNumber", contactNumber);
      body.append("phone", contactNumber);
      body.append("preferredMobile", contactNumber);
      body.append("salaryExpectation", form.salaryExpectation.trim());
      body.append("applicationSource", "Direct Application");
      body.append("consent", String(requireConsent));
      if (resumeFile) body.append("resumeFile", resumeFile, resumeFile.name);

      const response = await fetch(submitUrl, { method: "POST", body });
      const result = await readJsonResponse(response);
      if (!response.ok || result.success !== true) {
        if (response.status === 413 || response.status === 0) {
          throw new Error(`Your resume file is too big to send. Please upload a file that is ${maxResumeFileLabel} or smaller and try again.`);
        }
        if (typeof result.error === "string" && result.error) throw new Error(result.error);
        throw new Error("Something went wrong while sending your application, and it was not received. Please wait a moment and try again. If it keeps happening, contact the recruiter who sent you this link.");
      }

      const successMessage = typeof result.message === "string" && result.message ? result.message : "";
      setMessage(successMessage || `Application submitted. Application ID: ${String(result.applicationId ?? "")}`);
      setForm({ candidateName: "", email: "", localContactNumber: "", resumeRoleId: roleId || "", salaryExpectation: "" });
      setResumeFile(null);
      setFileInputKey((value) => value + 1);
      if (fileInput.current) fileInput.current.value = "";
      setFieldErrors({});
      if (successRedirectTo) router.push(successRedirectTo);
      else router.refresh();
    } catch (caught) {
      // A thrown TypeError here means the request never reached the server
      // (no connection, request blocked). Everything else already carries a
      // plain-language message from the checks above.
      const isNetworkError = caught instanceof TypeError;
      setError(
        isNetworkError
          ? "We could not reach the application server. Please check your internet connection and try again."
          : caught instanceof Error && caught.message
            ? caught.message
            : "Your application could not be sent. Please try again in a moment.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form-layout candidate-form-layout resume-screening-form" noValidate onSubmit={submit}>
      <div className="form-card candidate-form-card">
        <div className="card-header">
          <div>
            <span className="form-eyebrow">RESUME SCREENING</span>
            <h2>{title}</h2>
            <p>{description}</p>
            {selectedRoleLabel && <small>{selectedRoleLabel}</small>}
          </div>
        </div>

        {error && <ValidationSummary error={error} title="Submission failed" issues={Object.entries(fieldErrors).filter(([, message]) => Boolean(message)).map(([field, message]) => ({ field, label: fieldLabels[field] || field, message, href: fieldAnchors[field] }))} />}
        {message && <ActionFeedback kind="success">{message}</ActionFeedback>}

        <div className="candidate-form-fields">
          <label className="field">
            <span>Full Name *</span>
            <input id="candidate-name" required value={form.candidateName} disabled={saving} onChange={(event) => update("candidateName", event.target.value)} />
            {readFieldError(fieldErrors, "candidateName") && <small>{readFieldError(fieldErrors, "candidateName")}</small>}
          </label>

          <div className="field contact-number-field">
            <span>Contact Number *</span>
            <input id="candidate-contact-number" required aria-label="Local contact number" inputMode="numeric" placeholder={selectedRoleCountry?.phonePlaceholder || "Select a role first"} value={form.localContactNumber} disabled={saving} onChange={(event) => update("localContactNumber", cleanDigits(event.target.value))} />
            <small>{selectedRoleCountry ? `${selectedRoleCountry.name} (+${selectedRoleCountry.dialCode}) — enter the local number only.` : "Select a role to set the country code automatically."}</small>
            {readFieldError(fieldErrors, "localContactNumber") && <small>{readFieldError(fieldErrors, "localContactNumber")}</small>}
          </div>

          <label className="field">
            <span>Email Address *</span>
            <input id="candidate-email" required type="email" value={form.email} disabled={saving} onChange={(event) => update("email", event.target.value)} />
            {readFieldError(fieldErrors, "email") && <small>{readFieldError(fieldErrors, "email")}</small>}
          </label>

          {showRoleSelect ? (
            <label className="field">
              <span>Role Applied For *</span>
              <select id="candidate-role" required value={form.resumeRoleId} disabled={saving} onChange={(event) => update("resumeRoleId", event.target.value)}>
                <option value="">Select a role</option>
                {roleOptions.map((option) => <option key={option.roleId} value={option.roleId}>{option.label}</option>)}
              </select>
              {readFieldError(fieldErrors, "resumeRoleId") && <small>{readFieldError(fieldErrors, "resumeRoleId")}</small>}
            </label>
          ) : <input type="hidden" name="roleId" value={form.resumeRoleId || roleId} />}

          <label className="field">
            <span>Expected Salary (Monthly) *</span>
            <input id="candidate-salary-expectation" required type="number" min="0.01" step="0.01" inputMode="decimal" value={form.salaryExpectation} disabled={saving} onChange={(event) => update("salaryExpectation", event.target.value)} placeholder="Enter expected monthly salary" />
            {readFieldError(fieldErrors, "salaryExpectation") && <small>{readFieldError(fieldErrors, "salaryExpectation")}</small>}
          </label>

          <div className="field full resume-upload-field">
            <span>Resume Upload *</span>
            <label className="resume-file-picker">
                <input
                id="candidate-resume"
                key={fileInputKey}
                ref={fileInput}
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                disabled={saving}
                onChange={(event) => selectResumeFile(event.target.files?.[0] || null)}
              />
              <span className="resume-file-button">Choose a resume file</span>
              <span className="resume-file-name">{resumeFile?.name || "No file selected"}</span>
            </label>
            <small>PDF, DOC, or DOCX · up to {maxResumeFileLabel}</small>
            {readFieldError(fieldErrors, "resumeFile") && <small>{readFieldError(fieldErrors, "resumeFile")}</small>}
          </div>
        </div>

        <div className="candidate-form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Submitting..." : submitLabel}</button>
        </div>
      </div>
    </form>
  );
}
