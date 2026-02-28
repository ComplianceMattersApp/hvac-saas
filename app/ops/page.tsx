// app/ops/page.tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ContractorFilter from "./_components/ContractorFilter";
import { redirect } from "next/navigation";

import {
  displayDateLA,
  displayWindowLA,
  startOfTodayUtcIsoLA,
  startOfTomorrowUtcIsoLA,
} from "@/lib/utils/schedule-la";


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

 //Helper for dashboard time view

 function timeToDisplay(t?: string | null) {
  if (!t) return "";
  const s = String(t).trim();
  if (!s) return "";
  // Accept "HH:MM:SS" or "HH:MM"
  const hhmm = /^\d{2}:\d{2}/.test(s) ? s.slice(0, 5) : "";
  return hhmm || "";
}

function windowToDisplay(start?: string | null, end?: string | null) {
  const a = timeToDisplay(start);
  const b = timeToDisplay(end);
  if (!a && !b) return "";
  if (a && b) return `${a}–${b}`;
  return a || b;
}


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

const { data: userData } = await supabase.auth.getUser();
const user = userData?.user;

if (!user) redirect("/login");

const { data: cu, error: cuErr } = await supabase
  .from("contractor_users")
  .select("contractor_id")
  .eq("user_id", user.id)
  .maybeSingle();

if (cuErr) throw cuErr;

if (cu?.contractor_id) {
  redirect("/jobs/new");
}

  // ✅ Counts per ops_status (exclude "closed", respect contractor filter)
let countsQ = supabase
  .from("jobs")
  .select("ops_status")
  .neq("ops_status", "closed");

if (contractor) countsQ = countsQ.eq("contractor_id", contractor);

const { data: countRows, error: countsErr } = await countsQ;
if (countsErr) throw countsErr;

const counts = new Map<string, number>();
for (const row of countRows ?? []) {
  const key = String((row as any).ops_status ?? "");
  if (!key) continue;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}


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

// ✅ Today in LA as "YYYY-MM-DD" (matches jobs.scheduled_date type = DATE)
// Canonical LA day boundaries, expressed as UTC ISO instants for timestamptz comparisons
const startTodayUtc = startOfTodayUtcIsoLA();
const startTomorrowUtc = startOfTomorrowUtcIsoLA();

// 1) TODAY (scheduled jobs where scheduled_date falls within LA "today")
let todayQ = supabase
  .from("jobs")
  .select(baseSelect)
  .eq("ops_status", "scheduled")
  .gte("scheduled_date", startTodayUtc)
  .lt("scheduled_date", startTomorrowUtc)
  .order("window_start", { ascending: true });

todayQ = applyCommonFilters(todayQ);

const { data: todayJobs, error: todayErr } = await todayQ;
if (todayErr) throw todayErr;

// 2) UPCOMING (scheduled jobs on/after LA tomorrow)
let upcomingQ = supabase
  .from("jobs")
  .select(baseSelect)
  .eq("ops_status", "scheduled")
  .gte("scheduled_date", startTomorrowUtc)
  .order("scheduled_date", { ascending: true })
  .order("window_start", { ascending: true })
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

  // --- Customer/Location lookup maps (source-of-truth) ---
const allJobs = [
  ...(todayJobs ?? []),
  ...(upcomingJobs ?? []),
  ...(callListJobs ?? []),
  ...(bucketJobs ?? []),
] as any[];

const customerIds = Array.from(
  new Set(allJobs.map((j) => j.customer_id).filter(Boolean))
) as string[];

const locationIds = Array.from(
  new Set(allJobs.map((j) => j.location_id).filter(Boolean))
) as string[];

const [custRes, locRes] = await Promise.all([
  customerIds.length
    ? supabase
        .from("customers")
        .select("id, full_name, first_name, last_name, phone")
        .in("id", customerIds)
    : Promise.resolve({ data: [] as any[], error: null }),

  locationIds.length
    ? supabase
        .from("locations")
        .select("id, address_line1, city, state, zip, postal_code")
        .in("id", locationIds)
    : Promise.resolve({ data: [] as any[], error: null }),
]);

