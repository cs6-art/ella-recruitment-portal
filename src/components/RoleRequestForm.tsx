"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { roleRequestSchema } from "@/lib/role-schema";
import UiIcon from "@/components/UiIcon";

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
  message?: string;
  error?: string;
};

const workdayOptions = [
  ["Monday", "Mon"],
  ["Tuesday", "Tue"],
  ["Wednesday", "Wed"],
  ["Thursday", "Thu"],
  ["Friday", "Fri"],
  ["Saturday", "Sat"],
  ["Sunday", "Sun"],
] as const;

const timezoneOptions = [
  ["Asia/Manila", "Philippines (Asia/Manila)"],
  ["Asia/Singapore", "Singapore (Asia/Singapore)"],
  ["UTC", "UTC"],
  ["America/New_York", "Eastern Time (America/New_York)"],
  ["Europe/London", "United Kingdom (Europe/London)"],
] as const;

const initial = {
  requestType: "Staff Addition",
  department: "",
  jobTitle: "",
  numberOfVacancies: 1,
  reasonForRequest: "",
  jobDescription: "",
  replacementEmployee: "",
  targetHiringDate: "",
  hodAvailabilityDates: "",
  hodAvailabilityTimes: "",
  customScreeningQuestion1: "",
  customScreeningQuestion2: "",
  aiGeneratedScreeningQuestions: [],
  reportingManager: "",
  workLocation: "",
  employmentType: "Full-Time",
  jobResponsibilities: "",
  requiredSkills: "",
  experienceRequired: "",
  educationRequirements: "",
  preferredQualifications: "",
  roleExpectations: "",
  salaryMin: "",
  salaryMax: "",
  workSchedule: "Monday-Friday, 8:00 AM-5:00 PM (Asia/Manila)",
  noticePeriodRequirement: "",
  salaryExpectationGuidance: "",
  requesterName: "",
  requesterEmail: "",
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
  noticePeriodRequirement: "Notice Period or Availability",
  salaryExpectationGuidance: "Salary Expectations",
  reportingManager: "Reporting Manager",
  workLocation: "Work Location",
  employmentType: "Employment Type",
  jobResponsibilities: "Job Responsibilities",
  requiredSkills: "Required Skills",
  experienceRequired: "Experience Required",
  educationRequirements: "Education Requirements",
  preferredQualifications: "Preferred Qualifications",
  roleExpectations: "Role Expectations",
  salaryMin: "Salary Minimum",
  salaryMax: "Salary Maximum",
  workSchedule: "Work Schedule",
  requesterName: "Requester Name",
  requesterEmail: "Requester Email",
};

