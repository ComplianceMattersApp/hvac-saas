import { buildScheduledWithoutTechSnapshot } from "@/lib/ops/scheduled-without-tech-snapshot";

export const WAITING_QUEUE_STATUSES = [
  "pending_info",
  "on_hold",
  "waiting",
  "pending_office_review",
] as const;

export const EXCEPTION_QUEUE_STATUSES = [
  "failed",
  "retest_needed",
  "pending_office_review",
  "problem",
] as const;

const WAITING_QUEUE_STATUS_SET = new Set<string>(WAITING_QUEUE_STATUSES);
const EXCEPTION_QUEUE_STATUS_SET = new Set<string>(EXCEPTION_QUEUE_STATUSES);

export type FocusedQueueJob = {
  id: string;
  title?: string | null;
  status?: string | null;
  ops_status?: string | null;
  scheduled_date?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  city?: string | null;
  job_address?: string | null;
  customer_first_name?: string | null;
  customer_last_name?: string | null;
  pending_info_reason?: string | null;
  on_hold_reason?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  account_owner_user_id?: string | null;
};

type AssignmentDisplayInput = {
  is_primary?: boolean;
  is_active?: boolean;
  deleted_at?: string | null;
  removed_at?: string | null;
};

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function compareByCreatedAtOldest(left: FocusedQueueJob, right: FocusedQueueJob): number {
  const leftCreated = String(left.created_at ?? "");
  const rightCreated = String(right.created_at ?? "");
  const createdDiff = leftCreated.localeCompare(rightCreated);
  if (createdDiff !== 0) return createdDiff;

  return String(left.id ?? "").localeCompare(String(right.id ?? ""));
}

export function isWaitingQueueStatus(value: unknown): boolean {
  return WAITING_QUEUE_STATUS_SET.has(normalize(value));
}

export function isExceptionQueueStatus(value: unknown): boolean {
  return EXCEPTION_QUEUE_STATUS_SET.has(normalize(value));
}

export function buildWaitingQueueRows(jobs: FocusedQueueJob[]): FocusedQueueJob[] {
  return (Array.isArray(jobs) ? jobs : [])
    .filter((job) => {
      if (!String(job?.id ?? "").trim()) return false;
      return isWaitingQueueStatus(job?.ops_status);
    })
    .sort(compareByCreatedAtOldest);
}

export function buildExceptionQueueRows(jobs: FocusedQueueJob[]): FocusedQueueJob[] {
  return (Array.isArray(jobs) ? jobs : [])
    .filter((job) => {
      if (!String(job?.id ?? "").trim()) return false;
      return isExceptionQueueStatus(job?.ops_status);
    })
    .sort(compareByCreatedAtOldest);
}

export function buildWithoutTechQueueRows(params: {
  jobs: FocusedQueueJob[];
  assignmentDisplayMap: Record<string, AssignmentDisplayInput[]>;
  accountOwnerUserId?: string | null;
}): FocusedQueueJob[] {
  const jobs = Array.isArray(params.jobs) ? params.jobs : [];
  const snapshot = buildScheduledWithoutTechSnapshot({
    jobs,
    assignmentDisplayMap: params.assignmentDisplayMap ?? {},
    accountOwnerUserId: params.accountOwnerUserId ?? null,
    previewLimit: Math.max(1, jobs.length),
  });

  const ids = new Set(snapshot.preview.map((job) => String(job?.id ?? "").trim()).filter(Boolean));
  return jobs.filter((job) => ids.has(String(job?.id ?? "").trim()));
}

export function formatOpsStatusLabel(opsStatus: unknown): string {
  const normalized = normalize(opsStatus);
  if (!normalized) return "Unknown";
  return normalized.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export function customerLocationLabel(job: FocusedQueueJob): string {
  const customerName = [String(job.customer_first_name ?? "").trim(), String(job.customer_last_name ?? "").trim()]
    .filter(Boolean)
    .join(" ");
  const location = [String(job.job_address ?? "").trim(), String(job.city ?? "").trim()]
    .filter(Boolean)
    .join(", ");

  if (customerName && location) return `${customerName} • ${location}`;
  return customerName || location || "Customer / location pending";
}
