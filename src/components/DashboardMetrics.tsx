"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import InfoTip from "@/components/InfoTip";
import UiIcon from "@/components/UiIcon";

type RecentRequest = { roleId: string; jobTitle: string; department: string; status: string; createdAt: string; targetHiringDate: string };
type ApplicantMetrics = { total: number; today: number; screened: number; interviewed: number; resumeApproved: number; voiceBookingPending: number; voiceScheduled: number; voiceReviewPending: number; approvedForFinal: number; finalScheduled: number; finalDecisionPending: number; rejected: number; passedFinalInterview: number };
type Metrics = { pendingHrDiscussion: number; pendingManagementApproval: number; approved: number; rejected: number; openPositions: number; openPositionsAssumption?: string; recentRequests?: RecentRequest[]; applicantMetrics?: ApplicantMetrics };

function formatDate(value: string, includeTime = true) {
  if (!value) return "Not provided";
  const parsed = new Date(includeTime || value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "Not provided";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}) }).format(parsed);
}

function statusClass(status: string) { return `status-badge status-${status.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`; }
function MetricSkeleton() { return <article className="dashboard-stat-card dashboard-stat-skeleton" aria-hidden="true"><span /><strong /><small /></article>; }
function percentage(value: number, total: number) { return total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0; }

function CandidateIcon({ name }: { name: "calendar" | "applicants" | "resume" | "voice" }) {
  const icon = name === "calendar" ? "calendar" : name === "applicants" ? "applicants" : name === "resume" ? "document" : "microphone";
  return <span className="dashboard-candidate-icon" aria-hidden="true"><UiIcon name={icon} size={22} /></span>;
}

