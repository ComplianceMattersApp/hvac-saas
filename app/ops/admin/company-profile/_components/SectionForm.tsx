"use client";

import { useRef, useState, type ReactNode } from "react";
import SubmitButton from "@/components/SubmitButton";

/**
 * Wraps a per-section server-action form and reveals a sticky "Unsaved changes"
 * bar only after the user edits a field (design turn 14b). This is the one
 * net-new save affordance — the save itself is still the section's own server
 * action; nothing about the per-section save model changes.
 *
 * Server actions redirect on completion, so a successful save reloads the page
 * and the dirty state resets naturally.
 */
export function SectionForm({
  action,
  children,
  saveLabel = "Save changes",
  savingLabel = "Saving…",
  className = "",
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
  saveLabel?: string;
  savingLabel?: string;
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [dirty, setDirty] = useState(false);

  function handleDiscard() {
    formRef.current?.reset();
    setDirty(false);
  }

  return (
    <form
      ref={formRef}
      action={action}
      onInput={() => setDirty(true)}
      onChange={() => setDirty(true)}
      className={`space-y-5 ${className}`}
    >
      {children}

      {dirty ? (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_18px_38px_-24px_rgba(15,23,42,0.4)] backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <span className="text-sm font-medium text-[#0f1f35]">Unsaved changes</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDiscard}
              className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Discard
            </button>
            <SubmitButton
              loadingText={savingLabel}
              className="rounded-xl bg-blue-600 px-4.5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_30px_-22px_rgba(37,99,235,0.6)] hover:bg-blue-700"
            >
              {saveLabel}
            </SubmitButton>
          </div>
        </div>
      ) : null}
    </form>
  );
}
