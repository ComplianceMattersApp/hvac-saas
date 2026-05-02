"use client";

import { advanceJobStatusFromForm } from "@/lib/actions/job-actions";
import { useFormStatus } from "react-dom";

type JobFieldActionButtonProps = {
  jobId: string;
  currentStatus: string;
  tab: string;
  hasFullSchedule: boolean;
};

function FieldActionSubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-10 w-full items-center justify-center whitespace-nowrap rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_28px_-20px_rgba(37,99,235,0.42)] transition-[background-color,box-shadow,transform] hover:bg-blue-700 hover:shadow-[0_18px_30px_-20px_rgba(37,99,235,0.48)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function JobFieldActionButton({
  jobId,
  currentStatus,
  tab,
  hasFullSchedule,
}: JobFieldActionButtonProps) {
  const isDone = ["completed", "failed", "cancelled"].includes(currentStatus);

  const label =
    currentStatus === "open"
      ? "Mark On the Way"
      : currentStatus === "on_the_way"
      ? "Mark In Progress"
      : currentStatus === "in_process"
      ? "Mark Job Complete"
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
      <span className="inline-flex min-h-10 w-full items-center justify-center whitespace-nowrap rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_24px_-18px_rgba(5,150,105,0.34)] sm:w-auto">
        ✓ Field visit complete
      </span>
    );
  }

  return (
    <form
      className="min-w-[9.5rem] flex-1 sm:w-auto sm:min-w-0 sm:flex-none"
      action={advanceJobStatusFromForm}
      onSubmit={(e) => {
        const needsScheduleConfirm = currentStatus === "open" && !hasFullSchedule;
        if (!needsScheduleConfirm) return;

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
      }}
    >
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="current_status" value={currentStatus} />
      <input type="hidden" name="tab" value={tab} />
      <input type="hidden" name="auto_schedule_confirmed" value="0" />

      <FieldActionSubmitButton label={label} pendingLabel={pendingLabel} />
    </form>
  );
}