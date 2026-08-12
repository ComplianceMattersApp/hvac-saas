"use client";

import type { CSSProperties } from "react";
import ImmediateSubmitButton from "@/components/ImmediateSubmitButton";
import {
  STATUS_ADVANCE_ERROR_MESSAGES,
  useInPlaceStatusAdvance,
} from "../../_components/useInPlaceStatusAdvance";

type FieldStatusAdvanceFormProps = {
  jobId: string;
  returnTo: string;
  currentStatus: string;
  hasFullSchedule: boolean;
  buttonStyle?: CSSProperties;
};

const ACTION_LABELS: Record<string, string> = {
  open: "Mark On the Way",
  on_the_way: "Mark On Site",
  in_process: "Finish Visit",
};

const PENDING_LABELS: Record<string, string> = {
  open: "Marking On The Way...",
  on_the_way: "Marking On Site...",
  in_process: "Finishing Visit...",
};

export default function FieldStatusAdvanceForm({
  jobId,
  returnTo,
  currentStatus,
  hasFullSchedule,
  buttonStyle,
}: FieldStatusAdvanceFormProps) {
  const { effectiveStatus, errorCode, submitAction } = useInPlaceStatusAdvance(currentStatus);
  const isDone = ["completed", "failed", "cancelled"].includes(effectiveStatus);

  if (isDone) {
    // Transient confirmed state: the background refresh replaces this section
    // with the terminal-state layout (permit/certs/etc.) once it lands.
    return (
      <span
        style={{
          ...buttonStyle,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "oklch(0.52 0.13 155)",
          borderColor: "oklch(0.52 0.13 155)",
        }}
      >
        ✓ Visit finished
      </span>
    );
  }

  return (
    <form action={submitAction}
      onSubmit={(event) => {
        const needsScheduleConfirm = effectiveStatus === "open" && !hasFullSchedule;
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
        pendingText={PENDING_LABELS[effectiveStatus] ?? "Updating..."}
        className=""
        style={{
          ...buttonStyle,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {ACTION_LABELS[effectiveStatus] ?? "—"}
      </ImmediateSubmitButton>
      {errorCode ? (
        <div
          role="alert"
          style={{
            marginTop: "6px",
            fontSize: "14px",
            lineHeight: 1.4,
            fontWeight: 500,
            color: "oklch(0.5 0.19 27)",
          }}
        >
          {STATUS_ADVANCE_ERROR_MESSAGES[errorCode] ?? STATUS_ADVANCE_ERROR_MESSAGES.status_update_failed}
        </div>
      ) : null}
    </form>
  );
}
