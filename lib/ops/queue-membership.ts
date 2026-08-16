import {
  isJobLifecycleExceptionState,
  isTerminalJobLifecycleState,
  resolveJobLifecycleState,
} from "@/lib/jobs/job-lifecycle-state";
import {
  EXCEPTION_QUEUE_STATUSES,
  WAITING_QUEUE_STATUSES,
} from "@/lib/ops/queue-status-contracts";

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

const WAITING_STATUS_SET = new Set<string>(WAITING_QUEUE_STATUSES);
const EXCEPTION_STATUS_SET = new Set<string>(EXCEPTION_QUEUE_STATUSES);

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

export type ScheduledAssignedMyWorkInput = PrimaryQueueJob & {
  scheduledDate?: string | null;
  fieldComplete?: boolean | null;
};

/**
 * Resolves whether assigned work is still actionable for a field user.
 *
 * The appointment remains historical truth when work is interrupted, so a
 * schedule date alone cannot establish field responsibility. Office-owned
 * queues and lifecycle exceptions take precedence until the blocker is
 * explicitly released or a new visit is scheduled and assigned.
 */
export function isScheduledAssignedMyWorkEligible(
  input: ScheduledAssignedMyWorkInput,
): boolean {
  if (input.fieldComplete === true) return false;

  // Preserve the field queue's defensive handling of legacy rows whose
  // lifecycle completed before their operational projection caught up.
  const lifecycleStatus = normalize(input.status);
  if (["completed", "closed", "cancelled"].includes(lifecycleStatus)) return false;

  if (resolvePrimaryOpsQueue(input) !== null) return false;

  const state = resolveJobLifecycleState({
    status: input.status,
    opsStatus: input.ops_status,
    deletedAt: input.deleted_at,
    hasScheduledAppointment: Boolean(String(input.scheduledDate ?? "").trim()),
  });

  if (isTerminalJobLifecycleState(state) || isJobLifecycleExceptionState(state)) {
    return false;
  }

  if (state === "on_the_way" || state === "in_process") return true;
  return Boolean(String(input.scheduledDate ?? "").trim());
}
