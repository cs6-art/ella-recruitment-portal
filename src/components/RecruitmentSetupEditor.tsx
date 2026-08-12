"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { notificationPresentation } from "@/lib/notification-status";
import {
  renderRecruitmentSystemPrompt,
  renderRecruitmentSystemPromptSample,
  STANDARD_VAPI_SYSTEM_PROMPT_TEMPLATE,
} from "@/lib/recruitment-prompt";
import {
  BASELINE_EVALUATION_FIELDS,
  EVALUATION_FIELD_CATALOG,
  recruitmentSetupSchema,
} from "@/lib/recruitment-setup-schema";
import {
  getSetupReadiness,
  type SetupReadinessInput,
  type SetupReadinessLevel,
} from "@/lib/recruitment-setup-readiness";

type Setup = {
  roleTitle?: string;
  jobDescription: string;
  screeningCriteria: string;
  requiredInterviewQuestion1?: string;
  requiredInterviewQuestion2?: string;
  requiredInterviewQuestion3?: string;
  requiredInterviewQuestion4?: string;
  requiredInterviewQuestion5?: string;
  aiSystemPrompt: string;
  resolvedAiSystemPrompt?: string;
  initialInterviewBookingLink: string;
  hodInterviewBookingLink: string;
  postingChannels: string[] | string;
  evaluationFieldToggles?: string[] | string;
  customEvaluationFields?: { key: string; label: string; description: string }[];
  licenseOrCertificateRequired: string;
  keywordsToLookFor: string;
  minimumYearsOfExperience?: number | string;
  transferableSkillsAccepted: string;
  salaryOrBudgetRange: string;
  earliestAvailabilityRule: string;
  experienceRequired?: string;
  salaryMin?: string;
  salaryMax?: string;
  noticePeriodRequirement?: string;
  salaryDisclosureStatus?: string;
  experienceRequirementStatus?: string;
  licenseRequirementStatus?: string;
  hodInterviewRequired?: string;
  recruitmentSetupStatus?: string;
  applicationLink?: string;
};

type Props = {
  roleId: string;
  status: string;
  setup: Setup;
  editable: boolean;
  updatedAt?: string;
  updatedBy?: string;
  updatedByEmail?: string;
  onSaved: () => void;
};

type SetupField = keyof Setup;

type RecruitmentTemplate = {
  id: string;
  name: string;
  sourceRoleId: string;
  setup: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdByName: string;
};

const questionKeys = [
  "requiredInterviewQuestion1",
  "requiredInterviewQuestion2",
  "requiredInterviewQuestion3",
  "requiredInterviewQuestion4",
  "requiredInterviewQuestion5",
] as const;

const channels = ["LinkedIn", "Facebook", "JobStreet"];

function normalizeChannels(value: string[] | string | undefined) {
  return Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean)
    : String(value || "").split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function formatDate(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) return value || "";
  return new Date(value).toLocaleString();
}

function valueText(value: unknown) {
  return String(value ?? "").trim();
}

function questionFallbacks(setup: Setup) {
  return questionKeys.map((key) => valueText(setup[key]));
}

function buildInitialValues(setup: Setup): Setup {
  const questions = questionFallbacks(setup);
  return {
    ...setup,
    requiredInterviewQuestion1: questions[0],
    requiredInterviewQuestion2: questions[1],
    requiredInterviewQuestion3: questions[2],
    requiredInterviewQuestion4: questions[3],
    requiredInterviewQuestion5: questions[4],
    postingChannels: normalizeChannels(setup.postingChannels),
    evaluationFieldToggles: normalizeChannels(setup.evaluationFieldToggles),
    customEvaluationFields: Array.isArray(setup.customEvaluationFields) ? setup.customEvaluationFields.slice(0, 3) : [],
    recruitmentSetupStatus: setup.recruitmentSetupStatus || "Draft",
  };
}

function getEvaluationFields(values: Setup) {
  const toggled = normalizeChannels(values.evaluationFieldToggles)
    .map((key) => EVALUATION_FIELD_CATALOG.find((field) => field.key === key))
    .filter((field): field is (typeof EVALUATION_FIELD_CATALOG)[number] => Boolean(field));
  const custom = (values.customEvaluationFields || []).filter((field) => field.key && field.label);
  return [...toggled, ...custom];
}

