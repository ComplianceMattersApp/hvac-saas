"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Right-side drawer for focused write flows (Replace, Edit) — spec §8.4/8.5.
 * Built on the native <dialog> element rather than a hand-rolled overlay: it
 * gets focus trapping, ::backdrop, and Escape-to-close for free, which the
 * two existing one-off modals in this app (TodayWelcomeModal,
 * ServicePlanCreateFlow) each had to reimplement themselves. This is the
 * first shared drawer/dialog primitive in the codebase — reuse it rather
 * than adding a third bespoke overlay.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        // Clicking the <dialog> element itself (not its content) is the
        // backdrop area — native <dialog> has no built-in click-outside close.
        if (event.target === ref.current) onClose();
      }}
      className="fixed top-0 bottom-0 left-auto right-0 m-0 h-full max-h-none w-full max-w-md rounded-none border-0 bg-transparent p-0 backdrop:bg-slate-900/40 open:animate-none"
    >
      <div className="flex h-full w-full flex-col bg-white shadow-[0_0_60px_-15px_rgba(15,23,42,0.35)]">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-navy">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </dialog>
  );
}
