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
import {
  getActiveWaitingState,
  type WaitingStateType,
} from "@/lib/utils/ops-status";
import { isEccPermitNeededReason } from "@/lib/ecc/permit-needed";
import { formatEccOpsStatusLabel, isEccJobType } from "@/lib/ecc/ecc-workflow-display";
import { formatPersonNamePart } from "@/lib/utils/identity-display";

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
  next_action_note?: string | null;
  ops_board_failure_note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  account_owner_user_id?: string | null;
  field_complete?: boolean | null;
  job_type?: string | null;
  service_follow_up_progress?: string | null;
  service_follow_up_progress_label?: string | null;
  service_follow_up_continued?: boolean | null;
};

type AssignmentDisplayInput = WithoutTechAssignmentInput & {
  is_primary?: boolean;
};

type AssignmentSummaryInput = {
  display_name?: string | null;
};

const WAITING_QUEUE_LABELS_BY_REASON: Record<WaitingStateType, string> = {
  waiting_on_part: "Waiting on Part",
  waiting_on_customer_approval: "Approval Needed",
  estimate_needed: "Estimate Needed",
  waiting_on_access: "Waiting on Access",
  waiting_on_information: "Unable to Complete / Waiting on Information",
  other: "Waiting",
};

const EXCEPTION_QUEUE_LABELS_BY_STATUS: Record<string, string> = {
  failed: "Failed Test",
  retest_needed: "Retest Needed",
  pending_office_review: "Office Review Needed",
  problem: "Operational Issue",
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
      if (job?.service_follow_up_continued) return false;
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

export function titleCaseFromSnake(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export function formatOpsStatusLabel(opsStatus: unknown): string {
  const normalized = normalize(opsStatus);
  if (!normalized) return "Unknown";
  return titleCaseFromSnake(normalized);
}

export function jobAddressLine(job: { job_address?: string | null; city?: string | null }): string {
  const address = String(job?.job_address ?? "").trim();
  const city = String(job?.city ?? "").trim();
  return [address, city].filter(Boolean).join(", ") || "No address";
}

export function getWaitingQueueDisplay(job: Pick<FocusedQueueJob, "ops_status" | "pending_info_reason" | "on_hold_reason">): {
  label: string;
  reason: string;
} {
  const pendingReason = String(job?.pending_info_reason ?? "").trim();
  const holdReason = String(job?.on_hold_reason ?? "").trim();
  const rawReason = pendingReason || holdReason;
  const status = normalize(job?.ops_status);
  const serviceFollowUpReason = status === "pending_info"
    ? parseServiceFieldFollowUpReason(pendingReason)
    : null;

  if (serviceFollowUpReason) {
    return {
      label: serviceFollowUpReason.label,
      reason: serviceFollowUpReason.reason || serviceFollowUpReason.display,
    };
  }

  const waitingState = getActiveWaitingState({
    ops_status: job?.ops_status ?? null,
    pending_info_reason: job?.pending_info_reason ?? null,
    on_hold_reason: job?.on_hold_reason ?? null,
  });

  if (waitingState?.parsed) {
    return {
      label: WAITING_QUEUE_LABELS_BY_REASON[waitingState.blockerType],
      reason: waitingState.blockerReason,
    };
  }

  if (rawReason) {
    return {
      label: status === "on_hold" ? "Waiting" : "Waiting on Information",
      reason: rawReason,
    };
  }

  return {
    label: status === "on_hold" ? "Waiting" : "Waiting on Information",
    reason: "Dependency pending",
  };
}

export function getWaitingQueueRecommendedNextStep(
  job: Pick<FocusedQueueJob, "ops_status" | "pending_info_reason" | "on_hold_reason">,
): string {
  const waitingState = getActiveWaitingState({
    ops_status: job?.ops_status ?? null,
    pending_info_reason: job?.pending_info_reason ?? null,
    on_hold_reason: job?.on_hold_reason ?? null,
  });

  if (!waitingState?.parsed) {
    return "Review blocker details and set next office action.";
  }

  if (waitingState.blockerType === "waiting_on_part") {
    return "Confirm part sourcing status and plan return scheduling.";
  }
  if (waitingState.blockerType === "waiting_on_customer_approval") {
    return "Contact customer/decision-maker and capture approval outcome.";
  }
  if (waitingState.blockerType === "waiting_on_information") {
    return "Review visit note and decide contact, reschedule, or office review next step.";
  }
  if (waitingState.blockerType === "waiting_on_access") {
    return "Resolve access blocker and reschedule when site access is confirmed.";
  }
  if (waitingState.blockerType === "estimate_needed") {
    return "Prepare/send estimate and track customer decision.";
  }

  return "Review blocker details and set next office action.";
}

export function getExceptionQueueDisplayLabel(job: Pick<FocusedQueueJob, "ops_status" | "job_type">): string {
  const status = normalize(job?.ops_status);
  const eccLabel = isEccJobType(job?.job_type) ? formatEccOpsStatusLabel(status, "ops") : null;
  if (eccLabel) return eccLabel;
  return EXCEPTION_QUEUE_LABELS_BY_STATUS[status] ?? formatOpsStatusLabel(status);
}

export function formatFailedEccQueueReasonFromRun(run: unknown): string {
  const testType = normalize((run as { test_type?: unknown } | null)?.test_type);

  if (testType === "duct_leakage") return "Duct Leakage Failed";
  if (testType === "refrigerant_charge") return "Refrigerant Charge Failed";
  if (testType === "airflow") return "Airflow Failed";

  return "";
}

function cleanReason(value: unknown): string {
  return String(value ?? "").trim();
}

function sentenceCaseReason(value: string): string {
  const cleaned = cleanReason(value);
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function normalizeDisplayText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseServiceFieldFollowUpReason(value: unknown): { label: string; reason: string; display: string } | null {
  const text = cleanReason(value);
  if (!text) return null;

  for (const label of ["Materials Needed", "Approval Needed", "Other"]) {
    const prefix = `${label}:`;
    if (!text.toLowerCase().startsWith(prefix.toLowerCase())) continue;

    const reason = text.slice(prefix.length).trim();
    return {
      label,
      reason,
      display: reason ? `${label}: ${reason}` : label,
    };
  }

  return null;
}

function isDuplicateStatusReason(label: string, reason: string): boolean {
  const normalizedLabel = normalizeDisplayText(label);
  const normalizedReason = normalizeDisplayText(reason);
  if (!normalizedLabel || !normalizedReason) return false;
  if (normalizedLabel === normalizedReason) return true;

  if (normalizedLabel === "approval needed") {
    return normalizedReason === "waiting on customer approval" || normalizedReason === "waiting on approval";
  }

  if (normalizedLabel === "waiting on information") {
    return normalizedReason === "unable to complete waiting on information"
      || normalizedReason === "waiting on information"
      || normalizedReason === "waiting on info";
  }

  return false;
}

function isGenericAssignmentFallbackLabel(value: unknown): boolean {
  const normalized = normalizeDisplayText(value);
  return normalized === "service account"
    || normalized === "business account"
    || normalized === "account"
    || normalized === "account owner"
    || normalized === "owner account"
    || normalized === "unknown user"
    || normalized === "user";
}

export function getOpsQueueCardStatusReason(
  job: Pick<FocusedQueueJob, "status" | "ops_status" | "job_type" | "pending_info_reason" | "on_hold_reason" | "next_action_note" | "ops_board_failure_note" | "service_follow_up_progress_label">,
): string {
  const status = normalize(job?.ops_status);
  const lifecycle = normalize(job?.status);
  const progressLabel = cleanReason(job?.service_follow_up_progress_label);

  if (status === "pending_info" || status === "waiting") {
    if (isEccPermitNeededReason(job?.pending_info_reason)) {
      return "Permit Needed";
    }

    const serviceFollowUpReason = parseServiceFieldFollowUpReason(job?.pending_info_reason);
    if (serviceFollowUpReason) {
      if (progressLabel === "Part Arrived") {
        return `Part Arrived - Ready to Schedule Return: ${serviceFollowUpReason.display}`;
      }
      if (progressLabel === "Approval Received") {
        return `Approval Received - Ready to Schedule Return: ${serviceFollowUpReason.display}`;
      }
      return progressLabel
        ? `${serviceFollowUpReason.display} • Progress: ${progressLabel}`
        : serviceFollowUpReason.display;
    }

    const waitingDisplay = getWaitingQueueDisplay(job);
    const label = waitingDisplay.label === "Unable to Complete / Waiting on Information"
      ? "Waiting on Information"
      : waitingDisplay.label;
    const reason = cleanReason(waitingDisplay.reason);
    if (!reason || reason === "Dependency pending") return label || "Need Info";
    if (isDuplicateStatusReason(label, reason)) return label || "Need Info";
    return `${label || "Need Info"}: ${reason}`;
  }

  if (status === "on_hold") {
    const waitingDisplay = getWaitingQueueDisplay(job);
    const explicitReason = cleanReason(job?.on_hold_reason) || cleanReason(job?.pending_info_reason);
    const reason = explicitReason || cleanReason(waitingDisplay.reason);
    return reason && (explicitReason || reason !== "Dependency pending") ? `On Hold: ${reason}` : "On Hold";
  }

  if (status === "failed") {
    if (isEccJobType(job?.job_type)) {
      const failedNote = cleanReason(job?.ops_board_failure_note);
      const label = formatEccOpsStatusLabel(status, "ops") ?? "Failed / Correction Required";
      return failedNote ? `${label}: ${failedNote}` : label;
    }
    const reason = cleanReason(job?.pending_info_reason) || cleanReason(job?.on_hold_reason);
    return reason ? `Failed: ${sentenceCaseReason(reason.replace(/^failed\s*[-:]\s*/i, ""))}` : "Failed";
  }

  if (status === "retest_needed") {
    return isEccJobType(job?.job_type) ? formatEccOpsStatusLabel(status, "ops") ?? "Retest Ready" : "Retest Needed";
  }
  if (status === "pending_office_review") {
    return isEccJobType(job?.job_type)
      ? formatEccOpsStatusLabel(status, "ops") ?? "Corrections Submitted / Under Review"
      : "Office Review Needed";
  }
  if (status === "problem") return "Operational Issue";
  if (status === "paperwork_required") return "Closeout: Paperwork Required";
  if (status === "invoice_required") return "Closeout: Invoice Required";
  if (status === "closed") return "Closeout Complete";
  if (status === "need_to_schedule") return "Awaiting Scheduling";
  if (status === "scheduled") return "Scheduled Field Work";
  if (lifecycle === "on_the_way") return "On the Way";
  if (lifecycle === "in_progress") return "In Progress";

  const reason = cleanReason(job?.pending_info_reason) || cleanReason(job?.on_hold_reason);
  if (reason) return reason;
  return status ? formatOpsStatusLabel(status) : "Operational Update";
}

export function formatAssignmentSummaryForJob(
  jobId: string,
  assignmentDisplayMap: Record<string, AssignmentSummaryInput[] | undefined>,
): string {
  const assignments = (assignmentDisplayMap[jobId] ?? []).filter(
    (assignment) => !isGenericAssignmentFallbackLabel(assignment?.display_name),
  );
  if (!assignments.length) return "Unassigned";

  const [primaryAssignee, ...overflow] = assignments;
  const primaryAssigneeName = formatPersonNamePart(primaryAssignee?.display_name);
  return overflow.length > 0
    ? `${primaryAssigneeName} +${overflow.length}`
    : primaryAssigneeName;
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
