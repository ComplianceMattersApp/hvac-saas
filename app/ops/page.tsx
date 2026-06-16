// app/ops/page
import Link from "next/link";
import Image from "next/image";
import { Clock3 } from "lucide-react";
import ContractorFilter from "./_components/ContractorFilter";
import { redirect } from "next/navigation";
import { getRequestActorContext } from "@/lib/auth/request-actor-context";
import {
  landingPathForDualContextAccess,
  resolveDualContextAccess,
} from "@/lib/auth/dual-context-access";
import { canViewFinancialRegister } from "@/lib/auth/financial-access";
import { resolveFieldBillingCapabilities } from "@/lib/auth/field-billing-access";
import { loadFieldBillingExplicitCapabilitiesForUser } from "@/lib/auth/internal-user-access-capabilities";
import { listFieldPaymentCollectionReportsForReconciliation } from "@/lib/business/field-payment-reconciliation-read-model";
import { loadFailedPaymentReconciliationItems } from "@/lib/business/failed-payment-reconciliation-read-model";

import {
  formatBusinessDateUS,
  displayWindowLA,
  startOfTodayUtcIsoLA,
  startOfTomorrowUtcIsoLA,
} from "@/lib/utils/schedule-la";
import { formatCityNamePart, formatPersonNamePart } from "@/lib/utils/identity-display";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import { getCloseoutNeeds, isInCloseoutQueue } from "@/lib/utils/closeout";
import { extractFailureReasons } from "@/lib/portal/resolveContractorIssues";
import { getActiveJobAssignmentDisplayMap, resolveUserDisplayMap } from "@/lib/staffing/human-layer";
import { buildIlikeSearchTerms, matchesNormalizedSearch } from "@/lib/utils/search-normalization";
import { resolveOperationalTenantIdentity } from "@/lib/email/operational-tenant-branding";
import { buildBillingTruthCloseoutProjectionMap } from "@/lib/business/job-billing-state";
import {
  buildPromotedCompanionReadModel,
  buildVisitScopeIncludesReadModel,
  buildVisitScopeReadModel,
} from "@/lib/jobs/visit-scope";
import {
  listInternalContractorUpdateAwareness,
  listInternalNewWorkRequestAwareness,
} from "@/lib/actions/notification-read-actions";
import {
  buildOpsStatusEnteredAtByJob,
  resolveLifecycleDaysAgingLabel,
} from "@/lib/utils/lifecycle-aging";
import {
  didOpsStatusChangeTo,
  formatStatusAgeCompact,
  resolveStatusAgeDays,
} from "@/lib/utils/status-aging";
import { getActiveWaitingState } from "@/lib/utils/ops-status";
import OperationalReportingSection from "./_components/OperationalReportingSection";
import {
  buildOperationalReportingReadModel,
  type OperationalReportingJob,
} from "@/lib/ops/operational-reporting";
import { listCloseoutQueueJobs } from "@/lib/ops/closeout-queue";
import { resolveProductModeForAccountOwnerId, type ProductMode } from "@/lib/business/product-mode-defaults";
import { isMaintenanceAgreementsEnabled } from "@/lib/maintenance-agreements/agreement-exposure";
import { summarizeMaintenanceAgreementsForAccount } from "@/lib/maintenance-agreements/read-model";
import { listTeamClockStatusPreview } from "@/lib/time-clock/read-model";
import {
  buildLatestCustomerAttemptByJob,
  resolveRecentAttemptDisplay,
} from "@/lib/ops/recent-attempt-display";
import { buildScheduledWithoutTechSnapshot } from "@/lib/ops/scheduled-without-tech-snapshot";
import {
  formatAssignmentSummaryForJob,
  formatFailedEccQueueReasonFromRun,
  getOpsQueueCardStatusReason,
} from "@/lib/ops/focused-queues";
import {
  buildServiceFollowUpProgressState,
} from "@/lib/jobs/service-follow-up-progress";
import { formatEccRetestReadySignalLabel } from "@/lib/ecc/ecc-workflow-display";
import { withJobsBillingDispositionSelectFallback } from "@/lib/supabase/jobs-billing-disposition-compat";


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
  { key: "retest_needed", label: "Retest Ready" },
  { key: "paperwork_required", label: "Status: Paperwork Required" },
  { key: "invoice_required", label: "Status: Invoice Required" },
  { key: "closeout", label: "Closeout Work Queue" },
  { key: "recent_closed", label: "Recently Closed" },
];

type OpsBoardFilterBucket = "all" | "pending" | "waiting" | "exceptions" | "closeout";

const OPS_BOARD_BUCKET_FILTERS: Array<{ key: OpsBoardFilterBucket; label: string }> = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "waiting", label: "Waiting" },
  { key: "exceptions", label: "Exceptions" },
  { key: "closeout", label: "Closeout" },
];

function normalizeOpsBoardFilterBucket(value: unknown): OpsBoardFilterBucket {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "need_to_schedule") return "pending";
  if (normalized === "pending" || normalized === "waiting" || normalized === "exceptions" || normalized === "closeout") {
    return normalized;
  }
  return "all";
}

function startOfTodayLocalISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function formatTeamClockSince(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "-";

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "-";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function formatTeamClockElapsedFromClockIn(clockInAt: string | null | undefined) {
  const normalized = String(clockInAt ?? "").trim();
  if (!normalized) return "0m";

  const startedAt = new Date(normalized).getTime();
  if (!Number.isFinite(startedAt)) return "0m";

  const totalMinutes = Math.max(0, Math.floor((Date.now() - startedAt) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function formatUsdFromCents(cents: number | null | undefined) {
  const amount = Number(cents ?? 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatFailedPaymentCategoryLabel(category: string | null | undefined) {
  const normalized = String(category ?? "").trim().toLowerCase();
  if (normalized === "payment_declined") return "Declined";
  if (normalized === "authentication_required") return "Requires action";
  if (normalized === "precondition_blocked") return "Blocked precondition";
  return "Unknown failure";
}

function formatFailedPaymentRecommendedActionLabel(action: string | null | undefined) {
  const normalized = String(action ?? "").trim().toLowerCase();
  if (normalized === "review_payment_method") return "Review payment method";
  if (normalized === "request_customer_authentication") return "Request customer authentication";
  if (normalized === "fix_payment_setup") return "Fix payment setup";
  if (normalized === "retry_after_review") return "Review before retry";
  return "No action available";
}

function formatFailedPaymentOpenedAt(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "-";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
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
  notice?: string;
  q?: string;
  sort?: string;
  signal?: string;
  panel?: string;
}>;
}) {
  
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const boardBucketFilter = normalizeOpsBoardFilterBucket(sp.bucket);
  const bucket = (
    boardBucketFilter === "pending"
      ? "need_to_schedule"
      : boardBucketFilter === "closeout"
      ? "closeout"
      : "workflow_all"
  ) as BucketKey;
  const contractor = (sp.contractor ?? "").trim() || null;
  const notice = (sp.notice ?? "").trim().toLowerCase();
  const q = (sp.q ?? "").trim() || null;
  const sort = (sp.sort ?? "").trim() || "default";
  const panel = (sp.panel ?? "").trim().toLowerCase();

  const opsTimingEnabled = process.env.OPS_TIMING_DEBUG === "true";
  const _t_total = opsTimingEnabled ? Date.now() : 0;

  const _t_requestActorContext = opsTimingEnabled ? Date.now() : 0;
  const actorContext = await getRequestActorContext();
  const supabase = actorContext.supabase;
  const user = actorContext.user;
  const access = await resolveDualContextAccess({ supabase, user });

  const signal = (sp.signal ?? "").trim().toLowerCase() || "";

  if (!user) redirect("/login");

  if (!access.hasActiveAppAccess) {
    redirect(landingPathForDualContextAccess(access));
  }

  if (actorContext.kind === "contractor") {
    redirect("/portal");
  }

  if (actorContext.kind !== "internal" || !actorContext.internalUser) {
    redirect("/login");
  }

  const internalUser = actorContext.internalUser;
  if (opsTimingEnabled) console.log(`[ops:requestActorContext] ${Date.now() - _t_requestActorContext}ms`);

  const canViewFailedPaymentAttention = canViewFinancialRegister({
    actorUserId: user.id,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
  });

  const explicitFieldBillingCapabilities = await loadFieldBillingExplicitCapabilitiesForUser({
    supabase: supabase as any,
    accountOwnerUserId: internalUser.account_owner_user_id,
    internalUserId: internalUser.user_id,
  });
  const fieldBillingCapabilities = resolveFieldBillingCapabilities({
    actorUserId: user.id,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    explicitCapabilities: explicitFieldBillingCapabilities,
  });

  const canViewFieldPaymentVerificationAttention =
    canViewFinancialRegister({
      actorUserId: user.id,
      internalUser,
      resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    }) || fieldBillingCapabilities.can_verify_non_card_collection;

  const fieldPaymentReconciliationAttention = canViewFieldPaymentVerificationAttention
    ? await listFieldPaymentCollectionReportsForReconciliation({
      admin: supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      limit: 1,
    })
    : null;

  const showFieldPaymentVerificationChip =
    canViewFieldPaymentVerificationAttention
    && (fieldPaymentReconciliationAttention?.summary.openCount ?? 0) > 0;

  const failedPaymentReconciliation = canViewFailedPaymentAttention
    ? await loadFailedPaymentReconciliationItems({
      admin: supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      limit: 5,
    })
    : null;

  const showFailedPaymentAttentionCard =
    canViewFailedPaymentAttention
    && (failedPaymentReconciliation?.summary.openCount ?? 0) > 0;

  const showTeamClockStatusCardForRole =
    internalUser.role === "admin" || internalUser.role === "office";

  let showTeamClockStatusCard = false;
  let teamClockStatusRows: Array<{
    internalUserId: string;
    displayName: string;
    statusLabel: "Clocked In" | "On Lunch";
    sinceAt: string;
    elapsed: string;
  }> = [];

  if (showTeamClockStatusCardForRole) {
    const { data: accountSettings, error: accountSettingsErr } = await supabase
      .from("account_settings")
      .select("time_clock_enabled")
      .eq("account_owner_user_id", internalUser.account_owner_user_id)
      .maybeSingle();

    if (accountSettingsErr) throw accountSettingsErr;

    const isTimeClockEnabled = Boolean((accountSettings as any)?.time_clock_enabled);
    if (isTimeClockEnabled) {
      const previewRows = await listTeamClockStatusPreview({
        supabase,
        accountOwnerUserId: internalUser.account_owner_user_id,
      });

      const displayMap = await resolveUserDisplayMap({
        supabase,
        userIds: previewRows
          .map((row) => String(row.internalUserId ?? "").trim())
          .filter(Boolean),
      });

      showTeamClockStatusCard = true;
      teamClockStatusRows = previewRows.map((row) => {
        const internalUserId = String(row.internalUserId ?? "").trim();
        const displayName =
          formatPersonNamePart(displayMap[internalUserId] ?? "") || "Unknown User";
        const statusLabel = row.status === "on_lunch" ? "On Lunch" : "Clocked In";
        const sinceSource = row.status === "on_lunch" ? row.lunchStartAt ?? row.clockInAt : row.clockInAt;

        return {
          internalUserId,
          displayName,
          statusLabel,
          sinceAt: formatTeamClockSince(sinceSource),
          elapsed: formatTeamClockElapsedFromClockIn(row.clockInAt),
        };
      });
    }
  }

  const resolvedProductModePromise = resolveProductModeForAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const productMode: ProductMode = await resolvedProductModePromise;
  const isHvacServiceMode = productMode === "hvac_service";
  const contractorScopeFilter = isHvacServiceMode ? null : contractor;

  const _t_businessIdentity = opsTimingEnabled ? Date.now() : 0;
  const operationalTenantIdentityPromise = resolveOperationalTenantIdentity({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  }).then((result) => {
    if (opsTimingEnabled) console.log(`[ops:businessIdentity] ${Date.now() - _t_businessIdentity}ms`);
    return result;
  });

  function trackOpsTiming(label: string, promiseLike: any) {
    const startedAt = opsTimingEnabled ? Date.now() : 0;
    return Promise.resolve(promiseLike).finally(() => {
      if (opsTimingEnabled) console.log(`[${label}] ${Date.now() - startedAt}ms`);
    });
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

  function workspaceTitle(job: any) {
    return normalizeRetestLinkedJobTitle(job?.title) || `Job ${String(job?.id ?? "").slice(0, 8)}`;
  }

  function workspaceCustomerLocation(job: any) {
    const customer = [formatPersonNamePart(job?.customer_first_name), formatPersonNamePart(job?.customer_last_name)]
      .filter(Boolean)
      .join(" ");
    const location = [String(job?.job_address ?? "").trim(), formatCityNamePart(job?.city)]
      .filter(Boolean)
      .join(", ");

    if (customer && location) return `${customer} · ${location}`;
    return customer || location || "Customer / location pending";
  }

  function workspaceContractorName(job: any) {
    return String((job as any)?.contractors?.name ?? "").trim();
  }

  // Initialize lifecycle maps before any workspace preview rendering to avoid TDZ crashes.
  let opsStatusEnteredAtByJob = new Map<string, Record<string, string>>();
  let latestFailedRunByJob = new Map<string, any>();
  let primaryFailureReasonByJob = new Map<string, string>();
  let serviceFollowUpProgressLabelByJob = new Map<string, string>();
  let continuedServiceFollowUpParentIds = new Set<string>();

  function withServiceFollowUpProgress(job: any) {
    const jobId = String(job?.id ?? "").trim();
    const progressLabel = jobId ? serviceFollowUpProgressLabelByJob.get(jobId) ?? null : null;
    const continued = jobId ? continuedServiceFollowUpParentIds.has(jobId) : false;
    if (!progressLabel && !continued) return job;
    return {
      ...job,
      service_follow_up_progress_label: progressLabel,
      service_follow_up_continued: continued,
    };
  }

  function workspaceAgeLabel(job: any) {
    const jobId = String(job?.id ?? "").trim();
    return (
      resolveLifecycleDaysAgingLabel({
        status: String(job?.status ?? "").trim() || null,
        opsStatus: String(job?.ops_status ?? "").trim() || null,
        createdAt: String(job?.created_at ?? "").trim() || null,
        scheduledDate: String(job?.scheduled_date ?? "").trim() || null,
        fieldCompleteAt: String(job?.field_complete_at ?? "").trim() || null,
        stateEnteredAtByStatus: opsStatusEnteredAtByJob.get(jobId) ?? null,
        failedEvidenceAt: failedStatusSinceByJob(jobId),
      }) ?? "Not available"
    );
  }

  function wsStatusReason(job: any, queueKey: string) {
    const lifecycle = String(job?.status ?? "").toLowerCase();
    const specificFailureReason = workspaceFailedReason(job);

    if (queueKey === "need_to_schedule") return "Awaiting scheduling";
    if (queueKey === "field_work") {
      if (lifecycle === "on_the_way") return "On the way";
      if (lifecycle === "in_progress") return "In progress";
      return "Scheduled field work";
    }
    if (queueKey === "without_tech") return "Scheduled without active tech assignment";
    if (specificFailureReason) return specificFailureReason;
    return getOpsQueueCardStatusReason(withServiceFollowUpProgress(job));
  }

  function workspaceFailedReason(job: any) {
    const opsStatus = String(job?.ops_status ?? "").trim().toLowerCase();
    if (opsStatus === "retest_needed") return "Retest Needed";
    if (opsStatus === "pending_office_review") return "Correction Required";
    if (opsStatus !== "failed") return "";

    const jobId = String(job?.id ?? "").trim();
    return (jobId ? primaryFailureReasonByJob.get(jobId) ?? "" : "") || "Failed";
  }

  const wsStartTodayUtc = startOfTodayUtcIsoLA();
  const wsStartTomorrowUtc = startOfTomorrowUtcIsoLA();

  if (panel !== "full_board") {
    const workspaceSelect =
      "id, title, status, ops_status, scheduled_date, window_start, window_end, city, job_address, customer_first_name, customer_last_name, pending_info_reason, on_hold_reason, field_complete_at, contractor_id, contractors(name), created_at";
    const scheduledSnapshotSelect =
      "id, status, ops_status, scheduled_date, window_start";

    const _t_workspaceCounts = opsTimingEnabled ? Date.now() : 0;
    let countsQ = supabase
      .from("jobs")
      .select("ops_status, status")
      .neq("ops_status", "closed")
      .neq("status", "cancelled")
      .is("deleted_at", null);

    if (contractorScopeFilter) countsQ = countsQ.eq("contractor_id", contractorScopeFilter);

    let fieldWorkCountQ = supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .neq("ops_status", "closed")
      .eq("field_complete", false)
      .gte("scheduled_date", wsStartTodayUtc)
      .lt("scheduled_date", wsStartTomorrowUtc);

    if (contractorScopeFilter) fieldWorkCountQ = fieldWorkCountQ.eq("contractor_id", contractorScopeFilter);

    let scheduledOpenRowsQ = supabase
      .from("jobs")
      .select(scheduledSnapshotSelect)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .eq("status", "open")
      .eq("ops_status", "scheduled")
      .order("scheduled_date", { ascending: true })
      .order("window_start", { ascending: true });

    if (contractorScopeFilter) scheduledOpenRowsQ = scheduledOpenRowsQ.eq("contractor_id", contractorScopeFilter);

    const [countsResWs, fieldWorkCountRes, scheduledOpenRowsRes, unreadContractorUpdates, unreadNewWorkRequests] = await Promise.all([
      countsQ,
      fieldWorkCountQ,
      scheduledOpenRowsQ,
      listInternalContractorUpdateAwareness({ limit: 100, onlyUnread: true }),
      listInternalNewWorkRequestAwareness({ limit: 100, onlyUnread: true }),
    ]);

    if (countsResWs.error) throw countsResWs.error;
    if (fieldWorkCountRes.error) throw fieldWorkCountRes.error;
    if (scheduledOpenRowsRes.error) throw scheduledOpenRowsRes.error;

    const countsWs = new Map<string, number>();
    for (const row of countsResWs.data ?? []) {
      const key = String((row as any)?.ops_status ?? "").trim().toLowerCase();
      const lifecycle = String((row as any)?.status ?? "").trim().toLowerCase();
      if (!key) continue;
      if ((key === "need_to_schedule" || key === "scheduled") && lifecycle !== "open") continue;
      countsWs.set(key, (countsWs.get(key) ?? 0) + 1);
    }

    const scheduledOpenRows = (scheduledOpenRowsRes.data ?? []) as any[];
    const scheduledIds = scheduledOpenRows
      .map((row) => String(row?.id ?? "").trim())
      .filter(Boolean);

    const scheduledAssignmentMap = scheduledIds.length
      ? await getActiveJobAssignmentDisplayMap({ supabase, jobIds: scheduledIds })
      : {};

    const scheduledWithoutTechSnapshot = buildScheduledWithoutTechSnapshot({
      jobs: scheduledOpenRows,
      assignmentDisplayMap: scheduledAssignmentMap,
      previewLimit: 10,
    });

    const waitingCount =
      (countsWs.get("pending_info") ?? 0) +
      (countsWs.get("on_hold") ?? 0) +
      (countsWs.get("waiting") ?? 0) +
      (countsWs.get("pending_office_review") ?? 0);

    const exceptionCount =
      (countsWs.get("failed") ?? 0) +
      (countsWs.get("retest_needed") ?? 0) +
      (countsWs.get("pending_office_review") ?? 0) +
      (countsWs.get("problem") ?? 0);

    const closeoutCount =
      (countsWs.get("invoice_required") ?? 0) +
      (countsWs.get("paperwork_required") ?? 0);

    const workspaceTabs = [
      {
        key: "need_to_schedule",
        label: "Needs Scheduling",
        count: countsWs.get("need_to_schedule") ?? 0,
        href: `/ops/call-list${contractorScopeFilter ? `?contractor=${encodeURIComponent(contractorScopeFilter)}` : ""}`,
      },
      {
        key: "field_work",
        label: "Field Work",
        count: Number(fieldWorkCountRes.count ?? 0),
        href: `/ops/field${contractorScopeFilter ? `?contractor=${encodeURIComponent(contractorScopeFilter)}` : ""}`,
      },
      {
        key: "without_tech",
        label: "Without Tech",
        count: scheduledWithoutTechSnapshot.count,
        href: `/ops${buildQueryString({ bucket: "without_tech", contractor: contractorScopeFilter ?? "" })}#ops-workspace`,
      },
      {
        key: "waiting",
        label: "Waiting / Pending Info",
        count: waitingCount,
        href: `/ops${buildQueryString({ bucket: "waiting", contractor: contractorScopeFilter ?? "" })}#ops-workspace`,
      },
      {
        key: "exceptions",
        label: "Exceptions",
        count: exceptionCount,
        href: `/ops${buildQueryString({ bucket: "exceptions", contractor: contractorScopeFilter ?? "" })}#ops-workspace`,
      },
      {
        key: "closeout",
        label: "Closeout & Review",
        count: closeoutCount,
        href: `/ops/closeout-queue${contractorScopeFilter ? `?contractor=${encodeURIComponent(contractorScopeFilter)}` : ""}`,
      },
      {
        key: "updates",
        label: "Updates",
        count: unreadContractorUpdates.length + unreadNewWorkRequests.length,
        href: "/ops/notifications?state=unread",
      },
    ] as const;

    const boardBucketWorkspaceKeyMap: Record<Exclude<OpsBoardFilterBucket, "all">, string> = {
      pending: "need_to_schedule",
      waiting: "waiting",
      exceptions: "exceptions",
      closeout: "closeout",
    };
    const coreBoardWorkspaceKeys = ["need_to_schedule", "waiting", "exceptions", "closeout"];
    const requestedWorkspaceKeys =
      boardBucketFilter === "all"
        ? coreBoardWorkspaceKeys
        : [boardBucketWorkspaceKeyMap[boardBucketFilter]];

    async function loadWithoutTechPreviewRows() {
      const withoutTechPreviewIds = (scheduledWithoutTechSnapshot.preview ?? [])
        .map((job: any) => String(job?.id ?? "").trim())
        .filter(Boolean);

      if (withoutTechPreviewIds.length > 0) {
        const withoutTechPreviewRes = await supabase
          .from("jobs")
          .select(workspaceSelect)
          .in("id", withoutTechPreviewIds)
          .is("deleted_at", null)
          .neq("status", "cancelled");

        if (withoutTechPreviewRes.error) throw withoutTechPreviewRes.error;

        const withoutTechRowsById = new Map(
          (withoutTechPreviewRes.data ?? []).map((row: any) => [String(row?.id ?? "").trim(), row])
        );

        return withoutTechPreviewIds
          .map((id) => withoutTechRowsById.get(id))
          .filter(Boolean) as any[];
      }

      return [];
    }

    async function loadWorkspacePreviewRows(workspaceKey: string) {
      if (workspaceKey === "without_tech") {
        return loadWithoutTechPreviewRows();
      }

      let queueQ = supabase
        .from("jobs")
        .select(workspaceSelect)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .order("created_at", { ascending: true })
        .limit(10);

      if (workspaceKey === "need_to_schedule") {
        queueQ = queueQ.eq("status", "open").eq("ops_status", "need_to_schedule");
      } else if (workspaceKey === "field_work") {
        queueQ = queueQ
          .neq("ops_status", "closed")
          .eq("field_complete", false)
          .gte("scheduled_date", wsStartTodayUtc)
          .lt("scheduled_date", wsStartTomorrowUtc)
          .order("window_start", { ascending: true });
      } else if (workspaceKey === "waiting") {
        queueQ = queueQ.neq("ops_status", "closed").in("ops_status", ["pending_info", "on_hold", "waiting", "pending_office_review"]);
      } else if (workspaceKey === "exceptions") {
        queueQ = queueQ.neq("ops_status", "closed").in("ops_status", ["failed", "retest_needed", "pending_office_review", "problem"]);
      } else if (workspaceKey === "closeout") {
        queueQ = queueQ.neq("ops_status", "closed").in("ops_status", ["invoice_required", "paperwork_required"]);
      } else {
        return [];
      }

      if (contractorScopeFilter) queueQ = queueQ.eq("contractor_id", contractorScopeFilter);
      const queueRes = await queueQ;
      if (queueRes.error) throw queueRes.error;
      return queueRes.data ?? [];
    }

    const workspacePreviewEntries = await Promise.all(
      requestedWorkspaceKeys.map(async (workspaceKey) => [workspaceKey, await loadWorkspacePreviewRows(workspaceKey)] as const),
    );
    const workspacePreviewRowsByKey = new Map<string, any[]>(workspacePreviewEntries);
    const visibleWorkspaceSections = requestedWorkspaceKeys.map((workspaceKey) => {
      const tab = workspaceTabs.find((item) => item.key === workspaceKey) ?? workspaceTabs[0];
      return {
        ...tab,
        previewRows: workspacePreviewRowsByKey.get(workspaceKey) ?? [],
      };
    });
    const selectedWorkspaceKey =
      boardBucketFilter === "all" ? "all" : requestedWorkspaceKeys[0];
    const selectedWorkspaceTab =
      boardBucketFilter === "all"
        ? {
            key: "all",
            label: "All",
            count: visibleWorkspaceSections.reduce((sum, section) => sum + section.count, 0),
            href: "/ops#ops-workspace",
          }
        : visibleWorkspaceSections[0];
    const selectedPreviewRows = visibleWorkspaceSections.flatMap((section) => section.previewRows);
    const hasActiveOpsBoardFilters = boardBucketFilter !== "all" || Boolean(contractorScopeFilter);

    if (opsTimingEnabled) {
      console.log(`[ops:workspace:countsAndPreview] ${Date.now() - _t_workspaceCounts}ms`);
      console.log(`[ops:totalBeforeRender] ${Date.now() - _t_total}ms`);
    }

    const selectedPreviewJobIds = selectedPreviewRows
      .map((job: any) => String(job?.id ?? "").trim())
      .filter(Boolean);
    const selectedPreviewAssignmentDisplayMap = selectedPreviewJobIds.length
      ? await getActiveJobAssignmentDisplayMap({
          supabase,
          jobIds: selectedPreviewJobIds,
        })
      : {};

    const selectedPreviewFailedRunsRes = selectedPreviewJobIds.length
      ? await supabase
          .from("ecc_test_runs")
          .select("job_id, test_type, computed, computed_pass, override_pass, is_completed, created_at")
          .in("job_id", selectedPreviewJobIds)
          .eq("is_completed", true)
          .or("override_pass.eq.false,computed_pass.eq.false")
      : { data: [], error: null };

    if (selectedPreviewFailedRunsRes.error) throw selectedPreviewFailedRunsRes.error;

    latestFailedRunByJob = buildLatestFailedRunByJob(selectedPreviewFailedRunsRes.data ?? []);
    primaryFailureReasonByJob = buildPrimaryFailureReasonByJob(latestFailedRunByJob);

    const operationalTenantIdentity = await operationalTenantIdentityPromise;
    const workspaceContractorsRes = await supabase
      .from("contractors")
      .select("id, name")
      .eq("lifecycle_state", "active")
      .order("name", { ascending: true });
    if (workspaceContractorsRes.error) throw workspaceContractorsRes.error;
    const workspaceContractors = workspaceContractorsRes.data ?? [];
    const showWorkspaceContractorFilter = workspaceContractors.length > 0 && !isHvacServiceMode;
    const activeWorkspaceHref = `/ops${buildQueryString({
      bucket,
      contractor: contractorScopeFilter ?? "",
      q: q ?? "",
      sort,
      signal,
    })}#ops-workspace`;

    return (
      <div className="mx-auto max-w-[92rem] space-y-3 p-2.5 text-gray-900 sm:space-y-4 sm:p-4 xl:px-6">
        {notice === "estimates_unavailable" ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-[0_14px_32px_-28px_rgba(15,23,42,0.24)]">
            <div className="font-semibold">Estimates are not enabled for this environment yet.</div>
            <div className="mt-1 text-amber-900/85">
              Internal estimate routes remain fail-closed here until the estimate migration is intentionally applied and the feature flag is explicitly enabled.
            </div>
          </section>
        ) : null}

        <section className="rounded-3xl border border-slate-300/80 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(248,250,252,0.98)_56%,rgba(219,234,254,0.56))] p-4 shadow-[0_22px_54px_-34px_rgba(15,23,42,0.45)] ring-1 ring-slate-200/70 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700">{operationalTenantIdentity.displayName}</div>
              <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-slate-950 sm:text-[2rem]">
                Operations Workspace
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Start with the queue that needs attention now. Then work down through field progress, exceptions, and closeout.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/today" className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:-translate-y-px hover:border-slate-400 hover:bg-slate-50 hover:shadow-[0_10px_18px_-18px_rgba(15,23,42,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px] sm:py-1 sm:text-[11px]">
                Go to Today
              </Link>
              <Link href={activeWorkspaceHref} className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:-translate-y-px hover:border-slate-400 hover:bg-slate-50 hover:shadow-[0_10px_18px_-18px_rgba(15,23,42,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px] sm:py-1 sm:text-[11px]">
                View on board
              </Link>
            </div>
          </div>
        </section>

        <section id="ops-workspace" className="rounded-3xl border border-slate-300/80 bg-white p-3.5 shadow-[0_20px_48px_-34px_rgba(15,23,42,0.42)] ring-1 ring-slate-200/70 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Board Filters</div>
              <div className="text-lg font-semibold tracking-tight text-slate-950">Operations workbench</div>
            </div>
            <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              {selectedWorkspaceTab.count} visible jobs
            </div>
          </div>

          <div className="mb-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
            {showWorkspaceContractorFilter ? (
              <ContractorFilter contractors={workspaceContractors} selectedId={contractorScopeFilter ?? ""} />
            ) : (
              <div className="grid gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500 sm:text-[10px] sm:tracking-[0.12em]">Contractor</label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-500">All contractors</div>
              </div>
            )}
            <form action="/ops" method="get" className="grid gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500 sm:text-[10px] sm:tracking-[0.12em]">Bucket</label>
              <input type="hidden" name="contractor" value={contractorScopeFilter ?? ""} />
              <select
                name="bucket"
                defaultValue={boardBucketFilter}
                className="w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,background-color,box-shadow] hover:border-slate-400 hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
              >
                {OPS_BOARD_BUCKET_FILTERS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button type="submit" className="mt-1 inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-white">
                Apply
              </button>
            </form>
            {hasActiveOpsBoardFilters ? (
              <Link href="/ops#ops-workspace" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors hover:bg-slate-50">
                Clear filters
              </Link>
            ) : null}
          </div>

          <article className="rounded-2xl border border-slate-300/80 bg-white p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.36)] ring-1 ring-slate-200/70 sm:p-3.5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Active Queue</div>
                <div className="text-[15px] font-semibold tracking-tight text-slate-950">{selectedWorkspaceTab.label}</div>
                <div className="text-xs text-slate-600">{selectedWorkspaceTab.count} jobs</div>
              </div>
              <Link href={selectedWorkspaceTab.href} className="inline-flex items-center rounded-md border border-slate-200/90 bg-slate-50/80 px-2 py-1 text-[12px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform,color] hover:-translate-y-px hover:border-slate-300 hover:bg-white hover:text-slate-900 hover:shadow-[0_8px_16px_-16px_rgba(15,23,42,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px] sm:py-0.5 sm:text-[11px]">
                View on board
              </Link>
            </div>

            {selectedPreviewRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                <div>{hasActiveOpsBoardFilters ? "No jobs match these filters." : "No jobs in this queue right now."}</div>
                {hasActiveOpsBoardFilters ? (
                  <Link href="/ops#ops-workspace" className="mt-2 inline-flex font-semibold text-blue-700 underline-offset-2 hover:underline">
                    Clear filters
                  </Link>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                {visibleWorkspaceSections.map((section) => (
                  <div key={section.key} className="space-y-2">
                    {boardBucketFilter === "all" ? (
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                        <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">{section.label}</div>
                        <div className="text-xs font-semibold text-slate-500">{section.count} jobs</div>
                      </div>
                    ) : null}
                    {section.previewRows.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        No jobs match these filters.
                      </div>
                    ) : (
                      section.previewRows.map((job: any) => (
                        <div key={String(job?.id ?? "")} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <Link href={`/jobs/${job.id}?tab=ops`} className="text-[14px] font-semibold leading-5 text-blue-700 hover:text-blue-800 hover:underline">
                                {workspaceTitle(job)}
                              </Link>
                              <div className="mt-0.5 text-[12.5px] leading-5 text-slate-700 sm:text-[11px] sm:leading-4">{workspaceCustomerLocation(job)}</div>
                            </div>
                            <Link href={`/jobs/${job.id}?tab=ops`} className="inline-flex items-center rounded-md border border-slate-200/90 bg-slate-50/80 px-2 py-1 text-[12px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform,color] hover:-translate-y-px hover:border-slate-300 hover:bg-white hover:text-slate-900 hover:shadow-[0_8px_16px_-16px_rgba(15,23,42,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px] sm:py-0.5 sm:text-[11px]">
                              Open Job
                            </Link>
                          </div>

                          <div className="mt-1.5 grid gap-1 text-[12px] leading-5 text-slate-600 sm:grid-cols-3 sm:text-[11px] sm:leading-4">
                            <div>
                              <span className="font-medium text-slate-500">Status/Reason:</span> {wsStatusReason(job, section.key)}
                            </div>
                            <div>
                              <span className="font-medium text-slate-500">Days Aging:</span>{" "}
                              {workspaceAgeLabel(job)}
                            </div>
                            <div>
                              <span className="font-medium text-slate-500">Assignment:</span>{" "}
                              {formatAssignmentSummaryForJob(String(job?.id ?? ""), selectedPreviewAssignmentDisplayMap)}
                            </div>
                            {workspaceContractorName(job) ? (
                              <div>
                                <span className="font-medium text-slate-500">Contractor:</span>{" "}
                                {workspaceContractorName(job)}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>

        {showTeamClockStatusCard ? (
          <section className="rounded-2xl border border-slate-300/80 bg-white p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.36)] ring-1 ring-slate-200/70 sm:p-3.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Operations</div>
                <div className="text-[15px] font-semibold tracking-tight text-slate-950">Team Clock Status</div>
              </div>
              <Link href="/time-clock" className="inline-flex items-center rounded-md border border-slate-200/90 bg-slate-50/80 px-2 py-1 text-[12px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform,color] hover:-translate-y-px hover:border-slate-300 hover:bg-white hover:text-slate-900 hover:shadow-[0_8px_16px_-16px_rgba(15,23,42,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px] sm:py-0.5 sm:text-[11px]">
                Open time clock
              </Link>
            </div>

            {teamClockStatusRows.length === 0 ? (
              <div className="text-xs text-slate-600">No team members are clocked in right now.</div>
            ) : (
              <div className="space-y-1.5">
                {teamClockStatusRows.slice(0, 8).map((row) => (
                  <div key={row.internalUserId} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-slate-900">{row.displayName}</div>
                      <div className="text-[11px] text-slate-600">Since {row.sinceAt}</div>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-slate-700">{row.statusLabel} · {row.elapsed}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    );
  }

  // ✅ Counts per ops_status (exclude "closed", respect contractor filter)
  let countsQ = supabase
    .from("jobs")
    .select("id, ops_status, status")
    .neq("ops_status", "closed")
    .neq("status", "cancelled")
    .is("deleted_at", null);

  if (contractorScopeFilter) countsQ = countsQ.eq("contractor_id", contractorScopeFilter);

  // Parents with at least one successfully resolved retest child should leave active unresolved queues.
  // The parent remains historically failed, but should not stay in active Failed / Attention views.
  const resolvedRetestChildrenQ = supabase
    .from("jobs")
    .select("parent_job_id")
    .not("parent_job_id", "is", null)
    .in("ops_status", ["paperwork_required", "invoice_required", "closed"])
    .is("deleted_at", null);

  const activeRetestChildrenQ = supabase
    .from("jobs")
    .select("parent_job_id, service_case_id, created_at, scheduled_date, window_start, window_end")
    .not("parent_job_id", "is", null)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .neq("ops_status", "closed");

  const contractorsQ = supabase
    .from("contractors")
    .select("id, name")
    .eq("lifecycle_state", "active")
    .order("name", { ascending: true });

  const _t_countsAndRetestReads = opsTimingEnabled ? Date.now() : 0;
  const [countsRes, resolvedRetestRes, activeRetestRes, contractorsRes] = await Promise.all([
    countsQ,
    resolvedRetestChildrenQ,
    activeRetestChildrenQ,
    contractorsQ,
  ]);

  if (countsRes.error) throw countsRes.error;
  if (resolvedRetestRes.error) throw resolvedRetestRes.error;
  if (activeRetestRes.error) throw activeRetestRes.error;
  if (contractorsRes.error) throw contractorsRes.error;
  if (opsTimingEnabled) console.log(`[ops:countsAndRetestReads] ${Date.now() - _t_countsAndRetestReads}ms`);

  const countRows = countsRes.data ?? [];
  const resolvedRetestChildren = resolvedRetestRes.data ?? [];
  const activeRetestChildren = activeRetestRes.data ?? [];
  const contractors = contractorsRes.data ?? [];

  const counts = new Map<string, number>();
  for (const row of countRows ?? []) {
    const key = String((row as any).ops_status ?? "");
    const lifecycle = String((row as any).status ?? "").toLowerCase();
    if (!key) continue;
    if ((key === "need_to_schedule" || key === "scheduled") && lifecycle !== "open") continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const resolvedFailedParentIds = new Set(
    (resolvedRetestChildren ?? [])
      .map((r: any) => String(r.parent_job_id ?? "").trim())
      .filter(Boolean)
  );

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


  // Common job select (keep lightweight)
  const baseSelectWithBillingDisposition =
    "id, title, status, parent_job_id, service_case_id, job_type, ops_status, field_complete, field_complete_at, certs_complete, invoice_complete, billing_disposition, invoice_number, permit_number, pending_info_reason, on_hold_reason, scheduled_date, window_start, window_end, city, job_address, customer_first_name, customer_last_name, customer_phone, contractor_id, contractors(name), customer_id, deleted_at, location_id, created_at, visit_scope_summary, visit_scope_items";
  const baseSelectCompat =
    "id, title, status, parent_job_id, service_case_id, job_type, ops_status, field_complete, field_complete_at, certs_complete, invoice_complete, invoice_number, permit_number, pending_info_reason, on_hold_reason, scheduled_date, window_start, window_end, city, job_address, customer_first_name, customer_last_name, customer_phone, contractor_id, contractors(name), customer_id, deleted_at, location_id, created_at, visit_scope_summary, visit_scope_items";
  const operationalReportingSelectWithBillingDisposition =
    "id, parent_job_id, service_case_id, job_type, status, ops_status, created_at, scheduled_date, field_complete, field_complete_at, service_visit_outcome, invoice_complete, billing_disposition, certs_complete";
  const operationalReportingSelectCompat =
    "id, parent_job_id, service_case_id, job_type, status, ops_status, created_at, scheduled_date, field_complete, field_complete_at, service_visit_outcome, invoice_complete, certs_complete";

  // Helper to apply filters
  const applyCommonFilters = (qb: any) => {
    if (contractorScopeFilter) qb = qb.eq("contractor_id", contractorScopeFilter);

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

  const runJobsSelectWithCompat = async (buildQuery: (selectClause: string) => any) =>
    withJobsBillingDispositionSelectFallback<any[]>({
      runPrimary: () => buildQuery(baseSelectWithBillingDisposition),
      runCompat: () => buildQuery(baseSelectCompat),
    });

  const runOperationalReportingJobsSelectWithCompat = async () =>
    withJobsBillingDispositionSelectFallback<any[]>({
      runPrimary: () => {
        let q = supabase
          .from("jobs")
          .select(operationalReportingSelectWithBillingDisposition)
          .is("deleted_at", null)
          .neq("status", "cancelled");

        if (contractorScopeFilter) q = q.eq("contractor_id", contractorScopeFilter);
        return q;
      },
      runCompat: () => {
        let q = supabase
          .from("jobs")
          .select(operationalReportingSelectCompat)
          .is("deleted_at", null)
          .neq("status", "cancelled");

        if (contractorScopeFilter) q = q.eq("contractor_id", contractorScopeFilter);
        return q;
      },
    });

  const _t_primaryQueueReads = opsTimingEnabled ? Date.now() : 0;
    const [
      fieldWorkRes,
      callListRes,
      scheduledSnapshotRes,
      closeoutRes,
      stillOpenRes,
      attentionRes,
      operationalReportingJobsRes,
      bucketRes,
    ] = await Promise.all([
      trackOpsTiming(
        "ops:primaryQueueReads:fieldWork",
        trackOpsTiming(
          "ops:fieldWork:fetch",
          runJobsSelectWithCompat((selectClause) => {
            let q = supabase
              .from("jobs")
              .select(selectClause)
              .is("deleted_at", null)
              .neq("status", "cancelled")
              .neq("ops_status", "closed")
              .eq("field_complete", false)
              .gte("scheduled_date", startTodayUtc)
              .lt("scheduled_date", startTomorrowUtc)
              .order("window_start", { ascending: true });
            q = applyCommonFilters(q);
            return q;
          }),
        )
      ),
      trackOpsTiming(
        "ops:primaryQueueReads:callList",
        trackOpsTiming(
          "ops:callList:fetch",
          runJobsSelectWithCompat((selectClause) => {
            let q = supabase
              .from("jobs")
              .select(selectClause)
              .is("deleted_at", null)
              .neq("status", "cancelled")
              .eq("status", "open")
              .eq("ops_status", "need_to_schedule")
              .order("created_at", { ascending: false })
              .limit(10);
            q = applyCommonFilters(q);
            return q;
          }),
        )
      ),
      trackOpsTiming(
        "ops:primaryQueueReads:scheduledSnapshot",
        runJobsSelectWithCompat((selectClause) => {
          let q = supabase
            .from("jobs")
            .select(selectClause)
            .is("deleted_at", null)
            .neq("status", "cancelled")
            .eq("status", "open")
            .eq("ops_status", "scheduled")
            .order("scheduled_date", { ascending: true })
            .order("window_start", { ascending: true })
            .limit(50);
          q = applyCommonFilters(q);
          return q;
        }),
      ),
      trackOpsTiming(
        "ops:primaryQueueReads:closeoutSource",
        runJobsSelectWithCompat((selectClause) => {
          let q = supabase
            .from("jobs")
            .select(selectClause)
            .is("deleted_at", null)
            .neq("status", "cancelled")
            .eq("field_complete", true)
            .neq("ops_status", "closed")
            .order("created_at", { ascending: false })
            .limit(100);
          q = applyCommonFilters(q);
          return q;
        }),
      ),
      trackOpsTiming(
        "ops:primaryQueueReads:stillOpenExceptions",
        runJobsSelectWithCompat((selectClause) => {
          let q = supabase
            .from("jobs")
            .select(selectClause)
            .is("deleted_at", null)
            .neq("status", "cancelled")
            .neq("ops_status", "closed")
            .eq("field_complete", false)
            .lt("scheduled_date", startTodayUtc)
            .order("scheduled_date", { ascending: true })
            .order("created_at", { ascending: true })
            .limit(100);
          q = applyCommonFilters(q);
          return q;
        }),
      ),
      trackOpsTiming(
        "ops:primaryQueueReads:attention",
        runJobsSelectWithCompat((selectClause) => {
          let q = supabase
            .from("jobs")
            .select(selectClause)
            .is("deleted_at", null)
            .or(
              [
                `and(ops_status.eq.need_to_schedule,status.eq.open,created_at.lte.${attentionBusinessCutoffIso})`,
                `and(ops_status.eq.pending_info,created_at.lte.${attentionBusinessCutoffIso})`,
                `and(ops_status.eq.failed,created_at.lte.${failedCutoffIso})`,
                `and(ops_status.eq.pending_office_review,created_at.lte.${failedCutoffIso})`,
              ].join(","),
            )
            .order("created_at", { ascending: true })
            .limit(10);
          q = applyCommonFilters(q);
          return q;
        }),
      ),
      trackOpsTiming("ops:primaryQueueReads:reportingJobs", runOperationalReportingJobsSelectWithCompat()),
      trackOpsTiming(
        "ops:primaryQueueReads:activeBucket",
        runJobsSelectWithCompat((selectClause) => {
          let q = supabase
            .from("jobs")
            .select(selectClause)
            .is("deleted_at", null)
            .neq("status", "cancelled")
            .order("created_at", { ascending: false })
            .limit(100);

          if (bucket === "attention") {
            q = q.or(
              [
                `and(ops_status.eq.need_to_schedule,status.eq.open,created_at.lte.${attentionBusinessCutoffIso})`,
                `and(ops_status.eq.pending_info,created_at.lte.${attentionBusinessCutoffIso})`,
                `and(ops_status.eq.failed,created_at.lte.${failedCutoffIso})`,
                `and(ops_status.eq.pending_office_review,created_at.lte.${failedCutoffIso})`,
              ].join(","),
            );
          } else if (bucket === "failed") {
            q = q.in("ops_status", ["failed", "pending_office_review"]);
          } else if (bucket === "workflow_all") {
            q = q.in("ops_status", [
              "need_to_schedule",
              "pending_info",
              "on_hold",
              "failed",
              "pending_office_review",
            ]);
          } else if (bucket === "closeout") {
            q = q
              .eq("field_complete", true)
              .neq("ops_status", "closed");
          } else if (bucket === "recent_closed") {
            q = q
              .eq("ops_status", "closed")
              .order("created_at", { ascending: false })
              .limit(15);
          } else {
            q = q.eq("ops_status", bucket);
            if (bucket === "need_to_schedule" || bucket === "scheduled") {
              q = q.eq("status", "open");
            }
          }

          q = applyCommonFilters(q);
          return q;
        }),
      ),
    ]);

  if (fieldWorkRes.error) throw fieldWorkRes.error;
  if (callListRes.error) throw callListRes.error;
  if (scheduledSnapshotRes.error) throw scheduledSnapshotRes.error;
  if (closeoutRes.error) throw closeoutRes.error;
  if (stillOpenRes.error) throw stillOpenRes.error;
  if (attentionRes.error) throw attentionRes.error;
  if (operationalReportingJobsRes.error) throw operationalReportingJobsRes.error;
  if (bucketRes.error) throw bucketRes.error;
  if (opsTimingEnabled) console.log(`[ops:primaryQueueReads] ${Date.now() - _t_primaryQueueReads}ms`);

  const _t_fieldWorkPostFilter = opsTimingEnabled ? Date.now() : 0;
  const fieldWorkJobs = (fieldWorkRes.data ?? []).filter(
    (j: any) => !shouldHideFailedParentJob(j) && matchesOpsSearch(j)
  );
  if (opsTimingEnabled) console.log(`[ops:fieldWork:postFilter] ${Date.now() - _t_fieldWorkPostFilter}ms`);
  const _t_callListPostFilter = opsTimingEnabled ? Date.now() : 0;
  const callListJobs = (callListRes.data ?? []).filter(
    (j: any) => !shouldHideFailedParentJob(j) && matchesOpsSearch(j)
  );
  if (opsTimingEnabled) console.log(`[ops:callList:postFilter] ${Date.now() - _t_callListPostFilter}ms`);
  const scheduledSnapshotJobs = (scheduledSnapshotRes.data ?? []).filter(
    (j: any) => !shouldHideFailedParentJob(j) && matchesOpsSearch(j)
  );
  const closeoutSourceJobs = (closeoutRes.data ?? []).filter(
    (j: any) => !shouldHideFailedParentJob(j) && matchesOpsSearch(j)
  );
  const stillOpenJobs = (stillOpenRes.data ?? []).filter(
    (j: any) => !shouldHideFailedParentJob(j) && matchesOpsSearch(j)
  );
  const attentionJobs = (attentionRes.data ?? []).filter(
    (j: any) => !shouldHideFailedParentJob(j) && matchesOpsSearch(j)
  );
  const attentionCount = attentionJobs.length;

  const operationalReportingJobs = (operationalReportingJobsRes.data ?? [])
    .filter((job: any) => !shouldHideFailedParentJob(job)) as OperationalReportingJob[];

  const reportingServiceCaseIds = Array.from(
    new Set(
      operationalReportingJobs
        .map((job) => String(job.service_case_id ?? "").trim())
        .filter(Boolean)
    )
  );

  let throughputEventsQ: any = null;
  if (!contractorScopeFilter || operationalReportingJobs.length > 0) {
    throughputEventsQ = supabase
      .from("job_events")
      .select("event_type")
      .gte("created_at", recentThroughputCutoffIso)
      .in("event_type", ["job_created", "job_completed", "scheduled", "schedule_updated", "contractor_schedule_updated"]);

    if (contractorScopeFilter) {
      throughputEventsQ = throughputEventsQ.in(
        "job_id",
        operationalReportingJobs.map((job) => job.id)
      );
    }
  }

  const _t_serviceCaseAndThroughputReads = opsTimingEnabled ? Date.now() : 0;
  const [reportingServiceCasesRes, throughputEventsRes] = await Promise.all([
    reportingServiceCaseIds.length
      ? supabase
          .from("service_cases")
          .select("id, status")
          .in("id", reportingServiceCaseIds)
      : Promise.resolve({ data: [], error: null }),
    throughputEventsQ ?? Promise.resolve({ data: [], error: null }),
  ]);

  if (reportingServiceCasesRes.error) throw reportingServiceCasesRes.error;
  if (throughputEventsRes.error) throw throughputEventsRes.error;
  if (opsTimingEnabled) console.log(`[ops:serviceCaseAndThroughputReads] ${Date.now() - _t_serviceCaseAndThroughputReads}ms`);

  const reportingServiceCases = reportingServiceCasesRes.data ?? [];
  const throughputEventRows = (throughputEventsRes.data ?? []) as Array<{ event_type: string | null }>;

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
    billing_disposition: job?.billing_disposition,
    certs_complete: job?.certs_complete,
  }));

  const _t_closeoutProjection = opsTimingEnabled ? Date.now() : 0;
  const { projectionsByJobId: closeoutProjectionByJobId } = await buildBillingTruthCloseoutProjectionMap({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobs: closeoutProjectionJobInputs,
  });
  if (opsTimingEnabled) console.log(`[ops:closeoutProjection] ${Date.now() - _t_closeoutProjection}ms`);

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

  const bucketJobsRaw = bucketRes.data ?? [];
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
  ...(callListJobs ?? []),
  ...(scheduledSnapshotJobs ?? []),
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

const _t_customerLocationMaps = opsTimingEnabled ? Date.now() : 0;
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
if (opsTimingEnabled) console.log(`[ops:customerLocationMaps] ${Date.now() - _t_customerLocationMaps}ms`);

const customersById = new Map((custRes.data ?? []).map((c: any) => [c.id, c]));
const locationsById = new Map((locRes.data ?? []).map((l: any) => [l.id, l]));

const operationalTenantIdentity = await operationalTenantIdentityPromise;
const internalBusinessDisplayName = operationalTenantIdentity.displayName;
const internalBusinessLogoUrl = operationalTenantIdentity.logoUrl;

// helpers used in JSX (prefer truth tables, fallback to job snapshot)
function customerLine(j: any) {
  const c: any = j.customer_id ? customersById.get(j.customer_id) : null;
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
  const cityStateZip = [formatCityNamePart(parts.city), [parts.state, parts.zip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const out = [parts.address, cityStateZip].filter(Boolean).join(", ");
  return out || "—";
}

function addressParts(j: any) {
  const l: any = j.location_id ? locationsById.get(j.location_id) : null;

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
  const c: any = j.customer_id ? customersById.get(j.customer_id) : null;
  return (
    c?.full_name ||
    `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() ||
    `${j.customer_first_name ?? ""} ${j.customer_last_name ?? ""}`.trim() ||
    "—"
  );
}

function customerPhoneOnly(j: any) {
  const c: any = j.customer_id ? customersById.get(j.customer_id) : null;
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
  return formatFailedEccQueueReasonFromRun({ test_type: testTypeRaw }) || (text ? "Correction Required" : "");
}

function toEpochMs(value?: string | null) {
  const t = new Date(String(value ?? "")).getTime();
  return Number.isFinite(t) ? t : 0;
}

function buildLatestFailedRunByJob(runs: any[]) {
  const latestByJob = new Map<string, any>();
  for (const run of runs ?? []) {
    const jobId = String((run as any)?.job_id ?? "").trim();
    if (!jobId) continue;

    const current = latestByJob.get(jobId);
    if (!current) {
      latestByJob.set(jobId, run);
      continue;
    }

    const currentMs = Math.max(toEpochMs((current as any)?.created_at));
    const nextMs = Math.max(toEpochMs((run as any)?.created_at));

    if (nextMs > currentMs) {
      latestByJob.set(jobId, run);
    }
  }
  return latestByJob;
}

function buildPrimaryFailureReasonByJob(latestByJob: Map<string, any>) {
  const reasonByJob = new Map<string, string>();
  for (const [jobId, run] of latestByJob.entries()) {
    const reasons = extractFailureReasons(run);
    const primaryLine = reasons[0] ?? "";
    const formatted = normalizeFailureLine(primaryLine, String((run as any)?.test_type ?? ""));
    if (formatted) reasonByJob.set(jobId, formatted);
  }
  return reasonByJob;
}

function pendingInfoBannerText(j: any) {
  const waitingState = getActiveWaitingState({
    ops_status: j?.ops_status ?? null,
    pending_info_reason: j?.pending_info_reason ?? null,
    on_hold_reason: j?.on_hold_reason ?? null,
  });
  return waitingState?.status === "pending_info"
    ? waitingState.blockerReason
    : String(j?.pending_info_reason ?? "").trim();
}

function onHoldBannerText(j: any) {
  const waitingState = getActiveWaitingState({
    ops_status: j?.ops_status ?? null,
    pending_info_reason: j?.pending_info_reason ?? null,
    on_hold_reason: j?.on_hold_reason ?? null,
  });
  return waitingState?.status === "on_hold"
    ? waitingState.blockerReason
    : String(j?.on_hold_reason ?? "").trim();
}

function queueReason(j: any, activeBucket: string) {
  const status = String(j?.ops_status ?? "").toLowerCase();
  const jobId = String(j?.id ?? "");
  const retestState = retestStateForJob(jobId);
  const retestSchedule = retestScheduleLabelForJob(jobId);

  if (status === "failed" || status === "retest_needed") {
    if (retestState === "pending_scheduling") {
      return "Retest pending scheduling — retest job exists but is not yet scheduled";
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
    return getOpsQueueCardStatusReason(withServiceFollowUpProgress(j));
  }

  if (status === "pending_office_review") {
    return "Corrections submitted / under review — contractor corrections submitted and pending internal review";
  }

  if (activeBucket === "failed" || status === "failed") {
    return getOpsQueueCardStatusReason(withServiceFollowUpProgress(j));
  }

  if (activeBucket === "retest_needed" || status === "retest_needed") {
    if (hasSignalEventForJob(latestRetestReadyByJob, jobId)) {
      return "Retest needed — retest ready requested";
    }
    return "Retest needed — awaiting contractor action";
  }

  if (activeBucket === "on_hold" || status === "on_hold") {
    return getOpsQueueCardStatusReason(withServiceFollowUpProgress(j));
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
    if (needs.needsInvoice) return "Invoice required — invoice still pending";
    return "Invoice required — no further action needed";
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
  if (status === "pending_office_review") return "Review Corrections Submitted";
  if (status === "failed" || status === "retest_needed") return "Review Failed / Correction Required";
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
    return "Retest pending scheduling — retest job needs a date and time";
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
    contractorScopeFilter && contractors?.find((c: any) => c.id === contractorScopeFilter)?.name;

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

const pendingInfoJobIds = uniqueAllOpenOpsJobs
  .filter((j: any) => String(j?.ops_status ?? "").toLowerCase() === "pending_info")
  .map((j: any) => String(j.id ?? ""))
  .filter(Boolean);

const _t_secondarySignalReads = opsTimingEnabled ? Date.now() : 0;
const [
  pendingInfoTransitionRes,
  opsStatusTransitionRes,
  activeAssignmentDisplayMap,
  signalRes,
  customerAttemptEventsRes,
  unreadContractorAwarenessNotifications,
  unreadNewWorkRequestAwarenessNotifications,
  failedRunsRes,
] = await Promise.all([
  trackOpsTiming(
    "ops:secondarySignalReads:pendingInfoTransitions",
    pendingInfoJobIds.length
      ? supabase
          .from("job_events")
          .select("job_id, created_at, meta")
          .in("job_id", pendingInfoJobIds)
          .eq("event_type", "ops_update")
          .order("created_at", { ascending: false })
          .range(0, 5000)
      : Promise.resolve({ data: [], error: null })
  ),
  trackOpsTiming(
    "ops:secondarySignalReads:opsStatusTransitions",
    allOpenOpsJobIds.length
      ? supabase
          .from("job_events")
          .select("job_id, created_at, meta")
          .in("job_id", allOpenOpsJobIds)
          .eq("event_type", "ops_update")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null })
  ),
  trackOpsTiming(
    "ops:secondarySignalReads:assignmentDisplayMap",
    getActiveJobAssignmentDisplayMap({
      supabase,
      jobIds: allOpenOpsJobIds,
    })
  ),
  trackOpsTiming(
    "ops:secondarySignalReads:contractorSignalEvents",
    allOpenOpsJobIds.length
      ? supabase
          .from("job_events")
          .select("job_id, event_type, created_at, meta")
          .in("job_id", allOpenOpsJobIds)
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
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null })
  ),
  trackOpsTiming(
    "ops:secondarySignalReads:customerAttemptEvents",
    allOpenOpsJobIds.length
      ? supabase
          .from("job_events")
          .select("job_id, created_at")
          .in("job_id", allOpenOpsJobIds)
          .eq("event_type", "customer_attempt")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null })
  ),
  trackOpsTiming(
    "ops:secondarySignalReads:unreadContractorNotifications",
    listInternalContractorUpdateAwareness({
      limit: 100,
      onlyUnread: true,
    })
  ),
  trackOpsTiming(
    "ops:secondarySignalReads:unreadNewWorkRequestNotifications",
    listInternalNewWorkRequestAwareness({
      limit: 100,
      onlyUnread: true,
    })
  ),
  trackOpsTiming(
    "ops:secondarySignalReads:failedEccRuns",
    allOpenOpsJobIds.length
      ? supabase
          .from("ecc_test_runs")
          .select("job_id, test_type, computed, computed_pass, override_pass, is_completed, created_at")
          .in("job_id", allOpenOpsJobIds)
          .eq("is_completed", true)
          .or("override_pass.eq.false,computed_pass.eq.false")
      : Promise.resolve({ data: [], error: null })
  ),
]);

if (pendingInfoTransitionRes.error) throw pendingInfoTransitionRes.error;
if (opsStatusTransitionRes.error) throw opsStatusTransitionRes.error;
if (signalRes.error) throw signalRes.error;
if (customerAttemptEventsRes.error) throw customerAttemptEventsRes.error;
if (failedRunsRes.error) throw failedRunsRes.error;
if (opsTimingEnabled) console.log(`[ops:secondarySignalReads] ${Date.now() - _t_secondarySignalReads}ms`);

const pendingInfoTransitionEvents = pendingInfoTransitionRes.data ?? [];
opsStatusEnteredAtByJob = buildOpsStatusEnteredAtByJob(
  (opsStatusTransitionRes.data ?? []) as Array<{ job_id?: unknown; created_at?: unknown; meta?: unknown }>,
);

const pendingInfoSetAtByJob = new Map<string, string>();
for (const ev of pendingInfoTransitionEvents ?? []) {
  const jobId = String((ev as any)?.job_id ?? "").trim();
  if (!jobId || pendingInfoSetAtByJob.has(jobId)) continue;
  if (!didOpsStatusChangeTo((ev as any)?.meta, "pending_info")) continue;

  const createdAt = String((ev as any)?.created_at ?? "").trim();
  if (createdAt) pendingInfoSetAtByJob.set(jobId, createdAt);
}

const serviceFollowUpEventsByJob = new Map<string, Array<{ created_at?: string | null; meta?: unknown }>>();
for (const ev of pendingInfoTransitionEvents ?? []) {
  const jobId = String((ev as any)?.job_id ?? "").trim();
  if (!jobId) continue;
  const rows = serviceFollowUpEventsByJob.get(jobId) ?? [];
  rows.push({
    created_at: String((ev as any)?.created_at ?? "").trim() || null,
    meta: (ev as any)?.meta ?? null,
  });
  serviceFollowUpEventsByJob.set(jobId, rows);
}

serviceFollowUpProgressLabelByJob = new Map<string, string>();
continuedServiceFollowUpParentIds = new Set<string>();
for (const job of uniqueAllOpenOpsJobs) {
  const jobId = String((job as any)?.id ?? "").trim();
  if (!jobId) continue;
  const followUpState = buildServiceFollowUpProgressState({
    pendingInfoReason: (job as any)?.pending_info_reason ?? null,
    events: serviceFollowUpEventsByJob.get(jobId) ?? [],
  });
  const progressLabel = followUpState.progressLabel;
  if (progressLabel) serviceFollowUpProgressLabelByJob.set(jobId, progressLabel);
  if (followUpState.continuedThroughChildJobId) continuedServiceFollowUpParentIds.add(jobId);
}

function assignmentSummaryForJob(jobId: string) {
  return formatAssignmentSummaryForJob(jobId, activeAssignmentDisplayMap);
}

const signalEvents = signalRes.data ?? [];
const latestCustomerAttemptByJob = buildLatestCustomerAttemptByJob(
  (customerAttemptEventsRes.data ?? []) as Array<{ job_id: string; created_at: string }>,
);

const unreadContractorUpdateNotifications = unreadContractorAwarenessNotifications
  .filter((notification: any) => {
    const jobId = String(notification.job_id ?? "").trim();
    return Boolean(jobId);
  })
  .map((notification: any) => ({
    job_id: String(notification.job_id ?? "").trim(),
    notification_type: String(notification.notification_type ?? "").trim(),
    created_at: String(notification.created_at ?? "").trim(),
  }));

const failedRuns = failedRunsRes.data ?? [];

latestFailedRunByJob = buildLatestFailedRunByJob(failedRuns ?? []);
primaryFailureReasonByJob = buildPrimaryFailureReasonByJob(latestFailedRunByJob);

function failedStatusSinceByJob(jobId: string): string | null {
  const run = latestFailedRunByJob.get(jobId);
  if (!run) return null;

  const createdAt = String((run as any)?.created_at ?? "").trim();
  return createdAt || null;
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
    !failedParentIdsWithRetestChild.has(jobId) &&
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
const newWorkRequestCount = unreadNewWorkRequestAwarenessNotifications.length;

let signalFilteredBucketJobs = [...(filteredBucketJobs ?? [])];
signalFilteredBucketJobs = signalFilteredBucketJobs.filter(
  (j: any) => !continuedServiceFollowUpParentIds.has(String(j?.id ?? "").trim()),
);

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

const scheduledWithoutTechSnapshot = buildScheduledWithoutTechSnapshot({
  jobs: scheduledSnapshotJobs,
  assignmentDisplayMap: activeAssignmentDisplayMap,
  previewLimit: 5,
});

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
    reason: "Still open past schedule",
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
  listCloseoutQueueJobs(closeoutSourceJobs ?? [], getCloseoutProjection),
  sort
);

const teamSnapshotScheduledTodayCount = (fieldWorkJobs ?? []).length;
const teamSnapshotUnassignedCount = uniqueAllOpenOpsJobs.filter(
  (job: any) => assignmentSummaryForJob(String(job?.id ?? "")) === "Unassigned"
).length;
const teamSnapshotInProgressCount = uniqueAllOpenOpsJobs.filter((job: any) => {
  const lifecycle = String(job?.status ?? "").toLowerCase();
  return lifecycle === "on_the_way" || lifecycle === "in_progress";
}).length;
const teamSnapshotWaitingCount = uniqueAllOpenOpsJobs.filter((job: any) => {
  const waitingState = getActiveWaitingState({
    ops_status: job?.ops_status ?? null,
    pending_info_reason: job?.pending_info_reason ?? null,
    on_hold_reason: job?.on_hold_reason ?? null,
  });
  return Boolean(waitingState?.status);
}).length;
const teamSnapshotNeedsCloseoutCount = closeoutJobs.length;

const teamSnapshotCards = [
  { key: "scheduled_today", label: "Scheduled Today", count: teamSnapshotScheduledTodayCount },
  { key: "unassigned", label: "Unassigned", count: teamSnapshotUnassignedCount },
  { key: "in_progress", label: "In Progress", count: teamSnapshotInProgressCount },
  { key: "waiting", label: "Waiting", count: teamSnapshotWaitingCount },
];

const teamSnapshotTotalCount = teamSnapshotCards.reduce((sum, card) => sum + card.count, 0);

const workByTechnicianMap = new Map<string, { open: number; scheduled: number; waiting: number }>();
for (const job of uniqueAllOpenOpsJobs) {
  const jobId = String(job?.id ?? "");
  if (!jobId) continue;

  const assignments = activeAssignmentDisplayMap[jobId] ?? [];
  if (!assignments.length) continue;

  const isScheduled = String(job?.ops_status ?? "").toLowerCase() === "scheduled";
  const waitingState = getActiveWaitingState({
    ops_status: job?.ops_status ?? null,
    pending_info_reason: job?.pending_info_reason ?? null,
    on_hold_reason: job?.on_hold_reason ?? null,
  });
  const isWaiting = Boolean(waitingState?.status);

  for (const assignment of assignments) {
    const displayName = formatPersonNamePart(assignment?.display_name);
    if (!displayName) continue;

    const existing = workByTechnicianMap.get(displayName) ?? { open: 0, scheduled: 0, waiting: 0 };
    if (isWaiting) {
      existing.waiting += 1;
    } else if (isScheduled) {
      existing.scheduled += 1;
    } else {
      existing.open += 1;
    }
    workByTechnicianMap.set(displayName, existing);
  }
}

const workByTechnicianRows = Array.from(workByTechnicianMap.entries())
  .map(([name, counts]) => ({
    name,
    ...counts,
    total: counts.open + counts.scheduled + counts.waiting,
  }))
  .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

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
    label: formatEccRetestReadySignalLabel(),
    count: retestReadyCount,
  },
  {
    key: "new_contractor",
    bucket: "need_to_schedule",
    label: isHvacServiceMode ? "New Submitted Jobs" : "New Contractor Jobs",
    count: contractorCreatedCount,
  },
  {
    key: "new_work_requests",
    bucket,
    label: "New Work Requests",
    helper: isHvacServiceMode
      ? "Unread submitted jobs or proposals that need review."
      : "Unread contractor-submitted jobs or proposals that need review.",
    count: newWorkRequestCount,
  },
  {
    key: "contractor_updates",
    bucket,
    label: isHvacServiceMode ? "Collaboration Updates" : "Contractor Updates",
    count: contractorUpdatesCount,
  },
];

const visibleSignalCards = signalCards.filter(
  (card) => card.count > 0 || signal === card.key
);
const hasActiveSystemAlerts = visibleSignalCards.some((card) => card.count > 0);
const showContractorFilter = (contractors ?? []).length > 0;
const showContractorFilterInPrimary = showContractorFilter && !isHvacServiceMode;
const showContractorSignalsSection = visibleSignalCards.length > 0 || Boolean(signal);
// Show contractor signals for ECC/Hybrid modes, OR show collaboration signals for HVAC Service mode
const showOperationalNotificationAwareness = (!isHvacServiceMode && showContractorSignalsSection) || isHvacServiceMode;

const failedPaymentNoSideEffectContractSatisfied = showFailedPaymentAttentionCard
  ? Boolean(
    failedPaymentReconciliation?.noStripeCalls
      && failedPaymentReconciliation?.noPaymentRowWrites
      && failedPaymentReconciliation?.noAllocationRowWrites
      && failedPaymentReconciliation?.noInvoiceMutations
      && failedPaymentReconciliation?.noVisitOrNextDueMutations,
  )
  : false;

const activeQueueLabel = OPS_TABS.find((t) => t.key === bucket)?.label ?? bucket;
const activeSignalLabel =
  signal === "retest_ready"
    ? formatEccRetestReadySignalLabel()
    : signal === "new_contractor"
    ? "New Contractor Jobs"
    : signal === "new_work_requests"
    ? "New Work Requests"
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

function splitQueueStatusReasonDisplay(display: string): { label: string; message: string } {
  const text = String(display ?? "").trim();
  if (!text) return { label: "Operational Update", message: "" };

  const separatorIndex = text.indexOf(":");
  if (separatorIndex < 0) return { label: text, message: "" };

  const label = text.slice(0, separatorIndex).trim();
  const message = text.slice(separatorIndex + 1).trim();

  return {
    label: label || "Operational Update",
    message,
  };
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
    ? { label: "FAILED / CORRECTION REQUIRED", tone: "border-rose-200 bg-rose-50 text-rose-800" }
    : isPendingOfficeReview
    ? { label: "CORRECTIONS SUBMITTED / UNDER REVIEW", tone: "border-cyan-200 bg-cyan-50 text-cyan-800" }
    : retestState === "pending_scheduling"
    ? { label: "Retest Pending Scheduling", tone: "border-amber-200 bg-amber-50 text-amber-800" }
    : scheduledRetestLabel
    ? { label: "Retest Scheduled", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" }
    : opsStatus === "retest_needed"
    ? { label: "Retest Ready", tone: "border-orange-200 bg-orange-50 text-orange-900" }
    : lifecycleStatus === "on_the_way"
    ? { label: "On the Way", tone: "border-sky-200 bg-sky-50 text-sky-800" }
    : lifecycleStatus === "in_progress"
    ? { label: "In Progress", tone: "border-blue-200 bg-blue-50 text-blue-800" }
    : opsStatus === "scheduled"
    ? { label: "Scheduled", tone: "border-slate-200 bg-slate-50 text-slate-800" }
    : { label: "Open", tone: "border-slate-200 bg-slate-50 text-slate-800" };
  const pendingInfoSignal = opsStatus === "pending_info";
  const onHoldSignal = opsStatus === "on_hold";
  const waitingState = getActiveWaitingState({
    ops_status: j?.ops_status ?? null,
    pending_info_reason: j?.pending_info_reason ?? null,
    on_hold_reason: j?.on_hold_reason ?? null,
  });
  const statusAgeDays = resolveStatusAgeDays({
    status: opsStatus,
    failedInstant: failedStatusSinceByJob(jobId),
    pendingInfoInstant: pendingInfoSetAtByJob.get(jobId) ?? null,
    fallbackUpdatedAt: String(j?.created_at ?? "").trim() || null,
  });
  const statusAgeSuffix = statusAgeDays == null ? "" : ` · ${formatStatusAgeCompact(statusAgeDays)}`;
  const needsAttention = isNeedsAttentionJob(j);
  const pendingInfoContext = waitingState?.status === "pending_info"
    ? waitingState.blockerReason
    : pendingInfoBannerText(j);
  const onHoldContext = waitingState?.status === "on_hold"
    ? waitingState.blockerReason
    : onHoldBannerText(j);
  const showPendingInfoBanner = pendingInfoSignal && Boolean(pendingInfoContext);
  const showOnHoldBanner = onHoldSignal && Boolean(onHoldContext);
  const customerName = formatPersonNamePart(customerNameOnly(j));
  const customerPhone = customerPhoneOnly(j);
  const isEccJob = String(j?.job_type ?? "").toLowerCase() === "ecc";
  const visitScope = buildVisitScopeReadModel(j?.visit_scope_summary, j?.visit_scope_items, {
    leadMaxLength: 82,
    previewItemCount: 1,
    previewItemMaxLength: 34,
  });
  const visitScopeIncludes = isEccJob
    ? buildVisitScopeIncludesReadModel(j?.visit_scope_summary, j?.visit_scope_items, {
        leadMaxLength: 70,
      })
    : null;
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
  const queueStatusReasonDisplay = getOpsQueueCardStatusReason(withServiceFollowUpProgress(j));
  const queueStatusReasonParts = splitQueueStatusReasonDisplay(queueStatusReasonDisplay);
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
    ? "Corrections Submitted / Under Review"
    : retestState === "scheduled"
    ? "Retest Scheduled"
    : retestState === "pending_scheduling"
    ? "Retest Pending Scheduling"
    : opsStatus === "retest_needed"
    ? "Retest Ready"
    : isRetestChild
    ? "Failed Retest"
    : "Failed / Correction Required";
  const failedSupportText = isPendingOfficeReview
    ? "Corrections submitted. Internal review is in progress."
    : retestState === "scheduled"
    ? `Retest scheduled for ${scheduledRetestLabel}`
    : retestState === "pending_scheduling"
    ? "Retest job exists but still needs a scheduled date and time."
    : opsStatus === "retest_needed"
    ? hasRetestReady
      ? "Retest readiness was confirmed after contractor request."
      : "Retest readiness was confirmed internally."
    : isRetestChild
    ? "This retest also failed and still needs correction."
    : "Awaiting correction or retest decision.";
  const hasPrimaryStatusCallout = hasMeaningfulStatusBanner;
  const showStatusPill = !hasPrimaryStatusCallout && statusMeta.label !== "Open";
  const scheduleLabel = showDate ? "Scheduled" : "Schedule";
  const hasContractorMeta = contractorName !== "Unassigned";
  const isTechUnassigned = assignmentSummary === "Unassigned";
  const assignedDisplay = isTechUnassigned ? "No tech assigned" : assignmentSummary;
  const supportsAttemptHistory =
    opsStatus === "need_to_schedule" ||
    opsStatus === "pending_info" ||
    opsStatus === "on_hold";
  const recentAttemptDisplay = supportsAttemptHistory
    ? resolveRecentAttemptDisplay(latestCustomerAttemptByJob.get(jobId) ?? null)
    : "";
  const reasonCallout = isFailedFamily
    ? {
        tone: "border-rose-200/80 bg-rose-50/60 text-rose-900",
        labelTone: "text-rose-700",
        bodyTone: "text-rose-900",
        supportTone: "text-rose-900/80",
        label: `${failedStatusLabel}${statusAgeSuffix}`,
        message: failedReasonText,
        support: failedSupportText,
      }
    : showPendingInfoBanner
    ? {
        tone: "border-amber-200/80 bg-amber-50/60 text-amber-900",
        labelTone: "text-amber-700",
        bodyTone: "text-amber-900",
        supportTone: "text-amber-900/80",
        label: `${queueStatusReasonParts.label}${statusAgeSuffix}`,
        message: queueStatusReasonParts.message || pendingInfoContext,
        support: "",
      }
    : showOnHoldBanner
    ? {
        tone: "border-slate-300/90 bg-slate-100/80 text-slate-800",
        labelTone: "text-slate-600",
        bodyTone: "text-slate-800",
        supportTone: "text-slate-700/80",
        label: queueStatusReasonParts.label,
        message: queueStatusReasonParts.message || onHoldContext,
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
    supportsAttemptHistory
      ? {
          key: "last_attempt",
          label: "Last attempt",
          value: recentAttemptDisplay,
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; value: string; href?: string; framed?: boolean }>;

  return (
    <div
      key={j.id}
      className={[
        "relative overflow-hidden rounded-xl border bg-white px-3 py-2 shadow-[0_10px_20px_-22px_rgba(15,23,42,0.28)] ring-1 ring-slate-200/70 transition-all duration-150 hover:-translate-y-px hover:shadow-[0_14px_26px_-22px_rgba(15,23,42,0.32)] sm:px-3 sm:py-2.5",
        emphasize && needsAttention
          ? "border-amber-300 bg-amber-50/30"
          : "border-slate-200/90",
      ].join(" ")}
    >
      <div
        aria-hidden="true"
        className={[
          "absolute inset-y-0 left-0 w-1",
          needsAttention
            ? "bg-amber-400"
            : isFailedFamily
            ? "bg-rose-400"
            : opsStatus === "scheduled"
            ? "bg-cyan-500"
            : opsStatus === "need_to_schedule"
            ? "bg-blue-500"
            : "bg-slate-200",
        ].join(" ")}
      />
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
                <span className="font-semibold uppercase tracking-[0.08em] text-slate-500">{isEccJob ? "Includes" : "Work"}</span>
                <span className="min-w-0 font-medium text-slate-700">{isEccJob ? visitScopeIncludes?.label : visitScope.lead}</span>
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
            {customerPhone && (supportsAttemptHistory || opsStatus === "need_to_schedule") ? (
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
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold uppercase tracking-[0.08em] text-amber-800">
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
  if (key === "new_work_requests") return "border-cyan-200 bg-cyan-50/70 text-cyan-900";
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

const servicePlanSummaryCountClass =
  "rounded-lg border border-slate-200 bg-white/90 px-2.5 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

function sectionCountPill(count: number, tone: "neutral" | "danger" = "neutral") {
  const className =
    tone === "danger"
      ? "inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.11em] text-rose-700 sm:px-2 sm:py-0.5 sm:text-[10px] sm:tracking-[0.12em]"
      : "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-600 sm:px-2 sm:py-0.5 sm:text-[10px] sm:tracking-[0.12em]";

  return <span className={className}>{count} jobs</span>;
}

const maintenanceAgreementsEnabled = isMaintenanceAgreementsEnabled();
let servicePlanSummary: Awaited<ReturnType<typeof summarizeMaintenanceAgreementsForAccount>> | null = null;
if (maintenanceAgreementsEnabled) {
  try {
    servicePlanSummary = await summarizeMaintenanceAgreementsForAccount({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });
  } catch {
    servicePlanSummary = null;
  }
}

const dueIn8To30Days = servicePlanSummary
  ? Math.max(
      0,
      Number(servicePlanSummary.due_counts.due_in_next_30_days ?? 0) -
        Number(servicePlanSummary.due_counts.due_in_next_7_days ?? 0),
    )
  : 0;

const operationalFlowCards = [
  {
    key: "unscheduled",
    label: "Unscheduled Work",
    count: counts.get("need_to_schedule") ?? 0,
    tone: "bg-blue-600",
    href: `/ops${buildQueryString({
      bucket: "need_to_schedule",
      contractor: contractorScopeFilter ?? "",
      q: q ?? "",
      sort: sort ?? "",
      signal: "",
    })}#ops-queues`,
  },
  {
    key: "scheduled",
    label: "Scheduled",
    count: counts.get("scheduled") ?? 0,
    tone: "bg-cyan-600",
    href: `/ops${buildQueryString({
      bucket: "scheduled",
      contractor: contractorScopeFilter ?? "",
      q: q ?? "",
      sort: sort ?? "",
      signal: "",
    })}#ops-queues`,
  },
  {
    key: "field_work",
    label: "Field Work",
    count: prioritizedFieldWorkJobs.length,
    tone: "bg-emerald-600",
    href: "#field-work",
  },
  {
    key: "closeout",
    label: "Closeout",
    count: prioritizedCloseoutJobs.length,
    tone: "bg-violet-600",
    href: `/ops${buildQueryString({
      bucket: "closeout",
      contractor: contractorScopeFilter ?? "",
      q: q ?? "",
      sort: sort ?? "",
      signal: "",
    })}#ops-queues`,
  },
];

const operationalFlowTotal = operationalFlowCards.reduce((sum, card) => sum + card.count, 0);
const activeOpsWorkCount = uniqueAllOpenOpsJobs.length;
const exceptionCount = sortedExceptionJobs.length;
const clockedInNowCount = teamClockStatusRows.filter((row) => row.statusLabel === "Clocked In").length;
const onLunchCount = teamClockStatusRows.length - clockedInNowCount;
const waitingPendingInfoCount = (counts.get("pending_info") ?? 0) + (counts.get("on_hold") ?? 0);
const notificationsCount = contractorUpdatesCount + newWorkRequestCount;

type WorkspaceQueueKey =
  | "need_to_schedule"
  | "field_work"
  | "without_tech"
  | "waiting"
  | "exceptions"
  | "closeout"
  | "updates";

const scheduledSnapshotById = new Map(
  (scheduledSnapshotJobs ?? []).map((job: any) => [String(job?.id ?? ""), job])
);

const withoutTechPreviewJobs = (scheduledWithoutTechSnapshot.preview ?? [])
  .map((job: any) => scheduledSnapshotById.get(String(job?.id ?? "")))
  .filter(Boolean) as any[];

const waitingPreviewJobs = prioritizeActionableJobs(
  uniqueAllOpenOpsJobs.filter((job: any) => {
    const jobId = String(job?.id ?? "").trim();
    if (continuedServiceFollowUpParentIds.has(jobId)) return false;
    const waitingState = getActiveWaitingState({
      ops_status: job?.ops_status ?? null,
      pending_info_reason: job?.pending_info_reason ?? null,
      on_hold_reason: job?.on_hold_reason ?? null,
    });
    return Boolean(waitingState?.status);
  })
);

const workspaceQueues: Array<{
  key: WorkspaceQueueKey;
  label: string;
  count: number;
  fullHref: string;
  previewJobs: any[];
}> = [
  {
    key: "need_to_schedule",
    label: "Needs Scheduling",
    count: prioritizedCallListJobs.length,
    fullHref: `/ops/call-list${contractorScopeFilter ? `?contractor=${encodeURIComponent(contractorScopeFilter)}` : ""}`,
    previewJobs: prioritizedCallListJobs,
  },
  {
    key: "field_work",
    label: "Field Work",
    count: prioritizedFieldWorkJobs.length,
    fullHref: `/ops/field${contractorScopeFilter ? `?contractor=${encodeURIComponent(contractorScopeFilter)}` : ""}`,
    previewJobs: prioritizedFieldWorkJobs,
  },
  {
    key: "without_tech",
    label: "Without Tech",
    count: scheduledWithoutTechSnapshot.count,
    fullHref: `/ops${buildQueryString({ bucket: "without_tech", contractor: contractorScopeFilter ?? "" })}#ops-workspace`,
    previewJobs: withoutTechPreviewJobs,
  },
  {
    key: "waiting",
    label: "Waiting / Pending Info",
    count: waitingPendingInfoCount,
    fullHref: `/ops${buildQueryString({ bucket: "waiting", contractor: contractorScopeFilter ?? "" })}#ops-workspace`,
    previewJobs: waitingPreviewJobs,
  },
  {
    key: "exceptions",
    label: "Exceptions",
    count: exceptionCount,
    fullHref: `/ops${buildQueryString({ bucket: "exceptions", contractor: contractorScopeFilter ?? "" })}#ops-workspace`,
    previewJobs: sortedExceptionJobs,
  },
  {
    key: "closeout",
    label: "Closeout & Review",
    count: prioritizedCloseoutJobs.length,
    fullHref: `/ops/closeout-queue${contractorScopeFilter ? `?contractor=${encodeURIComponent(contractorScopeFilter)}` : ""}`,
    previewJobs: prioritizedCloseoutJobs,
  },
  {
    key: "updates",
    label: "Updates",
    count: notificationsCount,
    fullHref: "/ops/notifications?state=unread",
    previewJobs: [],
  },
];

const workspaceDefaultPriority: WorkspaceQueueKey[] = [
  "exceptions",
  "waiting",
  "without_tech",
  "need_to_schedule",
  "closeout",
  "field_work",
  "updates",
];

const requestedWorkspaceKeyRaw = String(sp.bucket ?? "").trim().toLowerCase();
const requestedWorkspaceKey = workspaceQueues.some((queue) => queue.key === requestedWorkspaceKeyRaw)
  ? (requestedWorkspaceKeyRaw as WorkspaceQueueKey)
  : null;

const highestPriorityWorkspaceKey =
  workspaceDefaultPriority.find((key) => (workspaceQueues.find((queue) => queue.key === key)?.count ?? 0) > 0) ??
  "need_to_schedule";

const selectedWorkspaceKey = requestedWorkspaceKey ?? highestPriorityWorkspaceKey;
const selectedWorkspaceQueue =
  workspaceQueues.find((queue) => queue.key === selectedWorkspaceKey) ?? workspaceQueues[0];

function workspaceStatusReason(job: any, queueKey: WorkspaceQueueKey) {
  const specificFailureReason = workspaceFailedReason(job);
  if (queueKey === "need_to_schedule") return "Awaiting scheduling";
  if (queueKey === "field_work") {
    const lifecycle = String(job?.status ?? "").toLowerCase();
    if (lifecycle === "on_the_way") return "On the way";
    if (lifecycle === "in_progress") return "In progress";
    return "Scheduled field work";
  }
  if (queueKey === "without_tech") return "Scheduled without active tech assignment";
  if (specificFailureReason) return specificFailureReason;
  return getOpsQueueCardStatusReason(withServiceFollowUpProgress(job));
}

function workspaceAgeTime(job: any, queueKey: WorkspaceQueueKey) {
  const scheduleDate = job?.scheduled_date ? formatBusinessDateUS(String(job.scheduled_date)) : "";
  const scheduleWindow = displayWindowLA(job?.window_start, job?.window_end);

  if (queueKey === "field_work" || queueKey === "without_tech") {
    if (scheduleDate && scheduleWindow) return `${scheduleDate} ${scheduleWindow}`;
    return scheduleDate || scheduleWindow || "Schedule pending";
  }

  const jobId = String(job?.id ?? "").trim();
  return (
    resolveLifecycleDaysAgingLabel({
      status: String(job?.status ?? "").trim() || null,
      opsStatus: String(job?.ops_status ?? "").trim() || null,
      createdAt: String(job?.created_at ?? "").trim() || null,
      scheduledDate: String(job?.scheduled_date ?? "").trim() || null,
      fieldCompleteAt: String(job?.field_complete_at ?? "").trim() || null,
      stateEnteredAtByStatus: opsStatusEnteredAtByJob.get(jobId) ?? null,
      failedEvidenceAt: failedStatusSinceByJob(jobId),
    }) ?? "Not available"
  );
}

if (opsTimingEnabled) console.log(`[ops:totalBeforeRender] ${Date.now() - _t_total}ms`);

if (panel !== "full_board") {
  return (
    <div className="mx-auto max-w-[92rem] space-y-3 p-2.5 text-gray-900 sm:space-y-4 sm:p-4 xl:px-6">
      {notice === "estimates_unavailable" ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-[0_14px_32px_-28px_rgba(15,23,42,0.24)]">
          <div className="font-semibold">Estimates are not enabled for this environment yet.</div>
          <div className="mt-1 text-amber-900/85">
            Internal estimate routes remain fail-closed here until the estimate migration is intentionally applied and the feature flag is explicitly enabled.
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-slate-300/80 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(248,250,252,0.98)_56%,rgba(219,234,254,0.56))] p-4 shadow-[0_22px_54px_-34px_rgba(15,23,42,0.45)] ring-1 ring-slate-200/70 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={`${opsUtilityLabelClass} text-blue-700`}>{internalBusinessDisplayName}</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-slate-950 sm:text-[2rem]">
              Operations Workspace
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Start with the queue that needs attention now. Then work down through field progress, exceptions, and closeout.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/today" className={sectionActionLinkClass}>
              Go to Today
            </Link>
            <Link href={selectedWorkspaceQueue.fullHref} className={sectionActionLinkClass}>
              View active queue
            </Link>
          </div>
        </div>
      </section>

      {showFailedPaymentAttentionCard ? (
        <section className="rounded-2xl border border-rose-200/90 bg-rose-50/65 p-3.5 shadow-[0_18px_34px_-30px_rgba(15,23,42,0.34)] ring-1 ring-rose-100/80 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className={`${opsUtilityLabelClass} text-rose-700`}>Financial Attention</div>
              <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-950">Failed payments need attention</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">
                Payment failures are not collected payments. Review the invoice workspace before retrying or contacting the customer.
              </p>
            </div>
            <Link href="/reports/failed-payments" className={inlineSectionLinkClass}>
              Open failed-payment queue
            </Link>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-rose-200 bg-white/90 px-3 py-2">
              <div className={`${opsUtilityLabelClass} text-slate-500`}>Open Failed</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{failedPaymentReconciliation?.summary.openCount ?? 0}</div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-white/90 px-3 py-2">
              <div className={`${opsUtilityLabelClass} text-slate-500`}>Balance At Risk</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{formatUsdFromCents(failedPaymentReconciliation?.summary.totalBalanceDueCents)}</div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-white/90 px-3 py-2">
              <div className={`${opsUtilityLabelClass} text-slate-500`}>Declined</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{failedPaymentReconciliation?.summary.declinedCount ?? 0}</div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-white/90 px-3 py-2">
              <div className={`${opsUtilityLabelClass} text-slate-500`}>Requires Action</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{failedPaymentReconciliation?.summary.requiresActionCount ?? 0}</div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-white/90 px-3 py-2">
              <div className={`${opsUtilityLabelClass} text-slate-500`}>Blocked Precondition</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{failedPaymentReconciliation?.summary.blockedPreconditionCount ?? 0}</div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-white/90 px-3 py-2">
              <div className={`${opsUtilityLabelClass} text-slate-500`}>Retry Eligible</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{failedPaymentReconciliation?.summary.retryEligibleCount ?? 0}</div>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-3 text-xs text-slate-700">
            <div>
              <span className="font-semibold text-slate-800">Oldest open:</span>{" "}
              {formatFailedPaymentOpenedAt(failedPaymentReconciliation?.summary.oldestOpenedAt)}
            </div>
            <div>
              <span className="font-semibold text-slate-800">Newest open:</span>{" "}
              {formatFailedPaymentOpenedAt(failedPaymentReconciliation?.summary.newestOpenedAt)}
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {(failedPaymentReconciliation?.items ?? []).slice(0, 5).map((item) => {
              const invoiceWorkspaceHref = item.jobId ? `/jobs/${item.jobId}/invoice` : null;
              return (
                <div key={item.attemptId} className="rounded-xl border border-rose-200 bg-white/90 px-3 py-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">
                        {item.customerDisplayName || "Customer"} · {item.invoiceNumber || item.invoiceId}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-600">
                        Balance due {formatUsdFromCents(item.balanceDueCents)} · {formatFailedPaymentCategoryLabel(item.failureCategory)} · {formatFailedPaymentRecommendedActionLabel(item.recommendedAction)}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {item.failureMessage || item.failureCode || item.attemptStatus}
                      </div>
                    </div>
                    {invoiceWorkspaceHref ? (
                      <Link href={invoiceWorkspaceHref} className={inlineSectionLinkClass}>Open invoice workspace</Link>
                    ) : (
                      <span className="text-xs text-slate-500">Invoice workspace unavailable</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {failedPaymentNoSideEffectContractSatisfied ? (
            <div className="mt-2.5 rounded-lg border border-rose-200/80 bg-white/90 px-3 py-2 text-xs text-slate-600">
              Read model verification: no Stripe calls and no payment/allocation/invoice/visit/next_due mutations.
            </div>
          ) : null}
        </section>
      ) : null}

      <section id="ops-workspace" className="rounded-3xl border border-slate-300/80 bg-white p-3.5 shadow-[0_20px_48px_-34px_rgba(15,23,42,0.42)] ring-1 ring-slate-200/70 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
          <div>
            <div className={`${opsUtilityLabelClass} text-slate-500`}>Queue Switcher</div>
            <div className="text-lg font-semibold tracking-tight text-slate-950">Operations workbench</div>
          </div>
          <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{activeOpsWorkCount} active jobs</div>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {workspaceQueues.map((queue) => {
            const isActive = queue.key === selectedWorkspaceQueue.key;
            return (
              <Link
                key={queue.key}
                href={`/ops${buildQueryString({
                  bucket: queue.key,
                  contractor: contractorScopeFilter ?? "",
                  q: q ?? "",
                  sort,
                  signal: "",
                })}#ops-workspace`}
                className={[
                  opsQueueChipClass,
                  isActive
                    ? "border-blue-700 bg-blue-700 text-white shadow-[0_10px_22px_-16px_rgba(37,99,235,0.45)]"
                    : "border-slate-300 bg-slate-50/90 text-slate-700 hover:bg-white",
                ].join(" ")}
              >
                <span className={isActive ? "text-slate-200" : "text-current/80"}>{queue.label}</span>
                <span className="font-semibold tabular-nums">{queue.count}</span>
              </Link>
            );
          })}
        </div>

        <article className="rounded-2xl border border-slate-300/80 bg-white p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.36)] ring-1 ring-slate-200/70 sm:p-3.5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
            <div>
              <div className={`${opsUtilityLabelClass} text-slate-500`}>Active Queue</div>
              <div className="text-[15px] font-semibold tracking-tight text-slate-950">
                {selectedWorkspaceQueue.label}
              </div>
              <div className="text-xs text-slate-600">{selectedWorkspaceQueue.count} jobs</div>
            </div>
            <Link href={selectedWorkspaceQueue.fullHref} className={inlineSectionLinkClass}>
              View on board
            </Link>
          </div>

          {selectedWorkspaceQueue.key === "updates" ? (
            <div className="space-y-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                <div className={`${opsUtilityLabelClass} text-slate-500`}>Contractor Updates</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{contractorUpdatesCount}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                <div className={`${opsUtilityLabelClass} text-slate-500`}>New Work Requests</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{newWorkRequestCount}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                <div className={`${opsUtilityLabelClass} text-slate-500`}>{formatEccRetestReadySignalLabel()}</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{retestReadyCount}</div>
              </div>
            </div>
          ) : selectedWorkspaceQueue.previewJobs.length === 0 ? (
            quietSectionEmptyState("No jobs in this queue right now.", "success")
          ) : (
            <div className="space-y-2">
              {selectedWorkspaceQueue.previewJobs.slice(0, 10).map((job: any) => (
                <div
                  key={String(job?.id ?? "")}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/jobs/${job.id}?tab=ops`}
                        className="text-[14px] font-semibold leading-5 text-blue-700 hover:text-blue-800 hover:underline"
                      >
                        {displayOpsCardTitle(job?.title)}
                      </Link>
                      <div className={`${opsSupportTextClass} mt-0.5 text-slate-700`}>
                        {formatPersonNamePart(customerNameOnly(job))} · {addressLine(job)}
                      </div>
                    </div>
                    <Link href={`/jobs/${job.id}?tab=ops`} className={inlineSectionLinkClass}>
                      Open Job
                    </Link>
                  </div>

                  <div className={`mt-1.5 grid gap-1 text-[12px] text-slate-600 sm:grid-cols-3 ${opsSupportTextClass}`}>
                    <div>
                      <span className="font-medium text-slate-500">Status/Reason:</span>{" "}
                      {workspaceStatusReason(job, selectedWorkspaceQueue.key)}
                    </div>
                    <div>
                      <span className="font-medium text-slate-500">Days Aging:</span>{" "}
                      {workspaceAgeTime(job, selectedWorkspaceQueue.key)}
                    </div>
                    <div>
                      <span className="font-medium text-slate-500">Assignment:</span>{" "}
                      {assignmentSummaryForJob(String(job?.id ?? ""))}
                    </div>
                    {workspaceContractorName(job) ? (
                      <div>
                        <span className="font-medium text-slate-500">Contractor:</span>{" "}
                        {workspaceContractorName(job)}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {(isHvacServiceMode || showTeamClockStatusCard) ? (
          <article className="rounded-2xl border border-slate-300/80 bg-white p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.36)] ring-1 ring-slate-200/70 sm:p-3.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className={`${opsUtilityLabelClass} text-slate-500`}>Coverage</div>
                <div className="text-[15px] font-semibold tracking-tight text-slate-950">Team coverage and workload</div>
              </div>
              <Link
                href={`/ops${buildQueryString({ bucket: "without_tech", contractor: contractorScopeFilter ?? "" })}#ops-workspace`}
                className={inlineSectionLinkClass}
              >
                Without tech: {scheduledWithoutTechSnapshot.count}
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                <div className={`${opsUtilityLabelClass} text-slate-500`}>In Progress</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{teamSnapshotInProgressCount}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                <div className={`${opsUtilityLabelClass} text-slate-500`}>Unassigned</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{teamSnapshotUnassignedCount}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                <div className={`${opsUtilityLabelClass} text-slate-500`}>Scheduled Today</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{teamSnapshotScheduledTodayCount}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                <div className={`${opsUtilityLabelClass} text-slate-500`}>Needs Closeout</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{teamSnapshotNeedsCloseoutCount}</div>
              </div>
            </div>

            <div className="mt-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Work by technician</div>
              {workByTechnicianRows.length === 0 ? (
                <div className="mt-1 text-xs text-slate-600">No assigned team work to summarize yet.</div>
              ) : (
                <div className="mt-1.5 space-y-1.5 text-xs text-slate-700">
                  {workByTechnicianRows.slice(0, 6).map((row) => (
                    <div key={row.name} className="flex items-center justify-between gap-3">
                      <span className="truncate font-medium text-slate-800">{row.name}</span>
                      <span className="shrink-0 text-slate-600">Open {row.open} / Scheduled {row.scheduled} / Waiting {row.waiting}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </article>
        ) : null}

        <article className="rounded-2xl border border-slate-300/80 bg-white p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.36)] ring-1 ring-slate-200/70 sm:p-3.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <div className={`${opsUtilityLabelClass} text-slate-500`}>Signals</div>
              <div className="text-[15px] font-semibold tracking-tight text-slate-950">Notifications and collaboration</div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/ops/connected-handoffs" className={inlineSectionLinkClass}>
                Connected Handoffs
              </Link>
              <Link href="/ops/handoffs" className={inlineSectionLinkClass}>
                Handoff Requests
              </Link>
              <Link href="/ops/notifications?state=unread" className={inlineSectionLinkClass}>
                Open notifications
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
              <div className={`${opsUtilityLabelClass} text-slate-500`}>Contractor Updates</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{contractorUpdatesCount}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
              <div className={`${opsUtilityLabelClass} text-slate-500`}>New Work Requests</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{newWorkRequestCount}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
              <div className={`${opsUtilityLabelClass} text-slate-500`}>{formatEccRetestReadySignalLabel()}</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{retestReadyCount}</div>
            </div>
          </div>

          {showTeamClockStatusCard ? (
            <div className="mt-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Team clock status</div>
                <Link href="/time-clock" className={inlineSectionLinkClass}>Time clock</Link>
              </div>
              {teamClockStatusRows.length === 0 ? (
                <div className="text-xs text-slate-600">No team members are clocked in right now.</div>
              ) : (
                <div className="space-y-1.5">
                  {teamClockStatusRows.slice(0, 6).map((row) => (
                    <div key={row.internalUserId} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-slate-900">{row.displayName}</div>
                        <div className="text-[11px] text-slate-600">Since {row.sinceAt}</div>
                      </div>
                      <span className="shrink-0 text-[11px] font-medium text-slate-700">{row.statusLabel} · {row.elapsed}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="mt-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Need the legacy all-in-one board or queue previews?
            <Link
              href={`/ops${buildQueryString({
                bucket,
                contractor: contractorScopeFilter ?? "",
                q: q ?? "",
                sort,
                signal,
                panel: "full_board",
              })}#ops-queues`}
              className="ml-1 font-semibold text-slate-700 underline-offset-2 hover:underline"
            >
              Open full operations board
            </Link>
          </div>
        </article>
      </section>
    </div>
  );
}

return (
  <div className="mx-auto max-w-[92rem] space-y-3 p-2.5 text-gray-900 sm:space-y-4 sm:p-4 lg:space-y-4.5 xl:px-6">
    {notice === "estimates_unavailable" ? (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-[0_14px_32px_-28px_rgba(15,23,42,0.24)]">
        <div className="font-semibold">Estimates are not enabled for this environment yet.</div>
        <div className="mt-1 text-amber-900/85">
          Internal estimate routes remain fail-closed here until the estimate migration is intentionally applied and the feature flag is explicitly enabled.
        </div>
      </section>
    ) : null}

    <section className="relative overflow-hidden rounded-3xl border border-slate-300/80 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(248,250,252,0.98)_48%,rgba(219,234,254,0.58))] p-4 shadow-[0_22px_54px_-34px_rgba(15,23,42,0.45)] ring-1 ring-slate-200/70 sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)] lg:items-center">
        <div className="min-w-0">
          <div className={`${opsUtilityLabelClass} truncate text-blue-700`}>{internalBusinessDisplayName}</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-slate-950 sm:text-[2rem]">
            Ops Command Center
          </h1>
          <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Dispatch, field progress, exceptions, and closeout work in one daily operating surface.
          </div>
          {showTeamClockStatusCard ? (
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/85 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Clocked In Now</span>
                <span className="rounded-md bg-white/90 px-1.5 py-0.5 tabular-nums text-emerald-900">{clockedInNowCount}</span>
              </div>
              {onLunchCount > 0 ? (
                <div className="inline-flex items-center rounded-xl border border-amber-200 bg-amber-50/85 px-2.5 py-1.5 text-xs font-semibold text-amber-800">
                  On Lunch {onLunchCount}
                </div>
              ) : null}
              <Link
                href="/time-clock"
                className="inline-flex items-center rounded-xl border border-slate-300/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_10px_20px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px]"
              >
                Open Time Clock
              </Link>
            </div>
          ) : null}
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/78 p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.36)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={`${opsUtilityLabelClass} text-slate-500`}>Live Workload</div>
              <div className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-slate-950 tabular-nums">
                {activeOpsWorkCount}
              </div>
              <div className="mt-1 text-xs leading-5 text-slate-600">active jobs in the current operating scope</div>
            </div>
            {internalBusinessLogoUrl ? (
              <img
                src={internalBusinessLogoUrl}
                alt=""
                className="h-10 max-h-12 w-12 max-w-14 rounded-lg bg-white/95 p-1 object-contain shadow-[0_12px_24px_-18px_rgba(15,23,42,0.45)]"
              />
            ) : (
              <Image src="/icon.png" alt={`${internalBusinessDisplayName} logo`} width={36} height={36} className="h-9 w-9 rounded-lg shadow-[0_12px_24px_-18px_rgba(15,23,42,0.45)]" />
            )}
          </div>
        </div>
      </div>
    </section>

    {showFailedPaymentAttentionCard ? (
      <section className="rounded-2xl border border-rose-200/90 bg-rose-50/65 p-3.5 shadow-[0_18px_34px_-30px_rgba(15,23,42,0.34)] ring-1 ring-rose-100/80 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className={`${opsUtilityLabelClass} text-rose-700`}>Financial Attention</div>
            <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-950">Failed payments need attention</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">
              Payment failures are not collected payments. Review the invoice workspace before retrying or contacting the customer.
            </p>
          </div>
          <Link href="/reports/failed-payments" className={inlineSectionLinkClass}>
            Open failed-payment queue
          </Link>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-rose-200 bg-white/90 px-3 py-2">
            <div className={`${opsUtilityLabelClass} text-slate-500`}>Open Failed</div>
            <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{failedPaymentReconciliation?.summary.openCount ?? 0}</div>
          </div>
          <div className="rounded-xl border border-rose-200 bg-white/90 px-3 py-2">
            <div className={`${opsUtilityLabelClass} text-slate-500`}>Balance At Risk</div>
            <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{formatUsdFromCents(failedPaymentReconciliation?.summary.totalBalanceDueCents)}</div>
          </div>
          <div className="rounded-xl border border-rose-200 bg-white/90 px-3 py-2">
            <div className={`${opsUtilityLabelClass} text-slate-500`}>Declined</div>
            <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{failedPaymentReconciliation?.summary.declinedCount ?? 0}</div>
          </div>
          <div className="rounded-xl border border-rose-200 bg-white/90 px-3 py-2">
            <div className={`${opsUtilityLabelClass} text-slate-500`}>Requires Action</div>
            <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{failedPaymentReconciliation?.summary.requiresActionCount ?? 0}</div>
          </div>
          <div className="rounded-xl border border-rose-200 bg-white/90 px-3 py-2">
            <div className={`${opsUtilityLabelClass} text-slate-500`}>Blocked Precondition</div>
            <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{failedPaymentReconciliation?.summary.blockedPreconditionCount ?? 0}</div>
          </div>
          <div className="rounded-xl border border-rose-200 bg-white/90 px-3 py-2">
            <div className={`${opsUtilityLabelClass} text-slate-500`}>Retry Eligible</div>
            <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{failedPaymentReconciliation?.summary.retryEligibleCount ?? 0}</div>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-3 text-xs text-slate-700">
          <div>
            <span className="font-semibold text-slate-800">Oldest open:</span>{" "}
            {formatFailedPaymentOpenedAt(failedPaymentReconciliation?.summary.oldestOpenedAt)}
          </div>
          <div>
            <span className="font-semibold text-slate-800">Newest open:</span>{" "}
            {formatFailedPaymentOpenedAt(failedPaymentReconciliation?.summary.newestOpenedAt)}
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {(failedPaymentReconciliation?.items ?? []).slice(0, 5).map((item) => {
            const invoiceWorkspaceHref = item.jobId ? `/jobs/${item.jobId}/invoice` : null;
            return (
              <div key={item.attemptId} className="rounded-xl border border-rose-200 bg-white/90 px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">
                      {item.customerDisplayName || "Customer"} · {item.invoiceNumber || item.invoiceId}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-600">
                      Balance due {formatUsdFromCents(item.balanceDueCents)} · {formatFailedPaymentCategoryLabel(item.failureCategory)} · {formatFailedPaymentRecommendedActionLabel(item.recommendedAction)}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {item.failureMessage || item.failureCode || item.attemptStatus}
                    </div>
                  </div>
                  {invoiceWorkspaceHref ? (
                    <Link href={invoiceWorkspaceHref} className={inlineSectionLinkClass}>Open invoice workspace</Link>
                  ) : (
                    <span className="text-xs text-slate-500">Invoice workspace unavailable</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {failedPaymentNoSideEffectContractSatisfied ? (
          <div className="mt-2.5 rounded-lg border border-rose-200/80 bg-white/90 px-3 py-2 text-xs text-slate-600">
            Read model verification: no Stripe calls and no payment/allocation/invoice/visit/next_due mutations.
          </div>
        ) : null}
      </section>
    ) : null}

    {maintenanceAgreementsEnabled && servicePlanSummary ? (
      <section className="rounded-2xl border border-slate-300/80 bg-white p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.38)] ring-1 ring-slate-200/70 sm:p-3.5">
        <div className="mb-2.5 flex items-end justify-between gap-2 border-b border-slate-200/80 pb-2.5">
          <div>
            <div className={`${opsUtilityLabelClass} text-slate-500`}>Service Plans</div>
            <div className="text-[15px] font-semibold tracking-tight text-slate-950">Service Plans</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-[11px] text-slate-500">As of {servicePlanSummary.as_of_date}</div>
            <Link href="/service-plans" className={sectionActionLinkClass}>
              View Service Plans
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <div className={servicePlanSummaryCountClass}>
            <div className={`${opsUtilityLabelClass} text-slate-500`}>Active Plans</div>
            <div className="mt-1 text-base font-semibold text-slate-900 tabular-nums">{servicePlanSummary.status_counts.active}</div>
          </div>
          <div className={servicePlanSummaryCountClass}>
            <div className={`${opsUtilityLabelClass} text-rose-700`}>Overdue</div>
            <div className="mt-1 text-base font-semibold text-rose-700 tabular-nums">{servicePlanSummary.due_counts.overdue}</div>
          </div>
          <div className={servicePlanSummaryCountClass}>
            <div className={`${opsUtilityLabelClass} text-amber-700`}>Due Today</div>
            <div className="mt-1 text-base font-semibold text-amber-700 tabular-nums">{servicePlanSummary.due_counts.due_today}</div>
          </div>
          <div className={servicePlanSummaryCountClass}>
            <div className={`${opsUtilityLabelClass} text-blue-700`}>Due in 1-7 Days</div>
            <div className="mt-1 text-base font-semibold text-blue-700 tabular-nums">{servicePlanSummary.due_counts.due_in_next_7_days}</div>
          </div>
          <div className={servicePlanSummaryCountClass}>
            <div className={`${opsUtilityLabelClass} text-cyan-700`}>Due in 8-30 Days</div>
            <div className="mt-1 text-base font-semibold text-cyan-700 tabular-nums">{dueIn8To30Days}</div>
          </div>
          <div className={servicePlanSummaryCountClass}>
            <div className={`${opsUtilityLabelClass} text-slate-600`}>Not Scheduled</div>
            <div className="mt-1 text-base font-semibold text-slate-700 tabular-nums">{servicePlanSummary.due_counts.not_scheduled_active}</div>
          </div>
        </div>
      </section>
    ) : null}

    <section className="rounded-3xl border border-slate-300/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] p-3.5 shadow-[0_20px_48px_-34px_rgba(15,23,42,0.42)] ring-1 ring-slate-200/70 sm:p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(24rem,0.75fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className={`${opsUtilityLabelClass} text-slate-500`}>Workflow Health</div>
              <div className="text-lg font-semibold tracking-tight text-slate-950">Workflow Health</div>
            </div>
            <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              {operationalFlowTotal} jobs in flow
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
            <div className="flex h-3 w-full bg-slate-100" aria-hidden="true">
              {operationalFlowCards.map((card) => (
                <div
                  key={card.key}
                  className={`${card.tone} ${card.count === 0 ? "opacity-25" : ""}`}
                  style={{ flexGrow: operationalFlowTotal > 0 ? card.count : 1, flexBasis: 0 }}
                />
              ))}
            </div>
            <div className="grid gap-px bg-slate-200 sm:grid-cols-4">
              {operationalFlowCards.map((card) => (
                <Link
                  key={card.key}
                  href={card.href}
                  className="group bg-white px-3 py-3 transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${card.tone}`} aria-hidden="true" />
                    <span className={`${opsUtilityLabelClass} text-slate-500 group-hover:text-slate-700`}>{card.label}</span>
                  </div>
                  <div className="mt-1.5 text-2xl font-semibold tracking-[-0.03em] text-slate-950 tabular-nums">{card.count}</div>
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white/88 px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <div className={`${opsUtilityLabelClass} text-slate-500`}>Scheduled Visits</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{counts.get("scheduled") ?? 0}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/88 px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <div className={`${opsUtilityLabelClass} text-slate-500`}>Need to Schedule</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{counts.get("need_to_schedule") ?? 0}</div>
            </div>
            <div className={`rounded-xl border px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${exceptionCount > 0 ? "border-rose-200 bg-rose-50/70" : "border-slate-200 bg-white/88"}`}>
              <div className={`${opsUtilityLabelClass} ${exceptionCount > 0 ? "text-rose-700" : "text-slate-500"}`}>Exceptions</div>
              <div className={`mt-1 text-lg font-semibold tabular-nums ${exceptionCount > 0 ? "text-rose-700" : "text-slate-900"}`}>{exceptionCount}</div>
            </div>
          </div>
        </div>

        {isHvacServiceMode || showTeamClockStatusCard ? (
          <div className="space-y-3">
          {isHvacServiceMode ? (
          <div className="rounded-2xl border border-slate-200/90 bg-white/92 p-3.5 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.35)]">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className={`${opsUtilityLabelClass} text-slate-500`}>Team Work Snapshot</div>
                <div className="mt-0.5 text-base font-semibold tracking-tight text-slate-950">Field coverage</div>
              </div>
              <div className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${scheduledWithoutTechSnapshot.count === 0 ? "border-slate-200 bg-slate-50 text-slate-600" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                {scheduledWithoutTechSnapshot.count} without tech
              </div>
            </div>

            {teamSnapshotTotalCount === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                No active team work to summarize yet.
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {teamSnapshotCards.slice(0, 4).map((card) => (
                  <div key={card.key} className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{card.label}</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{card.count}</div>
                  </div>
                ))}

                {teamSnapshotCards.slice(4).map((card) => (
                  <div key={card.key} className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 sm:col-span-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{card.label}</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{card.count}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Work by Technician</div>
              {workByTechnicianRows.length === 0 ? (
                <div className="mt-1 text-xs text-slate-600">No assigned team work to summarize yet.</div>
              ) : (
                <div className="mt-1.5 space-y-1.5 text-xs text-slate-700">
                  {workByTechnicianRows.slice(0, 5).map((row) => (
                    <div key={row.name} className="flex items-center justify-between gap-3">
                      <span className="truncate font-medium text-slate-800">{row.name}</span>
                      <span className="shrink-0 text-slate-600">
                        Open {row.open} / Scheduled {row.scheduled} / Waiting {row.waiting}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {contractor ? (
              <div className="mt-2 text-[11px] text-slate-600">
                Contractor filtering is de-emphasized in this mode.
                <Link
                  href={`/ops${buildQueryString({ bucket, q: q ?? "", sort, signal })}`}
                  className="ml-1 font-semibold text-slate-700 underline-offset-2 hover:underline"
                >
                  Clear contractor filter
                </Link>
              </div>
            ) : null}
          </div>
          ) : null}

          {showTeamClockStatusCard ? (
            <div className="rounded-2xl border border-slate-200/90 bg-white/92 p-3.5 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.35)]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className={`${opsUtilityLabelClass} text-slate-500`}>Operations</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-base font-semibold tracking-tight text-slate-950">
                    <Clock3 className="h-4 w-4 text-slate-500" aria-hidden="true" />
                    <span>Team Clock Status</span>
                  </div>
                </div>
                <Link
                  href="/time-clock"
                  className="inline-flex items-center rounded-lg border border-slate-300/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_10px_20px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px]"
                >
                  Open Time Clock
                </Link>
              </div>

              {teamClockStatusRows.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  No team members are clocked in right now.
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {teamClockStatusRows.map((row) => (
                    <div
                      key={row.internalUserId}
                      className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">{row.displayName}</div>
                          <div className="mt-0.5 text-xs text-slate-600">Since {row.sinceAt}</div>
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                            row.statusLabel === "On Lunch"
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : "border-emerald-200 bg-emerald-50 text-emerald-800"
                          }`}
                        >
                          {row.statusLabel}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">Session {row.elapsed}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          </div>
        ) : null}
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
      <div className={`grid grid-cols-1 gap-2.5 ${showContractorFilterInPrimary ? "lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]" : "lg:grid-cols-1"}`}>
        {showContractorFilterInPrimary ? (
          <ContractorFilter contractors={contractors ?? []} selectedId={contractorScopeFilter ?? ""} />
        ) : null}
        <div className="grid gap-1">
          <label className={`${opsUtilityLabelClass} text-slate-500`}>Sort</label>
          <form action="/ops" method="get" className="flex flex-col gap-2 sm:flex-row">
            <input type="hidden" name="bucket" value={bucket} />
            <input type="hidden" name="contractor" value={contractorScopeFilter ?? ""} />
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
          <input type="hidden" name="contractor" value={contractorScopeFilter ?? ""} />
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

    <section className="rounded-3xl border border-slate-300/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))] p-3.5 shadow-[0_22px_52px_-36px_rgba(15,23,42,0.45)] ring-1 ring-slate-200/70 sm:p-4">
      <div className="mb-3 flex flex-col gap-2 border-b border-slate-200/80 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className={`${opsUtilityLabelClass} text-amber-700`}>Attention Board</div>
          <div className="text-lg font-semibold tracking-tight text-slate-950">Overdue / Exceptions</div>
          <div className="mt-1 text-[12.5px] leading-5 text-slate-600 sm:text-[13px]">
            Jobs that need a decision, follow-up, or closeout movement.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sectionCountPill(
            sortedExceptionJobs.length,
            sortedExceptionJobs.length > 0 ? "danger" : "neutral"
          )}
          {sortedExceptionJobs.length > EXCEPTION_PREVIEW_LIMIT ? (
            <Link
              href={`/ops${buildQueryString({
                bucket,
                contractor: contractorScopeFilter ?? "",
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
        quietSectionEmptyState("No exception jobs with the current filters.", "success")
      ) : (
        <div className="grid gap-2 xl:grid-cols-2">
          {exceptionVisibleJobs.map((j: any) => {
            const meta = exceptionMetaById.get(String(j?.id ?? ""));
            const note = meta ? `${meta.reason} | ${meta.aging}` : "Exception";
            return compactRow(j, true, note, true);
          })}
        </div>
      )}
    </section>

    <section className="rounded-3xl border border-slate-300/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] p-3.5 shadow-[0_20px_48px_-34px_rgba(15,23,42,0.42)] ring-1 ring-slate-200/70 sm:p-4">
      <div className="mb-3 flex flex-col gap-2 border-b border-slate-200/80 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className={`${opsUtilityLabelClass} text-slate-500`}>Queue Shortcuts</div>
          <div className="text-lg font-semibold tracking-tight text-slate-950">Queue Shortcuts</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <div id="field-work" className={`rounded-2xl border ${prioritizedFieldWorkJobs.length === 0 ? "border-emerald-200/80 bg-emerald-50/50 p-3" : "border-slate-300/80 bg-white p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.38)] ring-1 ring-slate-200/70"}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className={`${opsUtilityLabelClass} text-emerald-700`}>Today / Active</div>
            <div className="text-[15px] font-semibold tracking-tight text-slate-950">Field Work</div>
          </div>
          <div className="flex items-center gap-3">
            {sectionCountPill(prioritizedFieldWorkJobs.length)}
            {prioritizedFieldWorkJobs.length > PREVIEW_LIMIT ? (
              <Link
                href={`/ops${buildQueryString({
                  bucket,
                  contractor: contractorScopeFilter ?? "",
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

      <div className={`rounded-2xl border ${callListVisibleJobs.length === 0 ? "border-slate-300/75 bg-slate-50/85 p-3" : "border-slate-300/80 bg-white p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.38)] ring-1 ring-slate-200/70"}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className={`${opsUtilityLabelClass} text-blue-700`}>Planning</div>
            <div className="text-[15px] font-semibold tracking-tight text-slate-950">Unscheduled Work</div>
          </div>
          <div className="flex items-center gap-3">
            {sectionCountPill(prioritizedCallListJobs.length)}
            {prioritizedCallListJobs.length > PREVIEW_LIMIT ? (
              <Link
                href={`/ops${buildQueryString({
                  bucket,
                  contractor: contractorScopeFilter ?? "",
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
            <Link
              href={`/ops/call-list${contractorScopeFilter ? `?contractor=${encodeURIComponent(contractorScopeFilter)}` : ""}`}
              className={inlineSectionLinkClass}
            >
              View Unscheduled Work
            </Link>
          </div>
        </div>
        {callListVisibleJobs.length === 0 ? (
          quietSectionEmptyState("No unscheduled work right now.")
        ) : (
          <div className="space-y-2">{callListVisibleJobs.map((j: any) => compactRow(j, false, undefined, true))}</div>
        )}
      </div>

      <div className={`rounded-2xl border ${closeoutVisibleJobs.length === 0 ? "border-slate-300/75 bg-slate-50/85 p-3" : "border-slate-300/80 bg-white p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.38)] ring-1 ring-slate-200/70"}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className={`${opsUtilityLabelClass} text-violet-700`}>Closeout</div>
            <div className="text-[15px] font-semibold tracking-tight text-slate-950">Closeout Work Queue</div>
            {showFieldPaymentVerificationChip ? (
              <div className="mt-1">
                <Link
                  href={`/ops/closeout-queue${buildQueryString({
                    contractor: contractorScopeFilter ?? "",
                    filter: "confirm_payment",
                  })}`}
                  className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                >
                  Confirm Payment: {fieldPaymentReconciliationAttention?.summary.openCount ?? 0}
                </Link>
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            {sectionCountPill(prioritizedCloseoutJobs.length)}
            {prioritizedCloseoutJobs.length > PREVIEW_LIMIT ? (
              <Link
                href={`/ops${buildQueryString({
                  bucket: "closeout",
                  contractor: contractorScopeFilter ?? "",
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
            <Link
              href={`/ops/closeout-queue${contractorScopeFilter ? `?contractor=${encodeURIComponent(contractorScopeFilter)}` : ""}`}
              className={inlineSectionLinkClass}
            >
              View Closeout Queue
            </Link>
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
      </div>
    </section>

    {showOperationalNotificationAwareness ? (
      <section id="system-alerts" className={`rounded-2xl border p-3 shadow-[0_14px_32px_-28px_rgba(15,23,42,0.35)] sm:p-3.5 ${hasActiveSystemAlerts || signal ? "border-slate-300/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))]" : "border-slate-300/75 bg-slate-50/75"}`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className={`${opsUtilityLabelClass} text-blue-700`}>{isHvacServiceMode ? "Collaboration" : "Contractor-driven"}</div>
              <div className="text-[15px] font-semibold tracking-tight text-slate-950">{isHvacServiceMode ? "Collaboration Signals" : "Contractor Signals"}</div>
            <div className="mt-1 max-w-2xl text-[12.5px] leading-5 text-slate-600 sm:text-[13px]">
              Signals route to Notifications for acknowledgment. Action happens in the queues below.
            </div>
          </div>
          <Link
            href="/ops/notifications?state=unread"
            className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            {isHvacServiceMode ? "View alerts" : "Review notifications"}
          </Link>
        </div>
        {visibleSignalCards.length === 0 && !signal
          ? quietSectionEmptyState(isHvacServiceMode ? "No active collaboration alerts right now." : "No active contractor-driven alerts right now.")
          : (
            <div className="flex flex-wrap gap-1.5">
              {visibleSignalCards.map((card) => {
                const isActive = signal === card.key;
                const cardHref = card.key === "contractor_updates"
                  ? "/ops/notifications?view=contractor_updates&state=unread"
                  : card.key === "new_work_requests"
                  ? "/ops/notifications?view=new_jobs&state=unread"
                  : `/ops${buildQueryString({
                      bucket: card.bucket,
                      contractor: contractorScopeFilter ?? "",
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
                      card.key !== "contractor_updates" && card.key !== "new_work_requests" && isActive
                        ? "border-blue-700 bg-blue-700 text-white shadow-[0_10px_22px_-16px_rgba(37,99,235,0.45)]"
                        : `${signalToneClass(card.key)} hover:bg-white`,
                    ].join(" ")}
                    title={
                      card.key === "contractor_updates"
                        ? "Open unread contractor-driven notifications"
                        : card.key === "new_work_requests"
                        ? "Open unread new work-request notifications"
                        : undefined
                    }
                  >
                    <span>{card.label}</span>
                    <span className={`font-semibold tabular-nums ${card.key !== "contractor_updates" && card.key !== "new_work_requests" && isActive ? "text-slate-200" : "text-current/80"}`}>{card.count}</span>
                  </Link>
                );
              })}
            </div>
          )}
      </section>
    ) : null}

    <OperationalReportingSection
      reporting={operationalReporting}
      scopeLabel={isHvacServiceMode ? "All team work" : selectedContractorName ? `Filtered: ${selectedContractorName}` : "All contractors"}
      contractorId={contractorScopeFilter}
      sort={sort}
    />

    <section id="ops-queues" className="rounded-2xl border border-slate-300/80 bg-slate-100/70 p-3 shadow-[0_18px_42px_-32px_rgba(15,23,42,0.38)] sm:p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className={`${opsUtilityLabelClass} text-slate-500`}>Queue Shortcuts</div>
          <div className="text-[15px] font-semibold tracking-tight text-slate-950">Focused Queue Preview</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-1">
        <div className="rounded-2xl border border-slate-300/80 bg-white/88 p-3 shadow-[0_14px_32px_-28px_rgba(15,23,42,0.32)]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[15px] font-semibold tracking-tight text-slate-950">Workflow Queues</div>
            <Link
              href={`/ops${buildQueryString({
                bucket: "workflow_all",
                contractor: contractorScopeFilter ?? "",
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
                    contractor: contractorScopeFilter ?? "",
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
            {activeQueueLabel}
            {activeSignalLabel ? ` — ${activeSignalLabel}` : ""}
          </div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500 sm:text-[11px]">{sortedBucketJobs.length} jobs</div>
        </div>

        {sortedBucketJobs.length === 0 ? (
          quietSectionEmptyState("No jobs in this queue with current filters.")
        ) : (
          <div className="space-y-2">
            {sortedBucketJobs.slice(0, 12).map((j: any) => {
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
