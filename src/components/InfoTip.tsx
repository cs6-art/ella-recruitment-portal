"use client";

import { useId, type ReactNode } from "react";

import UiIcon from "@/components/UiIcon";

type InfoTipProps = {
  label: string;
  children: ReactNode;
  placement?: "top" | "bottom";
};

/** A small, keyboard-accessible explanation for labels that may need context. */
export default function InfoTip({ label, children, placement = "top" }: InfoTipProps) {
  const tooltipId = useId();

  return (
    <span className={`info-tip info-tip-${placement}`}>
      <button
        type="button"
        className="info-tip-trigger"
        aria-label={label}
        aria-describedby={tooltipId}
      >
        <UiIcon name="info" size={14} />
      </button>
      <span id={tooltipId} className="info-tip-content" role="tooltip">
        {children}
      </span>
    </span>
  );
}
