"use client";

import { useFormStatus } from "react-dom";
import { markMaintenanceAgreementVisitCountedFromForm } from "@/lib/maintenance-agreements/agreement-actions";

type MarkVisitCountedActionButtonProps = {
  jobId: string;
  linkId: string;
};

function SubmitInner() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_24px_-18px_rgba(5,150,105,0.34)] transition-[background-color,box-shadow,transform] hover:bg-emerald-700 hover:shadow-[0_16px_26px_-18px_rgba(5,150,105,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Marking counted..." : "Mark Visit Counted"}
    </button>
  );
}

export default function MarkVisitCountedActionButton({
  jobId,
  linkId,
}: MarkVisitCountedActionButtonProps) {
  return (
    <form
      action={markMaintenanceAgreementVisitCountedFromForm}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          "This will count this completed maintenance job as one used visit for this Service Plan. It will not create an invoice, collect payment, or advance the next due date. Continue?",
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
      className="inline-flex"
    >
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="maintenance_agreement_visit_link_id" value={linkId} />
      <SubmitInner />
    </form>
  );
}