export default function RoleRequestForm({
  user,
}: RoleRequestFormProps) {
  const router = useRouter();
  const [form, setForm] = useState({
    ...initial,
    requesterName: user.name,
    requesterEmail: user.email,
  });

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [fieldErrors, setFieldErrors] =
    useState<Record<string, string>>({});

  const [scheduleDays, setScheduleDays] = useState<string[]>([
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
  ]);
  const [scheduleStart, setScheduleStart] = useState("08:00");
  const [scheduleEnd, setScheduleEnd] = useState("17:00");
  const [scheduleTimezone, setScheduleTimezone] = useState("Asia/Manila");
  const [scheduleError, setScheduleError] = useState("");

  const [success, setSuccess] =
    useState<{
      roleId: string;
      status: string;
      } | null>(null);

  const errorSummaryRef = useRef<HTMLDivElement>(null);

  function scrollToErrorSummary() {
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.requestAnimationFrame(() => {
      errorSummaryRef.current?.focus();
    });
  }

  function update(
    name: string,
    value: string | number,
  ) {
    setForm((current) => ({
      ...current,
      [name]: name === "requestType" && value === "Staff Addition"
        ? "Staff Addition"
        : value,
      ...(name === "requestType" && value === "Staff Addition"
        ? { replacementEmployee: "" }
        : {}),
    }));
  }

  function formatScheduleTime(value: string) {
    const parts = value.split(":");
    const hours = Number(parts[0]);
    const minutes = parts[1] || "00";
    if (!Number.isFinite(hours)) return value;

    const suffix = hours >= 12 ? "PM" : "AM";
    const displayHour = hours % 12 || 12;
    return `${displayHour}:${minutes} ${suffix}`;
  }

  function formatScheduleDays(days: string[]) {
    const orderedDays = workdayOptions
      .map(([value]) => value)
      .filter((day) => days.includes(day));

    if (orderedDays.length === 5 &&
      orderedDays.every((day, index) => day === workdayOptions[index][0])) {
      return "Monday-Friday";
    }
    if (orderedDays.length === 7) return "Monday-Sunday";
    return orderedDays.join(", ");
  }

  function getScheduleError(days: string[], start: string, end: string) {
    if (days.length === 0) return "Select at least one workday.";
    if (!start || !end) return "Set both a start time and an end time.";
    if (start >= end) return "End time must be later than start time.";
    return "";
  }

  function updateSchedule(
    nextDays: string[] = scheduleDays,
    nextStart: string = scheduleStart,
    nextEnd: string = scheduleEnd,
    nextTimezone: string = scheduleTimezone,
  ) {
    const nextError = getScheduleError(nextDays, nextStart, nextEnd);
    setScheduleDays(nextDays);
    setScheduleStart(nextStart);
    setScheduleEnd(nextEnd);
    setScheduleTimezone(nextTimezone);
    setScheduleError(nextError);
    if (!nextError && fieldErrors.workSchedule) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next.workSchedule;
        return next;
      });
    }
    update(
      "workSchedule",
      nextError
        ? ""
        : `${formatScheduleDays(nextDays)}, ${formatScheduleTime(nextStart)}-${formatScheduleTime(nextEnd)} (${nextTimezone})`,
    );
  }

  function fieldErrorProps(field: string) {
    return {
      "aria-invalid": Boolean(fieldErrors[field]),
    };
  }

  /** Turns a raw schema key and Zod message into human-readable copy. Falling
   *  back to the key itself leaked "jobDescription" into the summary, so any
   *  unmapped key is de-camel-cased rather than shown verbatim. */
  function formatFieldError(field: string, message: string) {
    const readableMessage = message
      .replace(/^String must/, "Must")
      .replace(/^Invalid input/, "Invalid value");
    const label = fieldLabels[field]
      || field.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
    return { label, message: readableMessage };
  }

  function validateForm() {
    const parsed = roleRequestSchema.safeParse({
      ...form,
      requesterName: user.name,
      requesterEmail: user.email,
      replacementEmployee: form.requestType === "Staff Replacement"
        ? form.replacementEmployee
        : "",
    });

    const nextErrors: Record<string, string> = {};
    const nextScheduleError = getScheduleError(
      scheduleDays,
      scheduleStart,
      scheduleEnd,
    );
    if (nextScheduleError) nextErrors.workSchedule = nextScheduleError;

    if (parsed.success && Object.keys(nextErrors).length === 0) {
      setFieldErrors({});
      return true;
    }

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] || "form");
        if (!nextErrors[field]) nextErrors[field] = issue.message;
      }
    }
    setFieldErrors(nextErrors);
    setError("Please correct the highlighted fields before submitting.");
    scrollToErrorSummary();
    return false;
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    setError("");
    setSuccess(null);

    try {
      const response = await fetch(
        "/api/roles",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify({
            ...form,
            requesterName: user.name,
            requesterEmail: user.email,
            replacementEmployee: form.requestType === "Staff Replacement"
              ? form.replacementEmployee
              : "",
          }),
        },
      );

      const rawResponse =
        await response.text();

      let result: RoleSubmissionResult;

      try {
        result = rawResponse
          ? JSON.parse(rawResponse)
          : {
              success: false,
              error:
                "The server returned an empty response.",
            };
      } catch {
        throw new Error(
          `The server returned invalid JSON. Status: ${response.status}`,
        );
      }

      if (
        !response.ok ||
        result.success !== true
      ) {
        throw new Error(
          result.error ||
            "Unable to submit role request.",
        );
      }

      setSuccess({
        roleId:
          result.roleId ||
          "Not provided",
        status:
          result.status ||
          "Pending HR Discussion",
      });

      router.push(`/roles/${encodeURIComponent(result.roleId || "")}`);

      setForm({
        ...initial,
        requesterName: user.name,
        requesterEmail: user.email,
      });

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (submissionError) {
      console.error(
        "[Role Request Form] Submission failed:",
        submissionError,
      );

      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Submission failed.",
      );
      scrollToErrorSummary();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="form-layout"
    >
      <div className="form-card">
        {success && (
          <div className="section">
            <div className="success-box">
              <strong>
                Role request submitted.
              </strong>

              <br />

              Role ID: {success.roleId}

              <br />

              Status: {success.status}
            </div>
          </div>
        )}

        {error && (
          <div className="section">
            <div
              ref={errorSummaryRef}
              className="error-box message-box"
              role="alert"
              tabIndex={-1}
              aria-label="Form errors"
            >
              <span className="message-box-icon" aria-hidden="true">
                <UiIcon name="alert" size={17} />
              </span>

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
                        const { label, message: text } = formatFieldError(field, message);
                        return (
                          <li key={field}>
                            <a href={`#${field}`}>
                              <span className="field-error-link-label">{label}</span>
                              <span className="field-error-link-text">{text}</span>
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
            <span className="section-number">
              1
            </span>

            <h2>Staff request</h2>
          </div>

          <div className="grid-2">
            <div className="field full">
              <label htmlFor="jobDescription">Job Description</label>
              <textarea id="jobDescription" {...fieldErrorProps("jobDescription")} required value={form.jobDescription} onChange={(event) => update("jobDescription", event.target.value)} placeholder="Describe the purpose, scope, and context of this role." />
            </div>
            <div className="field">
              <label htmlFor="requestType">
                Request Type
              </label>

              <select
                id="requestType"
                {...fieldErrorProps("requestType")}
                value={form.requestType}
                onChange={(event) =>
                  update(
                    "requestType",
                    event.target.value,
                  )
                }
              >
                <option>
                  Staff Addition
                </option>

                <option>Staff Replacement</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="department">
                Department
              </label>

              <input
                id="department"
                {...fieldErrorProps("department")}
                required
                value={form.department}
                onChange={(event) =>
                  update(
                    "department",
                    event.target.value,
                  )
                }
                placeholder="e.g. Inside Sales"
              />
            </div>

            <div className="field">
              <label htmlFor="jobTitle">
                Job Title
              </label>

              <input
                id="jobTitle"
                {...fieldErrorProps("jobTitle")}
                required
                value={form.jobTitle}
                onChange={(event) =>
                  update(
                    "jobTitle",
                    event.target.value,
                  )
                }
                placeholder="e.g. Inside Sales Specialist"
              />
            </div>

            <div className="field">
              <label htmlFor="numberOfVacancies">
                Number of Vacancies
              </label>

              <input
                id="numberOfVacancies"
                {...fieldErrorProps("numberOfVacancies")}
                required
                min="1"
                type="number"
                value={
                  form.numberOfVacancies
                }
                onChange={(event) =>
                  update(
                    "numberOfVacancies",
                    Number(
                      event.target.value,
                    ),
                  )
                }
                placeholder="e.g. Reports to Sales Director"
              />
            </div>

            <div className="field">
              <label htmlFor="targetHiringDate">
                Target Hiring Date
              </label>

              <input
                id="targetHiringDate"
                {...fieldErrorProps("targetHiringDate")}
                required
                type="date"
                value={
                  form.targetHiringDate
                }
                onChange={(event) =>
                  update(
                    "targetHiringDate",
                    event.target.value,
                  )
                }
                placeholder="e.g. Describe the main duties and deliverables"
              />
            </div>

            <div className="field">
              <label htmlFor="reportingManager">
                Reporting Manager
              </label>

              <input
                id="reportingManager"
                {...fieldErrorProps("reportingManager")}
                required
                value={
                  form.reportingManager
                }
                onChange={(event) =>
                  update(
                    "reportingManager",
                    event.target.value,
                  )
                }
                placeholder="e.g. Maria Santos, Sales Manager"
              />
            </div>

            {form.requestType ===
              "Staff Replacement" && (
              <div className="field">
                <label htmlFor="replacementEmployee">
                  Employee or Position
                  Being Replaced
                </label>

                <input
                  id="replacementEmployee"
                  {...fieldErrorProps("replacementEmployee")}
                  value={
                    form.replacementEmployee
                  }
                  required
                  aria-invalid={Boolean(fieldErrors.replacementEmployee)}
                  onChange={(event) =>
                    update(
                      "replacementEmployee",
                      event.target.value,
                    )
                  }
                />
                {fieldErrors.replacementEmployee && <small id="replacementEmployee-error" className="field-error">{fieldErrors.replacementEmployee}</small>}
              </div>
            )}

            <div className="field full">
              <label htmlFor="reasonForRequest">
                Reason for Request
              </label>

              <textarea
                id="reasonForRequest"
                {...fieldErrorProps("reasonForRequest")}
                required
                value={
                  form.reasonForRequest
                }
                onChange={(event) =>
                  update(
                    "reasonForRequest",
                    event.target.value,
                  )
                }
                placeholder="Explain why the additional or replacement staff is required."
              />
            </div>
            <div className="field">
              <label htmlFor="hodAvailabilityDates">HOD Availability Dates</label>
              <textarea id="hodAvailabilityDates" value={form.hodAvailabilityDates} onChange={(event) => update("hodAvailabilityDates", event.target.value)} placeholder="Dates the HOD can interview candidates" />
            </div>
            <div className="field">
              <label htmlFor="hodAvailabilityTimes">HOD Availability Times</label>
              <textarea id="hodAvailabilityTimes" value={form.hodAvailabilityTimes} onChange={(event) => update("hodAvailabilityTimes", event.target.value)} placeholder="Time windows and timezone" />
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-title">
            <span className="section-number">
              2
            </span>

            <h2>Role requirements</h2>
          </div>

          <div className="grid-2">
            <div className="field">
              <label htmlFor="workLocation">
                Work Location
              </label>

              <input
                id="workLocation"
                {...fieldErrorProps("workLocation")}
                required
                value={form.workLocation}
                onChange={(event) =>
                  update(
                    "workLocation",
                    event.target.value,
                  )
                }
                placeholder="Singapore, Ortigas, Hybrid, etc."
              />
            </div>

            <div className="field">
              <label htmlFor="employmentType">
                Employment Type
              </label>

              <select
                id="employmentType"
                {...fieldErrorProps("employmentType")}
                value={
                  form.employmentType
                }
                onChange={(event) =>
                  update(
                    "employmentType",
                    event.target.value,
                  )
                }
              >
                <option>Full-Time</option>
                <option>Part-Time</option>
                <option>Contract</option>
                <option>Temporary</option>
                <option>Internship</option>
              </select>
            </div>

            <div className="field full">
              <label htmlFor="jobResponsibilities">
                Job Responsibilities
              </label>

              <textarea
                id="jobResponsibilities"
                {...fieldErrorProps("jobResponsibilities")}
                required
                value={
                  form.jobResponsibilities
                }
                onChange={(event) =>
                  update(
                    "jobResponsibilities",
                    event.target.value,
                  )
                }
                placeholder="e.g. Manage client accounts and prepare weekly reports"
              />
            </div>

            <div className="field full">
              <label htmlFor="requiredSkills">
                Required Skills
              </label>

              <textarea
                id="requiredSkills"
                {...fieldErrorProps("requiredSkills")}
                required
                value={
                  form.requiredSkills
                }
                onChange={(event) =>
                  update(
                    "requiredSkills",
                    event.target.value,
                  )
                }
                placeholder="e.g. CRM, negotiation, communication"
              />
            </div>

            <div className="field">
              <label htmlFor="experienceRequired">
                Experience Required
              </label>

              <input
                id="experienceRequired"
                {...fieldErrorProps("experienceRequired")}
                required
                value={
                  form.experienceRequired
                }
                onChange={(event) =>
                  update(
                    "experienceRequired",
                    event.target.value,
                  )
                }
                placeholder="e.g. 2+ years in a similar role"
              />
            </div>

            <div className="field">
              <label htmlFor="educationRequirements">
                Education Requirements
              </label>

              <input
                id="educationRequirements"
                {...fieldErrorProps("educationRequirements")}
                value={
                  form.educationRequirements
                }
                onChange={(event) =>
                  update(
                    "educationRequirements",
                    event.target.value,
                  )
                }
                placeholder="e.g. Bachelor's degree or equivalent experience"
              />
            </div>

            <div className="field full">
              <label htmlFor="preferredQualifications">
                Preferred Qualifications
              </label>

              <textarea
                id="preferredQualifications"
                {...fieldErrorProps("preferredQualifications")}
                value={
                  form.preferredQualifications
                }
                onChange={(event) =>
                  update(
                    "preferredQualifications",
                    event.target.value,
                  )
                }
                placeholder="e.g. Experience in B2B sales is preferred"
              />
            </div>

            <div className="field full">
              <label htmlFor="roleExpectations">
                Role Expectations
              </label>

              <textarea
                id="roleExpectations"
                {...fieldErrorProps("roleExpectations")}
                required
                value={
                  form.roleExpectations
                }
                onChange={(event) =>
                  update(
                    "roleExpectations",
                    event.target.value,
                  )
                }
                placeholder="Describe targets, responsibilities and expected outcomes."
              />
            </div>

            <div className="field">
              <label htmlFor="salaryMin">
                Salary Minimum
              </label>

              <input
                id="salaryMin"
                {...fieldErrorProps("salaryMin")}
                min="1"
                step="0.01"
                type="number"
                aria-invalid={Boolean(fieldErrors.salaryMin)}
                value={form.salaryMin}
                onChange={(event) =>
                  update(
                    "salaryMin",
                    event.target.value,
                  )
                }
                placeholder="e.g. 30000"
              />
              {fieldErrors.salaryMin && <small id="salaryMin-error" className="field-error">{fieldErrors.salaryMin}</small>}
            </div>

            <div className="field">
              <label htmlFor="salaryMax">
                Salary Maximum
              </label>

              <input
                id="salaryMax"
                {...fieldErrorProps("salaryMax")}
                min="1"
                step="0.01"
                type="number"
                aria-invalid={Boolean(fieldErrors.salaryMax)}
                value={form.salaryMax}
                onChange={(event) =>
                  update(
                    "salaryMax",
                    event.target.value,
                  )
                }
                placeholder="e.g. 45000"
              />
              {fieldErrors.salaryMax && <small id="salaryMax-error" className="field-error">{fieldErrors.salaryMax}</small>}
            </div>

            <div className="field full schedule-editor">
              <label>Work Schedule</label>
              <small>
                Set the recurring workdays and hours. For example, choose Monday-Friday,
                set 8:00 AM to 5:00 PM, and select the work location timezone.
              </small>

              <fieldset
                className="schedule-days"
                aria-invalid={Boolean(fieldErrors.workSchedule || scheduleError)}
              >
                <legend>Workdays</legend>
                {workdayOptions.map(([value, label]) => (
                  <label
                    className={`schedule-day-option${scheduleDays.includes(value) ? " selected" : ""}`}
                    key={value}
                  >
                    <input
                      type="checkbox"
                      checked={scheduleDays.includes(value)}
                      onChange={() => {
                        const nextDays = scheduleDays.includes(value)
                          ? scheduleDays.filter((day) => day !== value)
                          : [...scheduleDays, value];
                        updateSchedule(nextDays);
                      }}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>

              <div className="schedule-time-row">
                <label className="schedule-time-field" htmlFor="workScheduleStart">
                  Start time
                  <input
                    id="workScheduleStart"
                    type="time"
                    value={scheduleStart}
                    onChange={(event) => updateSchedule(scheduleDays, event.target.value)}
                  />
                </label>

                <span className="schedule-time-separator" aria-hidden="true">to</span>

                <label className="schedule-time-field" htmlFor="workScheduleEnd">
                  End time
                  <input
                    id="workScheduleEnd"
                    type="time"
                    value={scheduleEnd}
                    onChange={(event) => updateSchedule(scheduleDays, scheduleStart, event.target.value)}
                  />
                </label>

                <label className="schedule-time-field" htmlFor="workScheduleTimezone">
                  Timezone
                  <select
                    id="workScheduleTimezone"
                    value={scheduleTimezone}
                    onChange={(event) => updateSchedule(scheduleDays, scheduleStart, scheduleEnd, event.target.value)}
                  >
                    {timezoneOptions.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <output className="schedule-preview" htmlFor="workScheduleStart workScheduleEnd workScheduleTimezone">
                Saved as: {form.workSchedule || "Choose at least one workday and a valid time range."}
              </output>
              {(scheduleError || fieldErrors.workSchedule) && (
                <small className="field-error">
                  {scheduleError || fieldErrors.workSchedule}
                </small>
              )}
            </div>
            <div className="field">
              <label htmlFor="noticePeriodRequirement">Notice Period or Availability</label>
              <input id="noticePeriodRequirement" value={form.noticePeriodRequirement} onChange={(event) => update("noticePeriodRequirement", event.target.value)} placeholder="e.g. Available within 30 days" />
            </div>
            <div className="field">
              <label htmlFor="salaryExpectationGuidance">Salary Expectations</label>
              <input id="salaryExpectationGuidance" value={form.salaryExpectationGuidance} onChange={(event) => update("salaryExpectationGuidance", event.target.value)} placeholder="Budget or guidance for HR" />
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-title">
            <span className="section-number">
              3
            </span>

            <h2>Requester</h2>
          </div>

          <div className="grid-2">
            <div className="field">
              <label htmlFor="requesterName">
                Requester Name
              </label>

              <input
                id="requesterName"
                required
                readOnly
                className="readonly-field"
                value={
                  form.requesterName
                }
              />
            </div>

            <div className="field">
              <label htmlFor="requesterEmail">
                Requester Email
              </label>

              <input
                id="requesterEmail"
                required
                type="email"
                readOnly
                className="readonly-field"
                value={
                  form.requesterEmail
                }
              />
            </div>
          </div>
        </section>

        <div className="form-actions">
          <a
            className="btn btn-secondary"
            href="/roles"
          >
            Cancel
          </a>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            {loading
              ? "Submitting…"
              : "Submit for HR discussion"}
          </button>
        </div>
      </div>

      <aside className="sidebar-card">
        <h3>What happens next</h3>

        <div className="sidebar-list">
          <div>
            <strong>
              1. HR discussion
            </strong>

            <br />

            HR confirms preferences and
            the job description with the
            requester.
          </div>

          <div>
            <strong>
              2. Management approval
            </strong>

            <br />

            The completed request is
            approved, returned, rejected,
            or placed on hold.
          </div>

          <div>
            <strong>
              3. Recruitment setup
            </strong>

            <br />

            HR finalizes the screening
            criteria, templates, and
            booking links.
          </div>

          <div>
            <strong>
              4. Job posting
            </strong>

            <br />

            The role is published only on
            relevant recruitment channels.
          </div>

          <div>
            <strong>
              Initial status
            </strong>

            <br />

            Pending HR Discussion
          </div>
        </div>
      </aside>
    </form>
  );
}
