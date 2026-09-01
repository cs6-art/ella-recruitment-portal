"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import UiIcon from "./UiIcon";
import { notificationTimeAgo } from "@/lib/notification-format";
import { loadNotificationFeed, useNotificationFeed } from "./notification-feed";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const feed = useNotificationFeed({ poll: true });
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markRead = useCallback(async (payload: { all: true } | { id: string }) => {
    setBusy(true);
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await loadNotificationFeed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  const preview = useMemo(() => feed.notifications.slice(0, 8), [feed.notifications]);
  const badge = feed.unreadCount > 9 ? "9+" : String(feed.unreadCount);

  return (
    <div className="notif-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="notif-bell"
        aria-label={feed.unreadCount > 0 ? `Notifications, ${feed.unreadCount} unread` : "Notifications"}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <UiIcon name="bell" />
        {feed.unreadCount > 0 && <span className="notif-badge" aria-hidden="true">{badge}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel-head">
            <strong>Notifications</strong>
            <button type="button" className="notif-linkbtn" disabled={busy || feed.unreadCount === 0} onClick={() => void markRead({ all: true })}>
              Mark all as read
            </button>
          </div>

          {preview.length === 0 ? (
            <p className="notif-empty">You&rsquo;re all caught up.</p>
          ) : (
            <ul className="notif-list">
              {preview.map((notification) => (
                <li key={notification.id}>
                  <Link
                    href={notification.href}
                    className={`notif-item${notification.read ? "" : " is-unread"}`}
                    onClick={() => {
                      setOpen(false);
                      if (!notification.read) void markRead({ id: notification.id });
                    }}
                  >
                    <span className="notif-item-dot" aria-hidden="true" />
                    <span className="notif-item-body">
                      <span className="notif-item-title">{notification.title}</span>
                      <span className="notif-item-message">{notification.message}</span>
                      <span className="notif-item-meta">{notificationTimeAgo(notification.timestamp)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Link href="/notifications" className="notif-panel-foot" onClick={() => setOpen(false)}>
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
