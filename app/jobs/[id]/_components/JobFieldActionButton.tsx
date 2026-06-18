"use client";

import { advanceJobStatusFromForm } from "@/lib/actions/job-actions";
import { useState } from "react";
import { useFormStatus } from "react-dom";

type JobFieldActionButtonProps = {
  jobId: string;
  currentStatus: string;
  tab: string;
  hasFullSchedule: boolean;
  variant?: "default" | "fieldMode" | "commandBar";
  completeLabel?: string;
  completedLabel?: string;
};

function FieldActionSubmitButton({
  label,
  pendingLabel,
  submitted,
  variant = "default",
}: {
  label: string;
  pendingLabel: string;
  submitted: boolean;
  variant?: "default" | "fieldMode" | "commandBar";
}) {
  const { pending } = useFormStatus();
  const isPending = pending || submitted;
  const className =
    variant === "fieldMode"
      ? "inline-flex min-h-14 w-full items-center justify-center whitespace-nowrap rounded-xl border border-blue-700 bg-blue-700 px-5 py-3 text-base font-semibold text-white shadow-[0_18px_34px_-22px_rgba(29,78,216,0.5)] transition-[background-color,box-shadow,transform] hover:bg-blue-800 hover:shadow-[0_20px_36px_-22px_rgba(29,78,216,0.56)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
      : variant === "commandBar"
      ? "inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_28px_-20px_rgba(37,99,235,0.42)] transition-[background-color,box-shadow,transform] hover:bg-blue-700 hover:shadow-[0_18px_30px_-20px_rgba(37,99,235,0.48)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
      : "inline-flex min-h-10 w-full items-center justify-center whitespace-nowrap rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_28px_-20px_rgba(37,99,235,0.42)] transition-[background-color,box-shadow,transform] hover:bg-blue-700 hover:shadow-[0_18px_30px_-20px_rgba(37,99,235,0.48)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

  return (
    <button
      type="submit"
      disabled={isPending}
      aria-busy={isPending}
      aria-live="polite"
      className={className}
    >
      {isPending ? (
        <span className="inline-flex items-center justify-center gap-2">
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
          <span>{pendingLabel}</span>
        </span>
      ) : (
        label
      )}
    </button>
  );
}

export function JobFieldActionButton({
  jobId,
  currentStatus,
  tab,
  hasFullSchedule,
  variant = "default",
  completeLabel = "Complete Field Work",
  completedLabel = "Field visit complete",
}: JobFieldActionButtonProps) {
  const [submitted, setSubmitted] = useState(false);
  const isDone = ["completed", "failed", "cancelled"].includes(currentStatus);

  const label =
    currentStatus === "open"
      ? "Mark On the Way"
      : currentStatus === "on_the_way"
      ? "Mark In Progress"
      : currentStatus === "in_process"
      ? completeLabel
      : "—";

  const pendingLabel =
    currentStatus === "open"
      ? "Marking on the way..."
      : currentStatus === "on_the_way"
      ? "Marking in progress..."
      : currentStatus === "in_process"
      ? "Marking complete..."
      : "Updating...";

  if (isDone) {
    return (
      <span className={variant === "fieldMode" ? "inline-flex min-h-14 w-full items-center justify-center whitespace-nowrap rounded-xl border border-emerald-700 bg-emerald-700 px-5 py-3 text-base font-semibold text-white shadow-[0_18px_34px_-24px_rgba(4,120,87,0.45)]" : "inline-flex min-h-10 w-full items-center justify-center whitespace-nowrap rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_24px_-18px_rgba(5,150,105,0.34)] sm:w-auto"}>
        ✓ {completedLabel}
      </span>
    );
  }

  return (
    <form
      className={variant === "fieldMode" ? "w-full" : variant === "commandBar" ? "w-auto flex-none" : "min-w-[9.5rem] flex-1 sm:w-auto sm:min-w-0 sm:flex-none"}
      action={advanceJobStatusFromForm}
      onSubmit={(e) => {
        if (submitted) {
          e.preventDefault();
          return;
        }

        const needsScheduleConfirm = currentStatus === "open" && !hasFullSchedule;
        if (!needsScheduleConfirm) {
          setSubmitted(true);
          return;
        }

        const confirmed = window.confirm(
          "This job is missing a full schedule. Press OK to auto-fill today with a 2-hour window starting now and continue to On the way."
        );

        if (!confirmed) {
          e.preventDefault();
          return;
        }

        const form = e.currentTarget;
        const hidden = form.querySelector(
          'input[name="auto_schedule_confirmed"]'
        ) as HTMLInputElement | null;

        if (hidden) hidden.value = "1";
        setSubmitted(true);
      }}
    >
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="current_status" value={currentStatus} />
      <input type="hidden" name="tab" value={tab} />
      <input type="hidden" name="auto_schedule_confirmed" value="0" />

      <FieldActionSubmitButton label={label} pendingLabel={pendingLabel} submitted={submitted} variant={variant} />
    </form>
  );
}
