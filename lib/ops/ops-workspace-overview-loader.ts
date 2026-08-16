import type { createAdminClient, createClient } from "@/lib/supabase/server";
import type { ProductMode } from "@/lib/business/product-mode-defaults";
import {
  buildBillingTruthCloseoutProjectionMap,
  type BillingTruthCloseoutProjection,
} from "@/lib/business/job-billing-state";
import {
  listInternalContractorUpdateAwareness,
  listInternalNewWorkRequestAwareness,
} from "@/lib/actions/notification-read-actions";
import { getActiveJobAssignmentDisplayMap } from "@/lib/staffing/human-layer";
import { startOfTodayUtcIsoLA, startOfTomorrowUtcIsoLA } from "@/lib/utils/schedule-la";
import { listCloseoutQueueJobs } from "@/lib/ops/closeout-queue";
import { countPendingContractorIntakeQueueRows } from "@/lib/ops/contractor-intake-queue";
import {
  OPS_WORKSPACE_JOB_SELECT,
  type OpsWorkspaceJob,
} from "@/lib/ops/ops-workspace-job-contract";
import {
  buildOpsWorkspaceTabs,
  resolveEffectiveOpsBoardBucketFilter,
  resolveVisibleOpsWorkspaceQueueKeys,
  type OpsBoardFilterBucket,
  type OpsWorkspaceQueueKey,
  type OpsWorkspaceTab,
} from "@/lib/ops/ops-workspace-queues";
import { isPrimaryQueueJob, resolvePrimaryOpsQueue } from "@/lib/ops/queue-membership";
import { buildScheduledWithoutTechSnapshot } from "@/lib/ops/scheduled-without-tech-snapshot";
import {
  loadWaitingExceptionQueueSnapshot,
  type WaitingExceptionQueueSnapshot,
} from "@/lib/ops/waiting-exception-loader";
import {
  listActivePermitRequestQueueRowsIfAvailable,
  type PermitRequestQueueRow,
} from "@/lib/permits/permit-requests-read-model";
import { buildCloseoutProjectionInputs } from "@/lib/ops/ops-workspace-data-loader";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;
type AdminSupabaseClient = ReturnType<typeof createAdminClient>;
type AssignmentDisplayMap = Awaited<ReturnType<typeof getActiveJobAssignmentDisplayMap>>;

type ActivePermitRequestsResult = {
  schemaAvailable: boolean;
  rows: PermitRequestQueueRow[];
};

export type OpsWorkspaceOverview = {
  activePermitRequestRows: PermitRequestQueueRow[];
  closeoutProjectionByJob: Map<string, BillingTruthCloseoutProjection>;
  closeoutQueueRowsFull: OpsWorkspaceJob[];
  coreBoardWorkspaceKeys: OpsWorkspaceQueueKey[];
  effectiveBoardBucketFilter: Exclude<OpsBoardFilterBucket, "all">;
  permitRequestsSchemaAvailable: boolean;
  scheduledWithoutTechSnapshot: ReturnType<typeof buildScheduledWithoutTechSnapshot>;
  startTodayUtc: string;
  startTomorrowUtc: string;
  waitingExceptionSnapshot: WaitingExceptionQueueSnapshot;
  workspaceTabs: OpsWorkspaceTab[];
};

