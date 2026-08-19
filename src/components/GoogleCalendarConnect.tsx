"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import ActionFeedback from "@/components/ActionFeedback";

type Status = "loading" | "connected" | "not_connected" | "error";
type NoticeKind = "success" | "warning" | "error";

export default function GoogleCalendarConnect() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [disconnecting, setDisconnecting] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeKind, setNoticeKind] = useState<NoticeKind>("success");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const calendarResult = params.get("calendar");
    const calendarReason = params.get("calendar_reason");
    if (calendarResult) {
      // The callback returns only a safe, human-readable reason; remove both
      // query values after displaying it so they are not retained in history.
      if (calendarResult === "connected") { setNotice("Google Calendar connected."); setNoticeKind("success"); }
      else if (calendarResult === "denied") { setNotice("Google Calendar connection was cancelled."); setNoticeKind("warning"); }
      else { setNotice(calendarReason || "Could not connect Google Calendar. Please try again."); setNoticeKind("error"); }
      const url = new URL(window.location.href);
      url.searchParams.delete("calendar");
      url.searchParams.delete("calendar_reason");
      window.history.replaceState({}, "", url.toString());
    }

    fetch("/api/auth/google-calendar/status")
      .then((res) => res.json())
      .then((data) => setStatus(data.success && data.connected ? "connected" : "not_connected"))
      .catch(() => { setStatus("error"); setNotice("Unable to check Google Calendar connection status."); setNoticeKind("error"); });
  }, []);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/auth/google-calendar/disconnect", { method: "POST" });
      if (res.ok) { setStatus("not_connected"); setNotice("Google Calendar disconnected successfully."); setNoticeKind("success"); router.refresh(); }
      else { setNotice("Could not disconnect Google Calendar. Please try again."); setNoticeKind("error"); }
    } finally {
      setDisconnecting(false);
    }
  }

  if (status === "loading") return null;

  return (
    <section className="card calendar-connect-card">
      <div className="card-header">
        <h2>Google Calendar</h2>
        {status === "connected" ? <span className="calendar-status-pill calendar-status-connected">Connected</span> : null}
      </div>
      <div className="calendar-connect-body">
        {notice ? <ActionFeedback kind={noticeKind} className="calendar-connect-notice">{notice}</ActionFeedback> : null}
        {status === "connected" ? (
          <>
            <p>Final interviews you&apos;re assigned to will be added to your primary Google Calendar automatically.</p>
            <button type="button" className="btn btn-secondary" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </>
        ) : (
          <>
            <p>Connect your Google Calendar so final interview slots you&apos;re scheduled for appear automatically, with candidate details included.</p>
            <a className="btn btn-primary" href="/api/auth/google-calendar/connect">
              Connect Google Calendar
            </a>
          </>
        )}
      </div>
    </section>
  );
}
