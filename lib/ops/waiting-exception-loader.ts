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

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type FocusedOpsQueueKey = "waiting" | "exceptions";
export type WaitingExceptionStatus =
  | (typeof WAITING_QUEUE_STATUSES)[number]
  | (typeof EXCEPTION_QUEUE_STATUSES)[number];

export type OpsWorkspaceJob = FocusedQueueJob & {
  customer_phone?: string | null;
  action_required_by?: string | null;
  ops_board_failure_note?: string | null;
  jurisdiction?: string | null;
  permit_date?: string | null;
  field_complete_at?: string | null;
  billing_disposition?: string | null;
  certs_complete?: boolean | null;
  contractor_id?: string | null;
  contractors?: { name?: string | null } | null;
};

export const OPS_WORKSPACE_JOB_SELECT =
  "id, title, status, job_type, ops_status, scheduled_date, window_start, window_end, city, job_address, customer_first_name, customer_last_name, customer_phone, pending_info_reason, on_hold_reason, follow_up_date, next_action_note, action_required_by, ops_board_failure_note, permit_number, jurisdiction, permit_date, field_complete, field_complete_at, invoice_complete, billing_disposition, certs_complete, contractor_id, contractors(name), created_at";

type WaitingExceptionSummaryInput = {
  pendingInfoRows: FocusedQueueJob[];
  onHoldCount: number | null;
  waitingCount: number | null;
  exceptionRows: RetestQueueJob[];
  retestContinuationRows: Array<{ parent_job_id?: string | null }>;
};

export type WaitingExceptionQueueSnapshot = {
  statusCounts: ReadonlyMap<WaitingExceptionStatus, number>;
  retestContinuationParentIds: ReadonlySet<string>;
};

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

  return {
    statusCounts: new Map<WaitingExceptionStatus, number>([
      ["pending_info", buildWaitingQueueRows(input.pendingInfoRows).length],
      ["on_hold", input.onHoldCount ?? 0],
      ["waiting", input.waitingCount ?? 0],
      ["pending_office_review", exceptionCounts.get("pending_office_review") ?? 0],
      ["failed", exceptionCounts.get("failed") ?? 0],
      ["retest_needed", exceptionCounts.get("retest_needed") ?? 0],
      ["problem", exceptionCounts.get("problem") ?? 0],
    ]),
    retestContinuationParentIds,
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

  return buildWaitingExceptionQueueSnapshot({
    pendingInfoRows: (pendingInfoRowsRes.data ?? []) as FocusedQueueJob[],
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
  const currentRows = excludeHistoricalRetestParents(
    rows,
    params.continuationParentIds,
  );
  const queueRows = params.queueKey === "waiting"
    ? buildWaitingQueueRows(currentRows)
    : buildExceptionQueueRows(currentRows);

  return sortOpsBoardRows(queueRows, params.sortKey);
}
