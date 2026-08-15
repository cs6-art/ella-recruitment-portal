"use client";

import { useEffect, useMemo, useState } from "react";

import ActionFeedback from "@/components/ActionFeedback";
import {
  parseHodAvailabilitySlots,
  type HodAvailabilitySlot,
} from "@/lib/hod-availability";

type DraftSlot = HodAvailabilitySlot;

type Props = {
  roleId: string;
  status: string;
  availability: string;
  editable: boolean;
  onSaved: () => void;
};

const emptySlot = (): DraftSlot => ({ date: "", startTime: "", endTime: "", timezone: "Asia/Singapore" });
function todayInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function slotsMatch(left: DraftSlot[], right: DraftSlot[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export default function HodAvailabilityEditor({ roleId, status, availability, editable, onSaved }: Props) {
  const initialSlots = useMemo(() => parseHodAvailabilitySlots(availability), [availability]);
  const [slots, setSlots] = useState<DraftSlot[]>(initialSlots);
  const [savedSlots, setSavedSlots] = useState<DraftSlot[]>(initialSlots);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setSlots(initialSlots);
    setSavedSlots(initialSlots);
  }, [initialSlots]);

  const isDirty = !slotsMatch(slots, savedSlots);

  function updateSlot(index: number, key: keyof DraftSlot, value: string) {
    setSlots((current) => current.map((slot, slotIndex) => slotIndex === index ? { ...slot, [key]: value } : slot));
    setMessage("");
    setError("");
  }

  function addSlot() {
    setSlots((current) => [...current, emptySlot()]);
    setMessage("");
    setError("");
  }

  function removeSlot(index: number) {
    setSlots((current) => current.filter((_, slotIndex) => slotIndex !== index));
    setMessage("");
    setError("");
  }

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      if (slots.some((slot) => !slot.date || !slot.startTime || !slot.endTime || slot.startTime >= slot.endTime)) {
        throw new Error("Complete or remove every HOD availability window before saving.");
      }
      const response = await fetch(`/api/roles/${encodeURIComponent(roleId)}/hod-availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots }),
      });
      const result = await response.json() as { success?: boolean; error?: string; message?: string };
      if (!response.ok || result.success !== true) throw new Error(result.error || "Unable to update HOD availability.");
      setSavedSlots(slots);
      setMessage(result.message || "HOD availability updated successfully.");
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update HOD availability.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="card role-section hod-availability-editor">
    <div className="card-header"><div><h2>HOD Interview Availability</h2><p className="role-section-subtitle">Update the windows HR can use for final-interview slots. Google Calendar is checked before a slot is added.</p></div><span className="status-badge status-active">{status === "Job Posted" ? "Published role" : "Editable"}</span></div>
    {message && <ActionFeedback kind="success">{message}</ActionFeedback>}
    {error && <ActionFeedback kind="error">{error}</ActionFeedback>}
    <div className="availability-entry-list">
      {slots.map((slot, index) => <div className="availability-entry" key={`${index}-${slot.date}-${slot.startTime}`}>
        <label>Date<input type="date" min={todayInputValue()} value={slot.date} disabled={!editable || saving} onChange={(event) => updateSlot(index, "date", event.target.value)} /></label>
        <label>Start time<input type="time" step="900" value={slot.startTime} disabled={!editable || saving} onChange={(event) => updateSlot(index, "startTime", event.target.value)} /></label>
        <label>End time<input type="time" step="900" value={slot.endTime} disabled={!editable || saving} onChange={(event) => updateSlot(index, "endTime", event.target.value)} /></label>
        <label>Timezone<select value={slot.timezone} disabled={!editable || saving} onChange={(event) => updateSlot(index, "timezone", event.target.value)}><option>Asia/Singapore</option><option>Asia/Manila</option><option>Asia/Hong_Kong</option><option>UTC</option><option>America/Los_Angeles</option></select></label>
        <button type="button" className="btn btn-secondary availability-entry-remove" disabled={!editable || saving} onClick={() => removeSlot(index)}>Remove</button>
      </div>)}
    </div>
    {slots.length === 0 && <p className="hod-availability-empty">No HOD availability windows are configured. Add a window before creating final-interview slots.</p>}
    <div className="hod-availability-actions"><button type="button" className="btn btn-secondary" disabled={!editable || saving || slots.length >= 50} onClick={addSlot}>+ Add availability window</button>{editable && isDirty && <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving..." : "Save HOD availability"}</button>}</div>
  </section>;
}
