const FAILED_FAMILY_STATUSES = new Set([
  "failed",
  "retest_needed",
  "pending_office_review",
]);

function toLaDayNumberFromInstant(value?: string | null): number | null {
  if (!value) return null;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);

  if (!year || !month || !day) return null;

  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

export function getCalendarDayAgeInLA(
  sourceInstant?: string | null,
  now: Date = new Date(),
): number | null {
  const sourceDay = toLaDayNumberFromInstant(sourceInstant);
  const nowDay = toLaDayNumberFromInstant(now.toISOString());

  if (sourceDay == null || nowDay == null) return null;
  return Math.max(0, nowDay - sourceDay);
}

export function didOpsStatusChangeTo(meta: unknown, nextStatus: string): boolean {
  if (!meta || typeof meta !== "object") return false;

  const changes = (meta as { changes?: unknown }).changes;
  if (!Array.isArray(changes)) return false;

  const target = String(nextStatus ?? "").trim().toLowerCase();
  if (!target) return false;

  return changes.some((change) => {
    if (!change || typeof change !== "object") return false;

    const field = String((change as { field?: unknown }).field ?? "").trim().toLowerCase();
    const to = String((change as { to?: unknown }).to ?? "").trim().toLowerCase();

    return field === "ops_status" && to === target;
  });
}

export function resolveStatusAgeDays(input: {
  status: string | null | undefined;
  failedInstant?: string | null;
  pendingInfoInstant?: string | null;
  fallbackUpdatedAt?: string | null;
  now?: Date;
}): number | null {
  const normalizedStatus = String(input.status ?? "").trim().toLowerCase();

  let preferredInstant: string | null = null;

  if (FAILED_FAMILY_STATUSES.has(normalizedStatus)) {
    preferredInstant = input.failedInstant ?? null;
  } else if (normalizedStatus === "pending_info") {
    preferredInstant = input.pendingInfoInstant ?? null;
  } else {
    return null;
  }

  const sourceInstant = preferredInstant || input.fallbackUpdatedAt || null;
  return getCalendarDayAgeInLA(sourceInstant, input.now ?? new Date());
}

export function formatStatusAgeCompact(days: number | null | undefined): string {
  if (days == null || !Number.isFinite(days)) return "";
  return `${Math.max(0, Math.floor(days))}d`;
}
