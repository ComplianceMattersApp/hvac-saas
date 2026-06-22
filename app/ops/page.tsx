// app/ops/page
import Link from "next/link";
import ContractorFilter from "./_components/ContractorFilter";
import QueueCard from "@/components/ops/QueueCard";
import QueueCardOpenAndAct from "@/components/ops/QueueCardOpenAndAct";
import { redirect } from "next/navigation";
import { updateJobScheduleFromForm } from "@/lib/actions";
import { logCustomerContactAttemptFromForm } from "@/lib/actions/job-contact-actions";
import { markInvoiceCompleteFromForm } from "@/lib/actions/job-ops-actions";
import {
  rejectFieldPaymentCollectionReportFromForm,
  verifyFieldPaymentCollectionReportFromForm,
} from "@/lib/actions/internal-invoice-payment-actions";
import { createAdminClient } from "@/lib/supabase/server";
import { getRequestActorContext } from "@/lib/auth/request-actor-context";
import {
  landingPathForDualContextAccess,
  resolveDualContextAccess,
} from "@/lib/auth/dual-context-access";
import { canViewFinancialRegister } from "@/lib/auth/financial-access";
import { resolveFieldBillingCapabilities } from "@/lib/auth/field-billing-access";
import { loadFieldBillingExplicitCapabilitiesForUser } from "@/lib/auth/internal-user-access-capabilities";
import { listFieldPaymentCollectionReportsForReconciliation } from "@/lib/business/field-payment-reconciliation-read-model";

import {
  formatBusinessDateUS,
  displayWindowLA,
  startOfTodayUtcIsoLA,
  startOfTomorrowUtcIsoLA,
} from "@/lib/utils/schedule-la";
import { formatCityNamePart, formatPersonNamePart } from "@/lib/utils/identity-display";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import { getCloseoutNeeds, getCloseoutQueueNextStepLabel } from "@/lib/utils/closeout";
import { extractFailureReasons } from "@/lib/portal/resolveContractorIssues";
import { getActiveJobAssignmentDisplayMap, resolveUserDisplayMap } from "@/lib/staffing/human-layer";
import { resolveOperationalTenantIdentity } from "@/lib/email/operational-tenant-branding";
import { buildBillingTruthCloseoutProjectionMap } from "@/lib/business/job-billing-state";
import {
  listInternalContractorUpdateAwareness,
  listInternalNewWorkRequestAwareness,
} from "@/lib/actions/notification-read-actions";
import {
  acceptInternalPermitRequest,
  createJobFromPermitRequestAndMarkCreated,
  createInternalManualPermitRequest,
  holdInternalPermitRequest,
  markInternalPermitCreated,
  resumeInternalPermitRequest,
  updateInternalPermitRequestIntake,
} from "@/lib/actions/internal-permit-request-actions";
import {
  resolveLifecycleDaysAgingLabel,
} from "@/lib/utils/lifecycle-aging";
import {
  canShowExternalInvoiceSentAction,
  listCloseoutQueueJobs,
} from "@/lib/ops/closeout-queue";
import { resolveProductModeForAccountOwnerId, type ProductMode } from "@/lib/business/product-mode-defaults";
import { listTeamClockStatusPreview } from "@/lib/time-clock/read-model";
import {
  buildLatestCustomerAttemptByJob,
  resolveRecentAttemptDisplay,
} from "@/lib/ops/recent-attempt-display";
import { buildScheduledWithoutTechSnapshot } from "@/lib/ops/scheduled-without-tech-snapshot";
import {
  OPS_BOARD_SORT_OPTIONS,
  normalizeOpsBoardSort,
  sortOpsBoardRows,
} from "@/lib/ops/ops-board-sorting";
import {
  isContractorIntakeQueueAvailableForProductMode,
  resolveEffectiveOpsBoardBucketFilter,
  resolveVisibleOpsWorkspaceQueueKeys,
  type OpsBoardFilterBucket,
} from "@/lib/ops/ops-workspace-queues";
import {
  buildOpsBoardReasonOptions,
  filterOpsBoardRowsByReason,
  getOpsBoardVisibleReason,
  normalizeOpsBoardReason,
  type OpsBoardVisibleReason,
} from "@/lib/ops/ops-board-reasons";
import {
  formatAssignmentSummaryForJob,
  formatFailedEccQueueReasonFromRun,
  getOpsQueueCardStatusReason,
} from "@/lib/ops/focused-queues";
import {
  listActivePermitRequestQueueRowsIfAvailable,
  type PermitRequestQueueRow,
} from "@/lib/permits/permit-requests-read-model";
import {
  CONTRACTOR_INTAKE_QUEUE_PAGE_LIMIT,
  countPendingContractorIntakeQueueRows,
  listPendingContractorIntakeQueueRows,
  type ContractorIntakeQueueRow,
} from "@/lib/ops/contractor-intake-queue";
import { listInternalPermitRequestAttachmentsForAccount } from "@/lib/permits/permit-request-attachments-read-model";
import { isPermitWorkflowEnabledForAccountOwner } from "@/lib/permits/permit-workflow-gate";


type PermitJobCustomerOption = {
  id: string;
  label: string;
};

type PermitJobLocationOption = {
  id: string;
  customerId: string;
  label: string;
};

