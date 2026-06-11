export const SERVICE_FOLLOW_UP_PROGRESS_VALUES = [
  "part_ordered",
  "part_arrived",
  "approval_received",
] as const;

export type ServiceFollowUpProgress = (typeof SERVICE_FOLLOW_UP_PROGRESS_VALUES)[number];
export type ServiceFollowUpReasonFamily = "materials_needed" | "approval_needed" | "other";

export type ParsedServiceFollowUpReason = {
  family: ServiceFollowUpReasonFamily;
  label: "Materials Needed" | "Approval Needed" | "Other";
  reason: string;
  display: string;
};

export type ServiceFollowUpProgressEvent = {
  created_at?: string | null;
  meta?: unknown;
};

export type ServiceFollowUpProgressState = {
  reason: ParsedServiceFollowUpReason | null;
  progress: ServiceFollowUpProgress | null;
  progressLabel: string | null;
  progressEvent: ServiceFollowUpProgressEvent | null;
  nextActionLabel: string | null;
  bridgeActionLabel: string | null;
  returnPromptLabel: string | null;
  continuedThroughChildJobId: string | null;
  continuedBridgeAction: "add_to_scheduling_queue" | "schedule_return_now" | null;
  continuedScheduledDate: string | null;
};

const REASON_PREFIXES: Array<{
  family: ServiceFollowUpReasonFamily;
  label: ParsedServiceFollowUpReason["label"];
}> = [
  { family: "materials_needed", label: "Materials Needed" },
  { family: "approval_needed", label: "Approval Needed" },
  { family: "other", label: "Other" },
];

const PROGRESS_LABELS: Record<ServiceFollowUpProgress, string> = {
  part_ordered: "Part Ordered",
  part_arrived: "Part Arrived",
  approval_received: "Approval Received",
};

function normalize(value: unknown): string {
  return String(value ?? "").trim();
}

function asMetaRecord(meta: unknown): Record<string, unknown> {
  return meta && typeof meta === "object" && !Array.isArray(meta)
    ? meta as Record<string, unknown>
    : {};
}

export function getServiceFollowUpContinuedChildJobId(
  events: ServiceFollowUpProgressEvent[] | null | undefined,
): string | null {
  return deriveLatestServiceFollowUpContinuation(events)?.childJobId ?? null;
}

function deriveLatestServiceFollowUpContinuation(
  events: ServiceFollowUpProgressEvent[] | null | undefined,
): {
  childJobId: string;
  bridgeAction: "add_to_scheduling_queue" | "schedule_return_now";
  scheduledDate: string | null;
  event: ServiceFollowUpProgressEvent;
  index: number;
} | null {
  let latest: {
    childJobId: string;
    bridgeAction: "add_to_scheduling_queue" | "schedule_return_now";
    scheduledDate: string | null;
    event: ServiceFollowUpProgressEvent;
    index: number;
  } | null = null;

  for (const [index, event] of (events ?? []).entries()) {
    const meta = asMetaRecord(event?.meta);
    const bridgeAction = normalize(meta.follow_up_bridge_action).toLowerCase();
    const childJobId = normalize(meta.continued_through_child_job_id);
    if (
      bridgeAction !== "add_to_scheduling_queue" &&
      bridgeAction !== "schedule_return_now"
    ) continue;
    if (!childJobId) continue;
    const continuation = {
      childJobId,
      bridgeAction: bridgeAction as "add_to_scheduling_queue" | "schedule_return_now",
      scheduledDate: normalize(meta.scheduled_date) || null,
      event,
      index,
    };

    if (!latest) {
      latest = continuation;
      continue;
    }

    const currentTs = timestampMs(event?.created_at);
    const latestTs = timestampMs(latest.event?.created_at);
    if (currentTs > latestTs || (currentTs === latestTs && index > latest.index)) {
      latest = continuation;
    }
  }

  return latest;
}

