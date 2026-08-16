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
  buildServiceFollowUpProgressState,
  type ServiceFollowUpProgressEvent,
} from "@/lib/jobs/service-follow-up-progress";
import {
  OPS_WORKSPACE_JOB_SELECT,
  type OpsWorkspaceJob,
} from "@/lib/ops/ops-workspace-job-contract";

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

export type ServiceFollowUpQueueEvent = ServiceFollowUpProgressEvent & {
  job_id?: string | null;
};

export type ServiceFollowUpQueueState = {
  progressLabel: string | null;
  continued: boolean;
};

export type WaitingExceptionQueueSnapshot = {
  statusCounts: ReadonlyMap<WaitingExceptionStatus, number>;
  retestContinuationParentIds: ReadonlySet<string>;
  serviceFollowUpByJob: ReadonlyMap<string, ServiceFollowUpQueueState>;
};

export function buildServiceFollowUpQueueStateByJob(
  jobs: FocusedQueueJob[],
  events: ServiceFollowUpQueueEvent[],
): ReadonlyMap<string, ServiceFollowUpQueueState> {
  const eventsByJob = new Map<string, ServiceFollowUpProgressEvent[]>();
  for (const event of events) {
    const jobId = String(event?.job_id ?? "").trim();
    if (!jobId) continue;
    const jobEvents = eventsByJob.get(jobId) ?? [];
    jobEvents.push(event);
    eventsByJob.set(jobId, jobEvents);
  }

  const stateByJob = new Map<string, ServiceFollowUpQueueState>();
  for (const job of jobs) {
    const jobId = String(job?.id ?? "").trim();
    if (!jobId) continue;
    const state = buildServiceFollowUpProgressState({
      pendingInfoReason: job.pending_info_reason ?? null,
      events: eventsByJob.get(jobId) ?? [],
    });
    if (!state.progressLabel && !state.continuedThroughChildJobId) continue;
    stateByJob.set(jobId, {
      progressLabel: state.progressLabel,
      continued: Boolean(state.continuedThroughChildJobId),
    });
  }

  return stateByJob;
}

function enrichServiceFollowUpRows<T extends FocusedQueueJob>(
  jobs: T[],
  stateByJob: ReadonlyMap<string, ServiceFollowUpQueueState>,
): T[] {
  return jobs.map((job) => {
    const state = stateByJob.get(String(job?.id ?? "").trim());
    if (!state) return job;
    return {
      ...job,
      service_follow_up_progress_label:
        state.progressLabel ?? job.service_follow_up_progress_label ?? null,
      service_follow_up_continued:
        state.continued || Boolean(job.service_follow_up_continued),
    };
  });
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
  const currentPendingInfoRows = enrichServiceFollowUpRows(
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

export async function loadFocusedOpsQueueRows(params: {
  supabase: ServerSupabaseClient;
  queueKey: FocusedOpsQueueKey;
  continuationParentIds: ReadonlySet<string>;
  serviceFollowUpByJob: ReadonlyMap<string, ServiceFollowUpQueueState>;
  sortKey: OpsBoardSortKey;
}): Promise<OpsWorkspaceJob[]> {
  const statuses = params.queueKey === "waiting"
    ? WAITING_QUEUE_STATUSES
    : EXCEPTION_QUEUE_STATUSES;
  const queueRes = await params.supabase
    .from("jobs")
    .select(OPS_WORKSPACE_JOB_SELECT)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .neq("ops_status", "closed")
    .in("ops_status", [...statuses])
    .order("created_at", { ascending: true });

  if (queueRes.error) throw queueRes.error;

  const rows = (queueRes.data ?? []) as unknown as OpsWorkspaceJob[];
  const enrichedRows = params.queueKey === "waiting"
    ? enrichServiceFollowUpRows(rows, params.serviceFollowUpByJob)
    : rows;
  const currentRows = excludeHistoricalRetestParents(
    enrichedRows,
    params.continuationParentIds,
  );
  const queueRows = params.queueKey === "waiting"
    ? buildWaitingQueueRows(currentRows)
    : buildExceptionQueueRows(currentRows);

  return sortOpsBoardRows(queueRows, params.sortKey);
}
