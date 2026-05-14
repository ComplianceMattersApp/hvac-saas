"use client";

import { useFormStatus } from "react-dom";
import { confirmMaintenanceAgreementNextDueDateFromForm } from "@/lib/maintenance-agreements/agreement-actions";

type ConfirmNextDueDateActionButtonProps = {
  jobId: string;
  agreementId: string;
  suggestedNextDueDate: string;
  baselineNextDueDate: string;
  displayDate: string;
};

function SubmitInner() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_24px_-18px_rgba(37,99,235,0.34)] transition-[background-color,box-shadow,transform] hover:bg-blue-700 hover:shadow-[0_16px_26px_-18px_rgba(37,99,235,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Confirming..." : "Confirm Next Due Date"}
    </button>
  );
}

export default function ConfirmNextDueDateActionButton({
  jobId,
  agreementId,
  suggestedNextDueDate,
  baselineNextDueDate,
  displayDate,
}: ConfirmNextDueDateActionButtonProps) {
  return (
    <form
      action={confirmMaintenanceAgreementNextDueDateFromForm}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `This will update the Service Plan next due date to ${displayDate}. It will not create a job, schedule an appointment, create an invoice, collect payment, or renew the plan. Continue?`,
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
      className="inline-flex"
    >
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="agreement_id" value={agreementId} />
      <input type="hidden" name="suggested_next_due_date" value={suggestedNextDueDate} />
      <input type="hidden" name="baseline_next_due_date" value={baselineNextDueDate} />
      <SubmitInner />
    </form>
  );
}
