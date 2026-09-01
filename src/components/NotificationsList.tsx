"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import type { PortalNotification } from "@/lib/notifications";
import { formatPortalDateTime } from "@/lib/portal-time";
import { notificationTimeAgo } from "@/lib/notification-format";

type Props = {
  initialNotifications: PortalNotification[];
  initialUnread: number;
};

export default function NotificationsList({ initialNotifications, initialUnread }: Props) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unread, setUnread] = useState(initialUnread);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/notifications", { credentials: "same-origin", cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data?.success) {
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnread(Number(data.unreadCount) || 0);
    }
  }, []);

  const markRead = useCallback(async (payload: { all: true } | { id: string }) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/notifications/read", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Unable to update notifications.");
      }
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update notifications.");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return (
    <main className="container page notifications-page">
      <div className="hero-row">
        <div>
          <span className="eyebrow-dark">RECRUITMENT PIPELINE</span>
          <h1>Notifications</h1>
          <p>{unread > 0 ? `${unread} unread notification${unread === 1 ? "" : "s"}.` : "You're all caught up."}</p>
        </div>
        <button type="button" className="btn btn-secondary" disabled={busy || unread === 0} onClick={() => void markRead({ all: true })}>
          Mark all as read
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <section className="card">
        {notifications.length === 0 ? (
          <div className="empty">No notifications yet. New applicants, screening results, and interview activity will show up here.</div>
        ) : (
          <ul className="notif-page-list">
            {notifications.map((notification) => (
              <li key={notification.id} className={`notif-page-item${notification.read ? "" : " is-unread"}`}>
                <span className="notif-item-dot" aria-hidden="true" />
                <div className="notif-page-body">
                  <Link href={notification.href} className="notif-page-title">{notification.title}</Link>
                  <p className="notif-page-message">{notification.message}</p>
                  <p className="notif-page-meta">
                    <span>{notification.roleLabel}</span>
                    <span title={formatPortalDateTime(notification.timestamp)}>{notificationTimeAgo(notification.timestamp)}</span>
                  </p>
                </div>
                {!notification.read && (
                  <button type="button" className="notif-linkbtn" disabled={busy} onClick={() => void markRead({ id: notification.id })}>
                    Mark as read
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
