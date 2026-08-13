"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import ActionFeedback from "@/components/ActionFeedback";
import HrReview, { type RoleStatusHistoryEntry } from "@/components/HrReview";
import HodAvailabilityEditor from "@/components/HodAvailabilityEditor";
import RecruitmentSetupEditor from "@/components/RecruitmentSetupEditor";
import { canEditHodAvailability } from "@/lib/access-control";
import { formatEmail } from "@/lib/formatters";
import { getStatusActionLabel } from "@/lib/status-actions";

type RoleRequestDetails = {
  roleId: string; createdAt: string; lastUpdatedAt: string; lastUpdatedByName: string; lastUpdatedByEmail: string;
  latestComments: string; managementComments: string; approvedBy: string; approvedAt: string; resumeTargetStatus: string;
  submittedByEmail: string; submittedByName: string; requesterEmail: string; requesterName: string; requesterType: string; hodEmail: string;
  requestType: string; department: string; jobTitle: string; numberOfVacancies: number; reasonForRequest: string;
  replacementEmployee: string; targetHiringDate: string; reportingManager: string; workLocation: string; employmentType: string;
  jobResponsibilities: string; requiredSkills: string; experienceRequired: string; educationRequirements: string;
  preferredQualifications: string; roleExpectations: string; salaryMin: string; salaryMax: string; workSchedule: string;
  noticePeriodRequirement: string; salaryExpectationGuidance: string;
  jobDescription: string; screeningCriteria: string; initialInterviewQuestions: string; aiSystemPrompt: string; aiInterviewerName?: string; aiInterviewerBehavior?: string; requiredInterviewQuestion1?: string; requiredInterviewQuestion2?: string; requiredInterviewQuestion3?: string; requiredInterviewQuestion4?: string; requiredInterviewQuestion5?: string; finalAiEvaluationTemplate?: string;
  hodAvailabilityDates: string; hodAvailabilityTimes: string; hodAvailabilitySlots: string; customScreeningQuestion1: string; customScreeningQuestion2: string; aiGeneratedScreeningQuestions: string;
  voiceInterviewAvailabilityMode: string; voiceInterviewSlots: string; voiceInterviewAutoStartDate: string; voiceInterviewAutoEndDate: string; voiceInterviewTimezone: string; voiceInterviewSlotsGeneratedAt: string;
  initialInterviewBookingLink: string; hodInterviewBookingLink: string; postingChannels: string; licenseOrCertificateRequired: string;
  keywordsToLookFor: string; minimumYearsOfExperience: string; transferableSkillsAccepted: string; salaryOrBudgetRange: string;
  evaluationFieldToggles?: string; customEvaluationFields?: { key: string; label: string; description: string }[];
  earliestAvailabilityRule: string; interviewBehavior: string; recruitmentSetupUpdatedAt: string; recruitmentSetupUpdatedByName: string;
  recruitmentSetupUpdatedByEmail: string; recruitmentSetupStatus: string; salaryDisclosureStatus: string; experienceRequirementStatus: string; licenseRequirementStatus: string; hodInterviewRequired: string; status: string; source: string; applicationLink?: string;
};

type ApiResponse = { success?: boolean; role?: RoleRequestDetails; history?: RoleStatusHistoryEntry[]; error?: string };
type Props = { roleId: string; userEmail: string; canReviewRole: boolean; canApproveRole: boolean };

function hasValue(value: string | number | undefined | null) { return value !== undefined && value !== null && String(value).trim() !== ""; }
function dateValue(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) return value || "";
  return new Date(value.includes("T") ? value : `${value}T00:00:00`).toLocaleString(undefined, { dateStyle: "medium", timeStyle: value.includes("T") ? "short" : undefined });
}
function salaryValue(value: string) { if (!value.trim()) return ""; const amount = Number(value); return Number.isFinite(amount) ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(amount) : value; }
function statusClass(status: string) { return `status-badge status-${status.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`; }

function Field({ label, value, wide = false }: { label: string; value?: string | number | null; wide?: boolean }) {
  if (!hasValue(value)) return null;
  return <div className={`role-field${wide ? " role-field-wide" : ""}`}><dt>{label}</dt><dd>{String(value)}</dd></div>;
}
function Card({ id, title, children, className = "" }: { id?: string; title: string; children: ReactNode; className?: string }) {
  return <section id={id} className={`card role-section ${className}`}><div className="card-header"><h2>{title}</h2></div>{children}</section>;
}
function DefinitionList({ children }: { children: ReactNode }) { return <dl className="role-definition-list">{children}</dl>; }

const workflowStages = ["Role Request Submitted", "HR Discussion", "Management Approval", "Recruitment Setup", "Job Posting"];
type WorkflowState = "complete" | "current" | "upcoming" | "rejected" | "paused";

