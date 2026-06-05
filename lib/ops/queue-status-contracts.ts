export const OFFICE_REVIEW_QUEUE_STATUSES = [
  "pending_office_review",
] as const;

export const WAITING_QUEUE_STATUSES = [
  "pending_info",
  "on_hold",
  "waiting",
] as const;

export const EXCEPTION_QUEUE_STATUSES = [
  "failed",
  "retest_needed",
  "pending_office_review",
  "problem",
] as const;

export const CLOSEOUT_BLOCKING_QUEUE_STATUSES = [
  "pending_info",
  "on_hold",
] as const;

export const ACTIVE_FIELD_WORK_STATUSES = [
  "on_the_way",
  "in_process",
] as const;

const WAITING_QUEUE_STATUS_SET = new Set<string>(WAITING_QUEUE_STATUSES);
const EXCEPTION_QUEUE_STATUS_SET = new Set<string>(EXCEPTION_QUEUE_STATUSES);
const OFFICE_REVIEW_QUEUE_STATUS_SET = new Set<string>(OFFICE_REVIEW_QUEUE_STATUSES);
const CLOSEOUT_BLOCKING_QUEUE_STATUS_SET = new Set<string>(CLOSEOUT_BLOCKING_QUEUE_STATUSES);
const ACTIVE_FIELD_WORK_STATUS_SET = new Set<string>(ACTIVE_FIELD_WORK_STATUSES);

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isWaitingQueueStatus(value: unknown): boolean {
  return WAITING_QUEUE_STATUS_SET.has(normalize(value));
}

export function isExceptionQueueStatus(value: unknown): boolean {
  return EXCEPTION_QUEUE_STATUS_SET.has(normalize(value));
}

export function isOfficeReviewQueueStatus(value: unknown): boolean {
  return OFFICE_REVIEW_QUEUE_STATUS_SET.has(normalize(value));
}

export function isCloseoutBlockingQueueStatus(value: unknown): boolean {
  return CLOSEOUT_BLOCKING_QUEUE_STATUS_SET.has(normalize(value));
}

export function isActiveFieldWorkStatus(value: unknown): boolean {
  return ACTIVE_FIELD_WORK_STATUS_SET.has(normalize(value));
}

export function isScheduledAssignedMyWorkEligible(input: {
  status?: string | null;
  scheduledDate?: string | null;
  fieldComplete?: boolean | null;
}): boolean {
  if (input.fieldComplete === true) return false;
  if (isActiveFieldWorkStatus(input.status)) return true;
  return Boolean(String(input.scheduledDate ?? "").trim());
}
