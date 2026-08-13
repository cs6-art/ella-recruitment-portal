export function formatMatchScore(value: string | number) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";

  const hasPercentSign = raw.endsWith("%");
  const numeric = Number(raw.replace(/[% ,]/g, ""));
  if (!Number.isFinite(numeric)) return raw;

  // The sheet has historically contained fractions (0.85), whole scores
  // (85), and percentage-formatted values such as 2800%. Normalize all of
  // them to the same 0–100% display range.
  let percentage = hasPercentSign ? numeric : numeric <= 1 ? numeric * 100 : numeric;
  if (percentage > 100) percentage /= 100;
  percentage = Math.max(0, Math.min(100, percentage));

  return `${percentage % 1 === 0 ? percentage : percentage.toFixed(1)}%`;
}
