import { requireInternalRole } from "@/lib/auth/internal-user";
import { resolveUserDisplayMap } from "@/lib/staffing/human-layer";
import {
  formatTimestampDateTimeDisplayLA,
  laDateToUtcMidnightIso,
} from "@/lib/utils/schedule-la";

const VALID_STATUS_OPTIONS = ["", "open", "on_lunch", "closed", "needs_review", "voided"] as const;

type FilterSource = URLSearchParams | Record<string, string | string[] | undefined>;

export const TIME_CLOCK_REPORT_PAGE_LIMIT = 300;
export const TIME_CLOCK_REPORT_EXPORT_LIMIT = 5000;

export const TIME_CLOCK_REPORT_STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "on_lunch", label: "On lunch" },
  { value: "closed", label: "Closed" },
  { value: "needs_review", label: "Needs review" },
  { value: "voided", label: "Voided" },
] as const;

export type TimeClockReportFilters = {
  fromDate: string;
  toDate: string;
  internalUserId: string;
  status: string;
};

export type TimeClockReportFilterOptions = {
  internalUsers: Array<{ userId: string; displayName: string }>;
};

export type TimeClockReportRow = {
  entryId: string;
  employeeDisplay: string;
  statusLabel: string;
  clockInDisplay: string;
  lunchStartDisplay: string;
  lunchEndDisplay: string;
  clockOutDisplay: string;
  durationDisplay: string;
  adjusted: boolean;
  adjustmentReason: string;
  adjustedByDisplay: string;
  adjustedAtDisplay: string;
};

export type TimeClockReportResult = {
  rows: TimeClockReportRow[];
  totalCount: number;
  truncated: boolean;
};

function readParam(source: FilterSource, key: string) {
  if (source instanceof URLSearchParams) return source.get(key) ?? undefined;
  const value = source[key];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeYmd(value: string | undefined) {
  const normalized = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function normalizeStatus(value: string | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return VALID_STATUS_OPTIONS.includes(normalized as (typeof VALID_STATUS_OPTIONS)[number]) ? normalized : "";
}

function addOneDay(dateYmd: string) {
  const [year, month, day] = dateYmd.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0));
  return next.toISOString().slice(0, 10);
}

function csvEscape(value: string) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatStatusLabel(status: string) {
  if (status === "on_lunch") return "On lunch";
  if (status === "needs_review") return "Needs review";
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : "-";
}

