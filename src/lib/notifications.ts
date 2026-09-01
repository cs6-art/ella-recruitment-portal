/**
 * In-app notification feed.
 *
 * Notifications are *derived*, not stored: they are computed on read from the
 * `High_Match_Profile` rows the portal already loads, so no n8n workflow or
 * event pipeline has to change. The only persisted state is per-user read
 * markers (see `google-sheets.ts`, `Notification_Reads` tab).
 *
 * This module is intentionally free of any Google/server imports so it can be
 * unit-tested directly and reused on both the API route and the page.
 */

export type PortalNotificationType =
  | "applicant_new"
  | "resume_screened"
  | "voice_completed"
  | "voice_review"
  | "final_booked"
  | "hr_review";

/** The minimal applicant shape the feed is built from. Carries `department`
 * so the existing `filterVisibleApplicants` access-control filter applies
 * unchanged. */
export type NotificationSourceRow = {
  applicationId: string;
  candidateName: string;
  roleId: string;
  roleLabel: string;
  department: string;
  dateOfApplication: string;
  lastUpdated: string;
  resumeStatus: string;
  recommendation: string;
  voiceStatus: string;
  voiceHrDecision: string;
  finalStatus: string;
  finalScheduledDate: string;
};

export type PortalNotification = {
  id: string;
  type: PortalNotificationType;
  title: string;
  message: string;
  candidateName: string;
  roleId: string;
  roleLabel: string;
  applicationId: string;
  href: string;
  timestamp: string;
  read: boolean;
};

export type NotificationReadState = {
  /** ISO timestamp of the last "mark all as read". */
  lastReadAllAt: string;
  /** Individually dismissed notification ids. */
  readIds: string[];
};

export const NOTIFICATION_LOOKBACK_DAYS = 21;
export const MAX_NOTIFICATIONS = 60;
/** Cap the per-user dismissed-id list so the sheet cell cannot grow forever. */
export const MAX_READ_IDS = 400;

const RESUME_SCREENED_STATUSES = new Set(["processed", "for hr review", "pending hr review"]);
const VOICE_DONE_STATUSES = new Set(["interviewed", "completed"]);
const HR_REVIEW_FINAL_STATUS = /for hr review|awaiting hr|needs hr review/i;

function parseTime(value: string): number {
  const parsed = Date.parse(String(value || "").trim());
  return Number.isFinite(parsed) ? parsed : NaN;
}

function firstTime(...values: string[]): { iso: string; ms: number } {
  for (const value of values) {
    const ms = parseTime(value);
    if (Number.isFinite(ms)) return { iso: new Date(ms).toISOString(), ms };
  }
  return { iso: "", ms: NaN };
}

/**
 * Turn applicant rows into a de-duplicated, newest-first notification list.
 * `read` is left `false` here; call `applyReadState` to resolve it.
 */
export function deriveNotifications(
  rows: NotificationSourceRow[],
  now: Date = new Date(),
): PortalNotification[] {
  const nowMs = now.getTime();
  const oldestMs = nowMs - NOTIFICATION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  // Sheets store dates without a timezone; allow a small forward skew.
  const newestMs = nowMs + 2 * 24 * 60 * 60 * 1000;

  const byId = new Map<string, PortalNotification>();

  const push = (
    row: NotificationSourceRow,
    type: PortalNotificationType,
    title: string,
    message: string,
    when: { iso: string; ms: number },
  ) => {
    if (!row.applicationId) return;
    if (!Number.isFinite(when.ms) || when.ms < oldestMs || when.ms > newestMs) return;
    const id = `${type}:${row.applicationId}`;
    const existing = byId.get(id);
    if (existing && Date.parse(existing.timestamp) >= when.ms) return;
    byId.set(id, {
      id,
      type,
      title,
      message,
      candidateName: row.candidateName,
      roleId: row.roleId,
      roleLabel: row.roleLabel || row.roleId,
      applicationId: row.applicationId,
      href: `/applicants/${encodeURIComponent(row.applicationId)}`,
      timestamp: when.iso,
      read: false,
    });
  };

  for (const row of rows) {
    const name = row.candidateName || "A candidate";
    const role = row.roleLabel || row.roleId || "a role";

    push(row, "applicant_new", "New applicant",
      `${name} applied for ${role}.`,
      firstTime(row.dateOfApplication));

    const resumeStatus = row.resumeStatus.trim().toLowerCase();
    if (RESUME_SCREENED_STATUSES.has(resumeStatus) && row.recommendation.trim()) {
      push(row, "resume_screened", "Resume screened",
        `${name} — ${row.recommendation.trim()}.`,
        firstTime(row.lastUpdated, row.dateOfApplication));
    }

    const voiceStatus = row.voiceStatus.trim().toLowerCase();
    const voiceDone = VOICE_DONE_STATUSES.has(voiceStatus) || voiceStatus.includes("interview completed");
    const voiceAwaitingReview = voiceDone && row.voiceHrDecision.trim().toLowerCase() === "pending";
    if (voiceAwaitingReview) {
      push(row, "voice_review", "Voice interview — action needed",
        `${name} completed the AI voice interview for ${role} and is waiting for your decision.`,
        firstTime(row.lastUpdated));
    } else if (voiceDone) {
      push(row, "voice_completed", "Voice interview completed",
        `${name} completed the AI voice interview for ${role}.`,
        firstTime(row.lastUpdated));
    }

    if (row.finalScheduledDate.trim()) {
      push(row, "final_booked", "Final interview booked",
        `${name} booked a final interview for ${role}.`,
        firstTime(row.finalScheduledDate, row.lastUpdated));
    }

    if (!voiceAwaitingReview && HR_REVIEW_FINAL_STATUS.test(row.finalStatus)) {
      push(row, "hr_review", "Needs HR review",
        `${name} — ${row.finalStatus.trim()}.`,
        firstTime(row.lastUpdated, row.dateOfApplication));
    }
  }

  return [...byId.values()]
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    .slice(0, MAX_NOTIFICATIONS);
}

/** Resolve `read` for each notification and return the unread total. */
export function applyReadState(
  notifications: PortalNotification[],
  state: NotificationReadState,
): { notifications: PortalNotification[]; unreadCount: number } {
  const lastReadAllMs = parseTime(state.lastReadAllAt);
  const readIds = new Set(state.readIds);
  let unreadCount = 0;
  const resolved = notifications.map((notification) => {
    const timestampMs = Date.parse(notification.timestamp);
    const read = readIds.has(notification.id)
      || (Number.isFinite(lastReadAllMs) && timestampMs <= lastReadAllMs);
    if (!read) unreadCount += 1;
    return { ...notification, read };
  });
  return { notifications: resolved, unreadCount };
}

export function emptyReadState(): NotificationReadState {
  return { lastReadAllAt: "", readIds: [] };
}

/** Merge a single "mark as read" into an existing read state. */
export function withNotificationRead(state: NotificationReadState, id: string): NotificationReadState {
  const readIds = [...state.readIds.filter((value) => value !== id), id].slice(-MAX_READ_IDS);
  return { lastReadAllAt: state.lastReadAllAt, readIds };
}

/** Produce the read state for a "mark all as read" at `now`. */
export function withAllNotificationsRead(now: Date = new Date()): NotificationReadState {
  return { lastReadAllAt: now.toISOString(), readIds: [] };
}
