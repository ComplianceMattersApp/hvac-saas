// app/ops/page
import Link from "next/link";
import ContractorFocusSelector from "./_components/ContractorFocusSelector";
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
import { listSenderWorkshareConnectionsForReceiver } from "@/lib/workflows/account-workshare-connections-read";
import { countReturnedWorkshareRequestsForSender } from "@/lib/workflows/account-workshare-requests-read";

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
  buildOpsStatusEnteredAtByJob,
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
  getOpsBoardReasonLabel,
  getOpsBoardVisibleReason,
  normalizeOpsBoardReason,
  type OpsBoardVisibleReason,
} from "@/lib/ops/ops-board-reasons";
import OpsBoardActiveQueuePanel, {
  type OpsBoardActiveQueueRow,
} from "./_components/OpsBoardActiveQueuePanel";
import type {
  CloseoutRowView,
  FieldPaymentReviewRowView,
  FollowUpRowView,
  GenericRowView,
  NeedsSchedulingRowView,
  OpsQueueRowView,
} from "./_components/OpsQueueRowCard";
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


type ContractorFocusOption = {
  id: string;
  name: string;
  count: number;
  selected: boolean;
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
    normalized === "follow_ups" ||
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

const INTERNAL_WORK_CONTRACTOR_FOCUS_ID = "__internal_work";

function normalizeContractorFocusIds(value: unknown) {
  const rawValues = Array.isArray(value) ? value : [value];
  const ids = rawValues
    .flatMap((item) => String(item ?? "").split(","))
    .map((item) => item.trim())
    .filter(Boolean);

  return Array.from(new Set(ids));
}

export default async function OpsPage({
  searchParams,
}: {
  searchParams?: Promise<{
  bucket?: string;
  create?: string;
  contractor?: string | string[];
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
  const contractorFocusIdsFromQuery = normalizeContractorFocusIds(sp.contractor);
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
  const access = await resolveDualContextAccess({
    supabase,
    user,
    getPortalAdmin: createAdminClient,
  });

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

  const [incomingWorkshareConnectionRows, returnedWorkshareCount] = await Promise.all([
    listSenderWorkshareConnectionsForReceiver(supabase, internalUser.account_owner_user_id),
    countReturnedWorkshareRequestsForSender(supabase, internalUser.account_owner_user_id),
  ]);
  // Show the incoming ECC/HERS request queue only to accounts that have an active
  // workshare connection where they are the receiver — no point surfacing an empty
  // queue to accounts that have not set up connections yet.
  const hasActiveIncomingWorkshareConnection = incomingWorkshareConnectionRows.some(
    (row) => row.status === "active",
  );

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
  const showContractorFocusSelection = productMode === "ecc_hers" || productMode === "hybrid";
  const contractorIntakeQueueAvailable = isContractorIntakeQueueAvailableForProductMode(productMode);
  const contractorFocusIds = showContractorFocusSelection ? contractorFocusIdsFromQuery : [];
  const contractorScopeFilter =
    contractorFocusIds.length === 1 && contractorFocusIds[0] !== INTERNAL_WORK_CONTRACTOR_FOCUS_ID
      ? contractorFocusIds[0]
      : null;
  const contractorFocusFilter = contractorFocusIds.length > 0 ? contractorFocusIds.join(",") : null;
  const contractorFocusIdSet = new Set(contractorFocusIds);
  const permitWorkflowEnabled = isPermitWorkflowEnabledForAccountOwner(internalUser.account_owner_user_id);

  const _t_businessIdentity = opsTimingEnabled ? Date.now() : 0;
  const operationalTenantIdentityPromise = resolveOperationalTenantIdentity({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  }).then((result) => {
    if (opsTimingEnabled) console.log(`[ops:businessIdentity] ${Date.now() - _t_businessIdentity}ms`);
    return result;
  });

  function cityFromPermitJurisdiction(value?: string | null) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    return raw.replace(/^city\s+of\s+/i, "").trim();
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
  let followUpEnteredAtByJob = new Map<string, string>();
  let latestJobEventByJob = new Map<string, any>();
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

  function buildLatestJobEventByJob(events: any[]) {
    const latestByJob = new Map<string, any>();
    for (const event of Array.isArray(events) ? events : []) {
      const jobId = String(event?.job_id ?? "").trim();
      if (!jobId) continue;

      const current = latestByJob.get(jobId);
      if (!current || toEpochMs(event?.created_at) > toEpochMs(current?.created_at)) {
        latestByJob.set(jobId, event);
      }
    }
    return latestByJob;
  }

  function buildFollowUpEnteredAtByJob(events: any[]) {
    const enteredByJob = new Map<string, string>();
    for (const event of Array.isArray(events) ? events : []) {
      const jobId = String(event?.job_id ?? "").trim();
      const createdAt = String(event?.created_at ?? "").trim();
      if (!jobId || !createdAt || enteredByJob.has(jobId)) continue;

      const changes = Array.isArray(event?.meta?.changes) ? event.meta.changes : [];
      const hasReminderEntered = changes.some((change: any) => {
        const field = String(change?.field ?? "").trim().toLowerCase();
        if (!["follow_up_date", "next_action_note", "action_required_by"].includes(field)) return false;
        return Boolean(String(change?.to ?? "").trim());
      });

      if (hasReminderEntered) enteredByJob.set(jobId, createdAt);
    }
    return enteredByJob;
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

  function compactDurationSince(value?: string | null) {
    const startMs = toEpochMs(value);
    if (!startMs) return "Unknown";

    const elapsedMs = Math.max(0, Date.now() - startMs);
    const days = Math.floor(elapsedMs / 86_400_000);
    if (days >= 1) return `${days}d`;

    const hours = Math.floor(elapsedMs / 3_600_000);
    if (hours >= 1) return `${hours}h`;

    return "Today";
  }

  function formatJobEventLabel(event: any) {
    const message = String(event?.message ?? "").replace(/\s+/g, " ").trim();
    if (message) return message.length > 42 ? `${message.slice(0, 39)}...` : message;

    const eventType = String(event?.event_type ?? "").trim();
    if (!eventType) return "Updated";
    return eventType.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
  }

  function workspaceQueueEnteredAt(job: any, queueKey: string) {
    const jobId = String(job?.id ?? "").trim();
    const opsStatus = String(job?.ops_status ?? "").trim().toLowerCase();

    if (queueKey === "follow_ups") {
      return (jobId ? followUpEnteredAtByJob.get(jobId) ?? null : null) || String(job?.created_at ?? "").trim() || null;
    }

    if (queueKey === "closeout") {
      return String(job?.field_complete_at ?? "").trim() || (jobId ? opsStatusEnteredAtByJob.get(jobId)?.[opsStatus] ?? null : null) || String(job?.created_at ?? "").trim() || null;
    }

    if (queueKey === "exceptions") {
      return (jobId ? opsStatusEnteredAtByJob.get(jobId)?.[opsStatus] ?? null : null) || failedStatusSinceByJob(jobId) || String(job?.created_at ?? "").trim() || null;
    }

    return (jobId ? opsStatusEnteredAtByJob.get(jobId)?.[opsStatus] ?? null : null) || String(job?.created_at ?? "").trim() || null;
  }

  function workspaceQueueClockTag(job: any, queueKey: string) {
    const enteredAt = workspaceQueueEnteredAt(job, queueKey);
    if (!enteredAt) return workspaceAgeLabel(job);
    return `${compactDurationSince(enteredAt)} · ${formatWorkspaceTimestamp(enteredAt)}`;
  }

  function workspaceQueueAgeDays(job: any, queueKey: string): number | null {
    const enteredAt = workspaceQueueEnteredAt(job, queueKey);
    const startMs = toEpochMs(enteredAt);
    if (!startMs) return null;
    return Math.floor(Math.max(0, Date.now() - startMs) / 86_400_000);
  }

  function workspaceQueueAgeChipLabel(job: any, queueKey: string): string {
    const days = workspaceQueueAgeDays(job, queueKey);
    return days === null ? "In queue" : `In queue ${days}d`;
  }

  function deriveOpsQueueStateChips(
    reasonLabel: string,
    assignmentSummary?: string
  ): { label: string; tone: "rose" | "amber" | "slate" | "green" }[] {
    const chips: { label: string; tone: "rose" | "amber" | "slate" | "green" }[] = [];
    const normalized = reasonLabel.trim().toLowerCase();

    if (normalized.startsWith("failed ecc")) {
      chips.push({ label: "Failed ECC", tone: "rose" });
    } else if (normalized === "needs retest") {
      chips.push({ label: "Needs Retest", tone: "amber" });
    } else if (normalized === "on hold") {
      chips.push({ label: "On Hold", tone: "slate" });
    } else if (normalized === "blocked" || normalized === "missing information") {
      chips.push({ label: reasonLabel, tone: "amber" });
    }

    if (assignmentSummary && assignmentSummary.trim().toLowerCase() === "unassigned") {
      chips.push({ label: "Unassigned", tone: "amber" });
    }

    return chips;
  }

  function deriveOpsQueueCardTone(
    stateChips: { tone: "rose" | "amber" | "slate" | "green" }[]
  ): "rose" | "amber" | "slate" | "green" {
    if (stateChips.some((chip) => chip.tone === "rose")) return "rose";
    if (stateChips.some((chip) => chip.tone === "amber")) return "amber";
    return "slate";
  }

  function workspaceLastActionTag(job: any) {
    const jobId = String(job?.id ?? "").trim();
    const latestEvent = jobId ? latestJobEventByJob.get(jobId) : null;
    if (latestEvent?.created_at) {
      return `${formatJobEventLabel(latestEvent)} · ${formatWorkspaceTimestamp(String(latestEvent.created_at))}`;
    }

    const createdAt = String(job?.created_at ?? "").trim();
    return createdAt ? `Created · ${formatWorkspaceTimestamp(createdAt)}` : "No activity";
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
      next_action_note: job?.next_action_note ?? null,
      ops_board_failure_note: job?.ops_board_failure_note ?? null,
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

    const failedNote = String(job?.ops_board_failure_note ?? "").trim();
    if (failedNote) return `Failed Test - ${failedNote}`;

    const jobId = String(job?.id ?? "").trim();
    return (jobId ? primaryFailureReasonByJob.get(jobId) ?? "" : "") || "Failed";
  }

  const wsStartTodayUtc = startOfTodayUtcIsoLA();
  const wsStartTomorrowUtc = startOfTomorrowUtcIsoLA();

    const workspaceSelect =
      "id, title, status, job_type, ops_status, scheduled_date, window_start, window_end, city, job_address, customer_first_name, customer_last_name, customer_phone, pending_info_reason, on_hold_reason, follow_up_date, next_action_note, action_required_by, ops_board_failure_note, permit_number, jurisdiction, permit_date, field_complete, field_complete_at, invoice_complete, billing_disposition, certs_complete, contractor_id, contractors(name), created_at";
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

    const _t_workspaceCounts = opsTimingEnabled ? Date.now() : 0;

    function opsStatusCountQuery(opsStatus: string, options?: { requireOpenStatus?: boolean }) {
      let q = supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .eq("ops_status", opsStatus);

      if (options?.requireOpenStatus) q = q.eq("status", "open");
      return q;
    }

    const followUpTodayDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const needToScheduleCountQ = opsStatusCountQuery("need_to_schedule", { requireOpenStatus: true });
    const pendingInfoCountQ = opsStatusCountQuery("pending_info");
    const onHoldCountQ = opsStatusCountQuery("on_hold");
    const waitingStatusCountQ = opsStatusCountQuery("waiting");
    const pendingOfficeReviewCountQ = opsStatusCountQuery("pending_office_review");
    const failedCountQ = opsStatusCountQuery("failed");
    const retestNeededCountQ = opsStatusCountQuery("retest_needed");
    const problemCountQ = opsStatusCountQuery("problem");
    const followUpReminderCountQ = supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .or("follow_up_date.not.is.null,next_action_note.not.is.null,action_required_by.not.is.null");

    let fieldWorkCountQ = supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .neq("ops_status", "closed")
      .eq("field_complete", false)
      .gte("scheduled_date", wsStartTodayUtc)
      .lt("scheduled_date", wsStartTomorrowUtc);

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

    let closeoutCountRowsQ = supabase
      .from("jobs")
      .select(workspaceSelect)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .eq("field_complete", true)
      .order("created_at", { ascending: false })
      .limit(500);

    const [
      needToScheduleCountRes,
      pendingInfoCountRes,
      onHoldCountRes,
      waitingStatusCountRes,
      pendingOfficeReviewCountRes,
      failedCountRes,
      retestNeededCountRes,
      problemCountRes,
      followUpReminderCountRes,
      fieldWorkCountRes,
      scheduledOpenRowsRes,
      closeoutCountRowsRes,
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
      followUpReminderCountQ,
      fieldWorkCountQ,
      scheduledOpenRowsQ,
      closeoutCountRowsQ,
      contractorIntakeQueueAvailable
        ? countPendingContractorIntakeQueueRows({
            supabase: admin,
            accountOwnerUserId: internalUser.account_owner_user_id,
          })
        : Promise.resolve(0),
      listInternalContractorUpdateAwareness({ limit: 100, onlyUnread: true }),
      listInternalNewWorkRequestAwareness({ limit: 100, onlyUnread: true }),
      permitWorkflowEnabled
        ? listActivePermitRequestQueueRowsIfAvailable({
            supabase: supabase as any,
            accountOwnerUserId: internalUser.account_owner_user_id,
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
    if (followUpReminderCountRes.error) throw followUpReminderCountRes.error;
    if (fieldWorkCountRes.error) throw fieldWorkCountRes.error;
    if (scheduledOpenRowsRes.error) throw scheduledOpenRowsRes.error;
    if (closeoutCountRowsRes.error) throw closeoutCountRowsRes.error;

    const countsWs = new Map<string, number>([
      ["need_to_schedule", needToScheduleCountRes.count ?? 0],
      ["pending_info", pendingInfoCountRes.count ?? 0],
      ["on_hold", onHoldCountRes.count ?? 0],
      ["waiting", waitingStatusCountRes.count ?? 0],
      ["pending_office_review", pendingOfficeReviewCountRes.count ?? 0],
      ["failed", failedCountRes.count ?? 0],
      ["retest_needed", retestNeededCountRes.count ?? 0],
      ["problem", problemCountRes.count ?? 0],
      ["follow_ups", followUpReminderCountRes.count ?? 0],
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

    const closeoutCountSourceRows = closeoutCountRowsRes.data ?? [];
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
        href: "/ops/field",
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
        key: "follow_ups",
        label: "Follow Ups",
        count: countsWs.get("follow_ups") ?? 0,
        href: `/ops${buildQueryString({ bucket: "follow_ups", contractor: contractorScopeFilter ?? "" })}#ops-workspace`,
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
      follow_ups: "follow_ups",
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
      // Invoice-needed closeout is status-invariant. Failed/on-hold/pending status
      // may add exception routing, but must not suppress closeout invoice reminder.
      const closeoutRowsRes = await supabase
        .from("jobs")
        .select(workspaceSelect)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .eq("field_complete", true)
        .order("created_at", { ascending: true })
        .limit(500);
      if (closeoutRowsRes.error) throw closeoutRowsRes.error;

      const closeoutSourceRows = closeoutRowsRes.data ?? [];
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
          limit: CONTRACTOR_INTAKE_QUEUE_PAGE_LIMIT,
        });
      }

      const tabCount = workspaceTabs.find((item) => item.key === workspaceKey)?.count ?? 0;
      const queuePreviewLimit = Math.max(tabCount, 10);

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
      } else if (workspaceKey === "follow_ups") {
        queueQ = queueQ
          .or("follow_up_date.not.is.null,next_action_note.not.is.null,action_required_by.not.is.null")
          .order("follow_up_date", { ascending: true, nullsFirst: false });
      } else if (workspaceKey === "permits") {
        return [];
      } else {
        return [];
      }

      const queueRes = await queueQ;
      if (queueRes.error) throw queueRes.error;
      return sortOpsBoardRows(queueRes.data ?? [], boardSort);
    }

    // Contractor Focus lives in the SSR-only right rail, but the job-queue
    // chips (Waiting, Field Work, Exceptions, …) switch client-side without a
    // server re-render. If we scoped the picker's contractors to the initially
    // rendered bucket, switching to another queue client-side would leave the
    // picker listing the wrong bucket's contractors. So source the picker from
    // every open job across the job queues — the list stays complete and stable
    // no matter which bucket is being viewed. Row filtering still narrows the
    // currently visible queue via contractorFocusIdSet.
    async function loadActiveQueueContractorFocusSourceRows() {
      const queueRes = await supabase
        .from("jobs")
        .select(workspaceSelect)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .neq("ops_status", "closed")
        .order("created_at", { ascending: true });

      if (queueRes.error) throw queueRes.error;
      return queueRes.data ?? [];
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
    const reasonFilteredWorkspaceSections = reasonSourceWorkspaceSections.map((section) => ({
      ...section,
      previewRows: filterOpsBoardRowsByReason(section.previewRows, effectiveBoardReasonFilter, { queueKey: section.key }),
    }));

    function rowContractorFocusId(row: any) {
      if (selectedWorkspaceKey === "contractor_intake" || selectedWorkspaceKey === "permits") {
        return String(row?.contractorId ?? "").trim();
      }
      return String(row?.contractor_id ?? "").trim();
    }

    function rowContractorFocusName(row: any) {
      if (selectedWorkspaceKey === "contractor_intake" || selectedWorkspaceKey === "permits") {
        return String(row?.contractorName ?? "").trim();
      }
      return String(row?.contractors?.name ?? "").trim();
    }

    function filterRowsByContractorFocus(rows: any[]) {
      if (contractorFocusIdSet.size === 0) return rows;
      return rows.filter((row) => {
        const rowContractorId = rowContractorFocusId(row);
        return rowContractorId
          ? contractorFocusIdSet.has(rowContractorId)
          : contractorFocusIdSet.has(INTERNAL_WORK_CONTRACTOR_FOCUS_ID);
      });
    }

    const visibleWorkspaceSections = reasonFilteredWorkspaceSections.map((section) => ({
      ...section,
      previewRows: filterRowsByContractorFocus(section.previewRows),
    }));
    const selectedWorkspaceSection =
      visibleWorkspaceSections.find((section) => section.key === selectedWorkspaceKey) ?? visibleWorkspaceSections[0];
    const selectedPermitRows = selectedWorkspaceKey === "permits" ? filterRowsByContractorFocus(activePermitRequestRows) : [];
    const selectedContractorIntakeRows =
      selectedWorkspaceKey === "contractor_intake"
        ? ((selectedWorkspaceSection?.previewRows ?? []) as ContractorIntakeQueueRow[])
        : [];
    const selectedPreviewRows =
      selectedWorkspaceKey === "permits" || selectedWorkspaceKey === "contractor_intake"
        ? []
        : visibleWorkspaceSections.flatMap((section) => section.previewRows);
    const selectedWorkspacePreviewCount =
      selectedWorkspaceKey === "permits"
        ? selectedPermitRows.length
        : selectedWorkspaceKey === "contractor_intake"
        ? selectedContractorIntakeRows.length
        : selectedWorkspaceSection?.previewRows.length ?? 0;
    const selectedWorkspaceTotalCount =
      selectedWorkspaceKey === "permits"
        ? selectedPermitRows.length
        : selectedWorkspaceKey === "contractor_intake"
        ? selectedContractorIntakeRows.length
        : selectedWorkspaceSection?.count ?? selectedPreviewRows.length;
    const selectedWorkspaceTab = {
      ...visibleWorkspaceSections[0],
      count: selectedWorkspaceTotalCount,
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
          : workspaceKey === "follow_ups"
          ? "follow_ups"
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
          : workspaceKey === "follow_ups"
          ? "Follow Ups"
          : workspaceKey === "permits"
          ? "Permits"
          : section.label,
        isSelected,
        previewRows,
        count: section.count,
        href: `/ops${buildQueryString({
          bucket: chipBucket,
          contractor: contractorFocusFilter ?? "",
          sort: boardSort === "oldest" ? "" : boardSort,
        })}#ops-workspace`,
      };
    });
    const hiddenTodayWorkspaceTabs = workspaceTabs.filter(
      (tab) => tab.key === "without_tech" || tab.key === "updates"
    );
    const clearOpsBoardFiltersHref = `/ops${buildQueryString({
      bucket: effectiveBoardBucketFilter,
      sort: boardSort === "oldest" ? "" : boardSort,
    })}#ops-workspace`;
    const hasActiveOpsBoardFilters = contractorFocusIds.length > 0 || Boolean(effectiveBoardReasonFilter);

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

    const selectedPreviewJobEventsRes = selectedPreviewJobIds.length
      ? await supabase
          .from("job_events")
          .select("job_id, event_type, created_at, message, meta")
          .in("job_id", selectedPreviewJobIds)
          .order("created_at", { ascending: false })
          .limit(1000)
      : { data: [], error: null };

    if (selectedPreviewJobEventsRes.error) throw selectedPreviewJobEventsRes.error;

    const selectedPreviewJobEvents = selectedPreviewJobEventsRes.data ?? [];
    opsStatusEnteredAtByJob = buildOpsStatusEnteredAtByJob(
      selectedPreviewJobEvents.filter((event: any) => String(event?.event_type ?? "") === "ops_update"),
    );
    followUpEnteredAtByJob = buildFollowUpEnteredAtByJob(selectedPreviewJobEvents);
    latestJobEventByJob = buildLatestJobEventByJob(selectedPreviewJobEvents);

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
    const contractorFocusSourceRows =
      selectedWorkspaceKey === "permits"
        ? activePermitRequestRows
        : selectedWorkspaceKey === "contractor_intake"
        ? reasonFilteredWorkspaceSections.find((section) => section.key === selectedWorkspaceKey)?.previewRows ?? []
        : await loadActiveQueueContractorFocusSourceRows();
    const contractorFocusCounts = new Map<string, number>();
    const contractorFocusNameById = new Map<string, string>();
    let contractorFocusInternalCount = 0;
    for (const row of contractorFocusSourceRows) {
      const contractorId = rowContractorFocusId(row);
      if (contractorId) {
        contractorFocusCounts.set(contractorId, (contractorFocusCounts.get(contractorId) ?? 0) + 1);
        if (!contractorFocusNameById.has(contractorId)) {
          const rowName = rowContractorFocusName(row);
          if (rowName) contractorFocusNameById.set(contractorId, rowName);
        }
      } else contractorFocusInternalCount += 1;
    }
    const showWorkspaceContractorFilter =
      showContractorFocusSelection && (workspaceContractors.length > 0 || contractorFocusInternalCount > 0);
    // Selectable options = the union of lifecycle-active contractors and any
    // contractor that actually owns a job in this queue. A queued job can be
    // assigned to a contractor that is not lifecycle-active (or to a duplicate
    // contractor record), which previously left it visible in the queue but
    // absent from — or zeroed out in — the focus filter, so it could never be
    // selected (the "Top Rank isn't selectable" bug). De-dupe by name, and when
    // an active-list record has no queued jobs but a same-named queue contractor
    // does, point the option at the id that owns the jobs so the checkbox
    // actually filters to the rows the user can see.
    const contractorFocusByName = new Map<string, { id: string; name: string; count: number }>();
    const focusNameKey = (name: string) => name.trim().toLowerCase();
    for (const contractorOption of workspaceContractors as Array<{ id: string; name: string | null }>) {
      const name = String(contractorOption.name ?? "").trim() || contractorOption.id;
      contractorFocusByName.set(focusNameKey(name), {
        id: contractorOption.id,
        name,
        count: contractorFocusCounts.get(contractorOption.id) ?? 0,
      });
    }
    for (const [contractorId, count] of contractorFocusCounts) {
      const name = contractorFocusNameById.get(contractorId) || contractorId;
      const key = focusNameKey(name);
      const existing = contractorFocusByName.get(key);
      if (!existing) {
        contractorFocusByName.set(key, { id: contractorId, name, count });
      } else if (existing.count === 0 && count > 0) {
        contractorFocusByName.set(key, { id: contractorId, name: existing.name, count });
      }
    }
    const contractorFocusOptions: ContractorFocusOption[] = Array.from(contractorFocusByName.values()).map(
      (entry): ContractorFocusOption => ({
        id: entry.id,
        name: entry.name,
        count: entry.count,
        selected: contractorFocusIdSet.has(entry.id),
      }),
    );
    const contractorFocusAllCount = contractorFocusSourceRows.length;
    const activeWorkspaceBaseHref = `/ops${buildQueryString({
      bucket: effectiveBoardBucketFilter,
      create: "",
      contractor: contractorFocusFilter ?? "",
      q: q ?? "",
      sort,
      reason: effectiveBoardReasonFilter ?? "",
      signal,
    })}`;
    const activeWorkspaceHref = `${activeWorkspaceBaseHref}#ops-workspace`;
    const canShowJobQueueExport = selectedWorkspaceKey !== "permits" && selectedWorkspaceKey !== "contractor_intake";
    const canExportContractorSafeCsv = contractorFocusIds.length > 0;

    function buildNeedsSchedulingRowView(job: any, visibleReason: OpsBoardVisibleReason): NeedsSchedulingRowView {
      const jobId = String(job?.id ?? "").trim();
      const recentAttemptDisplay = resolveRecentAttemptDisplay(selectedPreviewLatestCustomerAttemptByJob.get(jobId) ?? null);
      const contractorName = workspaceContractorName(job) || operationalTenantIdentity.displayName;
      const needsSchedulingStateChips = deriveOpsQueueStateChips(visibleReason.label);

      return {
        kind: "need_to_schedule",
        jobId,
        href: `/jobs/${jobId}?tab=ops`,
        title: workspaceTitle(job),
        subtitle: workspaceCustomerLocation(job),
        reasonLabel: visibleReason.label,
        reasonDetail: visibleReason.detail,
        ageLabel: workspaceQueueAgeChipLabel(job, "need_to_schedule"),
        ageDays: workspaceQueueAgeDays(job, "need_to_schedule"),
        stateChips: needsSchedulingStateChips,
        tone: deriveOpsQueueCardTone(needsSchedulingStateChips),
        lastActionText: workspaceLastActionTag(job),
        recentAttemptText: recentAttemptDisplay,
        contractorName,
        phone: String(job?.customer_phone ?? "").trim(),
        scheduleDateText: job?.scheduled_date ? formatBusinessDateUS(String(job.scheduled_date)) : "Not scheduled",
        scheduleWindowText: displayWindowLA(job?.window_start, job?.window_end) || (job?.scheduled_date ? "Window TBD" : ""),
        scheduledDateRaw: String(job?.scheduled_date ?? ""),
        windowStartInput: timeToTimeInput(job?.window_start),
        windowEndInput: timeToTimeInput(job?.window_end),
        permitNumber: String(job?.permit_number ?? ""),
        jurisdiction: String(job?.jurisdiction ?? ""),
        permitDate: String(job?.permit_date ?? ""),
        returnToHref: activeWorkspaceHref,
      };
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

    function buildCloseoutRowView(job: any, visibleReason: OpsBoardVisibleReason): CloseoutRowView {
      const jobId = String(job?.id ?? "").trim();
      const projection = selectedWorkspaceCloseoutProjectionByJob.get(jobId) ?? job;
      const needs = getCloseoutNeeds(projection);
      const canMarkExternalInvoiceSent = canShowExternalInvoiceSentAction({
        needsInvoice: needs.needsInvoice,
        billingState: projection?.billingState ?? null,
      });
      const assignmentSummary = formatAssignmentSummaryForJob(jobId, selectedPreviewAssignmentDisplayMap);
      const closeoutStateChips = deriveOpsQueueStateChips(visibleReason.label, assignmentSummary);
      const needsLabel =
        needs.needsInvoice && needs.needsCerts
          ? "Invoice + paperwork"
          : needs.needsInvoice
          ? "Invoice"
          : needs.needsCerts
          ? "Paperwork"
          : "Review";

      return {
        kind: "closeout",
        jobId,
        cardDomId: `ops-workspace-closeout-job-${jobId}`,
        href: `/jobs/${jobId}?tab=ops`,
        title: workspaceTitle(job),
        subtitle: workspaceCustomerLocation(job),
        reasonLabel: visibleReason.label,
        reasonDetail: visibleReason.detail,
        ageLabel: workspaceQueueAgeChipLabel(job, "closeout"),
        ageDays: workspaceQueueAgeDays(job, "closeout"),
        stateChips: closeoutStateChips,
        tone: deriveOpsQueueCardTone(closeoutStateChips),
        lastActionText: workspaceLastActionTag(job),
        needsLabel,
        contractorName: workspaceContractorName(job),
        scheduledText: job?.scheduled_date ? formatBusinessDateUS(String(job.scheduled_date)) : "",
        assignmentSummary,
        nextStepText: getCloseoutQueueNextStepLabel(projection),
        phone: String(job?.customer_phone ?? "").trim(),
        canMarkExternalInvoiceSent,
        returnToHref: `${activeWorkspaceBaseHref}#ops-workspace-closeout-job-${jobId}`,
      };
    }

    function formatFollowUpOwner(value: unknown) {
      const normalized = String(value ?? "").trim().toLowerCase();
      if (normalized === "customer") return "Customer";
      if (normalized === "contractor") return "Contractor";
      if (normalized === "rater") return "Rater";
      return "Office";
    }

    function businessDateToUtcMs(value: string) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
      if (!match) return null;
      const [, year, month, day] = match;
      return Date.UTC(Number(year), Number(month) - 1, Number(day));
    }

    function followUpUrgency(dueDate: string) {
      const dueMs = businessDateToUtcMs(dueDate);
      const todayMs = businessDateToUtcMs(followUpTodayDate);
      if (dueMs === null || todayMs === null) {
        return {
          variant: "follow-up-unscheduled",
          label: "Needs date",
        };
      }

      const daysUntilDue = Math.round((dueMs - todayMs) / 86_400_000);
      if (daysUntilDue < 0) {
        return {
          variant: "follow-up-overdue",
          label: `${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? "" : "s"} overdue`,
        };
      }
      if (daysUntilDue === 0) {
        return {
          variant: "follow-up-due",
          label: "Due today",
        };
      }
      if (daysUntilDue <= 2) {
        return {
          variant: "follow-up-soon",
          label: `Due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`,
        };
      }
      return {
        variant: "follow-up-future",
        label: `Due in ${daysUntilDue} days`,
      };
    }

    function buildFollowUpRowView(job: any): FollowUpRowView {
      const jobId = String(job?.id ?? "").trim();
      const note = String(job?.next_action_note ?? "").trim() || "No reminder note added.";
      const dueDate = String(job?.follow_up_date ?? "").trim();
      const owner = formatFollowUpOwner(job?.action_required_by);
      const statusLabel = getOpsQueueCardStatusReason(job);
      const urgency = followUpUrgency(dueDate);
      const urgencyTone =
        urgency.variant === "follow-up-overdue" || urgency.variant === "follow-up-due"
          ? "rose"
          : urgency.variant === "follow-up-soon" || urgency.variant === "follow-up-unscheduled"
          ? "amber"
          : "slate";

      return {
        kind: "follow_ups",
        jobId,
        cardDomId: `ops-workspace-follow-up-job-${jobId}`,
        href: `/jobs/${jobId}/v2#followup`,
        title: workspaceTitle(job),
        subtitle: workspaceCustomerLocation(job),
        dueText: dueDate ? formatBusinessDateUS(dueDate) : "No date set",
        urgencyLabel: urgency.label,
        urgencyTone,
        ageLabel: workspaceQueueAgeChipLabel(job, "follow_ups"),
        ageDays: workspaceQueueAgeDays(job, "follow_ups"),
        lastActionText: workspaceLastActionTag(job),
        owner,
        statusLabel,
        note,
      };
    }

    function buildGenericRowView(job: any, visibleReason: OpsBoardVisibleReason, queueKey: string): GenericRowView {
      const jobId = String(job?.id ?? "").trim();
      const fallbackAssignmentSummary = formatAssignmentSummaryForJob(jobId, selectedPreviewAssignmentDisplayMap);
      const fallbackStateChips = deriveOpsQueueStateChips(visibleReason.label, fallbackAssignmentSummary);

      return {
        kind: "generic",
        jobId,
        href: `/jobs/${jobId}?tab=ops`,
        title: workspaceTitle(job),
        subtitle: workspaceCustomerLocation(job),
        reasonLabel: visibleReason.label,
        reasonDetail: visibleReason.detail,
        ageLabel: workspaceQueueAgeChipLabel(job, queueKey),
        ageDays: workspaceQueueAgeDays(job, queueKey),
        stateChips: fallbackStateChips,
        tone: deriveOpsQueueCardTone(fallbackStateChips),
        lastActionText: workspaceLastActionTag(job),
        assignmentSummary: fallbackAssignmentSummary,
        contractorName: workspaceContractorName(job),
      };
    }

    function buildFieldPaymentReviewRowView(
      item: NonNullable<typeof fieldPaymentReconciliationAttention>["items"][number]
    ): FieldPaymentReviewRowView {
      return {
        kind: "field_payment_review",
        reportId: item.reportId,
        cardDomId: `ops-workspace-field-payment-${item.reportId}`,
        jobId: item.jobId,
        internalInvoiceId: item.internalInvoiceId,
        jobHref: item.links.jobHref,
        invoiceWorkspaceHref: item.links.invoiceWorkspaceHref,
        title: item.jobTitle || item.jobReference,
        subtitle: item.customerDisplayName || "Customer",
        amountText: formatWorkspaceUsdFromCents(item.amountCents),
        methodText: formatWorkspaceFieldPaymentMethod(item.paymentMethod),
        reportedText: formatWorkspaceTimestamp(item.reportedAt),
        reportedDetail: item.reportedByDisplayName,
        invoiceReference: item.invoiceReference,
        isSelfReported: item.reportedByUserId === user.id,
        returnToHref: `${activeWorkspaceBaseHref}#ops-workspace-field-payment-${item.reportId}`,
      };
    }

    const selectedWorkspaceItemNoun =
      selectedWorkspaceKey === "permits"
        ? "permit requests"
        : selectedWorkspaceKey === "contractor_intake"
        ? "intake submissions"
        : selectedWorkspaceKey === "follow_ups"
        ? "follow ups"
        : "jobs";
    const selectedWorkspaceCountText =
      selectedWorkspacePreviewCount === selectedWorkspaceTotalCount
        ? `${selectedWorkspaceTotalCount} ${selectedWorkspaceItemNoun}`
        : `Showing ${selectedWorkspacePreviewCount} of ${selectedWorkspaceTotalCount} ${selectedWorkspaceItemNoun}`;
    const activeQueueRows: OpsBoardActiveQueueRow[] =
      canShowJobQueueExport && selectedWorkspaceSection
        ? selectedWorkspaceSection.previewRows.map((job: any) => {
            const visibleReason = workspaceVisibleReasonDisplay(job, selectedWorkspaceSection.key);
            const view: OpsQueueRowView =
              selectedWorkspaceSection.key === "need_to_schedule"
                ? buildNeedsSchedulingRowView(job, visibleReason)
                : selectedWorkspaceSection.key === "closeout"
                ? buildCloseoutRowView(job, visibleReason)
                : selectedWorkspaceSection.key === "follow_ups"
                ? buildFollowUpRowView(job)
                : buildGenericRowView(job, visibleReason, selectedWorkspaceSection.key);
            return {
              id: String(job?.id ?? ""),
              reasonKey: getOpsBoardReasonLabel(workspaceReasonInput(job), { queueKey: selectedWorkspaceSection.key })?.key ?? null,
              sortable: {
                created_at: job?.created_at ?? null,
                scheduled_date: job?.scheduled_date ?? null,
                window_start: job?.window_start ?? null,
                customer_first_name: job?.customer_first_name ?? null,
                customer_last_name: job?.customer_last_name ?? null,
                contractors: { name: workspaceContractorName(job) || null },
              },
              view,
            };
          })
        : [];
    const activeQueuePinnedViews: FieldPaymentReviewRowView[] =
      canShowJobQueueExport && selectedWorkspaceSection?.key === "closeout" && canViewFieldPaymentVerificationAttention
        ? (fieldPaymentReconciliationAttention?.items ?? []).map((item) => buildFieldPaymentReviewRowView(item))
        : [];
    const queueHealthAgingOver30 = activeQueueRows.filter((row) => (row.view as any).ageDays != null && (row.view as any).ageDays > 30).length;
    const queueHealthBreakdown = new Map<string, number>();
    let queueHealthUnassigned = 0;
    for (const row of activeQueueRows) {
      const stateChips = "stateChips" in row.view ? row.view.stateChips : [];
      for (const chip of stateChips) {
        if (chip.label === "Unassigned") {
          queueHealthUnassigned += 1;
          continue;
        }
        queueHealthBreakdown.set(chip.label, (queueHealthBreakdown.get(chip.label) ?? 0) + 1);
      }
    }
    const queueHealthStats = {
      agingOver30: queueHealthAgingOver30,
      unassigned: queueHealthUnassigned,
      breakdown: Array.from(queueHealthBreakdown.entries()).map(([label, count]) => ({ label, count })),
    };
    const opsBoardHeaderRightActionByBucket: Partial<Record<string, { label: string; href: string }>> = {
      closeout: {
        label: "View all",
        href: `/ops/closeout-queue${contractorScopeFilter ? `?contractor=${encodeURIComponent(contractorScopeFilter)}` : ""}`,
      },
    };
    const JOB_QUEUE_BUCKETS = new Set(["pending", "field_work", "waiting", "exceptions", "closeout", "follow_ups"]);
    const opsBoardClientChips = workspaceQueueChips.map((chip) =>
      JOB_QUEUE_BUCKETS.has(chip.bucket)
        ? { kind: "switchable" as const, key: chip.key, bucket: chip.bucket, label: chip.label, mobileLabel: chip.mobileLabel, count: chip.count }
        : { kind: "link" as const, key: chip.key, href: chip.href, label: chip.label, mobileLabel: chip.mobileLabel, count: chip.count }
    );
    const opsBoardHiddenTodayChips = hiddenTodayWorkspaceTabs.map((tab) => ({
      key: tab.key,
      label: tab.label,
      count: tab.count,
      href: tab.href,
    }));
    const opsBoardBucketPreviewLimits = Object.fromEntries(
      workspaceQueueChips.map((chip) => [chip.bucket, Math.max(chip.count, 10)])
    );
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

        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="min-w-0 space-y-3 sm:space-y-4">
        <section className="rounded-3xl border border-slate-300/80 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(248,250,252,0.98)_56%,rgba(219,234,254,0.56))] p-4 shadow-[0_22px_54px_-34px_rgba(15,23,42,0.45)] ring-1 ring-slate-200/70 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700">
                <span className="inline-block h-[13px] w-[3px] rounded-full bg-blue-600" aria-hidden="true" />
                {operationalTenantIdentity.displayName}
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-navy sm:text-[2rem]">
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
              {returnedWorkshareCount > 0 ? (
                <Link href="/ops/workshare/returned" className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-[12px] font-semibold text-blue-800 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:-translate-y-px hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px] sm:py-1 sm:text-[11px]">
                  Returned Work · {returnedWorkshareCount}
                </Link>
              ) : null}
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
              {selectedWorkspacePreviewCount === selectedWorkspaceTotalCount
                ? `${selectedWorkspaceTotalCount} visible ${selectedWorkspaceItemNoun}`
                : `${selectedWorkspacePreviewCount} of ${selectedWorkspaceTotalCount} visible ${selectedWorkspaceItemNoun}`}
            </div>
          </div>

          {!canShowJobQueueExport ? (
          <>
          <div className="mb-3 flex flex-wrap gap-2" aria-label="Operations queue selector">
            {workspaceQueueChips.map((chip) => (
              <Link
                key={chip.key}
                href={chip.href}
                aria-current={chip.isSelected ? "page" : undefined}
                className={`inline-flex min-h-10 flex-[1_1_calc(50%-0.5rem)] items-center justify-center rounded-full border px-2.5 py-2 text-center text-[11px] font-semibold leading-tight transition-colors sm:min-h-9 sm:flex-none sm:px-3 sm:text-xs ${
                  chip.isSelected
                    ? "border-navy bg-navy text-white"
                    : chip.count === 0
                    ? "border-slate-200 bg-white text-slate-300 hover:bg-slate-50"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="sm:hidden">{chip.mobileLabel} · {chip.count}</span>
                <span className="hidden sm:inline">{chip.label} · {chip.count}</span>
              </Link>
            ))}
            {hiddenTodayWorkspaceTabs.map((tab) => (
              <Link
                key={tab.key}
                href={tab.href}
                className={`inline-flex min-h-10 flex-[1_1_calc(50%-0.5rem)] items-center justify-center rounded-full border px-2.5 py-2 text-center text-[11px] font-semibold leading-tight transition-colors sm:min-h-9 sm:flex-none sm:px-3 sm:text-xs ${
                  tab.count === 0
                    ? "border-slate-200 bg-white text-slate-300 hover:bg-slate-50"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span>{tab.label} · {tab.count}</span>
              </Link>
            ))}
          </div>

          <div className="mb-3 grid gap-2 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
            <form action="/ops" method="get" className="grid gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500 sm:text-[10px] sm:tracking-[0.12em]">Reason</label>
              <input type="hidden" name="contractor" value={contractorFocusFilter ?? ""} />
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
              <input type="hidden" name="contractor" value={contractorFocusFilter ?? ""} />
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
                {selectedWorkspaceCountText}
              </div>
            </div>
            {selectedWorkspaceKey === "contractor_intake" ? (
              <Link
                href={`/ops/contractor-intake/export${buildQueryString({
                  contractor: contractorFocusFilter ?? "",
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
                              Is the job ready to be tested?
                              <select
                                name="post_permit_route"
                                required
                                defaultValue=""
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              >
                                <option value="" disabled>Select next step</option>
                                <option value="ready_for_testing">Ready - schedule now or queue for scheduling</option>
                                <option value="pending_install">Waiting for install</option>
                              </select>
                            </label>
                            <div className="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[12px] leading-5 text-slate-600 md:col-span-2">
                              <div>
                                <span className="font-semibold text-slate-700">Ready:</span>{" "}
                                Moves the linked job to scheduling when it is unscheduled, or keeps it scheduled if it already has a time.
                              </div>
                              <div>
                                <span className="font-semibold text-slate-700">Waiting for install:</span>{" "}
                                Moves the linked job to Waiting / Pending Info as On Hold: Permit pulled and waiting for install.
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
                            <input type="hidden" name="customer_location_mode" value="new_new" />
                            <input type="hidden" name="customer_first_name" value={permitRequest.customerFirstNameSnapshot ?? ""} />
                            <input type="hidden" name="customer_last_name" value={permitRequest.customerLastNameSnapshot ?? ""} />
                            <input type="hidden" name="address_line1" value={permitRequest.serviceAddressTextSnapshot ?? ""} />
                            <input type="hidden" name="city" value={cityFromPermitJurisdiction(permitRequest.jurisdiction)} />
                            <input type="hidden" name="state" value="CA" />
                            <input type="hidden" name="zip" value="" />
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] font-medium leading-5 text-amber-950 md:col-span-2">
                              No job is linked yet. This will start the customer/job record from the permit intake below.
                            </div>
                            <div className="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] leading-5 text-slate-700 md:col-span-2">
                              <div className="font-semibold text-slate-900">Permit intake draft</div>
                              <div>
                                <span className="font-medium text-slate-500">Customer:</span>{" "}
                                {[permitRequest.customerFirstNameSnapshot, permitRequest.customerLastNameSnapshot].filter(Boolean).join(" ") || "Customer name pending"}
                              </div>
                              <div>
                                <span className="font-medium text-slate-500">Service address:</span>{" "}
                                {permitRequest.serviceAddressTextSnapshot || "Address pending"}
                              </div>
                              <div>
                                <span className="font-medium text-slate-500">City:</span>{" "}
                                {cityFromPermitJurisdiction(permitRequest.jurisdiction) || "City pending"}
                              </div>
                              <div className="text-slate-500">
                                After creation, finish any missing customer details from the job/customer record.
                              </div>
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
                              ECC project type
                              <select
                                name="project_type"
                                defaultValue="alteration"
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              >
                                <option value="alteration">Alteration</option>
                                <option value="all_new">All New</option>
                              </select>
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600">
                              Billing party
                              <select
                                name="billing_recipient"
                                defaultValue="contractor"
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              >
                                <option value="contractor">Contractor</option>
                                <option value="customer">Customer</option>
                              </select>
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
                              Is the job ready to be tested?
                              <select
                                name="post_permit_route"
                                required
                                defaultValue=""
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              >
                                <option value="" disabled>Select next step</option>
                                <option value="ready_for_testing">Ready - schedule now or queue for scheduling</option>
                                <option value="pending_install">Waiting for install</option>
                              </select>
                            </label>
                            <div className="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[12px] leading-5 text-slate-600 md:col-span-2">
                              <div>
                                <span className="font-semibold text-slate-700">Ready:</span>{" "}
                                Creates an unscheduled ECC testing job and places it in the waiting to be scheduled queue.
                              </div>
                              <div>
                                <span className="font-semibold text-slate-700">Waiting for install:</span>{" "}
                                Creates an ECC testing job and places it in Waiting / Pending Info as On Hold: Permit pulled and waiting for install.
                              </div>
                            </div>
                            <div className="flex justify-end md:col-span-2">
                              <button
                                type="submit"
                                className="inline-flex min-h-9 items-center rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-800"
                              >
                                Create Job From Permit Intake
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
            ) : null}
          </article>
          </>
          ) : (
            <OpsBoardActiveQueuePanel
              // Remount when the contractor focus changes so the panel re-seeds
              // its client-side row cache from the freshly filtered server rows.
              // Apply() navigates via router.push (a soft nav), which keeps this
              // client component mounted — without a key its useState-seeded
              // panelCache would keep serving the pre-filter rows.
              key={`ops-panel-${contractorFocusFilter ?? "all"}`}
              chips={opsBoardClientChips}
              hiddenTodayChips={opsBoardHiddenTodayChips}
              initialBucket={effectiveBoardBucketFilter}
              initialPanel={{
                queueLabel: selectedWorkspaceSection?.label ?? selectedWorkspaceTab.label,
                itemNoun: selectedWorkspaceItemNoun,
                reasonOptions: workspaceReasonOptions,
                rows: activeQueueRows,
                pinnedViews: activeQueuePinnedViews,
                canExportContractorSafeCsv,
              }}
              bucketPreviewLimits={opsBoardBucketPreviewLimits}
              contractorParam={contractorFocusFilter ?? ""}
              hasContractorFilter={contractorFocusIds.length > 0}
              clearContractorHref={clearOpsBoardFiltersHref}
              headerRightActionByBucket={opsBoardHeaderRightActionByBucket}
            />
          )}
        </section>
        </div>

        <aside className="space-y-3 sm:space-y-4">
          {showWorkspaceContractorFilter ? (
            <section className="rounded-2xl border border-slate-300/80 bg-white p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.36)] ring-1 ring-slate-200/70 sm:p-3.5">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Contractor Focus</div>
              <ContractorFocusSelector
                allCount={contractorFocusAllCount}
                internalWorkCount={contractorFocusInternalCount}
                internalWorkId={INTERNAL_WORK_CONTRACTOR_FOCUS_ID}
                options={contractorFocusOptions}
                selectedIds={contractorFocusIds}
              />
            </section>
          ) : null}

          <section className="rounded-2xl border border-slate-300/80 bg-white p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.36)] ring-1 ring-slate-200/70 sm:p-3.5">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Queue Health</div>
            <div className="grid grid-cols-2 gap-2">
              <div className={`rounded-xl border px-3 py-2 ${queueHealthStats.agingOver30 > 0 ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50"}`}>
                <div className={`text-xl font-semibold ${queueHealthStats.agingOver30 > 0 ? "text-rose-700" : "text-slate-500"}`}>{queueHealthStats.agingOver30}</div>
                <div className="text-[11px] font-medium text-slate-600">Aging &gt; 30d</div>
              </div>
              <div className={`rounded-xl border px-3 py-2 ${queueHealthStats.unassigned > 0 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
                <div className={`text-xl font-semibold ${queueHealthStats.unassigned > 0 ? "text-amber-700" : "text-slate-500"}`}>{queueHealthStats.unassigned}</div>
                <div className="text-[11px] font-medium text-slate-600">Unassigned</div>
              </div>
            </div>
            {queueHealthStats.breakdown.length > 0 ? (
              <div className="mt-2 space-y-1 border-t border-slate-200 pt-2">
                {queueHealthStats.breakdown.map((entry) => (
                  <div key={entry.label} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{entry.label}</span>
                    <span className="font-semibold text-slate-800">{entry.count}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          {returnedWorkshareCount > 0 || hasActiveIncomingWorkshareConnection ? (
            <section className="rounded-2xl border border-slate-300/80 bg-white p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.36)] ring-1 ring-slate-200/70 sm:p-3.5">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Workshare</div>
              <div className="space-y-2">
                {returnedWorkshareCount > 0 ? (
                  <Link href="/ops/workshare/returned" className="flex items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50/80 px-3 py-2 text-sm transition-colors hover:bg-blue-50">
                    <span className="font-medium text-blue-900">{returnedWorkshareCount} returned · needs action</span>
                    <span className="font-semibold text-blue-700">Review &rarr;</span>
                  </Link>
                ) : null}
                {hasActiveIncomingWorkshareConnection ? (
                  <Link href="/ops/workshare/incoming" className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm transition-colors hover:bg-slate-50">
                    <span className="font-medium text-slate-700">Incoming ECC/HERS requests</span>
                    <span className="font-semibold text-blue-700">View &rarr;</span>
                  </Link>
                ) : null}
              </div>
            </section>
          ) : null}

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
        </aside>
        </div>
      </div>
    );
}
