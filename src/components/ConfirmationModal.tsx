"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import UiIcon from "@/components/UiIcon";

type ConfirmationOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
};

type PendingConfirmation = Required<Pick<ConfirmationOptions, "message" | "confirmLabel" | "cancelLabel" | "tone">> & {
  title: string;
  resolve: (confirmed: boolean) => void;
};

type ConfirmationContextValue = {
  confirm: (options: ConfirmationOptions) => Promise<boolean>;
};

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null);

export function useConfirmation() {
  const context = useContext(ConfirmationContext);
  if (!context) throw new Error("useConfirmation must be used inside ConfirmationProvider");
  return context;
}

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const pendingRef = useRef<PendingConfirmation | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const finish = useCallback((confirmed: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(confirmed);
  }, []);

  const confirm = useCallback((options: ConfirmationOptions) => new Promise<boolean>((resolve) => {
    pendingRef.current?.resolve(false);
    const next: PendingConfirmation = {
      title: options.title || "Confirm action",
      message: options.message,
      confirmLabel: options.confirmLabel || "Confirm",
      cancelLabel: options.cancelLabel || "Cancel",
      tone: options.tone || "primary",
      resolve,
    };
    pendingRef.current = next;
    setPending(next);
  }), []);

  useEffect(() => {
    if (!pending) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => confirmButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [finish, pending]);

  useEffect(() => () => pendingRef.current?.resolve(false), []);

  return (
    <ConfirmationContext.Provider value={{ confirm }}>
      {children}
      {pending && (
        <div className="confirmation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) finish(false); }}>
          <section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="confirmation-modal-title" aria-describedby="confirmation-modal-message" onMouseDown={(event) => event.stopPropagation()}>
            <div className="confirmation-modal-header">
              <span className={`confirmation-modal-icon ${pending.tone}`} aria-hidden="true"><UiIcon name={pending.tone === "danger" ? "alert" : "info"} size={19} /></span>
              <div>
                <h2 id="confirmation-modal-title">{pending.title}</h2>
                <p id="confirmation-modal-message">{pending.message}</p>
              </div>
            </div>
            <div className="confirmation-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => finish(false)}>{pending.cancelLabel}</button>
              <button ref={confirmButtonRef} type="button" className={`btn ${pending.tone === "danger" ? "btn-danger" : "btn-primary"}`} onClick={() => finish(true)}>{pending.confirmLabel}</button>
            </div>
          </section>
        </div>
      )}
    </ConfirmationContext.Provider>
  );
}
