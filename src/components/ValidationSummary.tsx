"use client";

import { useEffect, useRef, type RefObject } from "react";

import UiIcon from "@/components/UiIcon";

export type ValidationIssue = {
  field?: string;
  label: string;
  message: string;
  href?: string;
};

type ValidationSummaryProps = {
  error: string;
  issues?: ValidationIssue[];
  title?: string;
  summaryRef?: RefObject<HTMLDivElement | null>;
};

export default function ValidationSummary({ error, issues = [], title = "Submission failed", summaryRef }: ValidationSummaryProps) {
  const fallbackRef = useRef<HTMLDivElement>(null);
  const resolvedRef = summaryRef || fallbackRef;

  useEffect(() => {
    if (!error) return;
    const frame = window.requestAnimationFrame(() => {
      resolvedRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      resolvedRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [error, issues.length, resolvedRef]);

  if (!error) return null;

  const heading = issues.length > 0
    ? `${issues.length} ${issues.length === 1 ? "field needs" : "fields need"} your attention`
    : title;

  return <div ref={resolvedRef} className="error-box message-box validation-summary" role="alert" tabIndex={-1} aria-label="Form errors">
    <span className="message-box-icon" aria-hidden="true"><UiIcon name="alert" size={17} /></span>
    <div className="message-box-body">
      <strong className="message-box-title">{heading}</strong>
      <p className="message-box-text">{error}</p>
      {issues.length > 0 && <ul className="field-error-list">
        {issues.map((issue, index) => {
          const content = <><span className="field-error-link-label">{issue.label}</span><span className="field-error-link-text">{issue.message}</span></>;
          return <li key={`${issue.field || issue.label}-${index}`}>{issue.href ? <a href={issue.href}>{content}</a> : <div className="field-error-list-row">{content}</div>}</li>;
        })}
      </ul>}
    </div>
  </div>;
}
