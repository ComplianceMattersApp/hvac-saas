import { buildBillingTruthCloseoutProjectionMap } from "@/lib/business/job-billing-state";
import { resolveBillingModeByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { getActiveJobAssignmentDisplayMap } from "@/lib/staffing/human-layer";
import {
  getKpiRange,
  type ReportCenterKpiFamilyReadModel,
  type ReportCenterKpiFilters,
} from "@/lib/reports/kpi-foundation";
import { listReportCenterKpiFamilies } from "@/lib/reports/report-center-kpis";
import { isInCloseoutQueue } from "@/lib/utils/closeout";
import {
  accountScopeInList,
  resolveReportAccountContractorIds,
} from "@/lib/reports/report-account-scope";

type DashboardJobRow = {
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

type DashboardInvoiceRow = {
  id: string;
  job_id: string | null;
  status: string | null;
  issued_at: string | null;
  total_cents: number | null;
};

type DashboardMetricCard = {
  label: string;
  value: string;
  helperText: string;
  href?: string | null;
  tone?: "slate" | "emerald" | "amber" | "sky" | "orange";
};

type DashboardTrendPoint = {
  label: string;
  primaryValue: number;
  secondaryValue: number;
};

type DashboardJobTypeSlice = {
  key: string;
  label: string;
  openCount: number;
  completedCount: number;
  openHref: string | null;
  completedHref: string | null;
};

export type DashboardTechRow = {
  userId: string;
  techName: string;
  assignedOpenVisits: number;
  closeoutBacklog: number;
  openHref: string;
  closeoutHref: string;
};

export type ReportCenterDashboardReadModel = {
  topCards: DashboardMetricCard[];
  operations: {
    cards: DashboardMetricCard[];
    trend: DashboardTrendPoint[];
    jobTypeSlices: DashboardJobTypeSlice[];
    unassignedOpenVisits: number;
  };
  closeout: {
    cards: DashboardMetricCard[];
  };
  continuity: {
    cards: DashboardMetricCard[];
    trend: DashboardTrendPoint[];
  };
  invoiceVisibility: {
    cards: DashboardMetricCard[];
    note: string;
  };
  techWorkload: {
    rows: DashboardTechRow[];
    unassignedOpenVisits: number;
    note: string;
  };
};

function normalizeJobType(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "ecc") return "ecc";
  if (normalized === "service") return "service";
  return "other";
}

function jobTypeLabel(jobType: string) {
  if (jobType === "ecc") return "ECC";
  if (jobType === "service") return "Service";
  return "Other";
}

function normalizeInvoiceStatus(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "issued") return "issued";
  if (normalized === "void") return "void";
  return "draft";
}

