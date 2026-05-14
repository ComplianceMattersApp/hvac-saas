import {
  sanitizeVisitScopeItems,
  sanitizeVisitScopeSummary,
  type VisitScopeItem,
} from "@/lib/jobs/visit-scope";

export const MAINTENANCE_AGREEMENT_SELECT = [
  "id",
  "account_owner_user_id",
  "customer_id",
  "primary_location_id",
  "preferred_technician_user_id",
  "agreement_name",
  "agreement_type",
  "frequency",
  "next_due_date",
  "default_visit_scope_summary",
  "default_visit_scope_items",
  "status",
  "start_date",
  "renewal_date",
  "internal_notes",
  "created_by_user_id",
  "updated_by_user_id",
  "created_at",
  "updated_at",
].join(", ");

export const MAINTENANCE_AGREEMENT_TYPES = [
  "maintenance",
  "service_plan",
  "inspection",
  "other",
] as const;

export const MAINTENANCE_AGREEMENT_FREQUENCIES = [
  "monthly",
  "quarterly",
  "semi_annual",
  "annual",
  "custom",
] as const;

export const MAINTENANCE_AGREEMENT_STATUSES = [
  "draft",
  "active",
  "paused",
  "expired",
  "cancelled",
] as const;

export type MaintenanceAgreementType = (typeof MAINTENANCE_AGREEMENT_TYPES)[number];
export type MaintenanceAgreementFrequency = (typeof MAINTENANCE_AGREEMENT_FREQUENCIES)[number];
export type MaintenanceAgreementStatus = (typeof MAINTENANCE_AGREEMENT_STATUSES)[number];
export type MaintenanceAgreementDueState = "overdue" | "due_today" | "upcoming" | "not_scheduled" | "inactive";

export type MaintenanceAgreementSummary = {
  as_of_date: string;
  total_count: number;
  status_counts: {
    active: number;
    draft: number;
    paused: number;
    expired: number;
    cancelled: number;
  };
  due_counts: {
    overdue: number;
    due_today: number;
    due_in_next_7_days: number;
    due_in_next_30_days: number;
    not_scheduled_active: number;
  };
};

