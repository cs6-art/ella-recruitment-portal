"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { FormEvent } from "react";

import UiIcon from "@/components/UiIcon";
import {
  legacyAvailabilityDates,
  legacyAvailabilityTimes,
} from "@/lib/hod-availability";
import type { HodAvailabilitySlot } from "@/lib/hod-availability";
import { roleRequestSchema } from "@/lib/role-schema";

type RoleRequestFormProps = {
  user: {
    name: string;
    email: string;
  };
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
  numberOfVacancies: number;
  reasonForRequest: string;
  jobDescription: string;
  replacementEmployee: string;
  targetHiringDate: string;
  hodEmail: string;
  hodAvailabilitySlots: HodAvailabilitySlot[];
  customScreeningQuestion1: string;
  customScreeningQuestion2: string;
  aiGeneratedScreeningQuestions: string[];
};

const initial: FormState = {
  requestType: "Staff Addition",
  department: "",
  jobTitle: "",
  numberOfVacancies: 1,
  reasonForRequest: "",
  jobDescription: "",
  replacementEmployee: "",
  targetHiringDate: "",
  hodEmail: "",
  hodAvailabilitySlots: [{ date: "", startTime: "09:00", endTime: "09:30", timezone: "Asia/Singapore" }],
  customScreeningQuestion1: "",
  customScreeningQuestion2: "",
  aiGeneratedScreeningQuestions: [],
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
  hodAvailabilityDates: "HOD Availability Dates",
  hodAvailabilityTimes: "HOD Availability Times",
  hodAvailabilitySlots: "HOD availability",
  hodEmail: "HOD email",
  customScreeningQuestion1: "Custom Screening Question 1",
  customScreeningQuestion2: "Custom Screening Question 2",
};