function promptRenderInput(values: Setup) {
  return {
    roleTitle: values.roleTitle,
    jobDescription: values.jobDescription,
    screeningCriteria: values.screeningCriteria,
    interviewQuestions: getQuestions(values).join("\n"),
    licenseOrCertificateRequired: values.licenseOrCertificateRequired,
    keywordsToLookFor: values.keywordsToLookFor,
    transferableSkillsAccepted: values.transferableSkillsAccepted,
    experienceRequired: valueText(values.minimumYearsOfExperience) || values.experienceRequired,
    salaryMin: values.salaryMin,
    salaryMax: values.salaryMax,
    salaryOrBudgetRange: values.salaryOrBudgetRange,
    noticePeriodRequirement: values.noticePeriodRequirement || values.earliestAvailabilityRule,
    earliestAvailabilityRule: values.earliestAvailabilityRule,
    evaluationFields: getEvaluationFields(values),
  };
}

function generatedPrompt(values: Setup, template = STANDARD_VAPI_SYSTEM_PROMPT_TEMPLATE) {
  return renderRecruitmentSystemPrompt(template, promptRenderInput(values));
}

/** HR-facing only — never used for the value that gets saved or sent to
 * Vapi. Fills the remaining {{candidate_name}} / {{email}} / {{match_score}}
 * / {{ai_summary}} tags with a sample candidate so HR sees plain, readable
 * text instead of template syntax. */
function generatedSamplePrompt(values: Setup, template = STANDARD_VAPI_SYSTEM_PROMPT_TEMPLATE) {
  return renderRecruitmentSystemPromptSample(template, promptRenderInput(values));
}

function defaultPrompt() {
  return STANDARD_VAPI_SYSTEM_PROMPT_TEMPLATE;
}

function getQuestions(values: Setup) {
  return questionKeys.map((key) => valueText(values[key])).filter(Boolean);
}

function promptPayload(values: Setup, template: string, action: string, actionRequestId: string) {
  return {
    ...values,
    aiSystemPrompt: template,
    resolvedAiSystemPrompt: generatedPrompt(values, template),
    postingChannels: normalizeChannels(values.postingChannels),
    setupAction: action,
    actionRequestId,
  };
}

