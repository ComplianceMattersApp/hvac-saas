"use client";

import { useMemo, useState } from "react";

type InterruptState = "pending_info" | "on_hold" | "waiting";
type WaitingReasonType =
  | "waiting_on_part"
  | "waiting_on_customer_approval"
  | "estimate_needed"
  | "waiting_on_access"
  | "waiting_on_information"
  | "other";

type Props = {
  workspaceFieldLabelClass: string;
  workspaceInputClass: string;
  initialInterruptState: InterruptState | "";
  initialStatusReason: string;
  initialWaitingReasonType: WaitingReasonType;
  initialWaitingOtherReason: string;
};

const WAITING_REASON_OPTIONS: Array<{ value: WaitingReasonType; label: string }> = [
  { value: "waiting_on_part", label: "Waiting on part" },
  { value: "waiting_on_customer_approval", label: "Waiting on customer approval" },
  { value: "estimate_needed", label: "Estimate needed" },
  { value: "waiting_on_access", label: "Waiting on access" },
  { value: "waiting_on_information", label: "Waiting on information" },
  { value: "other", label: "Other" },
];

export default function InterruptStateFields(props: Props) {
  const [interruptState, setInterruptState] = useState<InterruptState | "">(props.initialInterruptState);
  const [waitingReasonType, setWaitingReasonType] = useState<WaitingReasonType>(props.initialWaitingReasonType);

  const waitingHelpText = useMemo(() => {
    if (waitingReasonType === "other") {
      return "Provide a custom waiting reason before saving.";
    }
    return "Select the reason that is currently blocking progress.";
  }, [waitingReasonType]);

  return (
    <>
      <label className={props.workspaceFieldLabelClass}>Interrupt State</label>
      <select
        name="interrupt_state"
        value={interruptState}
        onChange={(event) => setInterruptState(event.target.value as InterruptState | "")}
        required
        className={props.workspaceInputClass}
      >
        <option value="" disabled>
          Select interrupt state...
        </option>
        <option value="pending_info">Pending Info</option>
        <option value="on_hold">On Hold</option>
        <option value="waiting">Waiting</option>
      </select>

      {interruptState === "waiting" ? (
        <>
          <div className="mt-3">
            <label className={props.workspaceFieldLabelClass}>Reason</label>
            <select
              name="waiting_state_type"
              value={waitingReasonType}
              onChange={(event) => setWaitingReasonType(event.target.value as WaitingReasonType)}
              required
              className={props.workspaceInputClass}
            >
              {WAITING_REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-600">{waitingHelpText}</p>
          </div>

          {waitingReasonType === "other" ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-3">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-900">
                Custom Reason
              </label>
              <input
                name="waiting_other_reason"
                defaultValue={props.initialWaitingOtherReason}
                required
                className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm text-slate-900"
                placeholder="Describe what we are waiting on"
              />
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-3">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-900">
            Reason
          </label>
          <textarea
            name="status_reason"
            defaultValue={props.initialStatusReason}
            required
            className="min-h-[7rem] w-full rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm text-slate-900"
            rows={3}
            placeholder={
              interruptState === "on_hold"
                ? "Explain why this job is on hold"
                : "Describe what information is still needed"
            }
          />
          <p className="mt-2 text-xs text-amber-900/80">Required when Pending Info or On Hold is selected.</p>
        </div>
      )}
    </>
  );
}
