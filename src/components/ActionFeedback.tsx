"use client";

import { useEffect, useRef, type ReactNode } from "react";

type FeedbackKind = "success" | "error" | "warning";

export default function ActionFeedback({ kind, children, className = "" }: { kind: FeedbackKind; children: ReactNode; className?: string }) {
  const feedbackRef = useRef<HTMLDivElement>(null);
  const role = kind === "error" ? "alert" : "status";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      feedbackRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [children]);

  return <div ref={feedbackRef} className={`${kind}-box action-feedback ${className}`.trim()} role={role} tabIndex={-1}>{children}</div>;
}
