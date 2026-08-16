import type { createClient } from "@/lib/supabase/server";
import {
  buildExceptionQueueRows,
  buildWaitingQueueRows,
  type FocusedQueueJob,
} from "@/lib/ops/focused-queues";
import {
  EXCEPTION_QUEUE_STATUSES,
  WAITING_QUEUE_STATUSES,
} from "@/lib/ops/queue-status-contracts";
import {
  buildRetestContinuationParentIds,
  countCurrentExceptionStatuses,
  excludeHistoricalRetestParents,
  type RetestQueueJob,
} from "@/lib/ops/retest-queue-exclusivity";
import {
  sortOpsBoardRows,
  type OpsBoardSortKey,
} from "@/lib/ops/ops-board-sorting";
import {
  OPS_WORKSPACE_JOB_SELECT,
  type OpsWorkspaceJob,
} from "@/lib/ops/ops-workspace-job-contract";
import {
  buildServiceFollowUpQueueStateByJob,
  enrichServiceFollowUpQueueRows,
  type ServiceFollowUpQueueEvent,
  type ServiceFollowUpQueueStateByJob,
} from "@/lib/ops/service-follow-up-queue-state";
import { buildOpsStatusEnteredAtByJob } from "@/lib/utils/lifecycle-aging";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type FocusedOpsQueueKey = "waiting" | "exceptions";
export type WaitingExceptionStatus =
  | (typeof WAITING_QUEUE_STATUSES)[number]
  | (typeof EXCEPTION_QUEUE_STATUSES)[number];

type WaitingExceptionSummaryInput = {
  pendingInfoRows: FocusedQueueJob[];
  serviceFollowUpEvents?: ServiceFollowUpQueueEvent[];
  onHoldCount: number | null;
  waitingCount: number | null;
  exceptionRows: RetestQueueJob[];
  retestContinuationRows: Array<{ parent_job_id?: string | null }>;
};

export type WaitingExceptionQueueSnapshot = {
  statusCounts: ReadonlyMap<WaitingExceptionStatus, number>;
  retestContinuationParentIds: ReadonlySet<string>;
  serviceFollowUpByJob: ServiceFollowUpQueueStateByJob;
};

export type FocusedOpsQueueData = {
  rows: OpsWorkspaceJob[];
  continuationParentIds: ReadonlySet<string>;
  serviceFollowUpByJob: ServiceFollowUpQueueStateByJob;
  opsStatusEnteredAtByJob: ReadonlyMap<string, Record<string, string>>;
  latestFailedEvidenceByJob: ReadonlyMap<string, string>;
};

export function buildFocusedOpsQueueRows(params: {
  rows: OpsWorkspaceJob[];
  queueKey: FocusedOpsQueueKey;
  continuationParentIds: ReadonlySet<string>;
  serviceFollowUpByJob: ServiceFollowUpQueueStateByJob;
  sortKey: OpsBoardSortKey;
}): OpsWorkspaceJob[] {
  const enrichedRows = params.queueKey === "waiting"
    ? enrichServiceFollowUpQueueRows(params.rows, params.serviceFollowUpByJob)
    : params.rows;
  const currentRows = excludeHistoricalRetestParents(
    enrichedRows,
    params.continuationParentIds,
  );
  const queueRows = params.queueKey === "waiting"
    ? buildWaitingQueueRows(currentRows)
    : buildExceptionQueueRows(currentRows);

  return sortOpsBoardRows(queueRows, params.sortKey);
}

