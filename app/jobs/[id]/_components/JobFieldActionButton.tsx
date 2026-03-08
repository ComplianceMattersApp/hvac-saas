"use client";

import { advanceJobStatusFromForm } from "@/lib/actions/job-actions";

type JobFieldActionButtonProps = {
  jobId: string;
  currentStatus: string;
  tab: string;
  hasFullSchedule: boolean;
};

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
      <span className="inline-flex h-10 items-center rounded-md border border-green-600 bg-green-600 px-4 text-sm font-semibold text-white shadow-sm">
        ✓ Field visit complete
      </span>
    );
  }

  return (
    <form
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

      <button
        type="submit"
        className="inline-flex h-10 items-center justify-center rounded-md border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
      >
        {label}
      </button>
    </form>
  );
}