export type PrimaryOpsQueueKey =
  | "need_to_schedule"
  | "waiting"
  | "exceptions"
  | "follow_ups";

export type PrimaryQueueJob = {
  status?: string | null;
  ops_status?: string | null;
  deleted_at?: string | null;
  follow_up_date?: string | null;
  next_action_note?: string | null;
  action_required_by?: string | null;
};

export const PRIMARY_WAITING_OPS_STATUSES = [
  "pending_info",
  "on_hold",
  "waiting",
] as const;

export const PRIMARY_EXCEPTION_OPS_STATUSES = [
  "failed",
  "retest_needed",
  "pending_office_review",
  "problem",
] as const;

const WAITING_STATUS_SET = new Set<string>(PRIMARY_WAITING_OPS_STATUSES);
const EXCEPTION_STATUS_SET = new Set<string>(PRIMARY_EXCEPTION_OPS_STATUSES);

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function hasValue(value: unknown): boolean {
  return String(value ?? "").trim().length > 0;
}

export function hasActiveFollowUpReminder(
  job: Pick<PrimaryQueueJob, "follow_up_date" | "next_action_note" | "action_required_by">,
): boolean {
  return hasValue(job.follow_up_date) || hasValue(job.next_action_note) || hasValue(job.action_required_by);
}

/**
 * Resolves the one primary office-action queue for a job.
 *
 * Closeout is intentionally absent: billing/cert obligations are a second axis
 * and may coexist with Waiting, Exceptions, or Follow Ups. Closed/cancelled work
 * is terminal and cannot re-enter an active queue merely because legacy reminder
 * fields remain populated.
 */
export function resolvePrimaryOpsQueue(job: PrimaryQueueJob): PrimaryOpsQueueKey | null {
  const lifecycleStatus = normalize(job.status);
  const opsStatus = normalize(job.ops_status);

  if (hasValue(job.deleted_at)) return null;
  if (lifecycleStatus === "cancelled" || opsStatus === "closed") return null;

  if (EXCEPTION_STATUS_SET.has(opsStatus)) return "exceptions";
  if (WAITING_STATUS_SET.has(opsStatus)) return "waiting";

  if (opsStatus === "follow_up" || hasActiveFollowUpReminder(job)) return "follow_ups";

  if (lifecycleStatus === "open" && opsStatus === "need_to_schedule") {
    return "need_to_schedule";
  }

  return null;
}

export function isPrimaryQueueJob(job: PrimaryQueueJob, queue: PrimaryOpsQueueKey): boolean {
  return resolvePrimaryOpsQueue(job) === queue;
}