export function buildWaitingExceptionQueueSnapshot(
  input: WaitingExceptionSummaryInput,
): WaitingExceptionQueueSnapshot {
  const retestContinuationParentIds = buildRetestContinuationParentIds(
    input.retestContinuationRows,
  );
  const exceptionCounts = countCurrentExceptionStatuses(
    input.exceptionRows,
    retestContinuationParentIds,
  );
  const serviceFollowUpByJob = buildServiceFollowUpQueueStateByJob(
    input.pendingInfoRows,
    input.serviceFollowUpEvents ?? [],
  );
  const currentPendingInfoRows = enrichServiceFollowUpQueueRows(
    input.pendingInfoRows,
    serviceFollowUpByJob,
  );

  return {
    statusCounts: new Map<WaitingExceptionStatus, number>([
      ["pending_info", buildWaitingQueueRows(currentPendingInfoRows).length],
      ["on_hold", input.onHoldCount ?? 0],
      ["waiting", input.waitingCount ?? 0],
      ["pending_office_review", exceptionCounts.get("pending_office_review") ?? 0],
      ["failed", exceptionCounts.get("failed") ?? 0],
      ["retest_needed", exceptionCounts.get("retest_needed") ?? 0],
      ["problem", exceptionCounts.get("problem") ?? 0],
    ]),
    retestContinuationParentIds,
    serviceFollowUpByJob,
  };
}

function opsStatusCountQuery(
  supabase: ServerSupabaseClient,
  opsStatus: (typeof WAITING_QUEUE_STATUSES)[number],
) {
  return supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .eq("ops_status", opsStatus);
}

export async function loadWaitingExceptionQueueSnapshot(params: {
  supabase: ServerSupabaseClient;
}): Promise<WaitingExceptionQueueSnapshot> {
  const [
    pendingInfoRowsRes,
    onHoldCountRes,
    waitingCountRes,
    exceptionRowsRes,
    retestContinuationRowsRes,
  ] = await Promise.all([
    params.supabase
      .from("jobs")
      .select("id, ops_status, pending_info_reason, on_hold_reason, field_complete, job_type, permit_number, invoice_complete, created_at")
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .eq("ops_status", "pending_info"),
    opsStatusCountQuery(params.supabase, "on_hold"),
    opsStatusCountQuery(params.supabase, "waiting"),
    params.supabase
      .from("jobs")
      .select("id, ops_status")
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .in("ops_status", [...EXCEPTION_QUEUE_STATUSES]),
    params.supabase
      .from("jobs")
      .select("parent_job_id")
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .eq("job_type", "ecc")
      .not("parent_job_id", "is", null),
  ]);

  if (pendingInfoRowsRes.error) throw pendingInfoRowsRes.error;
  if (onHoldCountRes.error) throw onHoldCountRes.error;
  if (waitingCountRes.error) throw waitingCountRes.error;
  if (exceptionRowsRes.error) throw exceptionRowsRes.error;
  if (retestContinuationRowsRes.error) throw retestContinuationRowsRes.error;

  const pendingInfoRows = (pendingInfoRowsRes.data ?? []) as FocusedQueueJob[];
  const pendingInfoJobIds = pendingInfoRows
    .map((job) => String(job?.id ?? "").trim())
    .filter(Boolean);
  const serviceFollowUpEventsRes = pendingInfoJobIds.length
    ? await params.supabase
        .from("job_events")
        .select("job_id, created_at, meta")
        .in("job_id", pendingInfoJobIds)
        .eq("event_type", "ops_update")
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  if (serviceFollowUpEventsRes.error) throw serviceFollowUpEventsRes.error;

  return buildWaitingExceptionQueueSnapshot({
    pendingInfoRows,
    serviceFollowUpEvents:
      (serviceFollowUpEventsRes.data ?? []) as ServiceFollowUpQueueEvent[],
    onHoldCount: onHoldCountRes.count,
    waitingCount: waitingCountRes.count,
    exceptionRows: (exceptionRowsRes.data ?? []) as RetestQueueJob[],
    retestContinuationRows: retestContinuationRowsRes.data ?? [],
  });
}

