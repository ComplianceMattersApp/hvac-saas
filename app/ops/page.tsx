// app/ops/page
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import ContractorFilter from "./_components/ContractorFilter";
import { redirect } from "next/navigation";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";

import {
  displayDateLA,
  displayWindowLA,
  startOfTodayUtcIsoLA,
  startOfTomorrowUtcIsoLA,
} from "@/lib/utils/schedule-la";
import { getCloseoutNeeds, isInCloseoutQueue } from "@/lib/utils/closeout";


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
  { key: "paperwork_required", label: "Status: Paperwork Required" },
  { key: "invoice_required", label: "Status: Invoice Required" },
  { key: "closeout", label: "Closeout Work Queue" },
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
  signal?: string;
  panel?: string;
}>;
}) {
  
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const bucket = (sp.bucket ?? "need_to_schedule") as BucketKey;
  const contractor = (sp.contractor ?? "").trim() || null;
  const q = (sp.q ?? "").trim() || null;
  const sort = (sp.sort ?? "").trim() || "default";
  const panel = (sp.panel ?? "").trim().toLowerCase();

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;

  const signal = (sp.signal ?? "").trim().toLowerCase() || "";

  if (!user) redirect("/login");

  let isAdmin = false;

  try {
    const { internalUser } = await requireInternalUser({
      supabase,
      userId: user.id,
    });
    isAdmin = internalUser.role === "admin";
  } catch (error) {
    if (isInternalAccessError(error)) {
      const { data: cu, error: cuErr } = await supabase
        .from("contractor_users")
        .select("contractor_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cuErr) throw cuErr;

      if (cu?.contractor_id) {
        redirect("/portal");
      }

      redirect("/login");
    }

    throw error;
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

function mapsHref(parts: { address?: string | null; city?: string | null }) {
  const q = [parts.address, parts.city]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(", ");

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
  .select("id, ops_status")
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

const { count: recentClosedCount, error: recentClosedErr } = await supabase
  .from("jobs")
  .select("id", { count: "exact", head: true })
  .eq("ops_status", "closed")
  .is("deleted_at", null);

if (recentClosedErr) throw recentClosedErr;

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
     "id, title, job_type, ops_status, field_complete, field_complete_at, certs_complete, invoice_complete, invoice_number, scheduled_date, window_start, window_end, city, job_address, customer_first_name, customer_last_name, customer_phone, contractor_id, customer_id, deleted_at, location_id, created_at";

  // Helper to apply filters
  const applyCommonFilters = (qb: any) => {
    if (contractor) qb = qb.eq("contractor_id", contractor);

    if (q) {
      // Use * as wildcard in .or() strings — % is for direct .ilike() only;
      // commas/parens must be stripped to avoid breaking the OR clause parser.
      const safe = q.replace(/[,()\\]/g, "").trim();
      qb = qb.or(
        [
          `title.ilike.*${safe}*`,
          `customer_first_name.ilike.*${safe}*`,
          `customer_last_name.ilike.*${safe}*`,
          `customer_email.ilike.*${safe}*`,
          `customer_phone.ilike.*${safe}*`,
          `job_address.ilike.*${safe}*`,
          `city.ilike.*${safe}*`,
          `permit_number.ilike.*${safe}*`,
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

// 1) FIELD WORK (scheduled today in LA and not field-complete)
let fieldWorkQ = supabase
  .from("jobs")
  .select(baseSelect)
  .is("deleted_at", null)
  .eq("field_complete", false)
  .gte("scheduled_date", startTodayUtc)
  .lt("scheduled_date", startTomorrowUtc)
  .order("window_start", { ascending: true });

fieldWorkQ = applyCommonFilters(fieldWorkQ);

const { data: fieldWorkJobs, error: fieldWorkErr } = await fieldWorkQ;
if (fieldWorkErr) throw fieldWorkErr;

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

    // 4) CLOSEOUT COMMAND BOARD (derived from field_complete + remaining office obligations)
    let closeoutQ = supabase
      .from("jobs")
      .select(baseSelect)
      .is("deleted_at", null)
      .eq("field_complete", true)
      .order("field_complete_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(100);

    closeoutQ = applyCommonFilters(closeoutQ);

    const { data: closeoutSourceJobs, error: closeoutErr } = await closeoutQ;
    if (closeoutErr) throw closeoutErr;

    // 5) EXCEPTIONS: Still Open (scheduled before today in LA and not field-complete)
    let stillOpenQ = supabase
      .from("jobs")
      .select(baseSelect)
      .is("deleted_at", null)
      .neq("ops_status", "closed")
      .eq("field_complete", false)
      .lt("scheduled_date", startTodayUtc)
      .order("scheduled_date", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(100);

    stillOpenQ = applyCommonFilters(stillOpenQ);

    const { data: stillOpenJobs, error: stillOpenErr } = await stillOpenQ;
    if (stillOpenErr) throw stillOpenErr;

    // 6) NEEDS ATTENTION preview (aging-based escalation queue)
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

  // 7) BUCKET list (tabs)
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
      bucketQ = bucketQ
        .eq("field_complete", true)
        .neq("ops_status", "closed");
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
    : bucket === "closeout"
      ? (bucketJobs ?? []).filter((j: any) => isInCloseoutQueue(j))
      : (bucketJobs ?? []);

  // --- Customer/Location lookup maps (source-of-truth) ---
const allJobs = [
  ...(fieldWorkJobs ?? []),
  ...(upcomingJobs ?? []),
  ...(callListJobs ?? []),
  ...(closeoutSourceJobs ?? []),
  ...(stillOpenJobs ?? []),
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
  const parts = addressParts(j);
  const out = [parts.address, parts.city].filter(Boolean).join(", ");
  return out || "—";
}

function addressParts(j: any) {
  const l = j.location_id ? locationsById.get(j.location_id) : null;

  return {
    address:
      String(l?.address_line1 ?? "").trim() ||
      String(j.address_line1 ?? "").trim() ||
      String(j.job_address ?? "").trim() ||
      "",
    city:
      String(l?.city ?? "").trim() ||
      String(j.city ?? "").trim() ||
      "",
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

function queueReason(j: any, activeBucket: string) {
  const status = String(j?.ops_status ?? "").toLowerCase();

  if (activeBucket === "attention") {
    if (status === "need_to_schedule") {
      return "Needs attention — no scheduling activity in 3+ business days";
    }
    if (status === "pending_info") {
      return "Needs attention — pending info older than 3 business days";
    }
    if (status === "failed") {
      return "Needs attention — failed job unresolved for 14+ days";
    }
    return "Needs attention — requires follow-up";
  }

  if (activeBucket === "pending_info" || status === "pending_info") {
    return "Waiting for required information";
  }

  if (activeBucket === "failed" || status === "failed") {
    return "Test failed — awaiting correction or retest";
  }

  if (activeBucket === "retest_needed" || status === "retest_needed") {
    return "Retest required — awaiting contractor action";
  }

  if (activeBucket === "on_hold" || status === "on_hold") {
    return "On hold — awaiting resolution before closeout";
  }

  if (activeBucket === "need_to_schedule" || status === "need_to_schedule") {
    return "Waiting to be scheduled";
  }

  if (activeBucket === "paperwork_required" || status === "paperwork_required") {
    return "Status bucket — certs or closeout paperwork still needed";
  }

  if (activeBucket === "invoice_required" || status === "invoice_required") {
    return "Status bucket — invoice still needed";
  }

  if (activeBucket === "closeout") {
    const needs = getCloseoutNeeds(j);
    if (needs.needsInvoice && needs.needsCerts) return "Closeout work queue — invoice and certs still needed";
    if (needs.needsCerts) return "Closeout work queue — certs still needed";
    if (needs.needsInvoice) return "Closeout work queue — invoice still needed";
    return "Closeout work queue";
  }

  return "";
}

function hasOpenRetestChild(jobId: string, jobs: any[]) {
  return jobs.some(
    (j: any) =>
      String(j.parent_job_id ?? "") === String(jobId) &&
      String(j.ops_status ?? "").toLowerCase() !== "closed"
  );
}

function nextActionLabel(j: any, opts?: { retestReady?: boolean; newContractorJob?: boolean }) {
  const status = String(j?.ops_status ?? "").toLowerCase();
  const needs = getCloseoutNeeds(j);

  if (status === "failed" && opts?.retestReady) return "Create Retest Job";
  if (status === "failed") return "Await Contractor Correction";
  if (status === "retest_needed") return "Await Contractor Retest";
  if (status === "need_to_schedule" && opts?.newContractorJob) return "Review & Schedule";
  if (status === "need_to_schedule") return "Schedule Visit";
  if (status === "pending_info") return "Get Missing Info";
  if (status === "on_hold") return "Review Hold Reason";
  if (needs.needsInvoice && needs.needsCerts) return "Finish Closeout";
  if (needs.needsCerts) return "Send Certs";
  if (needs.needsInvoice) return "Send Invoice";
  if (status === "exception") return "Resolve Exception";
  if (status === "scheduled") return "Prepare for Visit";

  return "Open Job";
}

function signalReason(j: any, opts?: { retestReady?: boolean; newContractorJob?: boolean }) {
  if (opts?.retestReady) return "Contractor says correction is complete and job is ready for retest review";
  if (opts?.newContractorJob) return "New job submitted by contractor and waiting for internal review";
  return queueReason(j, bucket);
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

const uniqueAllOpenOpsJobs = Array.from(
  new Map(
    allJobs
      .filter((j: any) => String(j?.ops_status ?? "").toLowerCase() !== "closed")
      .map((j: any) => [String(j.id ?? ""), j])
  ).values()
) as any[];

const allOpenOpsJobIds = uniqueAllOpenOpsJobs
  .map((j: any) => String(j.id ?? ""))
  .filter(Boolean);

const { data: signalEvents, error: signalErr } = await supabase
  .from("job_events")
  .select("job_id, event_type, created_at, meta")
  .in(
    "job_id",
    allOpenOpsJobIds.length
      ? allOpenOpsJobIds
      : ["00000000-0000-0000-0000-000000000000"]
  )
  .in("event_type", [
    "retest_ready_requested",
    "contractor_job_created",
    "contractor_note",
    "contractor_correction_submission",
    "attachment_added",
    "permit_info_updated",
  ])
  .order("created_at", { ascending: false });

if (signalErr) throw signalErr;

const latestRetestReadyByJob = new Map<string, any>();
const latestContractorCreatedByJob = new Map<string, any>();
const latestContractorUpdateByJob = new Map<string, any>();

for (const ev of signalEvents ?? []) {
  const jobId = String((ev as any).job_id ?? "");
  const type = String((ev as any).event_type ?? "");

  if (type === "retest_ready_requested" && !latestRetestReadyByJob.has(jobId)) {
    latestRetestReadyByJob.set(jobId, ev);
  }

  if (type === "contractor_job_created" && !latestContractorCreatedByJob.has(jobId)) {
    latestContractorCreatedByJob.set(jobId, ev);
  }

  if (
    [
      "contractor_note",
      "contractor_correction_submission",
      "attachment_added",
      "permit_info_updated",
    ].includes(type) &&
    !latestContractorUpdateByJob.has(jobId)
  ) {
    latestContractorUpdateByJob.set(jobId, ev);
  }
}

function hasSignalEventForJob(map: unknown, jobId: string) {
  return map instanceof Map && map.has(jobId);
}

const retestReadyCount = uniqueAllOpenOpsJobs.filter((j: any) => {
  const jobId = String(j?.id ?? "");
  const status = String(j?.ops_status ?? "").toLowerCase();
  return (
    status === "failed" &&
    !resolvedFailedParentIds.has(jobId) &&
    hasSignalEventForJob(latestRetestReadyByJob, jobId)
  );
}).length;

const contractorCreatedCount = uniqueAllOpenOpsJobs.filter((j: any) => {
  const jobId = String(j?.id ?? "");
  const status = String(j?.ops_status ?? "").toLowerCase();
  return status === "need_to_schedule" && hasSignalEventForJob(latestContractorCreatedByJob, jobId);
}).length;

const contractorUpdatesCount = uniqueAllOpenOpsJobs.filter((j: any) => {
  const jobId = String(j?.id ?? "");
  return hasSignalEventForJob(latestContractorUpdateByJob, jobId);
}).length;

let signalFilteredBucketJobs = [...(filteredBucketJobs ?? [])];

if (signal === "retest_ready") {
  signalFilteredBucketJobs = signalFilteredBucketJobs.filter((j: any) => {
    const status = String(j?.ops_status ?? "").toLowerCase();
    return (
      status === "failed" &&
      hasSignalEventForJob(latestRetestReadyByJob, String(j.id ?? ""))
    );
  });
}

if (signal === "new_contractor") {
  signalFilteredBucketJobs = signalFilteredBucketJobs.filter((j: any) => {
    const status = String(j?.ops_status ?? "").toLowerCase();
    return (
      status === "need_to_schedule" &&
      hasSignalEventForJob(latestContractorCreatedByJob, String(j.id ?? ""))
    );
  });
}

if (signal === "contractor_updates") {
  // Cross-bucket signal: source from all open jobs (same dataset as the count card),
  // not just the current bucket slice, so card count and displayed rows always match.
  signalFilteredBucketJobs = uniqueAllOpenOpsJobs.filter((j: any) =>
    hasSignalEventForJob(latestContractorUpdateByJob, String(j.id ?? ""))
  );
}

const sortedBucketJobs = sortJobs(signalFilteredBucketJobs, sort);
const sortedCallListJobs = sortJobs(callListJobs ?? [], sort === "default" ? "created" : sort);
const sortedFieldWorkJobs = sortJobs(fieldWorkJobs ?? [], sort);

function dateOnlyDayNumber(value?: string | null) {
  const s = String(value ?? "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return Math.floor(Date.UTC(y, mo - 1, d) / 86400000);
}

function laDayNumberFromInstant(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const y = Number(parts.find((p) => p.type === "year")?.value);
  const mo = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);

  if (!y || !mo || !day) return null;
  return Math.floor(Date.UTC(y, mo - 1, day) / 86400000);
}

function dayWord(n: number) {
  return n === 1 ? "day" : "days";
}

const todayDayNumber = laDayNumberFromInstant(startTodayUtc) ?? 0;

function closeoutNeedsForException(j: any) {
  const ops = String(j?.ops_status ?? "").toLowerCase();
  const needs = getCloseoutNeeds(j);
  if (needs.isBlockedForCloseout) {
    return {
      needsInvoice: false,
      needsCerts: false,
      isService: needs.isService,
      isEccFailed: false,
    };
  }

  const isEccFailed = !needs.isService && (ops === "failed" || ops === "pending_info" || ops === "retest_needed");

  return {
    needsInvoice: needs.needsInvoice,
    needsCerts: isEccFailed ? false : needs.needsCerts,
    isService: needs.isService,
    isEccFailed,
  };
}

const exceptionMetaById = new Map<string, { reason: string; aging: string }>();
const stillOpenExceptionJobs: any[] = [];

for (const j of stillOpenJobs ?? []) {
  const id = String(j?.id ?? "");
  if (!id) continue;

  const status = String(j?.ops_status ?? "").toLowerCase();
  if (status === "closed") continue;

  const scheduledDay = dateOnlyDayNumber(j?.scheduled_date);
  if (scheduledDay == null) continue;

  const ageDays = Math.max(1, todayDayNumber - scheduledDay);

  stillOpenExceptionJobs.push(j);
  exceptionMetaById.set(id, {
    reason: "Still open from prior day",
    aging: `${ageDays} ${dayWord(ageDays)} open`,
  });
}

const overdueCloseoutExceptionJobs: any[] = [];

for (const j of closeoutSourceJobs ?? []) {
  const id = String(j?.id ?? "");
  if (!id) continue;

  const status = String(j?.ops_status ?? "").toLowerCase();
  if (status === "closed") continue;

  const needs = closeoutNeedsForException(j);
  if (!needs.needsInvoice && !needs.needsCerts) continue;

  const completeDay =
    laDayNumberFromInstant(j?.field_complete_at) ?? dateOnlyDayNumber(j?.scheduled_date);

  if (completeDay == null) continue;

  const overdueDays = todayDayNumber - completeDay;
  if (overdueDays < 1) continue;

  const reason = needs.needsInvoice && needs.needsCerts
    ? "Invoice + certs overdue"
    : needs.needsInvoice
    ? "Invoice overdue"
    : "Certs overdue";

  overdueCloseoutExceptionJobs.push(j);
  exceptionMetaById.set(id, {
    reason,
    aging: `${overdueDays} ${dayWord(overdueDays)} overdue`,
  });
}

const sortedExceptionJobs = sortJobs(
  [...stillOpenExceptionJobs, ...overdueCloseoutExceptionJobs],
  sort
);

function closeoutNeeds(j: any) {
  return getCloseoutNeeds(j);
}

function closeoutLabel(j: any) {
  const needs = closeoutNeeds(j);
  if (needs.needsInvoice && needs.needsCerts) return "Working closeout — invoice + certs required";
  if (needs.needsInvoice) return "Working closeout — invoice required";
  if (needs.needsCerts) return "Working closeout — certs required";
  return "Ready to close";
}

const closeoutJobs = sortJobs(
  (closeoutSourceJobs ?? []).filter((j: any) => {
    return isInCloseoutQueue(j);
  }),
  sort
);

const activeFailedCount = (countRows ?? []).filter((row: any) => {
  const status = String((row as any)?.ops_status ?? "").toLowerCase();
  const jobId = String((row as any)?.id ?? "");
  return status === "failed" && !resolvedFailedParentIds.has(jobId);
}).length;

const workflowCards = [
  {
    key: "attention",
    label: "Needs Attention",
    count: attentionCount,
  },
  {
    key: "need_to_schedule",
    label: "Need to Schedule",
    count: counts.get("need_to_schedule") ?? 0,
  },
  {
    key: "scheduled",
    label: "Scheduled",
    count: counts.get("scheduled") ?? 0,
  },
  {
    key: "pending_info",
    label: "Pending Info",
    count: counts.get("pending_info") ?? 0,
  },
  {
    key: "on_hold",
    label: "On Hold",
    count: counts.get("on_hold") ?? 0,
  },
  {
    key: "in_progress",
    label: "In Progress",
    count: counts.get("in_progress") ?? 0,
  },
  {
    key: "passed",
    label: "Passed",
    count: counts.get("passed") ?? 0,
  },
  {
    key: "failed",
    label: "Failed",
    count: activeFailedCount,
  },
  {
    key: "retest_needed",
    label: "Retest Needed",
    count: counts.get("retest_needed") ?? 0,
  },
  {
    key: "paperwork_required",
    label: "Status: Paperwork Required",
    count: counts.get("paperwork_required") ?? 0,
  },
  {
    key: "invoice_required",
    label: "Status: Invoice Required",
    count: counts.get("invoice_required") ?? 0,
  },
  {
    key: "closeout",
    label: "Closeout Work Queue",
    count: closeoutJobs.length,
  },
  {
    key: "recent_closed",
    label: "Closed",
    count: recentClosedCount ?? 0,
  },
].filter((c) => c.count > 0 || c.key === bucket);

const signalCards = [
  {
    key: "retest_ready",
    bucket: "failed",
    label: "Retest Ready",
    count: retestReadyCount,
  },
  {
    key: "new_contractor",
    bucket: "need_to_schedule",
    label: "New Contractor Jobs",
    count: contractorCreatedCount,
  },
  {
    key: "contractor_updates",
    bucket,
    label: "Contractor Updates",
    count: contractorUpdatesCount,
  },
];

const activeQueueLabel = OPS_TABS.find((t) => t.key === bucket)?.label ?? bucket;
const activeSignalLabel =
  signal === "retest_ready"
    ? "Retest Ready"
    : signal === "new_contractor"
    ? "New Contractor Jobs"
    : signal === "contractor_updates"
    ? "Contractor Updates"
    : "";

const PREVIEW_LIMIT = 4;
const EXCEPTION_PREVIEW_LIMIT = 5;
const isPanelExpanded = (key: string) => panel === key;

const callListVisibleJobs = isPanelExpanded("call_list")
  ? sortedCallListJobs
  : sortedCallListJobs.slice(0, PREVIEW_LIMIT);

const fieldWorkVisibleJobs = isPanelExpanded("field_work")
  ? sortedFieldWorkJobs
  : sortedFieldWorkJobs.slice(0, PREVIEW_LIMIT);

const closeoutVisibleJobs = isPanelExpanded("closeout")
  ? closeoutJobs
  : closeoutJobs.slice(0, PREVIEW_LIMIT);

const exceptionVisibleJobs = isPanelExpanded("exceptions")
  ? sortedExceptionJobs
  : sortedExceptionJobs.slice(0, EXCEPTION_PREVIEW_LIMIT);

function compactRow(j: any, showDate = false, note?: string) {
  return (
    <div key={j.id} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link
            href={`/jobs/${j.id}?tab=ops`}
            className="text-sm font-semibold text-blue-700 hover:text-blue-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-1"
          >
            {j.title}
          </Link>
          <div className="mt-0.5 text-xs font-medium text-gray-700">{customerNameOnly(j)} • {customerPhoneOnly(j) || "-"}</div>
          <div className="text-xs text-gray-500">{addressLine(j)}</div>
          {note ? (
            <div className="mt-1.5 inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              {note}
            </div>
          ) : null}
        </div>
        {showDate ? (
          <div className="text-right text-[11px] text-gray-500">
            <div className="font-medium text-gray-700">{j.scheduled_date ? new Date(j.scheduled_date).toLocaleDateString() : "-"}</div>
            <div>{displayWindowLA(j.window_start, j.window_end) || "-"}</div>
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Link
          href={`/jobs/${j.id}?tab=ops`}
          className="rounded-md border border-gray-300 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500/40"
        >
          Open
        </Link>
        {telHref(customerPhoneOnly(j)) ? (
          <a
            href={telHref(customerPhoneOnly(j))}
            className="rounded-md border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500/40"
          >
            Call
          </a>
        ) : null}
        {smsHref(customerPhoneOnly(j)) ? (
          <a
            href={smsHref(customerPhoneOnly(j))}
            className="rounded-md border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500/40"
          >
            Text
          </a>
        ) : null}
      </div>
    </div>
  );
}

function workflowToneClass(key: string) {
  if (key === "attention") return "border-amber-200 bg-amber-50/70 text-amber-900";
  if (key === "failed") return "border-rose-200 bg-rose-50/70 text-rose-900";
  if (key === "retest_needed") return "border-orange-200 bg-orange-50/70 text-orange-900";
  if (key === "pending_info") return "border-yellow-200 bg-yellow-50/70 text-yellow-900";
  if (key === "on_hold") return "border-slate-300 bg-slate-100/80 text-slate-800";
  if (key === "need_to_schedule") return "border-blue-200 bg-blue-50/70 text-blue-900";
  if (key === "closeout") return "border-emerald-200 bg-emerald-50/70 text-emerald-900";
  return "border-gray-200 bg-white text-gray-900";
}

function signalToneClass(key: string) {
  if (key === "retest_ready") return "border-emerald-200 bg-emerald-50/70 text-emerald-900";
  if (key === "new_contractor") return "border-blue-200 bg-blue-50/70 text-blue-900";
  if (key === "contractor_updates") return "border-indigo-200 bg-indigo-50/70 text-indigo-900";
  return "border-gray-200 bg-white text-gray-900";
}

return (
  <div className="mx-auto max-w-6xl space-y-4 p-4 text-gray-900 lg:space-y-5">
    <div className="rounded-xl border border-gray-200 bg-gradient-to-b from-white to-slate-50/70 p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white shadow-sm">
              <Image src="/icon.png" alt="Compliance Matters logo" width={22} height={22} className="h-5.5 w-5.5 rounded-sm" />
            </div>
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
              Compliance Matters
            </div>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Ops Dashboard</h1>
            <span className="inline-flex h-6 items-center rounded-full border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 shadow-sm">
              {OPS_TABS.find((t) => t.key === bucket)?.label ?? "Ops"}
            </span>
          </div>
          <p className="text-sm text-slate-600">
            {selectedContractorName ? `Filtered: ${selectedContractorName}` : "All contractors"}
          </p>
        </div>
        {isAdmin ? (
          <div className="flex items-center">
            <Link
              href="/ops/admin"
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              Admin
            </Link>
          </div>
        ) : null}
      </div>
    </div>

    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ContractorFilter contractors={contractors ?? []} selectedId={contractor ?? ""} />
        <div className="grid gap-1">
          <label className="text-xs font-medium uppercase tracking-wide text-gray-600">Sort</label>
          <form action="/ops" method="get" className="flex gap-2">
            <input type="hidden" name="bucket" value={bucket} />
            <input type="hidden" name="contractor" value={contractor ?? ""} />
            <input type="hidden" name="q" value={q ?? ""} />
            <input type="hidden" name="signal" value={signal ?? ""} />
            <select
              name="sort"
              defaultValue={sort}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
            >
              <option value="default">Default queue order</option>
              <option value="customer">Customer</option>
              <option value="scheduled">Scheduled date/time</option>
              <option value="created">Created date</option>
              <option value="address">Address</option>
            </select>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50"
            >
              Apply
            </button>
          </form>
        </div>
      </div>
      <div className="mt-3 grid gap-1">
        <label className="text-xs font-medium uppercase tracking-wide text-gray-600">Quick search</label>
        <form action="/ops" method="get" className="flex gap-2">
          <input type="hidden" name="bucket" value={bucket} />
          <input type="hidden" name="contractor" value={contractor ?? ""} />
          <input type="hidden" name="sort" value={sort} />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Name, phone, address, city, title"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
          />
          <button
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50"
            type="submit"
          >
            Search
          </button>
        </form>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900">Call List</div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-500">{sortedCallListJobs.length}</div>
            {sortedCallListJobs.length > PREVIEW_LIMIT ? (
              <Link
                href={`/ops${buildQueryString({
                  bucket,
                  contractor: contractor ?? "",
                  q: q ?? "",
                  sort: sort ?? "",
                  signal: signal ?? "",
                  panel: isPanelExpanded("call_list") ? "" : "call_list",
                })}`}
                className="text-xs font-medium text-blue-700 hover:text-blue-800 hover:underline"
              >
                {isPanelExpanded("call_list") ? "Show less" : "View all"}
              </Link>
            ) : null}
          </div>
        </div>
        <div className="space-y-2">{callListVisibleJobs.map((j: any) => compactRow(j))}</div>
      </div>

     <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">Field Work</div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-500">{sortedFieldWorkJobs.length}</div>
          {sortedFieldWorkJobs.length > PREVIEW_LIMIT ? (
            <Link
              href={`/ops${buildQueryString({
                bucket,
                contractor: contractor ?? "",
                q: q ?? "",
                sort: sort ?? "",
                signal: signal ?? "",
                panel: isPanelExpanded("field_work") ? "" : "field_work",
              })}`}
              className="text-xs font-medium text-blue-700 hover:text-blue-800 hover:underline"
            >
              {isPanelExpanded("field_work") ? "Show less" : "View all"}
            </Link>
          ) : null}
        </div>
      </div>

  {sortedFieldWorkJobs.length === 0 ? (
    <div className="flex h-32 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-800">
      <span className="mr-1.5 text-emerald-700">✓</span> Field work complete for today
    </div>
  ) : (
    <div className="space-y-2">
      {fieldWorkVisibleJobs.map((j: any) => compactRow(j, true))}
    </div>
  )}
</div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900">Closeout Work Queue</div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-500">{closeoutJobs.length}</div>
            {closeoutJobs.length > PREVIEW_LIMIT ? (
              <Link
                href={`/ops${buildQueryString({
                  bucket,
                  contractor: contractor ?? "",
                  q: q ?? "",
                  sort: sort ?? "",
                  signal: signal ?? "",
                  panel: isPanelExpanded("closeout") ? "" : "closeout",
                })}`}
                className="text-xs font-medium text-blue-700 hover:text-blue-800 hover:underline"
              >
                {isPanelExpanded("closeout") ? "Show less" : "View all"}
              </Link>
            ) : null}
          </div>
        </div>
        <div className="space-y-2">
          {closeoutVisibleJobs.map((j: any) => compactRow(j, false, closeoutLabel(j)))}
        </div>
      </div>
    </div>

    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">Exceptions (Still Open Past Scheduled Date)</div>
        <div className="flex items-center gap-3">
          <div className="text-xs font-semibold text-red-700">{sortedExceptionJobs.length}</div>
          {sortedExceptionJobs.length > EXCEPTION_PREVIEW_LIMIT ? (
            <Link
              href={`/ops${buildQueryString({
                bucket,
                contractor: contractor ?? "",
                q: q ?? "",
                sort: sort ?? "",
                signal: signal ?? "",
                panel: isPanelExpanded("exceptions") ? "" : "exceptions",
              })}`}
              className="text-xs font-medium text-blue-700 hover:text-blue-800 hover:underline"
            >
              {isPanelExpanded("exceptions") ? "Show less" : "View all"}
            </Link>
          ) : null}
        </div>
      </div>
      <div className="space-y-2">
        {exceptionVisibleJobs.map((j: any) => {
          const meta = exceptionMetaById.get(String(j?.id ?? ""));
          const note = meta ? `${meta.reason} | ${meta.aging}` : "Exception";
          return compactRow(j, true, note);
        })}
      </div>
    </div>

    <div id="ops-queues" className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-900">Queues</div>
          <div className="text-xs text-gray-600">Closeout is the working bucket. Paperwork and invoice cards show raw projected status buckets.</div>
        </div>
        <div className="w-full sm:w-72">
          <ContractorFilter contractors={contractors ?? []} selectedId={contractor ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-gray-900">Workflow Queues</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {workflowCards.map((card) => {
              const isActive = bucket === card.key && !signal;
              return (
                <Link
                  key={card.key}
                  href={`/ops${buildQueryString({
                    bucket: card.key,
                    contractor: contractor ?? "",
                    q: q ?? "",
                    sort: sort ?? "",
                    signal: "",
                  })}#ops-queues`}
                  className={[
                    "rounded-md border p-2.5 shadow-sm transition-all hover:-translate-y-[1px] hover:shadow",
                    isActive
                      ? "border-slate-900 bg-slate-900 text-white"
                      : `${workflowToneClass(card.key)} hover:bg-white`,
                  ].join(" ")}
                >
                  <div className={`text-[11px] font-medium ${isActive ? "text-slate-200" : "text-current/80"}`}>
                    {card.label}
                  </div>
                  <div className="text-lg font-semibold">{card.count}</div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-gray-900">Signals</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {signalCards.map((card) => {
              const isActive = signal === card.key;
              return (
                <Link
                  key={card.key}
                  href={`/ops${buildQueryString({
                    bucket: card.bucket,
                    contractor: contractor ?? "",
                    q: q ?? "",
                    sort: sort ?? "",
                    signal: card.key,
                  })}#ops-queues`}
                  className={[
                    "rounded-md border p-2.5 shadow-sm transition-all hover:-translate-y-[1px] hover:shadow",
                    isActive
                      ? "border-slate-900 bg-slate-900 text-white"
                      : `${signalToneClass(card.key)} hover:bg-white`,
                  ].join(" ")}
                >
                  <div className={`text-[11px] font-medium ${isActive ? "text-slate-200" : "text-current/80"}`}>
                    {card.label}
                  </div>
                  <div className="text-lg font-semibold">{card.count}</div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900">
            Active Queue: {activeQueueLabel}
            {activeSignalLabel ? ` (${activeSignalLabel})` : ""}
          </div>
          <div className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-600 shadow-sm">{sortedBucketJobs.length} jobs</div>
        </div>

        {sortedBucketJobs.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-300 bg-white px-3 py-4 text-sm text-gray-600">
            No jobs in this queue with current filters.
          </div>
        ) : (
          <div className="space-y-2">
            {sortedBucketJobs.slice(0, 20).map((j: any) => {
              const isRetestReady = hasSignalEventForJob(
                latestRetestReadyByJob,
                String(j.id ?? "")
              );
              const isNewContractorJob = hasSignalEventForJob(
                latestContractorCreatedByJob,
                String(j.id ?? "")
              );
              const note = signal
                ? signalReason(j, {
                    retestReady: isRetestReady,
                    newContractorJob: isNewContractorJob,
                  })
                : queueReason(j, bucket);

              return compactRow(j, true, note || undefined);
            })}
          </div>
        )}
      </div>
    </div>
  </div>
);
}
