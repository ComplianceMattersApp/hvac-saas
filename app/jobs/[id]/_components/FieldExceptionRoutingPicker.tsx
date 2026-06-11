"use client";

import { useState } from "react";

import ImmediateSubmitButton from "@/components/ImmediateSubmitButton";

type ExceptionReason = "parts" | "approval" | "unable";
type ServerFormAction = (formData: FormData) => void | Promise<void>;

type FieldExceptionRoutingPickerProps = {
  jobId: string;
  currentStatus: string;
  tab: string;
  showDifferentIssueFoundOutcome?: boolean;
  partsNeededAction: ServerFormAction;
  approvalNeededAction: ServerFormAction;
  unableToCompleteAction: ServerFormAction;
  differentIssueFoundAction: ServerFormAction;
};

const choiceButtonClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-amber-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 sm:w-auto";

const secondaryButtonClass =
  "inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 sm:w-auto";

const submitButtonClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100 sm:w-auto";

export default function FieldExceptionRoutingPicker(props: FieldExceptionRoutingPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState<ExceptionReason | null>(null);

  const closePanel = () => {
    setSelectedReason(null);
    setIsOpen(false);
  };

  const commonInputs = (
    <>
      <input type="hidden" name="job_id" value={props.jobId} />
      <input type="hidden" name="current_status" value={props.currentStatus} />
      <input type="hidden" name="tab" value={props.tab} />
    </>
  );

  return (
    <div className="mt-3">
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50/80 px-3 py-2.5 text-left transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-amber-950">Can&apos;t finish today?</span>
            <span className="mt-0.5 block text-xs leading-5 text-amber-900/90">
              Send this visit to office/dispatch for parts, approval, or review.
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-amber-900">Choose reason -&gt;</span>
        </button>
      ) : (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-3.5">
          {selectedReason === null ? (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-900/80">Choose a reason</p>
                <p className="mt-1 text-sm font-semibold text-amber-950">What is blocking completion?</p>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <button type="button" onClick={() => setSelectedReason("parts")} className={choiceButtonClass}>
                  Materials Needed
                </button>
                <button type="button" onClick={() => setSelectedReason("approval")} className={choiceButtonClass}>
                  Approval Needed
                </button>
                <button type="button" onClick={() => setSelectedReason("unable")} className={choiceButtonClass}>
                  Other
                </button>
              </div>
              <div className="mt-3 flex border-t border-amber-100 pt-3">
                <button type="button" onClick={closePanel} className={secondaryButtonClass}>
                  Cancel
                </button>
              </div>
            </>
          ) : null}

          {selectedReason === "parts" ? (
            <form action={props.partsNeededAction} className="space-y-3.5">
              {commonInputs}
              <div>
                <p className="text-sm font-semibold text-amber-950">Materials Needed</p>
                <p className="mt-1 text-xs leading-5 text-amber-900/90">Complete today&apos;s visit and hold follow-up for materials.</p>
              </div>
              <label className="grid gap-1.5 text-xs font-semibold text-slate-700">
                Reason
                <textarea
                  id={`parts-note-${props.jobId}`}
                  name="parts_note"
                  required
                  rows={3}
                  maxLength={280}
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-amber-200"
                  placeholder="What materials are needed?"
                />
              </label>
              <div className="flex flex-col gap-2 border-t border-amber-100 pt-3 sm:flex-row sm:flex-wrap">
                <ImmediateSubmitButton pendingText="Saving..." className={submitButtonClass}>
                  Complete Visit & Hold for Follow-Up
                </ImmediateSubmitButton>
                <button type="button" onClick={() => setSelectedReason(null)} className={secondaryButtonClass}>
                  Back
                </button>
                <button type="button" onClick={closePanel} className={secondaryButtonClass}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {selectedReason === "approval" ? (
            <form action={props.approvalNeededAction} className="space-y-3.5">
              {commonInputs}
              <div>
                <p className="text-sm font-semibold text-amber-950">Approval Needed</p>
                <p className="mt-1 text-xs leading-5 text-amber-900/90">Complete today&apos;s visit and hold follow-up for approval.</p>
              </div>
              <label className="grid gap-1.5 text-xs font-semibold text-slate-700">
                Reason
                <textarea
                  id={`approval-note-${props.jobId}`}
                  name="approval_note"
                  required
                  rows={3}
                  maxLength={280}
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-amber-200"
                  placeholder="Example: customer approval for repair, owner approval for added work"
                />
              </label>
              <div className="flex flex-col gap-2 border-t border-amber-100 pt-3 sm:flex-row sm:flex-wrap">
                <ImmediateSubmitButton pendingText="Saving..." className={submitButtonClass}>
                  Complete Visit & Hold for Follow-Up
                </ImmediateSubmitButton>
                <button type="button" onClick={() => setSelectedReason(null)} className={secondaryButtonClass}>
                  Back
                </button>
                <button type="button" onClick={closePanel} className={secondaryButtonClass}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {selectedReason === "unable" ? (
            <form action={props.unableToCompleteAction} className="space-y-3.5">
              {commonInputs}
              <div>
                <p className="text-sm font-semibold text-amber-950">Other</p>
                <p className="mt-1 text-xs leading-5 text-amber-900/90">Complete today&apos;s visit and hold follow-up for office review.</p>
              </div>
              <label className="grid gap-1.5 text-xs font-semibold text-slate-700">
                Reason
                <textarea
                  id={`unable-note-${props.jobId}`}
                  name="unable_note"
                  required
                  rows={3}
                  maxLength={280}
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-amber-200"
                  placeholder="Why does office or dispatch need to follow up?"
                />
              </label>
              <div className="flex flex-col gap-2 border-t border-amber-100 pt-3 sm:flex-row sm:flex-wrap">
                <ImmediateSubmitButton pendingText="Saving..." className={submitButtonClass}>
                  Complete Visit & Hold for Follow-Up
                </ImmediateSubmitButton>
                <button type="button" onClick={() => setSelectedReason(null)} className={secondaryButtonClass}>
                  Back
                </button>
                <button type="button" onClick={closePanel} className={secondaryButtonClass}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

        </div>
      )}
    </div>
  );
}
