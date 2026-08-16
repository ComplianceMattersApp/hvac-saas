import type { FieldPaymentReconciliationQueueItem } from "@/lib/business/field-payment-reconciliation-read-model";
import type { ActiveJobAssignmentDisplay } from "@/lib/staffing/human-layer";
import { formatTimestampInAccountTimeZone } from "@/lib/utils/account-time-zone";
import {
  getCloseoutNeeds,
  getCloseoutQueueNextStepLabel,
  type CloseoutProjectionInput,
} from "@/lib/utils/closeout";
import { formatCityNamePart, formatPersonNamePart } from "@/lib/utils/identity-display";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import { displayWindowLA, formatBusinessDateUS } from "@/lib/utils/schedule-la";
import {
  formatAssignmentSummaryForJob,
  getOpsQueueCardStatusReason,
  type FocusedQueueJob,
} from "@/lib/ops/focused-queues";
import { buildFocusedQueueRowPresentation } from "@/lib/ops/focused-queue-row-presentation";
import { resolveRecentAttemptDisplay } from "@/lib/ops/recent-attempt-display";
import {
  getOpsBoardVisibleReason,
  type OpsBoardVisibleReason,
} from "@/lib/ops/ops-board-reasons";
import type { OpsWorkspaceEvidenceIndex } from "@/lib/ops/ops-workspace-evidence";
import { opsWorkspaceEvidenceEpochMs } from "@/lib/ops/ops-workspace-evidence";
import type { ServiceFollowUpQueueStateByJob } from "@/lib/ops/service-follow-up-queue-state";

export type OpsQueueCardTone = "rose" | "amber" | "slate" | "green";

export type OpsQueueStateChip = {
  label: string;
  tone: OpsQueueCardTone;
};

export type OpsWorkspaceRowJob = FocusedQueueJob & {
  action_required_by?: string | null;
  certs_complete?: boolean | null;
  contractors?: { name?: string | null } | null;
  customer_phone?: string | null;
  field_complete_at?: string | null;
  follow_up_date?: string | null;
  jurisdiction?: string | null;
  permit_date?: string | null;
};

export type NeedsSchedulingRowView = {
  kind: "need_to_schedule";
  jobId: string;
  href: string;
  title: string;
  subtitle: string;
  jobTypeLabel: string;
  customerName: string;
  address: string;
  reasonLabel: string;
  reasonDetail: string | null;
  ageLabel: string;
  ageDays: number | null;
  stateChips: OpsQueueStateChip[];
  tone: OpsQueueCardTone;
  lastActionText: string;
  recentAttemptText: string;
  contractorName: string;
  phone: string;
  scheduleDateText: string;
  scheduleWindowText: string;
  scheduledDateRaw: string;
  windowStartInput: string;
  windowEndInput: string;
  permitNumber: string;
  jurisdiction: string;
  permitDate: string;
  returnToHref: string;
};

export type CloseoutRowView = {
  kind: "closeout";
  jobId: string;
  cardDomId: string;
  href: string;
  title: string;
  subtitle: string;
  jobTypeLabel: string;
  customerName: string;
  address: string;
  reasonLabel: string;
  reasonDetail: string | null;
  ageLabel: string;
  ageDays: number | null;
  stateChips: OpsQueueStateChip[];
  tone: OpsQueueCardTone;
  lastActionText: string;
  recentAttemptText: string;
  needsLabel: string;
  contractorName: string;
  scheduledText: string;
  assignmentSummary: string;
  nextStepText: string;
};

export type FollowUpRowView = {
  kind: "follow_ups";
  jobId: string;
  cardDomId: string;
  href: string;
  title: string;
  subtitle: string;
  jobTypeLabel: string;
  customerName: string;
  address: string;
  dueText: string;
  urgencyLabel: string;
  urgencyTone: OpsQueueCardTone;
  ageLabel: string;
  ageDays: number | null;
  lastActionText: string;
  recentAttemptText: string;
  owner: string;
  statusLabel: string;
  note: string;
};

