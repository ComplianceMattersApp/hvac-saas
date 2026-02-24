import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/SubmitButton";

import {
  getContractors,
  updateJobCustomerFromForm,
  updateJobScheduleFromForm,
  advanceJobStatusFromForm,
  completeDataEntryFromForm,
  type JobStatus,
  createRetestJobFromForm,
} from "@/lib/actions/job-actions";


import ServiceStatusActions from "./_components/ServiceStatusActions";
import { displayDateLA } from "@/lib/utils/schedule-la";

import {
  updateJobOpsFromForm,
  updateJobOpsDetailsFromForm,
} from "@/lib/actions/job-ops-actions";

import { logCustomerContactAttemptFromForm } from "@/lib/actions/job-contact-actions";




function dateToDateInput(value?: string | null) {
  if (!value) return "";

  const s = String(value).trim();
  if (!s) return "";

  // New DB type: "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Legacy ISO (timestamptz)
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}


function formatDateLAFromIso(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function formatDateTimeLAFromIso(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";

  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);

  return `${date} ${time}`;
}


function formatDateDisplay(date?: string | null) {
  if (!date) return "";
  return date; // already "YYYY-MM-DD"
}

function formatTimeDisplay(time?: string | null) {
  if (!time) return "";
  const s = String(time);
  return s.slice(0, 5); // "HH:MM"
}


function timeToTimeInput(value?: string | null) {
  if (!value) return "";

  const s = String(value).trim();
  if (!s) return "";

  // ✅ New DB type: "HH:MM:SS" or "HH:MM"
  // e.g. "08:00:00" -> "08:00"
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    return s.slice(0, 5);
  }

  // ✅ Legacy / mixed cases: ISO string
  // e.g. "2026-02-17T16:00:00.000Z"
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return "";
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
  const { id: jobId } = await params;

  const sp = searchParams ? await searchParams : {};
  const tab = ((sp?.tab ?? "info") as "info" | "ops" | "tests")

  const supabase = await createClient();
  const contractors = await getContractors();

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(`
      customer_id,
      job_type,
      project_type,
      id,
      parent_job_id,
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
      billing_recipient,
      billing_name,
      billing_email,
      billing_phone,
      billing_address_line1,
      billing_address_line2, 
      billing_city,
      billing_state,
      billing_zip,
      locations:locations (
        id,
        address_line1,
        address_line2,
        city,
        state,
        zip
      ),
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
    .eq("id", jobId)

    .single();

  if (jobError || !job) return notFound();

  // --- Linked Jobs (Parent + Children) ---
const parentJobId = (job as any).parent_job_id as string | null;
const retestRootId = parentJobId ?? jobId;

const { data: parentJob } = parentJobId
  ? await supabase
      .from("jobs")
      .select("id, title, status, ops_status, created_at")
      .eq("id", parentJobId)
      .maybeSingle()
  : { data: null };

const { data: childJobs, error: childErr } = await supabase
  .from("jobs")
  .select("id, title, status, ops_status, created_at")
  .eq("parent_job_id", retestRootId)
  .order("created_at", { ascending: false });

if (childErr) throw new Error(childErr.message);

// --- Unified Timeline (job_events) ---
const { data: timelineEvents, error: tlErr } = await supabase
  .from("job_events")
  .select("created_at, event_type, meta")
  .eq("job_id", jobId)
  .order("created_at", { ascending: false })
  .limit(200);

if (tlErr) throw new Error(tlErr.message);

  const { data: customerAttempts, error: attemptsErr } = await supabase
    .from("job_events")
    .select("created_at, meta")
    .eq("job_id", jobId)

    .eq("event_type", "customer_attempt")
    .order("created_at", { ascending: false })
    .limit(200);

  if (attemptsErr) throw new Error(attemptsErr.message);

const contractorId = job.contractor_id ?? null;
const customerId = job.customer_id ?? null;

const { data: contractorBilling } = contractorId
  ? await supabase
      .from("contractors")
      .select(
        "id, name, billing_name, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip"
      )
      .eq("id", contractorId)
      .maybeSingle()
  : { data: null };

const { data: customerBilling } = customerId
  ? await supabase
      .from("customers")
      .select(
        "id, full_name, first_name, last_name, phone, email, billing_name, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip"
      )
      .eq("id", customerId)
      .maybeSingle()
  : { data: null };


  const attemptCount = customerAttempts?.length ?? 0;
  const lastAttemptIso =
    customerAttempts?.[0]?.created_at ? String(customerAttempts[0].created_at) : null;

  const lastAttemptLabel = lastAttemptIso ? formatDateLAFromIso(lastAttemptIso) : "—";
  const last3Attempts = (customerAttempts ?? []).slice(0, 25);

  const customerName =
  (customerBilling?.full_name ||
    [customerBilling?.first_name, customerBilling?.last_name].filter(Boolean).join(" ").trim() ||
    [job.customer_first_name, job.customer_last_name].filter(Boolean).join(" ").trim() ||
    "—");

const customerPhone =
  customerBilling?.phone ?? job.customer_phone ?? "—";

  const contractorName =
    contractors?.find((c: any) => c.id === job.contractor_id)?.name ?? "—";

    const serviceAddressLine1 =
  (job as any).locations?.address_line1 ?? job.job_address ?? null;

const serviceCity =
  (job as any).locations?.city ?? job.city ?? null;
    
function formatBillingAddress(a: {
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
}) {
  const line1 = a.billing_address_line1 ?? "";
  const line2 = a.billing_address_line2 ?? "";
  const city = a.billing_city ?? "";
  const state = a.billing_state ?? "";
  const zip = a.billing_zip ?? "";

  const parts = [
    line1,
    line2,
    [city, state, zip].filter(Boolean).join(" "),
  ].filter((x) => String(x || "").trim().length > 0);

  return parts;
}

const recipient = (job.billing_recipient ?? "").trim();

let billingSourceLabel = "Not set";
let billing = {
  billing_name: null as string | null,
  billing_email: null as string | null,
  billing_phone: null as string | null,
  billing_address_line1: null as string | null,
  billing_address_line2: null as string | null,
  billing_city: null as string | null,
  billing_state: null as string | null,
  billing_zip: null as string | null,
};

if (recipient === "contractor") {
  billingSourceLabel = "Contractor";
  billing = {
    billing_name: contractorBilling?.billing_name ?? contractorBilling?.name ?? null,
    billing_email: contractorBilling?.billing_email ?? null,
    billing_phone: contractorBilling?.billing_phone ?? null,
    billing_address_line1: contractorBilling?.billing_address_line1 ?? null,
    billing_address_line2: contractorBilling?.billing_address_line2 ?? null,
    billing_city: contractorBilling?.billing_city ?? null,
    billing_state: contractorBilling?.billing_state ?? null,
    billing_zip: contractorBilling?.billing_zip ?? null,
  };
} else if (recipient === "customer") {
  billingSourceLabel = "Customer";
  billing = {
    billing_name: customerBilling?.billing_name ?? customerBilling?.full_name ?? null,
    billing_email: customerBilling?.billing_email ?? null,
    billing_phone: customerBilling?.billing_phone ?? null,
    billing_address_line1: customerBilling?.billing_address_line1 ?? null,
    billing_address_line2: customerBilling?.billing_address_line2 ?? null,
    billing_city: customerBilling?.billing_city ?? null,
    billing_state: customerBilling?.billing_state ?? null,
    billing_zip: customerBilling?.billing_zip ?? null,
  };
} else if (recipient === "other") {
  billingSourceLabel = "Other (job override)";
  billing = {
    billing_name: job.billing_name ?? null,
    billing_email: job.billing_email ?? null,
    billing_phone: job.billing_phone ?? null,
    billing_address_line1: job.billing_address_line1 ?? null,
    billing_address_line2: job.billing_address_line2 ?? null,
    billing_city: job.billing_city ?? null,
    billing_state: job.billing_state ?? null,
    billing_zip: job.billing_zip ?? null,
  };
}

  return (
    <div className="p-6 max-w-3xl">

<div className="flex items-center justify-between mb-4">
  <Link
    href="/ops"
    className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
  >
    ← Back to Ops
  </Link>

  <div className="flex gap-2">
    <Link
      href="/customers"
      className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
    >
      Customers
    </Link>
    <Link
      href="/calendar"
      className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
    >
      Calendar
    </Link>
  </div>
</div>


      {/* Header */}
      <div className="mb-3">
        <h1 className="text-2xl font-semibold">{job.title}</h1>
        <p className="text-sm text-gray-600">{serviceCity ?? "No city set"}</p>
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
            <span className="font-medium text-right">{serviceAddressLine1 || "—"}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Permit</span>
            <span className="font-medium">{job.permit_number || "—"}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Scheduled</span>
            <span className="font-medium">
              {job.scheduled_date ? displayDateLA(String(job.scheduled_date)) : "—"}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Arrival Window</span>
            <span className="font-medium">
              {job.window_start && job.window_end
                ? `${timeToTimeInput(job.window_start)} - ${timeToTimeInput(job.window_end)}`
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

{job.customer_id ? (
  <Link
    href={`/customers/${job.customer_id}/edit`}
    className="inline-flex items-center rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
  >
    Edit Customer →
  </Link>
) : (
  <div className="text-xs text-red-600">
    This job is not linked to a customer yet.
  </div>
)}





 <ServiceStatusActions jobId={jobId} />




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

{/* Billing Summary */}

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-sm space-y-3 mb-6">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-white">Billing Summary</div>
              <div className="text-xs text-zinc-400">{billingSourceLabel}</div>
            </div>

            <div className="text-sm text-zinc-200">
              <div className="font-medium">{billing.billing_name || "—"}</div>

              {formatBillingAddress(billing).map((line, idx) => (
                <div key={idx} className="text-zinc-300">
                  {line}
                </div>
              ))}

              <div className="mt-2 space-y-1">
                <div className="text-zinc-300">Email: {billing.billing_email || "—"}</div>
                <div className="text-zinc-300">Phone: {billing.billing_phone || "—"}</div>
              </div>
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
    <input type="hidden" name="job_id" value={job.id} />
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
      <input type="hidden" name="job_id" value={job.id} />

      
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
<div className="rounded-xl border bg-white p-5 sm:p-6 text-gray-900 mb-6 shadow-sm">
  <div className="flex items-center justify-between mb-4">
    <div>
      <div className="text-base font-semibold">Scheduling</div>
      <div className="text-xs text-gray-500">Set date, arrival window, and permit info.</div>
    </div>
  </div>

  <form action={updateJobScheduleFromForm} className="space-y-4">
    <input type="hidden" name="job_id" value={job.id} />

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-700">Scheduled Date</label>
        <input
          type="date"
          name="scheduled_date"
          defaultValue={displayDateLA(job.scheduled_date)}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-black [color-scheme:light]"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-700">Permit #</label>
        <input
          name="permit_number"
          defaultValue={job.permit_number ?? ""}
          placeholder="Optional"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-black"
        />
      </div>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-700">Window Start</label>
        <input
          type="time"
          name="window_start"
          defaultValue={timeToTimeInput(job.window_start)}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-black [color-scheme:light]"
        />
        <div className="text-[11px] text-gray-500">Example: 08:00</div>
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-700">Window End</label>
        <input
          type="time"
          name="window_end"
          defaultValue={timeToTimeInput(job.window_end)}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-black [color-scheme:light]"
        />
        <div className="text-[11px] text-gray-500">Example: 10:00</div>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-2 pt-1">
      <button
        className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        type="submit"
      >
        Save Scheduling
      </button>

      <Link
        href="/ops"
        className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
      >
        Back to Ops
      </Link>
    </div>
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
              <input type="hidden" name="job_id" value={job.id} />



              <div className="flex-1">
                <label className="block text-xs text-gray-600 mb-1">Ops Status</label>
                <select
                name="ops_status"
                defaultValue={job.ops_status ?? "need_to_schedule"}
                className="w-full rounded border px-2 py-2 text-sm"
              >
                <option value="need_to_schedule">Need to Schedule</option>
                <option value="scheduled">Scheduled</option>
                <option value="pending_info">Pending Info</option>
                <option value="on_hold">On Hold</option>
                <option value="failed">Failed</option>
                <option value="retest_needed">Retest Needed</option>
                <option value="paperwork_required">Paperwork Required</option>
                <option value="invoice_required">Invoice Required</option>
                <option value="closed">Closed</option>
              </select>

              </div>

              <button className="px-3 py-2 rounded bg-black text-white text-sm" type="submit">
                Save
              </button>
            </form>
          </div>

          {/* Retest + Linked Jobs */}
<div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
  <div className="text-sm font-semibold mb-3">Retest</div>

  {["failed", "retest_needed"].includes(String(job.ops_status ?? "")) ? (
    <form action={createRetestJobFromForm} className="mb-4">
      <input type="hidden" name="parent_job_id" value={job.id} />

        <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
          <input type="checkbox" name="copy_equipment" value="1" defaultChecked />
          Copy equipment from original
        </label>

      <button
        type="submit"
        className="px-3 py-2 rounded bg-black text-white text-sm"
      >
        Create Retest Job
      </button>
    </form>
  ) : (
    <div className="text-sm text-gray-600 mb-4">
      Retest button appears when Ops Status is <span className="font-medium">Failed</span> or{" "}
      <span className="font-medium">Retest Needed</span>.
    </div>
  )}

  {parentJob ? (
    <div className="text-sm mb-3">
      <div className="text-xs text-gray-600 mb-1">Original Job</div>
      <Link className="underline" href={`/jobs/${parentJob.id}?tab=ops`}>
        {parentJob.title ?? parentJob.id}
      </Link>
      <div className="text-xs text-gray-600 mt-1">
        Status: {String(parentJob.status)} • Ops: {String(parentJob.ops_status ?? "—")}
      </div>
    </div>
  ) : null}

  <div className="text-sm">
    <div className="text-xs text-gray-600 mb-1">Retests</div>

    {childJobs?.length ? (
      <div className="space-y-2">
        {childJobs.map((cj: any) => (
          <div key={cj.id} className="rounded border p-3 text-sm">
            <Link className="underline" href={`/jobs/${cj.id}?tab=ops`}>
              {cj.title ?? cj.id}
            </Link>
            <div className="text-xs text-gray-600 mt-1">
              Status: {String(cj.status)} • Ops: {String(cj.ops_status ?? "—")}
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="text-sm text-gray-600">No retests yet.</div>
    )}
  </div>
</div>

{/* Timeline */}
<div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
  <div className="text-sm font-semibold mb-3">Timeline</div>

  <div className="space-y-2">
    {(timelineEvents ?? []).length ? (
      (timelineEvents ?? []).map((e: any, idx: number) => {
        const when = e?.created_at ? formatDateTimeLAFromIso(String(e.created_at)) : "—";
        const type = String(e?.event_type ?? "");
        const meta = e?.meta ?? {};

        const icon =
          type === "job_created" ? "🆕" :
          type === "retest_created" ? "🔁" :
          type === "customer_attempt" ? "📞" :
          type === "status_changed" ? "🔄" :
          type === "job_failed" ? "❌" :
          type === "job_passed" ? "✅" :
          type === "scheduled" ? "📅" :
          type === "unscheduled" ? "🗓️" :
          type === "retest_passed" ? "✅" :
          type === "retest_failed" ? "❌" :
          type === "schedule_updated" ? "🕒" :
          "📝";
          

        return (
          <div key={idx} className="rounded border p-3 text-sm bg-white">
            <div className="flex items-start justify-between gap-3">
              <div className="text-xs text-gray-600">{when}</div>
              <div className="text-xs text-gray-500">{icon}</div>
            </div>

            <div className="mt-2 font-medium">{type}</div>

            {type === "retest_created" && meta?.child_job_id ? (
              <div className="mt-1 text-sm">
                Retest:{" "}
                <Link className="underline" href={`/jobs/${String(meta.child_job_id)}?tab=ops`}>
                  View linked retest
                </Link>
              </div>
            ) : null}

            {type === "retest_created" && meta?.parent_job_id ? (
              <div className="mt-1 text-sm">
                Original:{" "}
                <Link className="underline" href={`/jobs/${String(meta.parent_job_id)}?tab=ops`}>
                  View original job
                </Link>
              </div>
            ) : null}

            {type === "retest_passed" && meta?.child_job_id ? (
              <div className="mt-1 text-sm">
                Resolved by retest:{" "}
                <Link className="underline" href={`/jobs/${String(meta.child_job_id)}?tab=ops`}>
                  View retest job
                </Link>
              </div>
            ) : null}

            {type === "retest_failed" && meta?.child_job_id ? (
              <div className="mt-1 text-sm">
                Retest failed again:{" "}
                <Link className="underline" href={`/jobs/${String(meta.child_job_id)}?tab=ops`}>
                  View retest job
                </Link>
              </div>
            ) : null}

          </div>
        );
      })
    ) : (
      <div className="text-sm text-gray-600">No timeline events yet.</div>
    )}
  </div>
</div>

          {/* Follow Up */}
          <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
            <div className="text-sm font-semibold mb-3">Follow Up</div>

            <form action={updateJobOpsDetailsFromForm} className="grid gap-3">
              <input type="hidden" name="job_id" value={job.id} />


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
                    defaultValue={job.follow_up_date ? dateToDateInput(String(job.follow_up_date)) : ""}
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
          {job.ops_status === "need_to_schedule" ? (
            <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
              <div className="text-sm font-semibold mb-2">Customer Follow-Up</div>

              <div className="text-xs text-gray-600 mb-3">
                Attempts: <span className="font-medium">{attemptCount}</span> • Last:{" "}
                <span className="font-medium">{lastAttemptLabel}</span>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <form action={logCustomerContactAttemptFromForm}>
                  <input type="hidden" name="job_id" value={job.id} />

                  <input type="hidden" name="method" value="call" />
                  <input type="hidden" name="result" value="no_answer" />
                  <SubmitButton className="px-3 py-2 rounded border text-sm">
                    Log Call (No Answer)
                  </SubmitButton>
                </form>

                <form action={logCustomerContactAttemptFromForm}>
                  <input type="hidden" name="job_id" value={job.id} />

                  <input type="hidden" name="method" value="text" />
                  <input type="hidden" name="result" value="sent" />
                  <button className="px-3 py-2 rounded border text-sm" type="submit">
                    Log Text (Sent)
                  </button>
                </form>

                <form action={logCustomerContactAttemptFromForm}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="method" value="call" />
                  <input type="hidden" name="result" value="spoke" />
                  <button className="px-3 py-2 rounded border text-sm" type="submit">
                    Log Call (Spoke)
                  </button>
                  
                </form>
              </div>

              <div className="space-y-2">
                {last3Attempts.map((a: any, idx: number) => {
  const method = a?.meta?.method ? String(a.meta.method) : "";
  const result = a?.meta?.result ? String(a.meta.result) : "";
  const when = a?.created_at ? formatDateTimeLAFromIso(String(a.created_at)) : "—";

  const methodIcon = method === "text" ? "💬" : method === "call" ? "📞" : "📝";

  const resultLabel =
    result === "no_answer" ? "No Answer" :
    result === "sent" ? "Sent" :
    result === "spoke" ? "Spoke" :
    (result || "—");

  return (
    <div key={idx} className="rounded border p-3 text-sm bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs text-gray-600">{when}</div>
        <div className="text-xs text-gray-500">
          {a?.meta?.attempt_number ? `#${String(a.meta.attempt_number)}` : null}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs">
          <span>{methodIcon}</span>
          <span className="capitalize">{method || "—"}</span>
        </span>

        <span className="inline-flex items-center rounded-full border px-2 py-1 text-xs">
          {resultLabel}
        </span>
      </div>
    </div>
  );
})}
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
