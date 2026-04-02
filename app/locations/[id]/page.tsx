// app/locations/[id]/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateLocationNotesFromForm } from "./notes-actions";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

function displayDateLA(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function displayDateTimeLA(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function mapsHref(parts: {
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}) {
  const query = [parts.address_line1, parts.city, parts.state, parts.zip]
    .filter(Boolean)
    .join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    query
  )}`;
}

function opsBadgeClasses(value?: string | null) {
  const v = String(value ?? "").toLowerCase();

  if (v === "failed") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (v === "retest_needed") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }
  if (v === "pending_office_review") {
    return "border-cyan-200 bg-cyan-50 text-cyan-700";
  }
  if (v === "pending_info") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (v === "need_to_schedule") {
    return "border-yellow-200 bg-yellow-50 text-yellow-700";
  }
  if (v === "scheduled") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (v === "closeout" || v === "paperwork_required" || v === "invoice_required") {
    return "border-purple-200 bg-purple-50 text-purple-700";
  }
  if (v === "ready" || v === "completed" || v === "closed") {
    return "border-green-200 bg-green-50 text-green-700";
  }

  return "border-gray-200 bg-gray-50 text-gray-700";
}

function formatOpsLabel(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";

  return raw
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function customerDisplayName(customer: any) {
  const company =
    String(customer?.company_name ?? customer?.name ?? "").trim() || null;
  if (company) return company;

  const first = String(customer?.first_name ?? "").trim();
  const last = String(customer?.last_name ?? "").trim();
  const full = [first, last].filter(Boolean).join(" ").trim();

  if (full) return full;
  return "Customer";
}

export default async function LocationDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  const { id } = await props.params;
  if (!id || !isUuid(id)) redirect("/customers");

  const locationId = id;

  const { data: location, error: locationErr } = await supabase
    .from("locations")
    .select("*")
    .eq("id", locationId)
    .maybeSingle();

  if (locationErr) throw locationErr;

  if (!location) {
    return (
      <div className="p-6 space-y-2">
        <h1 className="text-xl font-semibold">Location not found</h1>
        <Link href="/customers" className="text-sm underline">
          Back to Customers
        </Link>
      </div>
    );
  }

  const { data: customer, error: customerErr } = await supabase
    .from("customers")
    .select("*")
    .eq("id", location.customer_id)
    .maybeSingle();

  if (customerErr) throw customerErr;

  const { data: jobs, error: jobsErr } = await supabase
    .from("jobs")
    .select(
      `
      id,
      title,
      job_type,
      status,
      ops_status,
      created_at,
      scheduled_date,
      service_case_id,
      deleted_at
      `
    )
    .eq("location_id", locationId)
    .order("scheduled_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (jobsErr) throw jobsErr;

  const jobRows = (jobs ?? []) as any[];
  const activeSummaryRows = jobRows.filter((j) => !j?.deleted_at);
  const lifecycleOpenRows = activeSummaryRows.filter((j) => {
    const s = String(j?.status ?? "").toLowerCase();
    return !!s && !["completed", "closed", "cancelled"].includes(s);
  });

  const totalJobs = jobRows.length;
  const openJobs = lifecycleOpenRows.length;
  const failedJobs = lifecycleOpenRows.filter((j) =>
    String(j?.ops_status ?? "").toLowerCase() === "failed"
  ).length;
  const pendingInfoJobs = lifecycleOpenRows.filter((j) =>
    String(j?.ops_status ?? "").toLowerCase() === "pending_info"
  ).length;
  const pendingOfficeReviewJobs = lifecycleOpenRows.filter((j) =>
    String(j?.ops_status ?? "").toLowerCase() === "pending_office_review"
  ).length;

  const serviceCaseCounts = new Map<string, number>();
  for (const row of jobRows) {
    const key = String(row?.service_case_id ?? "").trim();
    if (!key) continue;
    serviceCaseCounts.set(key, (serviceCaseCounts.get(key) ?? 0) + 1);
  }

  const lastActivityDate =
    jobRows
      .map((j) => String(j?.scheduled_date ?? j?.created_at ?? "").trim())
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  const customerName = customerDisplayName(customer);
  const customerId = String(location?.customer_id ?? "").trim() || null;

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          {customerId ? (
            <Link href={`/customers/${customerId}`} className="underline">
              Back to Customer
            </Link>
          ) : (
            <Link href="/customers" className="underline">
              Back to Customers
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              {location.address_line1 ?? "Location"}
            </h1>

            <div className="mt-1 text-sm text-gray-600">
              {[location.city, location.state, location.zip].filter(Boolean).join(", ")}
            </div>

            {location.nickname ? (
              <div className="mt-2 inline-flex rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                {String(location.nickname)}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {customerId ? (
              <Link
                href={`/customers/${customerId}`}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                Open Customer
              </Link>
            ) : null}

            <a
              href={mapsHref({
                address_line1: location.address_line1,
                city: location.city,
                state: location.state,
                zip: (location as any).zip,
              })}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Open in Maps
            </a>
          </div>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Customer
          </div>
          <div className="mt-1 text-sm font-semibold text-gray-900">
            {customerName}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Jobs at Location
          </div>
          <div className="mt-1 text-sm font-semibold text-gray-900">
            {totalJobs}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Open Jobs
          </div>
          <div className="mt-1 text-sm font-semibold text-gray-900">
            {openJobs}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Last Activity
          </div>
          <div className="mt-1 text-sm font-semibold text-gray-900">
            {displayDateLA(lastActivityDate)}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-gray-900">Location Overview</h2>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Address
            </div>
            <div className="mt-1 text-sm font-semibold text-gray-900">
              {location.address_line1 || "—"}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Customer
            </div>
            <div className="mt-1 text-sm font-semibold text-gray-900">
              {customerId ? (
                <Link href={`/customers/${customerId}`} className="underline">
                  {customerName}
                </Link>
              ) : (
                customerName
              )}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              City / State
            </div>
            <div className="mt-1 text-sm font-semibold text-gray-900">
              {[location.city, location.state].filter(Boolean).join(", ") || "—"}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Zip
            </div>
            <div className="mt-1 text-sm font-semibold text-gray-900">
              {(location as any).zip || "—"}
            </div>
          </div>
        </div>

      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-gray-900">Location Notes</h2>
        <p className="mt-1 text-sm text-gray-600">Internal notes for this property.</p>
        <form action={updateLocationNotesFromForm} className="mt-4 space-y-3">
          <input type="hidden" name="location_id" value={locationId} />
          <textarea
            name="notes"
            defaultValue={(location as any).notes ?? ""}
            rows={5}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
            placeholder="Add notes for this location..."
          />
          <div>
            <button
              type="submit"
              className="inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Save
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
  <div className="flex items-center justify-between gap-3">
    <div>
      <h2 className="text-lg font-semibold text-gray-900">
        Jobs at This Location
      </h2>
      <p className="text-sm text-gray-600">
        Operational history for this property.
      </p>
    </div>
  </div>

  {jobRows.length > 0 && (
    <div className="mt-4 flex flex-wrap gap-3">
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm">
        <span className="font-medium text-gray-900">{openJobs}</span>
        <span className="ml-1 text-gray-500">Open</span>
      </div>
      {failedJobs > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm">
          <span className="font-medium text-red-700">{failedJobs}</span>
          <span className="ml-1 text-red-600">Failed</span>
        </div>
      )}
      {pendingInfoJobs > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm">
          <span className="font-medium text-amber-700">{pendingInfoJobs}</span>
          <span className="ml-1 text-amber-600">Pending Info</span>
        </div>
      )}
      {pendingOfficeReviewJobs > 0 && (
        <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm">
          <span className="font-medium text-cyan-700">{pendingOfficeReviewJobs}</span>
          <span className="ml-1 text-cyan-600">Pending Office Review</span>
        </div>
      )}
    </div>
  )}

  {jobRows.length === 0 ? (
    <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
      No jobs found for this location.
    </div>
  ) : (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2 text-left">Date</th>
            <th className="px-3 py-2 text-left">Title</th>
            <th className="px-3 py-2 text-left">Type</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Service Case</th>
            <th className="px-3 py-2 text-right">Action</th>
          </tr>
        </thead>

        <tbody className="divide-y">
          {jobRows.map((job) => {
            const serviceCaseId = String(job?.service_case_id ?? "").trim();

            return (
              <tr key={job.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap">
                  {displayDateLA(job.scheduled_date || job.created_at)}
                </td>

                <td className="px-3 py-2 font-medium text-gray-900">
                  {job.title || "Untitled Job"}
                </td>

                <td className="px-3 py-2">
                  {job.job_type
                    ? String(job.job_type).toUpperCase()
                    : "—"}
                </td>

                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${opsBadgeClasses(
                      job.ops_status
                    )}`}
                  >
                    {formatOpsLabel(job.ops_status || job.status)}
                  </span>
                </td>

                <td className="px-3 py-2">
                  {serviceCaseId ? (
                    <span className="text-xs text-gray-700">
                      {serviceCaseId.slice(0, 8)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>

                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/jobs/${job.id}`}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-100"
                  >
                    View Job
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  )}
</section>


    </div>
  );
}