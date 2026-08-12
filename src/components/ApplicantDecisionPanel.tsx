"use client";

import { useState } from "react";

type Stage = "resume" | "voice" | "final";
type Props = {
  applicationId: string;
  resumeDecision: string;
  voiceDecision: string;
  voiceStatus: string;
  finalInterviewStatus: string;
  voiceBookingLink: string;
  finalBookingLink: string;
  voiceTranscript: string;
  voiceSummary: string;
  voiceScore: string;
  voiceRecommendation: string;
  voiceConcerns: string;
  canReview: boolean;
};

function isDecided(current: string) {
  return current === "Approve" || current === "Reject" || current.includes("Passed") || current.includes("Rejected");
}

function DecisionRow({ stage, title, description, current, link, enabled = true, applicationId, canReview, evidence, onSaved }: {
  stage: Stage;
  title: string;
  description: string;
  current: string;
  link?: string;
  enabled?: boolean;
  applicationId: string;
  canReview: boolean;
  evidence?: { summary: string; score: string; recommendation: string; concerns: string; transcript: string };
  onSaved: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState("");
  const [error, setError] = useState("");
  const decided = isDecided(current);

  async function decide(decision: "Approve" | "Reject" | "Manual Review") {
    const trimmed = comments.trim();
    if (!trimmed) { setError("Comments are required for every action."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/applicants/${encodeURIComponent(applicationId)}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage, decision, comments: trimmed }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to save decision.");
      onSaved(decision === "Approve" ? `${title} approved.` : decision === "Reject" ? `${title} marked rejected.` : `${title} returned for review.`);
      setComments("");
    } catch (decisionError) { setError(decisionError instanceof Error ? decisionError.message : "Unable to save decision."); }
    finally { setBusy(false); }
  }

  return <div className="applicant-decision-row">
    <div className="applicant-decision-copy">
      <div className="applicant-decision-title"><strong>{title}</strong>{current && <span className={`applicant-decision-badge ${current === "Reject" || current.includes("Rejected") ? "is-rejected" : "is-approved"}`}>{current}</span>}</div>
      <p>{description}</p>
      {evidence && <div className="voice-review-evidence"><div className="voice-review-metrics"><div><span>AI score</span><strong>{evidence.score || "Not provided"}</strong></div><div><span>Recommendation</span><strong>{evidence.recommendation || "Not provided"}</strong></div></div><div className="voice-review-copy"><span>AI summary</span><p>{evidence.summary || "No AI summary is available."}</p></div><div className="voice-review-copy"><span>Concerns</span><p>{evidence.concerns || "No concerns recorded."}</p></div>{evidence.transcript && <details className="voice-review-transcript"><summary>View transcript</summary><pre>{evidence.transcript}</pre></details>}</div>}
      {link && <a className="applicant-booking-link" href={link} target="_blank" rel="noreferrer">Open Booking Link</a>}
      <label className="field applicant-decision-comments" htmlFor={`${stage}-decision-comments`}><span>Comments *</span><textarea id={`${stage}-decision-comments`} value={comments} disabled={busy || !canReview || !enabled || decided} minLength={1} maxLength={5000} required placeholder={stage === "voice" ? "Explain the HOD interview decision or return note." : "Explain the decision or provide the review note."} onChange={(event) => { setComments(event.target.value); setError(""); }} /></label>
      {error && <small className="applicant-decision-error" role="alert">{error}</small>}
    </div>
    {canReview && enabled && !decided && <div className="applicant-decision-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void decide("Approve")}>{busy ? "Saving..." : stage === "voice" ? "Approve for HOD Interview" : "Approve"}</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void decide("Reject")}>Reject</button><button type="button" title="Request Manual Review" className="btn btn-secondary" disabled={busy} onClick={() => void decide("Manual Review")}>Return for review</button></div>}
  </div>;
}

export default function ApplicantDecisionPanel(props: Props) {
  const [message, setMessage] = useState("");
  return <section className="card applicant-decision-card"><div className="card-header"><div><h2>HR workflow decisions</h2><p>Review Ella&apos;s evidence, then approve, reject, or return the voice interview for review. Comments are required.</p></div></div>{message && <div className="applicant-decision-success" role="status">{message}</div>}<div className="applicant-decision-list">
    <DecisionRow stage="resume" title="Resume Screening" description="Applicant applied. HR reviews Ella&apos;s resume recommendation first." current={props.resumeDecision} applicationId={props.applicationId} canReview={props.canReview} onSaved={setMessage} />
    <DecisionRow stage="voice" title="Voice Interview Review" description="Review the transcript, summary, score, and recommendation before approving the HOD interview." current={props.voiceDecision} link={props.finalBookingLink} enabled={props.voiceStatus === "Interviewed" || props.voiceStatus === "Completed"} evidence={{ summary: props.voiceSummary, score: props.voiceScore, recommendation: props.voiceRecommendation, concerns: props.voiceConcerns, transcript: props.voiceTranscript }} applicationId={props.applicationId} canReview={props.canReview} onSaved={setMessage} />
    <DecisionRow stage="final" title="Final Interview Decision" description="Record the final interview outcome after the interviewer has completed the meeting." current={props.finalInterviewStatus === "Interview Completed" ? "" : props.finalInterviewStatus} enabled={props.finalInterviewStatus.includes("Scheduled") || props.finalInterviewStatus === "Interview Completed"} applicationId={props.applicationId} canReview={props.canReview} onSaved={setMessage} />
  </div></section>;
}
