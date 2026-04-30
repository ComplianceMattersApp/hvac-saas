import {
  getActiveJobAssignmentDisplayMap,
  getAssignableInternalUsers,
  type AssignableInternalUser,
} from "@/lib/staffing/human-layer";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import {
  displayDateLA,
  formatBusinessDateUS,
  laDateToUtcMidnightIso,
} from "@/lib/utils/schedule-la";
import { getCloseoutNeeds, isInCloseoutQueue } from "@/lib/utils/closeout";
import {
  accountScopeInList,
  resolveReportAccountCustomerIds,
  resolveReportAccountContractorIds,
} from "@/lib/reports/report-account-scope";

export const JOB_VISIT_LEDGER_PAGE_LIMIT = 300;
export const JOB_VISIT_LEDGER_EXPORT_LIMIT = 5000;

export const JOB_VISIT_LEDGER_DATE_FIELD_OPTIONS = [
  { value: "created", label: "Created date" },
  { value: "scheduled", label: "Scheduled date" },
  { value: "completed", label: "Completed date" },
] as const;

export const JOB_VISIT_LEDGER_SCOPE_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "historical", label: "Historical" },
  { value: "all", label: "All" },
] as const;

export const JOB_VISIT_LEDGER_SORT_OPTIONS = [
  { value: "created_desc", label: "Created newest first" },
  { value: "created_asc", label: "Created oldest first" },
  { value: "scheduled_desc", label: "Scheduled latest first" },
  { value: "scheduled_asc", label: "Scheduled earliest first" },
  { value: "completed_desc", label: "Completed newest first" },
] as const;

export const JOB_VISIT_LEDGER_OPS_STATUS_OPTIONS = [
  { value: "need_to_schedule", label: "Need to Schedule" },
  { value: "scheduled", label: "Scheduled" },
  { value: "pending_info", label: "Pending Info" },
  { value: "on_hold", label: "On Hold" },
  { value: "failed", label: "Failed" },
  { value: "pending_office_review", label: "Pending Office Review" },
  { value: "retest_needed", label: "Retest Needed" },
  { value: "paperwork_required", label: "Paperwork Required" },
  { value: "invoice_required", label: "Invoice Required" },
  { value: "closed", label: "Closed" },
] as const;

export const JOB_VISIT_LEDGER_JOB_TYPE_OPTIONS = [
  { value: "ecc", label: "ECC" },
  { value: "service", label: "Service" },
] as const;

type FilterSource = URLSearchParams | Record<string, string | string[] | undefined>;

export type JobVisitLedgerDateField = (typeof JOB_VISIT_LEDGER_DATE_FIELD_OPTIONS)[number]["value"];
export type JobVisitLedgerScope = (typeof JOB_VISIT_LEDGER_SCOPE_OPTIONS)[number]["value"];
export type JobVisitLedgerSort = (typeof JOB_VISIT_LEDGER_SORT_OPTIONS)[number]["value"];

export type JobVisitLedgerFilters = {
  dateField: JobVisitLedgerDateField;
  fromDate: string;
  toDate: string;
  opsStatus: string;
  contractorId: string;
  assigneeUserId: string;
  jobType: string;
  scope: JobVisitLedgerScope;
  sort: JobVisitLedgerSort;
};

export type JobVisitLedgerFilterOptions = {
  contractors: Array<{ id: string; name: string }>;
  assignees: Array<Pick<AssignableInternalUser, "user_id" | "display_name">>;
};

export type JobVisitLedgerRow = {
  jobId: string;
  jobHref: string;
  jobReference: string;
  displayTitle: string;
  visitReason: string;
  jobTypeLabel: string;
  customerDisplay: string;
  locationDisplay: string;
  contractorDisplay: string;
  primaryAssigneeDisplay: string;
  opsStatusLabel: string;
  lifecycleStatusLabel: string;
  serviceCaseReference: string;
  createdDateDisplay: string;
  scheduledDateDisplay: string;
  completedDateDisplay: string;
  paperworkRequired: boolean;
  invoiceRequired: boolean;
  closeoutQueue: boolean;
};

export type JobVisitLedgerResult = {
  rows: JobVisitLedgerRow[];
  totalCount: number;
  truncated: boolean;
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

const JOB_BASE_SELECT =
  "id, title, visit_scope_summary, job_type, status, ops_status, service_case_id, created_at, scheduled_date, field_complete, field_complete_at, invoice_complete, certs_complete, contractor_id, contractors(name), customer_id, location_id, customer_first_name, customer_last_name, job_address, city";

function readParam(source: FilterSource, key: string) {
  if (source instanceof URLSearchParams) {
    return source.get(key) ?? undefined;
  }

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

function formatOpsStatusLabel(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "-";

  const labelMap: Record<string, string> = {
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

  return labelMap[normalized] ?? normalized.replace(/_/g, " ");
}

function formatLifecycleStatusLabel(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "-";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatJobTypeLabel(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "-";

  if (normalized === "ecc") return "ECC";
  if (normalized === "service") return "Service";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function csvEscape(value: string) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

type AssignmentFilter =
  | { mode: "include"; jobIds: string[] }
  | { mode: "unassigned"; assignedJobIds: string[] }
  | null;

type JobLedgerAccountScope = {
  contractorIds: string[];
  customerIds: string[];
};

function buildJobLedgerAccountScopeOrFilter(scope: JobLedgerAccountScope) {
  const contractorIds = accountScopeInList(scope.contractorIds).join(",");
  const customerIds = accountScopeInList(scope.customerIds).join(",");
  return `contractor_id.in.(${contractorIds}),and(contractor_id.is.null,customer_id.in.(${customerIds}))`;
}

function applyJobLedgerAccountScope(
  query: any,
  scope: JobLedgerAccountScope,
  filters: JobVisitLedgerFilters,
) {
  if (filters.contractorId) {
    return query.in("contractor_id", accountScopeInList(scope.contractorIds));
  }

  return query.or(buildJobLedgerAccountScopeOrFilter(scope));
}

async function resolveAssignmentFilter(params: {
  supabase: any;
  assigneeUserId: string;
}): Promise<AssignmentFilter> {
  const value = String(params.assigneeUserId ?? "").trim();
  if (!value) return null;

  if (value === "unassigned") {
    const { data, error } = await params.supabase
      .from("job_assignments")
      .select("job_id")
      .eq("is_active", true);
    if (error) throw error;
    const assignedJobIds = Array.from<string>(
      new Set(
        (data ?? [])
          .map((row: any) => String(row?.job_id ?? "").trim())
          .filter(Boolean),
      ),
    );
    return { mode: "unassigned", assignedJobIds };
  }

  const { data, error } = await params.supabase
    .from("job_assignments")
    .select("job_id")
    .eq("user_id", value)
    .eq("is_active", true);
  if (error) throw error;
  const jobIds = Array.from<string>(
    new Set(
      (data ?? [])
        .map((row: any) => String(row?.job_id ?? "").trim())
        .filter(Boolean),
    ),
  );
  return { mode: "include", jobIds };
}

function applyLedgerFilters(query: any, filters: JobVisitLedgerFilters, assignmentFilter: AssignmentFilter) {
  if (filters.scope === "active") {
    query = query.neq("status", "cancelled").neq("ops_status", "closed");
  } else if (filters.scope === "historical") {
    query = query.or("ops_status.eq.closed,status.eq.cancelled");
  }

  if (filters.opsStatus) {
    query = query.eq("ops_status", filters.opsStatus);
  }

  if (filters.contractorId) {
    query = query.eq("contractor_id", filters.contractorId);
  }

  if (filters.jobType) {
    query = query.eq("job_type", filters.jobType);
  }

  if (assignmentFilter?.mode === "include") {
    query = query.in("id", assignmentFilter.jobIds);
  } else if (assignmentFilter?.mode === "unassigned" && assignmentFilter.assignedJobIds.length > 0) {
    query = query.not("id", "in", `(${assignmentFilter.assignedJobIds.join(",")})`);
  }

  if (filters.dateField === "scheduled") {
    if (filters.fromDate) query = query.gte("scheduled_date", filters.fromDate);
    if (filters.toDate) query = query.lte("scheduled_date", filters.toDate);
  } else {
    const column = filters.dateField === "completed" ? "field_complete_at" : "created_at";
    if (filters.fromDate) query = query.gte(column, laDateToUtcMidnightIso(filters.fromDate));
    if (filters.toDate) query = query.lt(column, laDateToUtcMidnightIso(addOneDay(filters.toDate)));
  }

  if (filters.sort === "created_asc") {
    query = query.order("created_at", { ascending: true });
  } else if (filters.sort === "scheduled_desc") {
    query = query
      .order("scheduled_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else if (filters.sort === "scheduled_asc") {
    query = query
      .order("scheduled_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else if (filters.sort === "completed_desc") {
    query = query
      .order("field_complete_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  return query;
}

export function parseJobVisitLedgerFilters(source: FilterSource): JobVisitLedgerFilters {
  return {
    dateField: normalizeChoice(
      readParam(source, "date_field"),
      JOB_VISIT_LEDGER_DATE_FIELD_OPTIONS,
      "created",
    ) as JobVisitLedgerDateField,
    fromDate: normalizeYmd(readParam(source, "from")),
    toDate: normalizeYmd(readParam(source, "to")),
    opsStatus: normalizeChoice(
      readParam(source, "ops_status"),
      [{ value: "" }, ...JOB_VISIT_LEDGER_OPS_STATUS_OPTIONS],
      "",
    ),
    contractorId: String(readParam(source, "contractor") ?? "").trim(),
    assigneeUserId: String(readParam(source, "assignee") ?? "").trim(),
    jobType: normalizeChoice(
      readParam(source, "job_type"),
      [{ value: "" }, ...JOB_VISIT_LEDGER_JOB_TYPE_OPTIONS],
      "",
    ),
    scope: normalizeChoice(
      readParam(source, "scope"),
      JOB_VISIT_LEDGER_SCOPE_OPTIONS,
      "active",
    ) as JobVisitLedgerScope,
    sort: normalizeChoice(
      readParam(source, "sort"),
      JOB_VISIT_LEDGER_SORT_OPTIONS,
      "created_desc",
    ) as JobVisitLedgerSort,
  };
}

export function buildJobVisitLedgerSearchParams(filters: JobVisitLedgerFilters) {
  const searchParams = new URLSearchParams();

  if (filters.dateField !== "created") searchParams.set("date_field", filters.dateField);
  if (filters.fromDate) searchParams.set("from", filters.fromDate);
  if (filters.toDate) searchParams.set("to", filters.toDate);
  if (filters.opsStatus) searchParams.set("ops_status", filters.opsStatus);
  if (filters.contractorId) searchParams.set("contractor", filters.contractorId);
  if (filters.assigneeUserId) searchParams.set("assignee", filters.assigneeUserId);
  if (filters.jobType) searchParams.set("job_type", filters.jobType);
  if (filters.scope !== "active") searchParams.set("scope", filters.scope);
  if (filters.sort !== "created_desc") searchParams.set("sort", filters.sort);

  return searchParams;
}

export async function getJobVisitLedgerFilterOptions(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<JobVisitLedgerFilterOptions> {
  const [contractorResult, assignableUsers] = await Promise.all([
    params.supabase
      .from("contractors")
      .select("id, name")
      .order("name", { ascending: true }),
    getAssignableInternalUsers({
      supabase: params.supabase,
      accountOwnerUserId: params.accountOwnerUserId,
    }),
  ]);

  if (contractorResult.error) throw contractorResult.error;

  return {
    contractors: (contractorResult.data ?? []).map((row: any) => ({
      id: String(row?.id ?? "").trim(),
      name: String(row?.name ?? "").trim(),
    })).filter((row: { id: string; name: string }) => row.id && row.name),
    assignees: assignableUsers.map((user) => ({
      user_id: user.user_id,
      display_name: user.display_name,
    })),
  };
}

export async function listJobVisitLedgerRows(params: {
  supabase: any;
  accountOwnerUserId: string;
  filters: JobVisitLedgerFilters;
  internalBusinessDisplayName: string;
  limit?: number;
  includeCount?: boolean;
}): Promise<JobVisitLedgerResult> {
  const limit = params.limit ?? JOB_VISIT_LEDGER_PAGE_LIMIT;
  const [contractorIds, customerIds, assignmentFilter] = await Promise.all([
    resolveReportAccountContractorIds({
      supabase: params.supabase,
      accountOwnerUserId: params.accountOwnerUserId,
    }),
    resolveReportAccountCustomerIds({
      supabase: params.supabase,
      accountOwnerUserId: params.accountOwnerUserId,
    }),
    resolveAssignmentFilter({
      supabase: params.supabase,
      assigneeUserId: params.filters.assigneeUserId,
    }),
  ]);

  if (
    (params.filters.contractorId && contractorIds.length === 0) ||
    (!params.filters.contractorId && contractorIds.length === 0 && customerIds.length === 0)
  ) {
    return { rows: [], totalCount: 0, truncated: false };
  }

  // For specific-user filter with no matching assignments, there are no results
  if (assignmentFilter?.mode === "include" && assignmentFilter.jobIds.length === 0) {
    return { rows: [], totalCount: 0, truncated: false };
  }

  let query = params.supabase
    .from("jobs")
    .select(JOB_BASE_SELECT, params.includeCount === false ? undefined : { count: "exact" })
    .is("deleted_at", null);

  query = applyJobLedgerAccountScope(
    query,
    { contractorIds, customerIds },
    params.filters,
  );

  query = applyLedgerFilters(query, params.filters, assignmentFilter);
  query = query.limit(limit);

  const { data, error, count } = await query;
  if (error) throw error;

  const jobs = data ?? [];
  const customerLookupIds = Array.from(
    new Set(jobs.map((job: any) => String(job?.customer_id ?? "").trim()).filter(Boolean)),
  );
  const locationIds = Array.from(
    new Set(jobs.map((job: any) => String(job?.location_id ?? "").trim()).filter(Boolean)),
  );

  const [customerResult, locationResult, assignmentMap] = await Promise.all([
    customerLookupIds.length
      ? params.supabase
          .from("customers")
          .select("id, full_name, first_name, last_name")
        .in("id", customerLookupIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    locationIds.length
      ? params.supabase
          .from("locations")
          .select("id, address_line1, city, state, zip")
          .in("id", locationIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    getActiveJobAssignmentDisplayMap({
      supabase: params.supabase,
      jobIds: jobs.map((job: any) => String(job?.id ?? "")).filter(Boolean),
    }),
  ]);

  if (customerResult.error) throw customerResult.error;
  if (locationResult.error) throw locationResult.error;

  const customersById = new Map<string, LedgerCustomerRow>(
    (customerResult.data ?? []).map((row: any) => [String(row?.id ?? ""), row as LedgerCustomerRow]),
  );
  const locationsById = new Map<string, LedgerLocationRow>(
    (locationResult.data ?? []).map((row: any) => [String(row?.id ?? ""), row as LedgerLocationRow]),
  );

  const rows: JobVisitLedgerRow[] = jobs.map((job: any) => {
    const jobId = String(job?.id ?? "");
    const customer = customersById.get(String(job?.customer_id ?? ""));
    const location = locationsById.get(String(job?.location_id ?? ""));
    const visitReason = String(job?.visit_scope_summary ?? "").trim();
    const normalizedTitle = normalizeRetestLinkedJobTitle(job?.title) || visitReason || "Untitled Job";
    const customerDisplay =
      String(customer?.full_name ?? "").trim() ||
      `${String(customer?.first_name ?? "").trim()} ${String(customer?.last_name ?? "").trim()}`.trim() ||
      `${String(job?.customer_first_name ?? "").trim()} ${String(job?.customer_last_name ?? "").trim()}`.trim() ||
      "-";
    const locationDisplay = [
      String(location?.address_line1 ?? "").trim() || String(job?.job_address ?? "").trim(),
      [
        String(location?.city ?? "").trim() || String(job?.city ?? "").trim(),
        String(location?.state ?? "").trim(),
        String(location?.zip ?? "").trim(),
      ].filter(Boolean).join(" "),
    ].filter(Boolean).join(" • ") || "-";
    const contractorDisplay =
      String(job?.contractors?.name ?? "").trim() || params.internalBusinessDisplayName;
    const primaryAssigneeDisplay = assignmentMap[jobId]?.[0]?.display_name ?? "-";
    const closeoutNeeds = getCloseoutNeeds(job);

    return {
      jobId,
      jobHref: `/jobs/${jobId}?tab=ops`,
      jobReference: jobId.slice(0, 8),
      displayTitle: normalizedTitle,
      visitReason: visitReason && visitReason !== normalizedTitle ? visitReason : "",
      jobTypeLabel: formatJobTypeLabel(job?.job_type),
      customerDisplay,
      locationDisplay,
      contractorDisplay,
      primaryAssigneeDisplay,
      opsStatusLabel: formatOpsStatusLabel(job?.ops_status),
      lifecycleStatusLabel: formatLifecycleStatusLabel(job?.status),
      serviceCaseReference: String(job?.service_case_id ?? "").trim() || "-",
      createdDateDisplay: displayDateLA(job?.created_at) || "-",
      scheduledDateDisplay: formatBusinessDateUS(job?.scheduled_date) || "-",
      completedDateDisplay: displayDateLA(job?.field_complete_at) || "-",
      paperworkRequired: closeoutNeeds.needsCerts,
      invoiceRequired: closeoutNeeds.needsInvoice,
      closeoutQueue: isInCloseoutQueue(job),
    };
  });

  const totalCount = params.includeCount === false ? rows.length : Number(count ?? rows.length);
  return {
    rows,
    totalCount,
    truncated: totalCount > rows.length,
  };
}

export function buildJobVisitLedgerCsv(rows: JobVisitLedgerRow[]) {
  const headers = [
    "job_id",
    "job_reference",
    "job_title",
    "visit_reason",
    "job_type",
    "customer",
    "location",
    "contractor",
    "assigned_tech",
    "ops_status",
    "lifecycle_status",
    "service_case_reference",
    "created_date",
    "scheduled_date",
    "completed_date",
    "paperwork_required",
    "invoice_required",
    "closeout_queue",
  ];

  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push([
      row.jobId,
      row.jobReference,
      row.displayTitle,
      row.visitReason,
      row.jobTypeLabel,
      row.customerDisplay,
      row.locationDisplay,
      row.contractorDisplay,
      row.primaryAssigneeDisplay,
      row.opsStatusLabel,
      row.lifecycleStatusLabel,
      row.serviceCaseReference,
      row.createdDateDisplay,
      row.scheduledDateDisplay,
      row.completedDateDisplay,
      row.paperworkRequired ? "Yes" : "No",
      row.invoiceRequired ? "Yes" : "No",
      row.closeoutQueue ? "Yes" : "No",
    ].map((value) => csvEscape(String(value))).join(","));
  }

  return lines.join("\r\n");
}