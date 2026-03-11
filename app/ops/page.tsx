// app/ops/page
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


type BucketKey =
  | "attention"
  | "need_to_schedule"
  | "scheduled"
  | "pending_info"
  | "on_hold"
  | "failed"
  | "retest_needed"
  | "paperwork_required"
  | "invoice_required"
  | "closeout"
  | "recent_closed";

const OPS_TABS: { key: BucketKey; label: string }[] = [
  { key: "attention", label: "Needs Attention" },
  { key: "need_to_schedule", label: "Need to Schedule" },
  { key: "scheduled", label: "Scheduled" },
  { key: "pending_info", label: "Pending Info" },
  { key: "on_hold", label: "On Hold" },
  { key: "failed", label: "Failed" },
  { key: "retest_needed", label: "Retest Needed" },
  { key: "paperwork_required", label: "Paperwork Required" },
  { key: "invoice_required", label: "Invoice Required" },
  { key: "closeout", label: "Closeout" },
  { key: "recent_closed", label: "Recently Closed" },
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
  searchParams?: Promise<{
    bucket?: string;
    contractor?: string;
    q?: string;
    sort?: string;
  }>;
}) {
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const bucket = (sp.bucket ?? "need_to_schedule") as BucketKey;
  const contractor = (sp.contractor ?? "").trim() || null;
  const q = (sp.q ?? "").trim() || null;
  const sort = (sp.sort ?? "").trim() || "default";

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
  function digitsOnly(v?: string | null) {
  return String(v ?? "").replace(/\D/g, "");
}

function smsHref(phone?: string | null) {
  const p = digitsOnly(phone);
  return p ? `sms:${p}` : "";
}

function telHref(phone?: string | null) {
  const p = digitsOnly(phone);
  return p ? `tel:${p}` : "";
}

function mapsHref(address?: string | null, city?: string | null) {
  const q = [address, city].filter(Boolean).join(", ").trim();
  return q
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
    : "";
}

  function addBusinessDays(date: Date, days: number) {
  const d = new Date(date);
  let added = 0;

  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added += 1; // skip Sun/Sat
  }

  return d;
}

function subtractBusinessDays(date: Date, days: number) {
  const d = new Date(date);
  let subtracted = 0;

  while (subtracted < days) {
    d.setDate(d.getDate() - 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) subtracted += 1; // skip Sun/Sat
  }

  return d;
}

  // ✅ Counts per ops_status (exclude "closed", respect contractor filter)
let countsQ = supabase
  .from("jobs")
  .select("ops_status")
  .neq("ops_status", "closed")
  .is("deleted_at", null);

if (contractor) countsQ = countsQ.eq("contractor_id", contractor);

const { data: countRows, error: countsErr } = await countsQ;
if (countsErr) throw countsErr;

