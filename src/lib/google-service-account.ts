/**
 * Normalizes the service-account PEM as it is commonly stored in hosting
 * provider environment variables. Vercel may receive either real line
 * breaks, literal `\n` sequences, or a JSON-quoted value copied from the
 * Google service-account file.
 */
export function getGoogleServiceAccountPrivateKey(value = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY): string {
  let normalized = String(value || "").trim();

  if (
    normalized.length >= 2 &&
    ((normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'")))
  ) {
    const quoted = normalized.slice(1, -1);
    try {
      const parsed = JSON.parse(normalized);
      normalized = typeof parsed === "string" ? parsed : quoted;
    } catch {
      normalized = quoted;
    }
  }

  return normalized
    .replace(/\\\\n/g, "\\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .trim();
}
