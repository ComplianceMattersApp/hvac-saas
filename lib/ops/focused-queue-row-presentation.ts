import {
  getExceptionQueueDisplayLabel,
  getOpsQueueCardStatusReason,
  getWaitingQueueDisplay,
  getWaitingQueueRecommendedNextStep,
} from "@/lib/ops/focused-queues";
import type { OpsWorkspaceJob } from "@/lib/ops/ops-workspace-job-contract";
import {
  resolveServiceFollowUpQueueState,
  type ServiceFollowUpQueueStateByJob,
} from "@/lib/ops/service-follow-up-queue-state";
import {
  getOpsBoardVisibleReason,
  type OpsBoardVisibleReason,
} from "@/lib/ops/ops-board-reasons";
import { formatCityNamePart, formatPersonNamePart } from "@/lib/utils/identity-display";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";

export type FocusedQueuePresentationKey = "waiting" | "exceptions";
export type FocusedQueuePresentationTone = "rose" | "amber" | "slate" | "green";

export type FocusedQueuePresentationChip = {
  label: string;
  tone: FocusedQueuePresentationTone;
};

export type FocusedQueueRowPresentation = {
  queueKey: FocusedQueuePresentationKey;
  jobId: string;
  href: string;
  title: string;
  jobTypeLabel: string;
  customerName: string;
  address: string;
  customerLocation: string;
  queueStatusLabel: string;
  visibleReason: OpsBoardVisibleReason;
  ageLabel: string;
  ageDays: number | null;
  isAged: boolean;
  isReadyToSchedule: boolean;
  progressLabel: string | null;
  nextStepText: string | null;
  primaryActionLabel: string;
  secondaryAction: { label: string; href: string } | null;
  stateChips: FocusedQueuePresentationChip[];
  tone: FocusedQueuePresentationTone;
};

