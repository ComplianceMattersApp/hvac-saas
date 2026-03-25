"use client";

import { advanceJobStatusFromForm } from "@/lib/actions/job-actions";
import { useFormStatus } from "react-dom";

type JobFieldActionButtonProps = {
  jobId: string;
  currentStatus: string;
  tab: string;
  hasFullSchedule: boolean;
};

function FieldActionSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full min-h-11 inline-flex items-center justify-center rounded-md border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {pending ? "Updating..." : label}
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
      ? "On the way"
      : currentStatus === "on_the_way"
      ? "In progress"
      : currentStatus === "in_process"
      ? "Job completed"
      : "—";

  if (isDone) {
    return (
      <span className="w-full min-h-10 inline-flex items-center justify-center rounded-md border border-green-600 bg-green-600 px-4 text-sm font-semibold text-white shadow-sm sm:w-auto">
        ✓ Field visit complete
      </span>
    );
  }

  return (
    <form
      className="w-full sm:w-auto"
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

      <FieldActionSubmitButton label={label} />
    </form>
  );
}