"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  initiallyOpen: boolean;
};

export default function TodayWelcomeModal({ initiallyOpen }: Props) {
  const [open, setOpen] = useState(initiallyOpen);
  const [saving, setSaving] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        void dismiss();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, saving]);

  async function dismiss() {
    if (saving) return;
    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const existingMetadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
      const nextMetadata = {
        ...existingMetadata,
        today_dashboard_v1_welcome: {
          dismissed: true,
          dismissed_at: new Date().toISOString(),
          version: "v1",
        },
      };

      await supabase.auth.updateUser({ data: nextMetadata });
    } catch {
      // Keep this fail-open; do not block page interaction on metadata write issues.
    } finally {
      setOpen(false);
      setSaving(false);
    }
  }

  async function openOperations() {
    await dismiss();
    window.location.assign("/ops");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="today-welcome-title"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_44px_-28px_rgba(15,23,42,0.45)] sm:p-6"
      >
        <h2 id="today-welcome-title" className="text-lg font-semibold tracking-tight text-slate-950">
          Welcome to your new dashboard
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          Today is now your starting point for the day. It highlights your next best action,
          today&apos;s work, follow-ups, team coverage, and key business signals so you can start faster.
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Operations is still available when you need the full command center.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void dismiss()}
            disabled={saving}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Got it
          </button>
          <button
            type="button"
            onClick={() => void openOperations()}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Open Operations
          </button>
        </div>
      </div>
    </div>
  );
}
