/**
 * Keep authentication redirects inside this portal. Email links may carry an
 * intended destination, but that value must never become an open redirect.
 */
export function safeAuthRedirect(value: unknown): string {
  if (typeof value !== "string") return "/dashboard";

  const destination = value.trim();
  if (
    !destination.startsWith("/") ||
    destination.startsWith("//") ||
    destination.includes("\\")
  ) {
    return "/dashboard";
  }

  return destination;
}
