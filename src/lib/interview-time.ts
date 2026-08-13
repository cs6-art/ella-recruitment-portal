/** Convert a local date/time in an IANA timezone to an absolute instant. */
export function scheduledInstant(date: string, time: string, timeZone: string): Date {
  const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  const normalizedTime = timeMatch
    ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}:${timeMatch[3] || "00"}`
    : time;
  const parsed = new Date(`${date}T${normalizedTime}Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error("Invalid interview date or time.");

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed);
  const values = Object.fromEntries(parts
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, part.value]));
  const shown = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  const desired = Date.parse(`${date}T${normalizedTime}Z`);
  return new Date(desired - (shown - desired));
}

export function isValidTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}
