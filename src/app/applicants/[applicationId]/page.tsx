import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import ApplicantDecisionPanel from "@/components/ApplicantDecisionPanel";
import UiIcon, { type UiIconName } from "@/components/UiIcon";
import {
  applicantStageClass,
  getApplicantById,
  getCandidateStatusHistory,
  type ApplicantDetails,
  type CandidateStatusHistoryEntry,
} from "@/lib/candidate-applications";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { formatMatchScore } from "@/lib/score-format";

export const dynamic = "force-dynamic";

function dateValue(value: string) {
  if (!value || Number.isNaN(Date.parse(value))) return value || "Not Provided";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function recordValue(record: Record<string, string> | undefined, ...keys: string[]) {
  if (!record) return "";
  for (const key of keys) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (record[normalized]) return record[normalized];
  }
  return "";
}

function externalUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function latestDecisionComment(history: CandidateStatusHistoryEntry[], stage: CandidateStatusHistoryEntry["stage"]) {
  return history.find((entry) => entry.stage === stage && entry.comments.trim())?.comments || "";
}

function questionItems(value: string) {
  return value.split(/\r?\n/).map((line) => line.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim()).filter(Boolean);
}

function voiceSummaryPreview(value: string) {
  const paragraphs = value.split(/\r?\n\s*\r?\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const overall = paragraphs.find((paragraph) => paragraph.toLowerCase().startsWith("overall hr assessment:"));
  return overall || paragraphs[0] || "";
}

function DetailField({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return <div className="applicant-detail-field"><span>{label}</span><strong>{value}</strong></div>;
}

function DetailCardHeader({ icon, title, description }: { icon: UiIconName; title: string; description?: string }) {
  return <div className="card-header applicant-section-header"><div className="applicant-section-heading"><span className="applicant-section-icon"><UiIcon name={icon} size={17} /></span><div><h2>{title}</h2>{description && <p>{description}</p>}</div></div></div>;
}

function FinalInterviewCard({ applicant }: { applicant: ApplicantDetails }) {
  const finalInterview = applicant.finalInterview;
  const slot = applicant.interviewSlot;
  const status = applicant.finalInterviewStatus || recordValue(finalInterview, "Final_Interview_Status", "Status") || "Not Started";
  const bookingStatus = recordValue(slot, "Status") || applicant.finalBookingStatus || (status.toLowerCase().includes("scheduled") ? "Booked" : "Not Booked");
  const scheduledDate = applicant.finalScheduledDate || recordValue(slot, "Date") || recordValue(finalInterview, "Final_Interview_Date", "Date");
  const scheduledTime = applicant.finalScheduledTime || recordValue(slot, "Start_Time", "Start Time", "Time");
  const timezone = applicant.finalTimezone || recordValue(slot, "Timezone", "Time Zone");
  const interviewer = recordValue(finalInterview, "Interviewer_Name", "Interviewer Name") || "Not assigned";
  const recommendation = recordValue(finalInterview, "Final_Recommendation", "Final Recommendation") || "Awaiting interview decision";
  const calendarStatus = recordValue(slot, "Google_Calendar_Event_Status");
  const calendarError = recordValue(slot, "Google_Calendar_Event_Error");

  return <section className="card applicant-detail-card applicant-final-interview-card">
    <DetailCardHeader icon="briefcase" title="Final Interview" description="Schedule and HR outcome details." />
    <div className="applicant-detail-content">
      <div className="applicant-detail-inline-fields">
        <DetailField label="Applicant" value={applicant.candidateName} />
        <DetailField label="Role" value={applicant.selectedRole} />
        <DetailField label="Status" value={status} />
        <DetailField label="Booking Status" value={bookingStatus} />
        <DetailField label="Scheduled" value={[scheduledDate, scheduledTime].filter(Boolean).join(" ") || "Not scheduled"} />
        <DetailField label="Timezone" value={timezone || "Not provided"} />
        <DetailField label="Interviewer" value={interviewer} />
        <DetailField label="Recommendation" value={recommendation} />
        {calendarStatus && <DetailField label="Calendar" value={calendarStatus} />}
      </div>
      {calendarError && <p className="applicant-voice-review-hint">Calendar sync note: {calendarError}</p>}
    </div>
  </section>;
}

function VoiceInterviewEvidence({ applicant }: { applicant: ApplicantDetails }) {
  return <section className="card applicant-detail-card applicant-voice-evidence-card">
    <DetailCardHeader icon="microphone" title="Voice Interview Evidence" description="Complete AI evaluation and interview evidence for HR review." />
    <div className="applicant-detail-content">
      <div className="applicant-detail-inline-fields">
        <DetailField label="Status" value={applicant.voiceStatus || "Not Started"} />
        <DetailField label="Booking Status" value={applicant.voiceBookingStatus || "Not Booked"} />
        <DetailField label="Scheduled" value={[applicant.voiceScheduledDate, applicant.voiceScheduledTime].filter(Boolean).join(" ") || "Not scheduled"} />
        <DetailField label="Timezone" value={recordValue(applicant.interviewSlot, "Timezone", "Time Zone") || "Not provided"} />
        <DetailField label="Voice AI Score" value={applicant.voiceScore ? formatMatchScore(applicant.voiceScore) : "Awaiting AI evaluation"} />
        <DetailField label="AI Recommendation" value={applicant.voiceRecommendation || "Awaiting AI evaluation"} />
      </div>
      <div className="applicant-copy-block"><span>AI Summary</span><p>{applicant.voiceSummary || "No AI summary is available."}</p></div>
      <div className="applicant-copy-columns">
        <div><span>Strengths</span><p>{applicant.voiceStrengths || "No strengths recorded."}</p></div>
        <div><span>Concerns</span><p>{applicant.voiceConcerns || "No concerns recorded."}</p></div>
      </div>
      <div className="applicant-copy-columns">
        <div><span>Communication Quality</span><p>{applicant.voiceCommunicationQuality || "Not provided."}</p></div>
        <div><span>Answer Completeness</span><p>{applicant.voiceAnswerCompleteness || "Not provided."}</p></div>
      </div>
      <div className="applicant-copy-block"><span>Recommended Follow-up Questions</span><p>{applicant.voiceFollowUpQuestions || "No follow-up questions were recommended."}</p></div>
      {applicant.voiceTranscript ? <details className="applicant-transcript"><summary>View full transcript</summary><pre>{applicant.voiceTranscript}</pre></details> : <div className="applicant-copy-block"><span>Transcript</span><p>No transcript is available.</p></div>}
    </div>
  </section>;
}

function ResumeResource({ value, fileId, fileName, expiresAt }: { value: string; fileId?: string; fileName?: string; expiresAt?: string }) {
  const url = externalUrl(value);
  if (url) return <div className="resume-resource"><span className="resume-resource-icon"><UiIcon name="document" size={23} /></span><div className="resume-resource-copy"><strong>Resume / CV File</strong><span>Open the candidate's submitted document in a new tab.</span></div><a className="btn btn-primary resume-resource-action" href={url} target="_blank" rel="noreferrer"><UiIcon name="arrow-right" size={15} />View Resume / CV</a></div>;
  if (fileId) return <div className="resume-resource"><span className="resume-resource-icon"><UiIcon name="document" size={23} /></span><div className="resume-resource-copy"><strong>{fileName || "Resume / CV File"}</strong><span>{expiresAt ? `Private file; available until ${dateValue(expiresAt)}.` : "Private file available to authorized HR users."}</span></div><a className="btn btn-primary resume-resource-action" href={`/api/uploads/resumes/${encodeURIComponent(fileId)}`} target="_blank" rel="noreferrer"><UiIcon name="arrow-right" size={15} />Download Resume / CV</a></div>;
  return <pre className="applicant-resume">{value || "No resume or CV is available."}</pre>;
}

function InterviewQuestions({ value }: { value: string }) {
  const items = questionItems(value);
  if (items.length === 0) return <div className="applicant-empty-content"><UiIcon name="document" size={20} /><span>No interview questions are available.</span></div>;
  return <ol className="applicant-question-list">{items.map((question, index) => <li key={`${question}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{question}</p></li>)}</ol>;
}

function HistoryTimeline({ history }: { history: CandidateStatusHistoryEntry[] }) {
  if (history.length === 0) {
    return <section className="card applicant-detail-card history-card"><div className="card-header applicant-section-header"><div className="applicant-section-heading"><span className="applicant-section-icon"><UiIcon name="clock" size={17} /></span><div><h2>Candidate Status History</h2><p>Review the candidate audit trail.</p></div></div></div><div className="empty">No candidate status history is available.</div></section>;
  }

  return <section className="card applicant-detail-card history-card"><div className="card-header applicant-section-header"><div className="applicant-section-heading"><span className="applicant-section-icon"><UiIcon name="clock" size={17} /></span><div><h2>Candidate Status History</h2><p>Review the candidate audit trail.</p></div></div></div><div className="history-timeline">{history.map((entry, index) => <article className="timeline-entry" key={`${entry.historyId || entry.changedAt}-${index}`}><span className="timeline-marker" aria-hidden="true" /><div className="timeline-content"><div className="timeline-top"><div><h3>{entry.previousStatus ? `${entry.previousStatus} → ${entry.newStatus}` : entry.newStatus || entry.action}</h3><span className="timeline-action">{entry.stage} · {entry.action}</span></div><time dateTime={entry.changedAt}>{dateValue(entry.changedAt)}</time></div><div className="timeline-performer"><strong>{entry.changedByName}</strong><span>{entry.changedByEmail}</span></div><div className="timeline-meta">{[entry.roleId, entry.actionSource].filter(Boolean).join(" · ")}</div>{entry.comments && <p className="timeline-comments">{entry.comments}</p>}{entry.rejectionReason && <div className="history-entry-comments"><span>Rejection reason</span><p>{entry.rejectionReason}</p></div>}</div></article>)}</div></section>;
}

export default async function ApplicantDetailsPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) redirect("/");
  if (user.canReviewRole !== true && user.canApproveRole !== true) redirect("/dashboard");

  const applicationId = decodeURIComponent((await params).applicationId);
  const [applicant, history] = await Promise.all([getApplicantById(applicationId), getCandidateStatusHistory(applicationId)]);
  if (!applicant) return <AppShell user={user}><main className="container page"><section className="card"><div className="empty"><p>Applicant Not Found.</p><Link className="btn btn-secondary" href="/applicants">Back to Applicants</Link></div></section></main></AppShell>;
  const resumeComments = applicant.resumeComments || latestDecisionComment(history, "resume");
  const voiceComments = applicant.voiceComments || latestDecisionComment(history, "voice");
  const voiceSummary = voiceSummaryPreview(applicant.voiceSummary);

  return <AppShell user={user}><main className="container page applicant-details-page">
    <header className="applicant-detail-header"><Link href="/applicants" className="applicant-back-link"><UiIcon name="arrow-left" size={15} />Back to Applicants</Link><div className="applicant-detail-title-row"><div><span className="eyebrow-dark">APPLICANT PROFILE</span><h1>{applicant.candidateName || "Unnamed Candidate"}</h1><p>{applicant.applicationId} · {applicant.email || "No Email Provided"}</p></div><span className={applicantStageClass(applicant.currentStage)}>{applicant.currentStage}</span></div><div className="applicant-detail-actions"><Link className="btn btn-secondary" href={`/roles/${encodeURIComponent(applicant.roleId)}`}><UiIcon name="briefcase" size={15} />View Role</Link><Link className="btn btn-secondary" href={`/roles/${encodeURIComponent(applicant.roleId)}/applicants`}><UiIcon name="applicants" size={15} />Role Applicants</Link></div></header>
    <div className="applicant-detail-summary"><DetailField label="Selected Role" value={applicant.selectedRole} /><DetailField label="Department" value={applicant.department} /><DetailField label="Applied" value={dateValue(applicant.appliedAt)} /><DetailField label="Match Score" value={formatMatchScore(applicant.matchScore)} /><DetailField label="Recommendation" value={applicant.recommendation} /><DetailField label="Next Action" value={applicant.nextAction} /></div>
    <div className="applicant-detail-grid"><div className="applicant-detail-main">
      <ApplicantDecisionPanel applicationId={applicant.applicationId} resumeDecision={applicant.resumeDecision} resumeComments={resumeComments} voiceDecision={applicant.voiceDecision} voiceComments={voiceComments} voiceStatus={applicant.voiceStatus} finalInterviewStatus={applicant.finalInterviewStatus} voiceBookingLink={applicant.voiceBookingLink} finalBookingLink={applicant.finalBookingLink} voiceTranscript={applicant.voiceTranscript} voiceSummary={applicant.voiceSummary} voiceScore={applicant.voiceScore} voiceRecommendation={applicant.voiceRecommendation} voiceConcerns={applicant.voiceConcerns} canReview={user.canReviewRole === true || user.canApproveRole === true} />
      <section className="card applicant-detail-card"><DetailCardHeader icon="document" title="AI CV Analysis" description="Ella's CV analysis and HR review inputs." /><div className="applicant-detail-content"><div className="applicant-detail-inline-fields"><DetailField label="CV Analysis Status" value={applicant.resumeStatus} /><DetailField label="CV Recommendation" value={applicant.cvRecommendation || "Not Provided"} /><DetailField label="HR Decision" value={applicant.resumeDecision} /><DetailField label="Reviewed By" value={applicant.resumeReviewer} /></div><div className="applicant-copy-block"><span>AI Analysis Summary</span><p>{applicant.aiAnalysisSummary || "No AI summary is available."}</p></div><div className="applicant-copy-columns"><div><span>Strengths</span><p>{applicant.strengths || "Not Provided."}</p></div><div><span>Gaps</span><p>{applicant.gaps || "Not Provided."}</p></div></div></div></section>
      <VoiceInterviewEvidence applicant={applicant} />
      <section className="card applicant-detail-card"><DetailCardHeader icon="document" title="Resume / CV" description="The candidate's submitted resume document." /><ResumeResource value={applicant.resumeText} fileId={applicant.resumeFileId} fileName={applicant.resumeFileName} expiresAt={applicant.resumeFileExpiresAt} /></section>
      <section className="card applicant-detail-card"><DetailCardHeader icon="microphone" title="Interview Questions" description="Questions prepared for the candidate's interview." /><InterviewQuestions value={applicant.interviewQuestions} /></section>
      <HistoryTimeline history={history} />
    </div><aside className="applicant-detail-side">
      <section className="card applicant-detail-card applicant-voice-summary-card"><DetailCardHeader icon="microphone" title="Voice Interview" description="Key interview results for HR." /><div className="applicant-detail-content"><div className="applicant-detail-inline-fields"><DetailField label="Status" value={applicant.voiceStatus} /><DetailField label="Booking Status" value={applicant.voiceBookingStatus} /><DetailField label="Voice AI Score" value={applicant.voiceScore ? formatMatchScore(applicant.voiceScore) : "Awaiting AI evaluation"} /><DetailField label="Voice AI Recommendation" value={applicant.voiceRecommendation || "Awaiting AI evaluation"} /><DetailField label="Scheduled" value={[applicant.voiceScheduledDate, applicant.voiceScheduledTime].filter(Boolean).join(" ")} /></div><div className="applicant-voice-summary-item"><span>AI summary</span><p>{voiceSummary || "No voice interview summary is available."}</p></div><div className="applicant-voice-summary-item"><span>Concerns</span><p>{applicant.voiceConcerns || "No concerns recorded."}</p></div><p className="applicant-voice-review-hint">Full evidence is shown below AI CV Analysis.</p></div></section>
      <section className="card applicant-detail-card"><DetailCardHeader icon="clock" title="Workflow Tracking" description="Current progress through the candidate workflow." /><div className="applicant-timeline"><div><strong>1. AI CV Analysis</strong><span>{applicant.resumeStatus || "Not Started"}</span></div><div><strong>2. Voice Interview</strong><span>{applicant.voiceStatus || "Not Started"}</span></div><div><strong>3. Voice HR Review</strong><span>{applicant.voiceDecision || "Pending"}</span></div><div><strong>4. Final Interview</strong><span>{applicant.finalInterviewStatus || "Not Started"}</span></div><div><strong>Last Updated</strong><span>{dateValue(applicant.lastUpdated)}</span></div></div></section>
      <FinalInterviewCard applicant={applicant} />
    </aside></div>
  </main></AppShell>;
}