export type MaintenanceAgreementRow = {
  id: string;
  account_owner_user_id: string;
  customer_id: string;
  primary_location_id: string | null;
  preferred_technician_user_id: string | null;
  agreement_name: string;
  agreement_type: MaintenanceAgreementType | string;
  frequency: MaintenanceAgreementFrequency | string;
  next_due_date: string | null;
  default_visit_scope_summary: string | null;
  default_visit_scope_items: unknown[];
  status: MaintenanceAgreementStatus | string;
  start_date: string;
  renewal_date: string | null;
  internal_notes: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type MaintenanceAgreementPlanningRow = MaintenanceAgreementRow & {
  due_state: MaintenanceAgreementDueState;
};

export type MaintenanceAgreementJobPrefill = {
  agreement_id: string;
  agreement_name: string;
  next_due_date: string | null;
  customer_id: string;
  primary_location_id: string | null;
  default_visit_scope_summary: string | null;
  default_visit_scope_items: VisitScopeItem[];
};

export type MaintenanceAgreementDrilldownFilter =
  | "all"
  | "active"
  | "overdue"
  | "due_today"
  | "due_1_7_days"
  | "due_8_30_days"
  | "not_scheduled"
  | "inactive";

export type MaintenanceAgreementDrilldownRow = {
  id: string;
  agreement_name: string;
  customer_id: string;
  customer_display_name: string;
  primary_location_display: string | null;
  status: string;
  agreement_type: string;
  frequency: string;
  next_due_date: string | null;
  due_state: MaintenanceAgreementDueState;
  visit_count_review: MaintenanceAgreementVisitCountReviewSummary;
};

export type MaintenanceAgreementDrilldownResult = {
  as_of_date: string;
  rows: MaintenanceAgreementDrilldownRow[];
};

export const MAINTENANCE_AGREEMENT_VISIT_LINK_SOURCES = [
  "service_plan_prefill",
  "manual",
  "system_future",
] as const;

export const MAINTENANCE_AGREEMENT_VISIT_COUNT_STATUSES = [
  "linked",
  "eligible",
  "counted",
  "excluded",
  "reversed",
] as const;

export type MaintenanceAgreementVisitLinkSource =
  (typeof MAINTENANCE_AGREEMENT_VISIT_LINK_SOURCES)[number];
export type MaintenanceAgreementVisitCountStatus =
  (typeof MAINTENANCE_AGREEMENT_VISIT_COUNT_STATUSES)[number];

export type MaintenanceAgreementVisitLinkRow = {
  id: string;
  account_owner_user_id: string;
  agreement_id: string;
  job_id: string;
  link_source: MaintenanceAgreementVisitLinkSource | string;
  count_status: MaintenanceAgreementVisitCountStatus | string;
  counts_toward_visit_balance: boolean;
  counted_at: string | null;
  counted_by_user_id: string | null;
  reversed_at: string | null;
  reversed_by_user_id: string | null;
  reversal_reason: string | null;
  created_at: string;
  created_by_user_id: string;
  updated_at: string;
  updated_by_user_id: string | null;
};

export type MaintenanceAgreementVisitLinkSummary = {
  total_links: number;
  linked_links: number;
  eligible_links: number;
  counted_links: number;
  excluded_links: number;
  reversed_links: number;
  used_visits: number;
};

export type MaintenanceAgreementVisitCountReviewLabel =
  | "linked"
  | "eligible_for_count_review"
  | "counted"
  | "excluded"
  | "reversed"
  | "not_eligible";

export type MaintenanceAgreementVisitCountReviewSummary = {
  total_links: number;
  linked_links: number;
  eligible_for_count_review_links: number;
  counted_links: number;
  excluded_links: number;
  reversed_links: number;
  not_eligible_links: number;
  used_visits: number;
};

export type MaintenanceAgreementSuggestedNextDueProjection = {
  suggested_next_due_date: string | null;
  manual_scheduling_required: boolean;
  seasonal_window_placeholder: string;
};

type SupabaseLike = {
  from(table: string): any;
};

type ListMaintenanceAgreementsParams = {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
};

type ListForCustomerParams = ListMaintenanceAgreementsParams & {
  customerId: string | null | undefined;
};

type ListForLocationParams = ListMaintenanceAgreementsParams & {
  locationId: string | null | undefined;
};

type ListUpcomingOverdueParams = ListMaintenanceAgreementsParams & {
  today?: string | null;
  horizonDate?: string | null;
  limit?: number | null;
};

type SummarizeMaintenanceAgreementsParams = ListMaintenanceAgreementsParams & {
  today?: string | null;
};

type DrilldownMaintenanceAgreementsParams = ListMaintenanceAgreementsParams & {
  today?: string | null;
  filter?: MaintenanceAgreementDrilldownFilter | string | null;
  limit?: number | null;
};

type ListMaintenanceAgreementVisitLinksForAgreementParams = ListMaintenanceAgreementsParams & {
  agreementId: string | null | undefined;
  limit?: number | null;
};

type ListMaintenanceAgreementVisitLinksForJobParams = ListMaintenanceAgreementsParams & {
  jobId: string | null | undefined;
  limit?: number | null;
};

type SummarizeMaintenanceAgreementVisitLinksParams = ListMaintenanceAgreementsParams & {
  agreementId: string | null | undefined;
};

function toCleanString(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function isValidYmd(value: string | null | undefined) {
  return /^\d{4}-\d{2}-\d{2}$/.test(toCleanString(value));
}

function normalizeLimit(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return 100;
  return Math.min(Math.max(Math.trunc(Number(value)), 1), 500);
}

function resolveAsOfDate(today: string | null | undefined) {
  if (isValidYmd(today)) return toCleanString(today);
  return new Date().toISOString().slice(0, 10);
}

function addDaysToYmd(ymd: string, days: number) {
  const date = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return ymd;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonthsToYmd(ymd: string, months: number) {
  if (!isValidYmd(ymd)) return ymd;

  const [yearText, monthText, dayText] = ymd.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return ymd;
  }

  const targetMonthAnchor = new Date(Date.UTC(year, month - 1, 1));
  targetMonthAnchor.setUTCMonth(targetMonthAnchor.getUTCMonth() + months);
  const targetYear = targetMonthAnchor.getUTCFullYear();
  const targetMonth = targetMonthAnchor.getUTCMonth();
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);
  const result = new Date(Date.UTC(targetYear, targetMonth, clampedDay));
  return result.toISOString().slice(0, 10);
}

function normalizeDrilldownFilter(
  value: MaintenanceAgreementDrilldownFilter | string | null | undefined,
): MaintenanceAgreementDrilldownFilter {
  const normalized = toCleanString(value).toLowerCase();
  if (normalized === "active") return "active";
  if (normalized === "overdue") return "overdue";
  if (normalized === "due_today") return "due_today";
  if (normalized === "due_1_7_days") return "due_1_7_days";
  if (normalized === "due_8_30_days") return "due_8_30_days";
  if (normalized === "not_scheduled") return "not_scheduled";
  if (normalized === "inactive") return "inactive";
  return "all";
}

function normalizeDrilldownLimit(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return 250;
  return Math.min(Math.max(Math.trunc(Number(value)), 1), 500);
}

function displayCustomerName(row: {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}) {
  const full = toCleanString(row.full_name);
  if (full) return full;

  const first = toCleanString(row.first_name);
  const last = toCleanString(row.last_name);
  const combined = [first, last].filter(Boolean).join(" ").trim();
  return combined || "Customer";
}

function displayLocation(row: {
  nickname?: string | null;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  postal_code?: string | null;
}) {
  const nickname = toCleanString(row.nickname);
  const address = toCleanString(row.address_line1);
  const cityStateZip = [row.city, row.state, row.zip ?? row.postal_code]
    .map((part) => toCleanString(part ?? null))
    .filter(Boolean)
    .join(" ");

  const base = nickname && address ? `${nickname} - ${address}` : nickname || address;
  if (base && cityStateZip) return `${base}, ${cityStateZip}`;
  if (base) return base;
  return cityStateZip || null;
}

function cleanUnknownString(value: unknown) {
  return typeof value === "string" ? toCleanString(value) : null;
}

function normalizePrefillDefaultVisitScopeItems(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((row) => {
      const record = (row ?? {}) as Record<string, unknown>;

      const normalizedTitle =
        cleanUnknownString(record.title)
        || cleanUnknownString(record.item_name)
        || cleanUnknownString(record.name)
        || cleanUnknownString(record.details)
        || cleanUnknownString(record.description)
        || cleanUnknownString(record.default_description);

      const normalizedDetails =
        cleanUnknownString(record.details)
        || cleanUnknownString(record.description)
        || cleanUnknownString(record.default_description);

      return {
        id: record.id,
        title: normalizedTitle,
        details: normalizedDetails,
        kind: record.kind,
        source_pricebook_item_id: record.source_pricebook_item_id ?? record.pricebook_item_id ?? null,
        expected_unit_price: record.expected_unit_price ?? record.default_unit_price ?? null,
        unit_label: record.unit_label,
        item_type: record.item_type,
        category: record.category,
        promoted_service_job_id: record.promoted_service_job_id,
        promoted_at: record.promoted_at,
        promoted_by_user_id: record.promoted_by_user_id,
      };
    })
    .filter((row) => toCleanString(row.title) || toCleanString(row.details));
}

function matchesDrilldownFilter(input: {
  filter: MaintenanceAgreementDrilldownFilter;
  dueState: MaintenanceAgreementDueState;
  status: string;
  nextDueDate: string | null;
  asOfDate: string;
}) {
  const status = toCleanString(input.status).toLowerCase();
  const nextDueDate = toCleanString(input.nextDueDate);
  const next7Date = addDaysToYmd(input.asOfDate, 7);
  const next30Date = addDaysToYmd(input.asOfDate, 30);

  if (input.filter === "all") return true;
  if (input.filter === "active") return status === "active";
  if (input.filter === "inactive") return status !== "active";
  if (input.filter === "overdue") return input.dueState === "overdue";
  if (input.filter === "due_today") return input.dueState === "due_today";
  if (input.filter === "not_scheduled") return input.dueState === "not_scheduled";

  if (input.filter === "due_1_7_days") {
    return (
      input.dueState === "upcoming" &&
      Boolean(nextDueDate) &&
      nextDueDate > input.asOfDate &&
      nextDueDate <= next7Date
    );
  }

  if (input.filter === "due_8_30_days") {
    return (
      input.dueState === "upcoming" &&
      Boolean(nextDueDate) &&
      nextDueDate > next7Date &&
      nextDueDate <= next30Date
    );
  }

  return true;
}

function createEmptyMaintenanceAgreementSummary(asOfDate: string): MaintenanceAgreementSummary {
  return {
    as_of_date: asOfDate,
    total_count: 0,
    status_counts: {
      active: 0,
      draft: 0,
      paused: 0,
      expired: 0,
      cancelled: 0,
    },
    due_counts: {
      overdue: 0,
      due_today: 0,
      due_in_next_7_days: 0,
      due_in_next_30_days: 0,
      not_scheduled_active: 0,
    },
  };
}

export function isMaintenanceAgreementType(value: string | null | undefined): value is MaintenanceAgreementType {
  return MAINTENANCE_AGREEMENT_TYPES.includes(toCleanString(value) as MaintenanceAgreementType);
}

export function isMaintenanceAgreementFrequency(value: string | null | undefined): value is MaintenanceAgreementFrequency {
  return MAINTENANCE_AGREEMENT_FREQUENCIES.includes(toCleanString(value) as MaintenanceAgreementFrequency);
}

export function isMaintenanceAgreementStatus(value: string | null | undefined): value is MaintenanceAgreementStatus {
  return MAINTENANCE_AGREEMENT_STATUSES.includes(toCleanString(value) as MaintenanceAgreementStatus);
}

export function classifyMaintenanceAgreementDueState(input: {
  status?: string | null;
  nextDueDate?: string | null;
  today?: string | null;
}): MaintenanceAgreementDueState {
  if (toCleanString(input.status).toLowerCase() !== "active") return "inactive";

  const nextDueDate = toCleanString(input.nextDueDate);
  if (!isValidYmd(nextDueDate)) return "not_scheduled";

  const today = isValidYmd(input.today) ? toCleanString(input.today) : new Date().toISOString().slice(0, 10);
  if (nextDueDate < today) return "overdue";
  if (nextDueDate === today) return "due_today";
  return "upcoming";
}

export function projectMaintenanceAgreementSuggestedNextDue(input: {
  frequency?: string | null;
  nextDueDate?: string | null;
  countedCompletionDate?: string | null;
}): MaintenanceAgreementSuggestedNextDueProjection {
  const seasonalWindowPlaceholder =
    "Seasonal window support planned for template-driven Service Plans.";

  const frequency = toCleanString(input.frequency).toLowerCase();
  const nextDueDate = toCleanString(input.nextDueDate);
  const countedCompletionDate = toCleanString(input.countedCompletionDate);

  const intervalMonths =
    frequency === "monthly"
      ? 1
      : frequency === "quarterly"
      ? 3
      : frequency === "semi_annual"
      ? 6
      : frequency === "annual"
      ? 12
      : null;

  if (frequency === "custom" || !isValidYmd(nextDueDate) || intervalMonths === null) {
    return {
      suggested_next_due_date: null,
      manual_scheduling_required: true,
      seasonal_window_placeholder: seasonalWindowPlaceholder,
    };
  }

  let suggested = addMonthsToYmd(nextDueDate, intervalMonths);
  if (isValidYmd(countedCompletionDate)) {
    let guard = 0;
    while (suggested <= countedCompletionDate && guard < 120) {
      suggested = addMonthsToYmd(suggested, intervalMonths);
      guard += 1;
    }
  }

  return {
    suggested_next_due_date: suggested,
    manual_scheduling_required: false,
    seasonal_window_placeholder: seasonalWindowPlaceholder,
  };
}

function normalizeAgreementRow(row: MaintenanceAgreementRow): MaintenanceAgreementRow {
  return {
    ...row,
    default_visit_scope_items: Array.isArray(row.default_visit_scope_items)
      ? row.default_visit_scope_items
      : [],
  };
}

function normalizeMaintenanceAgreementVisitLinkRow(
  row: MaintenanceAgreementVisitLinkRow,
): MaintenanceAgreementVisitLinkRow {
  return {
    ...row,
    counts_toward_visit_balance: Boolean(row.counts_toward_visit_balance),
  };
}

type MaintenanceAgreementVisitProjectionJob = {
  id?: string | null;
  status?: string | null;
  ops_status?: string | null;
  job_type?: string | null;
  field_complete?: boolean | null;
  service_visit_type?: string | null;
  service_visit_outcome?: string | null;
};

async function runAgreementQuery(query: any) {
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as MaintenanceAgreementRow[]).map(normalizeAgreementRow);
}

