"use client";

import { useEffect, useState } from "react";

import type { PortalNotification } from "@/lib/notifications";

export type FeedResponse = { notifications: PortalNotification[]; unreadCount: number };

// One shared, short-lived cache for every consumer of the feed (the desktop top
// bar bell, the mobile header bell, and the sidebar Applicants badge). This keeps
// navigation and every mounted instance down to a single network request per
// ~25s window.
const FEED_TTL_MS = 25_000;
// Background poll cadence for the one consumer that opts in (the bell). The
// feed is an operational convenience, not a live decision surface, so a slow
// timer is enough — the timer only fires while the tab is visible, and a
// focus/visibilitychange refresh gives an immediate update when HR returns to
// the tab. Kept long to keep idle open tabs off the Sheets read path.
const POLL_MS = 900_000;
let feedCache: { at: number; value: FeedResponse } | null = null;
let feedInFlight: Promise<FeedResponse> | null = null;
const feedListeners = new Set<(value: FeedResponse) => void>();

export function cachedFeed(): FeedResponse {
  return feedCache?.value ?? { notifications: [], unreadCount: 0 };
}

export async function loadNotificationFeed(force = false): Promise<FeedResponse> {
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

// Subscribes to the shared feed. Pass `poll` on exactly one consumer per page
// (the bell) so the visibility/focus refresh timer isn't installed more than
// once; passive consumers just read the cache and live updates.
export function useNotificationFeed(options: { poll?: boolean } = {}): FeedResponse {
  const { poll = false } = options;
  const [feed, setFeed] = useState<FeedResponse>(cachedFeed);

  useEffect(() => {
    const listener = (value: FeedResponse) => setFeed(value);
    feedListeners.add(listener);
    void loadNotificationFeed();
    return () => { feedListeners.delete(listener); };
  }, []);

  useEffect(() => {
    if (!poll) return;
    // Timer: force past the short cache so a long-open visible tab still moves.
    const tick = () => { if (document.visibilityState === "visible") void loadNotificationFeed(true); };
    // Focus/visibility: refresh, but honour the 25s cache so rapid tab
    // switching cannot turn into a burst of Sheets reads.
    const onFocus = () => { if (document.visibilityState === "visible") void loadNotificationFeed(); };
    const interval = window.setInterval(tick, POLL_MS);
    window.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [poll]);

  return feed;
}
