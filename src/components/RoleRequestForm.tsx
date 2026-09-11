"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

import ActionFeedback from "@/components/ActionFeedback";
import UiIcon from "@/components/UiIcon";
import ValidationSummary from "@/components/ValidationSummary";
import { DEPARTMENT_OPTIONS, isKnownDepartment } from "@/lib/department-options";
import { toDateInputValue } from "@/lib/date-only";
import { roleRequestSchema } from "@/lib/role-schema";
import type { RoleAiDraft } from "@/lib/role-ai-draft-schema";
import { ROLE_COUNTRY_PROFILES, ROLE_COUNTRY_CODES } from "@/lib/role-countries";

type RoleRequestFormProps = {
  user: {
    name: string;
    email: string;
  };
  roleId?: string;
  status?: string;
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
  roleCountry: string;
  department: string;
  customDepartment: string;
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

// All HR interviews are owned by the shared HR calendar account.
const HR_INTERVIEW_EMAIL = "hrsg@mclinkgroup.com";

const initial: FormState = {
  requestType: "Staff Addition",
  roleCountry: "PH",
  department: "",
  customDepartment: "",
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
  roleCountry: "Role Country",
  department: "Department",
  jobTitle: "Job Title",
  numberOfVacancies: "Number of Vacancies",
  reasonForRequest: "Reason for Request",
  jobDescription: "Job Description",
  replacementEmployee: "Employee or Position Being Replaced",
  targetHiringDate: "Target Hiring Date",
  salaryOrBudgetRange: "Approved salary or budget range",
  hodEmail: "HR interviewer email",
  customScreeningQuestion1: "Custom Screening Question 1",
  customScreeningQuestion2: "Custom Screening Question 2",
};

function departmentForSubmission(state: Pick<FormState, "department" | "customDepartment">) {
  return (state.department === "Other" ? state.customDepartment : state.department).trim();
}

export default function RoleRequestForm({ user, roleId, status = "", initialValues }: RoleRequestFormProps) {
  const router = useRouter();
  const initialForm = useMemo<FormState>(() => {
    const savedDepartment = String(initialValues?.department || "").trim();
    const isSavedCustomDepartment = Boolean(savedDepartment) && !isKnownDepartment(savedDepartment);
    return {
      ...initial,
      ...initialValues,
      department: isSavedCustomDepartment ? "Other" : savedDepartment,
      customDepartment: isSavedCustomDepartment ? savedDepartment : "",
      targetHiringDate: toDateInputValue(initialValues?.targetHiringDate),
      hodEmail: HR_INTERVIEW_EMAIL,
    };
  }, [initialValues]);
  const [form, setForm] = useState<FormState>(() => initialForm);
  const effectiveRoleId = roleId || "";
  const isEditing = Boolean(effectiveRoleId);
  const isDraftRole = status === "Draft";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<{ roleId: string; status: string } | null>(null);
  const [jobDescriptionFile, setJobDescriptionFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const draftClientId = useRef(globalThis.crypto.randomUUID());
  const creationSubmissionId = useRef(globalThis.crypto.randomUUID());
  const submittingRef = useRef(false);
  const exitSaveSuppressedRef = useRef(false);
  const initialFormKey = useMemo(() => JSON.stringify(initialForm), [initialForm]);
  const [savedFormKey, setSavedFormKey] = useState(initialFormKey);
  const hasChanges = JSON.stringify(form) !== savedFormKey;
  const latestDraftRef = useRef({ form, hasChanges, loading, parsing, effectiveRoleId, requesterName: user.name, requesterEmail: user.email });

  useEffect(() => {
    latestDraftRef.current = { form, hasChanges, loading, parsing, effectiveRoleId, requesterName: user.name, requesterEmail: user.email };
  }, [effectiveRoleId, form, hasChanges, loading, parsing, user.email, user.name]);

  useEffect(() => {
    setSavedFormKey(initialFormKey);
  }, [initialFormKey]);

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

  function updateRecruitmentSetup(name: "salaryOrBudgetRange", value: string) {
    setForm((current) => ({
      ...current,
      recruitmentSetupDraft: { ...current.recruitmentSetupDraft, [name]: value },
    }));
    setError("");
    setFieldErrors((current) => ({ ...current, [name]: "" }));
  }

  function availabilityPayload() {
    return {
      hodEmail: HR_INTERVIEW_EMAIL,
      // Legacy sheet fields stay empty. HR interview times now come from
      // the connected HR Google Calendar rather than manually entered windows.
      hodAvailabilitySlots: [],
      hodAvailabilityDates: "",
      hodAvailabilityTimes: "",
    };
  }

  useEffect(() => {
    function saveDraftOnPageExit() {
      const current = latestDraftRef.current;
      if (!current.hasChanges || current.loading || current.parsing || submittingRef.current || exitSaveSuppressedRef.current) return;

      const endpoint = current.effectiveRoleId
        ? `/api/roles/${encodeURIComponent(current.effectiveRoleId)}`
        : "/api/roles";
      const body = JSON.stringify({
        ...current.form,
        department: departmentForSubmission(current.form),
        ...availabilityPayload(),
        requesterName: current.requesterName,
        requesterEmail: current.requesterEmail,
        replacementEmployee: current.form.requestType === "Staff Replacement" ? current.form.replacementEmployee : "",
        draft: true,
        draftId: draftClientId.current,
      });

      // `keepalive` lets the browser finish this small request while the
      // document is being unloaded. It also preserves PATCH for existing
      // roles; sendBeacon cannot choose that method.
      void fetch(endpoint, {
        method: current.effectiveRoleId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body,
        keepalive: true,
      }).catch(() => {
        // There is no page left on which to show an error. The next edit or
        // explicit save will retry through the normal error-reporting path.
      });
    }

    window.addEventListener("pagehide", saveDraftOnPageExit);
    return () => {
      window.removeEventListener("pagehide", saveDraftOnPageExit);
      // Next.js client navigation may unmount without firing pagehide.
      saveDraftOnPageExit();
    };
  }, []);

  async function populateFromJobDescription() {
    if (!jobDescriptionFile && form.jobDescription.trim().length < 20) {
      setParseError("Enter at least 20 characters in the job description or attach a PDF, DOC, or DOCX file.");
      return;
    }

    setParsing(true);
    setParseError("");
    try {
      const body = new FormData();
      if (jobDescriptionFile) body.append("jobDescriptionFile", jobDescriptionFile);
      else {
        body.append("jobDescriptionText", form.jobDescription.trim());
        body.append("jobTitle", form.jobTitle.trim());
        body.append("department", departmentForSubmission(form));
      }
      const response = await fetch("/api/roles/parse-description", {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      // A proxy or an interrupted upstream workflow can return an empty body.
      // Do not let Response.json() mask that as a browser-level exception.
      const raw = await response.text();
      let result: { success?: boolean; error?: string; draft?: RoleAiDraft } = {};
      if (raw.trim()) {
        try {
          result = JSON.parse(raw) as typeof result;
        } catch {
          throw new Error("The AI draft service returned an invalid response. Please try again.");
        }
      }
      if (!raw.trim()) {
        throw new Error(`The AI draft service returned an empty response (HTTP ${response.status}). Please try again.`);
      }
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
        // Keep values HR already entered when the AI draft cannot infer them.
        jobTitle: result.draft?.role.jobTitle || current.jobTitle,
        department: result.draft?.role.department || current.department,
        jobDescription: result.draft?.role.jobDescription || current.jobDescription,
        aiGeneratedScreeningQuestions: questions,
        recruitmentSetupDraft: result.draft?.recruitmentSetup
          ? {
            ...current.recruitmentSetupDraft,
            ...result.draft.recruitmentSetup,
            // Salary approval is an HR-entered value; an AI draft must not
            // erase it when the job description contains no compensation data.
            salaryOrBudgetRange: result.draft.recruitmentSetup.salaryOrBudgetRange || current.recruitmentSetupDraft.salaryOrBudgetRange,
          }
          : current.recruitmentSetupDraft,
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
      department: departmentForSubmission(form),
      ...availability,
      requesterName: user.name,
      requesterEmail: user.email,
      replacementEmployee: form.requestType === "Staff Replacement" ? form.replacementEmployee : "",
    });

    if (parsed.success) {
      if (!form.recruitmentSetupDraft.salaryOrBudgetRange.trim()) {
        setFieldErrors({ salaryOrBudgetRange: "Approved salary or budget range is required." });
        setError("Please correct the highlighted fields before submitting.");
        scrollToErrorSummary();
        return false;
      }
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

    submittingRef.current = true;
    setLoading(true);
    setError("");
    setSuccess(null);

    try {
      let response: Response;
      if (isDraftRole) {
        // Save the final form snapshot first, then use the audited status
        // transition so submitting a draft cannot create a duplicate role.
        response = await fetch(`/api/roles/${encodeURIComponent(effectiveRoleId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            ...form,
            department: departmentForSubmission(form),
            ...availabilityPayload(),
            requesterName: user.name,
            requesterEmail: user.email,
            replacementEmployee: form.requestType === "Staff Replacement" ? form.replacementEmployee : "",
            draft: true,
          }),
        });
        const savedDraft = await response.json() as RoleSubmissionResult;
        if (!response.ok || savedDraft.success !== true) throw new Error(savedDraft.error || "Unable to save this draft.");
        response = await fetch(`/api/roles/${encodeURIComponent(effectiveRoleId)}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ action: "submit_draft_for_hr", comments: "Draft completed and submitted for HR discussion.", actionRequestId: globalThis.crypto.randomUUID() }),
        });
      } else {
        response = await fetch(isEditing ? `/api/roles/${encodeURIComponent(effectiveRoleId)}` : "/api/roles", {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            ...form,
            department: departmentForSubmission(form),
            ...availabilityPayload(),
            ...(!isEditing ? { submissionId: creationSubmissionId.current } : {}),
            requesterName: user.name,
            requesterEmail: user.email,
            replacementEmployee: form.requestType === "Staff Replacement" ? form.replacementEmployee : "",
          }),
        });
      }
      const result = (await response.json()) as RoleSubmissionResult;

      if (!response.ok || result.success !== true) {
        throw new Error(result.error || "Unable to submit role request.");
      }

      const savedRoleId = result.roleId || effectiveRoleId || "";
      exitSaveSuppressedRef.current = true;
      setSavedFormKey(JSON.stringify(form));
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
      submittingRef.current = false;
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
        {isDraftRole && <div className="draft-autosave-status" role="status"><strong>Draft</strong> · Changes save when you leave this page or submit.</div>}

        <section className="section">
          <div className="section-title">
            <span className="section-number">1</span>
          <h2>{isEditing ? "Edit role request" : "Role request"}</h2>
          </div>
          <p className="section-intro">Provide the information HR and Ella need to understand the vacancy.</p>

          <div className="grid-2">
            <div className="field full">
              <div className="ai-draft-panel">
                <div>
                  <strong>Populate from a job description</strong>
                  <small className="field-help">Upload a PDF, DOC, or DOCX, or use the job description below. Ella will prepare role details, screening criteria, and interview questions for HR to review.</small>
                </div>
                <div className="ai-draft-controls">
                  {/* Keep the picker aligned with the server document extractor. */}
                  <input id="jobDescriptionFile" type="file" accept="application/pdf,.pdf,application/msword,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx" onChange={(event) => { setJobDescriptionFile(event.target.files?.[0] || null); setParseError(""); }} />
                  <button type="button" className="btn btn-secondary" onClick={populateFromJobDescription} disabled={parsing || (!jobDescriptionFile && form.jobDescription.trim().length < 20)}>
                    {parsing ? "Generating AI guidance…" : jobDescriptionFile ? "Generate draft" : "Generate AI questions"}
                  </button>
                </div>
                {jobDescriptionFile && <small className="field-help">Selected: {jobDescriptionFile.name}</small>}
                {parseError && <div className="error-box message-box" role="alert"><span className="message-box-icon" aria-hidden="true"><UiIcon name="alert" size={17} /></span><span>{parseError}</span></div>}
              </div>
              <label htmlFor="jobDescription">Job Description <strong className="required-mark">*</strong></label>
              <textarea id="jobDescription" {...fieldErrorProps("jobDescription")} required value={form.jobDescription} onChange={(event) => update("jobDescription", event.target.value)} placeholder="Describe the purpose and main scope of this role." />
            </div>

            <div className="field">
              <label htmlFor="requestType">Request Type <strong className="required-mark">*</strong></label>
              <select id="requestType" {...fieldErrorProps("requestType")} value={form.requestType} onChange={(event) => update("requestType", event.target.value)}>
                <option>Staff Addition</option>
                <option>Staff Replacement</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="roleCountry">Role Country <strong className="required-mark">*</strong></label>
              <select id="roleCountry" {...fieldErrorProps("roleCountry")} required value={form.roleCountry} onChange={(event) => update("roleCountry", event.target.value)}>
                <option value="">Select a country</option>
                {ROLE_COUNTRY_CODES.map((country) => {
                  const profile = ROLE_COUNTRY_PROFILES[country];
                  return <option key={country} value={country}>{country} — {profile.name} ({profile.currencyCode})</option>;
                })}
              </select>
              <small className="field-help">Applicants will see this country on the role and salary will use its currency automatically.</small>
            </div>

            <div className="field">
              <label htmlFor="department">Department <strong className="required-mark">*</strong></label>
              <select id="department" {...fieldErrorProps("department")} required value={!form.department ? "" : isKnownDepartment(form.department) ? form.department : "Other"} onChange={(event) => update("department", event.target.value)}>
                <option value="">Select a department</option>
                {DEPARTMENT_OPTIONS.map((department) => <option key={department} value={department}>{department}</option>)}
              </select>
            </div>

            {form.department === "Other" && (
              <div className="field">
                <label htmlFor="customDepartment">New department <strong className="required-mark">*</strong></label>
                <input id="customDepartment" {...fieldErrorProps("department")} required value={form.customDepartment} onChange={(event) => { update("customDepartment", event.target.value); setFieldErrors((current) => ({ ...current, department: "" })); }} placeholder="Enter the department name" />
              </div>
            )}

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

            <div className="field full">
              <label htmlFor="salaryOrBudgetRange">Approved salary or budget range <strong className="required-mark">*</strong></label>
              <input id="salaryOrBudgetRange" {...fieldErrorProps("salaryOrBudgetRange")} required value={form.recruitmentSetupDraft.salaryOrBudgetRange} onChange={(event) => updateRecruitmentSetup("salaryOrBudgetRange", event.target.value)} placeholder="e.g. PHP 45,000 to PHP 60,000 per month" />
              <small className="field-help">Provide the approved currency and pay period. This is used by CV analysis and Ella when evaluating applicants.</small>
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
            <h2>Face-to-Face interview and screening</h2>
          </div>
          <p className="section-intro">Review the HR interviewer and add up to two optional questions. AI-generated questions appear below for HR guidance and can be refined later in Recruitment Setup.</p>

          <div className="grid-2">
            <div className="field full">
              <label htmlFor="hodEmail">Shared HR Calendar Account</label>
              <input id="hodEmail" type="text" value="Configured in Settings" readOnly aria-readonly="true" />
              <small className="field-help">HR interview availability is read from the shared account configured in Settings and its connected HR Google Calendar. This role does not choose a personal calendar.</small>
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
                  <small className="field-help">These were generated from the role description. HR can review and refine them in Recruitment Setup before publishing.</small>
                  <ol>
                    {form.aiGeneratedScreeningQuestions.map((question, index) => <li key={`${question}-${index}`}>{question}</li>)}
                  </ol>
                </div>
              </div>
            )}
          </div>
        </section>

        {(!isEditing || hasChanges || isDraftRole) && (
          <div className="form-actions">
            <a className="btn btn-secondary" href="/roles">Cancel</a>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Submitting…" : (isDraftRole ? "Submit for HR discussion" : isEditing ? "Save role request" : "Submit for HR discussion")}
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
