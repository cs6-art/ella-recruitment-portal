"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import ActionFeedback from "@/components/ActionFeedback";
import ValidationSummary from "@/components/ValidationSummary";

type Stage = "resume" | "voice" | "final";
type SavedDecision = { decision: string; comments: string };
type Props = {
  applicationId: string;
  resumeDecision: string;
  resumeComments: string;
  voiceDecision: string;
  voiceComments: string;
  voiceStatus: string;
  voiceBookingStatus: string;
  voiceBookingLink: string;
  finalInterviewStatus: string;
  finalStatus: string;
  finalComments: string;
  finalBookingLink: string;
  canReview: boolean;
  canManage: boolean;
};

function isDecided(current: string) {
  const normalized = current.trim().toLowerCase();
  return normalized === "approve" || normalized === "approved" ||
    normalized === "reject" || normalized === "rejected" ||
    normalized.includes("passed") || normalized.includes("rejected");
}

function decisionLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "approve" || normalized === "approved") return "Approved";
  if (normalized === "reject" || normalized === "rejected") return "Rejected";
  return value || "Pending";
}

function isRejectedDecision(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "reject" || normalized === "rejected" || normalized.includes("rejected");
}

function reviewStage(props: Props): Stage {
  if (/completed/i.test(props.finalInterviewStatus) || /(?:final|hr) interview (passed|rejected)/i.test(props.finalStatus)) return "final";
  // An incomplete voice interview still needs HR review. Treating it as an
  // unrecognized status falls back to the already-decided CV stage and hides
  // the voice approval actions.
  if (/interviewed|completed|incomplete|no show/i.test(`${props.voiceStatus} ${props.voiceBookingStatus} ${props.finalStatus}`)) return "voice";
  if (/awaiting booking|awaiting schedule|invitation sent|scheduled|booked/i.test(props.voiceBookingStatus) && /approved for ai voice/i.test(props.finalStatus)) return "voice";
  return "resume";
}

function CompletedDecision({ title, decision, comments, link }: { title: string; decision: string; comments: string; link?: string }) {
  return <div className="applicant-completed-decision"><div className="applicant-decision-title"><strong>{title}</strong><span className={`applicant-decision-badge ${isRejectedDecision(decision) ? "is-rejected" : ""}`}>{decisionLabel(decision)}</span></div>{link && <a className="applicant-booking-link" href={link} target="_blank" rel="noreferrer">Open Face-to-Face Interview Booking Link</a>}{comments ? <div className="applicant-completed-comments"><span>Comments</span><p>{comments}</p></div> : <p className="applicant-completed-empty">No comments were recorded for this decision.</p>}</div>;
}

