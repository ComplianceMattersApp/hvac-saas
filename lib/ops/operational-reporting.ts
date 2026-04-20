import { getCloseoutNeeds, isInCloseoutQueue } from "@/lib/utils/closeout";

export type OperationalReportingJob = {
  id: string;
  job_type: string | null;
  status: string | null;
  ops_status: string | null;
  created_at: string | null;
  scheduled_date: string | null;
  field_complete: boolean | null;
  field_complete_at: string | null;
  service_case_id: string | null;
  service_visit_outcome: string | null;
  invoice_complete: boolean | null;
  certs_complete: boolean | null;
};

export type OperationalReportingMetricKey =
  | "active_operational_jobs"
  | "scheduled_visits"
  | "need_to_schedule"
  | "closeout_queue"
  | "ops_need_to_schedule"
  | "ops_scheduled"
  | "ops_pending_info"
  | "ops_on_hold"
  | "ops_failed"
  | "ops_pending_office_review"
  | "ops_paperwork_required"
  | "ops_invoice_required"
  | "aging_scheduling_overdue"
  | "aging_follow_up_overdue"
  | "aging_failure_review_aged"
  | "aging_closeout_overdue"
  | "throughput_jobs_created_7d"
  | "throughput_jobs_completed_7d"
  | "throughput_schedule_touches_7d"
  | "service_outcome_resolved"
  | "service_outcome_follow_up_required"
  | "service_outcome_no_issue_found"
  | "continuity_open_service_cases"
  | "continuity_resolved_service_cases"
  | "continuity_active_service_jobs_with_case"
  | "continuity_active_service_jobs_missing_case";

export type OperationalReportingMetric = {
  key: OperationalReportingMetricKey;
  label: string;
  value: number;
  note: string;
};

export type OperationalReportingReadModel = {
  workload: OperationalReportingMetric[];
  opsBuckets: OperationalReportingMetric[];
  aging: OperationalReportingMetric[];
  throughput: OperationalReportingMetric[];
  serviceOutcomes: OperationalReportingMetric[];
  continuity: OperationalReportingMetric[];
};

type BuildOperationalReportingReadModelArgs = {
  jobs: OperationalReportingJob[];
  closeoutProjectionByJobId: Map<
    string,
    {
      invoice_complete: boolean;
      field_complete: boolean;
      job_type: string | null;
      ops_status: string | null;
      certs_complete: boolean;
    }
  >;
  attentionBusinessCutoffIso: string;
  failedCutoffIso: string;
  recentCreatedCount: number;
  recentCompletedCount: number;
  recentScheduleTouchCount: number;
  openServiceCaseCount: number;
  resolvedServiceCaseCount: number;
  recentServiceWindowCutoffIso: string;
};

const OPS_BUCKET_ORDER = [
  "need_to_schedule",
  "scheduled",
  "pending_info",
  "on_hold",
  "failed",
  "pending_office_review",
  "paperwork_required",
  "invoice_required",
] as const;

const SERVICE_OUTCOME_ORDER = [
  "resolved",
  "follow_up_required",
  "no_issue_found",
] as const;

function countWhere<T>(items: T[], predicate: (item: T) => boolean) {
  let total = 0;
  for (const item of items) {
    if (predicate(item)) total += 1;
  }
  return total;
}

function formatOpsLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getTime(value: string | null | undefined) {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : Number.NaN;
}

function needsInvoiceFollowUp(
  job: OperationalReportingJob,
  closeoutProjectionByJobId: BuildOperationalReportingReadModelArgs["closeoutProjectionByJobId"],
) {
  return getCloseoutNeeds(closeoutProjectionByJobId.get(job.id) ?? job).needsInvoice;
}