export type GenericRowView = {
  kind: "generic";
  jobId: string;
  href: string;
  title: string;
  subtitle: string;
  jobTypeLabel: string;
  customerName: string;
  address: string;
  reasonLabel: string;
  reasonDetail: string | null;
  ageLabel: string;
  ageDays: number | null;
  stateChips: OpsQueueStateChip[];
  tone: OpsQueueCardTone;
  lastActionText: string;
  recentAttemptText: string;
  assignmentSummary: string;
  contractorName: string;
  actionLabel: string;
};

export type FieldPaymentReviewRowView = {
  kind: "field_payment_review";
  reportId: string;
  cardDomId: string;
  jobId: string;
  internalInvoiceId: string;
  jobHref: string;
  invoiceWorkspaceHref: string;
  title: string;
  subtitle: string;
  amountText: string;
  methodText: string;
  reportedText: string;
  reportedDetail: string;
  invoiceReference: string;
  isSelfReported: boolean;
  returnToHref: string;
};

export type OpsQueueRowView =
  | NeedsSchedulingRowView
  | CloseoutRowView
  | FollowUpRowView
  | GenericRowView
  | FieldPaymentReviewRowView;

type OpsWorkspaceJobRowView = Exclude<OpsQueueRowView, FieldPaymentReviewRowView>;

export type OpsWorkspaceRowViewContext = {
  accountTimeZone: string;
  activeWorkspaceBaseHref: string;
  activeWorkspaceHref: string;
  actorUserId: string;
  assignmentDisplayMap: Record<string, ActiveJobAssignmentDisplay[] | undefined>;
  closeoutProjectionByJob: ReadonlyMap<string, CloseoutProjectionInput>;
  defaultContractorName: string;
  followUpTodayDate: string;
  latestCustomerAttemptByJob: ReadonlyMap<string, string>;
  opsStatusEnteredAtByJob: ReadonlyMap<string, Record<string, string>>;
  serviceFollowUpByJob: ServiceFollowUpQueueStateByJob;
  workspaceEvidence: OpsWorkspaceEvidenceIndex;
  now?: Date;
};

function workspaceTitle(job: OpsWorkspaceRowJob) {
  return normalizeRetestLinkedJobTitle(job.title) || `Job ${String(job.id ?? "").slice(0, 8)}`;
}

function workspaceCustomerName(job: OpsWorkspaceRowJob) {
  return (
    [formatPersonNamePart(job.customer_first_name), formatPersonNamePart(job.customer_last_name)]
      .filter(Boolean)
      .join(" ") || "Customer pending"
  );
}

function workspaceLocation(job: OpsWorkspaceRowJob) {
  return (
    [String(job.job_address ?? "").trim(), formatCityNamePart(job.city)]
      .filter(Boolean)
      .join(", ") || "Location pending"
  );
}

function workspaceCustomerLocation(job: OpsWorkspaceRowJob) {
  const customer = workspaceCustomerName(job);
  const location = workspaceLocation(job);
  if (customer !== "Customer pending" && location !== "Location pending") {
    return `${customer} · ${location}`;
  }
  if (customer !== "Customer pending") return customer;
  if (location !== "Location pending") return location;
  return "Customer / location pending";
}

function workspaceJobTypeLabel(job: OpsWorkspaceRowJob) {
  return String(job.job_type ?? "Job").trim().replace(/[_-]+/g, " ") || "Job";
}

function workspaceContractorName(job: OpsWorkspaceRowJob) {
  return String(job.contractors?.name ?? "").trim();
}

function timeToTimeInput(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  return /^\d{2}:\d{2}/.test(raw) ? raw.slice(0, 5) : "";
}

function deriveOpsQueueStateChips(
  reasonLabel: string,
  assignmentSummary?: string,
): OpsQueueStateChip[] {
  const chips: OpsQueueStateChip[] = [];
  const normalized = reasonLabel.trim().toLowerCase();

  if (normalized.startsWith("failed ecc")) {
    chips.push({ label: "Failed ECC", tone: "rose" });
  } else if (normalized === "needs retest") {
    chips.push({ label: "Needs Retest", tone: "amber" });
  } else if (normalized === "on hold") {
    chips.push({ label: "On Hold", tone: "slate" });
  } else if (normalized === "blocked" || normalized === "missing information") {
    chips.push({ label: reasonLabel, tone: "amber" });
  }

  if (assignmentSummary?.trim().toLowerCase() === "unassigned") {
    chips.push({ label: "Unassigned", tone: "amber" });
  }
  return chips;
}

