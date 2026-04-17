// app/jobs/[id]/_components/ServiceStatusActions.tsx

import type { BillingMode } from "@/lib/business/internal-business-profile";
import { markServiceComplete, markInvoiceSent } from "@/lib/actions/service-actions";
import { createClient } from "@/lib/supabase/server";
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

export default async function ServiceStatusActions({
  jobId,
  billingMode,
}: {
  jobId: string;
  billingMode: BillingMode;
}) {
  const supabase = await createClient();

  // Read the job so we only show these controls for Service jobs
  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, job_type, ops_status, invoice_number")
    .eq("id", jobId)
    .single();

  if (error) {
    // Fail soft: don't break the job page
    return (
      <div className="rounded-xl border p-4 text-sm">
        Could not load job for service actions.
      </div>
    );
  }

  if (job.job_type !== "service") return null;

  // Bind server actions to this jobId (so the form submit passes the id)
  const completeAction = markServiceComplete.bind(null, jobId);
  const invoiceSentAction = markInvoiceSent.bind(null, jobId);
  const isInternalInvoicing = billingMode === "internal_invoicing";

  return (
    <section className="rounded-xl border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Service Closeout</h2>
          <p className="mt-1 text-xs text-neutral-600">
            These update <b>ops_status</b> and do not affect the Tests page.
          </p>
          <div className="mt-2 text-xs">
            Current status: <b>{formatOpsStatusLabel(job.ops_status)}</b>
          </div>
        </div>
      </div>

      <div className={`mt-4 grid grid-cols-1 gap-2 ${isInternalInvoicing ? "" : "sm:grid-cols-2"}`}>
        <form action={completeAction}>
          <SubmitButton
            loadingText="Updating..."
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50"
          >
            Mark Service Complete → Invoice Required
          </SubmitButton>
        </form>

        {!isInternalInvoicing ? (
          <form action={invoiceSentAction}>
            <SubmitButton
              loadingText="Updating..."
              className="w-full rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
            >
              Mark Invoice Sent → Closed
            </SubmitButton>
          </form>
        ) : null}
      </div>

      {isInternalInvoicing ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs leading-5 text-amber-900">
          Internal invoicing mode is enabled for this company. The lightweight external billing action is hidden here
          because billing closeout runs through the job-linked internal invoice workflow.
        </div>
      ) : null}

      <p className="mt-3 text-xs text-neutral-500">
        Note: manual locks (<b>pending_info</b>, <b>on_hold</b>) will prevent automation from overwriting.
      </p>
    </section>
  );
}
