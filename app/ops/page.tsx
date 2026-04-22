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
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { buildBillingTruthCloseoutProjectionMap } from "@/lib/business/job-billing-state";
import { buildPromotedCompanionReadModel, buildVisitScopeReadModel } from "@/lib/jobs/visit-scope";
import { listInternalNotifications } from "@/lib/actions/notification-read-actions";
import OperationalReportingSection from "./_components/OperationalReportingSection";
import {
  buildOperationalReportingReadModel,
  type OperationalReportingJob,
} from "@/lib/ops/operational-reporting";


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

  let internalUser: Awaited<ReturnType<typeof requireInternalUser>>["internalUser"];

  try {
    const internalAccess = await requireInternalUser({
      supabase,
      userId: user.id,
    });
    internalUser = internalAccess.internalUser;
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

  const internalBusinessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });
  const internalBusinessDisplayName = internalBusinessIdentity.display_name;

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
   "id, title, status, parent_job_id, service_case_id, job_type, ops_status, field_complete, field_complete_at, certs_complete, invoice_complete, invoice_number, permit_number, pending_info_reason, on_hold_reason, scheduled_date, window_start, window_end, city, job_address, customer_first_name, customer_last_name, customer_phone, contractor_id, contractors(name), customer_id, deleted_at, location_id, created_at, visit_scope_summary, visit_scope_items";

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
const recentThroughputCutoffIso = new Date(
  now.getTime() - 7 * 24 * 60 * 60 * 1000
).toISOString();
const recentServiceWindowCutoffIso = new Date(
  now.getTime() - 30 * 24 * 60 * 60 * 1000
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

  let operationalReportingJobsQ = supabase
    .from("jobs")
    .select(
      "id, parent_job_id, service_case_id, job_type, status, ops_status, created_at, scheduled_date, field_complete, field_complete_at, service_visit_outcome, invoice_complete, certs_complete"
    )
    .is("deleted_at", null)
    .neq("status", "cancelled");

  if (contractor) operationalReportingJobsQ = operationalReportingJobsQ.eq("contractor_id", contractor);

  const { data: operationalReportingJobsRaw, error: operationalReportingJobsErr } = await operationalReportingJobsQ;
  if (operationalReportingJobsErr) throw operationalReportingJobsErr;

  const operationalReportingJobs = (operationalReportingJobsRaw ?? [])
    .filter((job: any) => !shouldHideFailedParentJob(job)) as OperationalReportingJob[];

  const reportingServiceCaseIds = Array.from(
    new Set(
      operationalReportingJobs
        .map((job) => String(job.service_case_id ?? "").trim())
        .filter(Boolean)
    )
  );

  const { data: reportingServiceCases, error: reportingServiceCasesErr } = reportingServiceCaseIds.length
    ? await supabase
        .from("service_cases")
        .select("id, status")
        .in("id", reportingServiceCaseIds)
    : { data: [], error: null };

  if (reportingServiceCasesErr) throw reportingServiceCasesErr;

  let throughputEventRows: Array<{ event_type: string | null }> = [];

  if (!contractor || operationalReportingJobs.length > 0) {
    let throughputEventsQ = supabase
      .from("job_events")
      .select("event_type")
      .gte("created_at", recentThroughputCutoffIso)
      .in("event_type", ["job_created", "job_completed", "scheduled", "schedule_updated", "contractor_schedule_updated"]);

    if (contractor) {
      throughputEventsQ = throughputEventsQ.in(
        "job_id",
        operationalReportingJobs.map((job) => job.id)
      );
    }

    const { data: throughputEventsRaw, error: throughputEventsErr } = await throughputEventsQ;
    if (throughputEventsErr) throw throughputEventsErr;
    throughputEventRows = throughputEventsRaw ?? [];
  }

  const recentCreatedCount = throughputEventRows.filter(
    (row) => String(row.event_type ?? "").toLowerCase() === "job_created"
  ).length;
  const recentCompletedCount = throughputEventRows.filter(
    (row) => String(row.event_type ?? "").toLowerCase() === "job_completed"
  ).length;
  const recentScheduleTouchCount = throughputEventRows.filter((row) => {
    const eventType = String(row.event_type ?? "").toLowerCase();
    return (
      eventType === "scheduled" ||
      eventType === "schedule_updated" ||
      eventType === "contractor_schedule_updated"
    );
  }).length;

  const closeoutProjectionJobInputs = [
    ...fieldWorkJobs,
    ...upcomingJobs,
    ...callListJobs,
    ...closeoutSourceJobs,
    ...stillOpenJobs,
    ...attentionJobs,
    ...operationalReportingJobs,
  ].map((job: any) => ({
    id: String(job?.id ?? "").trim(),
    field_complete: job?.field_complete,
    job_type: job?.job_type,
    ops_status: job?.ops_status,
    invoice_complete: job?.invoice_complete,
    certs_complete: job?.certs_complete,
  }));

  const { projectionsByJobId: closeoutProjectionByJobId } = await buildBillingTruthCloseoutProjectionMap({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobs: closeoutProjectionJobInputs,
  });

  const getCloseoutProjection = (job: any) =>
    closeoutProjectionByJobId.get(String(job?.id ?? "").trim()) ?? job;

  const operationalReporting = buildOperationalReportingReadModel({
    jobs: operationalReportingJobs,
    closeoutProjectionByJobId,
    attentionBusinessCutoffIso,
    failedCutoffIso,
    recentCreatedCount,
    recentCompletedCount,
    recentScheduleTouchCount,
    openServiceCaseCount: (reportingServiceCases ?? []).filter(
      (serviceCase: any) => String(serviceCase.status ?? "").toLowerCase() === "open"
    ).length,
    resolvedServiceCaseCount: (reportingServiceCases ?? []).filter(
      (serviceCase: any) => String(serviceCase.status ?? "").toLowerCase() === "resolved"
    ).length,
    recentServiceWindowCutoffIso,
  });

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
      ? (bucketJobs ?? []).filter((j: any) => isInCloseoutQueue(getCloseoutProjection(j)))
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

  return internalBusinessDisplayName;
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

function pendingInfoBannerText(j: any) {
  return String(j?.pending_info_reason ?? "").trim();
}

function onHoldBannerText(j: any) {
  return String(j?.on_hold_reason ?? "").trim();
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
    const pendingInfoReason = pendingInfoBannerText(j);
    return pendingInfoReason ? `Pending info — ${pendingInfoReason}` : "";
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
    const onHoldReason = onHoldBannerText(j);
    return onHoldReason
      ? `On hold — ${onHoldReason}`
      : "";
  }

  if (status === "need_to_schedule") {
    return "Waiting to be scheduled";
  }

  if (activeBucket === "paperwork_required" || status === "paperwork_required") {
    const needs = getCloseoutNeeds(getCloseoutProjection(j));
    if (needs.needsCerts && needs.needsInvoice) return "Paperwork required — certs and invoice pending";
    if (needs.needsCerts) return "Paperwork required — certs pending";
    if (needs.needsInvoice) return "Paperwork required — invoice pending";
    return "Paperwork required — closeout processing pending";
  }

  if (activeBucket === "invoice_required" || status === "invoice_required") {
    const needs = getCloseoutNeeds(getCloseoutProjection(j));
    if (needs.needsInvoice) return "Status bucket — invoice still needed";
    return "Status bucket — invoice follow-up already satisfied";
  }

  if (activeBucket === "closeout") {
    const needs = getCloseoutNeeds(getCloseoutProjection(j));
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
  const needs = getCloseoutNeeds(getCloseoutProjection(j));
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
    const latestAttentionEvent = latestContractorAttentionEventByJob.get(String(j?.id ?? ""));
    const updateType = String(latestAttentionEvent?.event_type ?? "").toLowerCase();
    const meta = ((latestAttentionEvent?.meta ?? {}) as Record<string, unknown>);
    const attachmentCount = Array.isArray(meta.attachment_ids)
      ? meta.attachment_ids.length
      : Array.isArray(meta.file_names)
      ? meta.file_names.length
      : 0;
    if (updateType === "contractor_correction_submission") return "Contractor submitted corrections for review";
    if (updateType === "contractor_schedule_updated") return "Contractor updated schedule details";
    if (updateType === "attachment_added" && String(meta.source ?? "").trim().toLowerCase() === "contractor") {
      return "Contractor uploaded attachments";
    }
    if (updateType === "contractor_note" && attachmentCount > 0) return "Contractor uploaded attachments";
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
const unreadContractorAwarenessNotifications = await listInternalNotifications({
  limit: 100,
  onlyUnread: true,
  filterKey: "contractor_updates",
});

const unreadContractorUpdateNotifications = unreadContractorAwarenessNotifications
  .filter((notification) => {
    const jobId = String(notification.job_id ?? "").trim();
    return Boolean(jobId);
  })
  .map((notification) => ({
    job_id: String(notification.job_id ?? "").trim(),
    notification_type: String(notification.notification_type ?? "").trim(),
    created_at: String(notification.created_at ?? "").trim(),
  }));

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
const latestContractorAttentionEventByJob = new Map<string, any>();

for (const ev of signalEvents ?? []) {
  const jobId = String((ev as any).job_id ?? "");
  const type = String((ev as any).event_type ?? "");
  const meta = ((ev as any).meta ?? {}) as Record<string, unknown>;

  if (type === "retest_ready_requested" && !latestRetestReadyByJob.has(jobId)) {
    latestRetestReadyByJob.set(jobId, ev);
  }

  if (type === "contractor_job_created" && !latestContractorCreatedByJob.has(jobId)) {
    latestContractorCreatedByJob.set(jobId, ev);
  }

  if (
    !latestContractorAttentionEventByJob.has(jobId) &&
    (
      type === "contractor_note" ||
      type === "contractor_correction_submission" ||
      type === "contractor_schedule_updated" ||
      (type === "attachment_added" && String(meta.source ?? "").trim().toLowerCase() === "contractor")
    )
  ) {
    latestContractorAttentionEventByJob.set(jobId, ev);
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

const contractorUpdatesCount = unreadContractorAwarenessNotifications.length;

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
  const needs = getCloseoutNeeds(getCloseoutProjection(j));
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

function closeoutLabel(j: any) {
  const needs = getCloseoutNeeds(getCloseoutProjection(j));
  if (needs.needsInvoice && needs.needsCerts) return "Working closeout — invoice + certs required";
  if (needs.needsInvoice) return "Working closeout — invoice required";
  if (needs.needsCerts) return "Working closeout — certs required";
  return "Ready to close";
}

const closeoutJobs = sortJobs(
  (closeoutSourceJobs ?? []).filter((j: any) => {
    return isInCloseoutQueue(getCloseoutProjection(j));
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

function contractorResponseBadgeLabelForJob(jobId: string) {
  const unreadNotification = latestUnreadContractorUpdateNotificationByJob.get(jobId);
  const unreadType = String(unreadNotification?.notification_type ?? "").trim().toLowerCase();
  if (!unreadType) return null;

  if (unreadType === "contractor_note") {
    const attentionEvent = latestContractorAttentionEventByJob.get(jobId);
    const attentionType = String(attentionEvent?.event_type ?? "").trim().toLowerCase();
    const meta = ((attentionEvent?.meta ?? {}) as Record<string, unknown>);
    const attachmentCount = Array.isArray(meta.attachment_ids)
      ? meta.attachment_ids.length
      : Array.isArray(meta.file_names)
      ? meta.file_names.length
      : 0;

    if (attentionType === "contractor_note" && attachmentCount === 0) {
      return "New Note";
    }
  }

  return "New Update";
}

function compactRow(j: any, showDate = false, note?: string, emphasize = false) {
  const jobId = String(j?.id ?? "");
  const displayTitle = displayOpsCardTitle(j?.title);
  const contractorResponseBadgeLabel = contractorResponseBadgeLabelForJob(jobId);
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
  const pendingInfoContext = pendingInfoBannerText(j);
  const onHoldContext = onHoldBannerText(j);
  const showPendingInfoBanner = pendingInfoSignal && Boolean(pendingInfoContext);
  const showOnHoldBanner = onHoldSignal && Boolean(onHoldContext);
  const customerName = customerNameOnly(j);
  const customerPhone = customerPhoneOnly(j);
  const visitScope = buildVisitScopeReadModel(j?.visit_scope_summary, j?.visit_scope_items, {
    leadMaxLength: 82,
    previewItemCount: 1,
    previewItemMaxLength: 34,
  });
  const promotedCompanion = buildPromotedCompanionReadModel(j?.visit_scope_items);
  const contractorName = contractorNameOnly(j);
  const phoneHref = telHref(customerPhone);
  const textHref = smsHref(customerPhone);
  const preferredPhoneHref = phoneHref || textHref;
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
  const hasMeaningfulStatusBanner = isFailedFamily || showPendingInfoBanner || showOnHoldBanner;
  const showNextStepSection = !hasMeaningfulStatusBanner || isPendingOfficeReview || pendingInfoSignal;
  const detailLine = !isFailed && !pendingInfoSignal && showNextStepSection
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
  const hasPrimaryStatusCallout = hasMeaningfulStatusBanner;
  const showStatusPill = !hasPrimaryStatusCallout && statusMeta.label !== "Open";
  const scheduleLabel = showDate ? "Scheduled" : "Schedule";
  const hasContractorMeta = contractorName !== "Unassigned";
  const isTechUnassigned = assignmentSummary === "Unassigned";
  const assignedDisplay = isTechUnassigned ? "Tech not assigned" : assignmentSummary;
  const reasonCallout = isFailedFamily
    ? {
        tone: "border-rose-200/80 bg-rose-50/60 text-rose-900",
        labelTone: "text-rose-700",
        bodyTone: "text-rose-900",
        supportTone: "text-rose-900/80",
        label: failedStatusLabel,
        message: failedReasonText,
        support: failedSupportText,
      }
    : showPendingInfoBanner
    ? {
        tone: "border-amber-200/80 bg-amber-50/60 text-amber-900",
        labelTone: "text-amber-700",
        bodyTone: "text-amber-900",
        supportTone: "text-amber-900/80",
        label: "Pending Info",
        message: pendingInfoContext,
        support: "",
      }
    : showOnHoldBanner
    ? {
        tone: "border-slate-300/90 bg-slate-100/80 text-slate-800",
        labelTone: "text-slate-600",
        bodyTone: "text-slate-800",
        supportTone: "text-slate-700/80",
        label: "On Hold",
        message: onHoldContext,
        support: "",
      }
    : null;
  const metaItems = [
    hasContractorMeta
      ? {
          key: "contractor",
          label: "Contractor",
          value: contractorName,
        }
      : null,
    {
      key: "assigned",
      label: "Assigned",
      value: assignedDisplay,
      framed: isTechUnassigned,
    },
  ].filter(Boolean) as Array<{ key: string; label: string; value: string; href?: string; framed?: boolean }>;

  return (
    <div
      key={j.id}
      className={[
        "relative rounded-xl border bg-white px-3 py-2 shadow-[0_10px_20px_-22px_rgba(15,23,42,0.28)] ring-1 ring-slate-200/70 transition-all duration-150 hover:-translate-y-px hover:shadow-[0_14px_26px_-22px_rgba(15,23,42,0.32)] sm:px-3 sm:py-2.5",
        emphasize && needsAttention
          ? "border-amber-300 bg-amber-50/35"
          : "border-slate-200/90",
      ].join(" ")}
    >
      <div className="min-w-0">
        <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(10rem,0.75fr)_minmax(0,1.25fr)] sm:items-start sm:gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link
                href={`/jobs/${j.id}?tab=ops`}
                className="inline-block text-[14px] font-semibold leading-5 tracking-[-0.01em] text-blue-700 hover:text-blue-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-1"
              >
                {displayTitle}
              </Link>
              {contractorResponseBadgeLabel ? (
                <span className="inline-flex items-center rounded-full border border-indigo-200/90 bg-indigo-50/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-indigo-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                  {contractorResponseBadgeLabel}
                </span>
              ) : null}
              {String(j?.job_type ?? "").toLowerCase() === "ecc" && promotedCompanion.hasPromotedCompanion ? (
                <span className="inline-flex items-center rounded-full border border-emerald-200/90 bg-emerald-50/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                  {promotedCompanion.label}
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 text-[13px] font-semibold leading-5 text-slate-950">{customerName}</div>
            <div className={`${opsSupportTextClass} text-slate-600`}>{addressLine(j)}</div>
            {visitScope.hasContent ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] leading-4 text-slate-600">
                <span className="font-semibold uppercase tracking-[0.08em] text-slate-500">Visit</span>
                <span className="min-w-0 font-medium text-slate-700">{visitScope.lead}</span>
                {visitScope.itemCount > 0 ? (
                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {visitScope.itemCount} item{visitScope.itemCount === 1 ? "" : "s"}
                  </span>
                ) : null}
                {visitScope.previewItems.map((item) => (
                  <span
                    key={`${jobId}-visit-preview-${item}`}
                    className="inline-flex rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                  >
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
            {customerPhone ? (
              <div className={`mt-0.5 ${opsSupportTextClass} text-slate-600`}>
                <span className="font-medium text-slate-500">Phone</span>{" "}
                {preferredPhoneHref ? (
                  <a
                    href={preferredPhoneHref}
                    className="font-medium text-slate-700 transition-colors hover:text-slate-950"
                  >
                    {customerPhone}
                  </a>
                ) : (
                  <span className="font-medium text-slate-700">{customerPhone}</span>
                )}
              </div>
            ) : null}
          </div>
          <div className="flex w-full flex-col gap-1.5 sm:min-w-0 sm:items-start sm:border-l sm:border-slate-200 sm:pl-3">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] sm:justify-start sm:text-[10px]">
              {emphasize && needsAttention ? (
                <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-[0.08em] text-amber-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                  Attention
                </span>
              ) : null}
              {showStatusPill ? (
                <span className={`inline-flex rounded-md border px-1.5 py-0.5 font-medium ${statusMeta.tone}`}>
                  {statusMeta.label}
                </span>
              ) : null}
            </div>
            {reasonCallout ? (
              <div className={`inline-block max-w-full rounded-lg border px-2.5 py-1.5 ${reasonCallout.tone}`}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <div className={`text-[11px] font-semibold uppercase tracking-[0.09em] sm:text-[10px] sm:tracking-[0.1em] ${reasonCallout.labelTone}`}>
                    {reasonCallout.label}
                  </div>
                  <div className={`text-[13px] font-medium leading-5 ${reasonCallout.bodyTone}`}>
                    {reasonCallout.message}
                  </div>
                </div>
                {reasonCallout.support ? (
                  <div className={`mt-0.5 ${opsSupportTextClass} ${reasonCallout.supportTone}`}>
                    {reasonCallout.support}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-1.5 border-t border-slate-200/80 pt-1.5 sm:mt-2 sm:pt-2">
          <div className={showNextStepSection ? "grid gap-2 sm:grid-cols-[minmax(10rem,0.75fr)_minmax(0,1.25fr)]" : "grid gap-2"}>
            <div className="min-w-0">
              <div className={`${opsUtilityLabelClass} text-slate-500`}>{scheduleLabel}</div>
              <div className="mt-0.5 text-[13px] font-semibold leading-5 text-slate-950">{scheduleDateText}</div>
              <div className={`${opsSupportTextClass} text-slate-600`}>{scheduleWindowText}</div>
            </div>
            {showNextStepSection ? (
              <div className="min-w-0 sm:border-l sm:border-slate-200 sm:pl-4">
                <div className={`${opsUtilityLabelClass} text-blue-700`}>Next Step</div>
                <div className="mt-0.5 text-[13px] font-semibold leading-5 text-slate-950">{nextStep}</div>
                {detailLine ? (
                  <div className={`mt-0.5 ${opsSupportTextClass} text-slate-600`}>{detailLine}</div>
                ) : null}
              </div>
            ) : null}
          </div>
          {metaItems.length > 0 ? (
            <div className={`mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 ${opsSupportTextClass} text-slate-600`}>
              {metaItems.map((item, index) => (
                <div
                  key={item.key}
                  className={item.framed ? "inline-flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50/80 px-2 py-1 text-sky-900 sm:px-1.5 sm:py-0.5" : "inline-flex items-center gap-2"}
                >
                  {index > 0 ? <span className="text-slate-300" aria-hidden="true">/</span> : null}
                  <span className="inline-flex items-center gap-1">
                    <span className={item.framed ? "font-medium text-sky-700" : "font-medium text-slate-500"}>{item.label}</span>
                    {item.href ? (
                      <a
                        href={item.href}
                        className={item.framed ? "font-medium text-sky-900 transition-colors hover:text-sky-950" : "font-medium text-slate-700 transition-colors hover:text-slate-950"}
                      >
                        {item.value}
                      </a>
                    ) : (
                      <span className={item.framed ? "font-medium text-sky-900" : "font-medium text-slate-700"}>{item.value}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-2">
        <Link
          href={`/jobs/${j.id}?tab=ops`}
          className={`${opsPrimaryActionClass} flex-[1.3]`}
        >
          View Job
        </Link>
        {phoneHref ? (
          <a
            href={phoneHref}
            className={opsSecondaryActionClass}
          >
            Call
          </a>
        ) : null}
        {textHref ? (
          <a
            href={textHref}
            className={opsSecondaryActionClass}
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
    <div className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-[12px] font-medium leading-5 sm:py-1.5 sm:text-[11px] sm:leading-4 ${toneClass}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

const opsPrimaryActionClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-900 bg-[linear-gradient(180deg,rgba(15,23,42,1),rgba(30,41,59,0.98))] px-3 py-2 text-sm font-semibold text-white shadow-[0_12px_20px_-18px_rgba(15,23,42,0.55)] transition-[background-color,border-color,box-shadow,transform] hover:-translate-y-px hover:border-slate-800 hover:bg-[linear-gradient(180deg,rgba(15,23,42,1),rgba(15,23,42,1))] hover:shadow-[0_16px_26px_-18px_rgba(15,23,42,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:translate-y-[0.5px] sm:min-h-8 sm:flex-none sm:px-3 sm:py-1.5 sm:text-xs";

const opsSecondaryActionClass =
  "inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:-translate-y-px hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 hover:shadow-[0_10px_18px_-18px_rgba(15,23,42,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px] sm:min-h-8 sm:flex-none sm:px-2.5 sm:py-1.5 sm:text-xs";

const opsFilterControlClass =
  "w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,background-color,box-shadow] hover:border-slate-400 hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200";

const opsSearchInputClass =
  "w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,background-color,box-shadow] placeholder:text-gray-400 hover:border-slate-400 hover:bg-slate-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200";

const opsDarkButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-900 bg-[linear-gradient(180deg,rgba(15,23,42,1),rgba(30,41,59,0.98))] px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_28px_-22px_rgba(15,23,42,0.55)] transition-[background-color,border-color,box-shadow,transform] hover:-translate-y-px hover:border-slate-800 hover:bg-[linear-gradient(180deg,rgba(15,23,42,1),rgba(15,23,42,1))] hover:shadow-[0_16px_30px_-22px_rgba(15,23,42,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:translate-y-[0.5px]";

const sectionActionLinkClass =
  "inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:-translate-y-px hover:border-slate-400 hover:bg-slate-50 hover:shadow-[0_10px_18px_-18px_rgba(15,23,42,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px] sm:py-1 sm:text-[11px]";

const inlineSectionLinkClass =
  "inline-flex items-center rounded-md border border-slate-200/90 bg-slate-50/80 px-2 py-1 text-[12px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform,color] hover:-translate-y-px hover:border-slate-300 hover:bg-white hover:text-slate-900 hover:shadow-[0_8px_16px_-16px_rgba(15,23,42,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px] sm:py-0.5 sm:text-[11px]";

const opsUtilityLabelClass =
  "text-[11px] font-semibold uppercase tracking-[0.11em] sm:text-[10px] sm:tracking-[0.12em]";

const opsSupportTextClass =
  "text-[12.5px] leading-5 sm:text-[11px] sm:leading-4";

const opsQueueChipClass =
  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium leading-5 shadow-sm transition-colors sm:py-1 sm:text-[11px] sm:leading-none";

function sectionCountPill(count: number, tone: "neutral" | "danger" = "neutral") {
  const className =
    tone === "danger"
      ? "inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.11em] text-rose-700 sm:px-2 sm:py-0.5 sm:text-[10px] sm:tracking-[0.12em]"
      : "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-600 sm:px-2 sm:py-0.5 sm:text-[10px] sm:tracking-[0.12em]";

  return <span className={className}>{count} jobs</span>;
}

return (
  <div className="mx-auto max-w-7xl space-y-3 p-2.5 text-gray-900 sm:space-y-4 sm:p-4 lg:space-y-4.5">
    <section className="relative overflow-hidden rounded-2xl border border-slate-300/80 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(248,250,252,0.98)_60%,rgba(239,246,255,0.75))] p-3 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/60 sm:p-3.5">
      <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-28 w-28 rounded-full bg-blue-100/50 blur-3xl" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/90 bg-white shadow-[0_12px_24px_-18px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70">
            <Image src="/icon.png" alt={`${internalBusinessDisplayName} logo`} width={22} height={22} className="h-5.5 w-5.5 rounded-sm" />
          </div>
          <div className="min-w-0">
            <div className={`${opsUtilityLabelClass} truncate text-slate-500`}>{internalBusinessDisplayName}</div>
            <h1 className="text-xl font-semibold tracking-[-0.02em] text-slate-950 sm:text-[1.45rem]">Ops Dashboard</h1>
            <div className="mt-1 max-w-2xl text-[12.5px] leading-5 text-slate-600 sm:text-[13px]">Operational queues, field follow-up, and closeout work in one surface.</div>
          </div>
        </div>
        <div className="text-right">
          <div className={`${opsUtilityLabelClass} text-slate-500`}>Scope</div>
          <div className={`text-[13px] font-medium leading-5 sm:text-[12px] sm:leading-4 ${selectedContractorName ? "text-blue-800" : "text-slate-700"}`}>
            {selectedContractorName ? `Filtered: ${selectedContractorName}` : "All contractors"}
          </div>
        </div>
      </div>
    </section>

    <section className="rounded-2xl border border-slate-300/75 bg-slate-50/80 p-3 shadow-[0_14px_32px_-28px_rgba(15,23,42,0.35)] sm:p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
        <div>
          <div className={`${opsUtilityLabelClass} text-slate-500`}>Internal</div>
          <div className="text-[15px] font-semibold tracking-tight text-slate-950">Filters</div>
        </div>
        <div className="text-right text-[12px] leading-5 sm:text-[11px] sm:leading-4">
          <div className={`${opsUtilityLabelClass} text-slate-500`}>Queue</div>
          <div className="font-medium text-slate-800">{OPS_TABS.find((t) => t.key === bucket)?.label ?? "Ops"}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <ContractorFilter contractors={contractors ?? []} selectedId={contractor ?? ""} />
        <div className="grid gap-1">
          <label className={`${opsUtilityLabelClass} text-slate-500`}>Sort</label>
          <form action="/ops" method="get" className="flex flex-col gap-2 sm:flex-row">
            <input type="hidden" name="bucket" value={bucket} />
            <input type="hidden" name="contractor" value={contractor ?? ""} />
            <input type="hidden" name="q" value={q ?? ""} />
            <input type="hidden" name="signal" value={signal ?? ""} />
            <select
              name="sort"
              defaultValue={sort}
              className={opsFilterControlClass}
            >
              <option value="default">Default queue order</option>
              <option value="customer">Customer</option>
              <option value="scheduled">Scheduled date/time</option>
              <option value="created">Created date</option>
              <option value="address">Address</option>
            </select>
            <button
              type="submit"
              className={opsDarkButtonClass}
            >
              Apply
            </button>
          </form>
        </div>
      </div>
      <div className="mt-2.5 grid gap-1">
        <div>
          <label className={`${opsUtilityLabelClass} text-slate-500`}>Filter Jobs</label>
          <p className="mt-0.5 text-[13px] leading-5 text-gray-500 sm:text-xs sm:leading-4">Searches visible jobs on this page only</p>
        </div>
        <form action="/ops" method="get" className="flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="bucket" value={bucket} />
          <input type="hidden" name="contractor" value={contractor ?? ""} />
          <input type="hidden" name="sort" value={sort} />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Name, phone, address, city, title"
            className={opsSearchInputClass}
          />
          <button
            className={opsDarkButtonClass}
            type="submit"
          >
            Search
          </button>
        </form>
      </div>
    </section>

    <section id="system-alerts" className={`rounded-2xl border p-3 shadow-[0_14px_32px_-28px_rgba(15,23,42,0.35)] sm:p-3.5 ${hasActiveSystemAlerts || signal ? "border-slate-300/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))]" : "border-slate-300/75 bg-slate-50/75"}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className={`${opsUtilityLabelClass} text-blue-700`}>Contractor-driven</div>
          <div className="text-[15px] font-semibold tracking-tight text-slate-950">System Alerts</div>
          <div className="mt-1 max-w-2xl text-[12.5px] leading-5 text-slate-600 sm:text-[13px]">
            Awareness routes to Notifications for acknowledgment. Ops queues remain the place to take action.
          </div>
        </div>
        <Link
          href="/ops/notifications?state=unread"
          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          Review notifications
        </Link>
      </div>
      {visibleSignalCards.length === 0 && !signal
        ? quietSectionEmptyState("No active contractor-driven alerts right now.")
        : (
          <div className="flex flex-wrap gap-1.5">
            {visibleSignalCards.map((card) => {
              const isActive = signal === card.key;
              const cardHref = card.key === "contractor_updates"
                ? "/ops/notifications?view=contractor_updates&state=unread"
                : `/ops${buildQueryString({
                    bucket: card.bucket,
                    contractor: contractor ?? "",
                    q: q ?? "",
                    sort: sort ?? "",
                    signal: card.key,
                  })}#ops-queues`;
              return (
                <Link
                  key={card.key}
                  href={cardHref}
                  className={[
                    opsQueueChipClass,
                    card.key !== "contractor_updates" && isActive
                      ? "border-blue-700 bg-blue-700 text-white shadow-[0_10px_22px_-16px_rgba(37,99,235,0.45)]"
                      : `${signalToneClass(card.key)} hover:bg-white`,
                  ].join(" ")}
                  title={card.key === "contractor_updates" ? "Open unread contractor-driven notifications" : undefined}
                >
                  <span>{card.label}</span>
                  <span className={`font-semibold tabular-nums ${card.key !== "contractor_updates" && isActive ? "text-slate-200" : "text-current/80"}`}>{card.count}</span>
                </Link>
              );
            })}
          </div>
        )}
    </section>

    <OperationalReportingSection
      reporting={operationalReporting}
      scopeLabel={selectedContractorName ? `Filtered: ${selectedContractorName}` : "All contractors"}
      contractorId={contractor}
      sort={sort}
    />

    <section className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
      <div className={`rounded-2xl border ${callListVisibleJobs.length === 0 ? "border-slate-300/75 bg-slate-50/85 p-3" : "border-slate-300/80 bg-white p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.38)] ring-1 ring-slate-200/70"}`}>
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

    <div className={`rounded-2xl border ${prioritizedFieldWorkJobs.length === 0 ? "border-slate-300/75 bg-slate-50/85 p-3" : "border-slate-300/80 bg-white p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.38)] ring-1 ring-slate-200/70"}`}>
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

      <div className={`rounded-2xl border ${closeoutVisibleJobs.length === 0 ? "border-slate-300/75 bg-slate-50/85 p-3" : "border-slate-300/80 bg-white p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.38)] ring-1 ring-slate-200/70"}`}>
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

    <section className={`rounded-2xl border ${exceptionVisibleJobs.length === 0 ? "border-slate-300/75 bg-slate-50/85 p-3" : "border-slate-300/80 bg-white p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.38)] ring-1 ring-slate-200/70"}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[15px] font-semibold tracking-tight text-slate-950">Exceptions (Still Open Past Scheduled Date)</div>
        <div className="flex items-center gap-3">
          {sectionCountPill(
            sortedExceptionJobs.length,
            sortedExceptionJobs.length > 0 ? "danger" : "neutral"
          )}
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
          <div className={`${opsUtilityLabelClass} text-slate-500`}>Workflow</div>
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
                    opsQueueChipClass,
                    isActive
                      ? "border-blue-700 bg-blue-700 text-white shadow-[0_10px_22px_-16px_rgba(37,99,235,0.45)]"
                      : `${workflowToneClass(card.key)} hover:bg-white`,
                  ].join(" ")}
                >
                  <span className={isActive ? "text-slate-200" : "text-current/80"}>{card.label}</span>
                  <span className="font-semibold tabular-nums">{card.count}</span>
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
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500 sm:text-[11px]">{sortedBucketJobs.length} jobs</div>
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