if (custRes.error) throw custRes.error;
if (locRes.error) throw locRes.error;

const customersById = new Map((custRes.data ?? []).map((c: any) => [c.id, c]));
const locationsById = new Map((locRes.data ?? []).map((l: any) => [l.id, l]));

// helpers used in JSX (prefer truth tables, fallback to job snapshot)
function customerLine(j: any) {
  const c = j.customer_id ? customersById.get(j.customer_id) : null;
  const name =
    (c?.full_name ||
      `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() ||
      `${j.customer_first_name ?? ""} ${j.customer_last_name ?? ""}`.trim() ||
      "—");

  const phone = c?.phone ?? j.customer_phone ?? "—";
  return `${name} • ${phone}`;
}

function addressLine(j: any) {
  const l = j.location_id ? locationsById.get(j.location_id) : null;
  const addr = l?.address_line1 ?? j.job_address ?? "—";
  const city = l?.city ?? j.city ?? "—";
  return `${addr}, ${city}`;
}

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
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-white"
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
    <div className="rounded-lg border bg-white p-4 shadow-sm">
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
  const at = a?.window_start
    ? parseInt(a.window_start.slice(0, 2)) * 60 +
      parseInt(a.window_start.slice(3, 5))
    : Number.POSITIVE_INFINITY;

  const bt = b?.window_start
    ? parseInt(b.window_start.slice(0, 2)) * 60 +
      parseInt(b.window_start.slice(3, 5))
    : Number.POSITIVE_INFINITY;

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
                        {addressLine(j)}
                      </div>
                    </div>

                  <div className="text-xs text-muted-foreground text-right whitespace-nowrap">
                    {displayWindowLA(j.window_start, j.window_end) || "—"}
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
                    {customerLine(j)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {addressLine(j)}
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
                        {customerLine(j)}
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
    {OPS_TABS
  .filter((t) => {
    const count = counts.get(t.key) ?? 0;
    const active = bucket === t.key;

    // Show tab only if it has jobs OR it's the active tab OR it's Closed
    return count > 0 || active || t.key === "closed";
  })
  .map((t) => {
    const href = `/ops${buildQueryString({
      bucket: t.key,
      contractor: contractor ?? "",
      q: q ?? "",
    })}`;

    const active = bucket === t.key;
    const count = counts.get(t.key) ?? 0;

    return (
      <Link
        key={t.key}
        href={href}
        className={[
          "rounded-full border px-3 py-1 text-sm transition font-medium",
          active
            ? "bg-black text-white border-black"
            : "bg-white text-gray-900 border-gray-300 hover:bg-gray-100",
        ].join(" ")}
      >
        <span className="flex items-center gap-2">
          {t.label}

          {/* Badge: show only if count > 0 OR it's Closed (always visible) */}
          {(count > 0 || t.key === "closed") && (
            <span
              className={[
                "rounded-full border px-3 py-1 text-sm transition font-medium",
                active
                  ? "bg-black text-white border-black"
                  : "bg-white text-gray-900 border-gray-300 hover:bg-gray-100",
              ].join(" ")}
            >
              {count}
            </span>
          )}
        </span>
      </Link>
    );
  })}
  </div>
</div>

 
        <div className="text-xs text-blue-600">
          Showing: <span className="font-medium">{bucket}</span>
        </div>

        <div className="space-y-2">
          {(bucketJobs ?? []).length === 0 ? (
            <div className="text-sm text-blue-600">No jobs in this queue.</div>
          ) : (
            (bucketJobs ?? []).map((j: any) => (
              <Link
                key={j.id}
                href={`/jobs/${j.id}?tab=ops`}
                className="block rounded-md border bg-white p-3 hover:bg-gray-50 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{j.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {customerLine(j)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {addressLine(j)}
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
  );
}
