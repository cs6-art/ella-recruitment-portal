"use client";

import { useState } from "react";

type Slot = { slotId: string; date: string; startTime: string; endTime: string; timezone: string };
type Context = { kind: "voice" | "final"; candidateName: string; selectedRole: string; bookingStatus: string; scheduledDate: string; scheduledTime: string; timezone: string; slots: Slot[] };

function displayDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

export default function BookingSelector({ token, initialContext }: { token: string; initialContext: Context }) {
  const [context, setContext] = useState(initialContext);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const title = context.kind === "voice" ? "AI Voice Interview Booking" : "Final Interview Booking";

  async function reserve() {
    if (!selected) { setError("Select an available time first."); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/public/bookings/${context.kind}/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slotId: selected }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "This slot is no longer available.");
      setContext(data.booking); setSelected("");
    } catch (bookingError) { setError(bookingError instanceof Error ? bookingError.message : "Unable to complete booking."); }
    finally { setSaving(false); }
  }

  const booked = context.bookingStatus.toLowerCase() === "used" || context.bookingStatus.toLowerCase().includes("scheduled") || context.bookingStatus.toLowerCase() === "booked" || Boolean(context.scheduledDate);
  return <main className="booking-page"><section className="booking-card">
    <div className="booking-brand"><span className="booking-brand-mark">M</span><span><strong>McLink</strong><small>Recruitment Portal</small></span></div>
    <div className="booking-eyebrow">{title}</div><h1>Choose a time that works for you</h1><p className="booking-intro">Hi {context.candidateName || "there"}. Select an available slot for your <strong>{context.selectedRole || "interview"}</strong>.</p>
    {booked ? <div className="booking-confirmed"><div className="booking-confirmed-icon">✓</div><h2>Your interview is scheduled</h2><p>{context.scheduledDate ? displayDate(context.scheduledDate) : "Your selected date"} · {context.scheduledTime || "Time confirmed"} {context.timezone || ""}</p><small>You may close this page. The recruitment team has received your booking.</small></div> : <>
      <div className="booking-section-heading"><h2>Available times</h2><span>{context.slots.length} slots</span></div>
      {context.slots.length === 0 ? <div className="booking-empty">There are no available times right now. Please contact the recruitment team for a new booking link.</div> : <div className="booking-slot-grid">{context.slots.map((slot) => <button type="button" className={`booking-slot ${selected === slot.slotId ? "booking-slot-selected" : ""}`} key={slot.slotId} onClick={() => setSelected(slot.slotId)}><strong>{displayDate(slot.date)}</strong><span>{slot.startTime}–{slot.endTime}</span><small>{slot.timezone}</small></button>)}</div>}
      {error && <p className="booking-error" role="alert">{error}</p>}<button type="button" className="booking-submit" disabled={saving || !selected || context.slots.length === 0} onClick={() => void reserve()}>{saving ? "Confirming…" : "Confirm interview time"}</button>
    </>}
    <p className="booking-help">Need help? Reply to the interview invitation email.</p>
  </section></main>;
}
