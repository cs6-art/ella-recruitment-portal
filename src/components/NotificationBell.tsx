"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import UiIcon from "./UiIcon";
import type { PortalNotification } from "@/lib/notifications";
import { notificationTimeAgo } from "@/lib/notification-format";

type FeedResponse = { notifications: PortalNotification[]; unreadCount: number };

// One shared, short-lived cache for every mounted bell (the desktop top bar
// and the mobile header each render one). This keeps navigation and the two
// instances down to a single network request per ~25s window.
const FEED_TTL_MS = 25_000;
const POLL_MS = 180_000;
let feedCache: { at: number; value: FeedResponse } | null = null;
let feedInFlight: Promise<FeedResponse> | null = null;
const feedListeners = new Set<(value: FeedResponse) => void>();

async function loadFeed(force = false): Promise<FeedResponse> {
  if (!force && feedCache && Date.now() - feedCache.at < FEED_TTL_MS) return feedCache.value;
  if (feedInFlight) return feedInFlight;
  feedInFlight = (async () => {
    try {
      const response = await fetch("/api/notifications", { credentials: "same-origin", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      const value: FeedResponse = {
        notifications: Array.isArray(data?.notifications) ? data.notifications : [],
        unreadCount: Number(data?.unreadCount) || 0,
      };
      feedCache = { at: Date.now(), value };
      feedListeners.forEach((listener) => listener(value));
      return value;
    } finally {
      feedInFlight = null;
    }
  })();
  return feedInFlight;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<FeedResponse>(() => feedCache?.value ?? { notifications: [], unreadCount: 0 });
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const listener = (value: FeedResponse) => setFeed(value);
    feedListeners.add(listener);
    void loadFeed();
    return () => { feedListeners.delete(listener); };
  }, []);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void loadFeed(true); };
    const interval = window.setInterval(refresh, POLL_MS);
    window.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

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
      await loadFeed(true);
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
