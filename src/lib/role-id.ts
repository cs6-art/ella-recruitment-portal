const ignoredWords = new Set([
  "a",
  "an",
  "and",
  "at",
  "for",
  "in",
  "of",
  "on",
  "the",
  "to",
  "with",
]);

/**
 * Creates the readable part of a role ID from its job title.
 * Customer Success Executive -> CSE
 */
export function roleCodeFromTitle(jobTitle: string): string {
  const words = jobTitle
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .match(/[A-Z0-9]+/g) ?? [];

  const meaningfulWords = words.filter((word) => !ignoredWords.has(word.toLowerCase()));
  const sourceWords = meaningfulWords.length > 0 ? meaningfulWords : words;
  const code = sourceWords.length > 1
    ? sourceWords.map((word) => word[0]).join("")
    : (sourceWords[0] ?? "ROLE").slice(0, 3);

  return (code || "ROLE").slice(0, 5);
}

/**
 * Allocates the next two-digit number for a role code. Existing UUID IDs are
 * intentionally ignored, so changing the format does not affect old links.
 */
export function generateRoleId(jobTitle: string, existingRoleIds: string[]): string {
  const code = roleCodeFromTitle(jobTitle);
  const escapedCode = code.replace(/[.*+?^${}()|[\[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedCode}(\\d+)$`, "i");
  const highest = existingRoleIds.reduce((max, roleId) => {
    const match = pattern.exec(roleId.trim());
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `${code}${String(highest + 1).padStart(2, "0")}`;
}