async function runMaintenanceAgreementVisitLinkQuery(query: any) {
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as MaintenanceAgreementVisitLinkRow[]).map(
    normalizeMaintenanceAgreementVisitLinkRow,
  );
}

function createEmptyMaintenanceAgreementVisitLinkSummary(): MaintenanceAgreementVisitLinkSummary {
  return {
    total_links: 0,
    linked_links: 0,
    eligible_links: 0,
    counted_links: 0,
    excluded_links: 0,
    reversed_links: 0,
    used_visits: 0,
  };
}

function createEmptyMaintenanceAgreementVisitCountReviewSummary(): MaintenanceAgreementVisitCountReviewSummary {
  return {
    total_links: 0,
    linked_links: 0,
    eligible_for_count_review_links: 0,
    counted_links: 0,
    excluded_links: 0,
    reversed_links: 0,
    not_eligible_links: 0,
    used_visits: 0,
  };
}

const DISQUALIFYING_JOB_STATUSES = new Set([
  "cancelled",
  "canceled",
  "failed",
  "no_show",
  "no-show",
  "duplicate",
  "incomplete",
]);

const DISQUALIFYING_OPS_STATUSES = new Set([
  "cancelled",
  "canceled",
  "failed",
  "no_show",
  "no-show",
  "duplicate",
  "incomplete",
  "pending_info",
  "on_hold",
  "retest_needed",
  "pending_office_review",
]);

const DISQUALIFYING_SERVICE_OUTCOMES = new Set([
  "cancelled",
  "canceled",
  "failed",
  "no_show",
  "no-show",
  "duplicate",
  "incomplete",
]);

export function projectMaintenanceAgreementVisitCountReview(input: {
  link: Pick<MaintenanceAgreementVisitLinkRow, "count_status" | "counts_toward_visit_balance">;
  job?: MaintenanceAgreementVisitProjectionJob | null;
}): MaintenanceAgreementVisitCountReviewLabel {
  const countStatus = toCleanString(input.link.count_status).toLowerCase();
  const countsTowardVisitBalance = Boolean(input.link.counts_toward_visit_balance);

  if (countStatus === "counted" && countsTowardVisitBalance) return "counted";
  if (countStatus === "excluded") return "excluded";
  if (countStatus === "reversed") return "reversed";

  if ((countStatus !== "linked" && countStatus !== "eligible") || countsTowardVisitBalance) {
    return "not_eligible";
  }

  const job = input.job;
  if (!job) return "linked";

  const jobType = toCleanString(job.job_type).toLowerCase();
  if (jobType !== "service") return "not_eligible";

  const serviceVisitType = toCleanString(job.service_visit_type).toLowerCase();
  if (serviceVisitType !== "maintenance") return "not_eligible";

  const status = toCleanString(job.status).toLowerCase();
  const opsStatus = toCleanString(job.ops_status).toLowerCase();
  const serviceOutcome = toCleanString(job.service_visit_outcome).toLowerCase();

  if (
    DISQUALIFYING_JOB_STATUSES.has(status) ||
    DISQUALIFYING_OPS_STATUSES.has(opsStatus) ||
    DISQUALIFYING_SERVICE_OUTCOMES.has(serviceOutcome)
  ) {
    return "not_eligible";
  }

  const fieldComplete = Boolean(job.field_complete) || status === "completed";
  return fieldComplete ? "eligible_for_count_review" : "linked";
}

function summarizeMaintenanceAgreementVisitCountReviewRows(
  links: MaintenanceAgreementVisitLinkRow[],
  jobsById: Map<string, MaintenanceAgreementVisitProjectionJob>,
): MaintenanceAgreementVisitCountReviewSummary {
  const summary = createEmptyMaintenanceAgreementVisitCountReviewSummary();
  summary.total_links = links.length;

  for (const link of links) {
    const label = projectMaintenanceAgreementVisitCountReview({
      link,
      job: jobsById.get(toCleanString(link.job_id)) ?? null,
    });

    if (label === "linked") summary.linked_links += 1;
    if (label === "eligible_for_count_review") summary.eligible_for_count_review_links += 1;
    if (label === "counted") summary.counted_links += 1;
    if (label === "excluded") summary.excluded_links += 1;
    if (label === "reversed") summary.reversed_links += 1;
    if (label === "not_eligible") summary.not_eligible_links += 1;

    if (
      toCleanString(link.count_status).toLowerCase() === "counted" &&
      Boolean(link.counts_toward_visit_balance)
    ) {
      summary.used_visits += 1;
    }
  }

  return summary;
}

export async function listMaintenanceAgreementsForCustomer(params: ListForCustomerParams) {
  const accountOwnerUserId = toCleanString(params.accountOwnerUserId);
  const customerId = toCleanString(params.customerId);
  if (!accountOwnerUserId || !customerId) return [];

  return runAgreementQuery(
    params.supabase
      .from("maintenance_agreements")
      .select(MAINTENANCE_AGREEMENT_SELECT)
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("customer_id", customerId)
      .order("next_due_date", { ascending: true })
      .order("created_at", { ascending: false }),
  );
}

export async function listMaintenanceAgreementVisitsForAgreement(
  params: ListMaintenanceAgreementVisitLinksForAgreementParams,
) {
  const accountOwnerUserId = toCleanString(params.accountOwnerUserId);
  const agreementId = toCleanString(params.agreementId);
  if (!accountOwnerUserId || !agreementId) return [];

  return runMaintenanceAgreementVisitLinkQuery(
    params.supabase
      .from("maintenance_agreement_visits")
      .select(
        [
          "id",
          "account_owner_user_id",
          "agreement_id",
          "job_id",
          "link_source",
          "count_status",
          "counts_toward_visit_balance",
          "counted_at",
          "counted_by_user_id",
          "reversed_at",
          "reversed_by_user_id",
          "reversal_reason",
          "created_at",
          "created_by_user_id",
          "updated_at",
          "updated_by_user_id",
        ].join(", "),
      )
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("agreement_id", agreementId)
      .order("created_at", { ascending: false })
      .limit(normalizeLimit(params.limit)),
  );
}

