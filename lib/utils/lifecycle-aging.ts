export type LifecycleBucket =
  | "need_to_schedule"
  | "scheduled"
  | "waiting"
  | "failed"
  | "closeout"
  | "completed"
  | "other";

export type LifecycleAgingConfidence = "ready_now" | "partial";

export type LifecycleAgingResolution = {
  label: string | null;
  bucket: LifecycleBucket;
  sourceTimestamp: string | null;
  sourceKind:
    | "state_entry"
    | "failed_evidence"
    | "field_complete_at"
    | "scheduled_date"
    | "created_at"
    | "none";
  usedFallback: boolean;
  confidence: LifecycleAgingConfidence;
};

export type LifecycleAgingInput = {
  status?: string | null;
  opsStatus?: string | null;
  createdAt?: string | null;
  scheduledDate?: string | null;
  fieldCompleteAt?: string | null;
  now?: Date;
  todayDate?: string | null;
  stateEnteredAtByStatus?: Record<string, string | null | undefined> | null;
  failedEvidenceAt?: string | null;
};

const WAITING_STATUSES = new Set([
  "pending_info",
  "waiting",
  "on_hold",
  "pending_office_review",
]);

const FAILED_STATUSES = new Set([
  "failed",
  "retest_needed",
  "problem",
  "blocked",
  "interrupted",
]);

const CLOSEOUT_STATUSES = new Set([
  "invoice_required",
  "paperwork_required",
]);

function normalizeStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function parseIsoInstant(value: unknown): Date | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed;
}

