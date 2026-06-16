export type OpsBoardSortKey = "oldest" | "newest" | "scheduled_soonest" | "contractor_az" | "customer_az";

export const OPS_BOARD_SORT_OPTIONS: Array<{ key: OpsBoardSortKey; label: string }> = [
  { key: "oldest", label: "Oldest first" },
  { key: "newest", label: "Newest first" },
  { key: "scheduled_soonest", label: "Scheduled soonest" },
  { key: "contractor_az", label: "Contractor A-Z" },
  { key: "customer_az", label: "Customer A-Z" },
];

type OpsBoardSortableJob = {
  created_at?: string | null;
  scheduled_date?: string | null;
  window_start?: string | null;
  customer_first_name?: string | null;
  customer_last_name?: string | null;
  contractors?: { name?: string | null } | null;
};

export function normalizeOpsBoardSort(value: unknown): OpsBoardSortKey {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "created") return "oldest";
  if (
    normalized === "oldest" ||
    normalized === "newest" ||
    normalized === "scheduled_soonest" ||
    normalized === "contractor_az" ||
    normalized === "customer_az"
  ) {
    return normalized;
  }
  return "oldest";
}

function opsBoardDateMs(value: unknown): number {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const ms = new Date(text).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function opsBoardText(value: unknown): string {
  return String(value ?? "").trim();
}

function opsBoardCustomerName(job: OpsBoardSortableJob): string {
  return [opsBoardText(job.customer_first_name), opsBoardText(job.customer_last_name)]
    .filter(Boolean)
    .join(" ");
}

function opsBoardContractorName(job: OpsBoardSortableJob): string {
  return opsBoardText(job.contractors?.name);
}

function compareOpsBoardTextMissingLast(left: string, right: string): number {
  const leftMissing = !left;
  const rightMissing = !right;
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;
  return left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });
}

function opsBoardScheduledSortParts(job: OpsBoardSortableJob): { dateMs: number; time: string; missing: boolean } {
  const dateMs = opsBoardDateMs(job.scheduled_date);
  return {
    dateMs,
    time: opsBoardText(job.window_start),
    missing: dateMs === 0,
  };
}

export function compareOpsBoardRows(left: OpsBoardSortableJob, right: OpsBoardSortableJob, sortKey: OpsBoardSortKey): number {
  if (sortKey === "newest") {
    return opsBoardDateMs(right.created_at) - opsBoardDateMs(left.created_at);
  }

  if (sortKey === "scheduled_soonest") {
    const leftSchedule = opsBoardScheduledSortParts(left);
    const rightSchedule = opsBoardScheduledSortParts(right);
    if (leftSchedule.missing !== rightSchedule.missing) return leftSchedule.missing ? 1 : -1;
    if (leftSchedule.dateMs !== rightSchedule.dateMs) return leftSchedule.dateMs - rightSchedule.dateMs;
    const timeCompare = leftSchedule.time.localeCompare(rightSchedule.time, undefined, { sensitivity: "base", numeric: true });
    if (timeCompare !== 0) return timeCompare;
    return opsBoardDateMs(left.created_at) - opsBoardDateMs(right.created_at);
  }

  if (sortKey === "contractor_az") {
    const nameCompare = compareOpsBoardTextMissingLast(opsBoardContractorName(left), opsBoardContractorName(right));
    if (nameCompare !== 0) return nameCompare;
    return opsBoardDateMs(left.created_at) - opsBoardDateMs(right.created_at);
  }

  if (sortKey === "customer_az") {
    const nameCompare = compareOpsBoardTextMissingLast(opsBoardCustomerName(left), opsBoardCustomerName(right));
    if (nameCompare !== 0) return nameCompare;
    return opsBoardDateMs(left.created_at) - opsBoardDateMs(right.created_at);
  }

  return opsBoardDateMs(left.created_at) - opsBoardDateMs(right.created_at);
}

export function sortOpsBoardRows<T extends OpsBoardSortableJob>(rows: T[], sortKey: OpsBoardSortKey): T[] {
  return [...(rows ?? [])].sort((left, right) => compareOpsBoardRows(left, right, sortKey));
}