export async function listMaintenanceAgreementLinksForJob(
  params: ListMaintenanceAgreementVisitLinksForJobParams,
) {
  const accountOwnerUserId = toCleanString(params.accountOwnerUserId);
  const jobId = toCleanString(params.jobId);
  if (!accountOwnerUserId || !jobId) return [];

  return runMaintenanceAgreementVisitLinkQuery(
    params.supabase
      .from("maintenance_agreement_visits")
      .select(
        [
          "id",
          "account_owner_user_id",
          "agreement_id",
          "job_id",
          "link_source",
          "count_status",
          "counts_toward_visit_balance",
          "counted_at",
          "counted_by_user_id",
          "reversed_at",
          "reversed_by_user_id",
          "reversal_reason",
          "created_at",
          "created_by_user_id",
          "updated_at",
          "updated_by_user_id",
        ].join(", "),
      )
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(normalizeLimit(params.limit)),
  );
}

export async function summarizeMaintenanceAgreementVisitLinksForAgreement(
  params: SummarizeMaintenanceAgreementVisitLinksParams,
): Promise<MaintenanceAgreementVisitLinkSummary> {
  const accountOwnerUserId = toCleanString(params.accountOwnerUserId);
  const agreementId = toCleanString(params.agreementId);
  if (!accountOwnerUserId || !agreementId) return createEmptyMaintenanceAgreementVisitLinkSummary();

  const { data, error } = await params.supabase
    .from("maintenance_agreement_visits")
    .select("count_status, counts_toward_visit_balance")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("agreement_id", agreementId);

  if (error) throw error;

  const rows = (data ?? []) as Array<{
    count_status?: string | null;
    counts_toward_visit_balance?: boolean | null;
  }>;
  const summary = createEmptyMaintenanceAgreementVisitLinkSummary();
  summary.total_links = rows.length;

  for (const row of rows) {
    const countStatus = toCleanString(row.count_status).toLowerCase();
    const countsTowardVisitBalance = Boolean(row.counts_toward_visit_balance);

    if (countStatus === "linked") summary.linked_links += 1;
    if (countStatus === "eligible") summary.eligible_links += 1;
    if (countStatus === "counted") summary.counted_links += 1;
    if (countStatus === "excluded") summary.excluded_links += 1;
    if (countStatus === "reversed") summary.reversed_links += 1;

    if (countStatus === "counted" && countsTowardVisitBalance) {
      summary.used_visits += 1;
    }
  }

  return summary;
}

export async function listMaintenanceAgreementsForLocation(params: ListForLocationParams) {
  const accountOwnerUserId = toCleanString(params.accountOwnerUserId);
  const locationId = toCleanString(params.locationId);
  if (!accountOwnerUserId || !locationId) return [];

  return runAgreementQuery(
    params.supabase
      .from("maintenance_agreements")
      .select(MAINTENANCE_AGREEMENT_SELECT)
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("primary_location_id", locationId)
      .order("next_due_date", { ascending: true })
      .order("created_at", { ascending: false }),
  );
}