const counts = new Map<string, number>();
for (const row of countRows ?? []) {
  const key = String((row as any).ops_status ?? "");
  if (!key) continue;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

// Parents with at least one successfully resolved retest child should leave active unresolved queues.
// The parent remains historically failed, but should not stay in active Failed / Attention views.
const { data: resolvedRetestChildren, error: resolvedRetestErr } = await supabase
  .from("jobs")
  .select("parent_job_id, ops_status")
  .not("parent_job_id", "is", null)
  .in("ops_status", ["paperwork_required", "invoice_required", "closed"])
  .is("deleted_at", null);

if (resolvedRetestErr) throw resolvedRetestErr;

const resolvedFailedParentIds = new Set(
  (resolvedRetestChildren ?? [])
    .map((r: any) => String(r.parent_job_id ?? "").trim())
    .filter(Boolean)
);


  // Contractors for filter dropdown
  const { data: contractors } = await supabase
    .from("contractors")
    .select("id, name")
    .order("name", { ascending: true });

  // Common job select (keep lightweight)
 const baseSelect =
     "id, title, job_type, ops_status, field_complete, certs_complete, invoice_complete, invoice_number, scheduled_date, window_start, window_end, city, job_address, customer_first_name, customer_last_name, customer_phone, contractor_id, customer_id, deleted_at, location_id, created_at";

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
const now = new Date();

// 3 business days ago
const attentionBusinessCutoffIso = subtractBusinessDays(now, 3).toISOString();

// 14 calendar days ago
const failedCutoffIso = new Date(
  now.getTime() - 14 * 24 * 60 * 60 * 1000
).toISOString();

// 1) TODAY (scheduled jobs where scheduled_date falls within LA "today")
let todayQ = supabase
  .from("jobs")
  .select(baseSelect)
  .is("deleted_at", null)
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
  .is("deleted_at", null)
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
    .is("deleted_at", null)
    .eq("ops_status", "need_to_schedule")
    .order("created_at", { ascending: false })
    .limit(10);

  callListQ = applyCommonFilters(callListQ);

  const { data: callListJobs, error: callListErr } = await callListQ;
  if (callListErr) throw callListErr;

  // 4) NEEDS ATTENTION preview (aging-based escalation queue)
    let attentionQ = supabase
      .from("jobs")
      .select(baseSelect + ", created_at")
      .is("deleted_at", null)
      .or(
        [
          // Need to Schedule older than 3 business days
          `and(ops_status.eq.need_to_schedule,created_at.lte.${attentionBusinessCutoffIso})`,

          // Pending Info older than 3 business days
          `and(ops_status.eq.pending_info,created_at.lte.${attentionBusinessCutoffIso})`,

          // Failed older than 14 calendar days
          `and(ops_status.eq.failed,created_at.lte.${failedCutoffIso})`,
        ].join(",")
      )
      .order("created_at", { ascending: true })
      .limit(10);

    attentionQ = applyCommonFilters(attentionQ);

    const { data: attentionJobs, error: attentionErr } = await attentionQ;
    const attentionCount = attentionJobs?.length ?? 0;
    if (attentionErr) throw attentionErr;

  // 5) BUCKET list (tabs)
    let bucketQ = supabase
      .from("jobs")
      .select(baseSelect)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100);

    if (bucket === "attention") {
      bucketQ = bucketQ.or(
        [
          `and(ops_status.eq.need_to_schedule,created_at.lte.${attentionBusinessCutoffIso})`,
          `and(ops_status.eq.pending_info,created_at.lte.${attentionBusinessCutoffIso})`,
          `and(ops_status.eq.failed,created_at.lte.${failedCutoffIso})`,
        ].join(",")
      );
    } else if (bucket === "closeout") {
      bucketQ = bucketQ.in("ops_status", ["paperwork_required", "invoice_required"]);
    } else if (bucket === "recent_closed") {
      bucketQ = bucketQ
        .eq("ops_status", "closed")
        .order("created_at", { ascending: false })
        .limit(15);
    } else {
      bucketQ = bucketQ.eq("ops_status", bucket);
    }

    bucketQ = applyCommonFilters(bucketQ);

    const { data: bucketJobs, error: bucketErr } = await bucketQ;
  if (bucketErr) throw bucketErr;
  const filteredBucketJobs =
  bucket === "failed" || bucket === "attention"
    ? (bucketJobs ?? []).filter(
        (j: any) => !resolvedFailedParentIds.has(String(j.id ?? ""))
      )
    : (bucketJobs ?? []);

  // --- Customer/Location lookup maps (source-of-truth) ---
