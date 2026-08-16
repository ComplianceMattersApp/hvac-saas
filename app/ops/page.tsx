// app/ops/page
import Link from "next/link";
import ContractorFocusSelector from "./_components/ContractorFocusSelector";
import QueueCard from "@/components/ops/QueueCard";
import ImmediateSubmitButton from "@/components/ImmediateSubmitButton";
import ServiceLocationAddressFields from "@/components/addresses/ServiceLocationAddressFields";
import { redirect } from "next/navigation";
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

import { startOfTodayUtcIsoLA, startOfTomorrowUtcIsoLA } from "@/lib/utils/schedule-la";
import { formatPersonNamePart } from "@/lib/utils/identity-display";
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
  markInternalPermitRequestNotNeeded,
  resumeInternalPermitRequest,
  updateInternalPermitRequestIntake,
} from "@/lib/actions/internal-permit-request-actions";
import { listCloseoutQueueJobs } from "@/lib/ops/closeout-queue";
import { isPrimaryQueueJob, resolvePrimaryOpsQueue } from "@/lib/ops/queue-membership";
import { loadWaitingExceptionQueueSnapshot } from "@/lib/ops/waiting-exception-loader";
import {
  OPS_WORKSPACE_JOB_SELECT,
  type OpsWorkspaceJob,
} from "@/lib/ops/ops-workspace-job-contract";
import {
  getCachedAccountTimeZone,
  getCachedBillingMode,
  getCachedProductMode,
} from "@/lib/business/tenant-reference-cache";
import { formatTimestampInAccountTimeZone } from "@/lib/utils/account-time-zone";
import { OPERATIONAL_WORKSPACE_MAX_WIDTH_CLASS } from "@/lib/ui/page-widths";
import { listTeamClockStatusPreview } from "@/lib/time-clock/read-model";
import { buildScheduledWithoutTechSnapshot } from "@/lib/ops/scheduled-without-tech-snapshot";
import {
  OPS_BOARD_SORT_OPTIONS,
  normalizeOpsBoardSort,
  sortOpsBoardRows,
} from "@/lib/ops/ops-board-sorting";
import {
  buildOpsWorkspaceTabs,
  getOpsWorkspaceQueueDefinition,
  isContractorIntakeQueueAvailableForProductMode,
  opsWorkspaceQueueHref,
  resolveEffectiveOpsBoardBucketFilter,
  resolveOpsWorkspaceQueueKey,
  resolveVisibleOpsWorkspaceQueueKeys,
  type OpsBoardFilterBucket,
} from "@/lib/ops/ops-workspace-queues";
import {
  buildOpsBoardReasonOptions,
  filterOpsBoardRowsByReason,
  getOpsBoardReasonLabel,
  normalizeOpsBoardReason,
} from "@/lib/ops/ops-board-reasons";
import OpsBoardActiveQueuePanel, {
  type OpsBoardActiveQueueRow,
} from "./_components/OpsBoardActiveQueuePanel";
import OpsMobileQueueSwitcher from "./_components/OpsMobileQueueSwitcher";
import {
  createOpsWorkspaceRowViewBuilders,
  type OpsWorkspaceRowJob,
} from "@/lib/ops/ops-workspace-row-views";
import {
  buildCloseoutProjectionInputs,
  createOpsWorkspacePreviewLoader,
  loadOpsWorkspacePreviewEnrichment,
  type OpsWorkspacePreviewRow,
} from "@/lib/ops/ops-workspace-data-loader";
import { startOpsServerTimer } from "@/lib/ops/ops-server-timing";
import {
  listActivePermitRequestQueueRowsIfAvailable,
  type PermitRequestQueueRow,
} from "@/lib/permits/permit-requests-read-model";
import {
  countPendingContractorIntakeQueueRows,
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

type ContractorFocusRow = OpsWorkspacePreviewRow | PermitRequestQueueRow;

function normalizeOpsBoardFilterBucket(value: unknown): OpsBoardFilterBucket {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "need_to_schedule") return "pending";
  if (normalized === "scheduled") return "field_work";
  if (normalized === "intake") return "contractor_intake";
  if (
    normalized === "pending" ||
    normalized === "field_work" ||
    normalized === "without_tech" ||
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

function formatTeamClockSince(value: string | null | undefined, timeZone: string) {
  return formatTimestampInAccountTimeZone(value, timeZone, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
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
  const finishTotalTiming = startOpsServerTimer(opsTimingEnabled);

  const finishRequestActorContextTiming = startOpsServerTimer(opsTimingEnabled);
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
  finishRequestActorContextTiming("ops:requestActorContext");

  const showTeamClockStatusCardForRole =
    internalUser.role === "admin" || internalUser.role === "office";

  // Everything in this group depends only on the resolved internal user, so it
  // runs concurrently instead of as seven sequential round-trips. Timezone,
  // product mode, and billing mode come from the cross-request tenant
  // reference cache, so they are usually free.
  const [
    accountTimeZone,
    explicitFieldBillingCapabilities,
    incomingWorkshareConnectionRows,
    returnedWorkshareCount,
    timeClockAccountSettingsResult,
    productMode,
    billingMode,
  ] = await Promise.all([
    getCachedAccountTimeZone(internalUser.account_owner_user_id),
    loadFieldBillingExplicitCapabilitiesForUser({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      internalUserId: internalUser.user_id,
    }),
    listSenderWorkshareConnectionsForReceiver(supabase, internalUser.account_owner_user_id),
    countReturnedWorkshareRequestsForSender(supabase, internalUser.account_owner_user_id),
    showTeamClockStatusCardForRole
      ? supabase
          .from("account_settings")
          .select("time_clock_enabled")
          .eq("account_owner_user_id", internalUser.account_owner_user_id)
          .maybeSingle()
      : Promise.resolve(null),
    getCachedProductMode(internalUser.account_owner_user_id),
    getCachedBillingMode(internalUser.account_owner_user_id),
  ]);

  const fieldBillingCapabilities = resolveFieldBillingCapabilities({
    actorUserId: user.id,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    explicitCapabilities: explicitFieldBillingCapabilities,
  });

  const canViewFinancialRegisterForAccount = canViewFinancialRegister({
      actorUserId: user.id,
      internalUser,
      resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    });
  const canViewFieldPaymentVerificationAttention =
    canViewFinancialRegisterForAccount || fieldBillingCapabilities.can_verify_non_card_collection;

  // Show the incoming ECC/HERS request queue only to accounts that have an active
  // workshare connection where they are the receiver — no point surfacing an empty
  // queue to accounts that have not set up connections yet.
  const hasActiveIncomingWorkshareConnection = incomingWorkshareConnectionRows.some(
    (row) => row.status === "active",
  );

  if (showTeamClockStatusCardForRole && timeClockAccountSettingsResult?.error) {
    throw timeClockAccountSettingsResult.error;
  }
  const isTimeClockEnabled = Boolean(
    (timeClockAccountSettingsResult?.data as { time_clock_enabled?: boolean | null } | null)
      ?.time_clock_enabled,
  );

  // Second group: both reads depend on results from the group above but not on
  // each other.
  const [fieldPaymentReconciliationAttention, teamClockPreviewRows] = await Promise.all([
    canViewFieldPaymentVerificationAttention
      ? listFieldPaymentCollectionReportsForReconciliation({
          admin: supabase,
          accountOwnerUserId: internalUser.account_owner_user_id,
          limit: 1,
        })
      : Promise.resolve(null),
    showTeamClockStatusCardForRole && isTimeClockEnabled
      ? listTeamClockStatusPreview({
          supabase,
          accountOwnerUserId: internalUser.account_owner_user_id,
        })
      : Promise.resolve(null),
  ]);

  let showTeamClockStatusCard = false;
  let teamClockStatusRows: Array<{
    internalUserId: string;
    displayName: string;
    statusLabel: "Clocked In" | "On Lunch";
    sinceAt: string;
    elapsed: string;
  }> = [];

  if (teamClockPreviewRows) {
    const displayMap = await resolveUserDisplayMap({
      supabase,
      userIds: teamClockPreviewRows
        .map((row) => String(row.internalUserId ?? "").trim())
        .filter(Boolean),
    });

    showTeamClockStatusCard = true;
    teamClockStatusRows = teamClockPreviewRows.map((row) => {
      const internalUserId = String(row.internalUserId ?? "").trim();
      const displayName =
        formatPersonNamePart(displayMap[internalUserId] ?? "") || "Unknown User";
      const statusLabel = row.status === "on_lunch" ? "On Lunch" : "Clocked In";
      const sinceSource = row.status === "on_lunch" ? row.lunchStartAt ?? row.clockInAt : row.clockInAt;

      return {
        internalUserId,
        displayName,
        statusLabel,
        sinceAt: formatTeamClockSince(sinceSource, accountTimeZone),
        elapsed: formatTeamClockElapsedFromClockIn(row.clockInAt),
      };
    });
  }
  const canCreateEccBatchInvoice =
    canViewFinancialRegisterForAccount &&
    billingMode === "internal_invoicing" &&
    (productMode === "ecc_hers" || productMode === "hybrid");
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

  const finishBusinessIdentityTiming = startOpsServerTimer(opsTimingEnabled);
  const operationalTenantIdentityPromise = resolveOperationalTenantIdentity({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  }).then((result) => {
    finishBusinessIdentityTiming("ops:businessIdentity");
    return result;
  });

  const wsStartTodayUtc = startOfTodayUtcIsoLA();
  const wsStartTomorrowUtc = startOfTomorrowUtcIsoLA();

    const scheduledSnapshotSelect =
      "id, status, ops_status, scheduled_date, window_start, follow_up_date, next_action_note, action_required_by";

    const finishWorkspaceCountsTiming = startOpsServerTimer(opsTimingEnabled);

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

    const needToScheduleCountQ = opsStatusCountQuery("need_to_schedule", { requireOpenStatus: true })
      .is("follow_up_date", null)
      .is("next_action_note", null)
      .is("action_required_by", null);
    const waitingExceptionSnapshotQ = loadWaitingExceptionQueueSnapshot({ supabase });
    const followUpReminderRowsQ = supabase
      .from("jobs")
      .select("id, status, ops_status, follow_up_date, next_action_note, action_required_by")
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .or("follow_up_date.not.is.null,next_action_note.not.is.null,action_required_by.not.is.null");

    const fieldWorkCountQ = supabase
      .from("jobs")
      .select("id, status, ops_status, follow_up_date, next_action_note, action_required_by")
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .in("status", ["open", "on_the_way", "in_process", "in_progress"])
      .neq("ops_status", "closed")
      .eq("field_complete", false)
      .is("follow_up_date", null)
      .is("next_action_note", null)
      .is("action_required_by", null)
      .gte("scheduled_date", wsStartTodayUtc)
      .lt("scheduled_date", wsStartTomorrowUtc);

    const scheduledOpenRowsQ = supabase
      .from("jobs")
      .select(scheduledSnapshotSelect)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .eq("status", "open")
      .eq("ops_status", "scheduled")
      .is("follow_up_date", null)
      .is("next_action_note", null)
      .is("action_required_by", null)
      .order("scheduled_date", { ascending: true })
      .order("window_start", { ascending: true });

    const closeoutCountRowsQ = supabase
      .from("jobs")
      .select(OPS_WORKSPACE_JOB_SELECT)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      // isInCloseoutQueue rejects closed jobs unconditionally, and the billing
      // projection copies ops_status verbatim (a closed job can never re-enter
      // the queue). Filtering here keeps this read bounded by active closeout
      // work instead of growing with all-time completed history.
      .neq("ops_status", "closed")
      .eq("field_complete", true)
      .order("created_at", { ascending: false });

    const [
      needToScheduleCountRes,
      waitingExceptionSnapshot,
      followUpReminderRowsRes,
      fieldWorkCountRes,
      scheduledOpenRowsRes,
      closeoutCountRowsRes,
      contractorIntakeCount,
      unreadContractorUpdates,
      unreadNewWorkRequests,
      activePermitRequestsResult,
    ] = await Promise.all([
      needToScheduleCountQ,
      waitingExceptionSnapshotQ,
      followUpReminderRowsQ,
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
            supabase,
            accountOwnerUserId: internalUser.account_owner_user_id,
            limit: 50,
          })
        : Promise.resolve({ schemaAvailable: true, rows: [] as PermitRequestQueueRow[] }),
    ]);

    if (needToScheduleCountRes.error) throw needToScheduleCountRes.error;
    if (followUpReminderRowsRes.error) throw followUpReminderRowsRes.error;
    if (fieldWorkCountRes.error) throw fieldWorkCountRes.error;
    if (scheduledOpenRowsRes.error) throw scheduledOpenRowsRes.error;
    if (closeoutCountRowsRes.error) throw closeoutCountRowsRes.error;

    const retestContinuationParentIds = waitingExceptionSnapshot.retestContinuationParentIds;
    const countsWs = new Map<string, number>([
      ["need_to_schedule", needToScheduleCountRes.count ?? 0],
      ["pending_info", waitingExceptionSnapshot.statusCounts.get("pending_info") ?? 0],
      ["on_hold", waitingExceptionSnapshot.statusCounts.get("on_hold") ?? 0],
      ["waiting", waitingExceptionSnapshot.statusCounts.get("waiting") ?? 0],
      ["pending_office_review", waitingExceptionSnapshot.statusCounts.get("pending_office_review") ?? 0],
      ["failed", waitingExceptionSnapshot.statusCounts.get("failed") ?? 0],
      ["retest_needed", waitingExceptionSnapshot.statusCounts.get("retest_needed") ?? 0],
      ["problem", waitingExceptionSnapshot.statusCounts.get("problem") ?? 0],
      [
        "follow_ups",
        ((followUpReminderRowsRes.data ?? []) as OpsWorkspaceJob[]).filter((job) =>
          isPrimaryQueueJob(job, "follow_ups"),
        ).length,
      ],
    ]);

    const scheduledOpenRows = (scheduledOpenRowsRes.data ?? []) as OpsWorkspaceJob[];
    const scheduledIds = scheduledOpenRows
      .map((row) => String(row?.id ?? "").trim())
      .filter(Boolean);

    const scheduledAssignmentMap = scheduledIds.length
      ? await getActiveJobAssignmentDisplayMap({ supabase, jobIds: scheduledIds })
      : {};

    const scheduledWithoutTechSnapshot = buildScheduledWithoutTechSnapshot({
      jobs: scheduledOpenRows,
      assignmentDisplayMap: scheduledAssignmentMap,
      previewLimit: Math.max(scheduledOpenRows.length, 1),
    });

    const fieldWorkCountRows = (fieldWorkCountRes.data ?? []) as OpsWorkspaceJob[];
    const fieldWorkCountIds = fieldWorkCountRows
      .map((row) => String(row?.id ?? "").trim())
      .filter(Boolean);
    const fieldWorkAssignmentMap = fieldWorkCountIds.length
      ? await getActiveJobAssignmentDisplayMap({ supabase, jobIds: fieldWorkCountIds })
      : {};
    const assignedFieldWorkCount = fieldWorkCountRows.filter((row) => {
      const jobId = String(row?.id ?? "").trim();
      return (
        resolvePrimaryOpsQueue(row) === null &&
        Array.isArray(fieldWorkAssignmentMap[jobId]) &&
        fieldWorkAssignmentMap[jobId].length > 0
      );
    }).length;

    const waitingCount =
      (countsWs.get("pending_info") ?? 0) +
      (countsWs.get("on_hold") ?? 0) +
      (countsWs.get("waiting") ?? 0);

    const exceptionCount =
      (countsWs.get("failed") ?? 0) +
      (countsWs.get("retest_needed") ?? 0) +
      (countsWs.get("pending_office_review") ?? 0) +
      (countsWs.get("problem") ?? 0);

    const closeoutCountSourceRows = (closeoutCountRowsRes.data ?? []) as OpsWorkspaceJob[];
    const { projectionsByJobId: closeoutCountProjectionByJobId } = await buildBillingTruthCloseoutProjectionMap({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      jobs: buildCloseoutProjectionInputs(closeoutCountSourceRows),
    });
    // Full closeout set (uncapped) — reused for counts, contractor facets, and
    // every desktop/mobile queue card.
    const closeoutQueueRowsFull = listCloseoutQueueJobs(
      closeoutCountSourceRows,
      (job) => closeoutCountProjectionByJobId.get(String(job.id ?? "").trim()) ?? job,
    );
    const closeoutCount = closeoutQueueRowsFull.length;
    const permitRequestsSchemaAvailable = permitWorkflowEnabled && activePermitRequestsResult.schemaAvailable;
    const activePermitRequestRows = activePermitRequestsResult.rows;
    const effectiveBoardBucketFilter = resolveEffectiveOpsBoardBucketFilter({
      requestedBucket: activeBoardBucketFilter,
      productMode,
      permitRequestsSchemaAvailable,
    });

    const workspaceTabs = buildOpsWorkspaceTabs({
      counts: {
        need_to_schedule: countsWs.get("need_to_schedule") ?? 0,
        field_work: assignedFieldWorkCount,
        without_tech: scheduledWithoutTechSnapshot.count,
        waiting: waitingCount,
        exceptions: exceptionCount,
        closeout: closeoutCount,
        follow_ups: countsWs.get("follow_ups") ?? 0,
        contractor_intake: contractorIntakeCount,
        permits: activePermitRequestRows.length,
        updates: unreadContractorUpdates.length + unreadNewWorkRequests.length,
      },
      contractorScopeFilter,
      contractorIntakeQueueAvailable,
      permitRequestsSchemaAvailable,
    });

    const coreBoardWorkspaceKeys = resolveVisibleOpsWorkspaceQueueKeys({
      productMode,
      permitRequestsSchemaAvailable,
    });
    const requestedWorkspaceKeys = [resolveOpsWorkspaceQueueKey(effectiveBoardBucketFilter)];

    const loadWorkspacePreviewRows = createOpsWorkspacePreviewLoader({
      supabase,
      admin,
      accountOwnerUserId: internalUser.account_owner_user_id,
      boardSort,
      contractorIntakeQueueAvailable,
      retestContinuationParentIds,
      serviceFollowUpByJob: waitingExceptionSnapshot.serviceFollowUpByJob,
      scheduledWithoutTechSnapshot,
      startTodayUtc: wsStartTodayUtc,
      startTomorrowUtc: wsStartTomorrowUtc,
    });

    const workspacePreviewEntries = await Promise.all(
      requestedWorkspaceKeys.map(async (workspaceKey) => [workspaceKey, await loadWorkspacePreviewRows(workspaceKey)] as const),
    );
    const workspacePreviewRowsByKey = new Map<string, OpsWorkspacePreviewRow[]>(workspacePreviewEntries);
    const reasonSourceWorkspaceSections = requestedWorkspaceKeys.map((workspaceKey) => {
      const tab = workspaceTabs.find((item) => item.key === workspaceKey) ?? workspaceTabs[0];
      return {
        ...tab,
        previewRows: workspacePreviewRowsByKey.get(workspaceKey) ?? [],
      };
    });
    const selectedWorkspaceKey = requestedWorkspaceKeys[0];
    const selectedWorkspaceUsesJobRows =
      selectedWorkspaceKey !== "permits" && selectedWorkspaceKey !== "contractor_intake";
    const reasonSourceRows: OpsWorkspaceJob[] = selectedWorkspaceUsesJobRows
      ? (reasonSourceWorkspaceSections.flatMap((section) => section.previewRows) as OpsWorkspaceJob[])
      : [];
    const workspaceReasonOptions = buildOpsBoardReasonOptions(reasonSourceRows, { queueKey: selectedWorkspaceKey });
    const effectiveBoardReasonFilter = boardReasonFilter && workspaceReasonOptions.some((option) => option.key === boardReasonFilter)
      ? boardReasonFilter
      : null;
    const reasonFilteredWorkspaceSections = reasonSourceWorkspaceSections.map((section) => ({
      ...section,
      previewRows: selectedWorkspaceUsesJobRows
        ? filterOpsBoardRowsByReason(
            section.previewRows as OpsWorkspaceJob[],
            effectiveBoardReasonFilter,
            { queueKey: section.key },
          )
        : section.previewRows,
    }));

    function rowContractorFocusId(row: ContractorFocusRow) {
      return "contractorId" in row
        ? String(row.contractorId ?? "").trim()
        : String(row.contractor_id ?? "").trim();
    }

    function rowContractorFocusName(row: ContractorFocusRow) {
      return "contractorName" in row
        ? String(row.contractorName ?? "").trim()
        : String(row.contractors?.name ?? "").trim();
    }

    function filterRowsByContractorFocus<T extends ContractorFocusRow>(rows: T[]): T[] {
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
    const selectedPreviewRows: OpsWorkspaceJob[] =
      selectedWorkspaceKey === "permits" || selectedWorkspaceKey === "contractor_intake"
        ? []
        : (visibleWorkspaceSections.flatMap((section) => section.previewRows) as OpsWorkspaceJob[]);
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
      const definition = getOpsWorkspaceQueueDefinition(workspaceKey);
      const section =
        visibleWorkspaceSections.find((item) => item.key === workspaceKey) ??
        workspaceTabs.find((item) => item.key === workspaceKey) ??
        workspaceTabs[0];
      const previewRows = "previewRows" in section && Array.isArray(section.previewRows) ? section.previewRows : [];
      const isSelected = workspaceKey === selectedWorkspaceSection?.key;
      return {
        ...section,
        bucket: definition.bucket,
        mobileLabel: definition.mobileLabel,
        isSelected,
        previewRows,
        count: section.count,
        href: opsWorkspaceQueueHref(definition.bucket, {
          contractor: contractorFocusFilter ?? "",
          sort: boardSort === "oldest" ? "" : boardSort,
        }),
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

    finishWorkspaceCountsTiming("ops:workspace:countsAndPreview");
    finishTotalTiming("ops:totalBeforeRender");

    // These enrichment reads all depend only on the selected preview job ids
    // (plus two independent account-level reads), so they run as one barrier
    // instead of eight sequential round-trips.
    const {
      assignmentDisplayMap: selectedPreviewAssignmentDisplayMap,
      closeoutProjectionByJob: selectedWorkspaceCloseoutProjectionByJob,
      latestCustomerAttemptByJob: selectedPreviewLatestCustomerAttemptByJob,
      opsStatusEnteredAtByJob,
      operationalTenantIdentity,
      workspaceContractors,
      workspaceEvidence,
    } = await loadOpsWorkspacePreviewEnrichment({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      selectedWorkspaceKey,
      selectedPreviewRows,
      operationalTenantIdentityPromise,
    });
    // Contractor Focus is scoped to the bucket currently being rendered. Queue
    // chips navigate (server round-trip), so the rendered bucket always matches
    // what the user is viewing and these per-bucket counts stay correct. Use the
    // bucket's rows before the contractor filter is applied so the picker lists
    // every contractor in the bucket, not just the selected one.
    const contractorFocusSourceRows =
      selectedWorkspaceKey === "permits"
        ? activePermitRequestRows
        : selectedWorkspaceKey === "contractor_intake"
        ? reasonFilteredWorkspaceSections.find((section) => section.key === selectedWorkspaceKey)?.previewRows ?? []
        : selectedWorkspaceKey === "closeout"
        ? closeoutQueueRowsFull
        : reasonSourceWorkspaceSections.find((section) => section.key === selectedWorkspaceKey)?.previewRows ?? [];
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
    for (const contractorOption of workspaceContractors) {
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
    const rowViewBuilders = createOpsWorkspaceRowViewBuilders({
      accountTimeZone,
      activeWorkspaceBaseHref,
      activeWorkspaceHref,
      actorUserId: user.id,
      assignmentDisplayMap: selectedPreviewAssignmentDisplayMap,
      closeoutProjectionByJob: selectedWorkspaceCloseoutProjectionByJob,
      defaultContractorName: operationalTenantIdentity.displayName,
      followUpTodayDate,
      latestCustomerAttemptByJob: selectedPreviewLatestCustomerAttemptByJob,
      opsStatusEnteredAtByJob,
      serviceFollowUpByJob: waitingExceptionSnapshot.serviceFollowUpByJob,
      workspaceEvidence,
    });

    // Oldest/Newest describe time in the active queue, matching the "In queue"
    // badge. Evidence and the presentation service are assembled first so the
    // sort and rendered age badge use the same queue-entry policy.
    if (selectedWorkspaceSection && selectedWorkspaceKey !== "permits" && selectedWorkspaceKey !== "contractor_intake") {
      const queueSortedRows = sortOpsBoardRows(selectedWorkspaceSection.previewRows as OpsWorkspaceJob[], boardSort, {
        queueEnteredAt: (job) => rowViewBuilders.queueEnteredAt(job, selectedWorkspaceKey),
      });
      selectedWorkspaceSection.previewRows.splice(0, selectedWorkspaceSection.previewRows.length, ...queueSortedRows);
    }

    const canShowJobQueueExport = selectedWorkspaceKey !== "permits" && selectedWorkspaceKey !== "contractor_intake";
    const canExportContractorSafeCsv = contractorFocusIds.length > 0;

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
        ? (selectedWorkspaceSection.previewRows as OpsWorkspaceJob[]).map((job) => {
            const typedJob: OpsWorkspaceRowJob = job;
            const view = rowViewBuilders.buildJobRowView(typedJob, selectedWorkspaceSection.key);
            return {
              id: String(job.id ?? ""),
              reasonKey: getOpsBoardReasonLabel(rowViewBuilders.reasonInput(typedJob), { queueKey: selectedWorkspaceSection.key })?.key ?? null,
              sortable: {
                created_at: job.created_at ?? null,
                queue_entered_at: rowViewBuilders.queueEnteredAt(typedJob, selectedWorkspaceSection.key),
                scheduled_date: job.scheduled_date ?? null,
                window_start: job.window_start ?? null,
                customer_first_name: job.customer_first_name ?? null,
                customer_last_name: job.customer_last_name ?? null,
                contractors: { name: rowViewBuilders.contractorName(typedJob) || null },
              },
              view,
            };
          })
        : [];
    const activeQueuePinnedViews =
      canShowJobQueueExport && selectedWorkspaceSection?.key === "closeout" && canViewFieldPaymentVerificationAttention
        ? (fieldPaymentReconciliationAttention?.items ?? []).map((item) => rowViewBuilders.buildFieldPaymentReviewRowView(item))
        : [];
    const queueHealthAgingOver30 = activeQueueRows.filter(
      (row) => "ageDays" in row.view && row.view.ageDays != null && row.view.ageDays > 30,
    ).length;
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
      pending: {
        label: "Plan routes →",
        href: "/calendar?view=plan",
      },
      ...(canCreateEccBatchInvoice
        ? {
            closeout: {
              label: "Batch Contractor Invoice",
              href: contractorScopeFilter
                ? `/billing/ready-to-bill?contractor=${encodeURIComponent(contractorScopeFilter)}`
                : "/billing/ready-to-bill",
            },
          }
        : {}),
    };
    // Every queue chip navigates (server round-trip) rather than switching the
    // panel purely client-side. The board's SSR-only surfaces — the Contractor
    // Focus picker and Queue Health — are computed for whichever bucket the
    // server renders, so a client-only switch left them showing the wrong
    // bucket's contractor counts. Server-nav chips keep the rendered bucket and
    // those facets in sync.
    const activeWorkspaceQueueKey = resolveOpsWorkspaceQueueKey(effectiveBoardBucketFilter);
    const opsRailQueueOrder = [
      "need_to_schedule",
      "exceptions",
      "waiting",
      "updates",
      "field_work",
      "follow_ups",
      "contractor_intake",
      "closeout",
      "permits",
      "without_tech",
    ];
    const opsRailQueueRows = [
      ...workspaceQueueChips.map((chip) => ({
        key: chip.key,
        label: chip.label,
        count: chip.count,
        href: chip.href,
        active: chip.isSelected,
      })),
      ...hiddenTodayWorkspaceTabs.map((tab) => ({
        key: tab.key,
        label: tab.label,
        count: tab.count,
        href: tab.href,
        active: tab.key === activeWorkspaceQueueKey,
      })),
    ].sort(
      (left, right) =>
        opsRailQueueOrder.indexOf(left.key) - opsRailQueueOrder.indexOf(right.key),
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
      return formatTimestampInAccountTimeZone(value, accountTimeZone, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }, "Not available");
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

    async function markPermitRequestNotNeededFromOps(formData: FormData) {
      "use server";

      try {
        await markInternalPermitRequestNotNeeded(formData);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Permit request could not be marked not needed.";
        redirect(`/ops?bucket=permits&permit_error=${encodeURIComponent(message)}#ops-workspace`);
      }

      redirect("/ops?bucket=permits#ops-workspace");
    }

    async function updatePermitRequestIntakeFromOps(formData: FormData) {
      "use server";

      try {
        await updateInternalPermitRequestIntake(formData);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Permit intake details could not be saved.";
        redirect(`/ops?bucket=permits&permit_error=${encodeURIComponent(message)}#ops-workspace`);
      }
      redirect("/ops?bucket=permits#ops-workspace");
    }

    async function markPermitCreatedFromOps(formData: FormData) {
      "use server";

      let jobId = "";
      try {
        const result = await markInternalPermitCreated(formData);
        jobId = result.jobId;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Permit could not be marked created.";
        redirect(`/ops?bucket=permits&permit_error=${encodeURIComponent(message)}#ops-workspace`);
      }

      redirect(`/jobs/${jobId}`);
    }

    async function createJobAndMarkPermitCreatedFromOps(formData: FormData) {
      "use server";

      let jobId = "";
      try {
        const result = await createJobFromPermitRequestAndMarkCreated(formData);
        jobId = result.jobId;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Permit job could not be created.";
        redirect(`/ops?bucket=permits&permit_error=${encodeURIComponent(message)}#ops-workspace`);
      }

      redirect(`/jobs/${jobId}`);
    }

    return (
      <div
        data-ops-visual-scope
        className={`mx-auto ${OPERATIONAL_WORKSPACE_MAX_WIDTH_CLASS} space-y-3 bg-slate-50/45 p-2.5 text-gray-900 sm:space-y-4 sm:p-4 xl:px-6`}
      >
        {notice === "estimates_unavailable" ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-[0_14px_32px_-28px_rgba(15,23,42,0.24)]">
            <div className="font-semibold">Estimates are not enabled for this environment yet.</div>
            <div className="mt-1 text-amber-900/85">
              Internal estimate routes remain fail-closed here until the estimate migration is intentionally applied and the feature flag is explicitly enabled.
            </div>
          </section>
        ) : null}

        <header
          data-ops-sticky-header
          className="sticky top-14 z-30 -mx-2.5 border-b border-slate-200 bg-gray-100/95 px-4 py-3 shadow-[0_6px_14px_-12px_rgba(15,31,53,0.22)] backdrop-blur-sm sm:-mx-4 sm:px-5 sm:py-4 xl:-mx-6 xl:px-6"
        >
          <OpsMobileQueueSwitcher queues={opsRailQueueRows} />
          <div className="hidden flex-wrap items-start justify-between gap-3 xl:flex">
            <div className="min-w-0">
              <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                {operationalTenantIdentity.displayName} · Operations
              </div>
              <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-[-0.02em] text-navy">
                Operations Workspace
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-600">
                Start with the queue that needs attention now. Then work down through field progress, exceptions, and closeout.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {returnedWorkshareCount > 0 ? (
                <Link href="/ops/workshare/returned" className="inline-flex min-h-9 items-center rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-blue-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200">
                  Returned Work · {returnedWorkshareCount}
                </Link>
              ) : null}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1fr)_304px] xl:items-start">
        <div className="min-w-0 space-y-3 sm:space-y-4">
        <section
          id="ops-workspace"
          data-ops-specialized-mobile={canShowJobQueueExport ? undefined : ""}
          className="border-0 bg-transparent p-0 shadow-none ring-0 xl:rounded-3xl xl:border xl:border-slate-300/80 xl:bg-white xl:p-4 xl:shadow-[0_20px_48px_-34px_rgba(15,23,42,0.42)] xl:ring-1 xl:ring-slate-200/70"
        >
          <div className="mb-3 hidden flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3 xl:flex">
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
          {showWorkspaceContractorFilter ? (
            <ContractorFocusSelector
              allCount={contractorFocusAllCount}
              internalWorkCount={contractorFocusInternalCount}
              internalWorkId={INTERNAL_WORK_CONTRACTOR_FOCUS_ID}
              options={contractorFocusOptions}
              selectedIds={contractorFocusIds}
            />
          ) : null}

          <div className="mb-3 grid gap-2 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
            <form action="/ops" method="get" className="grid gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500 sm:text-[10px] sm:tracking-[0.12em]">Reason</label>
              <input type="hidden" name="contractor" value={contractorFocusFilter ?? ""} />
              <input type="hidden" name="bucket" value={effectiveBoardBucketFilter} />
              <input type="hidden" name="sort" value={boardSort} />
              <select
                name="reason"
                defaultValue={effectiveBoardReasonFilter ?? ""}
                className="w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2.5 text-[15px] font-medium text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,background-color,box-shadow] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
              >
                <option value="">All reasons</option>
                {workspaceReasonOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button type="submit" className="mt-1 inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-white">
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
                className="w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2.5 text-[15px] font-medium text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,background-color,box-shadow] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
              >
                {OPS_BOARD_SORT_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button type="submit" className="mt-1 inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-white">
                Apply
              </button>
            </form>
            {hasActiveOpsBoardFilters ? (
              <Link href={clearOpsBoardFiltersHref} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors hover:bg-slate-50">
                Clear filters
              </Link>
            ) : null}
          </div>

          <article className="border-0 bg-transparent p-0 shadow-none ring-0 xl:rounded-2xl xl:border xl:border-slate-300/80 xl:bg-white xl:p-3.5 xl:shadow-[0_18px_38px_-30px_rgba(15,23,42,0.36)] xl:ring-1 xl:ring-slate-200/70">
            <div className={`mb-2 flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2 ${
              selectedWorkspaceKey === "contractor_intake" ? "flex" : "hidden xl:flex"
            }`}>
            <div className="hidden xl:block">
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
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 xl:min-h-10 xl:w-auto xl:rounded-lg xl:border-slate-200/90 xl:bg-slate-50 xl:px-3 xl:py-1 xl:text-[13px]"
              >
                Export CSV
              </Link>
            ) : null}
          </div>

            {selectedWorkspaceKey === "permits" ? (
              <details
                id="permit-request-create"
                open={shouldExpandPermitCreateForm}
                className="mb-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
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
                      Short request label <span className="font-normal text-slate-400">(optional)</span>
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
                      Customer email
                      <input name="customer_email" type="email" autoComplete="email" maxLength={240} className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900" />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold text-slate-600">
                      Customer phone
                      <input name="customer_phone" type="tel" autoComplete="tel" maxLength={80} className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900" />
                    </label>
                    <ServiceLocationAddressFields
                      addressLine1Name="service_address_text"
                      compact
                      className="lg:col-span-2"
                    />
                    <label className="grid gap-1 text-xs font-semibold text-slate-600">
                      Jurisdiction
                      <input
                        name="jurisdiction"
                        maxLength={160}
                        className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold text-slate-600 lg:col-span-2">
                      Intake note <span className="font-normal text-slate-400">(optional)</span>
                      <textarea
                        name="intake_note"
                        rows={3}
                        maxLength={4000}
                        placeholder="What did Compliance Matters receive?"
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
                      />
                    </label>
                    <div className="flex flex-wrap items-center justify-between gap-2 lg:col-span-2">
                      <div className="text-xs text-slate-500">If blank, the request label is created from the customer or service address.</div>
                      <ImmediateSubmitButton
                        disabled={workspaceContractors.length === 0}
                        pendingText="Creating permit..."
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
                      >
                        Create Permit Request
                      </ImmediateSubmitButton>
                    </div>
                  </form>
                </div>
              </details>
            ) : null}

            {selectedWorkspaceKey === "permits" ? (
              selectedPermitRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700">
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
                        ...(permitRequest.customerEmailSnapshot
                          ? [{ label: "Email", value: permitRequest.customerEmailSnapshot }]
                          : []),
                        ...(permitRequest.customerPhoneSnapshot
                          ? [{ label: "Phone", value: permitRequest.customerPhoneSnapshot }]
                          : []),
                        ...(permitRequest.addressLine1Snapshot || permitRequest.addressLine2Snapshot
                          ? [{ label: "Address", value: [permitRequest.addressLine1Snapshot, permitRequest.addressLine2Snapshot, permitRequest.citySnapshot, permitRequest.stateSnapshot, permitRequest.zipSnapshot].filter(Boolean).join(", ") }]
                          : []),
                        ...(permitRequest.totalValueCents !== null
                          ? [{ label: "Total value", value: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(permitRequest.totalValueCents / 100) }]
                          : []),
                        ...(permitRequest.jurisdiction
                          ? [{ label: "Jurisdiction", value: permitRequest.jurisdiction }]
                          : []),
                        ...(permitRequest.contractorNote
                          ? [{ label: "Contractor note", value: permitRequest.contractorNote, fullWidth: true }]
                          : []),
                        ...(permitRequest.internalIntakeNote
                          ? [{ label: "Internal intake note", value: permitRequest.internalIntakeNote, fullWidth: true }]
                          : []),
                      ]}
                    >
                      <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                          {permitRequest.status === "permit_request" ? (
                            <form action={acceptPermitRequestFromOps}>
                              <input type="hidden" name="permit_request_id" value={permitRequest.id} />
                              <ImmediateSubmitButton
                                pendingText="Starting..."
                                className="inline-flex min-h-8 items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[12px] font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
                              >
                                Accept / Start Permit
                              </ImmediateSubmitButton>
                            </form>
                          ) : null}
                          {permitRequest.status === "permit_request" || permitRequest.status === "accepted_in_process" ? (
                            <form action={holdPermitRequestFromOps}>
                              <input type="hidden" name="permit_request_id" value={permitRequest.id} />
                              <ImmediateSubmitButton
                                pendingText="Updating..."
                                className="inline-flex min-h-8 items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[12px] font-semibold text-amber-800 transition-colors hover:bg-amber-100"
                              >
                                Put On Hold
                              </ImmediateSubmitButton>
                            </form>
                          ) : null}
                          {permitRequest.status === "on_hold_additional_info_needed" ? (
                            <form action={resumePermitRequestFromOps}>
                              <input type="hidden" name="permit_request_id" value={permitRequest.id} />
                              <ImmediateSubmitButton
                                pendingText="Resuming..."
                                className="inline-flex min-h-8 items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[12px] font-semibold text-blue-800 transition-colors hover:bg-blue-100"
                              >
                                Resume / In Process
                              </ImmediateSubmitButton>
                            </form>
                          ) : null}
                      </div>

                      <details className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <summary className="cursor-pointer text-[12px] font-semibold text-slate-600">
                          Permit No Longer Needed
                        </summary>
                        <form action={markPermitRequestNotNeededFromOps} className="mt-2 grid gap-2">
                          <input type="hidden" name="permit_request_id" value={permitRequest.id} />
                          <label className="grid gap-1 text-xs font-semibold text-slate-600">
                            Reason
                            <textarea
                              name="reason"
                              required
                              maxLength={500}
                              rows={2}
                              placeholder="Why is this permit request no longer needed?"
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-medium text-slate-900"
                            />
                          </label>
                          <div className="text-xs text-slate-500">
                            This removes the request from the active queue and preserves its history.
                          </div>
                          <ImmediateSubmitButton pendingText="Removing..." className="justify-self-start rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50">
                            Mark Not Needed
                          </ImmediateSubmitButton>
                        </form>
                      </details>

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
                          <label className="grid gap-1 text-xs font-semibold text-slate-600">
                            Customer email
                            <input name="customer_email_snapshot" type="email" autoComplete="email" defaultValue={permitRequest.customerEmailSnapshot ?? ""} maxLength={240} className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900" />
                          </label>
                          <label className="grid gap-1 text-xs font-semibold text-slate-600">
                            Customer phone
                            <input name="customer_phone_snapshot" type="tel" autoComplete="tel" defaultValue={permitRequest.customerPhoneSnapshot ?? ""} maxLength={80} className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900" />
                          </label>
                          <label className="grid gap-1 text-xs font-semibold text-slate-600 md:col-span-2">
                            Street address
                            <input
                              name="service_address_text_snapshot"
                              defaultValue={permitRequest.addressLine1Snapshot ?? ""}
                              maxLength={240}
                              className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-semibold text-slate-600 md:col-span-2">
                            Address line 2
                            <input name="address_line2_snapshot" defaultValue={permitRequest.addressLine2Snapshot ?? ""} maxLength={240} className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900" />
                          </label>
                          <label className="grid gap-1 text-xs font-semibold text-slate-600">
                            City
                            <input name="city_snapshot" defaultValue={permitRequest.citySnapshot ?? ""} maxLength={120} className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900" />
                          </label>
                          <div className="grid min-w-0 grid-cols-2 gap-2">
                            <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-600">State<input name="state_snapshot" defaultValue={permitRequest.stateSnapshot ?? ""} maxLength={40} className="min-h-9 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium uppercase text-slate-900" /></label>
                            <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-600">ZIP<input name="zip_snapshot" defaultValue={permitRequest.zipSnapshot ?? ""} inputMode="numeric" maxLength={40} className="min-h-9 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900" /></label>
                          </div>
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
                          <label className="grid gap-1 text-xs font-semibold text-slate-600">
                            Total value
                            <input
                              type="number"
                              name="total_value"
                              min="0"
                              step="0.01"
                              inputMode="decimal"
                              defaultValue={permitRequest.totalValueCents === null ? "" : (permitRequest.totalValueCents / 100).toFixed(2)}
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
                            <ImmediateSubmitButton
                              pendingText="Saving intake..."
                              className="inline-flex min-h-9 items-center rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
                            >
                              Save Intake Details
                            </ImmediateSubmitButton>
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
                            <div className="mt-1 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
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
                            <div className="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[12px] leading-5 text-slate-700 md:col-span-2">
                              <div>
                                <span className="font-semibold text-slate-700">Ready:</span>{" "}
                                Moves the linked job to scheduling when it is unscheduled, or keeps it scheduled if it already has a time.
                              </div>
                              <div>
                                <span className="font-semibold text-slate-700">Waiting for install:</span>{" "}
                                Moves the linked job to Waiting / Pending Info as On Hold: Permit pulled and waiting for install.
                              </div>
                            </div>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600 md:col-span-2">
                              Internal job note <span className="font-normal text-slate-400">(optional)</span>
                              <textarea
                                name="internal_note"
                                rows={3}
                                maxLength={4000}
                                defaultValue={permitRequest.internalIntakeNote ?? ""}
                                placeholder="Add or correct the internal note that should appear on the job."
                                className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-medium text-slate-900"
                              />
                            </label>
                            <div className="flex justify-end md:col-span-2">
                              <ImmediateSubmitButton
                                pendingText="Creating permit..."
                                className="inline-flex min-h-9 items-center rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-800"
                              >
                                Mark Permit Created
                              </ImmediateSubmitButton>
                            </div>
                          </form>
                        ) : (
                          <form action={createJobAndMarkPermitCreatedFromOps} className="mt-2 grid gap-2 md:grid-cols-2">
                            <input type="hidden" name="permit_request_id" value={permitRequest.id} />
                            <input type="hidden" name="customer_location_mode" value="new_new" />
                            <input type="hidden" name="customer_first_name" value={permitRequest.customerFirstNameSnapshot ?? ""} />
                            <input type="hidden" name="customer_last_name" value={permitRequest.customerLastNameSnapshot ?? ""} />
                            <input type="hidden" name="customer_email" value={permitRequest.customerEmailSnapshot ?? ""} />
                            <input type="hidden" name="customer_phone" value={permitRequest.customerPhoneSnapshot ?? ""} />
                            <input type="hidden" name="address_line1" value={permitRequest.addressLine1Snapshot ?? ""} />
                            <input type="hidden" name="address_line2" value={permitRequest.addressLine2Snapshot ?? ""} />
                            <input type="hidden" name="city" value={permitRequest.citySnapshot ?? ""} />
                            <input type="hidden" name="state" value={permitRequest.stateSnapshot ?? ""} />
                            <input type="hidden" name="zip" value={permitRequest.zipSnapshot ?? ""} />
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
                                {[permitRequest.addressLine1Snapshot, permitRequest.addressLine2Snapshot].filter(Boolean).join(", ") || "Address pending"}
                              </div>
                              <div>
                                <span className="font-medium text-slate-500">City:</span>{" "}
                                {[permitRequest.citySnapshot, permitRequest.stateSnapshot, permitRequest.zipSnapshot].filter(Boolean).join(", ") || "City, state, and ZIP pending"}
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
                            <div className="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[12px] leading-5 text-slate-700 md:col-span-2">
                              <div>
                                <span className="font-semibold text-slate-700">Ready:</span>{" "}
                                Creates an unscheduled ECC testing job and places it in the waiting to be scheduled queue.
                              </div>
                              <div>
                                <span className="font-semibold text-slate-700">Waiting for install:</span>{" "}
                                Creates an ECC testing job and places it in Waiting / Pending Info as On Hold: Permit pulled and waiting for install.
                              </div>
                            </div>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600 md:col-span-2">
                              Internal job note <span className="font-normal text-slate-400">(optional)</span>
                              <textarea
                                name="internal_note"
                                rows={3}
                                maxLength={4000}
                                defaultValue={permitRequest.internalIntakeNote ?? ""}
                                placeholder="Add or correct the internal note that should appear on the job."
                                className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-medium text-slate-900"
                              />
                            </label>
                            <div className="flex justify-end md:col-span-2">
                              <ImmediateSubmitButton
                                pendingText="Creating job..."
                                className="inline-flex min-h-9 items-center rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-800"
                              >
                                Create Job From Permit Intake
                              </ImmediateSubmitButton>
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
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700">
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
              // Remount whenever the rendered bucket or contractor focus changes.
              // Queue chips and Apply() both navigate via soft nav, which keeps
              // this client component mounted — without a bucket+contractor key
              // its useState-seeded activeBucket/panelCache would keep serving
              // the previously rendered bucket's (or pre-filter) rows.
              key={`ops-panel-${effectiveBoardBucketFilter}-${contractorFocusFilter ?? "all"}`}
              contractorFocusSelector={
                showWorkspaceContractorFilter ? (
                  <ContractorFocusSelector
                    allCount={contractorFocusAllCount}
                    internalWorkCount={contractorFocusInternalCount}
                    internalWorkId={INTERNAL_WORK_CONTRACTOR_FOCUS_ID}
                    options={contractorFocusOptions}
                    selectedIds={contractorFocusIds}
                  />
                ) : null
              }
              initialBucket={effectiveBoardBucketFilter}
              initialSort={boardSort}
              initialPanel={{
                queueLabel: selectedWorkspaceSection?.label ?? selectedWorkspaceTab.label,
                itemNoun: selectedWorkspaceItemNoun,
                reasonOptions: workspaceReasonOptions,
                rows: activeQueueRows,
                pinnedViews: activeQueuePinnedViews,
                canExportContractorSafeCsv,
              }}
              contractorParam={contractorFocusFilter ?? ""}
              hasContractorFilter={contractorFocusIds.length > 0}
              clearContractorHref={clearOpsBoardFiltersHref}
              headerRightActionByBucket={opsBoardHeaderRightActionByBucket}
            />
          )}
        </section>
        </div>

        <aside className="space-y-3 sm:space-y-4 xl:sticky xl:top-44 xl:self-start">
          <section className="hidden rounded-xl border border-slate-200 bg-white px-4 py-3 xl:block" aria-label="Operations queue index">
            <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-600">Queues</div>
            <nav className="space-y-0.5">
              {opsRailQueueRows.map((queue) => {
                const isException = queue.key === "exceptions";
                const isWaiting = queue.key === "waiting";
                const tickClass = queue.active
                  ? "bg-blue-600"
                  : isException
                  ? "bg-rose-600"
                  : isWaiting
                  ? "bg-amber-500"
                  : "bg-[#cfd2cd]";
                const countClass = queue.active
                  ? "bg-blue-600 px-2 py-0.5 text-white"
                  : isException
                  ? "text-rose-700"
                  : isWaiting
                  ? "text-amber-700"
                  : "text-slate-500";

                return (
                  <Link
                    key={queue.key}
                    href={queue.href}
                    aria-current={queue.active ? "page" : undefined}
                    className={`grid min-h-10 grid-cols-[2px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 ${
                      queue.count === 0 ? "opacity-40" : ""
                    }`}
                  >
                    <span className={`h-3.5 w-0.5 rounded-sm ${tickClass}`} aria-hidden="true" />
                    <span className={`min-w-0 text-[13.5px] ${queue.active ? "font-bold text-navy" : "font-medium text-slate-700"}`}>
                      {queue.label}
                    </span>
                    <span className={`rounded-full font-mono text-[12px] font-semibold tabular-nums ${countClass}`}>
                      {queue.count}
                    </span>
                  </Link>
                );
              })}
            </nav>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-600">Queue Health</div>
            <div className="space-y-2 text-[13.5px] text-slate-700">
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${queueHealthStats.agingOver30 > 0 ? "bg-amber-500" : "bg-[#cfd2cd]"}`} aria-hidden="true" />
                <span><strong className="font-mono font-semibold tabular-nums text-navy">{queueHealthStats.agingOver30}</strong> aging over 30 days</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${queueHealthStats.unassigned > 0 ? "bg-amber-500" : "bg-[#cfd2cd]"}`} aria-hidden="true" />
                <span><strong className="font-mono font-semibold tabular-nums text-navy">{queueHealthStats.unassigned}</strong> unassigned</span>
              </div>
              {showTeamClockStatusCard ? (
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${teamClockStatusRows.length === 0 ? "bg-amber-500" : "bg-[#cfd2cd]"}`} aria-hidden="true" />
                  <span>
                    {teamClockStatusRows.length === 0
                      ? "No team members clocked in"
                      : `${teamClockStatusRows.length} team member${teamClockStatusRows.length === 1 ? "" : "s"} clocked in`}
                  </span>
                </div>
              ) : null}
            </div>
            {queueHealthStats.breakdown.length > 0 ? (
              <div className="mt-3 space-y-1.5 border-t border-slate-200 pt-3">
                {queueHealthStats.breakdown.map((entry) => (
                  <div key={entry.label} className="flex items-center justify-between text-[11.5px]">
                    <span className="text-slate-600">{entry.label}</span>
                    <span className="font-mono font-semibold tabular-nums text-navy">{entry.count}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          {returnedWorkshareCount > 0 || hasActiveIncomingWorkshareConnection ? (
            <section className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-600">Workshare</div>
              <div className="space-y-2 text-[13.5px]">
                {returnedWorkshareCount > 0 ? (
                  <Link href="/ops/workshare/returned" className="flex min-h-11 items-center justify-between gap-2 rounded-lg text-sm font-medium text-blue-700 hover:underline xl:min-h-0 xl:rounded-none xl:text-[12.5px] xl:font-normal">
                    <span>{returnedWorkshareCount} returned · needs action</span>
                    <span aria-hidden="true">&rarr;</span>
                  </Link>
                ) : null}
                {hasActiveIncomingWorkshareConnection ? (
                  <Link href="/ops/workshare/incoming" className="flex min-h-11 items-center justify-between gap-2 rounded-lg text-sm font-medium text-blue-700 hover:underline xl:min-h-0 xl:rounded-none xl:text-[12.5px] xl:font-normal">
                    <span>Incoming ECC/HERS requests</span>
                    <span aria-hidden="true">&rarr;</span>
                  </Link>
                ) : null}
              </div>
            </section>
          ) : null}

          {canShowJobQueueExport || showTeamClockStatusCard ? (
            <section className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-600">Quick Links</div>
              <div className="space-y-2 text-[13.5px]">
                {showTeamClockStatusCard ? (
                  <Link href="/time-clock" className="flex min-h-11 items-center text-sm font-medium text-blue-700 hover:underline xl:min-h-0 xl:text-[12.5px] xl:font-normal">Open time clock</Link>
                ) : null}
                {canShowJobQueueExport ? (
                  <>
                    <a href="#ops-export-menu-mobile" className="flex min-h-11 items-center text-sm font-medium text-blue-700 hover:underline xl:hidden">Export this queue</a>
                    <a href="#ops-export-menu" className="hidden text-blue-700 hover:underline xl:block">Export this queue</a>
                  </>
                ) : null}
              </div>

              {showTeamClockStatusCard && teamClockStatusRows.length > 0 ? (
                <details className="mt-3 border-t border-slate-200 pt-3">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-slate-700 hover:text-navy xl:min-h-0 xl:text-[11.5px] [&::-webkit-details-marker]:hidden">
                    Clocked-in team · {teamClockStatusRows.length}
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    {teamClockStatusRows.slice(0, 8).map((row) => (
                      <div key={row.internalUserId} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-slate-900">{row.displayName}</div>
                          <div className="text-[11px] text-slate-600">Since {row.sinceAt}</div>
                        </div>
                        <span className="shrink-0 text-[11px] font-medium text-slate-700">{row.statusLabel} · {row.elapsed}</span>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </section>
          ) : null}
        </aside>
        </div>
      </div>
    );
}