export function parseServiceFollowUpReason(value: unknown): ParsedServiceFollowUpReason | null {
  const text = normalize(value);
  if (!text) return null;

  const lowered = text.toLowerCase();
  for (const entry of REASON_PREFIXES) {
    const prefix = `${entry.label}:`;
    if (!lowered.startsWith(prefix.toLowerCase())) continue;

    const reason = text.slice(prefix.length).trim();
    return {
      family: entry.family,
      label: entry.label,
      reason,
      display: reason ? `${entry.label}: ${reason}` : entry.label,
    };
  }

  return null;
}

export function isServiceFollowUpProgress(value: unknown): value is ServiceFollowUpProgress {
  return (SERVICE_FOLLOW_UP_PROGRESS_VALUES as readonly string[]).includes(normalize(value));
}

export function formatServiceFollowUpProgressLabel(value: ServiceFollowUpProgress | null | undefined): string | null {
  return value ? PROGRESS_LABELS[value] : null;
}

function timestampMs(value: unknown): number {
  const parsed = Date.parse(normalize(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function deriveLatestServiceFollowUpProgress(
  events: ServiceFollowUpProgressEvent[] | null | undefined,
): {
  progress: ServiceFollowUpProgress | null;
  progressLabel: string | null;
  progressEvent: ServiceFollowUpProgressEvent | null;
} {
  let latest: {
    progress: ServiceFollowUpProgress;
    event: ServiceFollowUpProgressEvent;
    index: number;
  } | null = null;

  for (const [index, event] of (events ?? []).entries()) {
    const progress = asMetaRecord(event?.meta).service_follow_up_progress;
    if (!isServiceFollowUpProgress(progress)) continue;

    if (!latest) {
      latest = { progress, event, index };
      continue;
    }

    const currentTs = timestampMs(event?.created_at);
    const latestTs = timestampMs(latest.event?.created_at);
    if (currentTs > latestTs || (currentTs === latestTs && index > latest.index)) {
      latest = { progress, event, index };
    }
  }

  return {
    progress: latest?.progress ?? null,
    progressLabel: latest ? PROGRESS_LABELS[latest.progress] : null,
    progressEvent: latest?.event ?? null,
  };
}

export function buildServiceFollowUpProgressState(params: {
  pendingInfoReason?: string | null;
  events?: ServiceFollowUpProgressEvent[] | null;
}): ServiceFollowUpProgressState {
  const reason = parseServiceFollowUpReason(params.pendingInfoReason);
  const latest = deriveLatestServiceFollowUpProgress(params.events);
  const progress = latest.progress;

  let nextActionLabel: string | null = null;
  let bridgeActionLabel: string | null = null;
  let returnPromptLabel: string | null = null;
  const continuation = deriveLatestServiceFollowUpContinuation(params.events);
  const continuedThroughChildJobId = continuation?.childJobId ?? null;

  if (continuedThroughChildJobId) {
    returnPromptLabel = "Linked return job created";
  } else if (reason?.family === "materials_needed") {
    if (!progress) nextActionLabel = "Mark Part Ordered";
    else if (progress === "part_ordered") nextActionLabel = "Mark Part Arrived";
    else if (progress === "part_arrived") {
      bridgeActionLabel = "Add to Scheduling Queue";
      returnPromptLabel = "Create a linked return visit when ready";
    }
  } else if (reason?.family === "approval_needed") {
    if (!progress) nextActionLabel = "Mark Approval Received";
    else if (progress === "approval_received") {
      bridgeActionLabel = "Add to Scheduling Queue";
      returnPromptLabel = "Create a linked return visit when ready";
    }
  } else if (reason?.family === "other") {
    bridgeActionLabel = "Add to Scheduling Queue";
    returnPromptLabel = "Review follow-up and create a linked return visit when ready";
  }

  return {
    reason,
    progress,
    progressLabel: latest.progressLabel,
    progressEvent: latest.progressEvent,
    nextActionLabel,
    bridgeActionLabel,
    returnPromptLabel,
    continuedThroughChildJobId,
    continuedBridgeAction: continuation?.bridgeAction ?? null,
    continuedScheduledDate: continuation?.scheduledDate ?? null,
  };
}
