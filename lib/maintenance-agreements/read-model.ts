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
};

export type MaintenanceAgreementDrilldownResult = {
  as_of_date: string;
  rows: MaintenanceAgreementDrilldownRow[];
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

function normalizeAgreementRow(row: MaintenanceAgreementRow): MaintenanceAgreementRow {
  return {
    ...row,
    default_visit_scope_items: Array.isArray(row.default_visit_scope_items)
      ? row.default_visit_scope_items
      : [],
  };
}

async function runAgreementQuery(query: any) {
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as MaintenanceAgreementRow[]).map(normalizeAgreementRow);
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
      (data as { default_visit_scope_items?: unknown }).default_visit_scope_items,
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
