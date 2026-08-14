"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import ActionFeedback from "@/components/ActionFeedback";
import type { InterviewBooking } from "@/lib/candidate-applications";
import type { RoleRequestSummary } from "@/lib/google-sheets";
import InfoTip from "@/components/InfoTip";
import Pagination from "@/components/Pagination";
import UiIcon from "@/components/UiIcon";
import { parseHodAvailabilitySlots, type HodAvailabilitySlot } from "@/lib/hod-availability";

function dateKey(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
}

function dateLabel(value: string) {
  const parsed = new Date(`${dateKey(value)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value || "Not provided" : new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(parsed);
}

function statusClass(value: string) { return `booking-status booking-status-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`; }
function hasStarted(booking: InterviewBooking) {
  const parsed = new Date(`${dateKey(booking.date)}T${booking.startTime || "00:00"}:00`);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now();
}
function monthLabel(value: Date) { return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(value); }
function calendarDays(month: Date) { const first = new Date(month.getFullYear(), month.getMonth(), 1); const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(); return [...Array.from({ length: first.getDay() }, () => null), ...Array.from({ length: count }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1))]; }

type FormState = { interviewType: "AI Voice Interview" | "Final Interview"; roleId: string; date: string; startTime: string; endTime: string; timezone: string };
type BookingRole = Pick<RoleRequestSummary, "roleId" | "jobTitle" | "hodEmail" | "hodAvailabilitySlots">;
type CalendarAvailability = HodAvailabilitySlot & { roleId: string };
const initialForm: FormState = { interviewType: "AI Voice Interview", roleId: "", date: "", startTime: "09:00", endTime: "09:30", timezone: "Asia/Singapore" };

function CalendarPanel({ kind, month, bookings, availability, selectedDate, selectedKind, onSelectDate }: { kind: "voice" | "final"; month: Date; bookings: InterviewBooking[]; availability: CalendarAvailability[]; selectedDate: string; selectedKind: "voice" | "final" | ""; onSelectDate: (date: string, kind: "voice" | "final") => void }) {
  const days = calendarDays(month);
  const byDate = bookings.reduce<Map<string, InterviewBooking[]>>((map, booking) => { const key = dateKey(booking.date); map.set(key, [...(map.get(key) || []), booking]); return map; }, new Map());
  const availabilityByDate = availability.reduce<Map<string, CalendarAvailability[]>>((map, slot) => { map.set(slot.date, [...(map.get(slot.date) || []), slot]); return map; }, new Map());
  const title = kind === "voice" ? "AI Voice Interview" : "Final Interview";
  const subtitle = kind === "voice" ? "Ella's voice screening schedule." : "HR's next interview schedule.";
  const booked = bookings.filter((booking) => booking.status.toLowerCase() === "booked").length;
  const available = bookings.filter((booking) => booking.status.toLowerCase() === "available").length;
  return <section className={`card booking-calendar-card booking-calendar-${kind}`}><div className="calendar-panel-heading"><div><span className="calendar-panel-kicker">{kind === "voice" ? "VOICE SCREENING" : "HR INTERVIEW"}</span><div className="calendar-panel-title"><h2>{title} Calendar</h2><InfoTip label={`About the ${title} calendar`}>{kind === "voice" ? "Candidates use these available times to book their AI voice screening." : "Final-interview dates follow the HOD availability configured for each role. Google Calendar conflicts are checked before a slot is added."}</InfoTip></div><p>{subtitle}</p><span className="calendar-availability-note"><span aria-hidden="true" /> Dates with open slots show <strong>Available</strong>.{kind === "final" && <><span className="calendar-hod-legend" aria-hidden="true" /> HOD windows show <strong>HOD window</strong>.</>}</span></div><div className="calendar-panel-counts"><span><UiIcon name="clock" size={13} /><b>{available}</b> Available</span><span><UiIcon name="check" size={13} /><b>{booked}</b> Booked</span>{kind === "final" && <span><UiIcon name="calendar" size={13} /><b>{availabilityByDate.size}</b> HOD dates</span>}</div></div><div className="booking-calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div><div className="booking-calendar-grid">{days.map((day, index) => { const key = day ? new Intl.DateTimeFormat("en-CA").format(day) : `empty-${index}`; const events = day ? byDate.get(key) || [] : []; const dateAvailability = day ? availabilityByDate.get(key) || [] : []; const hasAvailable = events.some((booking) => booking.status.toLowerCase() === "available"); const today = day && new Intl.DateTimeFormat("en-CA").format(day) === new Intl.DateTimeFormat("en-CA").format(new Date()); const isSelected = selectedKind === kind && selectedDate === key; return <div className={`booking-calendar-day ${!day ? "is-empty" : ""} ${today ? "is-today" : ""} ${isSelected ? "is-selected" : ""}`} key={key}>{day && <button type="button" className="calendar-day-button" aria-label={`View ${title} events for ${dateLabel(key)}`} aria-pressed={isSelected} onClick={() => onSelectDate(key, kind)}><strong className="calendar-day-number">{day.getDate()}</strong><div className="calendar-day-events">{dateAvailability.length > 0 && <span className="calendar-day-hod-availability">HOD window</span>}{hasAvailable && <span className="calendar-day-availability">Available</span>}{events.slice(0, 3).map((booking) => <div className={`calendar-event ${booking.status.toLowerCase() === "booked" ? "is-booked" : "is-available"}`} key={booking.slotId}><b>{booking.startTime}</b><span>{booking.roleId || "Role"}</span><small>{booking.candidateName || "Available slot"}</small></div>)}{events.length > 3 && <small className="calendar-more">+{events.length - 3} more</small>}</div></button>}</div>; })}</div></section>;
}

function BookingDetails({ date, kind, bookings, availability, onClose, onUpdated }: { date: string; kind: "voice" | "final"; bookings: InterviewBooking[]; availability: CalendarAvailability[]; onClose: () => void; onUpdated: (slotId: string) => void }) {
  const booked = bookings.filter((booking) => booking.status.toLowerCase() === "booked").length;
  const available = bookings.filter((booking) => booking.status.toLowerCase() === "available").length;
  const dateAvailability = availability.filter((slot) => slot.date === date);
  const title = kind === "voice" ? "AI Voice Interview" : "Final Interview";
  return <div className="booking-modal-backdrop" role="presentation" onClick={onClose}><section className={`booking-modal booking-modal-${kind}`} role="dialog" aria-modal="true" aria-labelledby="selected-booking-title" onClick={(event) => event.stopPropagation()}><div className="selected-booking-header"><div><span className="calendar-panel-kicker">{title.toUpperCase()} - SELECTED DATE</span><h2 id="selected-booking-title">{dateLabel(date)}</h2><p>{bookings.length} {title} option{bookings.length === 1 ? "" : "s"} for this date.</p></div><div className="selected-booking-header-actions"><div className="selected-booking-counts"><span className="count-pill count-pill-booked"><UiIcon name="check" size={13} />{booked} Booked</span><span className="count-pill count-pill-available"><UiIcon name="clock" size={13} />{available} Available</span></div><button type="button" className="booking-modal-close" aria-label="Close event details" onClick={onClose}><UiIcon name="close" size={19} /></button></div></div>{bookings.length === 0 ? <div className="selected-booking-empty">{dateAvailability.length > 0 ? <><UiIcon name="calendar" size={22} /><div><strong>HOD availability is configured for this date.</strong>{dateAvailability.map((slot) => <span className="selected-booking-availability" key={`${slot.roleId}-${slot.startTime}-${slot.endTime}`}>{slot.roleId}: {slot.startTime}–{slot.endTime} ({slot.timezone})</span>)}<span>Create a final-interview slot within this window.</span></div></> : <><UiIcon name="calendar" size={22} /><span>No {title.toLowerCase()} events on this date.</span></>}</div> : <div className="selected-booking-list">{bookings.map((booking) => <article className={`selected-booking-item ${booking.status.toLowerCase() === "booked" ? "is-booked" : "is-available"}`} key={booking.slotId}><div className="selected-booking-icon"><UiIcon name={booking.interviewType.toLowerCase().includes("voice") ? "microphone" : "briefcase"} size={19} /></div><div className="selected-booking-main"><div className="selected-booking-title"><strong>{booking.roleId || "Role Not Provided"}</strong><span className={statusClass(booking.status)}>{booking.status || "Not Set"}</span></div><p>{booking.interviewType} - {booking.startTime || "Time not provided"} to {booking.endTime || "End time not provided"} - {booking.timezone || "Timezone not provided"}</p><div className="selected-booking-meta"><span><UiIcon name="profile" size={14} />{booking.candidateName || "Awaiting Candidate Booking"}</span>{booking.candidateEmail && <span>{booking.candidateEmail}</span>}<span><UiIcon name="calendar" size={14} />{booking.slotId}</span></div>{booking.applicationId && <Link className="selected-booking-link" href={`/applicants/${encodeURIComponent(booking.applicationId)}`} onClick={onClose}>View Applicant Details</Link>}{booking.status.toLowerCase() === "booked" && booking.applicationId && hasStarted(booking) && <NoShowAction booking={booking} onUpdated={onUpdated} />}</div></article>)}</div>}</section></div>;
}

function NoShowAction({ booking, onUpdated }: { booking: InterviewBooking; onUpdated: (slotId: string) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (!window.confirm("Mark this scheduled interview as No Show?")) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/bookings/${encodeURIComponent(booking.slotId)}/status`, { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to mark interview as No Show.");
      onUpdated(booking.slotId);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update status."); }
    finally { setSaving(false); }
  }
  return <div className="booking-no-show-action"><button type="button" className="booking-inline-action" disabled={saving} onClick={() => void submit()}>{saving ? "Saving..." : "Mark No Show"}</button>{error && <ActionFeedback kind="error">{error}</ActionFeedback>}</div>;
}

export default function BookingsList({ bookings: initialBookings, roles }: { bookings: InterviewBooking[]; roles: BookingRole[] }) {
  const [bookings, setBookings] = useState(initialBookings);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedKind, setSelectedKind] = useState<"voice" | "final" | "">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All Statuses");
  const [calendarRole, setCalendarRole] = useState("All Roles");
  const [showAvailability, setShowAvailability] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const statuses = useMemo(() => [...new Set(bookings.map((booking) => booking.status).filter(Boolean))].sort(), [bookings]);
  const roleOptions = useMemo(() => roles.filter((role) => role.roleId.trim()).sort((left, right) => left.roleId.localeCompare(right.roleId)), [roles]);
  const selectedRole = roleOptions.find((role) => role.roleId.toLowerCase() === form.roleId.toLowerCase());
  const selectedHodWindows = useMemo(() => selectedRole ? parseHodAvailabilitySlots(selectedRole.hodAvailabilitySlots) : [], [selectedRole]);
  const selectedDateWindows = selectedHodWindows.filter((slot) => slot.date === form.date && slot.timezone === form.timezone);
  const calendarAvailability = useMemo<CalendarAvailability[]>(() => roleOptions
    .filter((role) => calendarRole === "All Roles" || role.roleId.toLowerCase() === calendarRole.toLowerCase())
    .flatMap((role) => parseHodAvailabilitySlots(role.hodAvailabilitySlots).map((slot) => ({ ...slot, roleId: role.roleId }))), [roleOptions, calendarRole]);
  const filtered = useMemo(() => { const query = search.trim().toLowerCase(); return bookings.filter((booking) => (!query || `${booking.slotId} ${booking.applicationId} ${booking.candidateName} ${booking.candidateEmail} ${booking.roleId}`.toLowerCase().includes(query)) && (status === "All Statuses" || booking.status === status)); }, [bookings, search, status]);
  const calendarBookings = useMemo(() => calendarRole === "All Roles" ? bookings : bookings.filter((booking) => booking.roleId.trim().toLowerCase() === calendarRole.trim().toLowerCase()), [bookings, calendarRole]);
  const voiceBookings = calendarBookings.filter((booking) => booking.interviewType.toLowerCase().includes("voice"));
  const finalBookings = calendarBookings.filter((booking) => booking.interviewType.toLowerCase().includes("final"));
  const selectedBookings = selectedDate && selectedKind ? calendarBookings.filter((booking) => dateKey(booking.date) === selectedDate && (selectedKind === "voice" ? booking.interviewType.toLowerCase().includes("voice") : booking.interviewType.toLowerCase().includes("final"))) : [];
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const booked = bookings.filter((booking) => booking.status.toLowerCase() === "booked").length;
  const available = bookings.filter((booking) => booking.status.toLowerCase() === "available").length;
  const voice = bookings.filter((booking) => booking.interviewType.toLowerCase().includes("voice")).length;
  const final = bookings.filter((booking) => booking.interviewType.toLowerCase().includes("final")).length;

  function updateForm<Key extends keyof FormState>(key: Key, value: FormState[Key]) { setForm((current) => ({ ...current, [key]: value })); }
  function changeInterviewType(value: FormState["interviewType"]) {
    if (value === "Final Interview") {
      const role = roleOptions.find((item) => item.roleId.toLowerCase() === form.roleId.toLowerCase());
      const windows = role ? parseHodAvailabilitySlots(role.hodAvailabilitySlots) : [];
      const first = windows[0];
      setForm((current) => ({ ...current, interviewType: value, date: first?.date || "", timezone: first?.timezone || current.timezone }));
      return;
    }
    setForm((current) => ({ ...current, interviewType: value }));
  }
  function changeRole(value: string) {
    const role = roleOptions.find((item) => item.roleId.toLowerCase() === value.toLowerCase());
    const windows = form.interviewType === "Final Interview" && role ? parseHodAvailabilitySlots(role.hodAvailabilitySlots) : [];
    const first = windows[0];
    setForm((current) => ({ ...current, roleId: value, date: first?.date || (current.interviewType === "Final Interview" ? "" : current.date), timezone: first?.timezone || current.timezone }));
  }
  function changeFinalDate(value: string) {
    const firstWindow = selectedHodWindows.find((slot) => slot.date === value);
    setForm((current) => ({ ...current, date: value, timezone: firstWindow?.timezone || current.timezone }));
  }
  function finalSlotFitsAvailability() {
    return selectedHodWindows.some((slot) => slot.date === form.date && slot.timezone === form.timezone && form.startTime >= slot.startTime && form.endTime <= slot.endTime);
  }
  function changeMonth(nextMonth: Date) { setMonth(nextMonth); setSelectedDate(""); setSelectedKind(""); }
  function changeCalendarRole(value: string) { setCalendarRole(value); setSelectedDate(""); setSelectedKind(""); }
  function selectDate(date: string, kind: "voice" | "final") { setSelectedDate(date); setSelectedKind(kind); }
  async function addAvailability(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(""); setMessage(""); try { if (form.interviewType === "Final Interview" && selectedHodWindows.length === 0) throw new Error("Set HOD availability for this role before adding a final-interview slot."); if (form.interviewType === "Final Interview" && !finalSlotFitsAvailability()) throw new Error("Choose a date and time inside the HOD availability window for this role."); const response = await fetch("/api/bookings/slots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || "Unable to create availability."); setBookings((current) => [...current, data.slot].sort((left, right) => `${left.date} ${left.startTime}`.localeCompare(`${right.date} ${right.startTime}`))); setMonth(new Date(`${form.date}T00:00:00`)); setSelectedDate(form.date); setForm(initialForm); setShowAvailability(false); setMessage("Interview availability added to the calendar."); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to create availability."); } finally { setSaving(false); } }

  return <main className="container page bookings-page">
    <header className="hero-row bookings-header"><div><span className="eyebrow-dark">INTERVIEW OPERATIONS</span><h1>Interview Calendars</h1><p>Manage separate schedules for AI Voice Interviews and Final Interviews.</p></div><div className="bookings-header-actions"><div className="bookings-header-meta"><strong>{booked}</strong><span>All Booked Appointments</span></div><button type="button" className="btn btn-primary" onClick={() => { setShowAvailability((current) => !current); setError(""); }}>{showAvailability ? "Close" : "+ Add Availability"}</button></div></header>
    {message && <ActionFeedback kind="success" className="booking-page-message">{message}</ActionFeedback>}
    {showAvailability && <section className="card availability-card"><div><span className="eyebrow-dark">HR SCHEDULING</span><h2>Add Interview Availability</h2><p>Create a bookable time for either interview calendar and assign it to an approved role.</p></div><form className="availability-form" onSubmit={(event) => void addAvailability(event)}><label>Interview Type<select value={form.interviewType} onChange={(event) => changeInterviewType(event.target.value as FormState["interviewType"])}><option>AI Voice Interview</option><option>Final Interview</option></select></label><label>Approved Role<select required value={form.roleId} onChange={(event) => changeRole(event.target.value)}><option value="">Select an approved role</option>{roleOptions.map((role) => <option value={role.roleId} key={role.roleId}>{role.jobTitle ? `${role.jobTitle} (${role.roleId})` : role.roleId}</option>)}</select></label>{form.interviewType === "Final Interview" && selectedRole ? <label>HOD availability date<select required value={form.date} onChange={(event) => changeFinalDate(event.target.value)}><option value="">Select a configured date</option>{[...new Set(selectedHodWindows.map((slot) => slot.date))].map((date) => <option value={date} key={date}>{dateLabel(date)}</option>)}</select></label> : <label>Date<input type="date" required value={form.date} onChange={(event) => updateForm("date", event.target.value)} /></label>}<label>Start Time<input type="time" required value={form.startTime} min={selectedDateWindows.length > 0 ? selectedDateWindows.reduce((min, slot) => slot.startTime < min ? slot.startTime : min, selectedDateWindows[0].startTime) : undefined} max={selectedDateWindows.length > 0 ? selectedDateWindows.reduce((max, slot) => slot.endTime > max ? slot.endTime : max, selectedDateWindows[0].endTime) : undefined} onChange={(event) => updateForm("startTime", event.target.value)} /></label><label>End Time<input type="time" required value={form.endTime} min={selectedDateWindows.length > 0 ? selectedDateWindows.reduce((min, slot) => slot.startTime < min ? slot.startTime : min, selectedDateWindows[0].startTime) : undefined} max={selectedDateWindows.length > 0 ? selectedDateWindows.reduce((max, slot) => slot.endTime > max ? slot.endTime : max, selectedDateWindows[0].endTime) : undefined} onChange={(event) => updateForm("endTime", event.target.value)} /></label><label>Timezone<select value={form.timezone} onChange={(event) => updateForm("timezone", event.target.value)}><option>Asia/Singapore</option><option>Asia/Manila</option><option>Asia/Hong_Kong</option><option>UTC</option><option>America/Los_Angeles</option></select></label>{form.interviewType === "Final Interview" && selectedRole && <div className="availability-hod-guidance">{selectedHodWindows.length > 0 ? <><strong>HOD availability</strong>{selectedDateWindows.length > 0 ? <span>{selectedDateWindows.map((slot) => `${slot.startTime}–${slot.endTime} (${slot.timezone})`).join(", ")}</span> : <span>Select a configured HOD date.</span>}</> : <span>No HOD availability is configured for this role.</span>}</div>}<div className="availability-form-actions">{roleOptions.length === 0 && <span className="form-help-text">No approved roles are available.</span>}{error && <ActionFeedback kind="error" className="booking-form-error">{error}</ActionFeedback>}<button type="submit" className="btn btn-primary" disabled={saving || roleOptions.length === 0 || (form.interviewType === "Final Interview" && (!selectedRole || selectedHodWindows.length === 0))}>{saving ? "Adding..." : "Add to Calendar"}</button></div></form></section>}
    <div className="booking-monitor-stats"><article><span><UiIcon name="calendar" size={15} />Total Slots</span><strong>{bookings.length}</strong><small>Across both calendars</small></article><article><span><UiIcon name="clock" size={15} />Available Slots</span><strong>{available}</strong><small>Open for candidates</small></article><article><span><UiIcon name="microphone" size={15} />AI Voice Slots</span><strong>{voice}</strong><small>{voiceBookings.filter((booking) => booking.status.toLowerCase() === "booked").length} Booked</small></article><article><span><UiIcon name="briefcase" size={15} />Final Interview Slots</span><strong>{final}</strong><small>{finalBookings.filter((booking) => booking.status.toLowerCase() === "booked").length} Booked</small></article></div>
    <section className="calendar-navigation"><div><span>MONTHLY VIEW</span><strong>{monthLabel(month)}</strong></div><div className="calendar-navigation-actions"><label className="calendar-role-filter"><span>Calendar role</span><select aria-label="Filter calendar by role" value={calendarRole} onChange={(event) => changeCalendarRole(event.target.value)}><option>All Roles</option>{roleOptions.map((role) => <option value={role.roleId} key={role.roleId}>{role.jobTitle ? `${role.jobTitle} (${role.roleId})` : role.roleId}</option>)}</select></label><button type="button" className="btn btn-secondary" onClick={() => changeMonth(new Date())}>Today</button><button type="button" className="calendar-arrow" aria-label="Previous month" onClick={() => changeMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><button type="button" className="calendar-arrow" aria-label="Next month" onClick={() => changeMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button></div></section>
    <div className="booking-calendar-columns"><CalendarPanel kind="voice" month={month} bookings={voiceBookings} availability={[]} selectedDate={selectedDate} selectedKind={selectedKind} onSelectDate={selectDate} /><CalendarPanel kind="final" month={month} bookings={finalBookings} availability={calendarAvailability} selectedDate={selectedDate} selectedKind={selectedKind} onSelectDate={selectDate} /></div>
    {!selectedDate && <div className="calendar-selection-hint"><UiIcon name="calendar" size={18} /><span>Select a calendar date to view its interview details.</span></div>}
    {selectedDate && selectedKind && <BookingDetails date={selectedDate} kind={selectedKind} bookings={selectedBookings} availability={selectedKind === "final" ? calendarAvailability : []} onClose={() => { setSelectedDate(""); setSelectedKind(""); }} onUpdated={(slotId) => { setBookings((current) => current.map((booking) => booking.slotId === slotId ? { ...booking, status: "No Show" } : booking)); setSelectedDate(""); setSelectedKind(""); setMessage("Interview marked No Show."); }} />}
    <section className="card bookings-card"><div className="bookings-toolbar"><div><h2>All Interview Slots</h2><span>{filtered.length} matching slot{filtered.length === 1 ? "" : "s"}</span></div><div className="bookings-filters"><input aria-label="Search bookings" placeholder="Search candidate, role, or slot" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /><select aria-label="Filter by booking status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option>All Statuses</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select><label className="pagination-size-control">Rows<select aria-label="Bookings per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label></div></div>{visible.length === 0 ? <div className="empty">No interview slots match the current filters.</div> : <div className="table-wrap"><table className="bookings-table"><thead><tr><th>Interview</th><th>Candidate</th><th>Role</th><th>Date &amp; Time</th><th>Status</th><th>Application</th></tr></thead><tbody>{visible.map((booking) => <tr key={booking.slotId}><td><strong>{booking.interviewType || "Interview"}</strong><span className="applicant-subtext">{booking.slotId}</span></td><td>{booking.applicationId ? <Link className="applicant-name-link" href={`/applicants/${encodeURIComponent(booking.applicationId)}`}><strong>{booking.candidateName || "Candidate"}</strong><span>{booking.candidateEmail || "Email Not Provided"}</span></Link> : <span className="booking-unassigned">Awaiting Candidate Booking</span>}</td><td><strong>{booking.roleId || "Role Not Provided"}</strong></td><td><strong>{dateLabel(booking.date)}</strong><span className="applicant-subtext">{booking.startTime || "Time Not Provided"}–{booking.endTime || ""} {booking.timezone || ""}</span></td><td><span className={statusClass(booking.status)}>{booking.status || "Not Set"}</span></td><td>{booking.applicationId ? <Link href={`/applicants/${encodeURIComponent(booking.applicationId)}`}>View Applicant</Link> : "—"}</td></tr>)}</tbody></table></div>}{filtered.length > 0 && <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} pageSize={pageSize} onPageChange={setPage} />}</section>
  </main>;
}