export async function resolveScopedMaintenanceAgreementJobPrefill(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
  customerId: string | null | undefined;
  agreementId: string | null | undefined;
}): Promise<MaintenanceAgreementJobPrefill | null> {
  const accountOwnerUserId = toCleanString(params.accountOwnerUserId);
  const customerId = toCleanString(params.customerId);
  const agreementId = toCleanString(params.agreementId);
  if (!accountOwnerUserId || !customerId || !agreementId) return null;

  const { data, error } = await params.supabase
    .from("maintenance_agreements")
    .select(
      [
        "id",
        "agreement_name",
        "next_due_date",
        "customer_id",
        "primary_location_id",
        "default_visit_scope_summary",
        "default_visit_scope_items",
      ].join(", "),
    )
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("customer_id", customerId)
    .eq("id", agreementId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const summary = sanitizeVisitScopeSummary(
    (data as { default_visit_scope_summary?: unknown }).default_visit_scope_summary,
  );

  let items: VisitScopeItem[] = [];
  try {
    items = sanitizeVisitScopeItems(
      normalizePrefillDefaultVisitScopeItems(
        (data as { default_visit_scope_items?: unknown }).default_visit_scope_items,
      ),
    );
  } catch {
    items = [];
  }

  return {
    agreement_id: String((data as { id?: unknown }).id ?? "").trim(),
    agreement_name:
      String((data as { agreement_name?: unknown }).agreement_name ?? "").trim() ||
      "Service Plan",
    next_due_date:
      String((data as { next_due_date?: unknown }).next_due_date ?? "").trim() || null,
    customer_id: String((data as { customer_id?: unknown }).customer_id ?? "").trim(),
    primary_location_id:
      String((data as { primary_location_id?: unknown }).primary_location_id ?? "").trim() ||
      null,
    default_visit_scope_summary: summary,
    default_visit_scope_items: items,
  };
}

export async function listUpcomingOverdueMaintenanceAgreements(params: ListUpcomingOverdueParams) {
  const accountOwnerUserId = toCleanString(params.accountOwnerUserId);
  if (!accountOwnerUserId) return [];

  let query = params.supabase
    .from("maintenance_agreements")
    .select(MAINTENANCE_AGREEMENT_SELECT)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("status", "active")
    .order("next_due_date", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(params.limit));

  if (isValidYmd(params.horizonDate)) {
    query = query.lte("next_due_date", toCleanString(params.horizonDate));
  }

  const rows = await runAgreementQuery(query);
  return rows.map((row) => ({
    ...row,
    due_state: classifyMaintenanceAgreementDueState({
      status: row.status,
      nextDueDate: row.next_due_date,
      today: params.today,
    }),
  }));
}

export async function listMaintenanceAgreementDrilldownForAccount(
  params: DrilldownMaintenanceAgreementsParams,
): Promise<MaintenanceAgreementDrilldownResult> {
  const accountOwnerUserId = toCleanString(params.accountOwnerUserId);
  const asOfDate = resolveAsOfDate(params.today);
  const filter = normalizeDrilldownFilter(params.filter);
  const limit = normalizeDrilldownLimit(params.limit);

  if (!accountOwnerUserId) {
    return { as_of_date: asOfDate, rows: [] };
  }

  const { data, error } = await params.supabase
    .from("maintenance_agreements")
    .select(
      [
        "id",
        "agreement_name",
        "customer_id",
        "primary_location_id",
        "status",
        "agreement_type",
        "frequency",
        "next_due_date",
        "created_at",
      ].join(", "),
    )
    .eq("account_owner_user_id", accountOwnerUserId)
    .order("next_due_date", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const rows = (data ?? []) as Array<{
    id?: string | null;
    agreement_name?: string | null;
    customer_id?: string | null;
    primary_location_id?: string | null;
    status?: string | null;
    agreement_type?: string | null;
    frequency?: string | null;
    next_due_date?: string | null;
  }>;

  const customerIds = Array.from(
    new Set(rows.map((row) => toCleanString(row.customer_id)).filter(Boolean)),
  );
  const locationIds = Array.from(
    new Set(rows.map((row) => toCleanString(row.primary_location_id)).filter(Boolean)),
  );
  const agreementIds = Array.from(
    new Set(rows.map((row) => toCleanString(row.id)).filter(Boolean)),
  );

  const customerDisplayById = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: customerRows, error: customerError } = await params.supabase
      .from("customers")
      .select("id, full_name, first_name, last_name")
      .in("id", customerIds);
    if (customerError) throw customerError;

    for (const customer of (customerRows ?? []) as Array<{
      id?: string | null;
      full_name?: string | null;
      first_name?: string | null;
      last_name?: string | null;
    }>) {
      const id = toCleanString(customer.id);
      if (!id) continue;
      customerDisplayById.set(id, displayCustomerName(customer));
    }
  }

  const locationDisplayById = new Map<string, string | null>();
  if (locationIds.length > 0) {
    const { data: locationRows, error: locationError } = await params.supabase
      .from("locations")
      .select("id, nickname, address_line1, city, state, zip, postal_code")
      .in("id", locationIds);
    if (locationError) throw locationError;

    for (const location of (locationRows ?? []) as Array<{
      id?: string | null;
      nickname?: string | null;
      address_line1?: string | null;
      city?: string | null;
      state?: string | null;
      zip?: string | null;
      postal_code?: string | null;
    }>) {
      const id = toCleanString(location.id);
      if (!id) continue;
      locationDisplayById.set(id, displayLocation(location));
    }
  }

  const linksByAgreementId = new Map<string, MaintenanceAgreementVisitLinkRow[]>();
  const jobsById = new Map<string, MaintenanceAgreementVisitProjectionJob>();

  if (agreementIds.length > 0) {
    const { data: linkRows, error: linkError } = await params.supabase
      .from("maintenance_agreement_visits")
      .select(
        [
          "id",
          "account_owner_user_id",
          "agreement_id",
          "job_id",
          "link_source",
          "count_status",
          "counts_toward_visit_balance",
          "counted_at",
          "counted_by_user_id",
          "reversed_at",
          "reversed_by_user_id",
          "reversal_reason",
          "created_at",
          "created_by_user_id",
          "updated_at",
          "updated_by_user_id",
        ].join(", "),
      )
      .eq("account_owner_user_id", accountOwnerUserId)
      .in("agreement_id", agreementIds);

    if (linkError) throw linkError;

    const links = ((linkRows ?? []) as MaintenanceAgreementVisitLinkRow[]).map(
      normalizeMaintenanceAgreementVisitLinkRow,
    );
    const jobIds = Array.from(new Set(links.map((link) => toCleanString(link.job_id)).filter(Boolean)));

    if (jobIds.length > 0) {
      const { data: jobRows, error: jobError } = await params.supabase
        .from("jobs")
        .select("id, status, ops_status, job_type, field_complete, service_visit_type, service_visit_outcome")
        .in("id", jobIds);

      if (jobError) throw jobError;

      for (const job of (jobRows ?? []) as MaintenanceAgreementVisitProjectionJob[]) {
        const id = toCleanString(job.id);
        if (!id) continue;
        jobsById.set(id, job);
      }
    }

    for (const link of links) {
      const agreementId = toCleanString(link.agreement_id);
      if (!agreementId) continue;
      const bucket = linksByAgreementId.get(agreementId) ?? [];
      bucket.push(link);
      linksByAgreementId.set(agreementId, bucket);
    }
  }

  const mappedRows: MaintenanceAgreementDrilldownRow[] = rows
    .map((row) => {
      const id = toCleanString(row.id);
      const customerId = toCleanString(row.customer_id);
      const primaryLocationId = toCleanString(row.primary_location_id);
      const status = toCleanString(row.status).toLowerCase() || "draft";
      const nextDueDate = toCleanString(row.next_due_date) || null;
      const dueState = classifyMaintenanceAgreementDueState({
        status,
        nextDueDate,
        today: asOfDate,
      });

      return {
        id,
        agreement_name: toCleanString(row.agreement_name) || "Untitled Service Plan",
        customer_id: customerId,
        customer_display_name: customerDisplayById.get(customerId) ?? "Customer",
        primary_location_display: primaryLocationId
          ? locationDisplayById.get(primaryLocationId) ?? null
          : null,
        status,
        agreement_type: toCleanString(row.agreement_type) || "maintenance",
        frequency: toCleanString(row.frequency) || "custom",
        next_due_date: nextDueDate,
        due_state: dueState,
        visit_count_review: summarizeMaintenanceAgreementVisitCountReviewRows(
          linksByAgreementId.get(id) ?? [],
          jobsById,
        ),
      };
    })
    .filter((row) => row.id && row.customer_id)
    .filter((row) =>
      matchesDrilldownFilter({
        filter,
        dueState: row.due_state,
        status: row.status,
        nextDueDate: row.next_due_date,
        asOfDate,
      }),
    );

  return {
    as_of_date: asOfDate,
    rows: mappedRows,
  };
}