function deriveOpsQueueCardTone(stateChips: OpsQueueStateChip[]): OpsQueueCardTone {
  if (stateChips.some((chip) => chip.tone === "rose")) return "rose";
  if (stateChips.some((chip) => chip.tone === "amber")) return "amber";
  return "slate";
}

function formatFollowUpOwner(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "customer") return "Customer";
  if (normalized === "contractor") return "Contractor";
  if (normalized === "rater") return "Rater";
  return "Office";
}

function businessDateToUtcMs(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

export function resolveFollowUpUrgency(dueDate: string, todayDate: string) {
  const dueMs = businessDateToUtcMs(dueDate);
  const todayMs = businessDateToUtcMs(todayDate);
  if (dueMs === null || todayMs === null) {
    return { variant: "follow-up-unscheduled" as const, label: "Needs date" };
  }

  const daysUntilDue = Math.round((dueMs - todayMs) / 86_400_000);
  if (daysUntilDue < 0) {
    const overdueDays = Math.abs(daysUntilDue);
    return {
      variant: "follow-up-overdue" as const,
      label: `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`,
    };
  }
  if (daysUntilDue === 0) return { variant: "follow-up-due" as const, label: "Due today" };
  if (daysUntilDue <= 2) {
    return {
      variant: "follow-up-soon" as const,
      label: `Due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`,
    };
  }
  return { variant: "follow-up-future" as const, label: `Due in ${daysUntilDue} days` };
}

function formatWorkspaceUsdFromCents(cents: number | null | undefined) {
  const amount = Number(cents ?? 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatWorkspaceFieldPaymentMethod(method: string | null | undefined) {
  const normalized = String(method ?? "").trim().toLowerCase();
  if (normalized === "cash") return "Cash";
  if (normalized === "check") return "Check";
  return "Other";
}

export function createOpsWorkspaceRowViewBuilders(context: OpsWorkspaceRowViewContext) {
  const now = context.now ?? new Date();
  const nowMs = now.getTime();

  const formatWorkspaceTimestamp = (value: string | null | undefined) =>
    formatTimestampInAccountTimeZone(value, context.accountTimeZone, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });

  const failedStatusSinceByJob = (jobId: string): string | null => {
    const run = context.workspaceEvidence.latestFailedRunByJob.get(jobId);
    const createdAt = String(run?.created_at ?? "").trim();
    return createdAt || null;
  };

  const formatJobEventLabel = (event: Record<string, unknown>) => {
    const message = String(event.message ?? "").replace(/\s+/g, " ").trim();
    if (message) return message.length > 42 ? `${message.slice(0, 39)}...` : message;
    const eventType = String(event.event_type ?? "").trim();
    return eventType
      ? eventType.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase())
      : "Updated";
  };

  const queueEnteredAt = (job: OpsWorkspaceRowJob, queueKey: string) => {
    const jobId = String(job.id ?? "").trim();
    const opsStatus = String(job.ops_status ?? "").trim().toLowerCase();
    const createdAt = String(job.created_at ?? "").trim() || null;
    if (queueKey === "follow_ups") {
      return context.workspaceEvidence.followUpEnteredAtByJob.get(jobId) ?? createdAt;
    }
    if (queueKey === "closeout") {
      return String(job.field_complete_at ?? "").trim()
        || context.opsStatusEnteredAtByJob.get(jobId)?.[opsStatus]
        || createdAt;
    }
    if (queueKey === "exceptions") {
      return context.opsStatusEnteredAtByJob.get(jobId)?.[opsStatus]
        || failedStatusSinceByJob(jobId)
        || createdAt;
    }
    return context.opsStatusEnteredAtByJob.get(jobId)?.[opsStatus] || createdAt;
  };

  const queueAgeDays = (job: OpsWorkspaceRowJob, queueKey: string): number | null => {
    const startMs = opsWorkspaceEvidenceEpochMs(queueEnteredAt(job, queueKey));
    return startMs ? Math.floor(Math.max(0, nowMs - startMs) / 86_400_000) : null;
  };

  const queueAgeChipLabel = (job: OpsWorkspaceRowJob, queueKey: string) => {
    const days = queueAgeDays(job, queueKey);
    return days === null ? "In queue" : `In queue ${days}d`;
  };

  const lastActionTag = (job: OpsWorkspaceRowJob) => {
    const latestEvent = context.workspaceEvidence.latestJobEventByJob.get(job.id);
    if (latestEvent?.created_at) {
      return `${formatJobEventLabel(latestEvent)} · ${formatWorkspaceTimestamp(String(latestEvent.created_at))}`;
    }
    const createdAt = String(job.created_at ?? "").trim();
    return createdAt ? `Created · ${formatWorkspaceTimestamp(createdAt)}` : "No activity";
  };

  const failedReason = (job: OpsWorkspaceRowJob) => {
    const opsStatus = String(job.ops_status ?? "").trim().toLowerCase();
    if (opsStatus === "retest_needed") return "Retest Needed";
    if (opsStatus === "pending_office_review") return "Correction Required";
    if (opsStatus !== "failed") return "";
    const failedNote = String(job.ops_board_failure_note ?? "").trim();
    if (failedNote) return `Failed Test - ${failedNote}`;
    return context.workspaceEvidence.primaryFailureReasonByJob.get(job.id) || "Failed";
  };

  const reasonInput = (job: OpsWorkspaceRowJob) => ({
    ...job,
    next_action_note: job.next_action_note ?? null,
    ops_board_failure_note: job.ops_board_failure_note ?? null,
    ops_board_failure_detail:
      context.workspaceEvidence.primaryFailureReasonByJob.get(job.id) ?? null,
  });

  const statusReason = (job: OpsWorkspaceRowJob, queueKey: string) => {
    const lifecycle = String(job.status ?? "").toLowerCase();
    const specificFailureReason = failedReason(job);
    if (queueKey === "need_to_schedule") return "Awaiting scheduling";
    if (queueKey === "field_work") {
      if (lifecycle === "on_the_way") return "On the way";
      if (lifecycle === "in_progress") return "In progress";
      return "Scheduled field work";
    }
    if (queueKey === "without_tech") return "Scheduled without an active assignee";
    return specificFailureReason || getOpsQueueCardStatusReason(job);
  };

  const visibleReason = (job: OpsWorkspaceRowJob, queueKey: string): OpsBoardVisibleReason =>
    getOpsBoardVisibleReason(
      reasonInput(job),
      () => statusReason(job, queueKey),
      { queueKey },
    );

  function buildNeedsSchedulingRowView(
    job: OpsWorkspaceRowJob,
    reason: OpsBoardVisibleReason,
    formattedRecentAttempt: string,
  ): NeedsSchedulingRowView {
    const jobId = job.id;
    const stateChips = deriveOpsQueueStateChips(reason.label);
    return {
      kind: "need_to_schedule",
      jobId,
      href: `/jobs/${jobId}?tab=ops`,
      title: workspaceTitle(job),
      subtitle: workspaceCustomerLocation(job),
      jobTypeLabel: workspaceJobTypeLabel(job),
      customerName: workspaceCustomerName(job),
      address: workspaceLocation(job),
      reasonLabel: reason.label,
      reasonDetail: reason.detail,
      ageLabel: queueAgeChipLabel(job, "need_to_schedule"),
      ageDays: queueAgeDays(job, "need_to_schedule"),
      stateChips,
      tone: deriveOpsQueueCardTone(stateChips),
      lastActionText: lastActionTag(job),
      recentAttemptText: formattedRecentAttempt,
      contractorName: workspaceContractorName(job) || context.defaultContractorName,
      phone: String(job.customer_phone ?? "").trim(),
      scheduleDateText: job.scheduled_date ? formatBusinessDateUS(job.scheduled_date) : "Not scheduled",
      scheduleWindowText:
        displayWindowLA(job.window_start, job.window_end)
        || (job.scheduled_date ? "Window TBD" : ""),
      scheduledDateRaw: String(job.scheduled_date ?? ""),
      windowStartInput: timeToTimeInput(job.window_start),
      windowEndInput: timeToTimeInput(job.window_end),
      permitNumber: String(job.permit_number ?? ""),
      jurisdiction: String(job.jurisdiction ?? ""),
      permitDate: String(job.permit_date ?? ""),
      returnToHref: context.activeWorkspaceHref,
    };
  }

  function buildCloseoutRowView(
    job: OpsWorkspaceRowJob,
    reason: OpsBoardVisibleReason,
    formattedRecentAttempt: string,
  ): CloseoutRowView {
    const jobId = job.id;
    const projection = context.closeoutProjectionByJob.get(jobId) ?? job;
    const needs = getCloseoutNeeds(projection);
    const assignmentSummary = formatAssignmentSummaryForJob(jobId, context.assignmentDisplayMap);
    const stateChips = deriveOpsQueueStateChips(reason.label, assignmentSummary);
    const needsLabel = needs.needsInvoice && needs.needsCerts
      ? "Invoice + paperwork"
      : needs.needsInvoice
        ? "Invoice"
        : needs.needsCerts
          ? "Paperwork"
          : "Review";
    return {
      kind: "closeout",
      jobId,
      cardDomId: `ops-workspace-closeout-job-${jobId}`,
      href: `/jobs/${jobId}?tab=ops`,
      title: workspaceTitle(job),
      subtitle: workspaceCustomerLocation(job),
      jobTypeLabel: workspaceJobTypeLabel(job),
      customerName: workspaceCustomerName(job),
      address: workspaceLocation(job),
      reasonLabel: reason.label,
      reasonDetail: reason.detail,
      ageLabel: queueAgeChipLabel(job, "closeout"),
      ageDays: queueAgeDays(job, "closeout"),
      stateChips,
      tone: deriveOpsQueueCardTone(stateChips),
      lastActionText: lastActionTag(job),
      recentAttemptText: formattedRecentAttempt,
      needsLabel,
      contractorName: workspaceContractorName(job),
      scheduledText: job.scheduled_date ? formatBusinessDateUS(job.scheduled_date) : "",
      assignmentSummary,
      nextStepText: getCloseoutQueueNextStepLabel(projection),
    };
  }

  function buildFollowUpRowView(
    job: OpsWorkspaceRowJob,
    formattedRecentAttempt: string,
  ): FollowUpRowView {
    const dueDate = String(job.follow_up_date ?? "").trim();
    const urgency = resolveFollowUpUrgency(dueDate, context.followUpTodayDate);
    const urgencyTone: OpsQueueCardTone =
      urgency.variant === "follow-up-overdue" || urgency.variant === "follow-up-due"
        ? "rose"
        : urgency.variant === "follow-up-soon" || urgency.variant === "follow-up-unscheduled"
          ? "amber"
          : "slate";
    return {
      kind: "follow_ups",
      jobId: job.id,
      cardDomId: `ops-workspace-follow-up-job-${job.id}`,
      href: `/jobs/${job.id}/v2#followup`,
      title: workspaceTitle(job),
      subtitle: workspaceCustomerLocation(job),
      jobTypeLabel: workspaceJobTypeLabel(job),
      customerName: workspaceCustomerName(job),
      address: workspaceLocation(job),
      dueText: dueDate ? formatBusinessDateUS(dueDate) : "No date set",
      urgencyLabel: urgency.label,
      urgencyTone,
      ageLabel: queueAgeChipLabel(job, "follow_ups"),
      ageDays: queueAgeDays(job, "follow_ups"),
      lastActionText: lastActionTag(job),
      recentAttemptText: formattedRecentAttempt,
      owner: formatFollowUpOwner(job.action_required_by),
      statusLabel: getOpsQueueCardStatusReason(job),
      note: String(job.next_action_note ?? "").trim() || "No reminder note added.",
    };
  }

  function buildGenericRowView(
    job: OpsWorkspaceRowJob,
    reason: OpsBoardVisibleReason,
    queueKey: string,
    formattedRecentAttempt: string,
  ): GenericRowView {
    const assignmentSummary = formatAssignmentSummaryForJob(job.id, context.assignmentDisplayMap);
    if (queueKey === "waiting" || queueKey === "exceptions") {
      const presentation = buildFocusedQueueRowPresentation({
        job,
        queueKey,
        serviceFollowUpByJob: context.serviceFollowUpByJob,
        stateEnteredAtByStatus: context.opsStatusEnteredAtByJob.get(job.id) ?? null,
        failedEvidenceAt: failedStatusSinceByJob(job.id),
        primaryFailureReason:
          context.workspaceEvidence.primaryFailureReasonByJob.get(job.id) ?? null,
        assignmentSummary,
        failureReportSent: queueKey === "exceptions"
          ? context.workspaceEvidence.latestContractorReportSentAtByJob.has(job.id)
          : null,
        now,
      });
      return {
        kind: "generic",
        jobId: job.id,
        href: presentation.href,
        title: presentation.title,
        subtitle: presentation.customerLocation,
        jobTypeLabel: presentation.jobTypeLabel,
        customerName: presentation.customerName,
        address: presentation.address,
        reasonLabel: presentation.visibleReason.label,
        reasonDetail: presentation.visibleReason.detail,
        ageLabel: presentation.ageLabel,
        ageDays: presentation.ageDays,
        stateChips: presentation.stateChips,
        tone: presentation.tone,
        lastActionText: lastActionTag(job),
        recentAttemptText: formattedRecentAttempt,
        assignmentSummary,
        contractorName: workspaceContractorName(job),
        actionLabel: presentation.primaryActionLabel,
      };
    }

    const stateChips = deriveOpsQueueStateChips(reason.label, assignmentSummary);
    return {
      kind: "generic",
      jobId: job.id,
      href: `/jobs/${job.id}?tab=ops`,
      title: workspaceTitle(job),
      subtitle: workspaceCustomerLocation(job),
      jobTypeLabel: workspaceJobTypeLabel(job),
      customerName: workspaceCustomerName(job),
      address: workspaceLocation(job),
      reasonLabel: reason.label,
      reasonDetail: reason.detail,
      ageLabel: queueAgeChipLabel(job, queueKey),
      ageDays: queueAgeDays(job, queueKey),
      stateChips,
      tone: deriveOpsQueueCardTone(stateChips),
      lastActionText: lastActionTag(job),
      recentAttemptText: formattedRecentAttempt,
      assignmentSummary,
      contractorName: workspaceContractorName(job),
      actionLabel: "Open Job",
    };
  }

  const buildJobRowView = (
    job: OpsWorkspaceRowJob,
    queueKey: string,
  ): OpsWorkspaceJobRowView => {
    const reason = visibleReason(job, queueKey);
    const formattedRecentAttempt = resolveRecentAttemptDisplay(
      context.latestCustomerAttemptByJob.get(job.id) ?? null,
    );
    if (queueKey === "need_to_schedule") {
      return buildNeedsSchedulingRowView(job, reason, formattedRecentAttempt);
    }
    if (queueKey === "closeout") {
      return buildCloseoutRowView(job, reason, formattedRecentAttempt);
    }
    if (queueKey === "follow_ups") {
      return buildFollowUpRowView(job, formattedRecentAttempt);
    }
    return buildGenericRowView(job, reason, queueKey, formattedRecentAttempt);
  };

  const buildFieldPaymentReviewRowView = (
    item: FieldPaymentReconciliationQueueItem,
  ): FieldPaymentReviewRowView => ({
    kind: "field_payment_review",
    reportId: item.reportId,
    cardDomId: `ops-workspace-field-payment-${item.reportId}`,
    jobId: item.jobId,
    internalInvoiceId: item.internalInvoiceId,
    jobHref: item.links.jobHref,
    invoiceWorkspaceHref: item.links.invoiceWorkspaceHref,
    title: item.jobTitle || item.jobReference,
    subtitle: item.customerDisplayName || "Customer",
    amountText: formatWorkspaceUsdFromCents(item.amountCents),
    methodText: formatWorkspaceFieldPaymentMethod(item.paymentMethod),
    reportedText: formatWorkspaceTimestamp(item.reportedAt),
    reportedDetail: item.reportedByDisplayName,
    invoiceReference: item.invoiceReference,
    isSelfReported: item.reportedByUserId === context.actorUserId,
    returnToHref: `${context.activeWorkspaceBaseHref}#ops-workspace-field-payment-${item.reportId}`,
  });

  return {
    buildFieldPaymentReviewRowView,
    buildJobRowView,
    contractorName: workspaceContractorName,
    queueEnteredAt,
    reasonInput,
    visibleReason,
  };
}
