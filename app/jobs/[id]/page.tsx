
  import { createClient } from "@/lib/supabase/server";
  import { notFound } from "next/navigation";
  import {
    updateJobScheduleFromForm,
    advanceJobStatusFromForm,
    markJobFailedFromForm,
    updateJobCustomerFromForm,
    type JobStatus,
  } from "@/lib/actions/job-actions";

  function isoToDateInput(iso?: string | null) {
    if (!iso) return "";
    const d = new Date(iso);
    // scheduled_date is stored as noon Z, so this should be stable
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  }

  function isoToTimeInput(iso?: string | null) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toISOString().slice(11, 16); // HH:MM (UTC-based)
  }

  function formatStatus(status?: string | null) {
    const s = (status ?? "").toString();
    const map: Record<JobStatus, string> = {
      open: "Open",
      on_the_way: "On The Way",
      in_process: "In Process",
      completed: "Completed",
      failed: "Failed",
      cancelled: "Cancelled",
    };

    // If for any reason the DB has an unexpected string, show it as-is
    return (map as any)[s] ?? (s ? s : "—");
  }

  function nextStatusLabel(status?: string | null) {
    const s = (status ?? "open") as JobStatus;
    const nextMap: Record<JobStatus, string> = {
      open: "On The Way",
      on_the_way: "In Process",
      in_process: "Completed",
      completed: "Completed",
      failed: "Failed",
      cancelled: "Cancelled",
    };
    return nextMap[s] ?? "Next";
  }

  export default async function JobDetailPage({
    params,
  }: {
    params: Promise<{ id: string }>;
  }) {
    const { id } = await params;

    const supabase = await createClient();

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select(
        "id, title, city, status, scheduled_date, created_at, contractor_id, permit_number, window_start, window_end, customer_phone, on_the_way_at, customer_first_name, customer_last_name, customer_email, job_notes"
      )
      .eq("id", id)
      .single();

    if (jobError || !job) return notFound();

    let contractorName: string | null = null;

    if (job.contractor_id) {
      const { data: contractor } = await supabase
        .from("contractors")
        .select("name")
        .eq("id", job.contractor_id)
        .single();

      contractorName = contractor?.name ?? null;
    }

    const scheduledDateValue = isoToDateInput(job.scheduled_date);
    const windowStartValue = isoToTimeInput(job.window_start);
    const windowEndValue = isoToTimeInput(job.window_end);

    const isTerminal =
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "cancelled";

    return (
      <div className="p-6 max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">{job.title}</h1>
          <p className="text-sm text-gray-600">{job.city ?? "No city set"}</p>
        </div>

        {/* Summary */}
        <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
          <div className="grid gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Status</span>
              <span className="font-medium">{formatStatus(job.status)}</span>
              {job.job_notes ? (
  <div className="mt-4 border-t pt-4">
    <div className="text-xs text-gray-600 mb-1">Job Notes</div>
    <div className="text-sm whitespace-pre-wrap">{job.job_notes}</div>
  </div>
) : null}

            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Arrival Window</span>
              <span className="font-medium">
                {job.window_start && job.window_end
                  ? `${new Date(job.window_start).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })} – ${new Date(job.window_end).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}`
                  : "—"}
              </span>
            </div>
          <div className="flex justify-between">
    <span className="text-gray-600">Customer Phone</span>
    <span className="font-medium">{job.customer_phone ?? "—"}</span>
  </div>

<div className="flex justify-between">
  <span className="text-gray-600">Customer Name</span>
  <span className="font-medium">
    {job.customer_first_name || job.customer_last_name
      ? `${job.customer_first_name ?? ""} ${job.customer_last_name ?? ""}`.trim()
      : "—"}
  </span>
</div>

<div className="flex justify-between">
  <span className="text-gray-600">Customer Email</span>
  <span className="font-medium">{job.customer_email ?? "—"}</span>
</div>

  <div className="flex justify-between">
    <span className="text-gray-600">On The Way At</span>
    <span className="font-medium">
      {job.on_the_way_at ? new Date(job.on_the_way_at).toLocaleString() : "—"}
    </span>
  </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Permit Number</span>
              <span className="font-medium">{job.permit_number ?? "—"}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Scheduled Date</span>
              <span className="font-medium">
                {job.scheduled_date
                  ? new Date(job.scheduled_date).toLocaleDateString()
                  : "—"}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Created</span>
              <span className="font-medium">
                {job.created_at ? new Date(job.created_at).toLocaleString() : "—"}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Contractor</span>
              <span className="font-medium">{contractorName ?? "—"}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Job ID</span>
              <span className="font-mono text-xs text-gray-700 break-all">
                {job.id}
              </span>
            </div>
          </div>
        </div>

      {/* Edit Customer + Notes */}
      <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
        <h2 className="text-sm font-semibold mb-3">Edit Customer + Notes</h2>

        <form action={updateJobCustomerFromForm} className="grid gap-4">
          <input type="hidden" name="id" value={job.id} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                First Name
              </label>
              <input
                type="text"
                name="customer_first_name"
                defaultValue={job.customer_first_name ?? ""}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Last Name
              </label>
              <input
                type="text"
                name="customer_last_name"
                defaultValue={job.customer_last_name ?? ""}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Email</label>
              <input
                type="email"
                name="customer_email"
                defaultValue={job.customer_email ?? ""}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">Phone</label>
              <input
                type="tel"
                name="customer_phone"
                defaultValue={job.customer_phone ?? ""}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Notes</label>
            <textarea
              name="job_notes"
              defaultValue={job.job_notes ?? ""}
              rows={4}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end">
            <button className="border rounded px-3 py-2 text-sm">
              Save Customer Info
            </button>
          </div>
        </form>
      </div>

        {/* Workflow */}
        <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
          <h2 className="text-sm font-semibold mb-3">Workflow</h2>

          <div className="flex gap-3 flex-wrap items-center">
            <form action={advanceJobStatusFromForm}>
              <input type="hidden" name="id" value={job.id} />
              <input
                type="hidden"
                name="current_status"
                value={(job.status ?? "open") as JobStatus}
              />
              <button
                className="border rounded px-3 py-2 text-sm"
                disabled={isTerminal}
                title={
                  isTerminal
                    ? "Job is in a final status"
                    : `Advance to ${nextStatusLabel(job.status)}`
                }
              >
                {isTerminal ? "Status Final" : `Advance → ${nextStatusLabel(job.status)}`}
              </button>
            </form>

            <form action={markJobFailedFromForm}>
              <input type="hidden" name="id" value={job.id} />
              <button
                className="border rounded px-3 py-2 text-sm"
                disabled={job.status === "failed"}
                title="Mark ECC failure for this job"
              >
                Mark Failed (ECC)
              </button>
            </form>
          </div>

          <p className="text-xs text-gray-600 mt-2">
            Flow: Open → On The Way → In Process → Completed (or Failed).
          </p>
        </div>

        {/* Inline Edit Scheduling */}
        <div className="rounded-lg border bg-white p-4 text-gray-900">
          <h2 className="text-sm font-semibold mb-3 scroll-mt-24" id="schedule">
            Edit Scheduling
          </h2>

          <form action={updateJobScheduleFromForm} className="grid gap-4">
            <input type="hidden" name="id" value={job.id} />

            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Scheduled Date
              </label>
              <input
                type="date"
                name="scheduled_date"
                defaultValue={scheduledDateValue}
                className="w-full border rounded px-3 py-2 text-sm"
                required
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Window Start (optional)
                </label>
                <input
                  type="time"
                  name="window_start"
                  defaultValue={windowStartValue}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Window End (optional)
                </label>
                <input
                  type="time"
                  name="window_end"
                  defaultValue={windowEndValue}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Permit Number (optional)
              </label>
              <input
                type="text"
                name="permit_number"
                defaultValue={job.permit_number ?? ""}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="e.g. 2026-12345"
              />
            </div>

            <div className="flex justify-end">
              <button className="border rounded px-3 py-2 text-sm">
                Save Scheduling
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }