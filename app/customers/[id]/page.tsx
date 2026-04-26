// app/customers/[id]/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  resolveCustomerVisibilityScope,
} from "@/lib/customers/visibility";
import {
  archiveCustomerFromForm,
  updateCustomerNotesFromForm,
} from "@/lib/actions/customer-actions";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";


type CustomerRow = {
  id?: string;
  customer_id?: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
  locations_count?: number | null;
  jobs_count?: number | null;
  last_scheduled_date?: string | null;
};

type LocationRow = {
  id?: string;
  location_id?: string;
  customer_id?: string;
  nickname?: string | null;
  label?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  postal_code?: string | null;
  equipment_count?: number | null;
  jobs_count?: number | null;
  last_scheduled_date?: string | null;
};

type JobRow = {
  id: string;
  title: string | null;
  status: string | null;
  job_address: string | null;
  city: string | null;
  scheduled_date: string | null;
  created_at: string | null;
  ops_status: string | null;
  contractor_id: string | null;
  service_case_id: string | null;
  parent_job_id: string | null;
  location_id: string | null;
  deleted_at: string | null;
  contractors?: {
    name?: string | null;
  } | null;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatPhone(phone?: string | null) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone ?? "";
}

function customerDisplayName(customer: CustomerRow) {
  const full = String(customer.full_name ?? "").trim();
  if (full) return full;

  const first = String(customer.first_name ?? "").trim();
  const last = String(customer.last_name ?? "").trim();
  const joined = [first, last].filter(Boolean).join(" ").trim();

  return joined || "Unnamed Customer";
}

function locationDisplayName(loc: LocationRow) {
  const label = String(loc.label ?? "").trim();
  const nickname = String(loc.nickname ?? "").trim();
  if (nickname) return nickname;
  if (label) return label;
  return "Location";
}

function locationAddressLine(loc: LocationRow) {
  const parts = [loc.address_line1, loc.city, loc.state, loc.zip]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  return parts.join(", ");
}

function billingAddressLine(customer: CustomerRow) {
  const line1 = String(customer.billing_address_line1 ?? "").trim();
  const line2 = String(customer.billing_address_line2 ?? "").trim();
  const city = String(customer.billing_city ?? "").trim();
  const state = String(customer.billing_state ?? "").trim();
  const zip = String(customer.billing_zip ?? "").trim();

  const top = [line1, line2].filter(Boolean).join(", ");
  const bottom = [city, state, zip].filter(Boolean).join(", ");

  return [top, bottom].filter(Boolean).join(" • ");
}

function describeServiceAddressFallback(loc: LocationRow | null) {
  if (!loc) return null;

  const address = locationAddressLine(loc);
  if (!address) return null;

  const label = String(loc.nickname ?? "").trim() || String(loc.label ?? "").trim() || "Service address";
  return { label, address };
}

function makeMapsHref(address?: string | null) {
  const q = String(address ?? "").trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function makeTelHref(phone?: string | null) {
  const digits = String(phone ?? "").replace(/[^\d+]/g, "");
  if (!digits) return null;
  return `tel:${digits}`;
}

function makeSmsHref(phone?: string | null) {
  const digits = String(phone ?? "").replace(/[^\d+]/g, "");
  if (!digits) return null;
  return `sms:${digits}`;
}

function normalizeOpsStatus(v?: string | null) {
  return String(v ?? "").trim().toLowerCase();
}

function normalizeLifecycleStatus(v?: string | null) {
  return String(v ?? "").trim().toLowerCase();
}

function isLifecycleComplete(v?: string | null) {
  const status = normalizeLifecycleStatus(v);
  return ["completed", "closed", "cancelled"].includes(status);
}

function isOperationallyActiveJob(job: Pick<JobRow, "status" | "ops_status" | "deleted_at">) {
  if (job.deleted_at) return false;

  const lifecycleStatus = normalizeLifecycleStatus(job.status);
  if (lifecycleStatus === "cancelled") return false;

  const opsStatus = normalizeOpsStatus(job.ops_status);
  return opsStatus !== "closed";
}

function opsStatusLabel(v?: string | null) {
  const s = normalizeOpsStatus(v);
  if (s === "need_to_schedule") return "Need to Schedule";
  if (s === "scheduled") return "Scheduled";
  if (s === "pending_info") return "Pending Info";
  if (s === "on_hold") return "On Hold";
  if (s === "failed") return "Failed";
  if (s === "pending_office_review") return "Pending Office Review";
  if (s === "retest_needed") return "Retest Needed";
  if (s === "paperwork_required") return "Paperwork Required";
  if (s === "invoice_required") return "Invoice Required";
  return s ? s.replace(/_/g, " ") : "Unknown";
}

function opsBadgeClass(v?: string | null) {
  const s = normalizeOpsStatus(v);

  if (s === "need_to_schedule") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (s === "scheduled") {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }
  if (s === "pending_info") {
    return "border-orange-200 bg-orange-50 text-orange-800";
  }
  if (s === "on_hold") {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }
  if (s === "failed") {
    return "border-red-200 bg-red-50 text-red-800";
  }
  if (s === "pending_office_review") {
    return "border-cyan-200 bg-cyan-50 text-cyan-800";
  }
  if (s === "retest_needed") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  if (s === "paperwork_required") {
    return "border-purple-200 bg-purple-50 text-purple-800";
  }
  if (s === "invoice_required") {
    return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function summaryOrder() {
  return [
    "need_to_schedule",
    "scheduled",
    "pending_info",
    "failed",
    "pending_office_review",
    "retest_needed",
    "paperwork_required",
    "invoice_required",
    "on_hold",
  ] as const;
}

export default async function CustomerDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ err?: string }>;
}) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  const visibilityScope = await resolveCustomerVisibilityScope({
    supabase,
    userId: userData.user.id,
  });

  if (!visibilityScope) redirect("/login");

  const isInternalViewer = visibilityScope.kind === "internal";

  const { id } = await props.params;
  const sp = props.searchParams ? await props.searchParams : {};
  const hasJobsError = sp.err === "has_jobs";

  if (!id || !isUuid(id)) {
    redirect("/customers");
  }

  const customerId = id;

  const customerSelect = `
      id,
      first_name,
      last_name,
      full_name,
      phone,
      email,
      notes,
      billing_address_line1,
      billing_address_line2,
      billing_city,
      billing_state,
      billing_zip
    `;

  let customerData: CustomerRow | null = null;
  let jobs: JobRow[] = [];

  const { data, error: customerErr } = await supabase
    .from("customers")
    .select(customerSelect)
    .eq("id", customerId)
    .maybeSingle();

  if (customerErr) throw customerErr;
  customerData = (data as CustomerRow | null) ?? null;

  const { data: jobsData, error: jobsErr } = await supabase
    .from("jobs")
    .select(
      `
      id,
      title,
      status,
      job_address,
      city,
      scheduled_date,
      created_at,
      ops_status,
      contractor_id,
      service_case_id,
      parent_job_id,
      location_id,
      deleted_at
      `,
    )
    .eq("customer_id", customerId)
    .order("scheduled_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (jobsErr) throw jobsErr;
  jobs = (jobsData ?? []) as JobRow[];

  if (!customerData) {
    return (
      <div className="p-6 space-y-2">
        <h1 className="text-2xl font-semibold">Customer not found</h1>
        <p className="text-sm text-muted-foreground">
          This customer record is missing or not accessible with your current account.
        </p>
        <Link href="/customers" className="text-sm underline">
          Back to Customers
        </Link>
      </div>
    );
  }

  const customer = customerData as CustomerRow;

  let locationsData: LocationRow[] = [];

  const { data: locationRows, error: locationsErr } = await supabase
    .from("locations")
    .select(
      `
      id,
      customer_id,
      nickname,
      label,
      address_line1,
      address_line2,
      city,
      state,
      zip,
      postal_code
    `,
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: true });

  if (locationsErr) throw locationsErr;
  locationsData = (locationRows ?? []) as LocationRow[];

  const locations = (locationsData ?? []) as LocationRow[];
  const firstLocationWithAddress = locations.find((loc) => locationAddressLine(loc).trim().length > 0) ?? null;
  const serviceAddressFallback = describeServiceAddressFallback(firstLocationWithAddress);
  const activeJobs = jobs.filter((job) => isOperationallyActiveJob(job));

  // Lightweight service-case awareness
  const serviceCaseIds = Array.from(
    new Set(
      jobs
        .map((j) => String(j.service_case_id ?? "").trim())
        .filter(Boolean)
    )
  );

  const serviceCaseVisitCounts = new Map<string, number>();
  if (serviceCaseIds.length > 0) {
    const { data: serviceCaseJobs, error: scErr } = await supabase
      .from("jobs")
      .select("service_case_id")
      .in("service_case_id", serviceCaseIds);

    if (scErr) throw scErr;

    for (const row of serviceCaseJobs ?? []) {
      const key = String((row as { service_case_id?: string | null }).service_case_id ?? "").trim();
      if (!key) continue;
      serviceCaseVisitCounts.set(key, (serviceCaseVisitCounts.get(key) ?? 0) + 1);
    }
  }

  // Retest resolution awareness: identify parent failed jobs whose retest child has resolved
  const failedJobIds = activeJobs
    .filter((j) => normalizeOpsStatus(j.ops_status) === "failed")
    .map((j) => j.id);

  const resolvedRetestParentIds = new Set<string>();
  if (failedJobIds.length > 0) {
    const { data: retestChildren, error: retestErr } = await supabase
      .from("jobs")
      .select("parent_job_id")
      .in("parent_job_id", failedJobIds)
      .in("ops_status", ["paperwork_required", "invoice_required", "closed"])
      .is("deleted_at", null);

    if (retestErr) throw retestErr;

    for (const row of retestChildren ?? []) {
      const pid = String((row as { parent_job_id?: string | null }).parent_job_id ?? "").trim();
      if (pid) resolvedRetestParentIds.add(pid);
    }
  }

  const jobsByLocationCount = new Map<string, number>();
  for (const job of activeJobs) {
    const key = String(job.location_id ?? "").trim();
    if (!key) continue;
    jobsByLocationCount.set(key, (jobsByLocationCount.get(key) ?? 0) + 1);
  }

  const opsCounts: Record<string, number> = {};
  for (const job of activeJobs) {
    const key = normalizeOpsStatus(job.ops_status) || "unknown";
    opsCounts[key] = (opsCounts[key] ?? 0) + 1;
  }

  const activeWorkCount = activeJobs.length;
  const completedJobsCount = jobs.filter((job) => {
    if (job.deleted_at) return false;
    const opsStatus = normalizeOpsStatus(job.ops_status);
    return opsStatus === "closed";
  }).length;

  const lastScheduledActiveDate = activeJobs
    .map((j) => j.scheduled_date)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] ?? null;

  const callHref = makeTelHref(customer.phone);
  const smsHref = makeSmsHref(customer.phone);
  const customerBillingAddress = billingAddressLine(customer);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-7 p-4 md:space-y-8 md:p-6">
        {hasJobsError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This customer has non-archived jobs and cannot be archived. Remove or archive all jobs first.
          </div>
        )}
        {/* Header */}
        <div className="flex flex-col gap-5 rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50/40 p-5 shadow-sm md:flex-row md:items-start md:justify-between md:p-6">
          <div className="space-y-2">
            <Link
              href="/customers"
              className="inline-flex text-sm text-slate-500 hover:text-slate-900"
            >
              ← Back to Customers
            </Link>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Entity Workspace</div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
                {customerDisplayName(customer)}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Customer Command Center
              </p>
            </div>

            <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200/80 bg-white/70 p-2 text-xs text-slate-600">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                {locations.length} location{locations.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                {jobs.length} job{jobs.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                {activeJobs.length} active job{activeJobs.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                Last scheduled:{" "}
                {formatDate(lastScheduledActiveDate)}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-3 rounded-xl border border-slate-200 bg-white/85 p-3 md:items-end">
            {isInternalViewer ? (
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/customers/${customerId}/edit`}
                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  Edit Customer
                </Link>

                <Link
                  href={`/jobs/new?customer_id=${customerId}&source=customer`}
                  className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  New Job for Customer
                </Link>
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-6 md:space-y-7">

        {/* Open status summary */}
        <section className="rounded-xl border border-slate-200/80 bg-white/80 p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Open Jobs Summary
            </h2>
          </div>

          <div className="flex flex-wrap gap-1 sm:gap-1.5">
            {summaryOrder().map((key) => (
              <div
                key={key}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50/80 px-2.5 py-2"
              >
                <div className="text-lg font-semibold leading-none tracking-tight text-slate-900">
                  {opsCounts[key] ?? 0}
                </div>
                <div className="whitespace-nowrap text-[9px] font-medium uppercase tracking-[0.08em] text-slate-500">
                  {opsStatusLabel(key)}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Overview */}
        <section className="grid gap-6 xl:grid-cols-[1.25fr_.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Customer Overview
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Phone
                </div>
                <div className="text-sm text-slate-900">
                  {customer.phone ? formatPhone(customer.phone) : "—"}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Email
                </div>
                <div className="text-sm text-slate-900 break-all">
                  {customer.email ?? "—"}
                </div>
              </div>

              <div className="space-y-1 md:col-span-2">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Billing Address
                </div>
                {customerBillingAddress ? (
                  <div className="text-sm text-slate-900">{customerBillingAddress}</div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="text-sm font-medium text-slate-700">No billing address set</div>
                    {serviceAddressFallback ? (
                      <div className="text-sm text-slate-500">
                        Service address available from {serviceAddressFallback.label}: {serviceAddressFallback.address}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500">Add a billing address on the customer record to use it everywhere billing stays strict and canonical.</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Summary</h2>

            <div className="mt-4 flex flex-wrap gap-2">
              {callHref ? (
                <a
                  href={callHref}
                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  Call Customer
                </a>
              ) : null}

              {smsHref ? (
                <a
                  href={smsHref}
                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  Text Customer
                </a>
              ) : null}

              {customer.email ? (
                <a
                  href={`mailto:${customer.email}`}
                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  Email Customer
                </a>
              ) : null}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Total Jobs
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {jobs.length}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Active Work (Incl. Closeout)
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {activeWorkCount}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Completed / Closed
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {completedJobsCount}
                </div>
              </div>
            </div>
          </div>
        </section>

        {isInternalViewer ? (
          <section id="customer-notes" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-slate-900">Customer Notes</h2>
              <p className="mt-1 text-sm text-slate-500">
                Internal notes and context for this customer.
              </p>
            </div>
            <form action={updateCustomerNotesFromForm} className="space-y-3">
              <input type="hidden" name="customer_id" value={customerId} />
              <textarea
                name="notes"
                defaultValue={customer.notes ?? ""}
                rows={6}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
                placeholder="Add customer notes..."
              />
              <div>
                <button
                  type="submit"
                  className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Save
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {/* Locations */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Locations</h2>
              <p className="text-sm text-slate-500">
                All service addresses associated with this customer.
              </p>
            </div>
          </div>

          {locations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              No locations on file yet.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {locations.map((loc) => {
                const locId = String(loc.id ?? loc.location_id ?? "");
                const address = locationAddressLine(loc);
                const mapsHref = makeMapsHref(address);

                return (
                  <div
                    key={locId}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                  >
                    <div className="space-y-4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {locationDisplayName(loc)}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            {address || "No address on file"}
                          </div>
                        </div>

                        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                          {jobsByLocationCount.get(locId) ?? 0} active job
                          {(jobsByLocationCount.get(locId) ?? 0) === 1 ? "" : "s"}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {mapsHref ? (
                          <a
                            href={mapsHref}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                          >
                            Open in Maps
                          </a>
                        ) : null}

                        {locId && isInternalViewer ? (
                          <Link
                            href={`/locations/${locId}`}
                            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                          >
                            View Location
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Job history */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Job History</h2>
              <p className="text-sm text-slate-500">
                {isInternalViewer
                  ? "All jobs for this customer across every location."
                  : "Jobs for this customer within your contractor scope."}
              </p>
            </div>
          </div>

          {jobs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              No jobs found for this customer yet.
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => {
                const serviceCaseVisits = job.service_case_id
                  ? serviceCaseVisitCounts.get(job.service_case_id) ?? 1
                  : null;
                const isArchived = Boolean(job.deleted_at);
                const isCancelled = normalizeLifecycleStatus(job.status) === "cancelled";
                const address = [job.job_address, job.city]
                  .map((v) => String(v ?? "").trim())
                  .filter(Boolean)
                  .join(", ");

                return (
                  <div
                    key={job.id}
                    className={[
                      "rounded-xl border p-4",
                      isArchived || isCancelled
                        ? "border-slate-200 bg-slate-100/70"
                        : "border-slate-200 bg-slate-50",
                    ].join(" ")}
                  >
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={isInternalViewer ? `/jobs/${job.id}` : `/portal/jobs/${job.id}`}
                            className="text-sm font-semibold text-slate-900 underline-offset-2 hover:underline"
                          >
                            {normalizeRetestLinkedJobTitle(job.title) || `Job ${job.id.slice(0, 8)}`}
                          </Link>

                          <span
                            className={[
                              "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                              opsBadgeClass(job.ops_status),
                            ].join(" ")}
                          >
                            {opsStatusLabel(job.ops_status)}
                          </span>

                          {isCancelled && !isArchived ? (
                            <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                              Cancelled
                            </span>
                          ) : null}

                          {isArchived ? (
                            <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                              Archived
                            </span>
                          ) : null}

                          {job.service_case_id ? (
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600">
                              Service Case · {serviceCaseVisits} visit
                              {serviceCaseVisits === 1 ? "" : "s"}
                            </span>
                          ) : null}
                        </div>

                        <div className="grid gap-2 text-sm text-slate-600 md:grid-cols-3">
                          <div>
                            <span className="font-medium text-slate-700">Job ID:</span>{" "}
                            <span className="font-mono text-xs">{job.id.slice(0, 8)}&hellip;</span>
                          </div>
                          <div>
                            <span className="font-medium text-slate-700">Address:</span>{" "}
                            {address || "—"}
                          </div>
                          <div>
                            <span className="font-medium text-slate-700">Scheduled:</span>{" "}
                            {formatDate(job.scheduled_date)}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={isInternalViewer ? `/jobs/${job.id}` : `/portal/jobs/${job.id}`}
                          className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                        >
                          Open Job
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {isInternalViewer ? (
          <section className="rounded-2xl border border-red-200 bg-red-50/40 p-5 shadow-sm">
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-red-900">Danger Zone</h2>
              <p className="text-sm text-red-800/90">
                Archive this customer record after all related jobs have been removed or archived.
              </p>
            </div>

            <form action={archiveCustomerFromForm}>
              <input type="hidden" name="customer_id" value={customerId} />
              <button
                type="submit"
                className="inline-flex items-center rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                Archive Customer
              </button>
            </form>
          </section>
        ) : null}
      </div>
      </div>
    </div>
  );
}