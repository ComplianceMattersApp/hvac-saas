/**
 * One precedence order for "what state is this job in", shared by every job-detail
 * surface.
 *
 * Mobile and desktop each used to rank these themselves and disagreed: mobile checked
 * exceptions first, desktop checked scheduling first. Because a job keeps its
 * appointment date forever, desktop reported SCHEDULED over jobs that were closed,
 * failed, on hold, or waiting on paperwork — while mobile reported the exception. Same
 * job, two different claims.
 *
 * Surfaces may still differ in how much they show. They must not differ on what is
 * true, so presentation is the only thing left to the caller.
 */

export type JobLifecycleState =
  | "linked_active"
  | "archived"
  | "cancelled"
  | "closed"
  | "failed"
  | "pending_office_review"
  | "retest_needed"
  | "waiting"
  | "invoice_required"
  | "paperwork_required"
  | "on_the_way"
  | "in_process"
  | "scheduled"
  | "needs_schedule"
  | "in_progress";

export type JobLifecycleStateInput = {
  status?: unknown;
  opsStatus?: unknown;
  deletedAt?: unknown;
  hasScheduledAppointment?: boolean;
  /** Mobile-only: this job has been superseded by a linked follow-up or retest. */
  isLinkedToActiveJob?: boolean;
};

const WAITING_OPS_STATUSES = new Set(["pending_info", "waiting", "on_hold"]);

/**
 * Ordered most- to least-authoritative. Terminal states outrank everything, then
 * exceptions that need someone to act, then where the job sits on the calendar.
 *
 * Exceptions deliberately outrank `on_the_way` / `in_process`: mobile has always
 * surfaced the exception over the field state, and a job that is on hold should not
 * announce itself as in progress just because a status field was left behind.
 */
export function resolveJobLifecycleState(input: JobLifecycleStateInput): JobLifecycleState {
  const status = String(input.status ?? "").trim().toLowerCase();
  const opsStatus = String(input.opsStatus ?? "").trim().toLowerCase();

  if (input.isLinkedToActiveJob) return "linked_active";
  if (opsStatus === "archived" || input.deletedAt) return "archived";
  if (status === "cancelled") return "cancelled";
  if (opsStatus === "closed") return "closed";

  if (opsStatus === "failed" || status === "failed") return "failed";
  if (opsStatus === "pending_office_review") return "pending_office_review";
  if (opsStatus === "retest_needed") return "retest_needed";
  if (WAITING_OPS_STATUSES.has(opsStatus)) return "waiting";
  if (opsStatus === "invoice_required") return "invoice_required";
  if (opsStatus === "paperwork_required") return "paperwork_required";

  if (status === "on_the_way") return "on_the_way";
  if (status === "in_process") return "in_process";

  if (opsStatus === "scheduled" || input.hasScheduledAppointment) return "scheduled";
  if (opsStatus === "need_to_schedule" || !status || status === "open") return "needs_schedule";

  return "in_progress";
}

const EXCEPTION_STATES = new Set<JobLifecycleState>([
  "linked_active",
  "archived",
  "cancelled",
  "closed",
  "failed",
  "pending_office_review",
  "retest_needed",
  "waiting",
  "invoice_required",
  "paperwork_required",
]);

/** States that need someone to look at the job, as opposed to where it sits on the calendar. */
export function isJobLifecycleExceptionState(state: JobLifecycleState): boolean {
  return EXCEPTION_STATES.has(state);
}

export function isTerminalJobLifecycleState(state: JobLifecycleState): boolean {
  return state === "archived" || state === "cancelled" || state === "closed";
}