function DecisionRow({ stage, title, description, current, link, enabled = true, applicationId, canReview, onSaved, canSendBookingLink = false }: {
  stage: Stage;
  title: string;
  description: string;
  current: string;
  link?: string;
  enabled?: boolean;
  applicationId: string;
  canReview: boolean;
  onSaved: (message: string, decision: string, comments: string) => void;
  canSendBookingLink?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState("");
  const [error, setError] = useState("");
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingMessage, setBookingMessage] = useState("");
  const [bookingError, setBookingError] = useState("");
  const decided = isDecided(current);

  async function decide(decision: "Approve" | "Reject") {
    const trimmed = comments.trim();
    if (!trimmed) { setError("Comments are required for every action."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/applicants/${encodeURIComponent(applicationId)}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage, decision, comments: trimmed }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to save decision.");
      // Show the saved state immediately while the server component refreshes.
      // This avoids a pending-looking card when the write and read hit
      // different serverless instances with separate in-memory caches.
      onSaved(decision === "Approve" ? `${title} approved.` : `${title} marked rejected.`, decision, trimmed);
      // Refresh the server component data after the workflow write so the
      // summary cards, timeline, and available decisions stay in sync without
      // losing the reviewer's current page position.
      router.refresh();
      // A same-route refresh can leave an already-rendered client boundary
      // unchanged when the page was restored from browser history. Replace
      // the detail URL as well so the approved/rejected state is guaranteed to
      // be fetched and displayed immediately after the decision succeeds.
      router.replace(`/applicants/${encodeURIComponent(applicationId)}?decisionSaved=${Date.now()}`);
      return;
    } catch (decisionError) { setError(decisionError instanceof Error ? decisionError.message : "Unable to save decision."); }
    finally { setBusy(false); }
  }

  async function sendBookingLink() {
    setBookingBusy(true); setBookingError(""); setBookingMessage("");
    try {
      const response = await fetch(`/api/applicants/${encodeURIComponent(applicationId)}/voice-booking-link`, { method: "POST", credentials: "same-origin" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success !== true) throw new Error(data.error || "Unable to send the voice booking link.");
      setBookingMessage(data.message || "Booking link queued for automatic email delivery.");
      router.refresh();
      router.replace(`/applicants/${encodeURIComponent(applicationId)}?bookingLinkSent=${Date.now()}`);
    } catch (bookingErrorValue) {
      setBookingError(bookingErrorValue instanceof Error ? bookingErrorValue.message : "Unable to send the voice booking link.");
    } finally { setBookingBusy(false); }
  }

  return <div className="applicant-decision-row">
    <div className="applicant-decision-copy">
      <div className="applicant-decision-title"><strong>{title}</strong>{current && <span className={`applicant-decision-badge ${isRejectedDecision(current) ? "is-rejected" : "is-approved"}`}>{decisionLabel(current)}</span>}</div>
      <p>{description}</p>
      {link && <a className="applicant-booking-link" href={link} target="_blank" rel="noreferrer">Open AI Voice Interview Booking Link</a>}
      {stage === "voice" && canSendBookingLink && !decided && !/scheduled|booked/i.test(current) && <div className="applicant-booking-action"><button type="button" className="btn btn-secondary" disabled={bookingBusy || busy} onClick={() => void sendBookingLink()}>{bookingBusy ? "Sending..." : "Send booking link"}</button><span>Creates a fresh link and emails it to the applicant.</span></div>}
      {bookingMessage && <ActionFeedback kind="success" className="applicant-decision-success">{bookingMessage}</ActionFeedback>}
      {bookingError && <ValidationSummary error={bookingError} title="Booking link failed" />}
      <label className="field applicant-decision-comments" htmlFor={`${stage}-decision-comments`}><span>Comments *</span><textarea id={`${stage}-decision-comments`} value={comments} disabled={busy || !canReview || !enabled || decided} minLength={1} maxLength={5000} required placeholder={stage === "voice" ? "Explain the voice interview decision." : "Explain the decision."} onChange={(event) => { setComments(event.target.value); setError(""); }} /></label>
      {error && <ValidationSummary error={error} title="Decision save failed" />}
      {canReview && enabled && !decided && <div className="applicant-decision-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void decide("Approve")}>{busy ? "Saving..." : "Approve"}</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void decide("Reject")}>Reject</button></div>}
    </div>
  </div>;
}

export default function ApplicantDecisionPanel(props: Props) {
  const [message, setMessage] = useState("");
  const [savedDecisions, setSavedDecisions] = useState<Partial<Record<Stage, SavedDecision>>>({});
  const stage = reviewStage(props);
  const saveDecision = (nextMessage: string, decision: string, comments: string) => {
    setMessage(nextMessage);
    setSavedDecisions((current) => ({ ...current, [stage]: { decision, comments } }));
  };
  const resumeDecision = savedDecisions.resume?.decision || props.resumeDecision;
  const resumeComments = savedDecisions.resume?.comments || props.resumeComments;
  const voiceDecision = savedDecisions.voice?.decision || props.voiceDecision;
  const voiceComments = savedDecisions.voice?.comments || props.voiceComments;
  const finalDecision = savedDecisions.final?.decision || props.finalInterviewStatus;
  const finalComments = savedDecisions.final?.comments || props.finalComments;
  return <section className="card applicant-decision-card"><div className="card-header"><div><h2>HR Decisions</h2><p>Review the applicant&apos;s current workflow stage. Comments are required for every decision.</p></div></div>{message && <ActionFeedback kind="success" className="applicant-decision-success">{message}</ActionFeedback>}<div className="applicant-decision-list">
    {stage === "resume" && (isDecided(resumeDecision) ? <CompletedDecision title="AI CV Analysis" decision={resumeDecision} comments={resumeComments} /> : <DecisionRow stage="resume" title="AI CV Analysis" description="Review Ella&apos;s CV analysis recommendation before moving the applicant to the voice interview." current={resumeDecision} applicationId={props.applicationId} canReview={props.canReview} onSaved={saveDecision} />)}
    {stage === "voice" && <><CompletedDecision title="AI CV Analysis" decision={resumeDecision} comments={resumeComments} />{isDecided(voiceDecision) ? <CompletedDecision title="Voice Interview Review" decision={voiceDecision} comments={voiceComments} link={props.finalBookingLink} /> : <DecisionRow stage="voice" title="Voice Interview Review" description="Review the combined screening evidence below before approving the applicant for the next stage." current={voiceDecision} link={props.voiceBookingLink} applicationId={props.applicationId} canReview={props.canReview} canSendBookingLink={props.canManage} onSaved={saveDecision} />}</>}
    {stage === "final" && <><CompletedDecision title="Voice Interview Review" decision={voiceDecision} comments={voiceComments} />{isDecided(props.finalStatus) || isDecided(finalDecision) ? <CompletedDecision title="Face-to-Face Interview Decision" decision={props.finalStatus || finalDecision} comments={finalComments} /> : <DecisionRow stage="final" title="Face-to-Face Interview Decision" description="Record the Face-to-Face interview outcome after the interviewer has completed the meeting." current={finalDecision === "Interview Completed" ? "" : finalDecision} enabled applicationId={props.applicationId} canReview={props.canReview} onSaved={saveDecision} />}</>}
  </div></section>;
}