export function buildOpsWorkspaceOverview(params: {
  activePermitRequestsResult: ActivePermitRequestsResult;
  closeoutProjectionByJobId: ReadonlyMap<string, BillingTruthCloseoutProjection>;
  closeoutSourceRows: OpsWorkspaceJob[];
  contractorIntakeCount: number;
  contractorIntakeQueueAvailable: boolean;
  contractorScopeFilter: string | null;
  fieldWorkAssignmentMap: AssignmentDisplayMap;
  fieldWorkRows: OpsWorkspaceJob[];
  followUpReminderRows: OpsWorkspaceJob[];
  needToScheduleCount: number;
  permitWorkflowEnabled: boolean;
  productMode: ProductMode;
  requestedBucket: OpsBoardFilterBucket;
  scheduledAssignmentMap: AssignmentDisplayMap;
  scheduledOpenRows: OpsWorkspaceJob[];
  unreadContractorUpdateCount: number;
  unreadNewWorkRequestCount: number;
  waitingExceptionSnapshot: WaitingExceptionQueueSnapshot;
  startTodayUtc: string;
  startTomorrowUtc: string;
}): OpsWorkspaceOverview {
  const scheduledWithoutTechSnapshot = buildScheduledWithoutTechSnapshot({
    jobs: params.scheduledOpenRows,
    assignmentDisplayMap: params.scheduledAssignmentMap,
    previewLimit: Math.max(params.scheduledOpenRows.length, 1),
  });

  const assignedFieldWorkCount = params.fieldWorkRows.filter((row) => {
    const jobId = String(row.id ?? "").trim();
    return (
      resolvePrimaryOpsQueue(row) === null
      && Array.isArray(params.fieldWorkAssignmentMap[jobId])
      && params.fieldWorkAssignmentMap[jobId].length > 0
    );
  }).length;

  const statusCount = (status: Parameters<WaitingExceptionQueueSnapshot["statusCounts"]["get"]>[0]) =>
    params.waitingExceptionSnapshot.statusCounts.get(status) ?? 0;
  const waitingCount = statusCount("pending_info") + statusCount("on_hold") + statusCount("waiting");
  const exceptionCount =
    statusCount("failed")
    + statusCount("retest_needed")
    + statusCount("pending_office_review")
    + statusCount("problem");

  const closeoutQueueRowsFull = listCloseoutQueueJobs(
    params.closeoutSourceRows,
    (job) => params.closeoutProjectionByJobId.get(String(job.id ?? "").trim()) ?? job,
  );
  const activePermitRequestRows = params.activePermitRequestsResult.rows;
  const permitRequestsSchemaAvailable =
    params.permitWorkflowEnabled && params.activePermitRequestsResult.schemaAvailable;
  const effectiveBoardBucketFilter = resolveEffectiveOpsBoardBucketFilter({
    requestedBucket: params.requestedBucket,
    productMode: params.productMode,
    permitRequestsSchemaAvailable,
  });
  const workspaceTabs = buildOpsWorkspaceTabs({
    counts: {
      need_to_schedule: params.needToScheduleCount,
      field_work: assignedFieldWorkCount,
      without_tech: scheduledWithoutTechSnapshot.count,
      waiting: waitingCount,
      exceptions: exceptionCount,
      closeout: closeoutQueueRowsFull.length,
      follow_ups: params.followUpReminderRows.filter((job) =>
        isPrimaryQueueJob(job, "follow_ups"),
      ).length,
      contractor_intake: params.contractorIntakeCount,
      permits: activePermitRequestRows.length,
      updates: params.unreadContractorUpdateCount + params.unreadNewWorkRequestCount,
    },
    contractorScopeFilter: params.contractorScopeFilter,
    contractorIntakeQueueAvailable: params.contractorIntakeQueueAvailable,
    permitRequestsSchemaAvailable,
  });

  return {
    activePermitRequestRows,
    closeoutProjectionByJob: new Map(params.closeoutProjectionByJobId),
    closeoutQueueRowsFull,
    coreBoardWorkspaceKeys: resolveVisibleOpsWorkspaceQueueKeys({
      productMode: params.productMode,
      permitRequestsSchemaAvailable,
    }),
    effectiveBoardBucketFilter,
    permitRequestsSchemaAvailable,
    scheduledWithoutTechSnapshot,
    startTodayUtc: params.startTodayUtc,
    startTomorrowUtc: params.startTomorrowUtc,
    waitingExceptionSnapshot: params.waitingExceptionSnapshot,
    workspaceTabs,
  };
}

