"use client";

import { useEffect } from "react";

import { loadNotificationFeed } from "./notification-feed";

/**
 * Opening an applicant's profile counts as "seeing" the new-applicant
 * notification for that record: clear it so the sidebar badge and the
 * highlighted row in the Applicants list both settle. Other notification types
 * for the same candidate (resume screened, voice review, …) are left untouched.
 */
export default function MarkApplicantViewed({ applicationId }: { applicationId: string }) {
  useEffect(() => {
    if (!applicationId) return;
    let cancelled = false;
    void (async () => {
      try {
        await fetch("/api/notifications/read", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: `applicant_new:${applicationId}` }),
        });
        if (!cancelled) await loadNotificationFeed(true);
      } catch {
        // A failed read-marker is non-critical; the badge just stays as-is.
      }
    })();
    return () => { cancelled = true; };
  }, [applicationId]);

  return null;
}
