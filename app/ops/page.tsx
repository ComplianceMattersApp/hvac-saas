// app/ops/page.tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ContractorFilter from "./_components/ContractorFilter";
import Image from "next/image";


function startOfDayUtcForTimeZone(timeZone: string, d = new Date()) {
  // Get the calendar date in the target timezone
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const y = Number(parts.find(p => p.type === "year")?.value);
  const m = Number(parts.find(p => p.type === "month")?.value);
  const day = Number(parts.find(p => p.type === "day")?.value);

  // Initial guess: midnight UTC on that date
  let utcMs = Date.UTC(y, m - 1, day, 0, 0, 0);

  // Helper to get TZ offset minutes at a UTC instant (e.g., "GMT-08:00")
  const getOffsetMinutes = (utcMillis: number) => {
    const tzParts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(utcMillis));

    const tzName = tzParts.find(p => p.type === "timeZoneName")?.value || "GMT+00:00";
    const m = tzName.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
    if (!m) return 0;

    const sign = m[1].startsWith("-") ? -1 : 1;
    const hours = Math.abs(Number(m[1]));
    const mins = m[2] ? Number(m[2]) : 0;
    return sign * (hours * 60 + mins);
  };

  // Iterate to align the instant to local midnight in that timezone
  for (let i = 0; i < 2; i++) {
    const offset = getOffsetMinutes(utcMs);
    utcMs = Date.UTC(y, m - 1, day, 0, 0, 0) - offset * 60 * 1000;
  }

  return new Date(utcMs).toISOString();
}


type OpsStatus =
  | "need_to_schedule"
  | "scheduled"
  | "pending_info"
  | "on_hold"
  | "failed"
  | "retest_needed"
  | "paperwork_required"
  | "invoice_required"
  | "closed";

const OPS_TABS: { key: OpsStatus; label: string }[] = [
  { key: "need_to_schedule", label: "Need to Schedule" },
  { key: "scheduled", label: "Scheduled" },
  { key: "pending_info", label: "Pending Info" },
  { key: "on_hold", label: "On Hold" },
  { key: "failed", label: "Failed" },
  { key: "retest_needed", label: "Retest Needed" },
  { key: "paperwork_required", label: "Paperwork Required" },
  { key: "invoice_required", label: "Invoice Required" },
  { key: "closed", label: "Closed" },
];

function startOfTodayLocalISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfTomorrowLocalISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function buildQueryString(params: Record<string, string | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && String(v).trim() !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default async function OpsPage({
  searchParams,
}: {
  searchParams?: Promise<{ bucket?: string; contractor?: string; q?: string }>;
}) {
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const bucket = (sp.bucket ?? "need_to_schedule") as OpsStatus;
  const contractor = (sp.contractor ?? "").trim() || null;
  const q = (sp.q ?? "").trim() || null;

  const supabase = await createClient();

  // Contractors for filter dropdown
  const { data: contractors } = await supabase
    .from("contractors")
    .select("id, name")
    .order("name", { ascending: true });

  // Common job select (keep lightweight)
  const baseSelect =
    "id, title, job_type, ops_status, scheduled_date, window_start, window_end, city, job_address, customer_first_name, customer_last_name, customer_phone, contractor_id";

  // Helper to apply filters
  const applyCommonFilters = (qb: any) => {
    if (contractor) qb = qb.eq("contractor_id", contractor);

    // If you want search to work here too (optional), we can filter by name/phone/address.
    // Supabase OR filter is string-based; keep it simple for now.
    if (q) {
      const like = `%${q}%`;
      qb = qb.or(
        [
          `title.ilike.${like}`,
          `customer_first_name.ilike.${like}`,
          `customer_last_name.ilike.${like}`,
          `customer_phone.ilike.${like}`,
          `job_address.ilike.${like}`,
          `city.ilike.${like}`,
        ].join(",")
      );
    }

    return qb;
  };

  // ✅ LA "today" boundaries expressed as UTC timestamps (matches your stored scheduled_date)
const laToday = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
    }).format(new Date()); // "YYYY-MM-DD"