function formatCurrencyCents(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function buildRangeParams(filters: ReportCenterKpiFilters) {
  const params = new URLSearchParams();
  if (filters.fromDate) params.set("from", filters.fromDate);
  if (filters.toDate) params.set("to", filters.toDate);
  return params;
}

function buildMetricMap(families: ReportCenterKpiFamilyReadModel[]) {
  return new Map(
    families.flatMap((family) => family.metrics.map((metric) => [metric.key, metric] as const)),
  );
}

function getMetricValue(metricMap: Map<string, ReportCenterKpiFamilyReadModel["metrics"][number]>, key: string) {
  return metricMap.get(key)?.currentValue ?? "0";
}

function buildJobTypeSlices(params: {
  activeJobs: DashboardJobRow[];
  jobs: DashboardJobRow[];
  filters: ReportCenterKpiFilters;
  rangeStartMs: number;
  rangeEndMs: number;
}) {
  const typeKeys = ["ecc", "service", "other"] as const;
  const counts = new Map<string, { openCount: number; completedCount: number }>();

  for (const key of typeKeys) {
    counts.set(key, { openCount: 0, completedCount: 0 });
  }

  for (const job of params.activeJobs) {
    const key = normalizeJobType(job.job_type);
    const row = counts.get(key)!;
    row.openCount += 1;
  }

  for (const job of params.jobs) {
    if (!job.field_complete || !job.field_complete_at) continue;
    const completedAtMs = Date.parse(job.field_complete_at);
    if (!Number.isFinite(completedAtMs)) continue;
    if (completedAtMs < params.rangeStartMs || completedAtMs >= params.rangeEndMs) continue;
    const key = normalizeJobType(job.job_type);
    const row = counts.get(key)!;
    row.completedCount += 1;
  }

  const rangeParams = buildRangeParams(params.filters);

  return typeKeys
    .map((key) => {
      const countsForKey = counts.get(key)!;
      const ledgerValue = key === "other" ? null : key;
      const openParams = new URLSearchParams();
      openParams.set("scope", "active");
      if (ledgerValue) openParams.set("job_type", ledgerValue);

      const completedParams = new URLSearchParams(rangeParams);
      completedParams.set("date_field", "completed");
      if (ledgerValue) completedParams.set("job_type", ledgerValue);

      return {
        key,
        label: jobTypeLabel(key),
        openCount: countsForKey.openCount,
        completedCount: countsForKey.completedCount,
        openHref: ledgerValue ? `/reports/jobs?${openParams.toString()}` : null,
        completedHref: ledgerValue ? `/reports/jobs?${completedParams.toString()}` : null,
      };
    })
    .filter((row) => row.openCount > 0 || row.completedCount > 0);
}

function buildTechRows(params: {
  activeJobs: DashboardJobRow[];
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
  assignmentMap: Record<string, Array<{ user_id: string; display_name: string }>>;
}) {
  const techMap = new Map<string, DashboardTechRow>();

  for (const job of params.activeJobs) {
    const assignments = params.assignmentMap[job.id] ?? [];
    const uniqueAssignments = Array.from(
      new Map(assignments.map((assignment) => [assignment.user_id, assignment])).values(),
    );

    for (const assignment of uniqueAssignments) {
      const existing = techMap.get(assignment.user_id) ?? {
        userId: assignment.user_id,
        techName: assignment.display_name,
        assignedOpenVisits: 0,
        closeoutBacklog: 0,
        openHref: `/reports/jobs?scope=active&assignee=${assignment.user_id}`,
        closeoutHref: `/reports/closeout?closeout_only=1&assignee=${assignment.user_id}`,
      };

      existing.assignedOpenVisits += 1;
      if (isInCloseoutQueue(params.closeoutProjectionByJobId.get(job.id) ?? job)) {
        existing.closeoutBacklog += 1;
      }
      techMap.set(assignment.user_id, existing);
    }
  }

  return Array.from(techMap.values())
    .sort((left, right) => {
      if (right.assignedOpenVisits !== left.assignedOpenVisits) {
        return right.assignedOpenVisits - left.assignedOpenVisits;
      }
      if (right.closeoutBacklog !== left.closeoutBacklog) {
        return right.closeoutBacklog - left.closeoutBacklog;
      }
      return left.techName.localeCompare(right.techName, undefined, { sensitivity: "base" });
    })
    .slice(0, 8);
}

function buildInvoiceReportHref(input?: {
  status?: string | null;
  dateField?: "created" | "invoice" | "issued";
  filters?: ReportCenterKpiFilters;
}) {
  const params = new URLSearchParams();

  if (input?.status) params.set("status", input.status);
  if (input?.dateField && input.dateField !== "created") params.set("date_field", input.dateField);
  if (input?.filters) {
    for (const [key, value] of buildRangeParams(input.filters).entries()) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `/reports/invoices?${query}` : "/reports/invoices";
}

export async function buildReportCenterDashboardReadModel(params: {
  supabase: any;
  accountOwnerUserId: string;
  filters: ReportCenterKpiFilters;
}): Promise<ReportCenterDashboardReadModel> {
  const range = getKpiRange(params.filters);
  const contractorIds = await resolveReportAccountContractorIds({
    supabase: params.supabase,
    accountOwnerUserId: params.accountOwnerUserId,
  });

  const [families, jobsResult, invoiceResult, billingMode] = await Promise.all([
    listReportCenterKpiFamilies(params),
    params.supabase
      .from("jobs")
      .select("id, status, ops_status, created_at, field_complete, field_complete_at, job_type, invoice_complete, certs_complete")
      .is("deleted_at", null)
      .in("contractor_id", accountScopeInList(contractorIds)),
    params.supabase
      .from("internal_invoices")
      .select("id, job_id, status, issued_at, total_cents")
      .eq("account_owner_user_id", params.accountOwnerUserId),
    resolveBillingModeByAccountOwnerId({
      supabase: params.supabase,
      accountOwnerUserId: params.accountOwnerUserId,
    }),
  ]);

  if (jobsResult.error) throw jobsResult.error;
  if (invoiceResult.error) throw invoiceResult.error;

  const jobs = (jobsResult.data ?? []) as DashboardJobRow[];
  const { projectionsByJobId } = await buildBillingTruthCloseoutProjectionMap({
    supabase: params.supabase,
    accountOwnerUserId: params.accountOwnerUserId,
    jobs: jobs.map((job) => ({
      id: job.id,
      field_complete: job.field_complete,
      job_type: job.job_type,
      ops_status: job.ops_status,
      invoice_complete: job.invoice_complete,
      certs_complete: job.certs_complete,
    })),
  });
  const usesInternalInvoicing = billingMode === "internal_invoicing";
  const invoices = usesInternalInvoicing ? ((invoiceResult.data ?? []) as DashboardInvoiceRow[]) : [];
  const activeJobs = jobs.filter(
    (job) =>
      String(job.status ?? "").trim().toLowerCase() !== "cancelled" &&
      String(job.ops_status ?? "").trim().toLowerCase() !== "closed",
  );

  const assignmentMap = await getActiveJobAssignmentDisplayMap({
    supabase: params.supabase,
    jobIds: activeJobs.map((job) => job.id),
  });

  const metricMap = buildMetricMap(families);
  const operational = families.find((family) => family.familyKey === "operational");
  const continuity = families.find((family) => family.familyKey === "continuity");
  if (!operational || !continuity) throw new Error("REPORT_CENTER_DASHBOARD_FAMILIES_REQUIRED");

  const unassignedOpenVisits = activeJobs.filter((job) => (assignmentMap[job.id] ?? []).length === 0).length;

  const issuedInvoices = invoices.filter((invoice) => normalizeInvoiceStatus(invoice.status) === "issued");
  const draftInvoices = invoices.filter((invoice) => normalizeInvoiceStatus(invoice.status) === "draft");
  const issuedThisPeriod = issuedInvoices.filter((invoice) => {
    const issuedAtMs = invoice.issued_at ? Date.parse(invoice.issued_at) : Number.NaN;
    return Number.isFinite(issuedAtMs) && issuedAtMs >= range.startMs && issuedAtMs < range.endMs;
  });
  const billedThisPeriodCents = issuedThisPeriod.reduce(
    (total, invoice) => total + (Number(invoice.total_cents ?? 0) || 0),
    0,
  );

  const jobTypeSlices = buildJobTypeSlices({
    activeJobs,
    jobs,
    filters: params.filters,
    rangeStartMs: range.startMs,
    rangeEndMs: range.endMs,
  });
  const techRows = buildTechRows({
    activeJobs,
    closeoutProjectionByJobId: projectionsByJobId,
    assignmentMap,
  });

  const operationalTrend = operational.bucketRows.map((row) => ({
    label: row.bucketLabel,
    primaryValue: row.values.visits_created ?? 0,
    secondaryValue: row.values.visits_completed ?? 0,
  }));
  const continuityTrend = continuity.bucketRows.map((row) => ({
    label: row.bucketLabel,
    primaryValue: row.values.cases_created ?? 0,
    secondaryValue: row.values.cases_resolved ?? 0,
  }));

  return {
    topCards: [
      {
        label: "Open Visits",
        value: getMetricValue(metricMap, "active_open_visits"),
        helperText: "Current active visit workload.",
        href: "/reports/jobs?scope=active",
        tone: "slate",
      },
      {
        label: "Need to Schedule",
        value: getMetricValue(metricMap, "need_to_schedule_backlog"),
        helperText: "Visits ready for office scheduling.",
        href: "/reports/jobs?scope=active&ops_status=need_to_schedule",
        tone: "amber",
      },
      {
        label: "Closeout Backlog",
        value: getMetricValue(metricMap, "closeout_backlog"),
        helperText: "Field-complete visits needing admin closeout.",
        href: "/reports/closeout?closeout_only=1",
        tone: "orange",
      },
      {
        label: "Open Interrupted Cases",
        value: getMetricValue(metricMap, "open_service_cases"),
        helperText: "Cases currently blocked, failed, pending, on hold, or waiting.",
        href: "/reports/service-cases?case_status=open",
        tone: "sky",
      },
      {
        label: "Active Repeat Visits",
        value: getMetricValue(metricMap, "repeat_visit_cases"),
        helperText: "Multi-visit cases with active work still open.",
        href: "/reports/service-cases?repeat_only=1&active_repeat_visits=1",
        tone: "emerald",
      },
      {
        label: "Billed This Period",
        value: formatCurrencyCents(billedThisPeriodCents),
        helperText: "Issued invoice totals only. Payments are tracked separately.",
        href: null,
        tone: "slate",
      },
    ],
    operations: {
      cards: [
        {
          label: "Open visits",
          value: getMetricValue(metricMap, "active_open_visits"),
          helperText: "Active visits that are not cancelled and not operationally closed.",
          href: "/reports/jobs?scope=active",
        },
        {
          label: "Need to schedule",
          value: getMetricValue(metricMap, "need_to_schedule_backlog"),
          helperText: "Visits waiting for dispatch placement.",
          href: "/reports/jobs?scope=active&ops_status=need_to_schedule",
        },
        {
          label: "Visits completed this period",
          value: getMetricValue(metricMap, "visits_completed"),
          helperText: "Field-complete visits inside the selected date range.",
          href: `/reports/jobs?${new URLSearchParams({ ...Object.fromEntries(buildRangeParams(params.filters)), date_field: "completed" }).toString()}`,
        },
        {
          label: "Unassigned Open Visits",
          value: new Intl.NumberFormat("en-US").format(unassignedOpenVisits),
          helperText: "Active visits with no assigned team member.",
          href: "/reports/jobs?assignee=unassigned",
        },
      ],
      trend: operationalTrend,
      jobTypeSlices,
      unassignedOpenVisits,
    },
    closeout: {
      cards: [
        {
          label: "Closeout backlog",
          value: getMetricValue(metricMap, "closeout_backlog"),
          helperText: "Total admin follow-up still sitting between field completion and operational close.",
          href: "/reports/closeout?closeout_only=1",
        },
        {
          label: "Closeout aging 7+ days",
          value: getMetricValue(metricMap, "closeout_aging_7_plus_days"),
          helperText: "The oldest closeout work that is starting to drag.",
          href: "/reports/closeout?closeout_only=1&sort=aging_desc",
        },
        {
          label: "Paperwork needed",
          value: getMetricValue(metricMap, "paperwork_required_backlog"),
          helperText: "Visits still blocked on required paperwork.",
          href: "/reports/closeout?paperwork_only=1",
        },
        {
          label: "Invoice Follow-Up Needed",
          value: getMetricValue(metricMap, "invoice_required_backlog"),
          helperText: "Visits still waiting on invoice action.",
          href: "/reports/closeout?invoice_only=1",
        },
      ],
    },
    continuity: {
      cards: [
        {
          label: "Open service cases",
          value: getMetricValue(metricMap, "open_service_cases"),
          helperText: "Unresolved continuity work that still needs an outcome.",
          href: "/reports/service-cases?case_status=open",
        },
        {
          label: "Active Repeat Visits",
          value: getMetricValue(metricMap, "repeat_visit_cases"),
          helperText: "Multi-visit cases with active work still open.",
          href: "/reports/service-cases?repeat_only=1&active_repeat_visits=1",
        },
        {
          label: "Cases resolved this period",
          value: getMetricValue(metricMap, "cases_resolved"),
          helperText: "Resolved continuity work inside the selected range.",
          href: `/reports/service-cases?${new URLSearchParams({ ...Object.fromEntries(buildRangeParams(params.filters)), case_status: "resolved", date_field: "resolved" }).toString()}`,
        },
        {
          label: "Cases opened this period",
          value: getMetricValue(metricMap, "cases_created"),
          helperText: "New continuity intake arriving during the selected range.",
          href: `/reports/service-cases?${new URLSearchParams({ ...Object.fromEntries(buildRangeParams(params.filters)), date_field: "created" }).toString()}`,
        },
      ],
      trend: continuityTrend,
    },
    invoiceVisibility: {
      cards: [
        {
          label: "Issued this period",
          value: new Intl.NumberFormat("en-US").format(issuedThisPeriod.length),
          helperText: "Invoices marked issued inside the selected date range.",
          href: buildInvoiceReportHref({
            status: "issued",
            dateField: "issued",
            filters: params.filters,
          }),
        },
        {
          label: "Billed this period",
          value: formatCurrencyCents(billedThisPeriodCents),
          helperText: "Sum of issued invoice totals inside the selected range.",
          href: buildInvoiceReportHref({
            status: "issued",
            dateField: "issued",
            filters: params.filters,
          }),
        },
        {
          label: "Issued invoices on record",
          value: new Intl.NumberFormat("en-US").format(issuedInvoices.length),
          helperText: "Current billed truth on file, separate from payment collection.",
          href: buildInvoiceReportHref({ status: "issued" }),
        },
        {
          label: "Draft invoices",
          value: new Intl.NumberFormat("en-US").format(draftInvoices.length),
          helperText: "Prepared billing records not yet issued.",
          href: buildInvoiceReportHref({ status: "draft" }),
        },
      ],
      note: "Invoice visibility is limited to billed truth that already exists on internal invoices. Payment collection, cash performance, and payment mix are intentionally excluded.",
    },
    techWorkload: {
      rows: techRows,
      unassignedOpenVisits,
      note: "Tech workload is based on current active assignments. Multi-tech visits count once for each currently assigned tech, which is appropriate for live workload review but not historical productivity accounting.",
    },
  };
}

function csvEscape(value: string) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildDashboardTechWorkloadCsv(rows: DashboardTechRow[]) {
  const header = [
    "tech_name",
    "assigned_open_visits",
    "closeout_backlog",
    "open_jobs_report",
    "closeout_report",
  ];

  const lines = rows.map((row) =>
    [
      row.techName,
      String(row.assignedOpenVisits),
      String(row.closeoutBacklog),
      row.openHref,
      row.closeoutHref,
    ].map(csvEscape).join(","),
  );

  return [header.join(","), ...lines].join("\r\n");
}