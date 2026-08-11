"use client";

import { useMemo, useState, type FormEvent } from "react";

type RoleOption = {
  roleId: string;
  label: string;
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
  defaultApplicationSource?: string;
  applicationSourceOptions?: string[];
  showRoleSelect?: boolean;
};

type FormState = {
  candidateName: string;
  email: string;
  phone: string;
  preferredMobile: string;
  resumeText: string;
  salaryExpectation: string;
  noticePeriod: string;
  availability: string;
  skillsAssessment: string;
  roleExpectations: string;
  applicationSource: string;
  roleId: string;
  consent: boolean;
};

const defaultSources = [
  "Direct Application",
  "Referral",
  "Walk-in",
  "Agency",
  "Existing Database",
  "HR Invitation",
];

function normalizePreferredMobile(value: string) {
  return value.trim().replace(/[\s().-]+/g, "");
}

function isPreferredMobileValid(value: string) {
  return /^\+[1-9]\d{7,14}$/.test(normalizePreferredMobile(value));
}

function readFieldError(errors: Partial<Record<keyof FormState, string>>, key: keyof FormState) {
  return errors[key] || "";
}

export default function CandidateApplicationForm({
  roleId = "",
  roleOptions = [],
  submitUrl = "/api/public/applications",
  title = "Apply for this role",
  description = "Share a few details so the recruitment team can review your application.",
  submitLabel = "Submit Application",
  requireConsent = true,
  defaultApplicationSource = "Direct Application",
  applicationSourceOptions = defaultSources,
  showRoleSelect = false,
}: Props) {
  const [form, setForm] = useState<FormState>({
    candidateName: "",
    email: "",
    phone: "",
    preferredMobile: "",
    resumeText: "",
    salaryExpectation: "",
    noticePeriod: "",
    availability: "",
    skillsAssessment: "",
    roleExpectations: "",
    applicationSource: defaultApplicationSource,
    roleId,
    consent: false,
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);

  const selectedRoleLabel = useMemo(
    () => roleOptions.find((option) => option.roleId === form.roleId)?.label || "",
    [form.roleId, roleOptions],
  );

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
    setMessage("");
    setFieldErrors((current) => ({ ...current, [key]: "" }));
  };

  function validate() {
    const nextErrors: Partial<Record<keyof FormState, string>> = {};

    if (!form.candidateName.trim()) nextErrors.candidateName = "Candidate name is required.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim().toLowerCase())) nextErrors.email = "Enter a valid email address.";
    if (!form.preferredMobile.trim()) {
      nextErrors.preferredMobile = "Preferred mobile is required.";
    } else if (!isPreferredMobileValid(form.preferredMobile)) {
      nextErrors.preferredMobile = "Use an international mobile number such as +639171234567 or +6581234567.";
    }
    if (!form.resumeText.trim() || form.resumeText.trim().length < 20) nextErrors.resumeText = "Resume text must be at least 20 characters.";
    if (showRoleSelect && !form.roleId.trim()) nextErrors.roleId = "Choose a role.";
    if (requireConsent && !form.consent) nextErrors.consent = "Please confirm consent before submitting.";

    setFieldErrors(nextErrors);
    return nextErrors;
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
      const response = await fetch(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          roleId: form.roleId || roleId,
          preferredMobile: normalizePreferredMobile(form.preferredMobile),
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) {
        throw new Error(result.error || "Unable to submit application.");
      }
      setMessage(result.message || `Application submitted. Application ID: ${result.applicationId}`);
      setForm({
        candidateName: "",
        email: "",
        phone: "",
        preferredMobile: "",
        resumeText: "",
        salaryExpectation: "",
        noticePeriod: "",
        availability: "",
        skillsAssessment: "",
        roleExpectations: "",
        applicationSource: defaultApplicationSource,
        roleId: roleId || "",
        consent: false,
      });
      setFieldErrors({});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to submit application.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form-layout candidate-form-layout" onSubmit={submit}>
      <div className="form-card candidate-form-card">
        <div className="card-header">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
            {selectedRoleLabel && <small>{selectedRoleLabel}</small>}
          </div>
        </div>

        {error && <div className="error-box" role="alert">{error}</div>}
        {message && <div className="success-box" role="status">{message}</div>}

        <div className="grid-2 candidate-form-grid">
          {showRoleSelect ? (
            <label className="field">
              <span>Role *</span>
              <select required value={form.roleId} disabled={saving} onChange={(event) => update("roleId", event.target.value)}>
                <option value="">Choose a role</option>
                {roleOptions.map((option) => (
                  <option key={option.roleId} value={option.roleId}>
                    {option.label}{option.status ? ` (${option.status})` : ""}
                  </option>
                ))}
              </select>
              {readFieldError(fieldErrors, "roleId") && <small>{readFieldError(fieldErrors, "roleId")}</small>}
            </label>
          ) : (
            <input type="hidden" name="roleId" value={form.roleId || roleId} />
          )}

          <label className="field">
            <span>Application source</span>
            <select value={form.applicationSource} disabled={saving} onChange={(event) => update("applicationSource", event.target.value)}>
              {applicationSourceOptions.map((source) => <option key={source}>{source}</option>)}
            </select>
          </label>

          <label className="field">
            <span>Candidate name *</span>
            <input required value={form.candidateName} disabled={saving} onChange={(event) => update("candidateName", event.target.value)} />
            {readFieldError(fieldErrors, "candidateName") && <small>{readFieldError(fieldErrors, "candidateName")}</small>}
          </label>

          <label className="field">
            <span>Email *</span>
            <input required type="email" value={form.email} disabled={saving} onChange={(event) => update("email", event.target.value)} />
            {readFieldError(fieldErrors, "email") && <small>{readFieldError(fieldErrors, "email")}</small>}
          </label>

          <label className="field">
            <span>Phone</span>
            <input value={form.phone} disabled={saving} onChange={(event) => update("phone", event.target.value)} />
          </label>

          <label className="field">
            <span>Preferred mobile *</span>
            <input
              required
              value={form.preferredMobile}
              disabled={saving}
              placeholder="+639171234567"
              onChange={(event) => update("preferredMobile", event.target.value)}
            />
            {readFieldError(fieldErrors, "preferredMobile") && <small>{readFieldError(fieldErrors, "preferredMobile")}</small>}
          </label>

          <label className="field">
            <span>Salary expectation</span>
            <input value={form.salaryExpectation} disabled={saving} onChange={(event) => update("salaryExpectation", event.target.value)} />
          </label>

          <label className="field">
            <span>Notice period</span>
            <input value={form.noticePeriod} disabled={saving} onChange={(event) => update("noticePeriod", event.target.value)} />
          </label>

          <label className="field">
            <span>Availability</span>
            <input value={form.availability} disabled={saving} onChange={(event) => update("availability", event.target.value)} />
          </label>

          <label className="field full">
            <span>Resume text *</span>
            <textarea
              required
              minLength={20}
              value={form.resumeText}
              disabled={saving}
              placeholder="Paste the resume text or a concise summary."
              onChange={(event) => update("resumeText", event.target.value)}
            />
            {readFieldError(fieldErrors, "resumeText") && <small>{readFieldError(fieldErrors, "resumeText")}</small>}
          </label>

          <label className="field full">
            <span>Skills assessment</span>
            <textarea
              value={form.skillsAssessment}
              disabled={saving}
              placeholder="Optional notes about the candidate's skills."
              onChange={(event) => update("skillsAssessment", event.target.value)}
            />
          </label>

          <label className="field full">
            <span>Role expectations</span>
            <textarea
              value={form.roleExpectations}
              disabled={saving}
              placeholder="What the candidate expects from the role."
              onChange={(event) => update("roleExpectations", event.target.value)}
            />
          </label>

          {requireConsent && (
            <label className="field full">
              <span>
                <input
                  required
                  type="checkbox"
                  checked={form.consent}
                  disabled={saving}
                  onChange={(event) => update("consent", event.target.checked)}
                />
                {" "}
                I consent to the processing of my application.
              </span>
              {readFieldError(fieldErrors, "consent") && <small>{readFieldError(fieldErrors, "consent")}</small>}
            </label>
          )}
        </div>

        <div className="candidate-form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Submitting..." : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
