// app/jobs/[id]/_components/ServiceStatusActions.tsx

import { markServiceComplete, markInvoiceSent } from "@/lib/actions/service-actions";
import { createClient } from "@/lib/supabase/server";

export default async function ServiceStatusActions({ jobId }: { jobId: string }) {
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

  return (
    <section className="rounded-xl border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Service Closeout</h2>
          <p className="mt-1 text-xs text-neutral-600">
            These update <b>ops_status</b> and do not affect the Tests page.
          </p>
          <div className="mt-2 text-xs">
            Current ops_status: <b>{job.ops_status}</b>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <form action={completeAction}>
          <button
            type="submit"
            className="w-full rounded-lg border px-3 py-2 text-sm font-medium"
          >
            Mark Service Complete → Invoice Required
          </button>
        </form>

        <form action={invoiceSentAction}>
          <button
            type="submit"
            className="w-full rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white"
          >
            Mark Invoice Sent → Closed
          </button>
        </form>
      </div>

      <p className="mt-3 text-xs text-neutral-500">
        Note: manual locks (<b>pending_info</b>, <b>on_hold</b>) will prevent automation from overwriting.
      </p>
    </section>
  );
}