export async function loadOpsWorkspaceOverview(params: {
  supabase: ServerSupabaseClient;
  admin: AdminSupabaseClient;
  accountOwnerUserId: string;
  contractorIntakeQueueAvailable: boolean;
  contractorScopeFilter: string | null;
  permitWorkflowEnabled: boolean;
  productMode: ProductMode;
  requestedBucket: OpsBoardFilterBucket;
}): Promise<OpsWorkspaceOverview> {
  const startTodayUtc = startOfTodayUtcIsoLA();
  const startTomorrowUtc = startOfTomorrowUtcIsoLA();
  const scheduledSnapshotSelect =
    "id, status, ops_status, scheduled_date, window_start, follow_up_date, next_action_note, action_required_by";

  const [
    needToScheduleCountResult,
    waitingExceptionSnapshot,
    followUpReminderRowsResult,
    fieldWorkRowsResult,
    scheduledOpenRowsResult,
    closeoutRowsResult,
    contractorIntakeCount,
    unreadContractorUpdates,
    unreadNewWorkRequests,
    activePermitRequestsResult,
  ] = await Promise.all([
    params.supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .eq("ops_status", "need_to_schedule")
      .eq("status", "open")
      .is("follow_up_date", null)
      .is("next_action_note", null)
      .is("action_required_by", null),
    loadWaitingExceptionQueueSnapshot({ supabase: params.supabase }),
    params.supabase
      .from("jobs")
      .select("id, status, ops_status, follow_up_date, next_action_note, action_required_by")
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .or("follow_up_date.not.is.null,next_action_note.not.is.null,action_required_by.not.is.null"),
    params.supabase
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
      .gte("scheduled_date", startTodayUtc)
      .lt("scheduled_date", startTomorrowUtc),
    params.supabase
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
      .order("window_start", { ascending: true }),
    params.supabase
      .from("jobs")
      .select(OPS_WORKSPACE_JOB_SELECT)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .neq("ops_status", "closed")
      .eq("field_complete", true)
      .order("created_at", { ascending: false }),
    params.contractorIntakeQueueAvailable
      ? countPendingContractorIntakeQueueRows({
          supabase: params.admin,
          accountOwnerUserId: params.accountOwnerUserId,
        })
      : Promise.resolve(0),
    listInternalContractorUpdateAwareness({ limit: 100, onlyUnread: true }),
    listInternalNewWorkRequestAwareness({ limit: 100, onlyUnread: true }),
    params.permitWorkflowEnabled
      ? listActivePermitRequestQueueRowsIfAvailable({
          supabase: params.supabase as unknown as Parameters<
            typeof listActivePermitRequestQueueRowsIfAvailable
          >[0]["supabase"],
          accountOwnerUserId: params.accountOwnerUserId,
          limit: 50,
        })
      : Promise.resolve({ schemaAvailable: true, rows: [] as PermitRequestQueueRow[] }),
  ]);

  if (needToScheduleCountResult.error) throw needToScheduleCountResult.error;
  if (followUpReminderRowsResult.error) throw followUpReminderRowsResult.error;
  if (fieldWorkRowsResult.error) throw fieldWorkRowsResult.error;
  if (scheduledOpenRowsResult.error) throw scheduledOpenRowsResult.error;
  if (closeoutRowsResult.error) throw closeoutRowsResult.error;

  const followUpReminderRows = (followUpReminderRowsResult.data ?? []) as OpsWorkspaceJob[];
  const fieldWorkRows = (fieldWorkRowsResult.data ?? []) as OpsWorkspaceJob[];
  const scheduledOpenRows = (scheduledOpenRowsResult.data ?? []) as OpsWorkspaceJob[];
  const closeoutSourceRows = (closeoutRowsResult.data ?? []) as OpsWorkspaceJob[];
  const scheduledIds = scheduledOpenRows.map((row) => String(row.id ?? "").trim()).filter(Boolean);
  const fieldWorkIds = fieldWorkRows.map((row) => String(row.id ?? "").trim()).filter(Boolean);

  // These reads depend on the first snapshot but not on each other. Keeping
  // them in one barrier removes two avoidable sequential network phases.
  const [scheduledAssignmentMap, fieldWorkAssignmentMap, closeoutProjection] = await Promise.all([
    scheduledIds.length
      ? getActiveJobAssignmentDisplayMap({ supabase: params.supabase, jobIds: scheduledIds })
      : Promise.resolve({}),
    fieldWorkIds.length
      ? getActiveJobAssignmentDisplayMap({ supabase: params.supabase, jobIds: fieldWorkIds })
      : Promise.resolve({}),
    buildBillingTruthCloseoutProjectionMap({
      supabase: params.supabase,
      accountOwnerUserId: params.accountOwnerUserId,
      jobs: buildCloseoutProjectionInputs(closeoutSourceRows),
    }),
  ]);

  return buildOpsWorkspaceOverview({
    activePermitRequestsResult,
    closeoutProjectionByJobId: closeoutProjection.projectionsByJobId,
    closeoutSourceRows,
    contractorIntakeCount,
    contractorIntakeQueueAvailable: params.contractorIntakeQueueAvailable,
    contractorScopeFilter: params.contractorScopeFilter,
    fieldWorkAssignmentMap,
    fieldWorkRows,
    followUpReminderRows,
    needToScheduleCount: needToScheduleCountResult.count ?? 0,
    permitWorkflowEnabled: params.permitWorkflowEnabled,
    productMode: params.productMode,
    requestedBucket: params.requestedBucket,
    scheduledAssignmentMap,
    scheduledOpenRows,
    unreadContractorUpdateCount: unreadContractorUpdates.length,
    unreadNewWorkRequestCount: unreadNewWorkRequests.length,
    waitingExceptionSnapshot,
    startTodayUtc,
    startTomorrowUtc,
  });
}