function workflowIndex(status: string) {
  if (status === "Pending HR Discussion") return 1;
  if (status === "Pending Management Approval") return 2;
  if (status === "Approved" || status === "Recruitment Setup") return 3;
  if (status === "Job Posted" || status === "Posted") return workflowStages.length;
  return 0;
}

function statusStage(status: string, resumeTargetStatus?: string) {
  return status === "On Hold" || status === "Returned for Revision"
    ? workflowIndex(resumeTargetStatus || "Pending HR Discussion")
    : workflowIndex(status);
}

function rejectedStage(history: RoleStatusHistoryEntry[]) {
  const rejection = history.find((entry) => entry.newStatus === "Rejected");
  return rejection ? statusStage(rejection.previousStatus) : 0;
}

function WorkflowSummary({ status, resumeTargetStatus, history }: { status: string; resumeTargetStatus?: string; history: RoleStatusHistoryEntry[] }) {
  const paused = status === "On Hold";
  const revision = status === "Returned for Revision";
  const rejected = status === "Rejected";
  const current = rejected ? -1 : statusStage(status, resumeTargetStatus);
  const stoppedAt = rejected ? rejectedStage(history) : -1;
  const stateFor = (index: number): WorkflowState => {
    if (rejected) return index <= stoppedAt ? (index === stoppedAt ? "rejected" : "complete") : "upcoming";
    if (index < current) return "complete";
    if (index === current) return paused || revision ? "paused" : "current";
    return "upcoming";
  };
  const stateLabel = (state: WorkflowState) => state === "complete" ? "Completed" : state === "current" ? "Current" : state === "paused" ? "Paused" : state === "rejected" ? "Rejected" : "Upcoming";
  return <section className="workflow-summary" aria-label="Recruitment progress"><div className="workflow-summary-heading"><div><span className="eyebrow-dark">RECRUITMENT PROGRESS</span><h2>Role Request Progress</h2></div></div><ol className="workflow-steps">{workflowStages.map((stage, index) => { const state = stateFor(index); return <li className={state} key={stage} aria-current={state === "current" || state === "paused" ? "step" : undefined}><span aria-hidden="true">{state === "complete" ? "✓" : index + 1}</span><strong>{stage}</strong><small className="workflow-state">{stateLabel(state)}</small></li>; })}</ol></section>;
}

function HistoryTimeline({ history }: { history: RoleStatusHistoryEntry[] }) {
  return <Card id="status-history" title="Status History" className="history-card">{history.length === 0 ? <div className="empty">No status history is available.</div> : <div className="history-timeline">{history.map((entry, index) => {
    const created = entry.action === "role_request_created";
    const notification = entry.notificationStatus?.toLowerCase().replace(/-/g, "_");
    return <article className="timeline-entry" key={`${entry.actionRequestId || entry.timestamp}-${index}`}><span className="timeline-marker" aria-hidden="true" /><div className="timeline-content"><div className="timeline-top"><div><h3>{created ? "Role Request Created" : entry.newStatus ? `${entry.previousStatus || "Status"} → ${entry.newStatus}` : getStatusActionLabel(entry.action)}</h3>{!created && <span className="timeline-action">{getStatusActionLabel(entry.action)}</span>}{created && entry.newStatus && <span className="timeline-action">Initial status: {entry.newStatus}</span>}</div><time dateTime={entry.timestamp}>{dateValue(entry.timestamp)}</time></div>{(hasValue(entry.performedByName) || hasValue(entry.performedByEmail)) && <div className="timeline-performer"><strong>{entry.performedByName}</strong>{formatEmail(entry.performedByEmail) && <span>{formatEmail(entry.performedByEmail)}</span>}</div>}{(entry.accessRole || entry.department) && <div className="timeline-meta">{[entry.accessRole, entry.department].filter(Boolean).join(" · ")}</div>}{hasValue(entry.comments) && <p className="timeline-comments">{entry.comments}</p>}{entry.notificationStatus && <span className={`notification-badge notification-${notification}`}>{entry.notificationStatus.replace(/_/g, " ")}{entry.notificationError ? ` · ${entry.notificationError}` : ""}</span>}</div></article>;
  })}</div>}</Card>;
}

