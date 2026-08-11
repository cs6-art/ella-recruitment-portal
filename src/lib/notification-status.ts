export type NotificationStatus = "sent" | "pending" | "not_configured" | "failed";

export function notificationPresentation(status: string, error?: string) {
  if (status === "sent") return { message: "Update completed and notification sent.", warning: undefined };
  const message = status === "pending"
    ? "Update completed. Notification is pending."
    : status === "failed"
      ? "Update completed, but the notification could not be sent."
      : "Update completed, but email notification is not configured.";
  return { message, warning: error || undefined };
}
