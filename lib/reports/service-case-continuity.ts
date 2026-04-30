import { getActiveJobAssignmentDisplayMap } from "@/lib/staffing/human-layer";
import { displayDateLA, formatBusinessDateUS, laDateToUtcMidnightIso } from "@/lib/utils/schedule-la";
import {
  accountScopeInList,
  resolveReportAccountCustomerIds,
} from "@/lib/reports/report-account-scope";

export const SERVICE_CASE_CONTINUITY_PAGE_LIMIT = 300;
export const SERVICE_CASE_CONTINUITY_EXPORT_LIMIT = 5000;

export const SERVICE_CASE_CONTINUITY_STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
] as const;

export const SERVICE_CASE_CONTINUITY_KIND_OPTIONS = [
  { value: "reactive", label: "Reactive" },
  { value: "callback", label: "Callback" },
  { value: "warranty", label: "Warranty" },
  { value: "maintenance", label: "Maintenance" },
] as const;

export const SERVICE_CASE_CONTINUITY_DATE_FIELD_OPTIONS = [
  { value: "created", label: "Created date" },
  { value: "resolved", label: "Resolved date" },
] as const;

export const SERVICE_CASE_CONTINUITY_SORT_OPTIONS = [
  { value: "created_desc", label: "Created newest first" },
  { value: "created_asc", label: "Created oldest first" },
  { value: "resolved_desc", label: "Resolved newest first" },
] as const;

type FilterSource = URLSearchParams | Record<string, string | string[] | undefined>;

export type ServiceCaseContinuityDateField = (typeof SERVICE_CASE_CONTINUITY_DATE_FIELD_OPTIONS)[number]["value"];
export type ServiceCaseContinuitySort = (typeof SERVICE_CASE_CONTINUITY_SORT_OPTIONS)[number]["value"];

export type ServiceCaseContinuityFilters = {
  caseStatus: string;
  caseKind: string;
  contractorId: string;
  dateField: ServiceCaseContinuityDateField;
  fromDate: string;
  toDate: string;
  repeatOnly: boolean;
  sort: ServiceCaseContinuitySort;
};

export type ServiceCaseContinuityFilterOptions = {
  contractors: Array<{ id: string; name: string }>;
};

export type ServiceCaseContinuityRow = {
  serviceCaseId: string;
  serviceCaseHref: string;
  serviceCaseReference: string;
  problemSummary: string;
  caseKindLabel: string;
  caseStatusLabel: string;
  customerDisplay: string;
  locationDisplay: string;
  latestContractorDisplay: string;
  createdDateDisplay: string;
  resolvedDateDisplay: string;
  resolvedByJobReference: string;
  resolvedByJobHref: string | null;
  visitCount: number;
  latestVisitDateDisplay: string;
  latestVisitOpsStatusLabel: string;
  latestAssignedTechDisplay: string;
  activeLinkedVisitCount: number;
};

export type ServiceCaseContinuityResult = {
  rows: ServiceCaseContinuityRow[];
  totalCount: number;
  truncated: boolean;
};

type LedgerServiceCaseRow = {
  id: string;
  customer_id: string | null;
  location_id: string | null;
  problem_summary: string | null;
  case_kind: string | null;
  status: string | null;
  created_at: string | null;
  resolved_at: string | null;
  resolved_by_job_id: string | null;
};

type LedgerCustomerRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

type LedgerLocationRow = {
  id: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type LinkedJobRow = {
  id: string;
  service_case_id: string | null;
  title: string | null;
  contractor_id: string | null;
  contractors?: { name?: string | null } | null;
  status: string | null;
  ops_status: string | null;
  created_at: string | null;
  scheduled_date: string | null;
};

export type ServiceCaseLinkedJobStatus = Pick<LinkedJobRow, "status" | "ops_status">;

const SERVICE_CASE_BASE_SELECT =
  "id, customer_id, location_id, problem_summary, case_kind, status, created_at, resolved_at, resolved_by_job_id";
const LINKED_JOB_SELECT =
  "id, service_case_id, title, contractor_id, contractors(name), status, ops_status, created_at, scheduled_date";

function readParam(source: FilterSource, key: string) {
  if (source instanceof URLSearchParams) return source.get(key) ?? undefined;
  const value = source[key];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeChoice<T extends readonly { value: string }[]>(
  value: string | undefined,
  options: T,
  fallback: T[number]["value"],
) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return options.some((option) => option.value === normalized) ? normalized : fallback;
}

function normalizeYmd(value: string | undefined) {
  const normalized = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function addOneDay(dateYmd: string) {
  const [year, month, day] = dateYmd.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0));
  return next.toISOString().slice(0, 10);
}

function formatCaseKindLabel(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "-";
  if (normalized === "callback") return "Callback";
  if (normalized === "warranty") return "Warranty";
  if (normalized === "maintenance") return "Maintenance";
  return "Reactive";
}

function formatCaseStatusLabel(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "-";
  return normalized === "resolved" ? "Resolved" : "Open";
}

function formatOpsStatusLabel(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "-";

  const labels: Record<string, string> = {
    need_to_schedule: "Need to Schedule",
    scheduled: "Scheduled",
    pending_info: "Pending Info",
    on_hold: "On Hold",
    failed: "Failed",
    pending_office_review: "Pending Office Review",
    retest_needed: "Retest Needed",
    paperwork_required: "Paperwork Required",
    invoice_required: "Invoice Required",
    closed: "Closed",
  };

  return labels[normalized] ?? normalized.replace(/_/g, " ");
}

function csvEscape(value: string) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function isActiveLinkedJob(job: { status?: string | null; ops_status?: string | null }) {
  const lifecycleStatus = String(job.status ?? "").trim().toLowerCase();
  if (lifecycleStatus === "cancelled") return false;
  return String(job.ops_status ?? "").trim().toLowerCase() !== "closed";
}

export function countActiveLinkedJobs(jobs: ServiceCaseLinkedJobStatus[]) {
  return jobs.filter((job) => isActiveLinkedJob(job)).length;
}

export function isServiceCaseEffectivelyOpen(input: {
  storedStatus?: string | null;
  linkedJobs: ServiceCaseLinkedJobStatus[];
}) {
  if (input.linkedJobs.length === 0) {
    return String(input.storedStatus ?? "").trim().toLowerCase() !== "resolved";
  }

  return countActiveLinkedJobs(input.linkedJobs) > 0;
}

function getLatestVisitDateDisplay(job: LinkedJobRow | null | undefined) {
  if (!job) return "-";
  if (job.scheduled_date) return `${formatBusinessDateUS(job.scheduled_date)} scheduled`;
  if (job.created_at) return `${displayDateLA(job.created_at)} created`;
  return "-";
}

async function resolveCaseIdsForContractor(params: {
  supabase: any;
  contractorId: string;
}): Promise<string[] | null> {
  const contractorId = String(params.contractorId ?? "").trim();
  if (!contractorId) return null;

  const { data, error } = await params.supabase
    .from("jobs")
    .select("service_case_id")
    .eq("contractor_id", contractorId)
    .is("deleted_at", null)
    .not("service_case_id", "is", null);

  if (error) throw error;

  return Array.from(
    new Set(
      (data ?? [])
        .map((row: any) => String(row?.service_case_id ?? "").trim())
        .filter(Boolean),
    ),
  );
}