export default function DashboardMetrics({ scope = "organization" }: { scope?: "personal" | "organization" }) {
  const personalScope = scope === "personal";
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/dashboard/metrics", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || data.success !== true) throw new Error(data.error || "Unable to load dashboard metrics.");
        if (active) { setMetrics(data.metrics); setUpdatedAt(new Date().toISOString()); }
      })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard metrics."); });
    return () => { active = false; };
  }, []);

  const value = (metric: keyof Metrics) => metrics ? String(metrics[metric] ?? 0) : "0";
  const recentCount = metrics?.recentRequests?.length ?? 0;
  const applicantMetrics = metrics?.applicantMetrics;
  const applicantBars = applicantMetrics ? [
    { label: "Resume Approved", value: applicantMetrics.resumeApproved, tone: "blue" },
    { label: "Voice Booking Pending", value: applicantMetrics.voiceBookingPending, tone: "purple" },
    { label: "Voice HR Review", value: applicantMetrics.voiceReviewPending, tone: "green" },
    { label: "Approved for Final Interview", value: applicantMetrics.approvedForFinal, tone: "teal" },
    { label: "Final Interview Scheduled", value: applicantMetrics.finalScheduled, tone: "orange" },
  ] : [];

  return <>
    <div className="dashboard-metrics-meta dashboard-metrics-overview"><span className="dashboard-metrics-overview-label">{personalScope ? "My Overview" : "Overview"}</span>{error ? <span className="dashboard-metrics-error" role="alert">{error}</span> : updatedAt ? `Last updated ${formatDate(updatedAt)}` : "Loading live metrics..."}</div>
    <div className="dashboard-metric-cards">{!metrics && !error ? <><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /></> : <>
      <article className="dashboard-stat-card"><div className="dashboard-stat-header"><span className="dashboard-stat-title-with-info">{personalScope ? "My Requests Waiting for HR Review" : "Waiting for HR Review"}<InfoTip label="What does Waiting for HR Review mean?">These are role requests that still need HR to check the job details.</InfoTip></span><span className="dashboard-stat-icon" aria-hidden="true"><UiIcon name="clock" size={17} /></span></div><strong>{value("pendingHrDiscussion")}</strong><small>{personalScope ? "Your submitted requests" : "Newly submitted requests"}</small></article>
      <article className="dashboard-stat-card"><div className="dashboard-stat-header"><span className="dashboard-stat-title-with-info">{personalScope ? "My Requests Waiting for Approval" : "Waiting for Management Approval"}<InfoTip label="What does Waiting for Management Approval mean?">HR has reviewed these requests and management still needs to approve or reject them.</InfoTip></span><span className="dashboard-stat-icon" aria-hidden="true"><UiIcon name="shield" size={17} /></span></div><strong>{value("pendingManagementApproval")}</strong><small>{personalScope ? "Your requests in approval" : "Awaiting management decision"}</small></article>
      <article className="dashboard-stat-card"><div className="dashboard-stat-header"><span className="dashboard-stat-title-with-info">{personalScope ? "My Approved Roles" : "Approved Roles"}<InfoTip label="What are Approved Roles?">These role requests were approved and can move into recruitment setup.</InfoTip></span><span className="dashboard-stat-icon" aria-hidden="true"><UiIcon name="check" size={17} /></span></div><strong>{value("approved")}</strong><small>{personalScope ? "Your approved roles" : "Approved for recruitment"}</small></article>
      <article className="dashboard-stat-card"><div className="dashboard-stat-header"><span className="dashboard-stat-title-with-info">{personalScope ? "My Open Positions" : "Open Positions"}<InfoTip label="What are Open Positions?">A role is counted here when it is approved or ready for recruitment. Draft and rejected requests are not included.</InfoTip></span><span className="dashboard-stat-icon" aria-hidden="true"><UiIcon name="briefcase" size={17} /></span></div><strong>{value("openPositions")}</strong><small>{personalScope ? "Your roles in recruitment" : "Currently in recruitment"}</small></article>
    </>}</div>

    {!personalScope && metrics && <section className="dashboard-role-actions" aria-labelledby="dashboard-role-actions-title">
      <div className="dashboard-candidate-heading"><div><span className="dashboard-metrics-overview-label dashboard-stat-title-with-info">Role Request Actions<InfoTip label="What are Role Request Actions?">These are the role requests that need HR or management action before recruitment can continue.</InfoTip></span><h2 id="dashboard-role-actions-title">Role Request Decision Queue</h2><p>Review, send for approval, approve, reject, or continue setup from the role request list.</p></div><Link className="dashboard-panel-link" href="/roles">View Role Requests <span aria-hidden="true">&rarr;</span></Link></div>
      <div className="dashboard-role-action-grid">
        <Link className="dashboard-role-action-card dashboard-role-action-review" href="/roles?status=Pending%20HR%20Discussion"><span>Pending HR Review</span><strong>{metrics.pendingHrDiscussion}</strong><small>Review details and send to management, return, or hold.</small></Link>
        <Link className="dashboard-role-action-card dashboard-role-action-approval" href="/roles?status=Pending%20Management%20Approval"><span>Pending Approval</span><strong>{metrics.pendingManagementApproval}</strong><small>Management decision required: approve, reject, return, or hold.</small></Link>
        <Link className="dashboard-role-action-card dashboard-role-action-approved" href="/roles?status=Approved"><span>Approved Roles</span><strong>{metrics.approved}</strong><small>Ready for recruitment setup and posting.</small></Link>
        <Link className="dashboard-role-action-card dashboard-role-action-rejected" href="/roles?status=Rejected"><span>Rejected Role Requests</span><strong>{metrics.rejected}</strong><small>Explicit role-request rejection recorded.</small></Link>
      </div>
    </section>}

    {!personalScope && applicantMetrics && <section className="dashboard-candidate-overview" aria-labelledby="dashboard-candidate-overview-title">
      <div className="dashboard-candidate-heading"><div><span className="dashboard-metrics-overview-label dashboard-stat-title-with-info">Candidate Pipeline<InfoTip label="What is the Candidate Pipeline?">This shows how many applicants have reached each step of the hiring process.</InfoTip></span><h2 id="dashboard-candidate-overview-title">Applicant Performance</h2><p>Live counts from High_Match_Profile. Approval and rejection use clear candidate workflow statuses.</p></div><Link className="dashboard-panel-link" href="/applicants">View Applicants <span aria-hidden="true">&rarr;</span></Link></div>
      <div className="dashboard-candidate-feature-grid">
        <article className="dashboard-candidate-feature dashboard-candidate-feature-today"><CandidateIcon name="calendar" /><div><span>Applicants Today</span><strong>{applicantMetrics.today}</strong><small>Submitted in the portal today</small></div></article>
        <article className="dashboard-candidate-feature"><CandidateIcon name="applicants" /><div><span>Total Applicants</span><strong>{applicantMetrics.total}</strong><small>All candidate records</small></div></article>
        <article className="dashboard-candidate-feature"><CandidateIcon name="resume" /><div><span>Resume Screened</span><strong>{applicantMetrics.screened}</strong><small>{percentage(applicantMetrics.screened, applicantMetrics.total)}% of applicants</small></div></article>
        <article className="dashboard-candidate-feature"><CandidateIcon name="voice" /><div><span>Voice Interviewed</span><strong>{applicantMetrics.interviewed}</strong><small>{percentage(applicantMetrics.interviewed, applicantMetrics.total)}% completed voice interview</small></div></article>
      </div>
      <div className="dashboard-candidate-body">
        <div className="dashboard-candidate-progress">
          <div className="dashboard-candidate-section-heading"><div><h3 className="dashboard-stat-title-with-info">Pipeline Progress<InfoTip label="How is Pipeline Progress counted?">An applicant is counted when the connected sheet shows that they have reached the stage.</InfoTip></h3><p>Where applicants are in the HR workflow right now.</p></div><strong>{applicantMetrics.total} Total</strong></div>
          <div className="dashboard-candidate-bars">{applicantBars.map((bar) => <div className="dashboard-candidate-bar-row" key={bar.label}><div><span>{bar.label}</span><strong>{bar.value} <small>{percentage(bar.value, applicantMetrics.total)}%</small></strong></div><div className="dashboard-candidate-bar-track"><span className={`dashboard-candidate-bar-fill dashboard-candidate-bar-${bar.tone}`} style={{ width: `${percentage(bar.value, applicantMetrics.total)}%` }} /></div></div>)}</div>
        </div>
        <div className="dashboard-candidate-outcomes">
          <div className="dashboard-candidate-section-heading"><div><h3 className="dashboard-stat-title-with-info">Decision Snapshot<InfoTip label="What is the Decision Snapshot?">These totals show decisions already recorded and the applicants still waiting for HR action.</InfoTip></h3><p>Actions HR can take next.</p></div></div>
          <div className="dashboard-candidate-outcome-row dashboard-candidate-outcome-positive"><span className="dashboard-candidate-outcome-dot" aria-hidden="true" /><div><strong>Awaiting Voice Booking Invitation</strong><small>Resume approved; automation should send the voice booking link</small></div><b>{applicantMetrics.voiceBookingPending}</b></div>
          <div className="dashboard-candidate-outcome-row dashboard-candidate-outcome-negative"><span className="dashboard-candidate-outcome-dot" aria-hidden="true" /><div><strong>Rejected Candidates</strong><small>Explicit rejection recorded</small></div><b>{applicantMetrics.rejected}</b></div>
          <div className="dashboard-candidate-outcome-row dashboard-candidate-outcome-final"><span className="dashboard-candidate-outcome-dot" aria-hidden="true" /><div><strong>Passed Final Interview</strong><small>Explicit final outcome recorded</small></div><b>{applicantMetrics.passedFinalInterview}</b></div>
          <div className="dashboard-candidate-outcome-row"><span className="dashboard-candidate-outcome-dot" aria-hidden="true" /><div><strong>Voice HR Review</strong><small>Review Ella's summary and approve for final booking or reject</small></div><b>{applicantMetrics.voiceReviewPending}</b></div>
          <div className="dashboard-candidate-outcome-row"><span className="dashboard-candidate-outcome-dot" aria-hidden="true" /><div><strong>Awaiting Final Booking Invitation</strong><small>Voice interview approved; automation manages the final booking link</small></div><b>{applicantMetrics.approvedForFinal}</b></div>
          <div className="dashboard-candidate-outcome-row"><span className="dashboard-candidate-outcome-dot" aria-hidden="true" /><div><strong>Final Decision Pending</strong><small>Final interview completed; HR must approve or reject</small></div><b>{applicantMetrics.finalDecisionPending}</b></div>
        </div>
      </div>
    </section>}

    <section className="dashboard-panel dashboard-recent" aria-live="polite"><div className="dashboard-panel-header dashboard-recent-header"><div><h2>{personalScope ? "My Recent Role Requests" : "Recent Role Requests"}</h2><p>{personalScope ? "Latest requests submitted by you." : "Latest requests visible to you."}</p></div><Link className="dashboard-panel-link" href="/roles" aria-label={`${personalScope ? "View my" : "View all"} ${recentCount} role requests`}>{personalScope ? "View My" : "View All"} {recentCount} Requests <span aria-hidden="true">&rarr;</span></Link></div><div className="dashboard-recent-column-header" aria-hidden="true"><span>Role</span><span>Department</span><span>Status</span><span>Created</span><span>Target Date</span><span>Action</span></div>{!metrics && !error && <div className="dashboard-recent-state dashboard-recent-skeleton">Loading recent role requests...</div>}{error && <div className="dashboard-recent-state dashboard-recent-error" role="alert">Unable to load recent role requests.</div>}{metrics && !error && recentCount === 0 && <div className="dashboard-recent-state">{personalScope ? "You have not submitted any role requests yet." : "No role requests available."}</div>}{metrics && !error && recentCount > 0 && <div className="dashboard-recent-list">{metrics.recentRequests?.map((role) => <div className="dashboard-recent-row" key={role.roleId}><div className="dashboard-recent-title"><strong>{role.jobTitle || "Untitled role"}</strong><span>{role.roleId}</span></div><div className="dashboard-recent-field"><span className="dashboard-recent-label">Department</span><span>{role.department || "Not provided"}</span></div><div className="dashboard-recent-field"><span className="dashboard-recent-label">Status</span><span className={statusClass(role.status)}>{role.status || "Submitted"}</span></div><div className="dashboard-recent-field"><span className="dashboard-recent-label">Created</span><span>{formatDate(role.createdAt)}</span></div><div className="dashboard-recent-field"><span className="dashboard-recent-label">Target Date</span><span>{formatDate(role.targetHiringDate, false)}</span></div><Link className="dashboard-recent-action" href={`/roles/${encodeURIComponent(role.roleId)}`} aria-label={`View details for ${role.jobTitle || role.roleId}`}>View Details</Link></div>)}</div>}</section>
  </>;
}
