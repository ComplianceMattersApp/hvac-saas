"use client";

import type { CSSProperties, ReactNode } from "react";
import { advanceJobStatusFromForm } from "@/lib/actions/job-actions";
import ImmediateSubmitButton from "@/components/ImmediateSubmitButton";

type FieldStatusAdvanceFormProps = {
  jobId: string;
  returnTo: string;
  currentStatus: string;
  hasFullSchedule: boolean;
  buttonStyle?: CSSProperties;
  children: ReactNode;
};

export default function FieldStatusAdvanceForm({
  jobId,
  returnTo,
  currentStatus,
  hasFullSchedule,
  buttonStyle,
  children,
}: FieldStatusAdvanceFormProps) {
  return (
    <form
      action={advanceJobStatusFromForm}
      onSubmit={(event) => {
        const needsScheduleConfirm = currentStatus === "open" && !hasFullSchedule;
        if (!needsScheduleConfirm) return;

        const confirmed = window.confirm(
          "This job is not fully scheduled. Marking On the Way will schedule a 2-hour window starting now and mark the tech on the way. Continue?"
        );

        if (!confirmed) {
          event.preventDefault();
          return;
        }

        const hidden = event.currentTarget.querySelector(
          'input[name="auto_schedule_confirmed"]'
        ) as HTMLInputElement | null;
        if (hidden) hidden.value = "1";
      }}
    >
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="auto_schedule_confirmed" value="0" />
      <ImmediateSubmitButton
        pendingText="Updating..."
        className=""
        style={{
          ...buttonStyle,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {children}
      </ImmediateSubmitButton>
    </form>
  );
}