export async function loadFocusedOpsQueueData(params: {
  supabase: ServerSupabaseClient;
  queueKey: FocusedOpsQueueKey;
  continuationParentIds?: ReadonlySet<string>;
  serviceFollowUpByJob?: ServiceFollowUpQueueStateByJob;
  sortKey: OpsBoardSortKey;
  includeLifecycleEvidence?: boolean;
}): Promise<FocusedOpsQueueData> {
  const statuses = params.queueKey === "waiting"
    ? WAITING_QUEUE_STATUSES
    : EXCEPTION_QUEUE_STATUSES;
  const [queueRes, continuationRowsRes] = await Promise.all([
    params.supabase
      .from("jobs")
      .select(OPS_WORKSPACE_JOB_SELECT)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .neq("ops_status", "closed")
      .in("ops_status", [...statuses])
      .order("created_at", { ascending: true }),
    params.continuationParentIds
      ? Promise.resolve({ data: [], error: null })
      : params.supabase
          .from("jobs")
          .select("parent_job_id")
          .is("deleted_at", null)
          .neq("status", "cancelled")
          .eq("job_type", "ecc")
          .not("parent_job_id", "is", null),
  ]);

  if (queueRes.error) throw queueRes.error;
  if (continuationRowsRes.error) throw continuationRowsRes.error;

  const rows = (queueRes.data ?? []) as unknown as OpsWorkspaceJob[];
  const continuationParentIds = params.continuationParentIds ??
    buildRetestContinuationParentIds(continuationRowsRes.data ?? []);
  const rowJobIds = rows
    .map((job) => String(job?.id ?? "").trim())
    .filter(Boolean);
  const shouldLoadOpsEvents = rowJobIds.length > 0 && (
    params.includeLifecycleEvidence === true ||
    (params.queueKey === "waiting" && !params.serviceFollowUpByJob)
  );
  const shouldLoadFailedEvidence = rowJobIds.length > 0 &&
    params.includeLifecycleEvidence === true &&
    params.queueKey === "exceptions";
  const [statusEventsRes, failedRunsRes] = await Promise.all([
    shouldLoadOpsEvents
      ? params.supabase
          .from("job_events")
          .select("job_id, created_at, meta")
          .in("job_id", rowJobIds)
          .eq("event_type", "ops_update")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    shouldLoadFailedEvidence
      ? params.supabase
          .from("ecc_test_runs")
          .select("job_id, created_at, computed_pass, override_pass, is_completed")
          .in("job_id", rowJobIds)
          .eq("is_completed", true)
          .or("override_pass.eq.false,computed_pass.eq.false")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (statusEventsRes.error) throw statusEventsRes.error;
  if (failedRunsRes.error) throw failedRunsRes.error;

  const statusEvents = (statusEventsRes.data ?? []) as ServiceFollowUpQueueEvent[];
  const serviceFollowUpByJob = params.serviceFollowUpByJob ?? (
    params.queueKey === "waiting"
      ? buildServiceFollowUpQueueStateByJob(rows, statusEvents)
      : new Map()
  );
  const latestFailedEvidenceByJob = new Map<string, string>();
  for (const row of failedRunsRes.data ?? []) {
    const jobId = String((row as { job_id?: unknown })?.job_id ?? "").trim();
    if (!jobId || latestFailedEvidenceByJob.has(jobId)) continue;
    const createdAt = String((row as { created_at?: unknown })?.created_at ?? "").trim();
    if (createdAt) latestFailedEvidenceByJob.set(jobId, createdAt);
  }

  return {
    rows: buildFocusedOpsQueueRows({
      rows,
      queueKey: params.queueKey,
      continuationParentIds,
      serviceFollowUpByJob,
      sortKey: params.sortKey,
    }),
    continuationParentIds,
    serviceFollowUpByJob,
    opsStatusEnteredAtByJob: buildOpsStatusEnteredAtByJob(statusEvents),
    latestFailedEvidenceByJob,
  };
}

export async function loadFocusedOpsQueueRows(params: {
  supabase: ServerSupabaseClient;
  queueKey: FocusedOpsQueueKey;
  continuationParentIds: ReadonlySet<string>;
  serviceFollowUpByJob: ServiceFollowUpQueueStateByJob;
  sortKey: OpsBoardSortKey;
}): Promise<OpsWorkspaceJob[]> {
  const result = await loadFocusedOpsQueueData(params);
  return result.rows;
}
