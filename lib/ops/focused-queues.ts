import {
  hasAnyActiveTechAssignment,
  isTodayWithoutTechCandidateJob,
  type WithoutTechAssignmentInput,
} from "@/lib/ops/without-tech-predicate";
export {
  EXCEPTION_QUEUE_STATUSES,
  WAITING_QUEUE_STATUSES,
  isExceptionQueueStatus,
  isWaitingQueueStatus,
} from "@/lib/ops/queue-status-contracts";
import {
  isExceptionQueueStatus,
  isWaitingQueueStatus,
} from "@/lib/ops/queue-status-contracts";

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
  field_complete?: boolean | null;
};

type AssignmentDisplayInput = WithoutTechAssignmentInput & {
  is_primary?: boolean;
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
  today: string;
}): FocusedQueueJob[] {
  const jobs = Array.isArray(params.jobs) ? params.jobs : [];
  const assignmentDisplayMap = params.assignmentDisplayMap ?? {};
  const scopedAccountOwner = String(params.accountOwnerUserId ?? "").trim();
  const today = String(params.today ?? "").trim();

  if (!today) return [];

  return jobs.filter((job) => {
    const jobId = String(job?.id ?? "").trim();
    if (!jobId) return false;

    if (scopedAccountOwner) {
      const jobAccountOwner = String(job?.account_owner_user_id ?? "").trim();
      if (jobAccountOwner !== scopedAccountOwner) return false;
    }

    if (!isTodayWithoutTechCandidateJob(job, today)) return false;

    const assignments = Array.isArray(assignmentDisplayMap[jobId])
      ? assignmentDisplayMap[jobId]
      : [];
    return !hasAnyActiveTechAssignment(assignments);
  });
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