function parseYmdToUtcNoon(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function defaultTodayDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function formatRelativeRunningElapsed(source: Date, now: Date): string {
  const elapsedMs = Math.max(0, now.getTime() - source.getTime());
  const minutes = Math.floor(elapsedMs / 60000);

  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }

  const hours = Math.floor(elapsedMs / 3600000);
  if (hours < 24) {
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  const days = Math.floor(elapsedMs / 86400000);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function chooseRunningSource(params: {
  stateEntry?: string | null;
  fallbackSources: Array<{ kind: LifecycleAgingResolution["sourceKind"]; value?: string | null }>;
}): {
  sourceTimestamp: string | null;
  sourceKind: LifecycleAgingResolution["sourceKind"];
  usedFallback: boolean;
} {
  const stateEntry = String(params.stateEntry ?? "").trim();
  if (stateEntry) {
    return {
      sourceTimestamp: stateEntry,
      sourceKind: "state_entry",
      usedFallback: false,
    };
  }

  for (const source of params.fallbackSources) {
    const value = String(source.value ?? "").trim();
    if (!value) continue;
    return {
      sourceTimestamp: value,
      sourceKind: source.kind,
      usedFallback: true,
    };
  }

  return {
    sourceTimestamp: null,
    sourceKind: "none",
    usedFallback: true,
  };
}

function formatShortDate(ymd: string): string {
  const parsed = parseYmdToUtcNoon(ymd);
  if (!parsed) return ymd;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function buildScheduledLabel(params: {
  scheduledDate?: string | null;
  now: Date;
  todayDate?: string | null;
}): LifecycleAgingResolution {
  const scheduledDate = String(params.scheduledDate ?? "").trim();
  if (!scheduledDate) {
    return {
      label: "Schedule pending",
      bucket: "scheduled",
      sourceTimestamp: null,
      sourceKind: "none",
      usedFallback: true,
      confidence: "partial",
    };
  }

  const todayDate = String(params.todayDate ?? "").trim() || defaultTodayDate(params.now);

  if (scheduledDate < todayDate) {
    const scheduled = parseYmdToUtcNoon(scheduledDate);
    const today = parseYmdToUtcNoon(todayDate);
    if (!scheduled || !today) {
      return {
        label: "Scheduled",
        bucket: "scheduled",
        sourceTimestamp: scheduledDate,
        sourceKind: "scheduled_date",
        usedFallback: false,
        confidence: "partial",
      };
    }

    const days = Math.max(0, Math.floor((today.getTime() - scheduled.getTime()) / 86400000));
    return {
      label: `Overdue by ${days} ${days === 1 ? "day" : "days"}`,
      bucket: "scheduled",
      sourceTimestamp: scheduledDate,
      sourceKind: "scheduled_date",
      usedFallback: false,
      confidence: "ready_now",
    };
  }

  if (scheduledDate === todayDate) {
    return {
      label: "Scheduled today",
      bucket: "scheduled",
      sourceTimestamp: scheduledDate,
      sourceKind: "scheduled_date",
      usedFallback: false,
      confidence: "ready_now",
    };
  }

  return {
    label: `Scheduled ${formatShortDate(scheduledDate)}`,
    bucket: "scheduled",
    sourceTimestamp: scheduledDate,
    sourceKind: "scheduled_date",
    usedFallback: false,
    confidence: "ready_now",
  };
}

function runningLabel(params: {
  prefix: string;
  bucket: LifecycleBucket;
  stateEntry?: string | null;
  fallbackSources: Array<{ kind: LifecycleAgingResolution["sourceKind"]; value?: string | null }>;
  now: Date;
}): LifecycleAgingResolution {
  const selected = chooseRunningSource({
    stateEntry: params.stateEntry,
    fallbackSources: params.fallbackSources,
  });

  const parsed = parseIsoInstant(selected.sourceTimestamp);
  if (!parsed) {
    return {
      label: null,
      bucket: params.bucket,
      sourceTimestamp: selected.sourceTimestamp,
      sourceKind: selected.sourceKind,
      usedFallback: selected.usedFallback,
      confidence: "partial",
    };
  }

  return {
    label: `${params.prefix} ${formatRelativeRunningElapsed(parsed, params.now)}`,
    bucket: params.bucket,
    sourceTimestamp: selected.sourceTimestamp,
    sourceKind: selected.sourceKind,
    usedFallback: selected.usedFallback,
    confidence: selected.usedFallback ? "partial" : "ready_now",
  };
}

export function resolveLifecycleAging(input: LifecycleAgingInput): LifecycleAgingResolution {
  const status = normalizeStatus(input.status);
  const opsStatus = normalizeStatus(input.opsStatus);
  const stateEnteredAtByStatus = input.stateEnteredAtByStatus ?? {};
  const stateEntryAt = String(stateEnteredAtByStatus[opsStatus] ?? "").trim() || null;
  const now = input.now ?? new Date();

  if (status === "completed" || status === "cancelled" || opsStatus === "closed") {
    return {
      label: null,
      bucket: "completed",
      sourceTimestamp: null,
      sourceKind: "none",
      usedFallback: true,
      confidence: "ready_now",
    };
  }

  if (opsStatus === "scheduled") {
    return buildScheduledLabel({
      scheduledDate: input.scheduledDate,
      now,
      todayDate: input.todayDate,
    });
  }

  if (status === "open" && opsStatus === "need_to_schedule") {
    return runningLabel({
      prefix: "Unscheduled for",
      bucket: "need_to_schedule",
      stateEntry: stateEntryAt,
      fallbackSources: [{ kind: "created_at", value: input.createdAt }],
      now,
    });
  }

  if (WAITING_STATUSES.has(opsStatus)) {
    return runningLabel({
      prefix: "Waiting",
      bucket: "waiting",
      stateEntry: stateEntryAt,
      fallbackSources: [{ kind: "created_at", value: input.createdAt }],
      now,
    });
  }

  if (FAILED_STATUSES.has(opsStatus)) {
    const prefix =
      opsStatus === "retest_needed"
        ? "Retest pending"
        : opsStatus === "blocked" || opsStatus === "problem"
        ? "Blocked"
        : opsStatus === "interrupted"
        ? "Interrupted"
        : "Failed";

    return runningLabel({
      prefix,
      bucket: "failed",
      stateEntry: stateEntryAt,
      fallbackSources: [
        { kind: "failed_evidence", value: input.failedEvidenceAt },
        { kind: "created_at", value: input.createdAt },
      ],
      now,
    });
  }

  if (CLOSEOUT_STATUSES.has(opsStatus)) {
    return runningLabel({
      prefix: "Closeout open",
      bucket: "closeout",
      stateEntry: stateEntryAt,
      fallbackSources: [
        { kind: "field_complete_at", value: input.fieldCompleteAt },
        { kind: "scheduled_date", value: input.scheduledDate },
        { kind: "created_at", value: input.createdAt },
      ],
      now,
    });
  }

  return {
    label: null,
    bucket: "other",
    sourceTimestamp: null,
    sourceKind: "none",
    usedFallback: true,
    confidence: "partial",
  };
}

function extractOpsStatusTransitionTo(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;

  const changes = (meta as { changes?: unknown }).changes;
  if (!Array.isArray(changes)) return null;

  for (const change of changes) {
    if (!change || typeof change !== "object") continue;

    const field = String((change as { field?: unknown }).field ?? "").trim().toLowerCase();
    if (field !== "ops_status") continue;

    const target = normalizeStatus((change as { to?: unknown }).to);
    if (!target) continue;

    return target;
  }

  return null;
}

export function buildOpsStatusEnteredAtByJob(
  events: Array<{ job_id?: unknown; created_at?: unknown; meta?: unknown }>,
): Map<string, Record<string, string>> {
  const byJob = new Map<string, Record<string, string>>();

  for (const event of Array.isArray(events) ? events : []) {
    const jobId = String(event?.job_id ?? "").trim();
    if (!jobId) continue;

    const createdAt = String(event?.created_at ?? "").trim();
    if (!createdAt) continue;

    const statusTo = extractOpsStatusTransitionTo(event?.meta);
    if (!statusTo) continue;

    const current = byJob.get(jobId) ?? {};
    if (!current[statusTo]) {
      current[statusTo] = createdAt;
      byJob.set(jobId, current);
    }
  }

  return byJob;
}