async function resolveRepeatCaseIds(params: {
  supabase: any;
  contractorId: string;
}): Promise<string[] | null> {
  const query = params.supabase
    .from("jobs")
    .select("service_case_id")
    .is("deleted_at", null)
    .not("service_case_id", "is", null);

  const contractorId = String(params.contractorId ?? "").trim();
  const scopedQuery = contractorId ? query.eq("contractor_id", contractorId) : query;
  const { data, error } = await scopedQuery;
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const serviceCaseId = String((row as any)?.service_case_id ?? "").trim();
    if (!serviceCaseId) continue;
    counts.set(serviceCaseId, (counts.get(serviceCaseId) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .map(([serviceCaseId]) => serviceCaseId);
}

function intersectIdSets(left: string[] | null, right: string[] | null) {
  if (left == null) return right;
  if (right == null) return left;
  const rightSet = new Set(right);
  return left.filter((id) => rightSet.has(id));
}

function applyCaseFilters(query: any, filters: ServiceCaseContinuityFilters, eligibleCaseIds: string[] | null) {
  if (filters.caseStatus && filters.caseStatus !== "open") query = query.eq("status", filters.caseStatus);
  if (filters.caseKind) query = query.eq("case_kind", filters.caseKind);

  if (eligibleCaseIds) {
    query = eligibleCaseIds.length ? query.in("id", eligibleCaseIds) : query.in("id", ["00000000-0000-0000-0000-000000000000"]);
  }

  const dateColumn = filters.dateField === "resolved" ? "resolved_at" : "created_at";
  if (filters.fromDate) query = query.gte(dateColumn, laDateToUtcMidnightIso(filters.fromDate));
  if (filters.toDate) query = query.lt(dateColumn, laDateToUtcMidnightIso(addOneDay(filters.toDate)));

  if (filters.sort === "created_asc") {
    query = query.order("created_at", { ascending: true });
  } else if (filters.sort === "resolved_desc") {
    query = query.order("resolved_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  return query;
}

export function parseServiceCaseContinuityFilters(source: FilterSource): ServiceCaseContinuityFilters {
  return {
    caseStatus: normalizeChoice(
      readParam(source, "case_status"),
      [{ value: "" }, ...SERVICE_CASE_CONTINUITY_STATUS_OPTIONS],
      "",
    ),
    caseKind: normalizeChoice(
      readParam(source, "case_kind"),
      [{ value: "" }, ...SERVICE_CASE_CONTINUITY_KIND_OPTIONS],
      "",
    ),
    contractorId: String(readParam(source, "contractor") ?? "").trim(),
    dateField: normalizeChoice(
      readParam(source, "date_field"),
      SERVICE_CASE_CONTINUITY_DATE_FIELD_OPTIONS,
      "created",
    ) as ServiceCaseContinuityDateField,
    fromDate: normalizeYmd(readParam(source, "from")),
    toDate: normalizeYmd(readParam(source, "to")),
    repeatOnly: String(readParam(source, "repeat_only") ?? "").trim() === "1",
    sort: normalizeChoice(
      readParam(source, "sort"),
      SERVICE_CASE_CONTINUITY_SORT_OPTIONS,
      "created_desc",
    ) as ServiceCaseContinuitySort,
  };
}

export function buildServiceCaseContinuitySearchParams(filters: ServiceCaseContinuityFilters) {
  const searchParams = new URLSearchParams();
  if (filters.caseStatus) searchParams.set("case_status", filters.caseStatus);
  if (filters.caseKind) searchParams.set("case_kind", filters.caseKind);
  if (filters.contractorId) searchParams.set("contractor", filters.contractorId);
  if (filters.dateField !== "created") searchParams.set("date_field", filters.dateField);
  if (filters.fromDate) searchParams.set("from", filters.fromDate);
  if (filters.toDate) searchParams.set("to", filters.toDate);
  if (filters.repeatOnly) searchParams.set("repeat_only", "1");
  if (filters.sort !== "created_desc") searchParams.set("sort", filters.sort);
  return searchParams;
}

export async function getServiceCaseContinuityFilterOptions(params: {
  supabase: any;
}): Promise<ServiceCaseContinuityFilterOptions> {
  const { data, error } = await params.supabase
    .from("contractors")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) throw error;

  return {
    contractors: (data ?? [])
      .map((row: any) => ({ id: String(row?.id ?? "").trim(), name: String(row?.name ?? "").trim() }))
      .filter((row: { id: string; name: string }) => row.id && row.name),
  };
}

export async function listServiceCaseContinuityRows(params: {
  supabase: any;
  accountOwnerUserId: string;
  filters: ServiceCaseContinuityFilters;
  internalBusinessDisplayName: string;
  limit?: number;
  includeCount?: boolean;
}): Promise<ServiceCaseContinuityResult> {
  const limit = params.limit ?? SERVICE_CASE_CONTINUITY_PAGE_LIMIT;
  const accountCustomerIds = await resolveReportAccountCustomerIds({
    supabase: params.supabase,
    accountOwnerUserId: params.accountOwnerUserId,
  });
  if (accountCustomerIds.length === 0) {
    return { rows: [], totalCount: 0, truncated: false };
  }
  const [contractorCaseIds, repeatCaseIds] = await Promise.all([
    resolveCaseIdsForContractor({
      supabase: params.supabase,
      contractorId: params.filters.contractorId,
    }),
    params.filters.repeatOnly
      ? resolveRepeatCaseIds({
          supabase: params.supabase,
          contractorId: params.filters.contractorId,
        })
      : Promise.resolve(null),
  ]);
  const eligibleCaseIds = intersectIdSets(contractorCaseIds, repeatCaseIds);

  if (eligibleCaseIds && eligibleCaseIds.length === 0) {
    return { rows: [], totalCount: 0, truncated: false };
  }

  let query = params.supabase
    .from("service_cases")
    .select(SERVICE_CASE_BASE_SELECT, params.includeCount === false ? undefined : { count: "exact" })
    .in("customer_id", accountScopeInList(accountCustomerIds));

  query = applyCaseFilters(query, params.filters, eligibleCaseIds);
  query = query.limit(limit);

  const { data, error, count } = await query;
  if (error) throw error;

  const serviceCases = (data ?? []) as LedgerServiceCaseRow[];
  const serviceCaseIds = serviceCases.map((row) => String(row.id ?? "")).filter(Boolean);

  const [customerResult, locationResult, linkedJobsResult] = await Promise.all([
    params.supabase
      .from("customers")
      .select("id, full_name, first_name, last_name")
      .in("id", serviceCases.map((row) => row.customer_id).filter(Boolean)),
    params.supabase
      .from("locations")
      .select("id, address_line1, city, state, zip")
      .in("id", serviceCases.map((row) => row.location_id).filter(Boolean)),
    serviceCaseIds.length
      ? params.supabase
          .from("jobs")
          .select(LINKED_JOB_SELECT)
          .in("service_case_id", serviceCaseIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  if (customerResult.error) throw customerResult.error;
  if (locationResult.error) throw locationResult.error;
  if (linkedJobsResult.error) throw linkedJobsResult.error;

  const customersById = new Map<string, LedgerCustomerRow>(
    (customerResult.data ?? []).map((row: any) => [String(row?.id ?? ""), row as LedgerCustomerRow]),
  );
  const locationsById = new Map<string, LedgerLocationRow>(
    (locationResult.data ?? []).map((row: any) => [String(row?.id ?? ""), row as LedgerLocationRow]),
  );

  const linkedJobs = (linkedJobsResult.data ?? []) as LinkedJobRow[];
  const linkedJobsByCaseId = new Map<string, LinkedJobRow[]>();
  for (const job of linkedJobs) {
    const serviceCaseId = String(job.service_case_id ?? "").trim();
    if (!serviceCaseId) continue;
    const existing = linkedJobsByCaseId.get(serviceCaseId) ?? [];
    existing.push(job);
    linkedJobsByCaseId.set(serviceCaseId, existing);
  }

  const resolvedJobIds = Array.from(
    new Set(
      serviceCases
        .map((row) => String(row.resolved_by_job_id ?? "").trim())
        .filter(Boolean),
    ),
  );

  const assignmentMap = await getActiveJobAssignmentDisplayMap({
    supabase: params.supabase,
    jobIds: linkedJobs.map((job) => String(job.id ?? "")).filter(Boolean),
  });

  const resolvedJobLookup = new Map<string, string>();
  for (const job of linkedJobs) {
    const id = String(job.id ?? "").trim();
    if (id) resolvedJobLookup.set(id, id);
  }
  if (resolvedJobIds.some((id) => !resolvedJobLookup.has(id))) {
    const { data: resolvedJobs, error: resolvedJobsError } = await params.supabase
      .from("jobs")
      .select("id")
      .in("id", resolvedJobIds.filter((id) => !resolvedJobLookup.has(id)));

    if (resolvedJobsError) throw resolvedJobsError;
    for (const row of resolvedJobs ?? []) {
      const id = String((row as any)?.id ?? "").trim();
      if (id) resolvedJobLookup.set(id, id);
    }
  }

  const unsortedRows: Array<ServiceCaseContinuityRow & { isEffectivelyOpen: boolean }> = serviceCases.map((serviceCase) => {
    const serviceCaseId = String(serviceCase.id ?? "");
    const linked = [...(linkedJobsByCaseId.get(serviceCaseId) ?? [])].sort((left, right) => {
      const leftMs = left.created_at ? new Date(left.created_at).getTime() : 0;
      const rightMs = right.created_at ? new Date(right.created_at).getTime() : 0;
      return rightMs - leftMs;
    });

    const latestJob = linked[0] ?? null;
    const customer = customersById.get(String(serviceCase.customer_id ?? ""));
    const location = locationsById.get(String(serviceCase.location_id ?? ""));
    const activeLinkedVisitCount = countActiveLinkedJobs(linked);
    const isEffectivelyOpen = isServiceCaseEffectivelyOpen({
      storedStatus: serviceCase.status,
      linkedJobs: linked,
    });
    const latestAssigneeDisplay = latestJob ? assignmentMap[String(latestJob.id ?? "")]?.[0]?.display_name ?? "-" : "-";
    const latestContractorDisplay = latestJob
      ? String(latestJob.contractors?.name ?? "").trim() || params.internalBusinessDisplayName
      : "-";
    const customerDisplay =
      String(customer?.full_name ?? "").trim() ||
      `${String(customer?.first_name ?? "").trim()} ${String(customer?.last_name ?? "").trim()}`.trim() ||
      "-";
    const locationDisplay = [
      String(location?.address_line1 ?? "").trim(),
      [
        String(location?.city ?? "").trim(),
        String(location?.state ?? "").trim(),
        String(location?.zip ?? "").trim(),
      ].filter(Boolean).join(" "),
    ].filter(Boolean).join(" • ") || "-";
    const resolvedByJobId = String(serviceCase.resolved_by_job_id ?? "").trim();

    return {
      serviceCaseId,
      serviceCaseHref: latestJob ? `/jobs/${String(latestJob.id)}?tab=ops` : "/reports/service-cases",
      serviceCaseReference: serviceCaseId.slice(0, 8),
      problemSummary: String(serviceCase.problem_summary ?? "").trim() || "-",
      caseKindLabel: formatCaseKindLabel(serviceCase.case_kind),
      caseStatusLabel: formatCaseStatusLabel(serviceCase.status),
      customerDisplay,
      locationDisplay,
      latestContractorDisplay,
      createdDateDisplay: displayDateLA(serviceCase.created_at) || "-",
      resolvedDateDisplay: displayDateLA(serviceCase.resolved_at) || "-",
      resolvedByJobReference: resolvedByJobId ? resolvedByJobId.slice(0, 8) : "-",
      resolvedByJobHref: resolvedByJobId ? `/jobs/${resolvedByJobId}?tab=ops` : null,
      visitCount: linked.length,
      latestVisitDateDisplay: getLatestVisitDateDisplay(latestJob),
      latestVisitOpsStatusLabel: formatOpsStatusLabel(latestJob?.ops_status),
      latestAssignedTechDisplay: latestAssigneeDisplay,
      activeLinkedVisitCount,
      isEffectivelyOpen,
    };
  });

  const rows = (params.filters.caseStatus === "open"
    ? unsortedRows.filter((row) => row.isEffectivelyOpen)
    : unsortedRows) as ServiceCaseContinuityRow[];

  if (params.filters.sort === "created_asc") {
    rows.sort((left, right) => left.createdDateDisplay.localeCompare(right.createdDateDisplay));
  } else if (params.filters.sort === "resolved_desc") {
    rows.sort((left, right) => right.resolvedDateDisplay.localeCompare(left.resolvedDateDisplay));
  }

  return {
    rows,
    totalCount: rows.length,
    truncated: params.includeCount === false ? false : Number(count ?? rows.length) > serviceCases.length,
  };
}

export function buildServiceCaseContinuityCsv(rows: ServiceCaseContinuityRow[]) {
  const headers = [
    "service_case_id",
    "service_case_reference",
    "problem_summary",
    "case_kind",
    "case_status",
    "customer",
    "location",
    "latest_contractor",
    "created_date",
    "resolved_date",
    "resolved_by_job_reference",
    "visit_count",
    "latest_visit",
    "latest_visit_ops_status",
    "latest_assigned_tech",
    "active_linked_visit_count",
  ];

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push([
      row.serviceCaseId,
      row.serviceCaseReference,
      row.problemSummary,
      row.caseKindLabel,
      row.caseStatusLabel,
      row.customerDisplay,
      row.locationDisplay,
      row.latestContractorDisplay,
      row.createdDateDisplay,
      row.resolvedDateDisplay,
      row.resolvedByJobReference,
      String(row.visitCount),
      row.latestVisitDateDisplay,
      row.latestVisitOpsStatusLabel,
      row.latestAssignedTechDisplay,
      String(row.activeLinkedVisitCount),
    ].map((value) => csvEscape(String(value))).join(","));
  }
  return lines.join("\r\n");
}