const allJobs = [
  ...(todayJobs ?? []),
  ...(upcomingJobs ?? []),
  ...(callListJobs ?? []),
  ...(attentionJobs ?? []),
  ...(filteredBucketJobs ?? [])
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

function addressParts(j: any) {
  const l = j.location_id ? locationsById.get(j.location_id) : null;
  return {
    address: l?.address_line1 ?? j.job_address ?? "",
    city: l?.city ?? j.city ?? "",
  };
}

function customerNameOnly(j: any) {
  const c = j.customer_id ? customersById.get(j.customer_id) : null;
  return (
    c?.full_name ||
    `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() ||
    `${j.customer_first_name ?? ""} ${j.customer_last_name ?? ""}`.trim() ||
    "—"
  );
}

function customerPhoneOnly(j: any) {
  const c = j.customer_id ? customersById.get(j.customer_id) : null;
  return c?.phone ?? j.customer_phone ?? "";
}

function safeDateValue(value?: string | null) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function safeText(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase();
}

function scheduledSortValue(j: any) {
  const datePart = safeDateValue(j?.scheduled_date);
  const timePart = safeText(j?.window_start);
  return { datePart, timePart };
}

function compareJobs(a: any, b: any, mode: string) {
  if (mode === "customer") {
    return customerNameOnly(a).localeCompare(customerNameOnly(b), undefined, {
      sensitivity: "base",
      numeric: true,
    });
  }

  if (mode === "address") {
    return addressLine(a).localeCompare(addressLine(b), undefined, {
      sensitivity: "base",
      numeric: true,
    });
  }

  if (mode === "created") {
    return safeDateValue(a?.created_at) - safeDateValue(b?.created_at);
  }

  if (mode === "scheduled") {
    const av = scheduledSortValue(a);
    const bv = scheduledSortValue(b);

    if (av.datePart !== bv.datePart) return av.datePart - bv.datePart;
    return av.timePart.localeCompare(bv.timePart, undefined, {
      sensitivity: "base",
      numeric: true,
    });
  }

  return 0;
}

function sortJobs(jobs: any[] | null | undefined, mode: string) {
  const list = Array.isArray(jobs) ? [...jobs] : [];
  if (!mode || mode === "default") return list;
  return list.sort((a, b) => compareJobs(a, b, mode));
}

  const selectedContractorName =
    contractor && contractors?.find((c: any) => c.id === contractor)?.name;

const sortedTodayJobs = sortJobs(todayJobs, sort === "default" ? "scheduled" : sort);
const sortedUpcomingJobs = sortJobs(upcomingJobs, sort === "default" ? "scheduled" : sort);
const sortedCallListJobs = sortJobs(callListJobs, sort === "default" ? "created" : sort);
const sortedAttentionJobs = sortJobs(attentionJobs, sort === "default" ? "created" : sort);
const sortedBucketJobs = sortJobs(filteredBucketJobs, sort);

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

        <div className="grid gap-1">
          <label className="text-xs text-gray-600">Sort</label>
          <form action="/ops" method="get" className="flex gap-2">
            <input type="hidden" name="bucket" value={bucket} />
            <input type="hidden" name="contractor" value={contractor ?? ""} />
            <input type="hidden" name="q" value={q ?? ""} />
            <select
              name="sort"
              defaultValue={sort}
              className="w-full rounded border px-3 py-2 text-sm"
            >
              <option value="default">Default queue order</option>
              <option value="customer">Customer</option>
              <option value="scheduled">Scheduled date/time</option>
              <option value="created">Created date</option>
              <option value="address">Address</option>
            </select>
            <button
              type="submit"
              className="rounded-md bg-black px-4 py-2 text-sm text-white"
            >
              Apply
            </button>
          </form>
        </div>
      </div>

      {/* Optional quick search (keep if you want it on Ops page) */}
      <div className="grid gap-1">
        <label className="text-xs text-gray-600">Quick search (optional)</label>
        <form action="/ops" method="get" className="flex gap-2">
          <input type="hidden" name="bucket" value={bucket} />
          <input type="hidden" name="contractor" value={contractor ?? ""} />
          <input type="hidden" name="sort" value={sort} />
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

      {/* Today (Scheduled) — Sorted by window_start, grouped by city */}
<div className="rounded-lg border bg-white p-4">
  <div className="flex items-center justify-between">
    <div className="text-sm font-semibold">Today (Scheduled)</div>
    <div className="text-xs text-muted-foreground">{sortedTodayJobs?.length ?? 0} jobs</div>
  </div>

  {(() => {
    const jobs = Array.isArray(sortedTodayJobs) ? [...sortedTodayJobs] : [];
    // 1) Group by city (fallback to "Unknown City")
    const groups = new Map<string, any[]>();
    for (const j of jobs) {
      const city = (j?.city || "").trim() || "Unknown City";
      if (!groups.has(city)) groups.set(city, []);
      groups.get(city)!.push(j);
    }

    // 2) Render
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
                <div
                key={j.id}
                className="rounded-md border p-3 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/jobs/${j.id}`}
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      {j.title}
                    </Link>

                    <div className="text-xs">
                      {j.customer_id ? (
                        <Link
                          href={`/customers/${j.customer_id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {customerNameOnly(j)}
                        </Link>
                      ) : (
                        <span className="font-medium text-gray-700">{customerNameOnly(j)}</span>
                      )}

                      <span className="text-muted-foreground"> • {customerPhoneOnly(j) || "—"}</span>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      {addressLine(j)}
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground text-right whitespace-nowrap">
                    {displayWindowLA(j.window_start, j.window_end) || "—"}
                  </div>
                </div>

                <div className="mt-2 flex gap-2 flex-wrap">
                  <Link
                    href={`/jobs/${j.id}`}
                    className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
                  >
                    Open Job
                  </Link>

                  {j.customer_id ? (
                    <Link
                      href={`/customers/${j.customer_id}`}
                      className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
                    >
                      Open Customer
                    </Link>
                  ) : null}

                  {telHref(customerPhoneOnly(j)) && (
                    <a
                      href={telHref(customerPhoneOnly(j))}
                      className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
                    >
                      📞 Call
                    </a>
                  )}

                  {smsHref(customerPhoneOnly(j)) && (
                    <a
                      href={smsHref(customerPhoneOnly(j))}
                      className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
                    >
                      💬 Text
                    </a>
                  )}

                  {mapsHref(j.job_address, j.city) && (
                    <a
                      href={mapsHref(j.job_address, j.city)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
                    >
                      🧭 Navigate
                    </a>
                  )}
                </div>
              </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  })()}
</div>

{/* Needs Attention */}
<div className="rounded-lg border bg-white p-4">
  <div className="flex items-center justify-between">
    <div className="text-sm font-semibold">⚠ Needs Attention</div>
    <Link
      className="text-xs underline"
      href={`/ops${buildQueryString({
        bucket: "attention",
        contractor: contractor ?? "",
        q: q ?? "",
        sort: sort ?? "",
      })}`}
    >
      View all
    </Link>
  </div>

  <div className="mt-3 space-y-2">
    {(sortedAttentionJobs ?? []).length === 0 ? (
      <div className="text-sm text-muted-foreground">
        No jobs need attention right now.
      </div>
    ) : (
      (sortedAttentionJobs ?? []).map((j: any) => (
       <div
          key={j.id}
          className="rounded-md border p-3 hover:bg-gray-50"
        >
          <div className="flex items-start justify-between gap-3">
  <div>
    <Link
      href={`/jobs/${j.id}?tab=ops`}
      className="text-sm font-medium text-blue-600 hover:underline"
    >
      {j.title}
    </Link>

    <div className="text-xs">
      {j.customer_id ? (
        <Link
          href={`/customers/${j.customer_id}`}
          className="font-medium text-blue-600 hover:underline"
        >
          {customerNameOnly(j)}
        </Link>
      ) : (
        <span className="font-medium text-gray-700">{customerNameOnly(j)}</span>
      )}

      <span className="text-muted-foreground">
        {" "}• {customerPhoneOnly(j) || "—"}
      </span>
    </div>

    <div className="text-xs text-muted-foreground">
      {addressLine(j)}
    </div>
  </div>

  <div className="text-xs font-medium text-red-600 whitespace-nowrap">
    {j.ops_status}
  </div>
</div>

<div className="mt-2 flex gap-2 flex-wrap">
  <Link
    href={`/jobs/${j.id}?tab=ops`}
    className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
  >
    Open Job
  </Link>

  {j.customer_id ? (
    <Link
      href={`/customers/${j.customer_id}`}
      className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
    >
      Open Customer
    </Link>
  ) : null}

  {telHref(customerPhoneOnly(j)) && (
    <a
      href={telHref(customerPhoneOnly(j))}
      className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
    >
      📞 Call
    </a>
  )}

  {smsHref(customerPhoneOnly(j)) && (
    <a
      href={smsHref(customerPhoneOnly(j))}
      className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
    >
      💬 Text
    </a>
  )}

  {mapsHref(addressParts(j).address, addressParts(j).city) && (
    <a
      href={mapsHref(addressParts(j).address, addressParts(j).city)}
      target="_blank"
      rel="noreferrer"
      className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
    >
      🧭 Navigate
    </a>
  )}
</div>
        </div>
      ))
    )}
  </div>
</div>

     {/* Call list preview + Upcoming */}
<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
  {/* Call List */}
  <div className="rounded-lg border bg-white p-4 text-gray-900 shadow-sm">
    <div className="flex items-center justify-between">
      <div className="text-sm font-semibold">Call List (Need to Schedule)</div>
      <Link
        className="text-xs underline"
        href={`/ops${buildQueryString({
          bucket: "need_to_schedule",
          contractor: contractor ?? "",
          q: q ?? "",
          sort: sort ?? "",
        })}`}
      >
        View all
      </Link>
    </div>

    <div className="mt-3 space-y-2">
      {(sortedCallListJobs ?? []).length === 0 ? (
        <div className="text-sm text-muted-foreground">No jobs in call list.</div>
      ) : (
        (sortedCallListJobs ?? []).map((j: any) => (
          <div
            key={j.id}
            className="rounded-md border p-3 hover:bg-gray-50"
          >
            <div>
            <Link
              href={`/jobs/${j.id}?tab=ops`}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              {j.title}
            </Link>

            <div className="text-xs">
              {j.customer_id ? (
                <Link
                  href={`/customers/${j.customer_id}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  {customerNameOnly(j)}
                </Link>
              ) : (
                <span className="font-medium text-gray-700">{customerNameOnly(j)}</span>
              )}

              <span className="text-muted-foreground"> • {customerPhoneOnly(j) || "—"}</span>
            </div>

            <div className="text-xs text-muted-foreground">
              {addressLine(j)}
            </div>
          </div>

          <div className="mt-2 flex gap-2 flex-wrap">
            <Link
              href={`/jobs/${j.id}?tab=ops`}
              className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
            >
              Open Job
            </Link>

            {j.customer_id ? (
              <Link
                href={`/customers/${j.customer_id}`}
                className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
              >
                Open Customer
              </Link>
            ) : null}

            {telHref(customerPhoneOnly(j)) && (
              <a
                href={telHref(customerPhoneOnly(j))}
                className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
              >
                📞 Call
              </a>
            )}

            {smsHref(customerPhoneOnly(j)) && (
              <a
                href={smsHref(customerPhoneOnly(j))}
                className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
              >
                💬 Text
              </a>
            )}
          </div>
          </div>
        ))
      )}
    </div>
  </div>

  {/* Upcoming */}
  <div className="rounded-lg border bg-white p-4 text-gray-900 shadow-sm">
    <div className="flex items-center justify-between">
      <div className="text-sm font-semibold">Upcoming (Scheduled)</div>
      <div className="text-xs text-muted-foreground">
        {sortedUpcomingJobs?.length ?? 0} jobs
      </div>
    </div>

    <div className="mt-3 space-y-2">
      {(sortedUpcomingJobs ?? []).length === 0 ? (
        <div className="text-sm text-muted-foreground">No upcoming scheduled jobs.</div>
      ) : (
        (sortedUpcomingJobs ?? []).map((j: any) => (
          <div
            key={j.id}
            className="rounded-md border p-3 hover:bg-gray-50"
          >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/jobs/${j.id}`}
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    {j.title}
                  </Link>
                  <div className="text-xs">
                    {j.customer_id ? (
                      <Link
                        href={`/customers/${j.customer_id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {customerNameOnly(j)}
                      </Link>
                    ) : (
                      <span className="font-medium text-gray-700">{customerNameOnly(j)}</span>
                    )}

                    <span className="text-muted-foreground">
                      {" "}• {customerPhoneOnly(j) || "—"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {addressLine(j)}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  <div>
                    {j.scheduled_date ? new Date(j.scheduled_date).toLocaleDateString() : "—"}
                  </div>
                  {(j.window_start || j.window_end) && (
                    <div className="mt-1 text-[11px] text-gray-600">
                      {j.window_start ?? "—"}{j.window_start && j.window_end ? " - " : ""}{j.window_end ?? ""}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-2 flex gap-2 flex-wrap">

                <Link
                  href={`/jobs/${j.id}`}
                  className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
                >
                  Open Job
                </Link>

                {j.customer_id ? (
                  <Link
                    href={`/customers/${j.customer_id}`}
                    className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
                  >
                    Open Customer
                  </Link>
                ) : null}

                {telHref(customerPhoneOnly(j)) && (
                  <a
                    href={telHref(customerPhoneOnly(j))}
                    className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
                  >
                    📞 Call
                  </a>
                )}

                {smsHref(customerPhoneOnly(j)) && (
                  <a
                    href={smsHref(customerPhoneOnly(j))}
                    className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
                  >
                    💬 Text
                  </a>
                )}

                {mapsHref(addressParts(j).address, addressParts(j).city) && (
                  <a
                    href={mapsHref(addressParts(j).address, addressParts(j).city)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
                  >
                    🧭 Navigate
                  </a>
                )}

              </div>
          </div>
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
    const count =
  t.key === "attention"
    ? attentionCount
    : t.key === "recent_closed"
    ? 0
    : (counts.get(t.key) ?? 0);
    const active = bucket === t.key;

    // Show tab only if it has jobs OR it's the active tab OR it's Closed
    return count > 0 || active || t.key === "recent_closed";
  })

  .map((t) => {
    const href = `/ops${buildQueryString({
      bucket: t.key,
      contractor: contractor ?? "",
      q: q ?? "",
      sort: sort ?? "",
    })}`;

    const active = bucket === t.key;
    const count =
    t.key === "attention"
      ? attentionCount
      : t.key === "recent_closed"
      ? 0
      : (counts.get(t.key) ?? 0);

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

          {/* Badge */}
          {t.key !== "recent_closed" && count > 0 && (
            <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs">
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
          {(sortedBucketJobs ?? []).length === 0 ? (
            <div className="text-sm text-blue-600">No jobs in this queue.</div>
          ) : (
            (sortedBucketJobs ?? []).map((j: any) => (
              <div
  key={j.id}
  className="rounded-md border border-gray-200 bg-white p-3 shadow-sm hover:bg-gray-50 transition"
>
    <div className="flex items-start justify-between gap-3">
      <div>
        <Link
          href={`/jobs/${j.id}?tab=ops`}
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          {j.title}
        </Link>
        <div className="text-xs">
          {j.customer_id ? (
            <Link
              href={`/customers/${j.customer_id}`}
              className="font-medium text-blue-600 hover:underline"
            >
              {customerNameOnly(j)}
            </Link>
          ) : (
            <span className="font-medium text-gray-700">{customerNameOnly(j)}</span>
          )}

          <span className="text-gray-600"> • {customerPhoneOnly(j) || "—"}</span>
        </div>
        <div className="text-xs text-gray-600">
          {addressLine(j)}
        </div>
      </div>
      <div className="text-xs text-gray-500 text-right">
  <div>
    {j.scheduled_date ? new Date(j.scheduled_date).toLocaleDateString() : ""}
  </div>
  {(j.window_start || j.window_end) && (
    <div className="mt-1 text-[11px] text-gray-600">
      {j.window_start ?? "—"}{j.window_start && j.window_end ? " - " : ""}{j.window_end ?? ""}
    </div>
  )}
</div>
    </div>

      <div className="mt-3 flex flex-wrap gap-2">
      <Link
        href={`/jobs/${j.id}?tab=ops`}
        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 hover:bg-gray-100"
      >
        Open Job
      </Link>

      {j.customer_id ? (
        <Link
          href={`/customers/${j.customer_id}`}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 hover:bg-gray-100"
        >
          Open Customer
        </Link>
      ) : null}

      {telHref(customerPhoneOnly(j)) && (
        <a
          href={telHref(customerPhoneOnly(j))}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 hover:bg-gray-100"
        >
          📞 Call
        </a>
      )}

      {smsHref(customerPhoneOnly(j)) && (
        <a
          href={smsHref(customerPhoneOnly(j))}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 hover:bg-gray-100"
        >
          💬 Text
        </a>
      )}

      {mapsHref(addressParts(j).address, addressParts(j).city) && (
        <a
          href={mapsHref(addressParts(j).address, addressParts(j).city)}
          target="_blank"
          rel="noreferrer"
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 hover:bg-gray-100"
        >
          🧭 Navigate
        </a>
      )}
    </div>
</div>
            ))
          )}
        </div>
    </div>
  );
}
