import { isInCloseoutQueue } from "@/lib/utils/closeout";

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

export type OperationalReportingMetric = {
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

export function buildOperationalReportingReadModel({
  jobs,
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
      label: "Active operational jobs",
      value: activeJobs.length,
      note: "Open workload excluding closed and cancelled visits.",
    },
    {
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
      label: "Closeout queue",
      value: countWhere(activeJobs, (job) => isInCloseoutQueue(job)),
      note: "Field-complete visits still waiting on office closeout obligations.",
    },
  ];

  const opsBuckets = OPS_BUCKET_ORDER.map((bucket) => ({
    label: formatOpsLabel(bucket),
    value: countWhere(activeJobs, (job) => String(job.ops_status ?? "").toLowerCase() === bucket),
    note: bucket === "pending_office_review"
      ? "Office-owned review queue."
      : bucket === "paperwork_required"
        ? "Waiting on final paperwork completion."
        : bucket === "invoice_required"
          ? "Waiting on final processing closeout."
          : `Current jobs in ${formatOpsLabel(bucket).toLowerCase()}.`,
  }));

  const aging: OperationalReportingMetric[] = [
    {
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
      label: "Closeout overdue",
      value: countWhere(
        activeJobs,
        (job) => isInCloseoutQueue(job) && getTime(job.field_complete_at) <= Date.now() - 24 * 60 * 60 * 1000
      ),
      note: "Closeout queue items still open at least one day after field completion.",
    },
  ];

  const throughput: OperationalReportingMetric[] = [
    {
      label: "Jobs created (7d)",
      value: recentCreatedCount,
      note: "Event-backed job creation activity.",
    },
    {
      label: "Jobs completed (7d)",
      value: recentCompletedCount,
      note: "Event-backed field completion activity.",
    },
    {
      label: "Schedule touches (7d)",
      value: recentScheduleTouchCount,
      note: "New schedules and schedule updates logged in job_events.",
    },
  ];

  const serviceOutcomes = SERVICE_OUTCOME_ORDER.map((outcome) => ({
    label: formatOpsLabel(outcome),
    value: countWhere(
      activeServiceJobs,
      (job) =>
        String(job.service_visit_outcome ?? "").toLowerCase() === outcome &&
        getTime(job.field_complete_at ?? job.created_at) >= recentServiceCutoff
    ),
    note: "Completed service visits in the last 30 days.",
  }));

  const continuity: OperationalReportingMetric[] = [
    {
      label: "Open service cases",
      value: openServiceCaseCount,
      note: "Continuity truth from linked service_cases in scope.",
    },
    {
      label: "Resolved service cases",
      value: resolvedServiceCaseCount,
      note: "Resolved service_cases already linked to scoped jobs.",
    },
    {
      label: "Active service jobs with case",
      value: countWhere(
        activeServiceJobs,
        (job) => String(job.service_case_id ?? "").trim().length > 0
      ),
      note: "Current service visits carrying continuity through service_case_id.",
    },
    {
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