const todayStart = startOfDayUtcForTimeZone("America/Los_Angeles");
const tomorrowStart = new Date(new Date(todayStart).getTime() + 24 * 60 * 60 * 1000).toISOString();


  // 1) TODAY (ONLY scheduled jobs for today)
  let todayQ = supabase
    .from("jobs")
    .select(baseSelect)
    .eq("ops_status", "scheduled")
    .gte("scheduled_date", todayStart)
    .lt("scheduled_date", tomorrowStart)
    .order("window_start", { ascending: true })
    .order("scheduled_date", { ascending: true });

  todayQ = applyCommonFilters(todayQ);

  const { data: todayJobs, error: todayErr } = await todayQ;
  if (todayErr) throw todayErr;

  // 2) UPCOMING (scheduled jobs after today)
  let upcomingQ = supabase
    .from("jobs")
    .select(baseSelect)
    .eq("ops_status", "scheduled")
    .gte("scheduled_date", tomorrowStart)
    .order("scheduled_date", { ascending: true })
    .limit(25);

  upcomingQ = applyCommonFilters(upcomingQ);

  const { data: upcomingJobs, error: upcomingErr } = await upcomingQ;
  if (upcomingErr) throw upcomingErr;

  // 3) CALL LIST preview (need_to_schedule)
  let callListQ = supabase
    .from("jobs")
    .select(baseSelect)
    .eq("ops_status", "need_to_schedule")
    .order("created_at", { ascending: false })
    .limit(10);

  callListQ = applyCommonFilters(callListQ);

  const { data: callListJobs, error: callListErr } = await callListQ;
  if (callListErr) throw callListErr;

  // 4) BUCKET list (tabs)
  let bucketQ = supabase
    .from("jobs")
    .select(baseSelect)
    .eq("ops_status", bucket)
    .order("created_at", { ascending: false })
    .limit(100);

  bucketQ = applyCommonFilters(bucketQ);

  const { data: bucketJobs, error: bucketErr } = await bucketQ;
  if (bucketErr) throw bucketErr;

  const selectedContractorName =
    contractor && contractors?.find((c: any) => c.id === contractor)?.name;

  return (
  <div className="mx-auto max-w-5xl p-4 space-y-4 text-gray-900">
{/* Header */}
<div className="rounded-xl border bg-gradient-to-b from-white to-gray-50 p-4 sm:p-6 shadow-sm">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900">
          Ops Dashboard
        </h1>

        {/* Current bucket pill */}
        <span className="inline-flex h-6 items-center rounded-full border bg-white px-2 text-xs font-medium text-gray-700">
         {OPS_TABS.find((t) => t.key === bucket)?.label ?? "Ops"}
</span>
      </div>
      

      <p className="text-sm text-gray-600">
        {selectedContractorName ? `Filtered: ${selectedContractorName}` : "All contractors"}
      </p>
    </div>

    <div className="flex flex-wrap gap-2">
      <Link
        href="/jobs/new"
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-900"
      >
        + New Job
      </Link>

      <Link
  href="/contractors"
  className="rounded-md border bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
>
  Add Contractors
</Link>


      <Link
        href="/calendar"
        className="rounded-md border bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
      >
        View Calendar
      </Link>

      <Link
        href="/customers"
        className="rounded-md border bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
      >
        Search Customers
      </Link>
    </div>
  </div>
</div>


    {/* Filters */}
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ContractorFilter contractors={contractors ?? []} selectedId={contractor ?? ""} />
      </div>

      {/* Optional quick search (keep if you want it on Ops page) */}
      <div className="grid gap-1">
        <label className="text-xs text-gray-600">Quick search (optional)</label>
        <form action="/ops" method="get" className="flex gap-2">
          <input type="hidden" name="bucket" value={bucket} />
          <input type="hidden" name="contractor" value={contractor ?? ""} />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Name, phone, address, city, title…"
            className="w-full rounded border px-3 py-2 text-sm"
          />
          <button className="rounded-md bg-black px-4 py-2 text-sm text-white" type="submit">
            Search
          </button>
        </form>
      </div>

      <div className="text-xs text-muted-foreground">
        For full customer search and job history, use <span className="font-medium">/customers</span>.
      </div>
    </div>




      {/* Today */}
      {/* Today (Scheduled) — Sorted by window_start, grouped by city */}
<div className="rounded-lg border bg-white p-4">
  <div className="flex items-center justify-between">
    <div className="text-sm font-semibold">Today (Scheduled)</div>
    <div className="text-xs text-muted-foreground">{todayJobs?.length ?? 0} jobs</div>
  </div>

  {(() => {
    const jobs = Array.isArray(todayJobs) ? [...todayJobs] : [];

    // 1) Sort by window_start (nulls last)
    jobs.sort((a: any, b: any) => {
      const at = a?.window_start ? new Date(a.window_start).getTime() : Number.POSITIVE_INFINITY;
      const bt = b?.window_start ? new Date(b.window_start).getTime() : Number.POSITIVE_INFINITY;
      return at - bt;
    });

    // 2) Group by city (fallback to "Unknown City")
    const groups = new Map<string, any[]>();
    for (const j of jobs) {
      const city = (j?.city || "").trim() || "Unknown City";
      if (!groups.has(city)) groups.set(city, []);
      groups.get(city)!.push(j);
    }

    // 3) Render
    if (jobs.length === 0) {
      return <div className="mt-3 text-sm text-muted-foreground">No scheduled jobs for today.</div>;
    }

    return (
      <div className="mt-3 space-y-4">
        {Array.from(groups.entries()).map(([city, cityJobs]) => (
          <div key={city} className="rounded-md border">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
              <div className="text-sm font-semibold">{city}</div>
              <div className="text-xs text-muted-foreground">{cityJobs.length} job(s)</div>
            </div>

            <div className="p-3 space-y-2">
              {cityJobs.map((j: any) => (
                <Link
                  key={j.id}
                  href={`/jobs/${j.id}`}
                  className="block rounded-md border p-3 hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{j.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {(j.customer_first_name ?? "") + " " + (j.customer_last_name ?? "")} •{" "}
                        {j.customer_phone ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {j.job_address ?? "—"}, {j.city ?? "—"}
                      </div>
                    </div>

<div className="text-xs text-muted-foreground text-right whitespace-nowrap">
  {j.window_start
    ? new Date(j.window_start).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Los_Angeles",
      })
    : "—"}
  {j.window_end
    ? `–${new Date(j.window_end).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Los_Angeles",
      })}`
    : ""}
</div>

                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  })()}
</div>

      {/* Call list preview + Upcoming */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-white p-4 text-gray-900 shadow-sm">

          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Call List (Need to Schedule)</div>
            <Link
              className="text-xs underline"
              href={`/ops${buildQueryString({ bucket: "need_to_schedule", contractor: contractor ?? "", q: q ?? "" })}`}
            >
              View all
            </Link>
          </div>

          <div className="mt-3 space-y-2">
            {(callListJobs ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">No jobs in call list.</div>
            ) : (
              (callListJobs ?? []).map((j: any) => (
                <Link
                  key={j.id}
                  href={`/jobs/${j.id}?tab=ops`}
                  className="block rounded-md border p-3 hover:bg-gray-50"
                >
                  <div className="text-sm font-medium">{j.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {j.customer_first_name ?? ""} {j.customer_last_name ?? ""} •{" "}
                    {j.customer_phone ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {j.job_address ?? "—"}, {j.city ?? "—"}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4 text-gray-900 shadow-sm">

          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Upcoming (Scheduled)</div>
            <div className="text-xs text-muted-foreground">{upcomingJobs?.length ?? 0} jobs</div>
          </div>

          <div className="mt-3 space-y-2">
            {(upcomingJobs ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">No upcoming scheduled jobs.</div>
            ) : (
              (upcomingJobs ?? []).map((j: any) => (
                <Link
                  key={j.id}
                  href={`/jobs/${j.id}`}
                  className="block rounded-md border p-3 hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{j.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {j.customer_first_name ?? ""} {j.customer_last_name ?? ""} •{" "}
                        {j.customer_phone ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {j.job_address ?? "—"}, {j.city ?? "—"}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground text-right">
                      {j.scheduled_date ? new Date(j.scheduled_date).toLocaleDateString() : "—"}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Queue Tabs */}
      <div className="rounded-lg border bg-white p-4 space-y-3">
        <div className="text-sm font-semibold">Queues</div>

        <div className="flex flex-wrap gap-2">
          {OPS_TABS.map((t) => {
            const href = `/ops${buildQueryString({
              bucket: t.key,
              contractor: contractor ?? "",
              q: q ?? "",
            })}`;
            const active = bucket === t.key;
            return (
              <Link
                key={t.key}
                href={href}
                className={[
                  "rounded-full border px-3 py-1 text-sm",
                  active ? "bg-black text-white" : "bg-white",
                ].join(" ")}
              >
                {t.label}
              </Link>
            );
          })}
        </div>

        <div className="text-xs text-muted-foreground">
          Showing: <span className="font-medium">{bucket}</span>
        </div>

        <div className="space-y-2">
          {(bucketJobs ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">No jobs in this queue.</div>
          ) : (
            (bucketJobs ?? []).map((j: any) => (
              <Link
                key={j.id}
                href={`/jobs/${j.id}?tab=ops`}
                className="block rounded-md border p-3 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{j.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {j.customer_first_name ?? ""} {j.customer_last_name ?? ""} •{" "}
                      {j.customer_phone ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {j.job_address ?? "—"}, {j.city ?? "—"}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground text-right">
                    {j.scheduled_date ? new Date(j.scheduled_date).toLocaleDateString() : ""}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
