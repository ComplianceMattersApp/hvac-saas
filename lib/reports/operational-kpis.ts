import { isInCloseoutQueue } from "@/lib/utils/closeout";
import {
  type ReportCenterKpiBucket,
  type ReportCenterKpiFamilyReadModel,
  type ReportCenterKpiFilters,
  formatMetricValue,
  getKpiRange,
  incrementBucketValue,
  initializeBucketRows,
} from "@/lib/reports/kpi-foundation";

type OperationalKpiJob = {
  id: string;
  status: string | null;
  ops_status: string | null;
  created_at: string | null;
  field_complete: boolean | null;
  field_complete_at: string | null;
  job_type: string | null;
  invoice_complete: boolean | null;
  certs_complete: boolean | null;
};

const OPERATIONAL_BUCKET_METRICS = [
  { key: "visits_created", label: "Visits Created" },
  { key: "visits_completed", label: "Visits Completed" },
] as const;

function daysSince(value?: string | null) {
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const days = Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000));
  return days < 0 ? 0 : days;
}

export async function buildOperationalKpiReadModel(params: {
  supabase: any;
  filters: ReportCenterKpiFilters;
  buckets: ReportCenterKpiBucket[];
}): Promise<ReportCenterKpiFamilyReadModel> {
  const range = getKpiRange(params.filters);
  const { data, error } = await params.supabase
    .from("jobs")
    .select("id, status, ops_status, created_at, field_complete, field_complete_at, job_type, invoice_complete, certs_complete")
    .is("deleted_at", null);

  if (error) throw error;

  const jobs = (data ?? []) as OperationalKpiJob[];
  const activeJobs = jobs.filter(
    (job) =>
      String(job.status ?? "").trim().toLowerCase() !== "cancelled" &&
      String(job.ops_status ?? "").trim().toLowerCase() !== "closed",
  );

  const bucketRows = initializeBucketRows(
    params.buckets,
    OPERATIONAL_BUCKET_METRICS.map((metric) => metric.key),
  );

  let visitsCreated = 0;
  let visitsCompleted = 0;

  for (const job of jobs) {
    const createdAtMs = job.created_at ? Date.parse(job.created_at) : Number.NaN;
    if (Number.isFinite(createdAtMs) && createdAtMs >= range.startMs && createdAtMs < range.endMs) {
      visitsCreated += 1;
    }

    if (Boolean(job.field_complete) && job.field_complete_at) {
      const completedAtMs = Date.parse(job.field_complete_at);
      if (Number.isFinite(completedAtMs) && completedAtMs >= range.startMs && completedAtMs < range.endMs) {
        visitsCompleted += 1;
      }
    }

    incrementBucketValue({
      bucketRows,
      buckets: params.buckets,
      metricKey: "visits_created",
      instantValue: job.created_at,
      rangeStartMs: range.startMs,
      rangeEndMs: range.endMs,
    });

    if (Boolean(job.field_complete)) {
      incrementBucketValue({
        bucketRows,
        buckets: params.buckets,
        metricKey: "visits_completed",
        instantValue: job.field_complete_at,
        rangeStartMs: range.startMs,
        rangeEndMs: range.endMs,
      });
    }
  }

  const needToScheduleBacklog = activeJobs.filter(
    (job) => String(job.ops_status ?? "").trim().toLowerCase() === "need_to_schedule",
  ).length;
  const paperworkRequiredBacklog = activeJobs.filter(
    (job) => String(job.ops_status ?? "").trim().toLowerCase() === "paperwork_required",
  ).length;
  const invoiceRequiredBacklog = activeJobs.filter(
    (job) => String(job.ops_status ?? "").trim().toLowerCase() === "invoice_required",
  ).length;
  const closeoutBacklog = activeJobs.filter((job) => isInCloseoutQueue(job)).length;
  const closeoutAgedSevenPlus = activeJobs.filter((job) => {
    if (!isInCloseoutQueue(job)) return false;
    const ageDays = daysSince(job.field_complete_at);
    return ageDays != null && ageDays >= 7;
  }).length;

  return {
    familyKey: "operational",
    familyLabel: "Operational KPIs",
    familyDescription: "Visit-owned workload and throughput summaries derived from current jobs truth and operational projection fields.",
    sourceSummary: "Sources: jobs, jobs.ops_status, field_complete_at, invoice_complete, certs_complete, closeout projection helper.",
    metrics: [
      {
        key: "active_open_visits",
        label: "Open Visits",
        currentValue: formatMetricValue(activeJobs.length),
        mode: "snapshot",
        priority: "primary",
        dashboardRole: "Top-level workload indicator",
        priorityReason: "This is the broadest current view of live operational workload and deserves first-line dashboard visibility.",
        source: "jobs.status and jobs.ops_status",
        bucketRule: "Current snapshot only. Historical backlog reconstruction is not derived in this pass.",
        derivation: "Count visits that are not cancelled and not ops-closed at read time.",
      },
      {
        key: "need_to_schedule_backlog",
        label: "Need-to-Schedule Backlog",
        currentValue: formatMetricValue(needToScheduleBacklog),
        mode: "snapshot",
        priority: "primary",
        dashboardRole: "Top-level dispatch backlog",
        priorityReason: "This is immediately actionable for office scheduling and should stay prominent.",
        source: "jobs.ops_status",
        bucketRule: "Current snapshot only.",
        derivation: "Count active visits where jobs.ops_status = need_to_schedule.",
      },
      {
        key: "closeout_backlog",
        label: "Closeout Backlog",
        currentValue: formatMetricValue(closeoutBacklog),
        mode: "snapshot",
        priority: "primary",
        dashboardRole: "Top-level office completion backlog",
        priorityReason: "This is the core admin follow-up queue between field completion and operational closure.",
        source: "jobs plus lib/utils/closeout.ts",
        bucketRule: "Current snapshot only.",
        derivation: "Count field-complete active visits that still satisfy isInCloseoutQueue(...).",
      },
      {
        key: "closeout_aging_7_plus_days",
        label: "Closeout Aging 7+ Days",
        currentValue: formatMetricValue(closeoutAgedSevenPlus),
        mode: "snapshot",
        priority: "primary",
        dashboardRole: "Top-level backlog risk signal",
        priorityReason: "Aged closeout work is a strong risk indicator and should surface alongside the total closeout queue.",
        source: "jobs.field_complete_at plus lib/utils/closeout.ts",
        bucketRule: "Current snapshot only.",
        derivation: "Count current closeout-backlog visits where field_complete_at is at least 7 days old.",
      },
      {
        key: "visits_created",
        label: "Visits Created in Range",
        currentValue: formatMetricValue(visitsCreated),
        mode: "bucketed",
        priority: "supporting",
        dashboardRole: "Trend context only",
        priorityReason: "Useful for workload context, but not as immediately actionable as live backlog metrics.",
        source: "jobs.created_at",
        bucketRule: "Bucket by created_at using the selected daily, weekly, or monthly calendar bucket.",
        derivation: "Count jobs created inside the selected date range.",
      },
      {
        key: "visits_completed",
        label: "Visits Completed in Range",
        currentValue: formatMetricValue(visitsCompleted),
        mode: "bucketed",
        priority: "secondary",
        dashboardRole: "Operational throughput trend",
        priorityReason: "This is a strong productivity signal, but it is less urgent than live backlog queues.",
        source: "jobs.field_complete_at with field_complete",
        bucketRule: "Bucket by field_complete_at using the selected daily, weekly, or monthly calendar bucket.",
        derivation: "Count field-complete visits whose field_complete_at falls inside the selected range.",
      },
      {
        key: "paperwork_required_backlog",
        label: "Paperwork-Required Backlog",
        currentValue: formatMetricValue(paperworkRequiredBacklog),
        mode: "snapshot",
        priority: "secondary",
        dashboardRole: "Operational exception backlog",
        priorityReason: "Still actionable and meaningful, but more specialized than overall closeout and scheduling queues.",
        source: "jobs.ops_status",
        bucketRule: "Current snapshot only.",
        derivation: "Count active visits where jobs.ops_status = paperwork_required.",
      },
      {
        key: "invoice_required_backlog",
        label: "Invoice Follow-up Backlog",
        currentValue: formatMetricValue(invoiceRequiredBacklog),
        mode: "snapshot",
        priority: "secondary",
        dashboardRole: "Operational closeout follow-up",
        priorityReason: "This is useful for office follow-up, but it should sit beneath the broader closeout queue to avoid over-weighting invoice language.",
        source: "jobs.ops_status",
        bucketRule: "Current snapshot only.",
        derivation: "Count active visits where jobs.ops_status = invoice_required. This remains operational projection only.",
      },
    ],
    bucketColumns: OPERATIONAL_BUCKET_METRICS.map((metric) => ({ key: metric.key, label: metric.label })),
    bucketRows,
  };
}