export async function summarizeMaintenanceAgreementsForAccount(
  params: SummarizeMaintenanceAgreementsParams,
): Promise<MaintenanceAgreementSummary> {
  const accountOwnerUserId = toCleanString(params.accountOwnerUserId);
  const asOfDate = resolveAsOfDate(params.today);
  if (!accountOwnerUserId) {
    return createEmptyMaintenanceAgreementSummary(asOfDate);
  }

  const { data, error } = await params.supabase
    .from("maintenance_agreements")
    .select("status, next_due_date")
    .eq("account_owner_user_id", accountOwnerUserId);

  if (error) throw error;

  const rows = (data ?? []) as Array<{ status?: string | null; next_due_date?: string | null }>;
  const summary = createEmptyMaintenanceAgreementSummary(asOfDate);
  const next7Date = addDaysToYmd(asOfDate, 7);
  const next30Date = addDaysToYmd(asOfDate, 30);

  summary.total_count = rows.length;

  for (const row of rows) {
    const status = toCleanString(row.status).toLowerCase();
    if (status === "active") summary.status_counts.active += 1;
    if (status === "draft") summary.status_counts.draft += 1;
    if (status === "paused") summary.status_counts.paused += 1;
    if (status === "expired") summary.status_counts.expired += 1;
    if (status === "cancelled") summary.status_counts.cancelled += 1;

    if (status !== "active") continue;

    const dueState = classifyMaintenanceAgreementDueState({
      status,
      nextDueDate: row.next_due_date ?? null,
      today: asOfDate,
    });

    if (dueState === "overdue") {
      summary.due_counts.overdue += 1;
      continue;
    }
    if (dueState === "due_today") {
      summary.due_counts.due_today += 1;
      continue;
    }
    if (dueState === "not_scheduled") {
      summary.due_counts.not_scheduled_active += 1;
      continue;
    }
    if (dueState !== "upcoming") continue;

    const nextDueDate = toCleanString(row.next_due_date);
    if (nextDueDate <= next7Date) summary.due_counts.due_in_next_7_days += 1;
    if (nextDueDate <= next30Date) summary.due_counts.due_in_next_30_days += 1;
  }

  return summary;
}
