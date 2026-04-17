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

export const CLOSEOUT_FOLLOW_UP_LEDGER_PAGE_LIMIT = 300;
export const CLOSEOUT_FOLLOW_UP_LEDGER_EXPORT_LIMIT = 5000;

export const CLOSEOUT_FOLLOW_UP_LEDGER_DATE_FIELD_OPTIONS = [
  { value: "field_complete", label: "Field complete date" },
  { value: "follow_up", label: "Follow-up date" },
  { value: "scheduled", label: "Scheduled date" },
  { value: "created", label: "Created date" },
] as const;

export const CLOSEOUT_FOLLOW_UP_LEDGER_SCOPE_OPTIONS = [
  { value: "active", label: "Active backlog" },
  { value: "historical", label: "Historical" },
  { value: "all", label: "All" },
] as const;

export const CLOSEOUT_FOLLOW_UP_LEDGER_SORT_OPTIONS = [
  { value: "aging_desc", label: "Aging longest first" },
  { value: "field_complete_desc", label: "Field complete newest first" },
  { value: "field_complete_asc", label: "Field complete oldest first" },
  { value: "follow_up_asc", label: "Follow-up earliest first" },
  { value: "created_desc", label: "Created newest first" },
] as const;

export const CLOSEOUT_FOLLOW_UP_LEDGER_OPS_STATUS_OPTIONS = [
  { value: "pending_info", label: "Pending Info" },
  { value: "on_hold", label: "On Hold" },
  { value: "failed", label: "Failed" },
  { value: "pending_office_review", label: "Pending Office Review" },
  { value: "retest_needed", label: "Retest Needed" },
  { value: "paperwork_required", label: "Paperwork Required" },
  { value: "invoice_required", label: "Invoice Required" },
  { value: "closed", label: "Closed" },
] as const;

type FilterSource = URLSearchParams | Record<string, string | string[] | undefined>;

export type CloseoutFollowUpLedgerDateField = (typeof CLOSEOUT_FOLLOW_UP_LEDGER_DATE_FIELD_OPTIONS)[number]["value"];
export type CloseoutFollowUpLedgerScope = (typeof CLOSEOUT_FOLLOW_UP_LEDGER_SCOPE_OPTIONS)[number]["value"];
export type CloseoutFollowUpLedgerSort = (typeof CLOSEOUT_FOLLOW_UP_LEDGER_SORT_OPTIONS)[number]["value"];

export type CloseoutFollowUpLedgerFilters = {
  paperworkOnly: boolean;
  invoiceOnly: boolean;
  closeoutOnly: boolean;
  opsStatus: string;
  contractorId: string;
  assigneeUserId: string;
  dateField: CloseoutFollowUpLedgerDateField;
  fromDate: string;
  toDate: string;
  scope: CloseoutFollowUpLedgerScope;
  sort: CloseoutFollowUpLedgerSort;
};

export type CloseoutFollowUpLedgerFilterOptions = {
  contractors: Array<{ id: string; name: string }>;
  assignees: Array<Pick<AssignableInternalUser, "user_id" | "display_name">>;
};

export type CloseoutFollowUpLedgerRow = {
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
  scheduledDateDisplay: string;
  fieldCompleteDateDisplay: string;
  followUpDateDisplay: string;
  actionRequiredByLabel: string;
  nextActionPreview: string;
  paperworkRequired: boolean;
  invoiceRequired: boolean;
  closeoutQueue: boolean;
  agingDays: number | null;
};

export type CloseoutFollowUpLedgerResult = {
  rows: CloseoutFollowUpLedgerRow[];
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

const CLOSEOUT_BLOCKED_STATUSES = '("pending_info","pending_office_review","failed","retest_needed","on_hold")';
const CLOSEOUT_EXCLUDED_STATUSES = '("pending_info","pending_office_review","failed","retest_needed","on_hold","closed")';
const CERT_BLOCKED_STATUSES = '("failed","retest_needed","pending_office_review")';

const JOB_BASE_SELECT =
  "id, title, visit_scope_summary, job_type, status, ops_status, service_case_id, created_at, scheduled_date, field_complete, field_complete_at, invoice_complete, certs_complete, contractor_id, contractors(name), customer_id, location_id, customer_first_name, customer_last_name, job_address, city, follow_up_date, next_action_note, action_required_by";

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

function formatActionRequiredBy(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "-";
  if (normalized === "rater") return "Rater";
  if (normalized === "contractor") return "Contractor";
  if (normalized === "customer") return "Customer";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function truncateText(value?: string | null, maxLength = 72) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function csvEscape(value: string) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseCheckbox(source: FilterSource, key: string) {
  return String(readParam(source, key) ?? "").trim() === "1";
}

function getAgingDays(fieldCompleteAt?: string | null) {
  if (!fieldCompleteAt) return null;
  const completeAtMs = Date.parse(fieldCompleteAt);
  if (!Number.isFinite(completeAtMs)) return null;
  const elapsedMs = Date.now() - completeAtMs;
  if (elapsedMs < 0) return 0;
  return Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
}

async function resolveAssignedJobIds(params: {
  supabase: any;
  assigneeUserId: string;
}): Promise<string[] | null> {
  const assigneeUserId = String(params.assigneeUserId ?? "").trim();
  if (!assigneeUserId) return null;

  const { data, error } = await params.supabase
    .from("job_assignments")
    .select("job_id")
    .eq("user_id", assigneeUserId)
    .eq("is_active", true);

  if (error) throw error;

  return Array.from<string>(
    new Set(
      (data ?? [])
        .map((row: any) => String(row?.job_id ?? "").trim())
        .filter(Boolean),
    ),
  );
}

function applyLedgerFilters(query: any, filters: CloseoutFollowUpLedgerFilters, assignedJobIds: string[] | null) {
  query = query.eq("field_complete", true);

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

  if (assignedJobIds) {
    query = query.in("id", assignedJobIds);
  }

  if (filters.paperworkOnly) {
    query = query
      .eq("job_type", "ecc")
      .eq("certs_complete", false)
      .not("ops_status", "in", CERT_BLOCKED_STATUSES);
  }

  if (filters.invoiceOnly) {
    query = query.eq("invoice_complete", false);
  }

  if (filters.closeoutOnly) {
    query = query
      .not("ops_status", "in", CLOSEOUT_EXCLUDED_STATUSES)
      .or("invoice_complete.eq.false,and(job_type.eq.ecc,certs_complete.eq.false)");
  }

  if (filters.dateField === "scheduled") {
    if (filters.fromDate) query = query.gte("scheduled_date", filters.fromDate);
    if (filters.toDate) query = query.lte("scheduled_date", filters.toDate);
  } else if (filters.dateField === "follow_up") {
    if (filters.fromDate) query = query.gte("follow_up_date", filters.fromDate);
    if (filters.toDate) query = query.lte("follow_up_date", filters.toDate);
  } else {
    const column = filters.dateField === "field_complete" ? "field_complete_at" : "created_at";
    if (filters.fromDate) query = query.gte(column, laDateToUtcMidnightIso(filters.fromDate));
    if (filters.toDate) query = query.lt(column, laDateToUtcMidnightIso(addOneDay(filters.toDate)));
  }

  if (filters.sort === "field_complete_desc") {
    query = query.order("field_complete_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  } else if (filters.sort === "field_complete_asc") {
    query = query.order("field_complete_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
  } else if (filters.sort === "follow_up_asc") {
    query = query.order("follow_up_date", { ascending: true, nullsFirst: false }).order("field_complete_at", { ascending: true, nullsFirst: false });
  } else if (filters.sort === "created_desc") {
    query = query.order("created_at", { ascending: false });
  } else {
    query = query.order("field_complete_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
  }

  return query;
}

export function parseCloseoutFollowUpLedgerFilters(source: FilterSource): CloseoutFollowUpLedgerFilters {
  return {
    paperworkOnly: parseCheckbox(source, "paperwork_only"),
    invoiceOnly: parseCheckbox(source, "invoice_only"),
    closeoutOnly: parseCheckbox(source, "closeout_only"),
    opsStatus: normalizeChoice(
      readParam(source, "ops_status"),
      [{ value: "" }, ...CLOSEOUT_FOLLOW_UP_LEDGER_OPS_STATUS_OPTIONS],
      "",
    ),
    contractorId: String(readParam(source, "contractor") ?? "").trim(),
    assigneeUserId: String(readParam(source, "assignee") ?? "").trim(),
    dateField: normalizeChoice(
      readParam(source, "date_field"),
      CLOSEOUT_FOLLOW_UP_LEDGER_DATE_FIELD_OPTIONS,
      "field_complete",
    ) as CloseoutFollowUpLedgerDateField,
    fromDate: normalizeYmd(readParam(source, "from")),
    toDate: normalizeYmd(readParam(source, "to")),
    scope: normalizeChoice(
      readParam(source, "scope"),
      CLOSEOUT_FOLLOW_UP_LEDGER_SCOPE_OPTIONS,
      "active",
    ) as CloseoutFollowUpLedgerScope,
    sort: normalizeChoice(
      readParam(source, "sort"),
      CLOSEOUT_FOLLOW_UP_LEDGER_SORT_OPTIONS,
      "aging_desc",
    ) as CloseoutFollowUpLedgerSort,
  };
}

export function buildCloseoutFollowUpLedgerSearchParams(filters: CloseoutFollowUpLedgerFilters) {
  const searchParams = new URLSearchParams();

  if (filters.paperworkOnly) searchParams.set("paperwork_only", "1");
  if (filters.invoiceOnly) searchParams.set("invoice_only", "1");
  if (filters.closeoutOnly) searchParams.set("closeout_only", "1");
  if (filters.opsStatus) searchParams.set("ops_status", filters.opsStatus);
  if (filters.contractorId) searchParams.set("contractor", filters.contractorId);
  if (filters.assigneeUserId) searchParams.set("assignee", filters.assigneeUserId);
  if (filters.dateField !== "field_complete") searchParams.set("date_field", filters.dateField);
  if (filters.fromDate) searchParams.set("from", filters.fromDate);
  if (filters.toDate) searchParams.set("to", filters.toDate);
  if (filters.scope !== "active") searchParams.set("scope", filters.scope);
  if (filters.sort !== "aging_desc") searchParams.set("sort", filters.sort);

  return searchParams;
}

export async function getCloseoutFollowUpLedgerFilterOptions(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<CloseoutFollowUpLedgerFilterOptions> {
  const [contractorResult, assignableUsers] = await Promise.all([
    params.supabase.from("contractors").select("id, name").order("name", { ascending: true }),
    getAssignableInternalUsers({
      supabase: params.supabase,
      accountOwnerUserId: params.accountOwnerUserId,
    }),
  ]);

  if (contractorResult.error) throw contractorResult.error;

  return {
    contractors: (contractorResult.data ?? [])
      .map((row: any) => ({
        id: String(row?.id ?? "").trim(),
        name: String(row?.name ?? "").trim(),
      }))
      .filter((row: { id: string; name: string }) => row.id && row.name),
    assignees: assignableUsers.map((user) => ({
      user_id: user.user_id,
      display_name: user.display_name,
    })),
  };
}

export async function listCloseoutFollowUpLedgerRows(params: {
  supabase: any;
  filters: CloseoutFollowUpLedgerFilters;
  internalBusinessDisplayName: string;
  limit?: number;
  includeCount?: boolean;
}): Promise<CloseoutFollowUpLedgerResult> {
  const limit = params.limit ?? CLOSEOUT_FOLLOW_UP_LEDGER_PAGE_LIMIT;
  const assignedJobIds = await resolveAssignedJobIds({
    supabase: params.supabase,
    assigneeUserId: params.filters.assigneeUserId,
  });

  if (assignedJobIds && assignedJobIds.length === 0) {
    return { rows: [], totalCount: 0, truncated: false };
  }

  let query = params.supabase
    .from("jobs")
    .select(JOB_BASE_SELECT, params.includeCount === false ? undefined : { count: "exact" })
    .is("deleted_at", null);

  query = applyLedgerFilters(query, params.filters, assignedJobIds);
  query = query.limit(limit);

  const { data, error, count } = await query;
  if (error) throw error;

  const jobs = data ?? [];
  const customerIds = Array.from(new Set(jobs.map((job: any) => String(job?.customer_id ?? "").trim()).filter(Boolean)));
  const locationIds = Array.from(new Set(jobs.map((job: any) => String(job?.location_id ?? "").trim()).filter(Boolean)));

  const [customerResult, locationResult, assignmentMap] = await Promise.all([
    customerIds.length
      ? params.supabase.from("customers").select("id, full_name, first_name, last_name").in("id", customerIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    locationIds.length
      ? params.supabase.from("locations").select("id, address_line1, city, state, zip").in("id", locationIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    getActiveJobAssignmentDisplayMap({
      supabase: params.supabase,
      jobIds: jobs.map((job: any) => String(job?.id ?? "")).filter(Boolean),
    }),
  ]);

  if (customerResult.error) throw customerResult.error;
  if (locationResult.error) throw locationResult.error;

  const customersById = new Map<string, LedgerCustomerRow>((customerResult.data ?? []).map((row: any) => [String(row?.id ?? ""), row as LedgerCustomerRow]));
  const locationsById = new Map<string, LedgerLocationRow>((locationResult.data ?? []).map((row: any) => [String(row?.id ?? ""), row as LedgerLocationRow]));

  const rows: CloseoutFollowUpLedgerRow[] = jobs.map((job: any) => {
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
    const locationDisplay =
      [
        String(location?.address_line1 ?? "").trim() || String(job?.job_address ?? "").trim(),
        [
          String(location?.city ?? "").trim() || String(job?.city ?? "").trim(),
          String(location?.state ?? "").trim(),
          String(location?.zip ?? "").trim(),
        ]
          .filter(Boolean)
          .join(" "),
      ]
        .filter(Boolean)
        .join(" • ") || "-";
    const contractorDisplay = String(job?.contractors?.name ?? "").trim() || params.internalBusinessDisplayName;
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
      scheduledDateDisplay: formatBusinessDateUS(job?.scheduled_date) || "-",
      fieldCompleteDateDisplay: displayDateLA(job?.field_complete_at) || "-",
      followUpDateDisplay: formatBusinessDateUS(job?.follow_up_date) || "-",
      actionRequiredByLabel: formatActionRequiredBy(job?.action_required_by),
      nextActionPreview: truncateText(job?.next_action_note) || "-",
      paperworkRequired: closeoutNeeds.needsCerts,
      invoiceRequired: closeoutNeeds.needsInvoice,
      closeoutQueue: isInCloseoutQueue(job),
      agingDays: getAgingDays(job?.field_complete_at),
    };
  });

  const totalCount = params.includeCount === false ? rows.length : Number(count ?? rows.length);
  return {
    rows,
    totalCount,
    truncated: totalCount > rows.length,
  };
}

export function buildCloseoutFollowUpLedgerCsv(rows: CloseoutFollowUpLedgerRow[]) {
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
    "scheduled_date",
    "field_complete_date",
    "follow_up_date",
    "action_required_by",
    "next_action",
    "paperwork_required",
    "invoice_required",
    "closeout_queue",
    "aging_days",
  ];

  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push(
      [
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
        row.scheduledDateDisplay,
        row.fieldCompleteDateDisplay,
        row.followUpDateDisplay,
        row.actionRequiredByLabel,
        row.nextActionPreview,
        row.paperworkRequired ? "Yes" : "No",
        row.invoiceRequired ? "Yes" : "No",
        row.closeoutQueue ? "Yes" : "No",
        row.agingDays == null ? "" : String(row.agingDays),
      ]
        .map((value) => csvEscape(String(value)))
        .join(","),
    );
  }

  return lines.join("\r\n");
}