export default function RoleRequestForm({ user }: RoleRequestFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<{ roleId: string; status: string } | null>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

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
  }

  function updateAvailability(index: number, name: keyof HodAvailabilitySlot, value: string) {
    setForm((current) => ({
      ...current,
      hodAvailabilitySlots: current.hodAvailabilitySlots.map((slot, slotIndex) => (
        slotIndex === index ? { ...slot, [name]: value } : slot
      )),
    }));
  }

  function addAvailability() {
    setForm((current) => ({
      ...current,
      hodAvailabilitySlots: [...current.hodAvailabilitySlots, { date: "", startTime: "09:00", endTime: "09:30", timezone: "Asia/Singapore" }],
    }));
  }

  function removeAvailability(index: number) {
    setForm((current) => ({
      ...current,
      hodAvailabilitySlots: current.hodAvailabilitySlots.length > 1
        ? current.hodAvailabilitySlots.filter((_, slotIndex) => slotIndex !== index)
        : [{ date: "", startTime: "09:00", endTime: "09:30", timezone: "Asia/Singapore" }],
    }));
  }

  function availabilityPayload() {
    const slots = form.hodAvailabilitySlots.filter((slot) => slot.date
      || slot.startTime !== "09:00"
      || slot.endTime !== "09:30"
      || slot.timezone !== "Asia/Singapore");
    return {
      hodEmail: form.hodEmail || user.email,
      hodAvailabilitySlots: slots,
      hodAvailabilityDates: legacyAvailabilityDates(slots),
      hodAvailabilityTimes: legacyAvailabilityTimes(slots),
    };
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
      const response = await fetch("/api/roles", {
        method: "POST",
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

      setSuccess({
        roleId: result.roleId || "Not provided",
        status: result.status || "Pending HR Discussion",
      });
      router.push(`/roles/${encodeURIComponent(result.roleId || "")}`);
      setForm(initial);
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
            <div className="success-box">
              <strong>Role request submitted.</strong><br />
              Role ID: {success.roleId}<br />
              Status: {success.status}
            </div>
          </div>
        )}

        {error && (
          <div className="section">
            <div ref={errorSummaryRef} className="error-box message-box" role="alert" tabIndex={-1} aria-label="Form errors">
              <span className="message-box-icon" aria-hidden="true"><UiIcon name="alert" size={17} /></span>
              <div className="message-box-body">
                <strong className="message-box-title">
                  {Object.entries(fieldErrors).length > 0
                    ? `${Object.entries(fieldErrors).length} ${Object.entries(fieldErrors).length === 1 ? "field needs" : "fields need"} your attention`
                    : error}
                </strong>
                {Object.entries(fieldErrors).length > 0 && (
                  <>
                    <p className="message-box-text">{error}</p>
                    <ul className="field-error-list">
                      {Object.entries(fieldErrors).map(([field, message]) => {
                        const formatted = formatFieldError(field, message);
                        return (
                          <li key={field}>
                            <a href={`#${field}`}>
                              <span className="field-error-link-label">{formatted.label}</span>
                              <span className="field-error-link-text">{formatted.message}</span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <section className="section">
          <div className="section-title">
            <span className="section-number">1</span>
            <h2>Role request</h2>
          </div>
          <p className="section-intro">Provide the information HR and Ella need to understand the vacancy.</p>

          <div className="grid-2">
            <div className="field full">
              <label htmlFor="jobDescription">Job Description</label>
              <textarea id="jobDescription" {...fieldErrorProps("jobDescription")} required value={form.jobDescription} onChange={(event) => update("jobDescription", event.target.value)} placeholder="Describe the purpose and main scope of this role." />
            </div>

            <div className="field">
              <label htmlFor="requestType">Request Type</label>
              <select id="requestType" {...fieldErrorProps("requestType")} value={form.requestType} onChange={(event) => update("requestType", event.target.value)}>
                <option>Staff Addition</option>
                <option>Staff Replacement</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="department">Department</label>
              <input id="department" {...fieldErrorProps("department")} required value={form.department} onChange={(event) => update("department", event.target.value)} placeholder="e.g. Inside Sales" />
            </div>

            <div className="field">
              <label htmlFor="jobTitle">Job Title</label>
              <input id="jobTitle" {...fieldErrorProps("jobTitle")} required value={form.jobTitle} onChange={(event) => update("jobTitle", event.target.value)} placeholder="e.g. Inside Sales Specialist" />
            </div>

            <div className="field">
              <label htmlFor="numberOfVacancies">Number of Vacancies</label>
              <input id="numberOfVacancies" {...fieldErrorProps("numberOfVacancies")} required min="1" max="100" type="number" value={form.numberOfVacancies} onChange={(event) => update("numberOfVacancies", Number(event.target.value))} />
            </div>

            <div className="field">
              <label htmlFor="targetHiringDate">Target Hiring Date</label>
              <input id="targetHiringDate" {...fieldErrorProps("targetHiringDate")} required type="date" value={form.targetHiringDate} onChange={(event) => update("targetHiringDate", event.target.value)} />
            </div>

            {form.requestType === "Staff Replacement" && (
              <div className="field full">
                <label htmlFor="replacementEmployee">Employee or Position Being Replaced</label>
                <input id="replacementEmployee" {...fieldErrorProps("replacementEmployee")} required value={form.replacementEmployee} onChange={(event) => update("replacementEmployee", event.target.value)} placeholder="Name or position" />
              </div>
            )}

            <div className="field full">
              <label htmlFor="reasonForRequest">Reason for Request</label>
              <textarea id="reasonForRequest" {...fieldErrorProps("reasonForRequest")} required value={form.reasonForRequest} onChange={(event) => update("reasonForRequest", event.target.value)} placeholder="Why is this additional or replacement staff member needed?" />
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-title">
            <span className="section-number">2</span>
            <h2>HOD availability and screening</h2>
          </div>
          <p className="section-intro">Add interview availability and up to two questions. Ella will generate the remaining screening questions.</p>

          <div className="grid-2">
            <div className="field full">
              <label htmlFor="hodEmail">HOD / Interviewer Email</label>
              <input id="hodEmail" {...fieldErrorProps("hodEmail")} type="email" value={form.hodEmail || user.email} onChange={(event) => update("hodEmail", event.target.value)} placeholder="The person whose calendar will receive final interviews" />
              <small className="field-help">This defaults to your McLink account but can identify the HOD when management submits the request.</small>
            </div>
            <div className="field full">
              <label>HOD Availability Windows <span className="field-optional">(optional)</span></label>
              <small className="field-help">These windows guide HR slot creation. Include the timezone for each window.</small>
              <div className="availability-entry-list">
                {form.hodAvailabilitySlots.map((slot, index) => (
                  <div className="availability-entry" key={`availability-${index}`}>
                    <label htmlFor={index === 0 ? "hodAvailabilityDates" : `hodAvailabilityDates-${index}`}>Date
                      <input id={index === 0 ? "hodAvailabilityDates" : `hodAvailabilityDates-${index}`} type="date" value={slot.date} onChange={(event) => updateAvailability(index, "date", event.target.value)} />
                    </label>
                    <label htmlFor={index === 0 ? "hodAvailabilityTimes" : `hodAvailabilityTimes-${index}`}>Start time
                      <input id={index === 0 ? "hodAvailabilityTimes" : `hodAvailabilityTimes-${index}`} type="time" value={slot.startTime} onChange={(event) => updateAvailability(index, "startTime", event.target.value)} />
                    </label>
                    <label htmlFor={`hodAvailabilityEndTime-${index}`}>End time
                      <input id={`hodAvailabilityEndTime-${index}`} type="time" value={slot.endTime} onChange={(event) => updateAvailability(index, "endTime", event.target.value)} />
                    </label>
                    <label htmlFor={`hodAvailabilityTimezone-${index}`}>Timezone
                      <select id={`hodAvailabilityTimezone-${index}`} value={slot.timezone} onChange={(event) => updateAvailability(index, "timezone", event.target.value)}>
                        <option>Asia/Singapore</option>
                        <option>Asia/Manila</option>
                        <option>Asia/Hong_Kong</option>
                        <option>UTC</option>
                        <option>America/Los_Angeles</option>
                      </select>
                    </label>
                    <button type="button" className="btn btn-secondary availability-entry-remove" onClick={() => removeAvailability(index)} aria-label={`Remove availability window ${index + 1}`}>Remove</button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-secondary availability-entry-add" onClick={addAvailability}>+ Add availability window</button>
            </div>
            <div className="field full">
              <label htmlFor="customScreeningQuestion1">Custom HOD Screening Question 1 <span className="field-optional">(optional)</span></label>
              <textarea id="customScreeningQuestion1" value={form.customScreeningQuestion1} onChange={(event) => update("customScreeningQuestion1", event.target.value)} placeholder="Ask something specific to this role" />
            </div>
            <div className="field full">
              <label htmlFor="customScreeningQuestion2">Custom HOD Screening Question 2 <span className="field-optional">(optional)</span></label>
              <textarea id="customScreeningQuestion2" value={form.customScreeningQuestion2} onChange={(event) => update("customScreeningQuestion2", event.target.value)} placeholder="Ask another role-specific question" />
            </div>
          </div>
        </section>

        <div className="form-actions">
          <a className="btn btn-secondary" href="/roles">Cancel</a>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Submitting…" : "Submit for HR discussion"}
          </button>
        </div>
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
