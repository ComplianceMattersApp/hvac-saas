import { formatBusinessDateUS, laDateToUtcMidnightIso } from "@/lib/utils/schedule-la";

export const REPORT_CENTER_KPI_GRANULARITY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

type FilterSource = URLSearchParams | Record<string, string | string[] | undefined>;

export type ReportCenterKpiGranularity = (typeof REPORT_CENTER_KPI_GRANULARITY_OPTIONS)[number]["value"];

export type ReportCenterKpiFilters = {
  fromDate: string;
  toDate: string;
  granularity: ReportCenterKpiGranularity;
};

export type ReportCenterKpiBucket = {
  key: string;
  label: string;
  startDate: string;
  endDateExclusive: string;
  startMs: number;
  endMs: number;
};

export type ReportCenterKpiMetricDefinition = {
  key: string;
  label: string;
  currentValue: string;
  mode: "bucketed" | "snapshot";
  priority: "primary" | "secondary" | "supporting" | "deferred";
  dashboardRole: string;
  priorityReason: string;
  source: string;
  bucketRule: string;
  derivation: string;
};

export type ReportCenterKpiBucketRow = {
  bucketKey: string;
  bucketLabel: string;
  values: Record<string, number>;
};

export type ReportCenterKpiFamilyReadModel = {
  familyKey: "operational" | "continuity";
  familyLabel: string;
  familyDescription: string;
  sourceSummary: string;
  metrics: ReportCenterKpiMetricDefinition[];
  bucketColumns: Array<{ key: string; label: string }>;
  bucketRows: ReportCenterKpiBucketRow[];
};

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

function toUtcDate(dateYmd: string) {
  const [year, month, day] = dateYmd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function fromUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysYmd(dateYmd: string, days: number) {
  const date = toUtcDate(dateYmd);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtcDate(date);
}

function startOfWeekYmd(dateYmd: string) {
  const date = toUtcDate(dateYmd);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return fromUtcDate(date);
}

function startOfMonthYmd(dateYmd: string) {
  const [year, month] = dateYmd.split("-");
  return `${year}-${month}-01`;
}

function nextMonthYmd(dateYmd: string) {
  const date = toUtcDate(startOfMonthYmd(dateYmd));
  date.setUTCMonth(date.getUTCMonth() + 1, 1);
  return fromUtcDate(date);
}

function monthLabel(dateYmd: string) {
  const date = toUtcDate(dateYmd);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function getDefaultRange() {
  const toDate = todayYmd();
  const fromDate = addDaysYmd(toDate, -27);
  return { fromDate, toDate };
}

export function parseReportCenterKpiFilters(source: FilterSource): ReportCenterKpiFilters {
  const defaults = getDefaultRange();
  const fromInput = normalizeYmd(readParam(source, "from"));
  const toInput = normalizeYmd(readParam(source, "to"));
  const fromDate = fromInput || defaults.fromDate;
  const toDate = toInput || defaults.toDate;

  if (fromDate > toDate) {
    return {
      fromDate: toDate,
      toDate: fromDate,
      granularity: normalizeChoice(
        readParam(source, "granularity"),
        REPORT_CENTER_KPI_GRANULARITY_OPTIONS,
        "weekly",
      ) as ReportCenterKpiGranularity,
    };
  }

  return {
    fromDate,
    toDate,
    granularity: normalizeChoice(
      readParam(source, "granularity"),
      REPORT_CENTER_KPI_GRANULARITY_OPTIONS,
      "weekly",
    ) as ReportCenterKpiGranularity,
  };
}

export function buildReportCenterKpiSearchParams(filters: ReportCenterKpiFilters) {
  const searchParams = new URLSearchParams();
  const defaults = getDefaultRange();

  if (filters.fromDate !== defaults.fromDate) searchParams.set("from", filters.fromDate);
  if (filters.toDate !== defaults.toDate) searchParams.set("to", filters.toDate);
  if (filters.granularity !== "weekly") searchParams.set("granularity", filters.granularity);

  return searchParams;
}

export function getKpiRange(filters: ReportCenterKpiFilters) {
  return {
    startDate: filters.fromDate,
    endDateExclusive: addDaysYmd(filters.toDate, 1),
    startMs: Date.parse(laDateToUtcMidnightIso(filters.fromDate)),
    endMs: Date.parse(laDateToUtcMidnightIso(addDaysYmd(filters.toDate, 1))),
  };
}

export function buildReportCenterKpiBuckets(filters: ReportCenterKpiFilters): ReportCenterKpiBucket[] {
  const range = getKpiRange(filters);
  const buckets: ReportCenterKpiBucket[] = [];

  if (filters.granularity === "daily") {
    let current = filters.fromDate;
    while (current < range.endDateExclusive) {
      const next = addDaysYmd(current, 1);
      buckets.push({
        key: current,
        label: formatBusinessDateUS(current),
        startDate: current,
        endDateExclusive: next,
        startMs: Date.parse(laDateToUtcMidnightIso(current)),
        endMs: Date.parse(laDateToUtcMidnightIso(next)),
      });
      current = next;
    }
    return buckets;
  }

  if (filters.granularity === "weekly") {
    let current = startOfWeekYmd(filters.fromDate);
    while (current < range.endDateExclusive) {
      const next = addDaysYmd(current, 7);
      buckets.push({
        key: current,
        label: `Week of ${formatBusinessDateUS(current)}`,
        startDate: current,
        endDateExclusive: next,
        startMs: Date.parse(laDateToUtcMidnightIso(current)),
        endMs: Date.parse(laDateToUtcMidnightIso(next)),
      });
      current = next;
    }
    return buckets;
  }

  let current = startOfMonthYmd(filters.fromDate);
  while (current < range.endDateExclusive) {
    const next = nextMonthYmd(current);
    buckets.push({
      key: current,
      label: monthLabel(current),
      startDate: current,
      endDateExclusive: next,
      startMs: Date.parse(laDateToUtcMidnightIso(current)),
      endMs: Date.parse(laDateToUtcMidnightIso(next)),
    });
    current = next;
  }

  return buckets;
}

export function initializeBucketRows(
  buckets: ReportCenterKpiBucket[],
  metricKeys: string[],
): ReportCenterKpiBucketRow[] {
  return buckets.map((bucket) => ({
    bucketKey: bucket.key,
    bucketLabel: bucket.label,
    values: Object.fromEntries(metricKeys.map((metricKey) => [metricKey, 0])),
  }));
}

export function incrementBucketValue(params: {
  bucketRows: ReportCenterKpiBucketRow[];
  buckets: ReportCenterKpiBucket[];
  metricKey: string;
  instantValue?: string | null;
  rangeStartMs: number;
  rangeEndMs: number;
}) {
  const instantMs = params.instantValue ? Date.parse(params.instantValue) : Number.NaN;
  if (!Number.isFinite(instantMs)) return;
  if (instantMs < params.rangeStartMs || instantMs >= params.rangeEndMs) return;

  const bucketIndex = params.buckets.findIndex(
    (bucket) => instantMs >= bucket.startMs && instantMs < bucket.endMs,
  );
  if (bucketIndex < 0) return;

  params.bucketRows[bucketIndex].values[params.metricKey] += 1;
}

export function formatMetricValue(value: number, digits = 0) {
  if (digits > 0) {
    return value.toFixed(digits);
  }

  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}