import {
  type ReportCenterKpiBucket,
  type ReportCenterKpiFamilyReadModel,
  type ReportCenterKpiFilters,
  formatMetricValue,
  getKpiRange,
  incrementBucketValue,
  initializeBucketRows,
} from "@/lib/reports/kpi-foundation";
import {
  accountScopeInList,
  resolveReportAccountContractorIds,
  resolveReportAccountCustomerIds,
} from "@/lib/reports/report-account-scope";

type ContinuityCaseRow = {
  id: string;
  status: string | null;
  created_at: string | null;
  resolved_at: string | null;
  resolved_by_job_id: string | null;
};

const CONTINUITY_BUCKET_METRICS = [
  { key: "cases_created", label: "Cases Created" },
  { key: "cases_resolved", label: "Cases Resolved" },
] as const;

export async function buildContinuityKpiReadModel(params: {
  supabase: any;
  accountOwnerUserId: string;
  filters: ReportCenterKpiFilters;
  buckets: ReportCenterKpiBucket[];
}): Promise<ReportCenterKpiFamilyReadModel> {
  const range = getKpiRange(params.filters);
  const [customerIds, contractorIds] = await Promise.all([
    resolveReportAccountCustomerIds({
      supabase: params.supabase,
      accountOwnerUserId: params.accountOwnerUserId,
    }),
    resolveReportAccountContractorIds({
      supabase: params.supabase,
      accountOwnerUserId: params.accountOwnerUserId,
    }),
  ]);
  const [{ data: serviceCaseData, error: serviceCaseError }, { data: linkedJobData, error: linkedJobError }] = await Promise.all([
    params.supabase
      .from("service_cases")
      .select("id, status, created_at, resolved_at, resolved_by_job_id")
      .in("customer_id", accountScopeInList(customerIds)),
    params.supabase
      .from("jobs")
      .select("id, service_case_id")
      .is("deleted_at", null)
      .not("service_case_id", "is", null)
      .in("contractor_id", accountScopeInList(contractorIds)),
  ]);

  if (serviceCaseError) throw serviceCaseError;
  if (linkedJobError) throw linkedJobError;

  const serviceCases = (serviceCaseData ?? []) as ContinuityCaseRow[];
  const linkedJobCounts = new Map<string, number>();
  for (const row of linkedJobData ?? []) {
    const serviceCaseId = String((row as any)?.service_case_id ?? "").trim();
    if (!serviceCaseId) continue;
    linkedJobCounts.set(serviceCaseId, (linkedJobCounts.get(serviceCaseId) ?? 0) + 1);
  }

  const bucketRows = initializeBucketRows(
    params.buckets,
    CONTINUITY_BUCKET_METRICS.map((metric) => metric.key),
  );

  let casesCreated = 0;
  let casesResolved = 0;
  let resolvedByJobCount = 0;

  for (const serviceCase of serviceCases) {
    const status = String(serviceCase.status ?? "").trim().toLowerCase();
    const createdAtMs = serviceCase.created_at ? Date.parse(serviceCase.created_at) : Number.NaN;
    if (Number.isFinite(createdAtMs) && createdAtMs >= range.startMs && createdAtMs < range.endMs) {
      casesCreated += 1;
    }

    const resolvedAtMs = serviceCase.resolved_at ? Date.parse(serviceCase.resolved_at) : Number.NaN;
    if (status === "resolved" && Number.isFinite(resolvedAtMs) && resolvedAtMs >= range.startMs && resolvedAtMs < range.endMs) {
      casesResolved += 1;
    }

    if (status === "resolved" && String(serviceCase.resolved_by_job_id ?? "").trim()) {
      resolvedByJobCount += 1;
    }

    incrementBucketValue({
      bucketRows,
      buckets: params.buckets,
      metricKey: "cases_created",
      instantValue: serviceCase.created_at,
      rangeStartMs: range.startMs,
      rangeEndMs: range.endMs,
    });

    if (status === "resolved") {
      incrementBucketValue({
        bucketRows,
        buckets: params.buckets,
        metricKey: "cases_resolved",
        instantValue: serviceCase.resolved_at,
        rangeStartMs: range.startMs,
        rangeEndMs: range.endMs,
      });
    }
  }

  const openServiceCases = serviceCases.filter(
    (serviceCase) => String(serviceCase.status ?? "").trim().toLowerCase() !== "resolved",
  ).length;
  const resolvedServiceCases = serviceCases.filter(
    (serviceCase) => String(serviceCase.status ?? "").trim().toLowerCase() === "resolved",
  ).length;
  const repeatVisitCases = Array.from(linkedJobCounts.values()).filter((count) => count >= 2).length;
  const averageVisitsPerServiceCase = serviceCases.length
    ? Array.from(linkedJobCounts.values()).reduce((total, count) => total + count, 0) / serviceCases.length
    : 0;

  return {
    familyKey: "continuity",
    familyLabel: "Continuity KPIs",
    familyDescription: "Case-owned service continuity summaries derived from service_cases and linked visit counts.",
    sourceSummary: "Sources: service_cases plus linked jobs for repeat-visit and visit-density calculations.",
    metrics: [
      {
        key: "open_service_cases",
        label: "Open Service Cases",
        currentValue: formatMetricValue(openServiceCases),
        mode: "snapshot",
        priority: "primary",
        dashboardRole: "Top-level continuity backlog",
        priorityReason: "This is the cleanest current measure of unresolved continuity workload.",
        source: "service_cases.status",
        bucketRule: "Current snapshot only.",
        derivation: "Count service_cases whose status is not resolved at read time.",
      },
      {
        key: "cases_created",
        label: "Cases Created in Range",
        currentValue: formatMetricValue(casesCreated),
        mode: "bucketed",
        priority: "supporting",
        dashboardRole: "Trend context only",
        priorityReason: "Useful for intake context, but less important than unresolved case pressure and repeat-visit signals.",
        source: "service_cases.created_at",
        bucketRule: "Bucket by created_at using the selected daily, weekly, or monthly calendar bucket.",
        derivation: "Count service_cases created inside the selected date range.",
      },
      {
        key: "cases_resolved",
        label: "Cases Resolved in Range",
        currentValue: formatMetricValue(casesResolved),
        mode: "bucketed",
        priority: "secondary",
        dashboardRole: "Continuity throughput trend",
        priorityReason: "This is a useful quality-throughput signal, but it should sit below current open-case pressure.",
        source: "service_cases.resolved_at",
        bucketRule: "Bucket by resolved_at using the selected daily, weekly, or monthly calendar bucket.",
        derivation: "Count resolved service_cases whose resolved_at falls inside the selected range.",
      },
      {
        key: "repeat_visit_cases",
        label: "Repeat-Visit Cases",
        currentValue: formatMetricValue(repeatVisitCases),
        mode: "snapshot",
        priority: "primary",
        dashboardRole: "Top-level service quality risk",
        priorityReason: "Repeat visits are a strong continuity and service-quality signal and deserve first-line dashboard visibility.",
        source: "linked jobs by service_case_id",
        bucketRule: "Current snapshot only.",
        derivation: "Count service cases with two or more linked non-deleted jobs.",
      },
      {
        key: "average_visits_per_service_case",
        label: "Average Visits per Service Case",
        currentValue: formatMetricValue(averageVisitsPerServiceCase, 1),
        mode: "snapshot",
        priority: "supporting",
        dashboardRole: "Validation and context only",
        priorityReason: "Honest and informative, but not as immediately actionable as open-case or repeat-visit counts.",
        source: "service_cases plus linked jobs",
        bucketRule: "Current snapshot only.",
        derivation: "Divide linked non-deleted job count by total service_case count.",
      },
      {
        key: "resolved_by_job_coverage",
        label: "Resolved by Visit Coverage",
        currentValue: resolvedServiceCases
          ? `${Math.round((resolvedByJobCount / resolvedServiceCases) * 100)}%`
          : "0%",
        mode: "snapshot",
        priority: "deferred",
        dashboardRole: "Validation-only linkage quality check",
        priorityReason: "Technically honest, but too niche for top-level dashboard prominence until users prove it is decision-critical.",
        source: "service_cases.resolved_by_job_id",
        bucketRule: "Current snapshot only.",
        derivation: "Share of currently resolved service cases that carry a resolved_by_job_id link.",
      },
      {
        key: "resolved_service_cases",
        label: "Resolved Service Cases",
        currentValue: formatMetricValue(resolvedServiceCases),
        mode: "snapshot",
        priority: "supporting",
        dashboardRole: "Context only",
        priorityReason: "Honest, but the current stock of resolved cases is less useful than open-case pressure and resolved-in-range throughput.",
        source: "service_cases.status",
        bucketRule: "Current snapshot only.",
        derivation: "Count service_cases whose status is resolved at read time.",
      },
    ],
    bucketColumns: CONTINUITY_BUCKET_METRICS.map((metric) => ({ key: metric.key, label: metric.label })),
    bucketRows,
  };
}