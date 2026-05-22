// app/jobs/[id]/_components/ServiceStatusActions.tsx

import type { BillingMode } from "@/lib/business/internal-business-profile";
import { markServiceComplete, markInvoiceSent } from "@/lib/actions/service-actions";
import SubmitButton from "@/components/SubmitButton";

function formatOpsStatusLabel(value?: string | null) {
  const key = String(value ?? "").trim().toLowerCase();
  const labels: Record<string, string> = {
    need_to_schedule: "Need to Schedule",
    scheduled: "Scheduled",
    pending_info: "Pending Info",
    on_hold: "On Hold",
    failed: "Failed",
    retest_needed: "Retest Needed",
    paperwork_required: "Paperwork Required",
    invoice_required: "Invoice Required",
    closed: "Closed",
  };

  return labels[key] ?? "In Progress";
}

export default function ServiceStatusActions({
  jobId,
  billingMode,
  jobType,
  opsStatus,
}: {
  jobId: string;
  billingMode: BillingMode;
  jobType?: string | null;
  opsStatus?: string | null;
}) {
  // Only show these controls for Service jobs
  if (jobType !== "service") return null;

  // Bind server actions to this jobId (so the form submit passes the id)
  const completeAction = markServiceComplete.bind(null, jobId, `/jobs/${jobId}?tab=ops#service-closeout`);
  const invoiceSentAction = markInvoiceSent.bind(null, jobId, `/jobs/${jobId}?tab=ops#service-closeout`);
  const isInternalInvoicing = billingMode === "internal_invoicing";

  return (
    <section id="service-closeout" className="rounded-xl border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Service Closeout</h2>
          <p className="mt-1 text-xs text-neutral-600">
            These update <b>ops_status</b> and do not affect the Tests page.
          </p>
          <div className="mt-2 text-xs">
            Current status: <b>{formatOpsStatusLabel(opsStatus)}</b>
          </div>
        </div>
      </div>

      <div className={`mt-4 grid grid-cols-1 gap-2 ${isInternalInvoicing ? "" : "sm:grid-cols-2"}`}>
        <form action={completeAction}>
          <SubmitButton
            loadingText="Marking complete..."
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50"
          >
            Mark Service Complete → Invoice Required
          </SubmitButton>
        </form>

        {!isInternalInvoicing ? (
          <form action={invoiceSentAction}>
            <SubmitButton
              loadingText="Marking..."
              className="w-full rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
            >
              Mark External Billing Complete → Closed
            </SubmitButton>
          </form>
        ) : null}

      </div>

      {!isInternalInvoicing ? (
        <p className="mt-2 text-xs text-neutral-500">
          Mark external billing as complete when billing was handled outside Compliance Matters.{" "}
          To create and send invoices directly from jobs, an account admin can switch to{" "}
          <b>Internal invoicing</b> in{" "}
          <a href="/ops/admin/company-profile" className="underline underline-offset-2">
            Company Settings
          </a>
          .
        </p>
      ) : null}

      {isInternalInvoicing ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs leading-5 text-amber-900">
          Internal invoicing is enabled. Complete billing closure using the <b>Internal Invoice panel</b> below: create or review the draft, then issue and send. Payment recording is optional tracking-only and does not charge cards.
        </div>
      ) : null}

      <p className="mt-3 text-xs text-neutral-500">
        Note: manual locks (<b>pending_info</b>, <b>on_hold</b>) will prevent automation from overwriting.
      </p>
    </section>
  );
}
