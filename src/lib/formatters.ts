export function formatEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}