export default function RoleDetails({ roleId, userEmail, canReviewRole, canApproveRole }: Props) {
  const [role, setRole] = useState<RoleRequestDetails | null>(null); const [history, setHistory] = useState<RoleStatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState(""); const [successMessage, setSuccessMessage] = useState(""); const [warningMessage, setWarningMessage] = useState("");
  async function loadRole(preserveView = false, expectedStatus = "") { if (!preserveView) setLoading(true); setError(""); try { const response = await fetch(`/api/roles/${encodeURIComponent(roleId)}`, { cache: "no-store", credentials: "same-origin" }); const raw = await response.text(); const data: ApiResponse = raw ? JSON.parse(raw) : {}; if (!response.ok || data.success !== true || !data.role) throw new Error(data.error || "Unable to load the role request."); const refreshedRole = expectedStatus && data.role.status !== expectedStatus ? { ...data.role, status: expectedStatus } : data.role; setRole(refreshedRole); setHistory(Array.isArray(data.history) ? data.history : []); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load the role request."); } finally { if (!preserveView) setLoading(false); } }
  useEffect(() => { void loadRole(); }, [roleId]);
  if (loading) return <main className="container page"><div className="empty">Loading role request...</div></main>;
  if (error || !role) return <main className="container page"><section className="card"><div className="empty"><p>{error || "Role request not found."}</p><div className="hero-actions"><button className="btn btn-primary" type="button" onClick={() => void loadRole()}>Try again</button><Link className="btn btn-secondary" href="/roles">Back to Role Requests</Link></div></div></section></main>;
  const setup = { roleTitle: role.jobTitle, aiInterviewerName: role.aiInterviewerName || "Ella", aiInterviewerBehavior: role.aiInterviewerBehavior || "", requiredInterviewQuestion1: role.requiredInterviewQuestion1 || "", requiredInterviewQuestion2: role.requiredInterviewQuestion2 || "", requiredInterviewQuestion3: role.requiredInterviewQuestion3 || "", requiredInterviewQuestion4: role.requiredInterviewQuestion4 || "", requiredInterviewQuestion5: role.requiredInterviewQuestion5 || "", hodScreeningQuestion1: role.customScreeningQuestion1 || "", hodScreeningQuestion2: role.customScreeningQuestion2 || "", aiGeneratedScreeningQuestions: role.aiGeneratedScreeningQuestions || "", finalAiEvaluationTemplate: role.finalAiEvaluationTemplate || "", jobDescription: role.jobDescription, screeningCriteria: role.screeningCriteria, initialInterviewQuestions: role.initialInterviewQuestions, aiSystemPrompt: role.aiSystemPrompt, initialInterviewBookingLink: role.initialInterviewBookingLink, hodInterviewBookingLink: role.hodInterviewBookingLink, postingChannels: role.postingChannels.split(/[\n,]/).map((v) => v.trim()).filter(Boolean), evaluationFieldToggles: role.evaluationFieldToggles || "", customEvaluationFields: role.customEvaluationFields || [], licenseOrCertificateRequired: role.licenseOrCertificateRequired, keywordsToLookFor: role.keywordsToLookFor, minimumYearsOfExperience: role.minimumYearsOfExperience, transferableSkillsAccepted: role.transferableSkillsAccepted, salaryOrBudgetRange: role.salaryOrBudgetRange, earliestAvailabilityRule: role.earliestAvailabilityRule, interviewBehavior: role.interviewBehavior, experienceRequired: role.experienceRequired, salaryMin: role.salaryMin, salaryMax: role.salaryMax, noticePeriodRequirement: role.noticePeriodRequirement, salaryDisclosureStatus: role.salaryDisclosureStatus, experienceRequirementStatus: role.experienceRequirementStatus, licenseRequirementStatus: role.licenseRequirementStatus, hodInterviewRequired: role.hodInterviewRequired, voiceInterviewAvailabilityMode: role.voiceInterviewAvailabilityMode || "none", voiceInterviewSlots: role.voiceInterviewSlots || "", voiceInterviewAutoStartDate: role.voiceInterviewAutoStartDate || "", voiceInterviewAutoEndDate: role.voiceInterviewAutoEndDate || "", voiceInterviewTimezone: role.voiceInterviewTimezone || "Asia/Singapore", voiceInterviewSlotsGeneratedAt: role.voiceInterviewSlotsGeneratedAt || "", recruitmentSetupStatus: role.recruitmentSetupStatus, applicationLink: role.applicationLink || "" };
  return <main className="container page role-details-page">
    <header className="role-sticky-header"><Link href="/roles" className="role-back-link"><span aria-hidden="true">←</span> Back to Role Requests</Link><div className="role-main-row"><div className="role-sticky-title"><h1>{role.jobTitle}</h1><p>{role.roleId}</p></div><div className="role-sticky-actions"><span className={statusClass(role.status)}>{role.status}</span><button className="btn btn-secondary" type="button" disabled={refreshing} onClick={() => { setRefreshing(true); void loadRole(true).finally(() => setRefreshing(false)); }}>{refreshing ? "Refreshing…" : "↻ Refresh"}</button></div></div><nav className="role-anchor-nav" aria-label="Role detail sections"><a href="#overview">Overview</a><a href="#details">Details</a><a href="#recruitment-setup">Recruitment Setup</a><Link href={`/roles/${encodeURIComponent(role.roleId)}/applicants`}>Applicants</Link><a href="#status-history">Status History</a></nav></header>
    {successMessage && <ActionFeedback kind="success">{successMessage}</ActionFeedback>}{warningMessage && <ActionFeedback kind="warning">{warningMessage}</ActionFeedback>}
    <WorkflowSummary status={role.status} resumeTargetStatus={role.resumeTargetStatus} history={history} />
    <div className="role-layout"><div className="role-main-column">
      <Card id="overview" title="Request Summary"><DefinitionList><Field label="Role ID" value={role.roleId}/><Field label="Date Submitted" value={dateValue(role.createdAt)}/><Field label="Request Type" value={role.requestType}/><Field label="Department" value={role.department}/><Field label="Job Title" value={role.jobTitle}/><Field label="Number of Vacancies" value={role.numberOfVacancies}/><Field label="Source" value={role.source}/><Field label="Latest Comments" value={role.latestComments} wide/></DefinitionList></Card>
      <Card id="details" title="Employment and Role Requirements"><DefinitionList><Field label="Reporting Manager" value={role.reportingManager}/><Field label="Work Location" value={role.workLocation}/><Field label="Employment Type" value={role.employmentType}/><Field label="Work Schedule" value={role.workSchedule}/><Field label="Target Hiring Date" value={dateValue(role.targetHiringDate)}/>{role.requestType === "Staff Replacement" && <Field label="Replacement Employee" value={role.replacementEmployee}/>}<Field label="Minimum Salary" value={salaryValue(role.salaryMin)}/><Field label="Maximum Salary" value={salaryValue(role.salaryMax)}/><Field label="Reason for Request" value={role.reasonForRequest} wide/><Field label="Job Responsibilities" value={role.jobResponsibilities} wide/><Field label="Required Skills" value={role.requiredSkills} wide/><Field label="Experience Required" value={role.experienceRequired}/><Field label="Education Requirements" value={role.educationRequirements}/><Field label="Preferred Qualifications" value={role.preferredQualifications} wide/><Field label="Role Expectations" value={role.roleExpectations} wide/></DefinitionList></Card>
      <Card title="Interview Readiness"><DefinitionList><Field label="HOD / Interviewer Email" value={role.hodEmail} wide/><Field label="Notice Period or Availability" value={role.noticePeriodRequirement} wide/><Field label="Booking Link" value="Generated from interview slots after the workflow is connected." wide/></DefinitionList></Card>
    </div><aside className="role-side-column"><Card title="People and Audit"><DefinitionList><Field label="Requester Name" value={role.requesterName}/><Field label="Requester Email" value={role.requesterEmail}/><Field label="Requester Type" value={role.requesterType}/><Field label="Submitted By" value={role.submittedByName}/><Field label="Submitted By Email" value={role.submittedByEmail}/><Field label="Created At" value={dateValue(role.createdAt)}/><Field label="Last Updated" value={dateValue(role.lastUpdatedAt)}/><Field label="Last Updated By" value={role.lastUpdatedByName}/><Field label="Last Updated By Email" value={role.lastUpdatedByEmail}/></DefinitionList></Card><Card title="Approval Details">{hasValue(role.approvedBy) || hasValue(role.approvedAt) || hasValue(role.managementComments) ? <DefinitionList><Field label="Management Comments" value={role.managementComments} wide/><Field label="Approved By" value={role.approvedBy}/><Field label="Approved At" value={dateValue(role.approvedAt)}/></DefinitionList> : <div className="empty">{role.status === "Rejected" ? "This request was rejected before management approval." : "Not yet approved by management."}</div>}</Card></aside></div>
    {["Approved", "Recruitment Setup", "Job Posted"].includes(role.status) && <HodAvailabilityEditor roleId={role.roleId} status={role.status} availability={role.hodAvailabilitySlots} editable={canEditHodAvailability({ email: userEmail, canReviewRole }, role)} onSaved={() => void loadRole(true)} />}
    <RecruitmentSetupEditor roleId={role.roleId} status={role.status} editable={canReviewRole} updatedAt={role.recruitmentSetupUpdatedAt} updatedBy={role.recruitmentSetupUpdatedByName} updatedByEmail={role.recruitmentSetupUpdatedByEmail} onSaved={() => void loadRole()} setup={setup}/>
    <HrReview roleId={role.roleId} status={role.status} canReviewRole={canReviewRole} canApproveRole={canApproveRole} history={history} onSuccess={(message, warning, updatedStatus) => { setSuccessMessage(message); setWarningMessage(warning || ""); if (updatedStatus) setRole((current) => current ? { ...current, status: updatedStatus } : current); void loadRole(true, updatedStatus || ""); }} onConflict={() => void loadRole()}/>
    <HistoryTimeline history={history}/>
  </main>;
}
