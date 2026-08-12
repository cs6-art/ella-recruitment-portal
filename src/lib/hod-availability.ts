export type HodAvailabilitySlot = {
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isHodAvailabilitySlot(value: unknown): value is HodAvailabilitySlot {
  if (!value || typeof value !== "object") return false;
  const slot = value as Partial<HodAvailabilitySlot>;
  return DATE_PATTERN.test(String(slot.date || ""))
    && TIME_PATTERN.test(String(slot.startTime || ""))
    && TIME_PATTERN.test(String(slot.endTime || ""))
    && String(slot.startTime) < String(slot.endTime)
    && Boolean(String(slot.timezone || "").trim());
}

export function parseHodAvailabilitySlots(value: string): HodAvailabilitySlot[] {
  if (!value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isHodAvailabilitySlot)
      .map((slot) => ({
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        timezone: slot.timezone.trim(),
      }));
  } catch {
    return [];
  }
}

export function serializeHodAvailabilitySlots(slots: HodAvailabilitySlot[]): string {
  return JSON.stringify(slots.filter(isHodAvailabilitySlot));
}

export function legacyAvailabilityDates(slots: HodAvailabilitySlot[]): string {
  return slots.filter(isHodAvailabilitySlot).map((slot) => slot.date).join("\n");
}

export function legacyAvailabilityTimes(slots: HodAvailabilitySlot[]): string {
  return slots
    .filter(isHodAvailabilitySlot)
    .map((slot) => `${slot.startTime}-${slot.endTime} (${slot.timezone})`)
    .join("\n");
}

export function slotMatchesHodAvailability(slot: HodAvailabilitySlot, availability: HodAvailabilitySlot[]): boolean {
  return availability.some((window) => window.date === slot.date
    && window.timezone === slot.timezone
    && slot.startTime >= window.startTime
    && slot.endTime <= window.endTime);
}