export function buildOperationalReportingReadModel({
  jobs,
  closeoutProjectionByJobId,
  attentionBusinessCutoffIso,
  failedCutoffIso,
  recentCreatedCount,
  recentCompletedCount,
  recentScheduleTouchCount,
  openServiceCaseCount,
  resolvedServiceCaseCount,
  recentServiceWindowCutoffIso,
}: BuildOperationalReportingReadModelArgs): OperationalReportingReadModel {
  const activeJobs = jobs.filter((job) => String(job.ops_status ?? "").toLowerCase() !== "closed");
  const attentionCutoff = getTime(attentionBusinessCutoffIso);
  const failedCutoff = getTime(failedCutoffIso);
  const recentServiceCutoff = getTime(recentServiceWindowCutoffIso);

  const activeServiceJobs = activeJobs.filter(
    (job) => String(job.job_type ?? "").toLowerCase() === "service"
  );

  const workload: OperationalReportingMetric[] = [
    {
      key: "active_operational_jobs",
      label: "Active operational jobs",
      value: activeJobs.length,
      note: "Open workload excluding closed and cancelled visits.",
    },
    {
      key: "scheduled_visits",
      label: "Scheduled visits",
      value: countWhere(
        activeJobs,
        (job) =>
          String(job.ops_status ?? "").toLowerCase() === "scheduled" &&
          String(job.status ?? "").toLowerCase() === "open"
      ),
      note: "Current scheduled workload from jobs.ops_status.",
    },
    {
      key: "need_to_schedule",
      label: "Need to schedule",
      value: countWhere(
        activeJobs,
        (job) =>
          String(job.ops_status ?? "").toLowerCase() === "need_to_schedule" &&
          String(job.status ?? "").toLowerCase() === "open"
      ),
      note: "Unscheduled open visits waiting on dispatch.",
    },
    {
      key: "closeout_queue",
      label: "Closeout queue",
      value: countWhere(activeJobs, (job) => isInCloseoutQueue(closeoutProjectionByJobId.get(job.id) ?? job)),
      note: "Field-complete visits still waiting on office closeout obligations.",
    },
  ];

  const opsBuckets = OPS_BUCKET_ORDER.map((bucket) => ({
    key:
      bucket === "need_to_schedule"
        ? "ops_need_to_schedule"
        : bucket === "scheduled"
          ? "ops_scheduled"
          : bucket === "pending_info"
            ? "ops_pending_info"
            : bucket === "on_hold"
              ? "ops_on_hold"
              : bucket === "failed"
                ? "ops_failed"
                : bucket === "pending_office_review"
                  ? "ops_pending_office_review"
                  : bucket === "paperwork_required"
                    ? "ops_paperwork_required"
                    : "ops_invoice_required",
    label: formatOpsLabel(bucket),
    value:
      bucket === "invoice_required"
        ? countWhere(activeJobs, (job) => needsInvoiceFollowUp(job, closeoutProjectionByJobId))
        : countWhere(activeJobs, (job) => String(job.ops_status ?? "").toLowerCase() === bucket),
    note: bucket === "pending_office_review"
      ? "Office-owned review queue."
      : bucket === "paperwork_required"
        ? "Waiting on final paperwork completion."
        : bucket === "invoice_required"
          ? "Waiting on billing-aware invoice follow-up."
          : `Current jobs in ${formatOpsLabel(bucket).toLowerCase()}.`,
  } satisfies OperationalReportingMetric));

  const aging: OperationalReportingMetric[] = [
    {
      key: "aging_scheduling_overdue",
      label: "Scheduling overdue",
      value: countWhere(
        activeJobs,
        (job) =>
          String(job.ops_status ?? "").toLowerCase() === "need_to_schedule" &&
          String(job.status ?? "").toLowerCase() === "open" &&
          getTime(job.created_at) <= attentionCutoff
      ),
      note: "Need-to-schedule visits older than 3 business days.",
    },
    {
      key: "aging_follow_up_overdue",
      label: "Follow-up overdue",
      value: countWhere(
        activeJobs,
        (job) => {
          const opsStatus = String(job.ops_status ?? "").toLowerCase();
          return (
            (opsStatus === "pending_info" || opsStatus === "on_hold") &&
            getTime(job.created_at) <= attentionCutoff
          );
        }
      ),
      note: "Pending info or on-hold work older than 3 business days.",
    },
    {
      key: "aging_failure_review_aged",
      label: "Failure review aged",
      value: countWhere(
        activeJobs,
        (job) => {
          const opsStatus = String(job.ops_status ?? "").toLowerCase();
          return (
            (opsStatus === "failed" || opsStatus === "pending_office_review") &&
            getTime(job.created_at) <= failedCutoff
          );
        }
      ),
      note: "Failed or office-review work older than 14 calendar days.",
    },
    {
      key: "aging_closeout_overdue",
      label: "Closeout overdue",
      value: countWhere(
        activeJobs,
        (job) =>
          isInCloseoutQueue(closeoutProjectionByJobId.get(job.id) ?? job) &&
          getTime(job.field_complete_at) <= Date.now() - 24 * 60 * 60 * 1000
      ),
      note: "Closeout queue items still open at least one day after field completion.",
    },
  ];

  const throughput: OperationalReportingMetric[] = [
    {
      key: "throughput_jobs_created_7d",
      label: "Jobs created (7d)",
      value: recentCreatedCount,
      note: "Event-backed job creation activity.",
    },
    {
      key: "throughput_jobs_completed_7d",
      label: "Jobs completed (7d)",
      value: recentCompletedCount,
      note: "Event-backed field completion activity.",
    },
    {
      key: "throughput_schedule_touches_7d",
      label: "Schedule touches (7d)",
      value: recentScheduleTouchCount,
      note: "New schedules and schedule updates logged in job_events.",
    },
  ];

  const serviceOutcomes = SERVICE_OUTCOME_ORDER.map((outcome) => ({
    key:
      outcome === "resolved"
        ? "service_outcome_resolved"
        : outcome === "follow_up_required"
          ? "service_outcome_follow_up_required"
          : "service_outcome_no_issue_found",
    label: formatOpsLabel(outcome),
    value: countWhere(
      activeServiceJobs,
      (job) =>
        String(job.service_visit_outcome ?? "").toLowerCase() === outcome &&
        getTime(job.field_complete_at ?? job.created_at) >= recentServiceCutoff
    ),
    note: "Completed service visits in the last 30 days.",
  } satisfies OperationalReportingMetric));

  const continuity: OperationalReportingMetric[] = [
    {
      key: "continuity_open_service_cases",
      label: "Open service cases",
      value: openServiceCaseCount,
      note: "Continuity truth from linked service_cases in scope.",
    },
    {
      key: "continuity_resolved_service_cases",
      label: "Resolved service cases",
      value: resolvedServiceCaseCount,
      note: "Resolved service_cases already linked to scoped jobs.",
    },
    {
      key: "continuity_active_service_jobs_with_case",
      label: "Active service jobs with case",
      value: countWhere(
        activeServiceJobs,
        (job) => String(job.service_case_id ?? "").trim().length > 0
      ),
      note: "Current service visits carrying continuity through service_case_id.",
    },
    {
      key: "continuity_active_service_jobs_missing_case",
      label: "Active service jobs missing case",
      value: countWhere(
        activeServiceJobs,
        (job) => String(job.service_case_id ?? "").trim().length === 0
      ),
      note: "Service visits without a linked continuity container in current scope.",
    },
  ];

  return {
    workload,
    opsBuckets,
    aging,
    throughput,
    serviceOutcomes,
    continuity,
  };
}