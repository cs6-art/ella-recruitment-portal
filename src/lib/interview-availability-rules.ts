import { parseVoiceInterviewSlots, type VoiceInterviewSlot } from "@/lib/voice-interview-availability";
import { parseHodAvailabilitySlots } from "@/lib/hod-availability";
import { scheduledInstant } from "@/lib/interview-time";

export const availabilityStatuses = ["Available", "Booked", "Blocked", "Expired", "Cancelled"] as const;
export type AvailabilityStatus = typeof availabilityStatuses[number];
export type InterviewAvailabilityRule = {
  ruleId: string;
  roleId: string;
  interviewType: "AI Voice Interview" | "Final Interview";
  mode: "recurring" | "specific";
  startDate: string;
  endDate: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  timezone: string;
  specificSlots: VoiceInterviewSlot[];
  status: "Active" | "Archived";
  createdAt?: string;
  updatedAt?: string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function text(value: unknown) { return String(value ?? "").trim(); }
function hash(value: string) { let result = 2166136261; for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619); return (result >>> 0).toString(16).padStart(8, "0"); }
function dateParts(value: string) { const [year, month, day] = value.split("-").map(Number); return { year, month, day }; }
function addDays(value: string, days: number) { const p = dateParts(value); const date = new Date(Date.UTC(p.year, p.month - 1, p.day + days)); return date.toISOString().slice(0, 10); }
function weekday(value: string) { const p = dateParts(value); return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(); }
function minutes(value: string) { const [hours, mins] = value.split(":").map(Number); return hours * 60 + mins; }
function time(value: number) { return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`; }
function validTimezone(value: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return value; } catch { return "Asia/Singapore"; }
}
function todayInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function stableRuleId(rule: Pick<InterviewAvailabilityRule, "roleId" | "interviewType" | "mode" | "startDate" | "endDate" | "startTime" | "endTime" | "timezone">) {
  return `RULE-${hash(JSON.stringify(rule)).toUpperCase()}`;
}

export function parseAvailabilityRules(value: unknown): InterviewAvailabilityRule[] {
  let candidate = value;
  if (typeof value === "string") {
    if (!value.trim()) return [];
    try { candidate = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(candidate)) return [];
  return candidate.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const source = raw as Partial<InterviewAvailabilityRule>;
    const specificSlots = Array.isArray(source.specificSlots)
      ? parseVoiceInterviewSlots(source.specificSlots)
      : [];
    const rule = {
      ruleId: text(source.ruleId),
      roleId: text(source.roleId),
      interviewType: source.interviewType,
      mode: source.mode,
      startDate: text(source.startDate),
      endDate: text(source.endDate),
      weekdays: Array.isArray(source.weekdays) ? source.weekdays.map(Number).filter((day) => day >= 0 && day <= 6) : [],
      startTime: text(source.startTime),
      endTime: text(source.endTime),
      slotDurationMinutes: source.interviewType === "AI Voice Interview" && source.mode === "recurring" ? 10 : Number(source.slotDurationMinutes || 30),
      timezone: text(source.timezone) || "Asia/Singapore",
      specificSlots,
      status: source.status === "Archived" ? "Archived" : "Active",
      createdAt: text(source.createdAt) || undefined,
      updatedAt: text(source.updatedAt) || undefined,
    } as InterviewAvailabilityRule;
    if (!rule.roleId || (rule.interviewType !== "AI Voice Interview" && rule.interviewType !== "Final Interview")) return [];
    if (rule.mode !== "recurring" && rule.mode !== "specific") return [];
    if (rule.mode === "recurring" && (!DATE.test(rule.startDate) || !DATE.test(rule.endDate) || rule.startDate > rule.endDate || !TIME.test(rule.startTime) || !TIME.test(rule.endTime) || rule.startTime >= rule.endTime || rule.weekdays.length === 0)) return [];
    if (rule.mode === "specific" && specificSlots.length === 0) return [];
    if (!rule.ruleId) rule.ruleId = stableRuleId(rule);
    return [rule];
  });
}

export function serializeAvailabilityRules(value: unknown) { return JSON.stringify(parseAvailabilityRules(value)); }

/**
 * Availability is only useful before the role's target hiring date. Keep this
 * rule in the shared slot generator so the admin calendar and candidate link
 * always expose the same dates.
 */
export function isBeforeTargetHiringDate(date: string, targetHiringDate?: string) {
  return !DATE.test(text(targetHiringDate)) || date < text(targetHiringDate);
}

export function ruleToSlots(rule: InterviewAvailabilityRule, maxDays = 180): VoiceInterviewSlot[] {
  if (rule.status !== "Active") return [];
  if (rule.mode === "specific") return rule.specificSlots;
  // AI voice interviews use one consistent weekday window so every role has
  // predictable ten-minute times and the candidate calendar stays simple.
  const isVoiceInterview = rule.interviewType === "AI Voice Interview";
  const duration = isVoiceInterview ? 10 : Number.isInteger(rule.slotDurationMinutes) && rule.slotDurationMinutes >= 5 ? rule.slotDurationMinutes : 30;
  const startTime = isVoiceInterview ? 9 * 60 : minutes(rule.startTime);
  const endTime = isVoiceInterview ? 17 * 60 : minutes(rule.endTime);
  const weekdays = isVoiceInterview ? [1, 2, 3, 4, 5] : rule.weekdays;
  const result: VoiceInterviewSlot[] = [];
  const end = addDays(rule.startDate, Math.min(maxDays, 180));
  const lastDate = rule.endDate < end ? rule.endDate : end;
  for (let date = rule.startDate; date <= lastDate; date = addDays(date, 1)) {
    if (!weekdays.includes(weekday(date))) continue;
    for (let start = startTime; start + duration <= endTime; start += duration) {
      result.push({ date, startTime: time(start), endTime: time(start + duration), timezone: rule.timezone });
    }
  }
  return result;
}

export function roleAvailabilityRules(role: { roleId: string; targetHiringDate?: string; hodAvailabilitySlots?: string; voiceInterviewAvailabilityMode?: string; voiceInterviewSlots?: string; voiceInterviewAutoStartDate?: string; voiceInterviewAutoEndDate?: string; voiceInterviewTimezone?: string; interviewAvailabilityRules?: string }): InterviewAvailabilityRule[] {
  const stored = parseAvailabilityRules(role.interviewAvailabilityRules);
  const rules = [...stored];
  const hasVoiceRule = rules.some((rule) => rule.interviewType === "AI Voice Interview");
  if (!hasVoiceRule) {
    // Legacy roles without a stored rule inherit the standard voice schedule.
    const timezone = validTimezone(text(role.voiceInterviewTimezone) || "Asia/Singapore");
    const today = todayInTimezone(timezone);
    const configuredStart = DATE.test(role.voiceInterviewAutoStartDate || "") ? role.voiceInterviewAutoStartDate || today : today;
    const startDate = configuredStart > today ? configuredStart : today;
    const configuredEnd = DATE.test(role.voiceInterviewAutoEndDate || "") ? role.voiceInterviewAutoEndDate || "" : "";
    const endDate = configuredEnd >= startDate ? configuredEnd : addDays(startDate, 90);
    rules.push({ ruleId: `DEFAULT-VOICE-${role.roleId}`, roleId: role.roleId, interviewType: "AI Voice Interview", mode: "recurring", startDate, endDate, weekdays: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "17:00", slotDurationMinutes: 10, timezone, specificSlots: [], status: "Active" });
  }
  const hodSlots = parseHodAvailabilitySlots(role.hodAvailabilitySlots || "");
  const hasFinalRule = rules.some((rule) => rule.interviewType === "Final Interview");
  if (!hasFinalRule && hodSlots.length > 0) {
    rules.push({ ruleId: `LEGACY-FINAL-${role.roleId}`, roleId: role.roleId, interviewType: "Final Interview", mode: "specific", startDate: "", endDate: "", weekdays: [], startTime: "", endTime: "", slotDurationMinutes: 30, timezone: hodSlots[0].timezone, specificSlots: hodSlots, status: "Active" });
  }
  return rules;
}

export function virtualSlotsForRole(role: Parameters<typeof roleAvailabilityRules>[0], interviewType: "AI Voice Interview" | "Final Interview") {
  return roleAvailabilityRules(role).filter((rule) => rule.interviewType === interviewType).flatMap((rule) => ruleToSlots(rule).filter((slot) => isBeforeTargetHiringDate(slot.date, role.targetHiringDate)).map((slot) => ({
    slotId: `VIRTUAL-${hash(`${rule.ruleId}|${slot.date}|${slot.startTime}|${slot.endTime}|${slot.timezone}`).toUpperCase()}`,
    interviewType,
    roleId: role.roleId,
    ...slot,
    status: "Available" as const,
  })));
}

export function isVirtualSlotId(slotId: string) { return slotId.startsWith("VIRTUAL-"); }
export function slotKey(slot: { interviewType: string; roleId: string; date: string; startTime: string; endTime?: string; timezone?: string }) { return `${slot.interviewType}|${slot.roleId}|${slot.date}|${slot.startTime}|${slot.endTime || ""}|${slot.timezone || ""}`.toLowerCase(); }
export function isStandardVoiceInterviewSlot(slot: { interviewType: string; startTime: string; endTime: string }) {
  if (!slot.interviewType.toLowerCase().includes("voice")) return true;
  return slot.startTime >= "09:00" && slot.endTime <= "17:00" && minutes(slot.endTime) - minutes(slot.startTime) === 10;
}
export function hasValidFutureTime(slot: { date: string; startTime: string; timezone: string }) { try { return scheduledInstant(slot.date, slot.startTime, slot.timezone || "Asia/Singapore").getTime() > Date.now(); } catch { return false; } }