function Field({
  id,
  label,
  value,
  onChange,
  disabled,
  hint,
  placeholder,
  multiline = false,
  required = false,
}: {
  id: string;
  label: string;
  value: string | number | undefined;
  onChange: (value: string) => void;
  disabled: boolean;
  hint?: string;
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
}) {
  return (
    <label className={`field${multiline ? " field-wide" : ""}`} htmlFor={id}>
      <span>{label}{required ? " *" : ""}</span>
      {multiline ? (
        <textarea id={id} value={value ?? ""} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input id={id} value={value ?? ""} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      )}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function ReadOnlyFact({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="vapi-fact">
      <span>{label}</span>
      <strong>{valueText(value) || "Not specified"}</strong>
    </div>
  );
}

export default function RecruitmentSetupEditor({ roleId, status, setup, editable, updatedAt, updatedBy, updatedByEmail, onSaved }: Props) {
  const setupKey = JSON.stringify(setup);
  const [values, setValues] = useState<Setup>(() => buildInitialValues(setup));
  const [advancedPrompt, setAdvancedPrompt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState<RecruitmentTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState("");
  const [templateActionId, setTemplateActionId] = useState("");
  const actionRequestId = useRef(globalThis.crypto.randomUUID());

  useEffect(() => {
    setValues(buildInitialValues(setup));
    setAdvancedPrompt(false);
  }, [setupKey]);

  useEffect(() => {
    let cancelled = false;
    async function loadTemplates() {
      setTemplateLoading(true);
      setTemplateError("");
      try {
        const response = await fetch("/api/recruitment-templates", { credentials: "same-origin", cache: "no-store" });
        const result = await response.json();
        if (!response.ok || result.success !== true) throw new Error(result.error || "Unable to load recruitment templates.");
        if (!cancelled) setTemplates(Array.isArray(result.templates) ? result.templates : []);
      } catch (caught) {
        if (!cancelled) setTemplateError(caught instanceof Error ? caught.message : "Unable to load recruitment templates.");
      } finally {
        if (!cancelled) setTemplateLoading(false);
      }
    }
    void loadTemplates();
    return () => { cancelled = true; };
  }, []);

  const currentPrompt = valueText(values.aiSystemPrompt) || STANDARD_VAPI_SYSTEM_PROMPT_TEMPLATE;
  const generated = useMemo(() => generatedPrompt(values, currentPrompt), [currentPrompt, values]);
  const generatedSample = useMemo(() => generatedSamplePrompt(values, currentPrompt), [currentPrompt, values]);
  const questions = getQuestions(values);
  const draftPayload = promptPayload(values, currentPrompt, "save_draft", actionRequestId.current);
  const draftReadiness = getSetupReadiness(draftPayload as SetupReadinessInput, "draft");
  const recruitmentReadiness = getSetupReadiness(draftPayload as SetupReadinessInput, "recruitment-ready");
  const publishingReadiness = getSetupReadiness(draftPayload as SetupReadinessInput, "ready-for-publishing");
  const setupStatus = values.recruitmentSetupStatus || setup.recruitmentSetupStatus || "Draft";

  const savedTemplates = templates.filter((template) => template.id);

  if (!(status === "Approved" || status === "Recruitment Setup")) return null;

  const update = (key: SetupField, value: string | string[]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setMessage("");
    setWarning("");
    setError("");
  };

  const applyStandardTemplate = () => {
    setValues((current) => ({ ...current, aiSystemPrompt: defaultPrompt() }));
    setAdvancedPrompt(true);
    setMessage("Standard script loaded. Edit the script or the fields above before saving.");
  };

  const openAdvancedPrompt = () => {
    setValues((current) => ({ ...current, aiSystemPrompt: valueText(current.aiSystemPrompt) || generated }));
    setAdvancedPrompt(true);
  };

  const resetToGeneratedPrompt = () => {
    update("aiSystemPrompt", STANDARD_VAPI_SYSTEM_PROMPT_TEMPLATE);
    setAdvancedPrompt(true);
    setMessage("The standard script was restored. Your answers above will still be filled in automatically.");
  };

  const toggleChannel = (channel: string) => {
    const selected = normalizeChannels(values.postingChannels);
    update("postingChannels", selected.includes(channel) ? selected.filter((item) => item !== channel) : [...selected, channel]);
  };

  const toggleEvaluationField = (key: string) => {
    const selected = normalizeChannels(values.evaluationFieldToggles);
    update("evaluationFieldToggles", selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key]);
  };

  const customFieldKey = (label: string) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

  const updateCustomField = (index: number, patch: Partial<{ key: string; label: string; description: string }>) => {
    setValues((current) => {
      const fields = [...(current.customEvaluationFields || [])];
      fields[index] = { ...fields[index], ...patch };
      return { ...current, customEvaluationFields: fields };
    });
    setMessage("");
    setWarning("");
    setError("");
  };

  const addCustomField = () => {
    setValues((current) => ((current.customEvaluationFields || []).length >= 3 ? current
      : { ...current, customEvaluationFields: [...(current.customEvaluationFields || []), { key: "", label: "", description: "" }] }));
  };

  const removeCustomField = (index: number) => {
    setValues((current) => ({ ...current, customEvaluationFields: (current.customEvaluationFields || []).filter((_, itemIndex) => itemIndex !== index) }));
  };

  const applyTemplate = (template: RecruitmentTemplate) => {
    setValues(buildInitialValues({
      ...template.setup,
      postingChannels: normalizeChannels(template.setup.postingChannels as string[] | string | undefined),
    } as Setup));
    setSelectedTemplateId(template.id);
    setAdvancedPrompt(true);
    setMessage(`Loaded template "${template.name}" into the editor. Save the role only when you are ready.`);
    setWarning("");
    setError("");
  };

  async function saveTemplate() {
    const name = templateName.trim();
    if (!name) {
      setTemplateError("Enter a template name before saving.");
      return;
    }

    setTemplateActionId("saving");
    setTemplateError("");
    try {
      const payload = {
        id: "",
        name,
        sourceRoleId: roleId,
        setup: {
          ...values,
          aiSystemPrompt: currentPrompt,
          postingChannels: normalizeChannels(values.postingChannels),
        },
      };
      const response = await fetch("/api/recruitment-templates", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error(result.error || "Unable to save recruitment template.");
      const nextTemplate = result.template as RecruitmentTemplate;
      setTemplates((current) => [...current.filter((template) => template.id !== nextTemplate.id), nextTemplate]);
      setSelectedTemplateId(nextTemplate.id);
      setTemplateName("");
      setMessage(`Template "${name}" saved.`);
    } catch (caught) {
      setTemplateError(caught instanceof Error ? caught.message : "Unable to save recruitment template.");
    } finally {
      setTemplateActionId("");
    }
  }

  async function deleteTemplate(template: RecruitmentTemplate) {
    if (!window.confirm(`Delete template "${template.name}"?`)) return;
    setTemplateActionId(template.id);
    setTemplateError("");
    try {
      const response = await fetch(`/api/recruitment-templates?id=${encodeURIComponent(template.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error(result.error || "Unable to delete recruitment template.");
      setTemplates((current) => current.filter((item) => item.id !== template.id));
      if (selectedTemplateId === template.id) setSelectedTemplateId("");
      setMessage(`Template "${template.name}" deleted.`);
    } catch (caught) {
      setTemplateError(caught instanceof Error ? caught.message : "Unable to delete recruitment template.");
    } finally {
      setTemplateActionId("");
    }
  }

  async function save(action: string) {
    setSaving(true);
    setMessage("");
    setWarning("");
    setError("");

    const payload = promptPayload(values, currentPrompt, action, actionRequestId.current);
    const parsed = recruitmentSetupSchema.safeParse(payload);
    if (!parsed.success) {
      setError(`Please complete the required setup fields: ${parsed.error.issues.map((issue) => issue.message).join(" ")}`);
      setSaving(false);
      return;
    }

    const level: SetupReadinessLevel = action === "mark_recruitment_ready"
      ? "recruitment-ready"
      : action === "mark_ready_for_publishing" || action === "publish_role"
        ? "ready-for-publishing"
        : "draft";
    const readiness = getSetupReadiness(parsed.data as SetupReadinessInput, level);
    if (!readiness.valid) {
      setError(`Complete these items before continuing: ${readiness.missingFields.map((field) => field.label).join(", ")}.`);
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(`/api/roles/${encodeURIComponent(roleId)}/recruitment-setup`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error(result.message || result.error || "Unable to save recruitment setup.");
      const notification = notificationPresentation(result.notificationStatus || "not_configured", result.notificationError);
      setMessage(result.message || "VAPI setup saved successfully.");
      setWarning(notification.warning || "");
      actionRequestId.current = globalThis.crypto.randomUUID();
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save recruitment setup.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="recruitment-setup" className="card role-section recruitment-editor vapi-setup-editor">
      <div className="card-header">
        <div>
          <span className="eyebrow-dark">RECRUITMENT SETUP</span>
          <h2>Interview Setup</h2>
          <p className="section-subtitle">Fill in what Ella should look for when she screens candidates for this role.</p>
          {updatedAt && <small>Last saved {formatDate(updatedAt)}{updatedBy ? ` by ${updatedBy}` : ""}</small>}
        </div>
        <span className="setup-readonly">{editable ? "Editable by HR reviewers" : "Read-only"}</span>
      </div>

      {error && <div className="error-box vapi-message" role="alert">{error}</div>}
      {message && <div className="success-box vapi-message" role="status">{message}</div>}
      {warning && <div className="warning-box vapi-message" role="status">{warning}</div>}

      <div className="vapi-template-bar">
        <div>
          <span className="vapi-kicker">INTERVIEW SCRIPT</span>
          <strong>Ella's standard interview script</strong>
           <small>The fields below plug directly into Ella's script for this role — no prompt-writing needed.</small>
        </div>
        <div className="vapi-template-actions">
          <button type="button" className="btn btn-secondary" disabled={!editable || saving} onClick={applyStandardTemplate}>Load standard script</button>
          <label className="field vapi-template-name">
            <span>Template name</span>
            <input value={templateName} disabled={!editable || saving || templateActionId === "saving"} placeholder="Save current setup as a template" onChange={(event) => setTemplateName(event.target.value)} />
          </label>
          <button type="button" className="btn btn-secondary" disabled={!editable || saving || templateActionId === "saving"} onClick={() => void saveTemplate()}>Save as template</button>
        </div>
      </div>

      <div className="vapi-template-library">
        <div className="vapi-section-heading">
          <div>
            <span className="vapi-kicker">SAVED TEMPLATES</span>
            <h3>Load a saved setup</h3>
            <p>Selecting a saved template copies it into the editor without saving anything back to the sheet.</p>
          </div>
          <span className="vapi-readonly-badge">{templateLoading ? "Loading..." : `${savedTemplates.length} saved`}</span>
        </div>
        {templateError && <div className="error-box vapi-message" role="alert">{templateError}</div>}
        <div className="vapi-template-picker">
          <label className="field">
            <span>Saved template</span>
            <select
              aria-label="Saved recruitment templates"
              value={selectedTemplateId}
              disabled={!editable || saving || templateLoading || savedTemplates.length === 0}
              onChange={(event) => {
                const selected = templates.find((template) => template.id === event.target.value);
                setSelectedTemplateId(event.target.value);
                if (selected) applyTemplate(selected);
              }}
            >
              <option value="">{savedTemplates.length > 0 ? "Choose a saved template" : "No saved templates available"}</option>
              {savedTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </label>
        </div>
        {savedTemplates.length > 0 && (
          <div className="vapi-template-list">
            {savedTemplates.map((template) => (
              <div className="vapi-template-item" key={template.id}>
                <div>
                  <strong>{template.name}</strong>
                  <small>{template.sourceRoleId ? `Source role ${template.sourceRoleId}` : "No source role recorded"}</small>
                </div>
                <div className="vapi-template-item-actions">
                  <button type="button" className="btn btn-secondary" disabled={!editable || saving || templateActionId === template.id} onClick={() => applyTemplate(template)}>Load</button>
                  <button type="button" className="btn btn-secondary" disabled={!editable || saving || templateActionId === template.id} onClick={() => void deleteTemplate(template)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="vapi-role-context">
        <div className="vapi-section-heading">
          <div><span className="vapi-kicker">INITIAL ROLE CONTEXT</span><h3>Starting values from the role request</h3></div>
          <span className="vapi-readonly-badge">Read-only</span>
        </div>
        <div className="vapi-fact-grid">
          <ReadOnlyFact label="Role" value={values.roleTitle} />
           <ReadOnlyFact label="Experience" value={valueText(values.minimumYearsOfExperience) || values.experienceRequired} />
          <ReadOnlyFact label="Salary / budget" value={values.salaryOrBudgetRange || [values.salaryMin, values.salaryMax].filter(Boolean).join(" - ")} />
          <ReadOnlyFact label="Availability" value={values.noticePeriodRequirement || values.earliestAvailabilityRule} />
          <ReadOnlyFact label="Skills" value={values.keywordsToLookFor} />
          <ReadOnlyFact label="Job description" value={values.jobDescription ? "Included" : "Not provided"} />
        </div>
      </div>

      <div className="vapi-builder">
        <div className="vapi-section-heading">
          <div><span className="vapi-kicker">HR EDITS THESE SECTIONS</span><h3>Screening instructions</h3><p>Add only the guidance that is specific to this role.</p></div>
        </div>
        <div className="form-grid vapi-form-grid">
          <Field id="vapi-screeningCriteria" label="What should Ella listen for?" value={values.screeningCriteria} onChange={(value) => update("screeningCriteria", value)} disabled={!editable || saving} multiline required placeholder="What evidence should HR and Ella look for in each candidate?" hint="Ella will use this as extra guidance during the call, alongside the fields below." />
          <Field id="vapi-license" label="License or certificate" value={values.licenseOrCertificateRequired} onChange={(value) => update("licenseOrCertificateRequired", value)} disabled={!editable || saving} placeholder="Example: CPA preferred" />
          <Field id="vapi-keywords" label="Keywords to look for" value={values.keywordsToLookFor} onChange={(value) => update("keywordsToLookFor", value)} disabled={!editable || saving} placeholder="Separate keywords with commas" />
           <Field id="vapi-transferable-skills" label="Transferable skills accepted" value={values.transferableSkillsAccepted} onChange={(value) => update("transferableSkillsAccepted", value)} disabled={!editable || saving} multiline placeholder="Describe adjacent experience that may be accepted." />
           <Field id="vapi-experience" label="Minimum relevant experience" value={values.minimumYearsOfExperience} onChange={(value) => update("minimumYearsOfExperience", value)} disabled={!editable || saving} placeholder="Example: None, 3 years, or 5+ years" hint="Use None when no experience threshold applies." />
           <Field id="vapi-salary" label="Approved salary or budget range" value={values.salaryOrBudgetRange} onChange={(value) => update("salaryOrBudgetRange", value)} disabled={!editable || saving} placeholder="Example: PHP 45,000 to PHP 60,000 per month" />
           <Field id="vapi-availability" label="Earliest availability instructions" value={values.earliestAvailabilityRule} onChange={(value) => update("earliestAvailabilityRule", value)} disabled={!editable || saving} placeholder="Example: Ask whether the candidate can start within 30 days." />
        </div>
      </div>

      <div className="vapi-builder">
        <div className="vapi-section-heading">
          <div><span className="vapi-kicker">EVALUATION FIELDS</span><h3>What should Ella score or note for this role?</h3><p>Score, recommendation, strengths, and concerns are always included. Add anything extra this role needs — the same list is used for both resume screening and the voice interview.</p></div>
        </div>
        <div className="vapi-baseline-fields">
          <span className="vapi-kicker">Always included</span>
          <div className="vapi-baseline-chip-row">
            {BASELINE_EVALUATION_FIELDS.map((field) => <span className="vapi-chip" key={field.key}>{field.label}</span>)}
          </div>
        </div>
        <fieldset className="vapi-channel-fieldset">
          <legend>Optional fields</legend>
          <div className="vapi-channel-options">
            {EVALUATION_FIELD_CATALOG.map((field) => (
              <label key={field.key} className="vapi-channel-option" title={field.description}>
                <input type="checkbox" checked={normalizeChannels(values.evaluationFieldToggles).includes(field.key)} disabled={!editable || saving} onChange={() => toggleEvaluationField(field.key)} />
                <span>{field.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="vapi-custom-fields">
          <div className="vapi-section-heading">
            <div><span className="vapi-kicker">CUSTOM FIELDS</span><h4>Add up to 3 fields specific to this role</h4></div>
            <span className="vapi-count-badge">{(values.customEvaluationFields || []).length} of 3</span>
          </div>
          {(values.customEvaluationFields || []).map((customField, index) => (
            <div className="vapi-custom-field-row" key={index}>
              <Field id={`vapi-custom-label-${index}`} label="Field name" value={customField.label} onChange={(value) => updateCustomField(index, { label: value, key: customFieldKey(value) })} disabled={!editable || saving} placeholder="Example: Technical depth" />
              <Field id={`vapi-custom-desc-${index}`} label="What should Ella assess?" value={customField.description} onChange={(value) => updateCustomField(index, { description: value })} disabled={!editable || saving} placeholder="One plain-English sentence, e.g. Assess how deeply the candidate understands the required technical stack." />
              <button type="button" className="btn btn-secondary" disabled={!editable || saving} onClick={() => removeCustomField(index)}>Remove</button>
            </div>
          ))}
          {(values.customEvaluationFields || []).length < 3 && (
            <button type="button" className="btn btn-secondary" disabled={!editable || saving} onClick={addCustomField}>Add custom field</button>
          )}
        </div>
      </div>

      <div className="vapi-builder">
        <div className="vapi-section-heading">
          <div><span className="vapi-kicker">INTERVIEW QUESTIONS</span><h3>What should Ella ask?</h3><p>Write 3 to 5 questions in the order you want them asked. Ella asks them exactly as written, one at a time, and doesn&apos;t make up her own. These questions appear directly in the script preview below.</p></div>
          <span className={`vapi-count-badge ${questions.length >= 3 ? "complete" : ""}`}>{questions.length} of {questionKeys.length} configured · 3 required</span>
        </div>
        <div className="vapi-question-grid">
          {questionKeys.map((key, index) => (
            <label className="vapi-question" htmlFor={`vapi-question-${index + 1}`} key={key}>
              <span><strong>{index + 1}</strong>{`Question ${index + 1}`}{index < 3 ? " *" : " (optional)"}</span>
              <textarea id={`vapi-question-${index + 1}`} value={values[key] ?? ""} disabled={!editable || saving} placeholder="Write the exact question Ella should ask." onChange={(event) => update(key, event.target.value)} />
            </label>
          ))}
        </div>
      </div>

      <div className="vapi-preview">
        <div className="vapi-section-heading">
          <div><span className="vapi-kicker">{advancedPrompt ? "ADVANCED" : "SCRIPT PREVIEW"}</span><h3>{advancedPrompt ? "Edit the full interview script" : "See what Ella will say"}</h3><p>{advancedPrompt ? "For advanced use only. Keep the marker that says system_prompt exactly where it is — that's where your field answers above get inserted automatically." : "This includes your questions above and everything else Ella will say on the call, after your answers are filled in."}</p></div>
          <div className="vapi-preview-actions">
            {advancedPrompt && <button type="button" className="btn btn-secondary" disabled={!editable || saving} onClick={() => setAdvancedPrompt(false)}>Back to simple view</button>}
            {!advancedPrompt && <button type="button" className="btn btn-secondary" disabled={!editable || saving} onClick={openAdvancedPrompt}>Advanced: edit full script</button>}
            {advancedPrompt && <button type="button" className="btn btn-secondary" disabled={!editable || saving} onClick={resetToGeneratedPrompt}>Reset to standard script</button>}
          </div>
        </div>
        {advancedPrompt ? (
           <textarea className="vapi-full-prompt" aria-label="Full interview script" value={currentPrompt} disabled={!editable || saving} onChange={(event) => update("aiSystemPrompt", event.target.value)} />
        ) : (
          <details className="vapi-prompt-preview">
            <summary>See a sample call with an example candidate</summary>
            <small>This shows what Ella would say on a real call, using a made-up candidate (&quot;Jamie Cruz&quot;) so you can read it as plain text.</small>
            <pre>{generatedSample}</pre>
          </details>
        )}
      </div>

      <details className="vapi-publishing">
        <summary><span><strong>Publishing checklist</strong><small>Choose where and how this approved role will be published.</small></span><span className="vapi-status-badge">{setupStatus}</span></summary>
        <div className="vapi-publishing-content">
          <fieldset className="vapi-channel-fieldset">
            <legend>Posting channels</legend>
            <div className="vapi-channel-options">
              {channels.map((channel) => (
                <label key={channel} className="vapi-channel-option">
                  <input type="checkbox" checked={normalizeChannels(values.postingChannels).includes(channel)} disabled={!editable || saving} onChange={() => toggleChannel(channel)} />
                  <span>{channel}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="vapi-policy-grid">
            <label>Salary visibility<select value={values.salaryDisclosureStatus || ""} disabled={!editable || saving} onChange={(event) => update("salaryDisclosureStatus", event.target.value)}><option value="">Choose one</option><option>Disclosed</option><option>Not disclosed</option></select></label>
            <label>License requirement<select value={values.licenseRequirementStatus || ""} disabled={!editable || saving} onChange={(event) => update("licenseRequirementStatus", event.target.value)}><option value="">Choose one</option><option>Required</option><option>Preferred</option><option>Not required</option></select></label>
            <label>HOD interview<select value={values.hodInterviewRequired || ""} disabled={!editable || saving} onChange={(event) => update("hodInterviewRequired", event.target.value)}><option value="">Choose one</option><option>Required</option><option>Not required</option></select></label>
          </div>
        </div>
      </details>

      <div className="setup-readiness" aria-label="Setup readiness">
        {[{ title: "Draft", readiness: draftReadiness }, { title: "Recruitment ready", readiness: recruitmentReadiness }, { title: "Ready for publishing", readiness: publishingReadiness }].map(({ title, readiness }) => (
          <div className={`setup-readiness-card${readiness.valid ? "" : " has-missing"}`} key={title}>
            <strong>{title}</strong>
            <small>{readiness.valid ? "All required items complete" : `${readiness.missingFields.length} item${readiness.missingFields.length === 1 ? "" : "s"} missing`}</small>
            {!readiness.valid && <ul>{readiness.missingFields.slice(0, 4).map((field) => <li key={field.key}>{field.label}</li>)}</ul>}
          </div>
        ))}
      </div>

      <div className="setup-action-bar">
        <div className="vapi-save-note"><strong>{editable ? "Review the prompt before saving." : "Read-only setup"}</strong><small>{updatedByEmail ? `Last updated by ${updatedByEmail}` : "The standard template remains available for this role."}</small></div>
        <div className="vapi-save-actions">
          {editable && <>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => void save("save_draft")}>{saving ? "Saving..." : "Save Draft"}</button>
            <button type="button" className="btn btn-secondary" disabled={saving || !recruitmentReadiness.valid} onClick={() => void save("mark_recruitment_ready")}>Mark as Recruitment Ready</button>
            <button type="button" className="btn btn-secondary" disabled={saving || !publishingReadiness.valid} onClick={() => void save("mark_ready_for_publishing")}>Mark as Ready for Publishing</button>
            <button type="button" className="btn btn-primary" disabled={saving || !publishingReadiness.valid || setupStatus !== "Ready for Publishing"} onClick={() => void save("publish_role")}>{saving ? "Saving..." : "Publish Role"}</button>
          </>}
        </div>
      </div>
    </section>
  );
}