function normalizeOpsBoardFilterBucket(value: unknown): OpsBoardFilterBucket {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "need_to_schedule") return "pending";
  if (normalized === "scheduled") return "field_work";
  if (normalized === "intake") return "contractor_intake";
  if (
    normalized === "pending" ||
    normalized === "field_work" ||
    normalized === "waiting" ||
    normalized === "exceptions" ||
    normalized === "closeout" ||
    normalized === "contractor_intake" ||
    normalized === "permits"
  ) {
    return normalized;
  }
  return "all";
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
  create?: string;
  contractor?: string;
  notice?: string;
  q?: string;
  sort?: string;
  reason?: string;
  signal?: string;
  permit_error?: string;
}>;
}) {
  
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const boardBucketFilter = normalizeOpsBoardFilterBucket(sp.bucket);
  const activeBoardBucketFilter = boardBucketFilter === "all" ? "pending" : boardBucketFilter;
  const contractor = (sp.contractor ?? "").trim() || null;
  const notice = (sp.notice ?? "").trim().toLowerCase();
  const q = (sp.q ?? "").trim() || null;
  const sort = (sp.sort ?? "").trim() || "default";
  const boardSort = normalizeOpsBoardSort(sp.sort);
  const boardReasonFilter = normalizeOpsBoardReason(sp.reason);
  const permitActionError = (sp.permit_error ?? "").trim();
  const createIntent = (sp.create ?? "").trim().toLowerCase();

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
  const admin = createAdminClient();
  if (opsTimingEnabled) console.log(`[ops:requestActorContext] ${Date.now() - _t_requestActorContext}ms`);

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
  const contractorIntakeQueueAvailable = isContractorIntakeQueueAvailableForProductMode(productMode);
  const contractorScopeFilter = isHvacServiceMode ? null : contractor;
  const permitWorkflowEnabled = isPermitWorkflowEnabledForAccountOwner(internalUser.account_owner_user_id);

  const _t_businessIdentity = opsTimingEnabled ? Date.now() : 0;
  const operationalTenantIdentityPromise = resolveOperationalTenantIdentity({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  }).then((result) => {
    if (opsTimingEnabled) console.log(`[ops:businessIdentity] ${Date.now() - _t_businessIdentity}ms`);
    return result;
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

  function toEpochMs(value?: string | null) {
    const t = new Date(String(value ?? "")).getTime();
    return Number.isFinite(t) ? t : 0;
  }

  function normalizeFailureLine(line: string, testTypeRaw: string): string {
    const text = String(line ?? "").trim();
    return formatFailedEccQueueReasonFromRun({ test_type: testTypeRaw }) || (text ? "Correction Required" : "");
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

  function failedStatusSinceByJob(jobId: string): string | null {
    const run = latestFailedRunByJob.get(jobId);
    if (!run) return null;

    const createdAt = String((run as any)?.created_at ?? "").trim();
    return createdAt || null;
  }

  function timeToTimeInput(value?: string | null) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    const hhmm = /^\d{2}:\d{2}/.test(raw) ? raw.slice(0, 5) : "";
    return hhmm || "";
  }

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

  function workspaceReasonInput(job: any) {
    const jobId = String(job?.id ?? "").trim();
    return {
      ...job,
      ops_board_failure_detail: jobId ? primaryFailureReasonByJob.get(jobId) ?? null : null,
    };
  }

  function workspaceVisibleReasonDisplay(job: any, queueKey: string): OpsBoardVisibleReason {
    return getOpsBoardVisibleReason(workspaceReasonInput(job), () => wsStatusReason(job, queueKey), { queueKey });
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

    const workspaceSelect =
      "id, title, status, job_type, ops_status, scheduled_date, window_start, window_end, city, job_address, customer_first_name, customer_last_name, customer_phone, pending_info_reason, on_hold_reason, permit_number, jurisdiction, permit_date, field_complete, field_complete_at, invoice_complete, billing_disposition, certs_complete, contractor_id, contractors(name), created_at";
    const scheduledSnapshotSelect =
      "id, status, ops_status, scheduled_date, window_start";

    function closeoutProjectionInputs(rows: any[]) {
      return (rows ?? []).map((job: any) => ({
        id: String(job?.id ?? "").trim(),
        field_complete: job?.field_complete,
        job_type: job?.job_type,
        ops_status: job?.ops_status,
        pending_info_reason: job?.pending_info_reason,
        on_hold_reason: job?.on_hold_reason,
        permit_number: job?.permit_number,
        invoice_complete: job?.invoice_complete,
        billing_disposition: job?.billing_disposition,
        certs_complete: job?.certs_complete,
      }));
    }

    function mergeRowsById(...rowSets: any[][]) {
      const rowsById = new Map<string, any>();
      for (const row of rowSets.flat()) {
        const id = String(row?.id ?? "").trim();
        if (id && !rowsById.has(id)) rowsById.set(id, row);
      }
      return Array.from(rowsById.values());
    }

    const _t_workspaceCounts = opsTimingEnabled ? Date.now() : 0;

    function opsStatusCountQuery(opsStatus: string, options?: { requireOpenStatus?: boolean }) {
      let q = supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .eq("ops_status", opsStatus);

      if (options?.requireOpenStatus) q = q.eq("status", "open");
      if (contractorScopeFilter) q = q.eq("contractor_id", contractorScopeFilter);
      return q;
    }

    const needToScheduleCountQ = opsStatusCountQuery("need_to_schedule", { requireOpenStatus: true });
    const pendingInfoCountQ = opsStatusCountQuery("pending_info");
    const onHoldCountQ = opsStatusCountQuery("on_hold");
    const waitingStatusCountQ = opsStatusCountQuery("waiting");
    const pendingOfficeReviewCountQ = opsStatusCountQuery("pending_office_review");
    const failedCountQ = opsStatusCountQuery("failed");
    const retestNeededCountQ = opsStatusCountQuery("retest_needed");
    const problemCountQ = opsStatusCountQuery("problem");

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
      .order("window_start", { ascending: true })
      .limit(50);

    if (contractorScopeFilter) scheduledOpenRowsQ = scheduledOpenRowsQ.eq("contractor_id", contractorScopeFilter);

    let closeoutCountRowsQ = supabase
      .from("jobs")
      .select(workspaceSelect)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .eq("field_complete", true)
      .in("ops_status", ["invoice_required", "paperwork_required"])
      .order("created_at", { ascending: false })
      .limit(500);

    if (contractorScopeFilter) closeoutCountRowsQ = closeoutCountRowsQ.eq("contractor_id", contractorScopeFilter);

    let closeoutPermitExceptionRowsQ = supabase
      .from("jobs")
      .select(workspaceSelect)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .eq("field_complete", true)
      .in("ops_status", ["pending_info", "on_hold"])
      .or("pending_info_reason.ilike.%permit%,on_hold_reason.ilike.%permit%")
      .order("created_at", { ascending: false })
      .limit(50);

    if (contractorScopeFilter) closeoutPermitExceptionRowsQ = closeoutPermitExceptionRowsQ.eq("contractor_id", contractorScopeFilter);

    const [
      needToScheduleCountRes,
      pendingInfoCountRes,
      onHoldCountRes,
      waitingStatusCountRes,
      pendingOfficeReviewCountRes,
      failedCountRes,
      retestNeededCountRes,
      problemCountRes,
      fieldWorkCountRes,
      scheduledOpenRowsRes,
      closeoutCountRowsRes,
      closeoutPermitExceptionRowsRes,
      contractorIntakeCount,
      unreadContractorUpdates,
      unreadNewWorkRequests,
      activePermitRequestsResult,
    ] = await Promise.all([
      needToScheduleCountQ,
      pendingInfoCountQ,
      onHoldCountQ,
      waitingStatusCountQ,
      pendingOfficeReviewCountQ,
      failedCountQ,
      retestNeededCountQ,
      problemCountQ,
      fieldWorkCountQ,
      scheduledOpenRowsQ,
      closeoutCountRowsQ,
      closeoutPermitExceptionRowsQ,
      contractorIntakeQueueAvailable
        ? countPendingContractorIntakeQueueRows({
            supabase: admin,
            accountOwnerUserId: internalUser.account_owner_user_id,
            contractorId: contractorScopeFilter,
          })
        : Promise.resolve(0),
      listInternalContractorUpdateAwareness({ limit: 100, onlyUnread: true }),
      listInternalNewWorkRequestAwareness({ limit: 100, onlyUnread: true }),
      permitWorkflowEnabled
        ? listActivePermitRequestQueueRowsIfAvailable({
            supabase: supabase as any,
            accountOwnerUserId: internalUser.account_owner_user_id,
            contractorId: contractorScopeFilter,
            limit: 50,
          })
        : Promise.resolve({ schemaAvailable: true, rows: [] as PermitRequestQueueRow[] }),
    ]);

    if (needToScheduleCountRes.error) throw needToScheduleCountRes.error;
    if (pendingInfoCountRes.error) throw pendingInfoCountRes.error;
    if (onHoldCountRes.error) throw onHoldCountRes.error;
    if (waitingStatusCountRes.error) throw waitingStatusCountRes.error;
    if (pendingOfficeReviewCountRes.error) throw pendingOfficeReviewCountRes.error;
    if (failedCountRes.error) throw failedCountRes.error;
    if (retestNeededCountRes.error) throw retestNeededCountRes.error;
    if (problemCountRes.error) throw problemCountRes.error;
    if (fieldWorkCountRes.error) throw fieldWorkCountRes.error;
    if (scheduledOpenRowsRes.error) throw scheduledOpenRowsRes.error;
    if (closeoutCountRowsRes.error) throw closeoutCountRowsRes.error;
    if (closeoutPermitExceptionRowsRes.error) throw closeoutPermitExceptionRowsRes.error;

    const countsWs = new Map<string, number>([
      ["need_to_schedule", needToScheduleCountRes.count ?? 0],
      ["pending_info", pendingInfoCountRes.count ?? 0],
      ["on_hold", onHoldCountRes.count ?? 0],
      ["waiting", waitingStatusCountRes.count ?? 0],
      ["pending_office_review", pendingOfficeReviewCountRes.count ?? 0],
      ["failed", failedCountRes.count ?? 0],
      ["retest_needed", retestNeededCountRes.count ?? 0],
      ["problem", problemCountRes.count ?? 0],
    ]);

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

    const closeoutCountSourceRows = mergeRowsById(
      closeoutCountRowsRes.data ?? [],
      closeoutPermitExceptionRowsRes.data ?? [],
    );
    const { projectionsByJobId: closeoutCountProjectionByJobId } = await buildBillingTruthCloseoutProjectionMap({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      jobs: closeoutProjectionInputs(closeoutCountSourceRows),
    });
    const closeoutCount = listCloseoutQueueJobs(
      closeoutCountSourceRows,
      (job: any) => closeoutCountProjectionByJobId.get(String(job?.id ?? "").trim()) ?? job,
    ).length;
    const permitRequestsSchemaAvailable = permitWorkflowEnabled && activePermitRequestsResult.schemaAvailable;
    const activePermitRequestRows = activePermitRequestsResult.rows;
    const effectiveBoardBucketFilter = resolveEffectiveOpsBoardBucketFilter({
      requestedBucket: activeBoardBucketFilter,
      productMode,
      permitRequestsSchemaAvailable,
    });

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
      ...(contractorIntakeQueueAvailable
        ? [{
            key: "contractor_intake",
            label: "Contractor Intake",
            count: contractorIntakeCount,
            href: `/ops${buildQueryString({ bucket: "contractor_intake", contractor: contractorScopeFilter ?? "" })}#ops-workspace`,
          }]
        : []),
      ...(permitRequestsSchemaAvailable
        ? [{
            key: "permits",
            label: "Permits",
            count: activePermitRequestRows.length,
            href: `/ops${buildQueryString({ bucket: "permits", contractor: contractorScopeFilter ?? "" })}#ops-workspace`,
          }]
        : []),
      {
        key: "updates",
        label: "Updates",
        count: unreadContractorUpdates.length + unreadNewWorkRequests.length,
        href: "/ops/notifications?state=unread",
      },
    ] as const;

    const boardBucketWorkspaceKeyMap: Record<Exclude<OpsBoardFilterBucket, "all">, string> = {
      pending: "need_to_schedule",
      field_work: "field_work",
      waiting: "waiting",
      exceptions: "exceptions",
      closeout: "closeout",
      contractor_intake: "contractor_intake",
      permits: "permits",
    };
    const coreBoardWorkspaceKeys = resolveVisibleOpsWorkspaceQueueKeys({
      productMode,
      permitRequestsSchemaAvailable,
    });
    const requestedWorkspaceKeys = [boardBucketWorkspaceKeyMap[effectiveBoardBucketFilter]];

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

    async function loadCloseoutWorkspaceRows() {
      const baseStatusQuery = () => {
        let q = supabase
          .from("jobs")
          .select(workspaceSelect)
          .is("deleted_at", null)
          .neq("status", "cancelled")
          .eq("field_complete", true)
          .in("ops_status", ["invoice_required", "paperwork_required"])
          .order("created_at", { ascending: true })
          .limit(50);
        if (contractorScopeFilter) q = q.eq("contractor_id", contractorScopeFilter);
        return q;
      };

      const permitExceptionQuery = () => {
        let q = supabase
          .from("jobs")
          .select(workspaceSelect)
          .is("deleted_at", null)
          .neq("status", "cancelled")
          .eq("field_complete", true)
          .in("ops_status", ["pending_info", "on_hold"])
          .or("pending_info_reason.ilike.%permit%,on_hold_reason.ilike.%permit%")
          .order("created_at", { ascending: true })
          .limit(50);
        if (contractorScopeFilter) q = q.eq("contractor_id", contractorScopeFilter);
        return q;
      };

      const [statusRowsRes, permitRowsRes] = await Promise.all([
        baseStatusQuery(),
        permitExceptionQuery(),
      ]);
      if (statusRowsRes.error) throw statusRowsRes.error;
      if (permitRowsRes.error) throw permitRowsRes.error;

      const closeoutSourceRows = mergeRowsById(statusRowsRes.data ?? [], permitRowsRes.data ?? []);
      const { projectionsByJobId } = await buildBillingTruthCloseoutProjectionMap({
        supabase,
        accountOwnerUserId: internalUser.account_owner_user_id,
        jobs: closeoutProjectionInputs(closeoutSourceRows),
      });

      return sortOpsBoardRows(
        listCloseoutQueueJobs(
          closeoutSourceRows,
          (job: any) => projectionsByJobId.get(String(job?.id ?? "").trim()) ?? job,
        ),
        boardSort,
      ).slice(0, 10);
    }

    async function loadWorkspacePreviewRows(workspaceKey: string) {
      if (workspaceKey === "without_tech") {
        return loadWithoutTechPreviewRows();
      }

      if (workspaceKey === "closeout") {
        return loadCloseoutWorkspaceRows();
      }

      if (workspaceKey === "contractor_intake") {
        if (!contractorIntakeQueueAvailable) return [];
        return listPendingContractorIntakeQueueRows({
          supabase: admin,
          accountOwnerUserId: internalUser.account_owner_user_id,
          contractorId: contractorScopeFilter,
          limit: CONTRACTOR_INTAKE_QUEUE_PAGE_LIMIT,
        });
      }

      const queuePreviewLimit =
        workspaceKey === "need_to_schedule"
          ? Math.max(countsWs.get("need_to_schedule") ?? 0, 10)
          : 10;

      let queueQ = supabase
        .from("jobs")
        .select(workspaceSelect)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .order("created_at", { ascending: true })
        .limit(queuePreviewLimit);

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
      } else if (workspaceKey === "permits") {
        return [];
      } else {
        return [];
      }

      if (contractorScopeFilter) queueQ = queueQ.eq("contractor_id", contractorScopeFilter);
      const queueRes = await queueQ;
      if (queueRes.error) throw queueRes.error;
      return sortOpsBoardRows(queueRes.data ?? [], boardSort);
    }

    const workspacePreviewEntries = await Promise.all(
      requestedWorkspaceKeys.map(async (workspaceKey) => [workspaceKey, await loadWorkspacePreviewRows(workspaceKey)] as const),
    );
    const workspacePreviewRowsByKey = new Map<string, any[]>(workspacePreviewEntries);
    const reasonSourceWorkspaceSections = requestedWorkspaceKeys.map((workspaceKey) => {
      const tab = workspaceTabs.find((item) => item.key === workspaceKey) ?? workspaceTabs[0];
      return {
        ...tab,
        previewRows: workspacePreviewRowsByKey.get(workspaceKey) ?? [],
      };
    });
    const selectedWorkspaceKey = requestedWorkspaceKeys[0];
    const reasonSourceRows = reasonSourceWorkspaceSections.flatMap((section) => section.previewRows);
    const workspaceReasonOptions = buildOpsBoardReasonOptions(reasonSourceRows, { queueKey: selectedWorkspaceKey });
    const effectiveBoardReasonFilter = boardReasonFilter && workspaceReasonOptions.some((option) => option.key === boardReasonFilter)
      ? boardReasonFilter
      : null;
    const visibleWorkspaceSections = reasonSourceWorkspaceSections.map((section) => ({
      ...section,
      previewRows: filterOpsBoardRowsByReason(section.previewRows, effectiveBoardReasonFilter, { queueKey: section.key }),
    }));
    const selectedWorkspaceSection =
      visibleWorkspaceSections.find((section) => section.key === selectedWorkspaceKey) ?? visibleWorkspaceSections[0];
    const selectedPermitRows = selectedWorkspaceKey === "permits" ? activePermitRequestRows : [];
    const selectedContractorIntakeRows =
      selectedWorkspaceKey === "contractor_intake"
        ? ((selectedWorkspaceSection?.previewRows ?? []) as ContractorIntakeQueueRow[])
        : [];
    const selectedPreviewRows =
      selectedWorkspaceKey === "permits" || selectedWorkspaceKey === "contractor_intake"
        ? []
        : visibleWorkspaceSections.flatMap((section) => section.previewRows);
    const selectedWorkspaceTab = {
      ...visibleWorkspaceSections[0],
      count: selectedWorkspaceKey === "permits"
        ? selectedPermitRows.length
        : selectedWorkspaceKey === "contractor_intake"
        ? selectedContractorIntakeRows.length
        : selectedPreviewRows.length,
    };
    const workspaceQueueChips = coreBoardWorkspaceKeys.map((workspaceKey) => {
      const section =
        visibleWorkspaceSections.find((item) => item.key === workspaceKey) ??
        workspaceTabs.find((item) => item.key === workspaceKey) ??
        workspaceTabs[0];
      const chipBucket =
        workspaceKey === "need_to_schedule"
          ? "pending"
          : workspaceKey === "field_work"
          ? "field_work"
          : workspaceKey === "waiting"
          ? "waiting"
          : workspaceKey === "exceptions"
          ? "exceptions"
          : workspaceKey === "closeout"
          ? "closeout"
          : workspaceKey === "contractor_intake"
          ? "contractor_intake"
          : workspaceKey === "permits"
          ? "permits"
          : "all";
      const previewRows = "previewRows" in section && Array.isArray(section.previewRows) ? section.previewRows : [];
      const isSelected = workspaceKey === selectedWorkspaceSection?.key;
      return {
        ...section,
        bucket: chipBucket,
        mobileLabel: workspaceKey === "need_to_schedule"
          ? "Scheduling"
          : workspaceKey === "waiting"
          ? "Waiting"
          : workspaceKey === "contractor_intake"
          ? "Intake"
          : workspaceKey === "permits"
          ? "Permits"
          : section.label,
        isSelected,
        previewRows,
        count: previewRows.length || section.count,
        href: `/ops${buildQueryString({
          bucket: chipBucket,
          contractor: contractorScopeFilter ?? "",
          sort: boardSort === "oldest" ? "" : boardSort,
        })}#ops-workspace`,
      };
    });
    const clearOpsBoardFiltersHref = `/ops${buildQueryString({
      bucket: effectiveBoardBucketFilter,
      sort: boardSort === "oldest" ? "" : boardSort,
    })}#ops-workspace`;
    const hasActiveOpsBoardFilters = Boolean(contractorScopeFilter) || Boolean(effectiveBoardReasonFilter);

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

    const selectedPreviewCustomerAttemptEventsRes = selectedPreviewJobIds.length
      ? await supabase
          .from("job_events")
          .select("job_id, created_at")
          .in("job_id", selectedPreviewJobIds)
          .eq("event_type", "customer_attempt")
          .order("created_at", { ascending: false })
      : { data: [], error: null };

    if (selectedPreviewCustomerAttemptEventsRes.error) throw selectedPreviewCustomerAttemptEventsRes.error;

    latestFailedRunByJob = buildLatestFailedRunByJob(selectedPreviewFailedRunsRes.data ?? []);
    primaryFailureReasonByJob = buildPrimaryFailureReasonByJob(latestFailedRunByJob);
    const selectedPreviewLatestCustomerAttemptByJob = buildLatestCustomerAttemptByJob(
      (selectedPreviewCustomerAttemptEventsRes.data ?? []) as Array<{ job_id: string; created_at: string }>,
    );
    const selectedWorkspaceCloseoutProjectionByJob =
      selectedWorkspaceKey === "closeout" && selectedPreviewRows.length
        ? (
            await buildBillingTruthCloseoutProjectionMap({
              supabase,
              accountOwnerUserId: internalUser.account_owner_user_id,
              jobs: closeoutProjectionInputs(selectedPreviewRows),
            })
          ).projectionsByJobId
        : new Map<string, any>();

    const operationalTenantIdentity = await operationalTenantIdentityPromise;
    const workspaceContractorsRes = await supabase
      .from("contractors")
      .select("id, name")
      .eq("lifecycle_state", "active")
      .order("name", { ascending: true });
    if (workspaceContractorsRes.error) throw workspaceContractorsRes.error;
    const workspaceContractors = workspaceContractorsRes.data ?? [];
    const showWorkspaceContractorFilter = workspaceContractors.length > 0 && !isHvacServiceMode;
    const shouldLoadPermitJobOptions = selectedWorkspaceKey === "permits";
    const [permitJobCustomersRes, permitJobLocationsRes] = shouldLoadPermitJobOptions
      ? await Promise.all([
          supabase
            .from("customers")
            .select("id, full_name, first_name, last_name, phone")
            .eq("owner_user_id", internalUser.account_owner_user_id)
            .order("last_name", { ascending: true })
            .limit(200),
          supabase
            .from("locations")
            .select("id, customer_id, address_line1, city, state, zip, postal_code")
            .eq("owner_user_id", internalUser.account_owner_user_id)
            .order("address_line1", { ascending: true })
            .limit(500),
        ])
      : [
          { data: [] as any[], error: null },
          { data: [] as any[], error: null },
        ];

    if (permitJobCustomersRes.error) throw permitJobCustomersRes.error;
    if (permitJobLocationsRes.error) throw permitJobLocationsRes.error;

    const permitJobCustomerOptions: PermitJobCustomerOption[] = (permitJobCustomersRes.data ?? [])
      .map((customer: any) => {
        const id = String(customer?.id ?? "").trim();
        const name =
          String(customer?.full_name ?? "").trim() ||
          [customer?.first_name, customer?.last_name]
            .map((part) => String(part ?? "").trim())
            .filter(Boolean)
            .join(" ") ||
          id;
        const phone = String(customer?.phone ?? "").trim();
        return id
          ? {
              id,
              label: phone ? `${name} - ${phone}` : name,
            }
          : null;
      })
      .filter(Boolean) as PermitJobCustomerOption[];

    const permitCustomerLabelById = new Map(
      permitJobCustomerOptions.map((customer) => [customer.id, customer.label]),
    );
    const permitJobLocationOptions: PermitJobLocationOption[] = (permitJobLocationsRes.data ?? [])
      .map((location: any) => {
        const id = String(location?.id ?? "").trim();
        const customerId = String(location?.customer_id ?? "").trim();
        const address = String(location?.address_line1 ?? "").trim() || "Address";
        const cityStateZip = [
          String(location?.city ?? "").trim(),
          [String(location?.state ?? "").trim(), String(location?.zip ?? location?.postal_code ?? "").trim()]
            .filter(Boolean)
            .join(" "),
        ]
          .filter(Boolean)
          .join(", ");
        const customerLabel = permitCustomerLabelById.get(customerId);
        const label = [address, cityStateZip].filter(Boolean).join(", ");
        return id && customerId
          ? {
              id,
              customerId,
              label: customerLabel ? `${label || id} - ${customerLabel}` : label || id,
            }
          : null;
      })
      .filter(Boolean) as PermitJobLocationOption[];
    const activeWorkspaceBaseHref = `/ops${buildQueryString({
      bucket: effectiveBoardBucketFilter,
      create: "",
      contractor: contractorScopeFilter ?? "",
      q: q ?? "",
      sort,
      reason: effectiveBoardReasonFilter ?? "",
      signal,
    })}`;
    const activeWorkspaceHref = `${activeWorkspaceBaseHref}#ops-workspace`;

    function workspaceNeedsSchedulingRichCard(job: any, visibleReason: OpsBoardVisibleReason) {
      const jobId = String(job?.id ?? "").trim();
      const phone = String(job?.customer_phone ?? "").trim();
      const phoneHref = telHref(phone);
      const textHref = smsHref(phone);
      const scheduleDateText = job?.scheduled_date ? formatBusinessDateUS(String(job.scheduled_date)) : "Not scheduled";
      const scheduleWindowText = displayWindowLA(job?.window_start, job?.window_end) || (job?.scheduled_date ? "Window TBD" : "");
      const recentAttemptDisplay = resolveRecentAttemptDisplay(selectedPreviewLatestCustomerAttemptByJob.get(jobId) ?? null);
      const contractorName = workspaceContractorName(job) || operationalTenantIdentity.displayName;
      const utilityLabelClass =
        "text-[11px] font-semibold uppercase tracking-[0.11em] sm:text-[10px] sm:tracking-[0.12em]";
      const inlineActionClass =
        "inline-flex min-h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:scale-[0.99]";
      const compactContactActionClass =
        "inline-flex h-7 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300";
      const inlinePrimaryActionClass =
        "inline-flex min-h-8 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 active:scale-[0.99]";
      const scheduleFieldClass =
        "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-sm transition-colors focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200";

      return (
        <QueueCard
          key={jobId}
          variant="needs-scheduling-rich"
          href={`/jobs/${jobId}?tab=ops`}
          title={workspaceTitle(job)}
          subtitle={workspaceCustomerLocation(job)}
          actionLabel="Open Job"
          tags={[
            {
              label: "Status",
              value: visibleReason.label,
              detail: visibleReason.detail || undefined,
            },
            { label: "Aging", value: workspaceAgeLabel(job) },
            { label: "Last Attempt", value: recentAttemptDisplay },
          ]}
        >
          <QueueCardOpenAndAct>
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <span className={utilityLabelClass}>Contractor</span>
                <span className="text-sm font-medium text-slate-700">{contractorName}</span>
              </div>
              <div className="grid gap-1.5">
                <span className={utilityLabelClass}>Phone</span>
                {phone ? (
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    {phoneHref || textHref ? (
                      <a
                        href={phoneHref || textHref}
                        className="text-sm font-semibold text-slate-800 transition-colors hover:text-slate-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                      >
                        {phone}
                      </a>
                    ) : (
                      <span className="text-sm font-medium text-slate-800">{phone}</span>
                    )}
                    <div className="flex items-center gap-1.5">
                      {phoneHref ? (
                        <a href={phoneHref} className={compactContactActionClass}>
                          Call
                        </a>
                      ) : null}
                      {textHref ? (
                        <a href={textHref} className={compactContactActionClass}>
                          Open SMS App
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <span className="text-sm text-slate-400">No phone on file</span>
                )}
              </div>
              <div className="grid gap-1.5">
                <span className={utilityLabelClass}>Schedule</span>
                <span className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  {scheduleWindowText ? `${scheduleDateText} / ${scheduleWindowText}` : scheduleDateText}
                </span>
              </div>

              <form action={updateJobScheduleFromForm} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.35)]">
                <input type="hidden" name="job_id" value={jobId} />
                <input type="hidden" name="permit_number" value={String(job?.permit_number ?? "")} />
                <input type="hidden" name="jurisdiction" value={String(job?.jurisdiction ?? "")} />
                <input type="hidden" name="permit_date" value={String(job?.permit_date ?? "")} />
                <input type="hidden" name="return_to" value={activeWorkspaceHref} />

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  <label className="space-y-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Date
                    <input
                      type="date"
                      name="scheduled_date"
                      defaultValue={String(job?.scheduled_date ?? "")}
                      className={scheduleFieldClass}
                    />
                  </label>
                  <label className="space-y-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Start
                    <input
                      type="time"
                      name="window_start"
                      defaultValue={timeToTimeInput(job?.window_start)}
                      className={scheduleFieldClass}
                    />
                  </label>
                  <label className="space-y-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    End
                    <input
                      type="time"
                      name="window_end"
                      defaultValue={timeToTimeInput(job?.window_end)}
                      className={scheduleFieldClass}
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button type="submit" className={inlinePrimaryActionClass}>
                    Save Schedule
                  </button>
                  <button type="submit" name="unschedule" value="1" className={inlineActionClass}>
                    Clear
                  </button>
                </div>
              </form>

              <div className="flex flex-wrap items-center gap-1.5">
                <form action={logCustomerContactAttemptFromForm}>
                  <input type="hidden" name="job_id" value={jobId} />
                  <input type="hidden" name="method" value="call" />
                  <input type="hidden" name="result" value="no_answer" />
                  <input type="hidden" name="return_to" value={activeWorkspaceHref} />
                  <input type="hidden" name="success_banner" value="contact_attempt_logged_call" />
                  <button type="submit" className={inlineActionClass}>
                    Log Call
                  </button>
                </form>
                <form action={logCustomerContactAttemptFromForm}>
                  <input type="hidden" name="job_id" value={jobId} />
                  <input type="hidden" name="method" value="text" />
                  <input type="hidden" name="result" value="sent" />
                  <input type="hidden" name="return_to" value={activeWorkspaceHref} />
                  <input type="hidden" name="success_banner" value="contact_attempt_logged_text" />
                  <button type="submit" className={inlineActionClass}>
                    Log Text Attempt
                  </button>
                </form>
              </div>
              <p className="text-[11px] text-slate-500">
                Logs communication attempts only; does not confirm carrier delivery.
              </p>
            </div>
          </QueueCardOpenAndAct>
        </QueueCard>
      );
    }

    function formatWorkspaceUsdFromCents(cents: number | null | undefined) {
      const amount = Number(cents ?? 0) / 100;
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(Number.isFinite(amount) ? amount : 0);
    }

    function formatWorkspaceFieldPaymentMethod(method: string | null | undefined) {
      const normalized = String(method ?? "").trim().toLowerCase();
      if (normalized === "cash") return "Cash";
      if (normalized === "check") return "Check";
      return "Other";
    }

    function formatWorkspaceTimestamp(value: string | null | undefined) {
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

    function workspaceCloseoutRichCard(job: any, visibleReason: OpsBoardVisibleReason) {
      const jobId = String(job?.id ?? "").trim();
      const phone = String(job?.customer_phone ?? "").trim();
      const phoneHref = telHref(phone);
      const textHref = smsHref(phone);
      const projection = selectedWorkspaceCloseoutProjectionByJob.get(jobId) ?? job;
      const needs = getCloseoutNeeds(projection);
      const canMarkExternalInvoiceSent = canShowExternalInvoiceSentAction({
        needsInvoice: needs.needsInvoice,
        billingState: projection?.billingState ?? null,
      });
      const completedText = job?.field_complete_at
        ? formatWorkspaceTimestamp(String(job.field_complete_at))
        : "Completion pending";
      const scheduledText = job?.scheduled_date ? formatBusinessDateUS(String(job.scheduled_date)) : "";
      const assignmentSummary = formatAssignmentSummaryForJob(jobId, selectedPreviewAssignmentDisplayMap);
      const contractorName = workspaceContractorName(job) || operationalTenantIdentity.displayName;
      const utilityLabelClass =
        "text-[11px] font-semibold uppercase tracking-[0.11em] sm:text-[10px] sm:tracking-[0.12em]";
      const inlineActionClass =
        "inline-flex min-h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:scale-[0.99]";
      const primaryActionClass =
        "inline-flex min-h-8 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 active:scale-[0.99]";
      const chipClass =
        "inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600";

      return (
        <QueueCard
          key={jobId}
          id={`ops-workspace-closeout-job-${jobId}`}
          variant="closeout-rich"
          href={`/jobs/${jobId}?tab=ops`}
          title={workspaceTitle(job)}
          subtitle={workspaceCustomerLocation(job)}
          actionLabel="Open Job"
          tags={[
            {
              label: "Reason",
              value: visibleReason.label,
              detail: visibleReason.detail || undefined,
            },
            { label: "Completed", value: completedText },
            {
              label: "Needs",
              value:
                needs.needsInvoice && needs.needsCerts
                  ? "Invoice + paperwork"
                  : needs.needsInvoice
                  ? "Invoice"
                  : needs.needsCerts
                  ? "Paperwork"
                  : "Review",
            },
          ]}
        >
          <QueueCardOpenAndAct>
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <span className={utilityLabelClass}>Contractor</span>
                <span className="text-sm font-medium text-slate-700">{contractorName}</span>
              </div>
              {scheduledText ? (
                <div className="grid gap-1.5">
                  <span className={utilityLabelClass}>Scheduled</span>
                  <span className={chipClass}>{scheduledText}</span>
                </div>
              ) : null}
              <div className="grid gap-1.5">
                <span className={utilityLabelClass}>Assignment</span>
                <span className={chipClass}>{assignmentSummary}</span>
              </div>
              <div className="grid gap-1.5">
                <span className={utilityLabelClass}>Next Step</span>
                <p className="text-sm leading-5 text-slate-700">{getCloseoutQueueNextStepLabel(projection)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Link href={`/jobs/${jobId}?tab=ops`} className={primaryActionClass}>
                  View Job
                </Link>
                {phoneHref ? (
                  <a href={phoneHref} className={inlineActionClass}>
                    Call
                  </a>
                ) : null}
                {textHref ? (
                  <a href={textHref} className={inlineActionClass}>
                    Open SMS App
                  </a>
                ) : null}
                {canMarkExternalInvoiceSent ? (
                  <form action={markInvoiceCompleteFromForm}>
                    <input type="hidden" name="job_id" value={jobId} />
                    <input type="hidden" name="return_to" value={`${activeWorkspaceBaseHref}#ops-workspace-closeout-job-${jobId}`} />
                    <input type="hidden" name="success_notice" value="external_billing_complete" />
                    <button type="submit" className={inlineActionClass}>
                      External Billing Complete
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          </QueueCardOpenAndAct>
        </QueueCard>
      );
    }

    function workspaceFieldPaymentReviewCard(item: NonNullable<typeof fieldPaymentReconciliationAttention>["items"][number]) {
      const isSelfReported = item.reportedByUserId === user.id;
      const utilityLabelClass =
        "text-[11px] font-semibold uppercase tracking-[0.11em] sm:text-[10px] sm:tracking-[0.12em]";
      const inlineActionClass =
        "inline-flex min-h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:scale-[0.99]";
      const primaryActionClass =
        "inline-flex min-h-8 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 active:scale-[0.99]";
      const inputClass =
        "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-900";
      const chipClass =
        "inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600";

      return (
        <QueueCard
          key={`field-payment-${item.reportId}`}
          id={`ops-workspace-field-payment-${item.reportId}`}
          variant="closeout-payment-review"
          href={item.links.jobHref}
          title={item.jobTitle || item.jobReference}
          subtitle={item.customerDisplayName || "Customer"}
          actionLabel="Open Job"
          tags={[
            { label: "Amount", value: formatWorkspaceUsdFromCents(item.amountCents) },
            { label: "Method", value: formatWorkspaceFieldPaymentMethod(item.paymentMethod) },
            {
              label: "Reported",
              value: formatWorkspaceTimestamp(item.reportedAt),
              detail: `by ${item.reportedByDisplayName}`,
            },
          ]}
        >
          <QueueCardOpenAndAct>
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <span className={utilityLabelClass}>Invoice</span>
                <span className="text-sm font-medium text-slate-700">{item.invoiceReference}</span>
              </div>
              <div className="grid gap-1.5">
                <span className={utilityLabelClass}>Next Step</span>
                <p className="text-sm leading-5 text-slate-700">Confirm only after verifying the money was received.</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Link href={item.links.jobHref} className={primaryActionClass}>
                  View Job
                </Link>
                <Link href={item.links.invoiceWorkspaceHref} className={inlineActionClass}>
                  Open invoice workspace
                </Link>
              </div>
              {isSelfReported ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
                  Reporter cannot verify their own report.
                </div>
              ) : (
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px]">
                  <form action={verifyFieldPaymentCollectionReportFromForm} className="space-y-2">
                    <input type="hidden" name="field_payment_report_id" value={item.reportId} />
                    <input type="hidden" name="report_id" value={item.reportId} />
                    <input type="hidden" name="invoice_id" value={item.internalInvoiceId} />
                    <input type="hidden" name="job_id" value={item.jobId} />
                    <input type="hidden" name="tab" value="info" />
                    <input type="hidden" name="return_to" value={`${activeWorkspaceBaseHref}#ops-workspace-field-payment-${item.reportId}`} />
                    <label className="block">
                      <span className="mb-1 block font-semibold text-slate-900">Verification note</span>
                      <input
                        name="verification_note"
                        type="text"
                        className={inputClass}
                        placeholder="Optional office confirmation details"
                      />
                    </label>
                    <button type="submit" className={inlineActionClass}>
                      Confirm Payment
                    </button>
                  </form>
                  <form action={rejectFieldPaymentCollectionReportFromForm} className="space-y-2">
                    <input type="hidden" name="field_payment_report_id" value={item.reportId} />
                    <input type="hidden" name="report_id" value={item.reportId} />
                    <input type="hidden" name="invoice_id" value={item.internalInvoiceId} />
                    <input type="hidden" name="job_id" value={item.jobId} />
                    <input type="hidden" name="tab" value="info" />
                    <input type="hidden" name="return_to" value={`${activeWorkspaceBaseHref}#ops-workspace-field-payment-${item.reportId}`} />
                    <label className="block">
                      <span className="mb-1 block font-semibold text-slate-900">Rejection reason</span>
                      <input
                        name="rejection_reason"
                        type="text"
                        required
                        className={inputClass}
                        placeholder="Required"
                      />
                    </label>
                    <button type="submit" className={inlineActionClass}>
                      Reject Report
                    </button>
                  </form>
                </div>
              )}
            </div>
          </QueueCardOpenAndAct>
        </QueueCard>
      );
    }

    const selectedWorkspaceItemCount =
      selectedWorkspaceKey === "permits"
        ? selectedPermitRows.length
        : selectedWorkspaceKey === "contractor_intake"
        ? selectedContractorIntakeRows.length
        : selectedWorkspaceSection?.previewRows.length ?? 0;
    const selectedWorkspaceItemNoun =
      selectedWorkspaceKey === "permits"
        ? "permit requests"
        : selectedWorkspaceKey === "contractor_intake"
        ? "intake submissions"
        : "jobs";
    const shouldExpandPermitCreateForm =
      selectedWorkspaceKey === "permits" && createIntent === "permit_request";
    const selectedPermitAttachmentResult = selectedPermitRows.length
      ? await listInternalPermitRequestAttachmentsForAccount({
          accountOwnerUserId: internalUser.account_owner_user_id,
          permitRequestIds: selectedPermitRows.map((row) => row.id),
        })
      : { schemaAvailable: true, attachmentsByPermitRequestId: {} };
    const permitAttachmentsByRequestId = selectedPermitAttachmentResult.attachmentsByPermitRequestId;

    function formatPermitQueueTimestamp(value: string | null | undefined) {
      const normalized = String(value ?? "").trim();
      if (!normalized) return "Not available";
      const parsed = new Date(normalized);
      if (Number.isNaN(parsed.getTime())) return "Not available";

      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(parsed);
    }

    function permitQueueContext(row: PermitRequestQueueRow) {
      const parts = [
        row.jobContext?.title,
        row.jobContext?.customerName,
        row.jobContext?.location,
      ]
        .map((part) => String(part ?? "").trim())
        .filter(Boolean);

      return parts.length ? parts.join(" · ") : "Permit paperwork request";
    }

    function formatPermitAttachmentType(contentType: string | null | undefined, fileName: string | null | undefined) {
      const normalizedType = String(contentType ?? "").trim();
      if (normalizedType) return normalizedType;
      const normalizedName = String(fileName ?? "").trim();
      const extension = normalizedName.includes(".") ? normalizedName.split(".").pop() : "";
      return extension ? extension.toUpperCase() : "File";
    }

    function formatPermitAttachmentSize(fileSize: number | null | undefined) {
      if (!Number.isFinite(fileSize ?? NaN) || !fileSize) return null;
      if (fileSize < 1024) return `${fileSize} B`;
      if (fileSize < 1024 * 1024) return `${Math.round(fileSize / 1024)} KB`;
      return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
    }

    async function createManualPermitRequestFromOps(formData: FormData) {
      "use server";

      await createInternalManualPermitRequest(formData);
      redirect("/ops?bucket=permits#ops-workspace");
    }

    async function acceptPermitRequestFromOps(formData: FormData) {
      "use server";

      await acceptInternalPermitRequest(formData);
      redirect("/ops?bucket=permits#ops-workspace");
    }

    async function holdPermitRequestFromOps(formData: FormData) {
      "use server";

      await holdInternalPermitRequest(formData);
      redirect("/ops?bucket=permits#ops-workspace");
    }

    async function resumePermitRequestFromOps(formData: FormData) {
      "use server";

      await resumeInternalPermitRequest(formData);
      redirect("/ops?bucket=permits#ops-workspace");
    }

    async function updatePermitRequestIntakeFromOps(formData: FormData) {
      "use server";

      await updateInternalPermitRequestIntake(formData);
      redirect("/ops?bucket=permits#ops-workspace");
    }

    async function markPermitCreatedFromOps(formData: FormData) {
      "use server";

      try {
        await markInternalPermitCreated(formData);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Permit could not be marked created.";
        redirect(`/ops?bucket=permits&permit_error=${encodeURIComponent(message)}#ops-workspace`);
      }

      redirect("/ops?bucket=permits#ops-workspace");
    }

    async function createJobAndMarkPermitCreatedFromOps(formData: FormData) {
      "use server";

      try {
        await createJobFromPermitRequestAndMarkCreated(formData);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Permit job could not be created.";
        redirect(`/ops?bucket=permits&permit_error=${encodeURIComponent(message)}#ops-workspace`);
      }

      redirect("/ops?bucket=permits#ops-workspace");
    }

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

          <div className="mb-3 flex flex-wrap gap-2" aria-label="Operations queue selector">
            {workspaceQueueChips.map((chip) => (
              <Link
                key={chip.key}
                href={chip.href}
                aria-current={chip.isSelected ? "page" : undefined}
                className={`inline-flex min-h-10 flex-[1_1_calc(50%-0.5rem)] items-center justify-center rounded-full border px-2.5 py-2 text-center text-[11px] font-semibold leading-tight transition-colors sm:min-h-9 sm:flex-none sm:px-3 sm:text-xs ${
                  chip.isSelected
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="sm:hidden">{chip.mobileLabel} · {chip.count}</span>
                <span className="hidden sm:inline">{chip.label} · {chip.count}</span>
              </Link>
            ))}
          </div>

          <div className="mb-3 grid gap-2 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
            {showWorkspaceContractorFilter ? (
              <ContractorFilter contractors={workspaceContractors} selectedId={contractorScopeFilter ?? ""} />
            ) : (
              <div className="grid gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500 sm:text-[10px] sm:tracking-[0.12em]">Contractor</label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-500">All contractors</div>
              </div>
            )}
            <form action="/ops" method="get" className="grid gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500 sm:text-[10px] sm:tracking-[0.12em]">Reason</label>
              <input type="hidden" name="contractor" value={contractorScopeFilter ?? ""} />
              <input type="hidden" name="bucket" value={effectiveBoardBucketFilter} />
              <input type="hidden" name="sort" value={boardSort} />
              <select
                name="reason"
                defaultValue={effectiveBoardReasonFilter ?? ""}
                className="w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,background-color,box-shadow] hover:border-slate-400 hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
              >
                <option value="">All reasons</option>
                {workspaceReasonOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button type="submit" className="mt-1 inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-white">
                Apply
              </button>
            </form>
            <form action="/ops" method="get" className="grid gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500 sm:text-[10px] sm:tracking-[0.12em]">Sort</label>
              <input type="hidden" name="contractor" value={contractorScopeFilter ?? ""} />
              <input type="hidden" name="bucket" value={effectiveBoardBucketFilter} />
              <input type="hidden" name="reason" value={effectiveBoardReasonFilter ?? ""} />
              <select
                name="sort"
                defaultValue={boardSort}
                className="w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,background-color,box-shadow] hover:border-slate-400 hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
              >
                {OPS_BOARD_SORT_OPTIONS.map((option) => (
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
              <Link href={clearOpsBoardFiltersHref} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors hover:bg-slate-50">
                Clear filters
              </Link>
            ) : null}
          </div>

          <article className="rounded-2xl border border-slate-300/80 bg-white p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.36)] ring-1 ring-slate-200/70 sm:p-3.5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Active Queue</div>
              <div className="text-[15px] font-semibold tracking-tight text-slate-950">{selectedWorkspaceSection?.label ?? selectedWorkspaceTab.label}</div>
              <div className="text-xs text-slate-600">
                {selectedWorkspaceItemCount} {selectedWorkspaceItemNoun}
              </div>
            </div>
            {selectedWorkspaceKey === "contractor_intake" ? (
              <Link
                href={`/ops/contractor-intake/export${buildQueryString({
                  contractor: contractorScopeFilter ?? "",
                })}`}
                className="inline-flex items-center rounded-md border border-slate-200/90 bg-slate-50/80 px-2 py-1 text-[12px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform,color] hover:-translate-y-px hover:border-slate-300 hover:bg-white hover:text-slate-900 hover:shadow-[0_8px_16px_-16px_rgba(15,23,42,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]"
              >
                Export CSV
              </Link>
            ) : null}
          </div>

            {selectedWorkspaceKey === "permits" ? (
              <details
                id="permit-request-create"
                open={shouldExpandPermitCreateForm}
                className="mb-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70"
              >
                <summary className="list-none cursor-pointer px-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[13px] font-semibold text-blue-700">+ New Permit Request</div>
                      <div className="mt-0.5 text-xs text-slate-600">
                        Create one from a text, phone call, email, or photo request.
                      </div>
                    </div>
                    <div className="inline-flex min-h-8 items-center rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                      Open form
                    </div>
                  </div>
                </summary>
                <div className="border-t border-slate-200 px-3 pb-3 pt-3">
                  <form action={createManualPermitRequestFromOps} className="grid gap-2 lg:grid-cols-2">
                    <label className="grid gap-1 text-xs font-semibold text-slate-600">
                      Contractor
                      <select
                        name="contractor_id"
                        required
                        disabled={workspaceContractors.length === 0}
                        className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        <option value="">Select contractor</option>
                        {workspaceContractors.map((contractor: { id: string; name: string | null }) => (
                          <option key={contractor.id} value={contractor.id}>
                            {contractor.name || contractor.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs font-semibold text-slate-600">
                      Short request label
                      <input
                        name="request_label"
                        maxLength={160}
                        placeholder="Permit needed for signed contract"
                        className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold text-slate-600">
                      Customer first name
                      <input
                        name="customer_first_name"
                        maxLength={120}
                        className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold text-slate-600">
                      Customer last name
                      <input
                        name="customer_last_name"
                        maxLength={120}
                        className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold text-slate-600">
                      Service address
                      <input
                        name="service_address_text"
                        maxLength={500}
                        className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold text-slate-600">
                      Jurisdiction
                      <input
                        name="jurisdiction"
                        maxLength={160}
                        className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold text-slate-600 lg:col-span-2">
                      Intake note
                      <textarea
                        name="intake_note"
                        rows={3}
                        maxLength={4000}
                        placeholder="What did Compliance Matters receive?"
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
                      />
                    </label>
                    <div className="flex flex-wrap items-center justify-between gap-2 lg:col-span-2">
                      <div className="text-xs text-slate-500">Add a short label or note to create the request.</div>
                      <button
                        type="submit"
                        disabled={workspaceContractors.length === 0}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
                      >
                        Create Permit Request
                      </button>
                    </div>
                  </form>
                </div>
              </details>
            ) : null}

            {selectedWorkspaceKey === "permits" ? (
              selectedPermitRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                  <div>No active permit requests.</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {permitActionError ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-900">
                      {permitActionError}
                    </div>
                  ) : null}
                  {selectedPermitRows.map((permitRequest) => {
                    const permitAttachments = permitAttachmentsByRequestId[permitRequest.id] ?? [];

                    return (
                    <QueueCard
                      key={permitRequest.id}
                      title={permitRequest.requestLabel || "Permit Request"}
                      subtitle={permitQueueContext(permitRequest)}
                      tagsColumns={2}
                      tags={[
                        { label: "Status", value: permitRequest.internalStatusLabel },
                        { label: "Contractor", value: permitRequest.contractorName || permitRequest.contractorId },
                        {
                          label: "Submitted",
                          value: `${permitRequest.submittedAgeDays} days ago · ${formatPermitQueueTimestamp(permitRequest.createdAt)}`,
                        },
                        ...(permitRequest.customerFirstNameSnapshot || permitRequest.customerLastNameSnapshot
                          ? [
                              {
                                label: "Customer",
                                value: [permitRequest.customerFirstNameSnapshot, permitRequest.customerLastNameSnapshot]
                                  .filter(Boolean)
                                  .join(" "),
                              },
                            ]
                          : []),
                        ...(permitRequest.serviceAddressTextSnapshot
                          ? [{ label: "Address", value: permitRequest.serviceAddressTextSnapshot }]
                          : []),
                        ...(permitRequest.jurisdiction
                          ? [{ label: "Jurisdiction", value: permitRequest.jurisdiction }]
                          : []),
                        ...(permitRequest.contractorNote
                          ? [{ label: "Note", value: permitRequest.contractorNote, fullWidth: true }]
                          : permitRequest.internalIntakeNote
                          ? [{ label: "Note", value: permitRequest.internalIntakeNote, fullWidth: true }]
                          : []),
                      ]}
                    >
                      <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                          {permitRequest.status === "permit_request" ? (
                            <form action={acceptPermitRequestFromOps}>
                              <input type="hidden" name="permit_request_id" value={permitRequest.id} />
                              <button
                                type="submit"
                                className="inline-flex min-h-8 items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[12px] font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
                              >
                                Accept / Start Permit
                              </button>
                            </form>
                          ) : null}
                          {permitRequest.status === "permit_request" || permitRequest.status === "accepted_in_process" ? (
                            <form action={holdPermitRequestFromOps}>
                              <input type="hidden" name="permit_request_id" value={permitRequest.id} />
                              <button
                                type="submit"
                                className="inline-flex min-h-8 items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[12px] font-semibold text-amber-800 transition-colors hover:bg-amber-100"
                              >
                                Put On Hold
                              </button>
                            </form>
                          ) : null}
                          {permitRequest.status === "on_hold_additional_info_needed" ? (
                            <form action={resumePermitRequestFromOps}>
                              <input type="hidden" name="permit_request_id" value={permitRequest.id} />
                              <button
                                type="submit"
                                className="inline-flex min-h-8 items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[12px] font-semibold text-blue-800 transition-colors hover:bg-blue-100"
                              >
                                Resume / In Process
                              </button>
                            </form>
                          ) : null}
                      </div>

                      <details className="mt-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
                        <summary className="cursor-pointer text-[12px] font-semibold text-blue-700">
                          Edit Permit Intake
                        </summary>
                        <form action={updatePermitRequestIntakeFromOps} className="mt-2 grid gap-2 md:grid-cols-2">
                          <input type="hidden" name="permit_request_id" value={permitRequest.id} />
                          <label className="grid gap-1 text-xs font-semibold text-slate-600">
                            Request label
                            <input
                              name="request_label"
                              defaultValue={permitRequest.requestLabel ?? ""}
                              maxLength={160}
                              className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-semibold text-slate-600">
                            Jurisdiction
                            <input
                              name="jurisdiction"
                              defaultValue={permitRequest.jurisdiction ?? ""}
                              maxLength={160}
                              className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-semibold text-slate-600">
                            Customer first name
                            <input
                              name="customer_first_name_snapshot"
                              defaultValue={permitRequest.customerFirstNameSnapshot ?? ""}
                              maxLength={120}
                              className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-semibold text-slate-600">
                            Customer last name
                            <input
                              name="customer_last_name_snapshot"
                              defaultValue={permitRequest.customerLastNameSnapshot ?? ""}
                              maxLength={120}
                              className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-semibold text-slate-600 md:col-span-2">
                            Service address
                            <input
                              name="service_address_text_snapshot"
                              defaultValue={permitRequest.serviceAddressTextSnapshot ?? ""}
                              maxLength={500}
                              className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-semibold text-slate-600">
                            Permit number
                            <input
                              name="permit_number"
                              defaultValue={permitRequest.permitNumber ?? ""}
                              maxLength={160}
                              className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-semibold text-slate-600">
                            Permit date
                            <input
                              type="date"
                              name="permit_date"
                              defaultValue={permitRequest.permitDate ?? ""}
                              className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-semibold text-slate-600 md:col-span-2">
                            Internal intake note
                            <textarea
                              name="internal_intake_note"
                              defaultValue={permitRequest.internalIntakeNote ?? ""}
                              rows={3}
                              maxLength={4000}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-semibold text-slate-600 md:col-span-2">
                            Contractor note
                            <textarea
                              name="contractor_note"
                              defaultValue={permitRequest.contractorNote ?? ""}
                              rows={3}
                              maxLength={4000}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                            />
                          </label>
                          <div className="flex justify-end md:col-span-2">
                            <button
                              type="submit"
                              className="inline-flex min-h-9 items-center rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
                            >
                              Save Intake Details
                            </button>
                          </div>
                        </form>
                        <div className="mt-3 border-t border-slate-200 pt-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-[12px] font-semibold text-slate-700">Submitted files</div>
                            <div className="text-[11px] font-medium text-slate-500">
                              {permitAttachments.length} {permitAttachments.length === 1 ? "file" : "files"}
                            </div>
                          </div>
                          {permitAttachments.length === 0 ? (
                            <div className="mt-1 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-500">
                              No files attached.
                            </div>
                          ) : (
                            <div className="mt-1 space-y-1.5">
                              {permitAttachments.map((attachment) => {
                                const sizeLabel = formatPermitAttachmentSize(attachment.fileSize);
                                const typeLabel = formatPermitAttachmentType(attachment.contentType, attachment.fileName);
                                return (
                                  <div
                                    key={attachment.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
                                  >
                                    <div className="min-w-0">
                                      <div className="truncate font-semibold text-slate-800" title={attachment.fileName}>
                                        {attachment.fileName}
                                      </div>
                                      <div className="mt-0.5 text-slate-500">
                                        {[typeLabel, sizeLabel, formatPermitQueueTimestamp(attachment.createdAt)].filter(Boolean).join(" · ")}
                                      </div>
                                    </div>
                                    {attachment.signedUrl ? (
                                      <a
                                        href={attachment.signedUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex min-h-8 items-center rounded-md border border-slate-300 bg-slate-50 px-2 py-1 font-semibold text-slate-700 transition-colors hover:bg-white"
                                      >
                                        Open
                                      </a>
                                    ) : (
                                      <span className="text-[11px] font-medium text-slate-400">Unavailable</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </details>

                      <details className="mt-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
                        <summary className="cursor-pointer text-[12px] font-semibold text-emerald-700">
                          Mark Permit Created
                        </summary>
                        {permitRequest.jobId ? (
                          <form action={markPermitCreatedFromOps} className="mt-2 grid gap-2 md:grid-cols-2">
                            <input type="hidden" name="permit_request_id" value={permitRequest.id} />
                            <label className="grid gap-1 text-xs font-semibold text-slate-600">
                              Permit number
                              <input
                                name="permit_number"
                                defaultValue={permitRequest.permitNumber ?? ""}
                                maxLength={160}
                                required
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600">
                              Permit date
                              <input
                                type="date"
                                name="permit_date"
                                defaultValue={permitRequest.permitDate ?? ""}
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600">
                              Jurisdiction
                              <input
                                name="jurisdiction"
                                defaultValue={permitRequest.jurisdiction ?? ""}
                                maxLength={160}
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600">
                              What happens next?
                              <select
                                name="post_permit_route"
                                required
                                defaultValue=""
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              >
                                <option value="" disabled>Select next step</option>
                                <option value="ready_for_testing">Ready for Testing</option>
                                <option value="pending_install">Pending Install</option>
                              </select>
                            </label>
                            <div className="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[12px] leading-5 text-slate-600 md:col-span-2">
                              <div>
                                <span className="font-semibold text-slate-700">Ready for Testing:</span>{" "}
                                Moves the linked job toward scheduling if it is not already scheduled.
                              </div>
                              <div>
                                <span className="font-semibold text-slate-700">Pending Install:</span>{" "}
                                Moves the linked job to Waiting / On Hold — Pending Install.
                              </div>
                            </div>
                            <div className="flex justify-end md:col-span-2">
                              <button
                                type="submit"
                                className="inline-flex min-h-9 items-center rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-800"
                              >
                                Mark Permit Created
                              </button>
                            </div>
                          </form>
                        ) : (
                          <form action={createJobAndMarkPermitCreatedFromOps} className="mt-2 grid gap-2 md:grid-cols-2">
                            <input type="hidden" name="permit_request_id" value={permitRequest.id} />
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] font-medium leading-5 text-amber-950 md:col-span-2">
                              No job is linked yet. Create the testing job from this permit request when the permit is ready.
                            </div>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600">
                              Permit number
                              <input
                                name="permit_number"
                                defaultValue={permitRequest.permitNumber ?? ""}
                                maxLength={160}
                                required
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600">
                              Permit date
                              <input
                                type="date"
                                name="permit_date"
                                defaultValue={permitRequest.permitDate ?? ""}
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600">
                              Jurisdiction
                              <input
                                name="jurisdiction"
                                defaultValue={permitRequest.jurisdiction ?? ""}
                                maxLength={160}
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600">
                              What happens next?
                              <select
                                name="post_permit_route"
                                required
                                defaultValue=""
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              >
                                <option value="" disabled>Select next step</option>
                                <option value="ready_for_testing">Ready for Testing</option>
                                <option value="pending_install">Pending Install</option>
                              </select>
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600 md:col-span-2">
                              Job title / request label
                              <input
                                name="job_title"
                                defaultValue={permitRequest.requestLabel ?? ""}
                                maxLength={160}
                                placeholder="ECC Alteration Test"
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600 md:col-span-2">
                              Customer/location mode
                              <select
                                name="customer_location_mode"
                                required
                                defaultValue=""
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              >
                                <option value="" disabled>Select customer/location mode</option>
                                <option value="existing_existing">Existing customer + existing location</option>
                                <option value="existing_new">Existing customer + new location</option>
                                <option value="new_new">New customer + new location</option>
                              </select>
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600">
                              Existing customer
                              <select
                                name="existing_customer_id"
                                defaultValue=""
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              >
                                <option value="">Select existing customer</option>
                                {permitJobCustomerOptions.map((customer) => (
                                  <option key={customer.id} value={customer.id}>
                                    {customer.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600">
                              Existing location
                              <select
                                name="existing_location_id"
                                defaultValue=""
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              >
                                <option value="">Select existing location</option>
                                {permitJobLocationOptions.map((location) => (
                                  <option key={location.id} value={location.id}>
                                    {location.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600">
                              Customer first name
                              <input
                                name="customer_first_name"
                                defaultValue={permitRequest.customerFirstNameSnapshot ?? ""}
                                maxLength={120}
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600">
                              Customer last name
                              <input
                                name="customer_last_name"
                                defaultValue={permitRequest.customerLastNameSnapshot ?? ""}
                                maxLength={120}
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600">
                              Customer email
                              <input
                                type="email"
                                name="customer_email"
                                maxLength={240}
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600">
                              Customer phone
                              <input
                                name="customer_phone"
                                maxLength={80}
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600 md:col-span-2">
                              New location address line 1
                              <input
                                name="address_line1"
                                maxLength={240}
                                placeholder={permitRequest.serviceAddressTextSnapshot ?? "Street address"}
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              />
                              {permitRequest.serviceAddressTextSnapshot ? (
                                <span className="text-[11px] font-medium text-slate-500">
                                  Intake hint: {permitRequest.serviceAddressTextSnapshot}
                                </span>
                              ) : null}
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600">
                              City
                              <input
                                name="city"
                                maxLength={120}
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600">
                              State
                              <input
                                name="state"
                                defaultValue="CA"
                                maxLength={40}
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600">
                              Zip
                              <input
                                name="zip"
                                maxLength={40}
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600">
                              Location nickname
                              <input
                                name="location_nickname"
                                maxLength={160}
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              />
                            </label>
                            <div className="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[12px] leading-5 text-slate-600 md:col-span-2">
                              <div>
                                <span className="font-semibold text-slate-700">Ready for Testing:</span>{" "}
                                Creates an unscheduled ECC testing job and moves it to Scheduling.
                              </div>
                              <div>
                                <span className="font-semibold text-slate-700">Pending Install:</span>{" "}
                                Creates an ECC testing job and places it On Hold — Pending Install.
                              </div>
                              <div>
                                Existing customer/location selections are account-scoped. New location fields are explicit and are not parsed from the intake address hint.
                              </div>
                            </div>
                            <div className="flex justify-end md:col-span-2">
                              <button
                                type="submit"
                                className="inline-flex min-h-9 items-center rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-800"
                              >
                                Create Job & Mark Permit Created
                              </button>
                            </div>
                          </form>
                        )}
                      </details>

                      <div className="mt-1.5 grid gap-1 text-[12px] leading-5 text-slate-600 sm:grid-cols-2">
                        {permitRequest.permitNumber ? (
                          <div>
                            <span className="font-medium text-slate-500">Permit #:</span>{" "}
                            {permitRequest.permitNumber}
                          </div>
                        ) : null}
                        <div>
                          <span className="font-medium text-slate-500">Updated:</span>{" "}
                          {formatPermitQueueTimestamp(permitRequest.updatedAt)}
                        </div>
                        {permitRequest.contractorNote ? (
                          <div className="sm:col-span-2">
                            <span className="font-medium text-slate-500">Contractor note:</span>{" "}
                            {permitRequest.contractorNote}
                          </div>
                        ) : null}
                        {permitRequest.internalIntakeNote ? (
                          <div className="sm:col-span-2">
                            <span className="font-medium text-slate-500">Internal note:</span>{" "}
                            {permitRequest.internalIntakeNote}
                          </div>
                        ) : null}
                      </div>
                    </QueueCard>
                    );
                  })}
                </div>
              )
            ) : selectedWorkspaceKey === "contractor_intake" ? (
              selectedContractorIntakeRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                  <div>No contractor-submitted work is waiting for review.</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedContractorIntakeRows.map((submission) => (
                    <QueueCard
                      key={submission.id}
                      href={submission.detailHref}
                      title={submission.proposedTitle}
                      subtitle={`${submission.customerDisplay} - ${submission.addressDisplay}`}
                      actionLabel="Review Intake"
                      tagsColumns={2}
                      tags={[
                        { label: "Contractor", value: submission.contractorName },
                        {
                          label: "Submitted",
                          value: `${submission.submittedAgeDays} days ago - ${submission.submittedAtDisplay}`,
                        },
                        { label: "Proposed customer", value: submission.customerDisplay },
                        { label: "Address", value: submission.addressDisplay },
                        {
                          label: "Job/project",
                          value: `${submission.jobTypeLabel} / ${submission.projectTypeLabel}`,
                        },
                        { label: "Review status", value: submission.reviewStatus },
                        ...(submission.notesPreview
                          ? [{ label: "Notes", value: submission.notesPreview, fullWidth: true }]
                          : []),
                      ]}
                    />
                  ))}
                </div>
              )
            ) : !selectedWorkspaceSection || selectedWorkspaceSection.previewRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                <div>{hasActiveOpsBoardFilters ? "No jobs match these filters." : "No jobs in this queue right now."}</div>
                {hasActiveOpsBoardFilters ? (
                  <Link href={clearOpsBoardFiltersHref} className="mt-2 inline-flex font-semibold text-blue-700 underline-offset-2 hover:underline">
                    Clear filters
                  </Link>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                {selectedWorkspaceSection.key === "closeout" && canViewFieldPaymentVerificationAttention
                  ? (fieldPaymentReconciliationAttention?.items ?? []).map((item) => workspaceFieldPaymentReviewCard(item))
                  : null}
                {selectedWorkspaceSection.previewRows.map((job: any) => {
                  const visibleReason = workspaceVisibleReasonDisplay(job, selectedWorkspaceSection.key);
                  if (selectedWorkspaceSection.key === "need_to_schedule") {
                    return workspaceNeedsSchedulingRichCard(job, visibleReason);
                  }
                  if (selectedWorkspaceSection.key === "closeout") {
                    return workspaceCloseoutRichCard(job, visibleReason);
                  }

                  return (
                    <QueueCard
                      key={String(job?.id ?? "")}
                      href={`/jobs/${job.id}?tab=ops`}
                      title={workspaceTitle(job)}
                      subtitle={workspaceCustomerLocation(job)}
                      actionLabel="Open Job"
                      tags={[
                        {
                          label: "Status/Reason",
                          value: visibleReason.label,
                          detail: visibleReason.detail || undefined,
                        },
                        {
                          label: "Days Aging",
                          value: workspaceAgeLabel(job),
                        },
                        {
                          label: "Assignment",
                          value: formatAssignmentSummaryForJob(String(job?.id ?? ""), selectedPreviewAssignmentDisplayMap),
                        },
                        ...(workspaceContractorName(job)
                          ? [{ label: "Contractor", value: workspaceContractorName(job) }]
                          : []),
                      ]}
                    />
                  );
                })}
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
