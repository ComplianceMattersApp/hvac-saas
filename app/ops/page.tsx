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
  formatBusinessDateUS,
  displayWindowLA,
  startOfTodayUtcIsoLA,
  startOfTomorrowUtcIsoLA,
} from "@/lib/utils/schedule-la";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import { getCloseoutNeeds, isInCloseoutQueue } from "@/lib/utils/closeout";
import { extractFailureReasons } from "@/lib/portal/resolveContractorIssues";
import { getActiveJobAssignmentDisplayMap } from "@/lib/staffing/human-layer";
import { buildIlikeSearchTerms, matchesNormalizedSearch } from "@/lib/utils/search-normalization";
import {
  listInternalNotifications,
} from "@/lib/actions/notification-read-actions";


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
  | "workflow_all"
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
  { key: "workflow_all", label: "Workflow View All" },
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

  try {
    await requireInternalUser({
      supabase,
      userId: user.id,
    });
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

  const recentNotifications = await listInternalNotifications({
    limit: 3,
    onlyUnread: true,
  });

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
    .select("id, ops_status, status")
    .neq("ops_status", "closed")
    .neq("status", "cancelled")
    .is("deleted_at", null);

if (contractor) countsQ = countsQ.eq("contractor_id", contractor);

const { data: countRows, error: countsErr } = await countsQ;
if (countsErr) throw countsErr;

const counts = new Map<string, number>();
for (const row of countRows ?? []) {
  const key = String((row as any).ops_status ?? "");
  const lifecycle = String((row as any).status ?? "").toLowerCase();
  if (!key) continue;
  if ((key === "need_to_schedule" || key === "scheduled") && lifecycle !== "open") continue;
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

const { data: activeRetestChildren, error: activeRetestErr } = await supabase
  .from("jobs")
  .select("parent_job_id, service_case_id, ops_status, status, created_at, scheduled_date, window_start, window_end")
  .not("parent_job_id", "is", null)
  .is("deleted_at", null)
  .neq("status", "cancelled")
  .neq("ops_status", "closed");

if (activeRetestErr) throw activeRetestErr;

const failedParentIdsWithRetestChild = new Set(
  (activeRetestChildren ?? [])
    .map((r: any) => String(r.parent_job_id ?? "").trim())
    .filter(Boolean)
);

const activeRetestServiceCaseIds = new Set(
  (activeRetestChildren ?? [])
    .map((r: any) => String(r.service_case_id ?? "").trim())
    .filter(Boolean)
);

const openRetestChildByParentId = new Map<string, any>();
for (const child of activeRetestChildren ?? []) {
  const parentId = String(child?.parent_job_id ?? "").trim();
  if (!parentId) continue;

  const current = openRetestChildByParentId.get(parentId);
  if (!current || toEpochMs(child?.created_at) > toEpochMs(current?.created_at)) {
    openRetestChildByParentId.set(parentId, child);
  }
}

function retestScheduleLabelForJob(jobId: string) {
  const child = openRetestChildByParentId.get(jobId);
  if (!child) return "";
  const date = child?.scheduled_date ? formatBusinessDateUS(String(child.scheduled_date)) : "";
  const window = displayWindowLA(child?.window_start, child?.window_end);
  if (date && window) return `${date} ${window}`;
  return date || window || "";
}

function retestStateForJob(jobId: string): "none" | "pending_scheduling" | "scheduled" {
  const child = openRetestChildByParentId.get(jobId);
  if (!child) return "none";
  return retestScheduleLabelForJob(jobId) ? "scheduled" : "pending_scheduling";
}

function hasScheduledRetestForJob(jobId: string) {
  return !!retestScheduleLabelForJob(jobId);
}

function shouldHideFailedParentJob(j: any) {
  const opsStatus = String(j?.ops_status ?? "").toLowerCase();
  const parentJobId = String(j?.parent_job_id ?? "").trim();
  const jobId = String(j?.id ?? "").trim();
  const serviceCaseId = String(j?.service_case_id ?? "").trim();
  const hasActiveRetestChild = failedParentIdsWithRetestChild.has(jobId);

  if (![
    "failed",
    "pending_office_review",
    "retest_needed",
  ].includes(opsStatus)) return false;
  if (hasActiveRetestChild) return true;
  if (parentJobId) return false;

  return !!serviceCaseId && activeRetestServiceCaseIds.has(serviceCaseId);
}


  // Contractors for filter dropdown
  const { data: contractors } = await supabase
    .from("contractors")
    .select("id, name")
    .order("name", { ascending: true });

  // Common job select (keep lightweight)
 const baseSelect =
   "id, title, status, parent_job_id, service_case_id, job_type, ops_status, field_complete, field_complete_at, certs_complete, invoice_complete, invoice_number, permit_number, pending_info_reason, on_hold_reason, scheduled_date, window_start, window_end, city, job_address, customer_first_name, customer_last_name, customer_phone, contractor_id, contractors(name), customer_id, deleted_at, location_id, created_at";

  // Helper to apply filters
  const applyCommonFilters = (qb: any) => {
    if (contractor) qb = qb.eq("contractor_id", contractor);

    if (q) {
      const terms = buildIlikeSearchTerms(q)
        .map((term) => term.replace(/[,()\\]/g, "").trim())
        .filter(Boolean);

      if (terms.length > 0) {
        const fields = [
          "title",
          "customer_first_name",
          "customer_last_name",
          "customer_email",
          "customer_phone",
          "job_address",
          "city",
          "permit_number",
        ];

        const clauses: string[] = [];
        for (const term of terms) {
          for (const field of fields) {
            clauses.push(`${field}.ilike.*${term}*`);
          }
        }

        qb = qb.or(clauses.join(","));
      }
    }

    return qb;
  };

  const matchesOpsSearch = (job: any) =>
    matchesNormalizedSearch({
      query: q,
      values: [
        job?.title,
        job?.customer_first_name,
        job?.customer_last_name,
        job?.customer_phone,
        job?.job_address,
        job?.city,
        job?.permit_number,
      ],
    });

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
  .neq("status", "cancelled")
  .neq("ops_status", "closed")
  .eq("field_complete", false)
  .gte("scheduled_date", startTodayUtc)
  .lt("scheduled_date", startTomorrowUtc)
  .order("window_start", { ascending: true });

fieldWorkQ = applyCommonFilters(fieldWorkQ);

const { data: fieldWorkJobsRaw, error: fieldWorkErr } = await fieldWorkQ;
if (fieldWorkErr) throw fieldWorkErr;
const fieldWorkJobs = (fieldWorkJobsRaw ?? []).filter(
  (j: any) => !shouldHideFailedParentJob(j) && matchesOpsSearch(j)
);

// 2) UPCOMING (scheduled jobs on/after LA tomorrow)
let upcomingQ = supabase
  .from("jobs")
  .select(baseSelect)
  .is("deleted_at", null)
  .neq("status", "cancelled")
  .eq("status", "open")
  .eq("ops_status", "scheduled")
  .gte("scheduled_date", startTomorrowUtc)
  .order("scheduled_date", { ascending: true })
  .order("window_start", { ascending: true })
  .limit(25);

upcomingQ = applyCommonFilters(upcomingQ);

const { data: upcomingJobsRaw, error: upcomingErr } = await upcomingQ;
if (upcomingErr) throw upcomingErr;
const upcomingJobs = (upcomingJobsRaw ?? []).filter(
  (j: any) => !shouldHideFailedParentJob(j) && matchesOpsSearch(j)
);


  // 3) CALL LIST preview (need_to_schedule)
  let callListQ = supabase
    .from("jobs")
    .select(baseSelect)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .eq("status", "open")
    .eq("ops_status", "need_to_schedule")
    .order("created_at", { ascending: false })
    .limit(10);

  callListQ = applyCommonFilters(callListQ);

  const { data: callListJobsRaw, error: callListErr } = await callListQ;
  if (callListErr) throw callListErr;
  const callListJobs = (callListJobsRaw ?? []).filter(
    (j: any) => !shouldHideFailedParentJob(j) && matchesOpsSearch(j)
  );

    // 4) CLOSEOUT COMMAND BOARD (derived from field_complete + remaining office obligations)
    let closeoutQ = supabase
      .from("jobs")
      .select(baseSelect)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .eq("field_complete", true)
      .order("field_complete_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(100);

    closeoutQ = applyCommonFilters(closeoutQ);

    const { data: closeoutSourceJobsRaw, error: closeoutErr } = await closeoutQ;
    if (closeoutErr) throw closeoutErr;
    const closeoutSourceJobs = (closeoutSourceJobsRaw ?? []).filter(
      (j: any) => !shouldHideFailedParentJob(j) && matchesOpsSearch(j)
    );

    // 5) EXCEPTIONS: Still Open (scheduled before today in LA and not field-complete)
    let stillOpenQ = supabase
      .from("jobs")
      .select(baseSelect)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .neq("ops_status", "closed")
      .eq("field_complete", false)
      .lt("scheduled_date", startTodayUtc)
      .order("scheduled_date", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(100);

    stillOpenQ = applyCommonFilters(stillOpenQ);

    const { data: stillOpenJobsRaw, error: stillOpenErr } = await stillOpenQ;
    if (stillOpenErr) throw stillOpenErr;
    const stillOpenJobs = (stillOpenJobsRaw ?? []).filter(
      (j: any) => !shouldHideFailedParentJob(j) && matchesOpsSearch(j)
    );

    // 6) NEEDS ATTENTION preview (aging-based escalation queue)
    let attentionQ = supabase
      .from("jobs")
      .select(baseSelect + ", created_at")
      .is("deleted_at", null)
      .or(
        [
          // Need to Schedule older than 3 business days
          `and(ops_status.eq.need_to_schedule,status.eq.open,created_at.lte.${attentionBusinessCutoffIso})`,

          // Pending Info older than 3 business days
          `and(ops_status.eq.pending_info,created_at.lte.${attentionBusinessCutoffIso})`,

          // Failed older than 14 calendar days
          `and(ops_status.eq.failed,created_at.lte.${failedCutoffIso})`,
          `and(ops_status.eq.pending_office_review,created_at.lte.${failedCutoffIso})`,
        ].join(",")
      )
      .order("created_at", { ascending: true })
      .limit(10);

    attentionQ = applyCommonFilters(attentionQ);

    const { data: attentionJobsRaw, error: attentionErr } = await attentionQ;
    if (attentionErr) throw attentionErr;
    const attentionJobs = (attentionJobsRaw ?? []).filter(
      (j: any) => !shouldHideFailedParentJob(j) && matchesOpsSearch(j)
    );
    const attentionCount = attentionJobs.length;

  // 7) BUCKET list (tabs)
    let bucketQ = supabase
      .from("jobs")
      .select(baseSelect)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(100);

    if (bucket === "attention") {
      bucketQ = bucketQ.or(
        [
          `and(ops_status.eq.need_to_schedule,status.eq.open,created_at.lte.${attentionBusinessCutoffIso})`,
          `and(ops_status.eq.pending_info,created_at.lte.${attentionBusinessCutoffIso})`,
          `and(ops_status.eq.failed,created_at.lte.${failedCutoffIso})`,
          `and(ops_status.eq.pending_office_review,created_at.lte.${failedCutoffIso})`,
        ].join(",")
      );
    } else if (bucket === "failed") {
      bucketQ = bucketQ.in("ops_status", ["failed", "pending_office_review"]);
    } else if (bucket === "workflow_all") {
      bucketQ = bucketQ.in("ops_status", [
        "need_to_schedule",
        "pending_info",
        "on_hold",
        "failed",
        "pending_office_review",
      ]);
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
      if (bucket === "need_to_schedule" || bucket === "scheduled") {
        bucketQ = bucketQ.eq("status", "open");
      }
    }

    bucketQ = applyCommonFilters(bucketQ);

    const { data: bucketJobsRaw, error: bucketErr } = await bucketQ;
  if (bucketErr) throw bucketErr;
  const bucketJobs = (bucketJobsRaw ?? []).filter(
    (j: any) => !shouldHideFailedParentJob(j) && matchesOpsSearch(j)
  );
  const baseFilteredBucketJobs =
  bucket === "failed" || bucket === "attention" || bucket === "workflow_all"
    ? (bucketJobs ?? []).filter(
        (j: any) => {
          const id = String(j.id ?? "");
          const ops = String(j.ops_status ?? "").toLowerCase();

          if (ops === "failed" || ops === "pending_office_review") {
            if (resolvedFailedParentIds.has(id) || hasScheduledRetestForJob(id)) return false;
          }

          if (bucket === "workflow_all" && ops === "need_to_schedule") {
            return String(j.status ?? "").toLowerCase() === "open";
          }

          return true;
        }
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
  ...(baseFilteredBucketJobs ?? [])
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
  const cityStateZip = [parts.city, [parts.state, parts.zip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const out = [parts.address, cityStateZip].filter(Boolean).join(", ");
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
    state: String(l?.state ?? "").trim(),
    zip: String(l?.zip ?? l?.postal_code ?? "").trim(),
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

function contractorNameOnly(j: any) {
  const relationName = String((j as any)?.contractors?.name ?? "").trim();
  if (relationName) return relationName;

  const byIdName = String(
    contractors?.find((c: any) => String(c?.id ?? "") === String(j?.contractor_id ?? ""))?.name ?? ""
  ).trim();
  if (byIdName) return byIdName;

  return "Unassigned";
}

function normalizeFailureLine(line: string, testTypeRaw: string): string {
  const text = String(line ?? "").trim();
  const testType = String(testTypeRaw ?? "").trim().toLowerCase();
  const lower = text.toLowerCase();

  if (testType === "refrigerant_charge") {
    if (
      lower.includes("subcool") ||
      lower.includes("superheat") ||
      lower.includes("filter drier") ||
      lower.includes("outdoor temp") ||
      lower.includes("indoor temp")
    ) {
      return "Failed - refrigerant charge out of range";
    }
    return text ? `Failed - refrigerant charge: ${text}` : "Failed - refrigerant charge out of range";
  }

  if (testType === "duct_leakage") {
    if (lower.includes("above") || lower.includes("leakage") || lower.includes("max")) {
      return "Failed - duct leakage above threshold";
    }
    return text ? `Failed - duct leakage: ${text}` : "Failed - duct leakage above threshold";
  }

  if (testType === "airflow") {
    if (lower.includes("below") || lower.includes("required") || lower.includes("target")) {
      return "Failed - airflow below target";
    }
    return text ? `Failed - airflow: ${text}` : "Failed - airflow below target";
  }

  return text ? `Failed - ${text}` : "Failed - test requirement not met";
}

function toEpochMs(value?: string | null) {
  const t = new Date(String(value ?? "")).getTime();
  return Number.isFinite(t) ? t : 0;
}

function queueReason(j: any, activeBucket: string) {
  const status = String(j?.ops_status ?? "").toLowerCase();
  const jobId = String(j?.id ?? "");
  const retestState = retestStateForJob(jobId);
  const retestSchedule = retestScheduleLabelForJob(jobId);

  if (status === "failed" || status === "retest_needed") {
    if (retestState === "pending_scheduling") {
      return "Retest pending scheduling — retest child exists but is not scheduled";
    }
    if (retestState === "scheduled") {
      return `Retest scheduled for ${retestSchedule}`;
    }
  }

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
    const pendingInfoReason = String(j?.pending_info_reason ?? "").trim();
    if (/permit/i.test(pendingInfoReason) || !String(j?.permit_number ?? "").trim()) {
      return "Pending info — missing permit number";
    }
    return pendingInfoReason ? `Pending info — ${pendingInfoReason}` : "Pending info — waiting for required information";
  }

  if (status === "pending_office_review") {
    return "Under review — contractor corrections submitted and pending internal review";
  }

  if (activeBucket === "failed" || status === "failed") {
    return primaryFailureReasonByJob.get(jobId) ?? "Failed — awaiting correction or retest";
  }

  if (activeBucket === "retest_needed" || status === "retest_needed") {
    if (hasSignalEventForJob(latestRetestReadyByJob, jobId)) {
      return "Retest needed — contractor marked correction complete";
    }
    return "Retest needed — awaiting contractor action";
  }

  if (activeBucket === "on_hold" || status === "on_hold") {
    const onHoldReason = String(j?.on_hold_reason ?? "").trim();
    return onHoldReason
      ? `On hold — ${onHoldReason}`
      : "On hold — awaiting resolution before closeout";
  }

  if (status === "need_to_schedule") {
    return "Waiting to be scheduled";
  }

  if (activeBucket === "paperwork_required" || status === "paperwork_required") {
    const needs = getCloseoutNeeds(j);
    if (needs.needsCerts && needs.needsInvoice) return "Paperwork required — certs and invoice pending";
    if (needs.needsCerts) return "Paperwork required — certs pending";
    if (needs.needsInvoice) return "Paperwork required — invoice pending";
    return "Paperwork required — closeout processing pending";
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

function nextActionLabel(j: any, opts?: { retestReady?: boolean; newContractorJob?: boolean; scheduledRetest?: boolean }) {
  const status = String(j?.ops_status ?? "").toLowerCase();
  const lifecycle = String(j?.status ?? "").toLowerCase();
  const retestState = retestStateForJob(String(j?.id ?? ""));
  const needs = getCloseoutNeeds(j);
  const isFieldComplete = Boolean(j?.field_complete);

  if (opts?.scheduledRetest) return "No Immediate Action";
  if (status === "pending_info") return "Provide Requested Information";
  if (status === "on_hold") return "Await Hold Release";
  if (status === "pending_office_review") return "Review Contractor Submission";
  if (status === "failed" || status === "retest_needed") return "Await Contractor Correction";
  if (status === "need_to_schedule") return "Need to Schedule Visit";
  if (
    status === "scheduled" ||
    lifecycle === "on_the_way" ||
    lifecycle === "in_progress" ||
    retestState === "pending_scheduling"
  ) {
    return "Await Scheduled Visit";
  }
  if (isFieldComplete && (needs.needsInvoice || needs.needsCerts)) return "Finish Closeout";

  return "No Immediate Action";
}

function signalReason(j: any, opts?: { retestReady?: boolean; newContractorJob?: boolean; scheduledRetest?: boolean }) {
  const retestState = retestStateForJob(String(j?.id ?? ""));
  if (retestState === "pending_scheduling") {
    return "Retest pending scheduling — retest child needs date/time";
  }
  if (opts?.scheduledRetest) {
    const retestSchedule = retestScheduleLabelForJob(String(j?.id ?? ""));
    return retestSchedule ? `Retest scheduled for ${retestSchedule}` : "Retest scheduled for upcoming visit";
  }
  if (opts?.retestReady) return "Contractor says correction is complete and job is ready for retest review";
  if (opts?.newContractorJob) return "New job submitted by contractor and waiting for internal review";
  if (signal === "contractor_updates") {
    const updateType = String(
      latestUnreadContractorUpdateNotificationByJob.get(String(j?.id ?? ""))?.notification_type ?? ""
    ).toLowerCase();
    if (updateType === "contractor_schedule_updated") return "Contractor updated schedule details";
    if (updateType === "contractor_note") return "Contractor added a note";
  }
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

const filteredBucketJobs =
  bucket === "failed" || bucket === "attention" || bucket === "retest_needed"
    ? (baseFilteredBucketJobs ?? []).filter(
        (j: any) => !hasScheduledRetestForJob(String(j?.id ?? ""))
      )
    : (baseFilteredBucketJobs ?? []);

const allOpenOpsJobIds = uniqueAllOpenOpsJobs
  .map((j: any) => String(j.id ?? ""))
  .filter(Boolean);

const activeAssignmentDisplayMap = await getActiveJobAssignmentDisplayMap({
  supabase,
  jobIds: allOpenOpsJobIds,
});

function assignmentSummaryForJob(jobId: string) {
  const assignments = activeAssignmentDisplayMap[jobId] ?? [];
  if (!assignments.length) return "Unassigned";

  const [primaryAssignee, ...overflow] = assignments;
  return overflow.length > 0
    ? `${primaryAssignee.display_name} +${overflow.length}`
    : primaryAssignee.display_name;
}

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
    "contractor_report_sent",
    "contractor_note",
    "contractor_correction_submission",
    "contractor_schedule_updated",
    "attachment_added",
    "permit_info_updated",
  ])
  .order("created_at", { ascending: false });

if (signalErr) throw signalErr;

const CONTRACTOR_UPDATE_NOTIFICATION_TYPES = [
  "contractor_note",
  "contractor_schedule_updated",
] as const;

const { data: unreadContractorUpdateNotifications, error: unreadContractorUpdateNotificationsErr } = await supabase
  .from("notifications")
  .select("job_id, notification_type, created_at")
  .eq("recipient_type", "internal")
  .is("read_at", null)
  .in(
    "job_id",
    allOpenOpsJobIds.length
      ? allOpenOpsJobIds
      : ["00000000-0000-0000-0000-000000000000"]
  )
  .in("notification_type", [...CONTRACTOR_UPDATE_NOTIFICATION_TYPES])
  .order("created_at", { ascending: false });

if (unreadContractorUpdateNotificationsErr) throw unreadContractorUpdateNotificationsErr;

const { data: failedRuns, error: failedRunsErr } = await supabase
  .from("ecc_test_runs")
  .select("job_id, test_type, computed, computed_pass, override_pass, is_completed, updated_at, created_at")
  .in(
    "job_id",
    allOpenOpsJobIds.length
      ? allOpenOpsJobIds
      : ["00000000-0000-0000-0000-000000000000"]
  )
  .eq("is_completed", true)
  .or("override_pass.eq.false,computed_pass.eq.false");

if (failedRunsErr) throw failedRunsErr;

const latestFailedRunByJob = new Map<string, any>();
for (const run of failedRuns ?? []) {
  const jobId = String((run as any)?.job_id ?? "").trim();
  if (!jobId) continue;

  const current = latestFailedRunByJob.get(jobId);
  if (!current) {
    latestFailedRunByJob.set(jobId, run);
    continue;
  }

  const currentMs = Math.max(
    toEpochMs((current as any)?.updated_at),
    toEpochMs((current as any)?.created_at)
  );
  const nextMs = Math.max(
    toEpochMs((run as any)?.updated_at),
    toEpochMs((run as any)?.created_at)
  );

  if (nextMs > currentMs) {
    latestFailedRunByJob.set(jobId, run);
  }
}

const primaryFailureReasonByJob = new Map<string, string>();
for (const [jobId, run] of latestFailedRunByJob.entries()) {
  const reasons = extractFailureReasons(run);
  const primaryLine = reasons[0] ?? "";
  const formatted = normalizeFailureLine(primaryLine, String((run as any)?.test_type ?? ""));
  primaryFailureReasonByJob.set(jobId, formatted);
}

const latestRetestReadyByJob = new Map<string, any>();
const latestContractorCreatedByJob = new Map<string, any>();
const latestUnreadContractorUpdateNotificationByJob = new Map<string, any>();

for (const ev of signalEvents ?? []) {
  const jobId = String((ev as any).job_id ?? "");
  const type = String((ev as any).event_type ?? "");

  if (type === "retest_ready_requested" && !latestRetestReadyByJob.has(jobId)) {
    latestRetestReadyByJob.set(jobId, ev);
  }

  if (type === "contractor_job_created" && !latestContractorCreatedByJob.has(jobId)) {
    latestContractorCreatedByJob.set(jobId, ev);
  }

}

for (const notif of unreadContractorUpdateNotifications ?? []) {
  const jobId = String((notif as any).job_id ?? "").trim();
  if (!jobId || latestUnreadContractorUpdateNotificationByJob.has(jobId)) continue;
  latestUnreadContractorUpdateNotificationByJob.set(jobId, notif);
}

function hasSignalEventForJob(map: unknown, jobId: string) {
  return (map instanceof Map || map instanceof Set) && map.has(jobId);
}

const retestReadyCount = uniqueAllOpenOpsJobs.filter((j: any) => {
  const jobId = String(j?.id ?? "");
  const status = String(j?.ops_status ?? "").toLowerCase();
  return (
    status === "failed" &&
    !resolvedFailedParentIds.has(jobId) &&
    !hasScheduledRetestForJob(jobId) &&
    hasSignalEventForJob(latestRetestReadyByJob, jobId)
  );
}).length;

const contractorCreatedCount = uniqueAllOpenOpsJobs.filter((j: any) => {
  const jobId = String(j?.id ?? "");
  const status = String(j?.ops_status ?? "").toLowerCase();
  return status === "need_to_schedule" && hasSignalEventForJob(latestContractorCreatedByJob, jobId);
}).length;

const contractorUpdatesCount = (filteredBucketJobs ?? []).filter((j: any) => {
  const jobId = String(j?.id ?? "");
  return hasSignalEventForJob(latestUnreadContractorUpdateNotificationByJob, jobId);
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
  // Keep contractor updates within the active queue's scope.
  signalFilteredBucketJobs = signalFilteredBucketJobs.filter((j: any) => {
    const jobId = String(j.id ?? "");
    return hasSignalEventForJob(latestUnreadContractorUpdateNotificationByJob, jobId);
  });
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

  const isEccFailed =
    !needs.isService &&
    (ops === "failed" ||
      ops === "pending_info" ||
      ops === "retest_needed" ||
      ops === "pending_office_review");

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
  return (
    (status === "failed" || status === "pending_office_review") &&
    !resolvedFailedParentIds.has(jobId) &&
    !failedParentIdsWithRetestChild.has(jobId) &&
    !hasScheduledRetestForJob(jobId)
  );
}).length;

const workflowCards = [
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
    key: "failed",
    label: "Failed",
    count: activeFailedCount,
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

const visibleSignalCards = signalCards.filter(
  (card) => card.count > 0 || signal === card.key
);
const hasActiveSystemAlerts = visibleSignalCards.some((card) => card.count > 0);

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

const prioritizedCallListJobs = prioritizeActionableJobs(sortedCallListJobs);
const prioritizedFieldWorkJobs = prioritizeActionableJobs(sortedFieldWorkJobs);
const prioritizedCloseoutJobs = prioritizeActionableJobs(closeoutJobs);

const callListVisibleJobs = isPanelExpanded("call_list")
  ? prioritizedCallListJobs
  : prioritizedCallListJobs.slice(0, PREVIEW_LIMIT);

const fieldWorkVisibleJobs = isPanelExpanded("field_work")
  ? prioritizedFieldWorkJobs
  : prioritizedFieldWorkJobs.slice(0, PREVIEW_LIMIT);

const closeoutVisibleJobs = isPanelExpanded("closeout")
  ? prioritizedCloseoutJobs
  : prioritizedCloseoutJobs.slice(0, PREVIEW_LIMIT);

const exceptionVisibleJobs = isPanelExpanded("exceptions")
  ? sortedExceptionJobs
  : sortedExceptionJobs.slice(0, EXCEPTION_PREVIEW_LIMIT);

function isNeedsAttentionJob(j: any) {
  const status = String(j?.ops_status ?? "").toLowerCase();
  const lifecycle = String(j?.status ?? "").toLowerCase();
  const createdMs = safeDateValue(j?.created_at);
  const jobId = String(j?.id ?? "");

  if (!createdMs) return false;

  if (
    status === "need_to_schedule" &&
    lifecycle === "open" &&
    createdMs <= safeDateValue(attentionBusinessCutoffIso)
  ) {
    return true;
  }

  const pendingInfoSignal = status === "pending_info";

  if (pendingInfoSignal && createdMs <= safeDateValue(attentionBusinessCutoffIso)) {
    return true;
  }

  if (
    status === "failed" &&
    createdMs <= safeDateValue(failedCutoffIso) &&
    !resolvedFailedParentIds.has(jobId) &&
    !hasScheduledRetestForJob(jobId)
  ) {
    return true;
  }

  return false;
}

function actionablePriorityRank(j: any) {
  const opsStatus = String(j?.ops_status ?? "").toLowerCase();
  const pendingInfoSignal = opsStatus === "pending_info";

  if (isNeedsAttentionJob(j)) return 0;
  if (pendingInfoSignal || opsStatus === "pending_info") return 1;
  if (opsStatus === "on_hold") return 2;
  return 3;
}

function prioritizeActionableJobs<T>(jobs: T[]) {
  return jobs
    .map((job, index) => ({ job, index }))
    .sort((a, b) => {
      const rankA = actionablePriorityRank(a.job);
      const rankB = actionablePriorityRank(b.job);
      if (rankA !== rankB) return rankA - rankB;
      return a.index - b.index;
    })
    .map((entry) => entry.job);
}

function displayOpsCardTitle(value: unknown) {
  return normalizeRetestLinkedJobTitle(value) || "Job";
}

function compactRow(j: any, showDate = false, note?: string, emphasize = false) {
  const jobId = String(j?.id ?? "");
  const displayTitle = displayOpsCardTitle(j?.title);
  const assignmentSummary = assignmentSummaryForJob(jobId);
  const retestState = retestStateForJob(jobId);
  const scheduledRetestLabel = retestScheduleLabelForJob(jobId);
  const lifecycleStatus = String(j?.status ?? "").toLowerCase();
  const opsStatus = String(j?.ops_status ?? "").toLowerCase();
  const isFailed = opsStatus === "failed";
  const isFailedFamily = ["failed", "retest_needed", "pending_office_review"].includes(opsStatus);
  const isPendingOfficeReview = opsStatus === "pending_office_review";
  const isRetestChild = Boolean(String(j?.parent_job_id ?? "").trim());
  const statusMeta = isFailed
    ? { label: "FAILED", tone: "border-rose-200 bg-rose-50 text-rose-800" }
    : isPendingOfficeReview
    ? { label: "UNDER REVIEW", tone: "border-cyan-200 bg-cyan-50 text-cyan-800" }
    : retestState === "pending_scheduling"
    ? { label: "Retest Pending Scheduling", tone: "border-amber-200 bg-amber-50 text-amber-800" }
    : scheduledRetestLabel
    ? { label: "Retest Scheduled", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" }
    : lifecycleStatus === "on_the_way"
    ? { label: "On the Way", tone: "border-sky-200 bg-sky-50 text-sky-800" }
    : lifecycleStatus === "in_progress"
    ? { label: "In Progress", tone: "border-blue-200 bg-blue-50 text-blue-800" }
    : opsStatus === "scheduled"
    ? { label: "Scheduled", tone: "border-slate-200 bg-slate-50 text-slate-800" }
    : { label: "Open", tone: "border-slate-200 bg-slate-50 text-slate-800" };
  const pendingInfoSignal = opsStatus === "pending_info";
  const onHoldSignal = opsStatus === "on_hold";
  const needsAttention = isNeedsAttentionJob(j);
  const pendingInfoReason = String(j?.pending_info_reason ?? "").trim();
  const onHoldReason = String(j?.on_hold_reason ?? "").trim();
  const pendingInfoContext = pendingInfoReason
    ? pendingInfoReason
    : "Reason not set";
  const onHoldContext = onHoldReason || "Reason not set";
  const customerName = customerNameOnly(j);
  const customerPhone = customerPhoneOnly(j);
  const contractorName = contractorNameOnly(j);
  const phoneHref = telHref(customerPhone);
  const textHref = smsHref(customerPhone);
  const hasRetestReady = hasSignalEventForJob(latestRetestReadyByJob, jobId);
  const scheduleDateText = j?.scheduled_date ? formatBusinessDateUS(String(j.scheduled_date)) : "Not scheduled";
  const scheduleWindowText = displayWindowLA(j.window_start, j.window_end) || (j?.scheduled_date ? "Window TBD" : "No time set");
  const nextStep = nextActionLabel(j, {
        retestReady: hasRetestReady,
        newContractorJob:
          String(j?.ops_status ?? "").toLowerCase() === "need_to_schedule" &&
          hasSignalEventForJob(latestContractorCreatedByJob, jobId),
        scheduledRetest: !!scheduledRetestLabel,
      });
  const noteText = String(note ?? "").trim();
  const nextStepNorm = nextStep.toLowerCase();
  const detailLine = !isFailed
    ? scheduledRetestLabel
      ? `Retest scheduled for ${scheduledRetestLabel}`
      : noteText && noteText.toLowerCase() !== nextStepNorm
      ? noteText
      : ""
    : "";
  const rawFailureReason = String(primaryFailureReasonByJob.get(jobId) ?? "").trim();
  const normalizedFailureReason = rawFailureReason.replace(/^failed\s*[-:]\s*/i, "").trim();
  const failedReasonText = normalizedFailureReason || "Test requirement not met";
  const failedStatusLabel = isPendingOfficeReview
    ? "Under Review"
    : retestState === "scheduled"
    ? "Retest Scheduled"
    : retestState === "pending_scheduling"
    ? "Retest Pending Scheduling"
    : opsStatus === "retest_needed"
    ? "Retest Needed"
    : isRetestChild
    ? "Failed Retest"
    : "Failed";
  const failedSupportText = isPendingOfficeReview
    ? "Corrections submitted. Internal review is in progress."
    : retestState === "scheduled"
    ? `Retest scheduled for ${scheduledRetestLabel}`
    : retestState === "pending_scheduling"
    ? "Retest child exists but still needs a scheduled date/time."
    : opsStatus === "retest_needed"
    ? hasRetestReady
      ? "Contractor marked correction complete and is ready for retest review."
      : "Retest is required before this failure can be cleared."
    : isRetestChild
    ? "This retest also failed and still needs correction."
    : "Awaiting correction or retest decision.";
  const hasPrimaryStatusCallout = isFailedFamily || pendingInfoSignal || onHoldSignal;
  const showStatusPill = !hasPrimaryStatusCallout && statusMeta.label !== "Open";
  const scheduleLabel = showDate ? "Scheduled" : "Schedule";
  const metaItems = [
    customerPhone ? customerPhone : null,
    contractorName !== "Unassigned" ? `Contractor: ${contractorName}` : null,
    assignmentSummary !== "Unassigned" ? `Assigned: ${assignmentSummary}` : null,
  ].filter(Boolean) as string[];

  return (
    <div
      key={j.id}
      className={[
        "relative rounded-2xl border bg-white px-3 py-2.5 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.32)] ring-1 ring-slate-200/70 transition-all duration-150 hover:-translate-y-px hover:shadow-[0_16px_34px_-22px_rgba(15,23,42,0.35)] sm:px-3.5 sm:py-3",
        emphasize && needsAttention
          ? "border-amber-300 bg-amber-50/35"
          : "border-slate-200/90",
      ].join(" ")}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link
              href={`/jobs/${j.id}?tab=ops`}
              className="inline-block text-[15px] font-semibold leading-5 tracking-[-0.01em] text-blue-700 hover:text-blue-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-1"
            >
              {displayTitle}
            </Link>
            <div className="mt-1 text-[14px] font-semibold leading-5 text-slate-950">{customerName}</div>
            <div className="mt-0.5 text-[12px] leading-4.5 text-slate-600">{addressLine(j)}</div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5 text-[11px]">
            {emphasize && needsAttention ? (
              <span className="inline-flex rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 font-semibold uppercase tracking-[0.08em] text-amber-800 shadow-sm">
                Attention
              </span>
            ) : null}
            {showStatusPill ? (
              <span className={`inline-flex rounded-full border px-2 py-0.5 font-medium shadow-sm ${statusMeta.tone}`}>
                {statusMeta.label}
              </span>
            ) : null}
          </div>
        </div>

        {isFailedFamily ? (
          <div className="mt-2 rounded-xl border border-rose-200/80 bg-rose-50/70 px-2.5 py-1.5 text-rose-900">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-rose-700">{failedStatusLabel}</div>
              <div className="text-sm font-medium text-rose-900">{failedReasonText}</div>
            </div>
            {failedSupportText ? (
              <div className="mt-1 text-[11px] leading-4 text-rose-900/80">{failedSupportText}</div>
            ) : null}
          </div>
        ) : null}

        {pendingInfoSignal ? (
          <div className="mt-2 rounded-xl border border-amber-200/80 bg-amber-50/70 px-2.5 py-1.5 text-amber-900">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-700">Pending Info</div>
              <div className="text-sm font-medium text-amber-900">{pendingInfoContext}</div>
            </div>
          </div>
        ) : null}

        {onHoldSignal ? (
          <div className="mt-2 rounded-xl border border-slate-300/90 bg-slate-100/80 px-2.5 py-1.5 text-slate-800">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-600">On Hold</div>
              <div className="text-sm font-medium text-slate-800">{onHoldContext}</div>
            </div>
          </div>
        ) : null}

        <div className="mt-2 space-y-1.5 border-t border-slate-200/80 pt-2">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/80 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{scheduleLabel}</div>
              <div className="mt-0.5 text-sm font-semibold leading-5 text-slate-950">{scheduleDateText}</div>
              <div className="text-[12px] leading-4.5 text-slate-600">{scheduleWindowText}</div>
            </div>
            <div className="min-w-0 rounded-xl border border-blue-100/90 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.98))] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700">Next Step</div>
              <div className="mt-0.5 text-sm font-semibold leading-5 text-slate-950">{nextStep}</div>
              {detailLine ? (
                <div className="mt-0.5 text-[12px] leading-4.5 text-slate-600">{detailLine}</div>
              ) : null}
            </div>
          </div>
          {metaItems.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 text-[11px] leading-4 text-slate-600">
              {metaItems.map((item) => (
                <span key={item} className="inline-flex rounded-full border border-slate-300/80 bg-slate-100/90 px-2 py-0.5 font-medium text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2">
        <Link
          href={`/jobs/${j.id}?tab=ops`}
          className="inline-flex min-h-10 flex-[1.35] items-center justify-center rounded-xl border border-slate-900 bg-[linear-gradient(180deg,rgba(15,23,42,1),rgba(30,41,59,0.98))] px-3 py-2 text-sm font-semibold text-white shadow-[0_14px_24px_-18px_rgba(15,23,42,0.55)] transition-all hover:-translate-y-px hover:border-slate-800 hover:bg-[linear-gradient(180deg,rgba(15,23,42,1),rgba(15,23,42,1))] hover:shadow-[0_18px_30px_-18px_rgba(15,23,42,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50 active:translate-y-0 sm:min-h-9 sm:flex-none sm:px-3 sm:py-1.5 sm:text-xs"
        >
          View Job
        </Link>
        {phoneHref ? (
          <a
            href={phoneHref}
            className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-slate-300/90 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,252,0.96))] px-3 py-2 text-sm font-semibold text-slate-700 shadow-[0_10px_18px_-18px_rgba(15,23,42,0.4)] transition-all hover:-translate-y-px hover:border-slate-400 hover:bg-white hover:text-slate-900 hover:shadow-[0_14px_22px_-18px_rgba(15,23,42,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 active:translate-y-0 sm:min-h-9 sm:flex-none sm:px-3 sm:py-1.5 sm:text-xs"
          >
            Call
          </a>
        ) : null}
        {textHref ? (
          <a
            href={textHref}
            className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-slate-300/90 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,252,0.96))] px-3 py-2 text-sm font-semibold text-slate-700 shadow-[0_10px_18px_-18px_rgba(15,23,42,0.4)] transition-all hover:-translate-y-px hover:border-slate-400 hover:bg-white hover:text-slate-900 hover:shadow-[0_14px_22px_-18px_rgba(15,23,42,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 active:translate-y-0 sm:min-h-9 sm:flex-none sm:px-3 sm:py-1.5 sm:text-xs"
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

function quietSectionEmptyState(message: string, tone: "neutral" | "success" = "neutral") {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50/60 text-emerald-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
      : "border-slate-300/80 bg-white/92 text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]";

  const dotClass = tone === "success" ? "bg-emerald-500" : "bg-slate-400";

  return (
    <div className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium ${toneClass}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

const sectionActionLinkClass =
  "inline-flex items-center rounded-xl border border-slate-300/80 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-[0_8px_18px_-16px_rgba(15,23,42,0.35)] transition-all hover:-translate-y-px hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/70 active:translate-y-0";

const inlineSectionLinkClass =
  "inline-flex items-center rounded-lg border border-slate-200/80 bg-white/85 px-2 py-0.5 text-[11px] font-semibold text-blue-700 shadow-[0_6px_16px_-14px_rgba(15,23,42,0.25)] transition-colors hover:border-blue-200 hover:bg-blue-50/70 hover:text-blue-800";

function sectionCountPill(count: number, tone: "neutral" | "danger" = "neutral") {
  const className =
    tone === "danger"
      ? "inline-flex min-w-8 items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 shadow-[0_6px_16px_-14px_rgba(225,29,72,0.28)]"
      : "inline-flex min-w-8 items-center justify-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 shadow-[0_6px_16px_-14px_rgba(15,23,42,0.2)]";

  return <span className={className}>{count}</span>;
}

return (
  <div className="mx-auto max-w-6xl space-y-3 p-2.5 text-gray-900 sm:space-y-4 sm:p-4 lg:space-y-5">
    <section className="relative overflow-hidden rounded-2xl border border-slate-300/80 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(248,250,252,0.98)_60%,rgba(239,246,255,0.75))] p-3.5 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/60 sm:p-4">
      <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-28 w-28 rounded-full bg-blue-100/50 blur-3xl" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/90 bg-white shadow-[0_12px_24px_-18px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70">
            <Image src="/icon.png" alt="Compliance Matters logo" width={22} height={22} className="h-5.5 w-5.5 rounded-sm" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Compliance Matters</div>
            <h1 className="text-xl font-semibold tracking-[-0.02em] text-slate-950 sm:text-[1.45rem]">Ops Dashboard</h1>
            <div className="mt-1 max-w-2xl text-[12.5px] leading-5 text-slate-600 sm:text-[13px]">Operational queues, field follow-up, and closeout work in one surface.</div>
          </div>
        </div>
        <div className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-[0_6px_18px_-16px_rgba(15,23,42,0.35)] ${selectedContractorName ? "border-blue-200 bg-blue-50/85 text-blue-800" : "border-slate-300/80 bg-white text-slate-700"}`}>
          <span className="truncate">{selectedContractorName ? `Filtered: ${selectedContractorName}` : "All contractors"}</span>
        </div>
      </div>
    </section>

    <section className="rounded-2xl border border-slate-300/75 bg-slate-50/75 p-3 shadow-[0_14px_32px_-28px_rgba(15,23,42,0.35)] sm:p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Internal</div>
          <h2 className="text-sm font-semibold text-slate-900">Recent Notifications</h2>
        </div>
        <Link
          href="/ops/notifications"
          className={sectionActionLinkClass}
        >
          View all
        </Link>
      </div>

      {recentNotifications.length === 0 ? (
        <p className="text-sm text-slate-500">You're all caught up.</p>
      ) : (
        <div className="space-y-2">
          {recentNotifications.map((n) => (
            <div
              key={n.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-slate-300/70 bg-white px-3 py-2 shadow-[0_10px_22px_-20px_rgba(15,23,42,0.24)]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {n.subject || n.notification_type}
                  </p>
                  {n.is_unread ? (
                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden="true" />
                  ) : null}
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-slate-600">
                  {n.body || "No additional details."}
                </p>
              </div>
              {n.job_id ? (
                <Link
                  href={`/jobs/${n.job_id}`}
                  className="inline-flex shrink-0 items-center rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 shadow-sm transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                >
                  Job
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>

    <section className="rounded-2xl border border-slate-300/75 bg-slate-50/80 p-3 shadow-[0_14px_32px_-28px_rgba(15,23,42,0.35)] sm:p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Internal</div>
          <div className="text-[15px] font-semibold tracking-tight text-slate-950">Filters</div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-300/80 bg-white px-3 py-1 text-[11px] shadow-[0_8px_18px_-16px_rgba(15,23,42,0.3)]">
          <span className="font-semibold uppercase tracking-wide text-slate-500">Queue</span>
          <span className="font-medium text-slate-800">{OPS_TABS.find((t) => t.key === bucket)?.label ?? "Ops"}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <ContractorFilter contractors={contractors ?? []} selectedId={contractor ?? ""} />
        <div className="grid gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Sort</label>
          <form action="/ops" method="get" className="flex flex-col gap-2 sm:flex-row">
            <input type="hidden" name="bucket" value={bucket} />
            <input type="hidden" name="contractor" value={contractor ?? ""} />
            <input type="hidden" name="q" value={q ?? ""} />
            <input type="hidden" name="signal" value={signal ?? ""} />
            <select
              name="sort"
              defaultValue={sort}
              className="w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
            >
              <option value="default">Default queue order</option>
              <option value="customer">Customer</option>
              <option value="scheduled">Scheduled date/time</option>
              <option value="created">Created date</option>
              <option value="address">Address</option>
            </select>
            <button
              type="submit"
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-px hover:bg-slate-800 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50 active:translate-y-0"
            >
              Apply
            </button>
          </form>
        </div>
      </div>
      <div className="mt-2.5 grid gap-1">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Filter Jobs</label>
          <p className="mt-0.5 text-xs text-gray-500">Searches visible jobs on this page only</p>
        </div>
        <form action="/ops" method="get" className="flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="bucket" value={bucket} />
          <input type="hidden" name="contractor" value={contractor ?? ""} />
          <input type="hidden" name="sort" value={sort} />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Name, phone, address, city, title"
            className="w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)] placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
          />
          <button
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-px hover:bg-slate-800 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50 active:translate-y-0"
            type="submit"
          >
            Search
          </button>
        </form>
      </div>
    </section>

    <section className={`rounded-2xl border p-3 shadow-[0_14px_32px_-28px_rgba(15,23,42,0.35)] sm:p-3.5 ${hasActiveSystemAlerts || signal ? "border-slate-300/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))]" : "border-slate-300/75 bg-slate-50/75"}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700">Contractor-driven</div>
          <div className="text-[15px] font-semibold tracking-tight text-slate-950">System Alerts</div>
        </div>
        {!hasActiveSystemAlerts && !signal ? null : (
          <div className="rounded-full border border-blue-200/80 bg-blue-50/70 px-2 py-0.5 text-[10px] font-medium text-blue-700 shadow-[0_8px_18px_-16px_rgba(37,99,235,0.35)]">
            Active alerts
          </div>
        )}
      </div>
      {visibleSignalCards.length === 0 && !signal
        ? quietSectionEmptyState("No active contractor-driven alerts right now.")
        : (
          <div className="flex flex-wrap gap-2">
            {visibleSignalCards.map((card) => {
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
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm transition-colors",
                    isActive
                      ? "border-blue-700 bg-blue-700 text-white shadow-[0_10px_22px_-16px_rgba(37,99,235,0.45)]"
                      : `${signalToneClass(card.key)} hover:bg-white`,
                  ].join(" ")}
                >
                  <span>{card.label}</span>
                  <span className={isActive ? "text-slate-200" : "text-current/80"}>{card.count}</span>
                </Link>
              );
            })}
          </div>
        )}
    </section>

    <section className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
      <div className={`rounded-2xl border ${callListVisibleJobs.length === 0 ? "border-slate-300/75 bg-slate-50/85 p-3" : "border-slate-300/80 bg-white p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.38)] ring-1 ring-slate-200/70 sm:p-3.5"}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-[15px] font-semibold tracking-tight text-slate-950">Call List</div>
          <div className="flex items-center gap-3">
            {sectionCountPill(prioritizedCallListJobs.length)}
            {prioritizedCallListJobs.length > PREVIEW_LIMIT ? (
              <Link
                href={`/ops${buildQueryString({
                  bucket,
                  contractor: contractor ?? "",
                  q: q ?? "",
                  sort: sort ?? "",
                  signal: signal ?? "",
                  panel: isPanelExpanded("call_list") ? "" : "call_list",
                })}`}
                className={inlineSectionLinkClass}
              >
                {isPanelExpanded("call_list") ? "Show less" : "View all"}
              </Link>
            ) : null}
          </div>
        </div>
        {callListVisibleJobs.length === 0 ? (
          quietSectionEmptyState("No jobs need scheduling right now.")
        ) : (
          <div className="space-y-2">{callListVisibleJobs.map((j: any) => compactRow(j, false, undefined, true))}</div>
        )}
      </div>

    <div className={`rounded-2xl border ${prioritizedFieldWorkJobs.length === 0 ? "border-slate-300/75 bg-slate-50/85 p-3" : "border-slate-300/80 bg-white p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.38)] ring-1 ring-slate-200/70 sm:p-3.5"}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[15px] font-semibold tracking-tight text-slate-950">Field Work</div>
        <div className="flex items-center gap-3">
          {sectionCountPill(prioritizedFieldWorkJobs.length)}
          {prioritizedFieldWorkJobs.length > PREVIEW_LIMIT ? (
            <Link
              href={`/ops${buildQueryString({
                bucket,
                contractor: contractor ?? "",
                q: q ?? "",
                sort: sort ?? "",
                signal: signal ?? "",
                panel: isPanelExpanded("field_work") ? "" : "field_work",
              })}`}
              className={inlineSectionLinkClass}
            >
              {isPanelExpanded("field_work") ? "Show less" : "View all"}
            </Link>
          ) : null}
        </div>
      </div>

  {prioritizedFieldWorkJobs.length === 0 ? (
    quietSectionEmptyState("Field work complete for today.", "success")
  ) : (
    <div className="space-y-2">
      {fieldWorkVisibleJobs.map((j: any) => compactRow(j, true, undefined, true))}
    </div>
  )}
</div>

      <div className={`rounded-2xl border ${closeoutVisibleJobs.length === 0 ? "border-slate-300/75 bg-slate-50/85 p-3" : "border-slate-300/80 bg-white p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.38)] ring-1 ring-slate-200/70 sm:p-3.5"}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-[15px] font-semibold tracking-tight text-slate-950">Closeout Work Queue</div>
          <div className="flex items-center gap-3">
            {sectionCountPill(prioritizedCloseoutJobs.length)}
            {prioritizedCloseoutJobs.length > PREVIEW_LIMIT ? (
              <Link
                href={`/ops${buildQueryString({
                  bucket,
                  contractor: contractor ?? "",
                  q: q ?? "",
                  sort: sort ?? "",
                  signal: signal ?? "",
                  panel: isPanelExpanded("closeout") ? "" : "closeout",
                })}`}
                className={inlineSectionLinkClass}
              >
                {isPanelExpanded("closeout") ? "Show less" : "View all"}
              </Link>
            ) : null}
          </div>
        </div>
        {closeoutVisibleJobs.length === 0 ? (
          quietSectionEmptyState("No closeout work is waiting right now.")
        ) : (
          <div className="space-y-2">
            {closeoutVisibleJobs.map((j: any) => compactRow(j, false, closeoutLabel(j), true))}
          </div>
        )}
      </div>
    </section>

    <section className={`rounded-2xl border ${exceptionVisibleJobs.length === 0 ? "border-slate-300/75 bg-slate-50/85 p-3" : "border-slate-300/80 bg-white p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.38)] ring-1 ring-slate-200/70 sm:p-3.5"}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[15px] font-semibold tracking-tight text-slate-950">Exceptions (Still Open Past Scheduled Date)</div>
        <div className="flex items-center gap-3">
          {sectionCountPill(sortedExceptionJobs.length, "danger")}
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
              className={inlineSectionLinkClass}
            >
              {isPanelExpanded("exceptions") ? "Show less" : "View all"}
            </Link>
          ) : null}
        </div>
      </div>
      {exceptionVisibleJobs.length === 0 ? (
        quietSectionEmptyState("No exception jobs with the current filters.")
      ) : (
        <div className="space-y-2">
          {exceptionVisibleJobs.map((j: any) => {
            const meta = exceptionMetaById.get(String(j?.id ?? ""));
            const note = meta ? `${meta.reason} | ${meta.aging}` : "Exception";
            return compactRow(j, true, note);
          })}
        </div>
      )}
    </section>

    <section id="ops-queues" className="rounded-2xl border border-slate-300/80 bg-slate-100/70 p-3 shadow-[0_18px_42px_-32px_rgba(15,23,42,0.38)] sm:p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Workflow</div>
          <div className="text-[15px] font-semibold tracking-tight text-slate-950">System / Contractor Work</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-1">
        <div className="rounded-2xl border border-slate-300/80 bg-white/88 p-3 shadow-[0_14px_32px_-28px_rgba(15,23,42,0.32)]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[15px] font-semibold tracking-tight text-slate-950">Workflow Queues</div>
            <Link
              href={`/ops${buildQueryString({
                bucket: "workflow_all",
                contractor: contractor ?? "",
                q: q ?? "",
                sort: sort ?? "",
                signal: "",
              })}#ops-queues`}
              className={inlineSectionLinkClass}
            >
              View All
            </Link>
          </div>
          <div className="flex flex-wrap gap-1.5">
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
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm transition-colors",
                    isActive
                      ? "border-blue-700 bg-blue-700 text-white shadow-[0_10px_22px_-16px_rgba(37,99,235,0.45)]"
                      : `${workflowToneClass(card.key)} hover:bg-white`,
                  ].join(" ")}
                >
                  <span className={isActive ? "text-slate-200" : "text-current/80"}>{card.label}</span>
                  <span className="font-semibold">{card.count}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-slate-300/80 bg-white/94 p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.34)] ring-1 ring-slate-200/60">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-[15px] font-semibold tracking-tight text-slate-950">
            Active Queue: {activeQueueLabel}
            {activeSignalLabel ? ` (${activeSignalLabel})` : ""}
          </div>
          <div className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-600 shadow-sm">{sortedBucketJobs.length} jobs</div>
        </div>

        {sortedBucketJobs.length === 0 ? (
          quietSectionEmptyState("No jobs in this queue with current filters.")
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
                    scheduledRetest: hasScheduledRetestForJob(String(j.id ?? "")),
                  })
                : queueReason(j, bucket);

              return compactRow(j, true, note || undefined);
            })}
          </div>
        )}
      </div>
    </section>
  </div>
);
}