type BuildFocusedQueueRowPresentationInput = {
  job: OpsWorkspaceJob;
  queueKey: FocusedQueuePresentationKey;
  serviceFollowUpByJob?: ServiceFollowUpQueueStateByJob;
  stateEnteredAtByStatus?: Record<string, string | null | undefined> | null;
  failedEvidenceAt?: string | null;
  primaryFailureReason?: string | null;
  assignmentSummary?: string | null;
  failureReportSent?: boolean | null;
  now: Date;
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalize(value: unknown): string {
  return clean(value).toLowerCase();
}

function formatJobType(value: unknown): string {
  return clean(value || "Job").replace(/[_-]+/g, " ") || "Job";
}

function resolveQueueEnteredAt(input: BuildFocusedQueueRowPresentationInput): string | null {
  const opsStatus = normalize(input.job.ops_status);
  const stateEnteredAt = clean(input.stateEnteredAtByStatus?.[opsStatus]);
  if (stateEnteredAt) return stateEnteredAt;

  if (input.queueKey === "exceptions") {
    const failedEvidenceAt = clean(input.failedEvidenceAt);
    if (failedEvidenceAt) return failedEvidenceAt;
  }

  return clean(input.job.created_at) || null;
}

function ageDaysSince(value: string | null, now: Date): number | null {
  const stamp = new Date(clean(value)).getTime();
  if (!Number.isFinite(stamp)) return null;
  return Math.floor(Math.max(0, now.getTime() - stamp) / 86_400_000);
}

function exceptionFallbackLabel(
  job: OpsWorkspaceJob,
  primaryFailureReason: string | null | undefined,
): string {
  const opsStatus = normalize(job.ops_status);
  if (opsStatus === "retest_needed") return "Retest Needed";
  if (opsStatus === "pending_office_review") return "Correction Required";
  if (opsStatus !== "failed") return getOpsQueueCardStatusReason(job);

  const failureNote = clean(job.ops_board_failure_note);
  if (failureNote) return `Failed Test: ${failureNote}`;
  return clean(primaryFailureReason) || getOpsQueueCardStatusReason(job);
}

function buildStateChips(params: {
  job: OpsWorkspaceJob;
  visibleReason: OpsBoardVisibleReason;
  progressLabel: string | null;
  assignmentSummary?: string | null;
  failureReportSent?: boolean | null;
}): FocusedQueuePresentationChip[] {
  const chips: FocusedQueuePresentationChip[] = [];
  const opsStatus = normalize(params.job.ops_status);
  const reasonLabel = normalize(params.visibleReason.label);

  if (opsStatus === "failed") {
    chips.push({
      label: normalize(params.job.job_type) === "ecc" ? "Failed ECC" : "Failed",
      tone: "rose",
    });
  } else if (opsStatus === "retest_needed") {
    chips.push({ label: "Needs Retest", tone: "amber" });
  } else if (opsStatus === "on_hold") {
    chips.push({ label: "On Hold", tone: "slate" });
  } else if (reasonLabel === "blocked" || reasonLabel === "missing information") {
    chips.push({ label: params.visibleReason.label, tone: "amber" });
  }

  if (params.progressLabel) {
    const ready = params.progressLabel === "Part Arrived" || params.progressLabel === "Approval Received";
    chips.push({ label: params.progressLabel, tone: ready ? "green" : "slate" });
  }

  if (normalize(params.assignmentSummary) === "unassigned") {
    chips.push({ label: "Unassigned", tone: "amber" });
  }

  if (opsStatus === "failed" && normalize(params.job.job_type) === "ecc" && params.failureReportSent != null) {
    chips.push(
      params.failureReportSent
        ? { label: "Failure report sent", tone: "green" }
        : { label: "Failure report not sent", tone: "amber" },
    );
  }

  return chips;
}

function deriveTone(chips: FocusedQueuePresentationChip[]): FocusedQueuePresentationTone {
  if (chips.some((chip) => chip.tone === "rose")) return "rose";
  if (chips.some((chip) => chip.tone === "amber")) return "amber";
  if (chips.some((chip) => chip.tone === "green")) return "green";
  return "slate";
}

export function buildFocusedQueueRowPresentation(
  input: BuildFocusedQueueRowPresentationInput,
): FocusedQueueRowPresentation {
  const job = input.job;
  const jobId = clean(job.id);
  const href = `/jobs/${jobId}?tab=ops`;
  const resolvedCustomerName = [
    formatPersonNamePart(job.customer_first_name),
    formatPersonNamePart(job.customer_last_name),
  ].filter(Boolean).join(" ");
  const resolvedAddress = [clean(job.job_address), formatCityNamePart(job.city)]
    .filter(Boolean)
    .join(", ");
  const customerName = resolvedCustomerName || "Customer pending";
  const address = resolvedAddress || "Location pending";
  const customerLocation = resolvedCustomerName && resolvedAddress
    ? `${resolvedCustomerName} · ${resolvedAddress}`
    : resolvedCustomerName || resolvedAddress || "Customer / location pending";
  const enteredAt = resolveQueueEnteredAt(input);
  const ageDays = ageDaysSince(enteredAt, input.now);
  const reasonInput = {
    ...job,
    ops_board_failure_detail: clean(input.primaryFailureReason) || null,
  };
  const fallbackLabel = input.queueKey === "exceptions"
    ? exceptionFallbackLabel(job, input.primaryFailureReason)
    : getOpsQueueCardStatusReason(job);
  const visibleReason = getOpsBoardVisibleReason(
    reasonInput,
    fallbackLabel,
    { queueKey: input.queueKey },
  );

  const emptyFollowUpState = new Map();
  const followUp = input.queueKey === "waiting"
    ? resolveServiceFollowUpQueueState(
        job,
        input.serviceFollowUpByJob ?? emptyFollowUpState,
      )
    : null;
  const waitingDisplay = input.queueKey === "waiting" ? getWaitingQueueDisplay(job) : null;
  const progressLabel = (
    followUp?.progressLabel ?? clean(job.service_follow_up_progress_label)
  ) || null;
  const readyToSchedule = Boolean(followUp?.bridgeActionLabel);
  const queueStatusLabel = input.queueKey === "waiting"
    ? readyToSchedule
      ? `${progressLabel ?? "Ready"} - Ready to Schedule Return`
      : normalize(job.ops_status) === "on_hold"
      ? "On Hold"
      : waitingDisplay?.label ?? "Waiting"
    : getExceptionQueueDisplayLabel(job);
  const nextStepText = input.queueKey === "waiting"
    ? followUp?.bridgeActionLabel ??
      followUp?.nextActionLabel ??
      followUp?.returnPromptLabel ??
      getWaitingQueueRecommendedNextStep(job)
    : null;
  const stateChips = buildStateChips({
    job,
    visibleReason,
    progressLabel,
    assignmentSummary: input.assignmentSummary,
    failureReportSent: input.failureReportSent,
  });

  return {
    queueKey: input.queueKey,
    jobId,
    href,
    title: normalizeRetestLinkedJobTitle(job.title) || `Job ${jobId.slice(0, 8)}`,
    jobTypeLabel: formatJobType(job.job_type),
    customerName,
    address,
    customerLocation,
    queueStatusLabel,
    visibleReason,
    ageLabel: ageDays == null ? "In queue" : `In queue ${ageDays}d`,
    ageDays,
    isAged: ageDays != null && ageDays >= 14,
    isReadyToSchedule: readyToSchedule,
    progressLabel,
    nextStepText,
    primaryActionLabel: input.queueKey === "exceptions" ? "Review Exception" : "Open Job",
    secondaryAction: input.queueKey === "waiting"
      ? {
          label: followUp?.bridgeActionLabel ?? "Create Return Visit",
          href: `${href}#followup`,
        }
      : null,
    stateChips,
    tone: deriveTone(stateChips),
  };
}
