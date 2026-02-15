import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import {
  getContractors,
  updateJobCustomerFromForm,
  updateJobScheduleFromForm,
  advanceJobStatusFromForm,
  completeDataEntryFromForm,
  type JobStatus,
} from "@/lib/actions/job-actions";

import {
  updateJobOpsFromForm,
  updateJobOpsDetailsFromForm,
} from "@/lib/actions/job-ops-actions";

import { logCustomerContactAttemptFromForm } from "@/lib/actions/job-contact-actions";

function formatDateLAFromIso(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function formatDateTimeLAFromIso(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function isoToDateInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

function isoToTimeInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toISOString().slice(11, 16);
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
  return nextMap[s] ?? "—";
}

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { id } = await params;

  const sp = searchParams ? await searchParams : {};
  const tab = (sp?.tab ?? "info") as "info" | "ops" | "tests";

  const supabase = await createClient();
  const contractors = await getContractors();

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(`
      job_type,
      project_type,
      id,
      title,
      city,
      job_address,
      status,
      scheduled_date,
      created_at,
      contractor_id,
      ops_status,
      pending_info_reason,
      follow_up_date,
      next_action_note,
      action_required_by,
      permit_number,
      window_start,
      window_end,
      customer_phone,
      on_the_way_at,
      customer_first_name,
      customer_last_name,
      customer_email,
      job_notes,
      job_equipment (
        id,
        equipment_role,
        manufacturer,
        model,
        serial,
        tonnage,
        refrigerant_type,
        notes,
        created_at,
        updated_at
      ),
      ecc_test_runs (
        id,
        test_type,
        data,
        computed,
        computed_pass,
        override_pass,
        override_reason,
        created_at,
        updated_at
      )
    `)
    .eq("id", id)
    .single();

  if (jobError || !job) return notFound();

  const { data: customerAttempts, error: attemptsErr } = await supabase
    .from("job_events")
    .select("created_at, meta")
    .eq("job_id", id)
    .eq("event_type", "customer_attempt")
    .order("created_at", { ascending: false })
    .limit(200);

  if (attemptsErr) throw new Error(attemptsErr.message);

  const attemptCount = customerAttempts?.length ?? 0;
  const lastAttemptIso =
    customerAttempts?.[0]?.created_at ? String(customerAttempts[0].created_at) : null;

  const lastAttemptLabel = lastAttemptIso ? formatDateLAFromIso(lastAttemptIso) : "—";
  const last3Attempts = (customerAttempts ?? []).slice(0, 3);

  const customerName = [job.customer_first_name, job.customer_last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  const contractorName =
    contractors?.find((c: any) => c.id === job.contractor_id)?.name ?? "—";

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="mb-3">
        <h1 className="text-2xl font-semibold">{job.title}</h1>
        <p className="text-sm text-gray-600">{job.city ?? "No city set"}</p>
      </div>

      {/* Tab row (URL changes + render changes) */}
      <div className="mb-4 flex gap-2">
        <Link
          href={`/jobs/${job.id}?tab=info`}
          className={`px-3 py-2 rounded border text-sm ${
            tab === "info" ? "bg-black text-white" : "bg-white"
          }`}
        >
          Info
        </Link>

        <Link
          href={`/jobs/${job.id}?tab=ops`}
          className={`px-3 py-2 rounded border text-sm ${
            tab === "ops" ? "bg-black text-white" : "bg-white"
          }`}
        >
          Ops
        </Link>

        <Link
          href={`/jobs/${job.id}?tab=tests`}
          className={`px-3 py-2 rounded border text-sm ${
            tab === "tests" ? "bg-black text-white" : "bg-white"
          }`}
        >
          Tests
        </Link>
      </div>

      {/* Command Center Snapshot (always visible) */}
      <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
        <div className="text-sm font-semibold mb-3">Job Overview</div>

        <div className="grid gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Status</span>
            <span className="font-medium">{formatStatus(job.status)}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Customer</span>
            <span className="font-medium">{customerName || "—"}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Phone</span>
            <span className="font-medium">{job.customer_phone || "—"}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Address</span>
            <span className="font-medium text-right">{job.job_address || "—"}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Permit</span>
            <span className="font-medium">{job.permit_number || "—"}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Scheduled</span>
            <span className="font-medium">
              {job.scheduled_date ? formatDateLAFromIso(String(job.scheduled_date)) : "—"}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Arrival Window</span>
            <span className="font-medium">
              {job.window_start && job.window_end
                ? `${isoToTimeInput(job.window_start)} - ${isoToTimeInput(job.window_end)}`
                : "—"}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Contractor</span>
            <span className="font-medium">{contractorName}</span>
          </div>

<div className="flex justify-end">
  <details className="text-sm">
    <summary className="cursor-pointer text-gray-600 underline">
      Change contractor
    </summary>

    
  </details>
</div>



          <div className="flex justify-between">
            <span className="text-gray-600">Job ID</span>
            <span className="font-mono text-xs">{job.id}</span>
          </div>

          {job.job_notes ? (
            <div className="mt-3 border-t pt-3">
              <div className="text-xs text-gray-600 mb-1 uppercase tracking-wide">
                Job Notes
              </div>
              <div className="text-sm whitespace-pre-wrap text-gray-800">{job.job_notes}</div>
            </div>
          ) : null}
        </div>
      </div>



      {/* TAB: INFO */}
      {tab === "info" && (
        <>
          {/* Quick actions (status progression) */}
          <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
            <div className="text-sm font-semibold mb-3">Quick Actions</div>

            <div className="flex flex-wrap gap-2">
              <div className="text-sm font-medium">
  Current Status: {job.status.replaceAll("_", " ")}
</div>


              {!["completed", "failed", "cancelled"].includes(job.status) && (
  <form action={advanceJobStatusFromForm}>
    <input type="hidden" name="id" value={job.id} />
    <input type="hidden" name="current_status" value={job.status} />

    <button
      type="submit"
      className="px-3 py-2 rounded border text-sm cursor-pointer"
    >
      {job.status === "open" && "Mark On The Way"}
      {job.status === "on_the_way" && "Start Job"}
      {job.status === "in_process" && "Mark Completed"}
    </button>
  </form>
)}

{job.ops_status === "data_entry" ? (
  <div className="rounded-lg border bg-yellow-50 p-4 mt-6">
    <div className="font-semibold mb-2">
      Data Entry Required
    </div>

    <form action={completeDataEntryFromForm} className="flex flex-wrap gap-2 items-end">
      <input type="hidden" name="id" value={job.id} />

      <div className="flex flex-col">
        <label className="text-sm">Invoice # (optional)</label>
        <input
          name="invoice_number"
          className="rounded border px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        className="px-3 py-2 rounded border text-sm bg-black text-white"
      >
        Mark Data Entry Complete
      </button>
    </form>
  </div>
) : null}


              <Link className="px-3 py-2 rounded border text-sm" href="/jobs">
                Back to Jobs
              </Link>
            </div>
          </div>



          {/* Edit Customer */}
          <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
            <div className="text-sm font-semibold mb-3">Customer</div>

            <form action={updateJobCustomerFromForm} className="grid gap-3">
              <input type="hidden" name="id" value={job.id} />


              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">First Name</label>
                  <input
                    name="customer_first_name"
                    defaultValue={job.customer_first_name ?? ""}
                    className="w-full rounded border px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Last Name</label>
                  <input
                    name="customer_last_name"
                    defaultValue={job.customer_last_name ?? ""}
                    className="w-full rounded border px-2 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Phone</label>
                  <input
                    name="customer_phone"
                    defaultValue={job.customer_phone ?? ""}
                    className="w-full rounded border px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Email</label>
                  <input
                    name="customer_email"
                    defaultValue={job.customer_email ?? ""}
                    className="w-full rounded border px-2 py-2 text-sm"
                  />
                </div>
              </div>

              <button className="px-3 py-2 rounded bg-black text-white text-sm w-fit" type="submit">
                Save Customer
              </button>
            </form>
          </div>

          {/* Equipment + Tests summary cards */}
          <section className="rounded-lg border p-4 mb-4">
            <h2 className="text-lg font-semibold">Equipment</h2>
            <p className="text-sm text-muted-foreground">Capture equipment in the guided flow.</p>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-sm text-gray-600">
                {job.job_equipment?.length ? (
                  <span>{job.job_equipment.length} item(s) captured</span>
                ) : (
                  <span>No equipment captured yet.</span>
                )}
              </div>

              <Link
                href={`/jobs/${job.id}/info?f=equipment`}
                className="px-3 py-2 rounded bg-black text-white text-sm"
              >
                Capture Equipment
              </Link>
            </div>
          </section>

          <section className="rounded-lg border p-4 mb-6">
            <h2 className="text-lg font-semibold">Tests</h2>
            <p className="text-sm text-muted-foreground">
              Capture and review ECC test results on the Tests page.
            </p>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-sm text-gray-600">
                {job.ecc_test_runs?.length ? (
                  <span>{job.ecc_test_runs.length} test run(s) recorded</span>
                ) : (
                  <span>No tests recorded yet.</span>
                )}
              </div>

              <Link
                href={`/jobs/${job.id}/tests`}
                className="px-3 py-2 rounded bg-black text-white text-sm"
              >
                Go to Tests
              </Link>
            </div>
          </section>

          {/* Scheduling */}
          <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
            <div className="text-sm font-semibold mb-3">Scheduling</div>

            <form action={updateJobScheduleFromForm} className="grid gap-3">
              <input type="hidden" name="id" value={job.id} />


              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Scheduled Date</label>
                  <input
                    type="date"
                    name="scheduled_date"
                    defaultValue={isoToDateInput(String(job.scheduled_date ?? ""))}
                    className="w-full rounded border px-2 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-1">Permit #</label>
                  <input
                    name="permit_number"
                    defaultValue={job.permit_number ?? ""}
                    className="w-full rounded border px-2 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Window Start</label>
                  <input
                    type="time"
                    name="window_start"
                    defaultValue={isoToTimeInput(job.window_start)}
                    className="w-full rounded border px-2 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-1">Window End</label>
                  <input
                    type="time"
                    name="window_end"
                    defaultValue={isoToTimeInput(job.window_end)}
                    className="w-full rounded border px-2 py-2 text-sm"
                  />
                </div>
              </div>

              <button className="px-3 py-2 rounded bg-black text-white text-sm w-fit" type="submit">
                Save Scheduling
              </button>
            </form>
          </div>
        </>
      )}

      {/* TAB: OPS */}
      {tab === "ops" && (
        <>
          {/* Job Status (ops_status) */}
          <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
            <div className="text-sm font-semibold mb-3">Job Status</div>

            <form action={updateJobOpsFromForm} className="flex gap-2 items-end">
              <input type="hidden" name="id" value={job.id} />


              <div className="flex-1">
                <label className="block text-xs text-gray-600 mb-1">Ops Status</label>
                <select
                  name="ops_status"
                  defaultValue={job.ops_status ?? "need_to_schedule"}
                  className="w-full rounded border px-2 py-2 text-sm"
                >
                  <option value="need_to_schedule">Need to Schedule</option>
                  <option value="pending_info">Pending Info</option>
                  <option value="on_hold">On Hold</option>
                  <option value="retest_needed">Retest Needed</option>
                  <option value="ready">Ready</option>
                </select>
              </div>

              <button className="px-3 py-2 rounded bg-black text-white text-sm" type="submit">
                Save
              </button>
            </form>
          </div>

          {/* Follow Up */}
          <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
            <div className="text-sm font-semibold mb-3">Follow Up</div>

            <form action={updateJobOpsDetailsFromForm} className="grid gap-3">
              <input type="hidden" name="id" value={job.id} />


              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Action Required By</label>
                  <select
                    name="action_required_by"
                    defaultValue={job.action_required_by ?? ""}
                    className="w-full rounded border px-2 py-2 text-sm"
                  >
                    <option value="">—</option>
                    <option value="rater">Rater</option>
                    <option value="contractor">Contractor</option>
                    <option value="customer">Customer</option>
                  </select>
                </div>


                <div>
                  <label className="block text-xs text-gray-600 mb-1">Follow-up Date</label>
                  <input
                    type="date"
                    name="follow_up_date"
                    defaultValue={job.follow_up_date ? isoToDateInput(String(job.follow_up_date)) : ""}
                    className="w-full rounded border px-2 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">Pending Info Reason</label>
                <input
                  name="pending_info_reason"
                  defaultValue={job.pending_info_reason ?? ""}
                  className="w-full rounded border px-2 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">Next Action Note</label>
                <textarea
                  name="next_action_note"
                  defaultValue={job.next_action_note ?? ""}
                  className="w-full rounded border px-2 py-2 text-sm"
                  rows={4}
                />
              </div>

              <button className="px-3 py-2 rounded bg-black text-white text-sm w-fit" type="submit">
                Save Follow Up
              </button>
            </form>
          </div>

          {/* Customer Follow-up Attempts */}
          {job.action_required_by === "customer" ? (
            <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
              <div className="text-sm font-semibold mb-2">Customer Follow-Up</div>

              <div className="text-xs text-gray-600 mb-3">
                Attempts: <span className="font-medium">{attemptCount}</span> • Last:{" "}
                <span className="font-medium">{lastAttemptLabel}</span>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <form action={logCustomerContactAttemptFromForm}>
                  <input type="hidden" name="id" value={job.id} />

                  <input type="hidden" name="method" value="call" />
                  <input type="hidden" name="result" value="no_answer" />
                  <button className="px-3 py-2 rounded border text-sm" type="submit">
                    Log Call (No Answer)
                  </button>
                </form>

                <form action={logCustomerContactAttemptFromForm}>
                  <input type="hidden" name="id" value={job.id} />

                  <input type="hidden" name="method" value="text" />
                  <input type="hidden" name="result" value="sent" />
                  <button className="px-3 py-2 rounded border text-sm" type="submit">
                    Log Text (Sent)
                  </button>
                </form>

                <form action={logCustomerContactAttemptFromForm}>
                  <input type="hidden" name="id" value={job.id} />
                  <input type="hidden" name="method" value="call" />
                  <input type="hidden" name="result" value="spoke" />
                  <button className="px-3 py-2 rounded border text-sm" type="submit">
                    Log Call (Spoke)
                  </button>
                </form>
              </div>

              <div className="space-y-2">
                {last3Attempts.map((a: any, idx: number) => (
                  <div key={idx} className="rounded border p-3 text-sm">
                    <div className="text-xs text-gray-600">
                      {a.created_at ? formatDateTimeLAFromIso(String(a.created_at)) : "—"}
                    </div>
                    <div className="mt-1">
                      <span className="font-medium">Method:</span>{" "}
                      {a?.meta?.method ? String(a.meta.method) : "—"} •{" "}
                      <span className="font-medium">Result:</span>{" "}
                      {a?.meta?.result ? String(a.meta.result) : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}

      {/* TAB: TESTS */}
      {tab === "tests" && (
        <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
          <div className="text-sm font-semibold mb-2">Tests</div>
          <div className="text-sm text-gray-600 mb-3">
            {job.ecc_test_runs?.length ? (
              <span>{job.ecc_test_runs.length} test run(s) recorded.</span>
            ) : (
              <span>No tests recorded yet.</span>
            )}
          </div>

          <Link
            href={`/jobs/${job.id}/tests`}
            className="px-3 py-2 rounded bg-black text-white text-sm inline-block"
          >
            Go to Tests
          </Link>
        </div>
      )}
    </div>
  );
}
