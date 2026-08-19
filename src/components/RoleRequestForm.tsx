"use client";

import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

import ActionFeedback from "@/components/ActionFeedback";
import UiIcon from "@/components/UiIcon";
import ValidationSummary from "@/components/ValidationSummary";
import { roleRequestSchema } from "@/lib/role-schema";
import type { RoleAiDraft } from "@/lib/role-ai-draft-schema";

type RoleRequestFormProps = {
  user: {
    name: string;
    email: string;
  };
  roleId?: string;
  initialValues?: Partial<FormState>;
};

type RoleSubmissionResult = {
  success?: boolean;
  roleId?: string;
  status?: string;
  error?: string;
};

type FormState = {
  requestType: string;
  department: string;
  jobTitle: string;
  employmentType: string;
  numberOfVacancies: number;
  reasonForRequest: string;
  jobDescription: string;
  replacementEmployee: string;
  targetHiringDate: string;
  hodEmail: string;
  customScreeningQuestion1: string;
  customScreeningQuestion2: string;
  aiGeneratedScreeningQuestions: string[];
  recruitmentSetupDraft: RoleAiDraft["recruitmentSetup"];
};

export type RoleRequestFormValues = FormState;

// All final interviews are owned by the shared HR calendar account.
const HR_INTERVIEW_EMAIL = "hrsg@mclinkgroup.com";

const initial: FormState = {
  requestType: "Staff Addition",
  department: "",
  jobTitle: "",
  employmentType: "Full-Time",
  numberOfVacancies: 1,
  reasonForRequest: "",
  jobDescription: "",
  replacementEmployee: "",
  targetHiringDate: "",
  hodEmail: HR_INTERVIEW_EMAIL,
  customScreeningQuestion1: "",
  customScreeningQuestion2: "",
  aiGeneratedScreeningQuestions: [],
  recruitmentSetupDraft: {
    jobDescription: "",
    screeningCriteria: "",
    requiredInterviewQuestion1: "",
    requiredInterviewQuestion2: "",
    requiredInterviewQuestion3: "",
    requiredInterviewQuestion4: "",
    requiredInterviewQuestion5: "",
    keywordsToLookFor: "",
    minimumYearsOfExperience: "",
    transferableSkillsAccepted: "",
    licenseOrCertificateRequired: "",
    salaryOrBudgetRange: "",
    earliestAvailabilityRule: "",
    evaluationFieldToggles: [],
    customEvaluationFields: [],
    postingChannels: [],
  },
};

const fieldLabels: Record<string, string> = {
  requestType: "Request Type",
  department: "Department",
  jobTitle: "Job Title",
  numberOfVacancies: "Number of Vacancies",
  reasonForRequest: "Reason for Request",
  jobDescription: "Job Description",
  replacementEmployee: "Employee or Position Being Replaced",
  targetHiringDate: "Target Hiring Date",
  hodEmail: "HR interviewer email",
  customScreeningQuestion1: "Custom Screening Question 1",
  customScreeningQuestion2: "Custom Screening Question 2",
};

export default function RoleRequestForm({ user, roleId, initialValues }: RoleRequestFormProps) {
  const isEditing = Boolean(roleId);
  const router = useRouter();
  const initialForm = useMemo<FormState>(() => ({
    ...initial,
    ...initialValues,
    hodEmail: HR_INTERVIEW_EMAIL,
  }), [initialValues]);
  const [form, setForm] = useState<FormState>(() => initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<{ roleId: string; status: string } | null>(null);
  const [jobDescriptionFile, setJobDescriptionFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const initialFormKey = useMemo(() => JSON.stringify(initialForm), [initialForm]);
  const hasChanges = JSON.stringify(form) !== initialFormKey;

  function scrollToErrorSummary() {
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.requestAnimationFrame(() => errorSummaryRef.current?.focus());
  }

  function update(name: keyof FormState, value: string | number) {
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "requestType" && value === "Staff Addition"
        ? { replacementEmployee: "" }
        : {}),
    }));
    setError("");
    setFieldErrors((current) => ({ ...current, [name]: "" }));
  }

  function availabilityPayload() {
    return {
      hodEmail: HR_INTERVIEW_EMAIL,
      // Legacy sheet fields stay empty. Final-interview times now come from
      // the connected HR Google Calendar rather than manually entered windows.
      hodAvailabilitySlots: [],
      hodAvailabilityDates: "",
      hodAvailabilityTimes: "",
    };
  }

  async function populateFromJobDescription() {
    if (!jobDescriptionFile) {
      setParseError("Choose a PDF, DOC, or DOCX job description first.");
      return;
    }

    setParsing(true);
    setParseError("");
    try {
      const body = new FormData();
      body.append("jobDescriptionFile", jobDescriptionFile);
      const response = await fetch("/api/roles/parse-description", {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      const result = await response.json() as { success?: boolean; error?: string; draft?: RoleAiDraft };
      if (!response.ok || result.success !== true || !result.draft) throw new Error(result.error || "Unable to generate the role draft.");

      const questions = [
        result.draft.recruitmentSetup.requiredInterviewQuestion1,
        result.draft.recruitmentSetup.requiredInterviewQuestion2,
        result.draft.recruitmentSetup.requiredInterviewQuestion3,
        result.draft.recruitmentSetup.requiredInterviewQuestion4,
        result.draft.recruitmentSetup.requiredInterviewQuestion5,
      ].filter(Boolean);

      setForm((current) => ({
        ...current,
        ...result.draft?.role,
        aiGeneratedScreeningQuestions: questions,
        recruitmentSetupDraft: result.draft?.recruitmentSetup || current.recruitmentSetupDraft,
      }));
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Unable to generate the role draft.");
    } finally {
      setParsing(false);
    }
  }

  function fieldErrorProps(field: string) {
    return { "aria-invalid": Boolean(fieldErrors[field]) };
  }

  function formatFieldError(field: string, message: string) {
    const readableMessage = message
      .replace(/^String must/, "Must")
      .replace(/^Invalid input/, "Invalid value");
    const label = fieldLabels[field]
      || field.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase()).trim();
    return { label, message: readableMessage };
  }

  function validateForm() {
    const availability = availabilityPayload();
    const parsed = roleRequestSchema.safeParse({
      ...form,
      ...availability,
      requesterName: user.name,
      requesterEmail: user.email,
      replacementEmployee: form.requestType === "Staff Replacement" ? form.replacementEmployee : "",
    });

    if (parsed.success) {
      setFieldErrors({});
      return true;
    }

    const nextErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] || "form");
      if (!nextErrors[field]) nextErrors[field] = issue.message;
    }
    setFieldErrors(nextErrors);
    setError("Please correct the highlighted fields before submitting.");
    scrollToErrorSummary();
    return false;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError("");
    setSuccess(null);

    try {
      const response = await fetch(isEditing ? `/api/roles/${encodeURIComponent(roleId || "")}` : "/api/roles", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          ...form,
          ...availabilityPayload(),
          requesterName: user.name,
          requesterEmail: user.email,
          replacementEmployee: form.requestType === "Staff Replacement" ? form.replacementEmployee : "",
        }),
      });
      const result = (await response.json()) as RoleSubmissionResult;

      if (!response.ok || result.success !== true) {
        throw new Error(result.error || "Unable to submit role request.");
      }

      const savedRoleId = result.roleId || roleId || "";
      setSuccess({
        roleId: savedRoleId || "Not provided",
        status: result.status || "Pending HR Discussion",
      });
      if (isEditing) {
        router.push(`/roles/${encodeURIComponent(savedRoleId)}?updated=1`);
        router.refresh();
      } else {
        // The new role is written by n8n outside the Next.js process. A full
        // navigation avoids reusing a prefetched/stale client tree and prevents
        // the first redirect from briefly showing "Role request not found".
        window.location.assign(`/roles/${encodeURIComponent(savedRoleId)}`);
      }
      if (!isEditing) setForm(initial);
    } catch (submissionError) {
      console.error("[Role Request Form] Submission failed:", submissionError);
      setError(submissionError instanceof Error ? submissionError.message : "Submission failed.");
      scrollToErrorSummary();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="form-layout">
      <div className="form-card">
        {success && (
          <div className="section">
            <ActionFeedback kind="success">
              <strong>Role request submitted.</strong><br />
              Role ID: {success.roleId}<br />
              Status: {success.status}
            </ActionFeedback>
          </div>
        )}

        {error && <div className="section"><ValidationSummary error={error} issues={Object.entries(fieldErrors).map(([field, message]) => { const formatted = formatFieldError(field, message); return { field, label: formatted.label, message: formatted.message, href: `#${field}` }; })} summaryRef={errorSummaryRef} /></div>}

        <section className="section">
          <div className="section-title">
            <span className="section-number">1</span>
          <h2>{isEditing ? "Edit role request" : "Role request"}</h2>
          </div>
          <p className="section-intro">Provide the information HR and Ella need to understand the vacancy. <strong className="required-mark">*</strong> Required fields.</p>

          <div className="grid-2">
            <div className="field full">
              <label htmlFor="jobDescription">Job Description <strong className="required-mark">*</strong></label>
              <textarea id="jobDescription" {...fieldErrorProps("jobDescription")} required value={form.jobDescription} onChange={(event) => update("jobDescription", event.target.value)} placeholder="Describe the purpose and main scope of this role." />
              <div className="ai-draft-panel">
                <div>
                  <strong>Populate from a job description</strong>
                  <small className="field-help">Upload a PDF, DOC, or DOCX and Ella will prepare the role details, screening criteria, and interview questions for your review.</small>
                </div>
                <div className="ai-draft-controls">
                  {/* Keep the picker aligned with the server document extractor. */}
                  <input id="jobDescriptionFile" type="file" accept="application/pdf,.pdf,application/msword,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx" onChange={(event) => { setJobDescriptionFile(event.target.files?.[0] || null); setParseError(""); }} />
                  <button type="button" className="btn btn-secondary" onClick={populateFromJobDescription} disabled={parsing}>
                    {parsing ? "Generating draft…" : "Generate draft"}
                  </button>
                </div>
                {jobDescriptionFile && <small className="field-help">Selected: {jobDescriptionFile.name}</small>}
                {parseError && <div className="error-box message-box" role="alert"><span className="message-box-icon" aria-hidden="true"><UiIcon name="alert" size={17} /></span><span>{parseError}</span></div>}
              </div>
            </div>

            <div className="field">
              <label htmlFor="requestType">Request Type <strong className="required-mark">*</strong></label>
              <select id="requestType" {...fieldErrorProps("requestType")} value={form.requestType} onChange={(event) => update("requestType", event.target.value)}>
                <option>Staff Addition</option>
                <option>Staff Replacement</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="department">Department <strong className="required-mark">*</strong></label>
              <input id="department" {...fieldErrorProps("department")} required value={form.department} onChange={(event) => update("department", event.target.value)} placeholder="e.g. Inside Sales" />
            </div>

            <div className="field">
              <label htmlFor="employmentType">Employment Type <strong className="required-mark">*</strong></label>
              <select id="employmentType" {...fieldErrorProps("employmentType")} value={form.employmentType} onChange={(event) => update("employmentType", event.target.value)}>
                <option>Full-Time</option>
                <option>Part-Time</option>
                <option>Contract</option>
                <option>Temporary</option>
                <option>Internship</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="jobTitle">Job Title <strong className="required-mark">*</strong></label>
              <input id="jobTitle" {...fieldErrorProps("jobTitle")} required value={form.jobTitle} onChange={(event) => update("jobTitle", event.target.value)} placeholder="e.g. Inside Sales Specialist" />
            </div>

            <div className="field">
              <label htmlFor="numberOfVacancies">Number of Vacancies <strong className="required-mark">*</strong></label>
              <input id="numberOfVacancies" {...fieldErrorProps("numberOfVacancies")} required min="1" max="100" type="number" value={form.numberOfVacancies} onChange={(event) => update("numberOfVacancies", Number(event.target.value))} />
            </div>

            <div className="field">
              <label htmlFor="targetHiringDate">Target Hiring Date <strong className="required-mark">*</strong></label>
              <input id="targetHiringDate" {...fieldErrorProps("targetHiringDate")} required type="date" value={form.targetHiringDate} onChange={(event) => update("targetHiringDate", event.target.value)} />
            </div>

            {form.requestType === "Staff Replacement" && (
              <div className="field full">
                <label htmlFor="replacementEmployee">Employee or Position Being Replaced <strong className="required-mark">*</strong></label>
                <input id="replacementEmployee" {...fieldErrorProps("replacementEmployee")} required value={form.replacementEmployee} onChange={(event) => update("replacementEmployee", event.target.value)} placeholder="Name or position" />
              </div>
            )}

            <div className="field full">
              <label htmlFor="reasonForRequest">Reason for Request <strong className="required-mark">*</strong></label>
              <textarea id="reasonForRequest" {...fieldErrorProps("reasonForRequest")} required value={form.reasonForRequest} onChange={(event) => update("reasonForRequest", event.target.value)} placeholder="Why is this additional or replacement staff member needed?" />
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-title">
            <span className="section-number">2</span>
            <h2>HR interview and screening</h2>
          </div>
          <p className="section-intro">Review the HR interviewer and add up to two optional questions. Ella will generate the remaining screening questions when you click <strong>Generate draft</strong> before submitting.</p>

          <div className="grid-2">
            <div className="field full">
              <label htmlFor="hodEmail">HR / Interviewer Email</label>
              <input id="hodEmail" type="email" value={HR_INTERVIEW_EMAIL} readOnly aria-readonly="true" />
              <small className="field-help">Final-interview availability is read automatically from this HR account&apos;s connected Google Calendar.</small>
            </div>
            <div className="field full">
              <label htmlFor="customScreeningQuestion1">HR Screening Question 1 <span className="field-optional">(optional)</span></label>
              <textarea id="customScreeningQuestion1" value={form.customScreeningQuestion1} onChange={(event) => update("customScreeningQuestion1", event.target.value)} placeholder="Ask something specific to this role" />
            </div>
            <div className="field full">
              <label htmlFor="customScreeningQuestion2">HR Screening Question 2 <span className="field-optional">(optional)</span></label>
              <textarea id="customScreeningQuestion2" value={form.customScreeningQuestion2} onChange={(event) => update("customScreeningQuestion2", event.target.value)} placeholder="Ask another role-specific question" />
            </div>
            {form.aiGeneratedScreeningQuestions.length > 0 && (
              <div className="field full">
                <div className="ai-question-review">
                  <strong>AI-generated screening questions for HR review</strong>
                  <small className="field-help">These were generated from the uploaded job description. HR can refine them later in Recruitment Setup.</small>
                  <ol>
                    {form.aiGeneratedScreeningQuestions.map((question, index) => <li key={`${question}-${index}`}>{question}</li>)}
                  </ol>
                </div>
              </div>
            )}
          </div>
        </section>

        {(!isEditing || hasChanges) && (
          <div className="form-actions">
            <a className="btn btn-secondary" href="/roles">Cancel</a>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? (isEditing ? "Saving…" : "Submitting…") : (isEditing ? "Save role request" : "Submit for HR discussion")}
            </button>
          </div>
        )}
      </div>

      <aside className="sidebar-card">
        <h3>What happens next</h3>
        <div className="sidebar-list">
          <div><strong>1. HR discussion</strong><br />HR reviews the submitted role request.</div>
          <div><strong>2. Management approval</strong><br />The request is approved, returned, or rejected.</div>
          <div><strong>3. Recruitment setup</strong><br />HR confirms Ella's generated screening setup.</div>
          <div><strong>4. Job posting</strong><br />Approved roles can be published to the selected channels.</div>
        </div>
      </aside>
    </form>
  );
}