function formatDuration(clockInAt: string | null | undefined, clockOutAt: string | null | undefined) {
  const start = clockInAt ? new Date(clockInAt).getTime() : NaN;
  const end = clockOutAt ? new Date(clockOutAt).getTime() : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "-";
  const totalMinutes = Math.floor((end - start) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours <= 0 ? `${minutes}m` : `${hours}h ${minutes}m`;
}

export function parseTimeClockReportFilters(source: FilterSource): TimeClockReportFilters {
  return {
    fromDate: normalizeYmd(readParam(source, "from")),
    toDate: normalizeYmd(readParam(source, "to")),
    internalUserId: String(readParam(source, "internal_user_id") ?? "").trim(),
    status: normalizeStatus(readParam(source, "status")),
  };
}

export function buildTimeClockReportSearchParams(filters: TimeClockReportFilters) {
  const searchParams = new URLSearchParams();
  if (filters.fromDate) searchParams.set("from", filters.fromDate);
  if (filters.toDate) searchParams.set("to", filters.toDate);
  if (filters.internalUserId) searchParams.set("internal_user_id", filters.internalUserId);
  if (filters.status) searchParams.set("status", filters.status);
  return searchParams;
}

export async function getTimeClockReportFilterOptions(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<TimeClockReportFilterOptions> {
  const { data, error } = await params.supabase
    .from("internal_users")
    .select("user_id")
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const userIds = (data ?? [])
    .map((row: any) => String(row?.user_id ?? "").trim())
    .filter(Boolean);

  const displayMap = await resolveUserDisplayMap({
    supabase: params.supabase,
    userIds,
  });

  return {
    internalUsers: userIds.map((userId: string) => ({
      userId,
      displayName: String(displayMap[userId] ?? "").trim() || "Unknown User",
    })),
  };
}

export async function listTimeClockReportEntriesForAccount(params: {
  supabase: any;
  accountOwnerUserId: string | null | undefined;
  filters: TimeClockReportFilters;
  limit?: number;
  includeCount?: boolean;
}): Promise<TimeClockReportResult> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  if (!accountOwnerUserId) return { rows: [], totalCount: 0, truncated: false };

  const limit = params.limit ?? TIME_CLOCK_REPORT_PAGE_LIMIT;

  let query = params.supabase
    .from("internal_user_time_entries")
    .select(
      "id, account_owner_user_id, internal_user_id, status, clock_in_at, lunch_start_at, lunch_end_at, clock_out_at, adjusted_by_user_id, adjusted_at, adjustment_reason",
      params.includeCount === false ? undefined : { count: "exact" },
    )
    .eq("account_owner_user_id", accountOwnerUserId);

  if (params.filters.fromDate) {
    query = query.gte("clock_in_at", laDateToUtcMidnightIso(params.filters.fromDate));
  }

  if (params.filters.toDate) {
    query = query.lt("clock_in_at", laDateToUtcMidnightIso(addOneDay(params.filters.toDate)));
  }

  if (params.filters.internalUserId) {
    query = query.eq("internal_user_id", params.filters.internalUserId);
  }

  if (params.filters.status) {
    query = query.eq("status", params.filters.status);
  }

  query = query.order("clock_in_at", { ascending: false }).limit(limit);

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const displayIds = Array.from(
    new Set(
      rows.flatMap((row: any) => [String(row?.internal_user_id ?? "").trim(), String(row?.adjusted_by_user_id ?? "").trim()]).filter(Boolean),
    ),
  );

  const displayMap = await resolveUserDisplayMap({
    supabase: params.supabase,
    userIds: displayIds,
  });

  const mappedRows: TimeClockReportRow[] = rows.map((row: any) => ({
    entryId: String(row?.id ?? "").trim(),
    employeeDisplay: String(displayMap[String(row?.internal_user_id ?? "").trim()] ?? "").trim() || "Unknown User",
    statusLabel: formatStatusLabel(String(row?.status ?? "").trim().toLowerCase()),
    clockInDisplay: formatTimestampDateTimeDisplayLA(row?.clock_in_at) || "-",
    lunchStartDisplay: formatTimestampDateTimeDisplayLA(row?.lunch_start_at) || "-",
    lunchEndDisplay: formatTimestampDateTimeDisplayLA(row?.lunch_end_at) || "-",
    clockOutDisplay: formatTimestampDateTimeDisplayLA(row?.clock_out_at) || "-",
    durationDisplay: formatDuration(row?.clock_in_at ? String(row.clock_in_at) : null, row?.clock_out_at ? String(row.clock_out_at) : null),
    adjusted: Boolean(row?.adjusted_at || row?.adjustment_reason || row?.adjusted_by_user_id),
    adjustmentReason: String(row?.adjustment_reason ?? "").trim(),
    adjustedByDisplay: String(displayMap[String(row?.adjusted_by_user_id ?? "").trim()] ?? "").trim() || "-",
    adjustedAtDisplay: formatTimestampDateTimeDisplayLA(row?.adjusted_at) || "-",
  }));

  const totalCount = params.includeCount === false ? mappedRows.length : Number(count ?? mappedRows.length);
  return {
    rows: mappedRows,
    totalCount,
    truncated: totalCount > mappedRows.length,
  };
}

export function buildTimeClockReportCsv(rows: TimeClockReportRow[]) {
  const header = [
    "employee",
    "status",
    "clock_in",
    "lunch_start",
    "lunch_end",
    "clock_out",
    "duration",
    "adjusted",
    "adjustment_reason",
    "adjusted_by",
    "adjusted_at",
  ];

  const lines = rows.map((row) => [
    row.employeeDisplay,
    row.statusLabel,
    row.clockInDisplay,
    row.lunchStartDisplay,
    row.lunchEndDisplay,
    row.clockOutDisplay,
    row.durationDisplay,
    row.adjusted ? "Yes" : "No",
    row.adjustmentReason,
    row.adjustedByDisplay,
    row.adjustedAtDisplay,
  ].map((value) => csvEscape(String(value ?? ""))).join(","));

  return [header.map(csvEscape).join(","), ...lines].join("\r\n");
}

export async function requireAdminReportActor(params: { supabase: any; userId: string }) {
  return requireInternalRole("admin", { supabase: params.supabase, userId: params.userId });
}