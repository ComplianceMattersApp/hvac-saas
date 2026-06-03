type Confidence = "high" | "medium" | "low";

type ScheduleSnapshot = {
  scheduled_date: string | null;
  window_start: string | null;
  window_end: string | null;
};

export type JobHistorySummaryJobInput = {
  id: string;
  status: string | null;
  ops_status: string | null;
  field_complete: boolean | null;
  scheduled_date: string | null;
  window_start: string | null;
  window_end: string | null;
  parent_job_id?: string | null;
  pending_info_reason?: string | null;
  on_hold_reason?: string | null;
};

export type JobHistorySummaryEventInput = {
  event_type: string | null;
  created_at?: string | null;
  meta?: unknown;
};

export type JobHistorySummaryLinkedJobInput = {
  id: string;
  status: string | null;
  ops_status: string | null;
  parent_job_id?: string | null;
};

export type JobHistorySummaryFact = {
  code: string;
  value: string;
  source: "job" | "event" | "linked_job";
};

export type JobHistorySummary = {
  headline: string;
  currentState: string;
  story: string[];
  nextAction: string | null;
  confidence: Confidence;
  facts: JobHistorySummaryFact[];
  gaps: string[];
};

export type BuildJobHistorySummaryInput = {
  job: JobHistorySummaryJobInput;
  events: JobHistorySummaryEventInput[];
  linkedJobs?: JobHistorySummaryLinkedJobInput[];
};

type NormalizedEvent = {
  eventType: string;
  createdAt: string | null;
  meta: Record<string, unknown>;
  timelineVersion: number | null;
  eventFamily: string | null;
  actorUserId: string | null;
};

const DEFAULT_SCHEDULE: ScheduleSnapshot = {
  scheduled_date: null,
  window_start: null,
  window_end: null,
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeStatus(value: unknown): string {
  return clean(value).toLowerCase();
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function parseScheduleSnapshot(value: unknown): ScheduleSnapshot {
  const row = asObject(value);
  return {
    scheduled_date: clean(row.scheduled_date) || null,
    window_start: clean(row.window_start) || null,
    window_end: clean(row.window_end) || null,
  };
}

function hasSchedule(snapshot: ScheduleSnapshot): boolean {
  return Boolean(snapshot.scheduled_date || snapshot.window_start || snapshot.window_end);
}

function formatSchedule(snapshot: ScheduleSnapshot): string {
  const date = snapshot.scheduled_date;
  const window = [snapshot.window_start, snapshot.window_end].filter(Boolean).join("-");

  if (date && window) return `${date} ${window}`;
  if (date) return date;
  if (window) return window;
  return "unscheduled";
}

function parseReason(meta: Record<string, unknown>): string | null {
  const directReason = clean(meta.reason);
  if (directReason) return directReason;

  const blockerReason = clean(meta.blocker_reason);
  if (blockerReason) return blockerReason;

  const blockerContext = asObject(meta.blocker_context);
  const holdReason = clean(blockerContext.hold_reason);
  if (holdReason) return holdReason;

  const pendingReason = clean(blockerContext.pending_reason);
  if (pendingReason) return pendingReason;

  return null;
}

function normalizeEvent(input: JobHistorySummaryEventInput): NormalizedEvent {
  const meta = asObject(input.meta);
  const timelineRaw = Number(meta.timeline_v);
  return {
    eventType: normalizeStatus(input.event_type),
    createdAt: clean(input.created_at) || null,
    meta,
    timelineVersion: Number.isFinite(timelineRaw) ? timelineRaw : null,
    eventFamily: clean(meta.event_family).toLowerCase() || null,
    actorUserId: clean(meta.actor_user_id) || null,
  };
}

function sortByCreatedAtAsc(events: NormalizedEvent[]): NormalizedEvent[] {
  return [...events].sort((a, b) => {
    const left = Date.parse(a.createdAt ?? "");
    const right = Date.parse(b.createdAt ?? "");
    const leftMs = Number.isFinite(left) ? left : 0;
    const rightMs = Number.isFinite(right) ? right : 0;
    return leftMs - rightMs;
  });
}

function isClosedLike(status: string, opsStatus: string): boolean {
  if (opsStatus) {
    return opsStatus === "closed";
  }
  return status === "closed" || status === "completed";
}

function latestSchedulingEvent(events: NormalizedEvent[]): NormalizedEvent | null {
  const schedulingEvents = events.filter((event) => {
    if (["scheduled", "unscheduled", "schedule_updated"].includes(event.eventType)) return true;
    return event.eventFamily === "scheduling";
  });

  if (schedulingEvents.length === 0) return null;
  return schedulingEvents[schedulingEvents.length - 1];
}

function getPreviousAndNextSchedule(event: NormalizedEvent): {
  previous: ScheduleSnapshot;
  next: ScheduleSnapshot;
} {
  const previous = parseScheduleSnapshot(event.meta.previous || event.meta.before);
  const next = parseScheduleSnapshot(event.meta.next || event.meta.after);
  return { previous, next };
}

function latestOpsBlockerEvent(events: NormalizedEvent[]): NormalizedEvent | null {
  const opsEvents = events.filter((event) => {
    if (event.eventType !== "ops_update") return false;
    if (event.eventFamily === "ops_blocker") return true;
    return true;
  });

  if (opsEvents.length === 0) return null;
  return opsEvents[opsEvents.length - 1];
}

function latestRetestCreatedEvent(events: NormalizedEvent[]): NormalizedEvent | null {
  const retestEvents = events.filter((event) => event.eventType === "retest_created");
  if (retestEvents.length === 0) return null;
  return retestEvents[retestEvents.length - 1];
}

function buildHeadline(stateLabel: string, closedLike: boolean): string {
  if (closedLike) return "Closed";

  switch (stateLabel) {
    case "scheduled":
      return "Scheduled";
    case "need_to_schedule":
      return "Needs scheduling";
    case "invoice_required":
      return "Invoice follow-up needed";
    case "paperwork_required":
      return "Paperwork needed";
    case "pending_info":
      return "Waiting on information";
    case "on_hold":
      return "On hold";
    case "failed":
      return "Correction or retest needed";
    default:
      return "In progress";
  }
}

export function buildJobHistorySummary(input: BuildJobHistorySummaryInput): JobHistorySummary {
  const jobStatus = normalizeStatus(input.job.status);
  const opsStatus = normalizeStatus(input.job.ops_status);
  const fieldComplete = Boolean(input.job.field_complete);
  const scheduleFromJob = parseScheduleSnapshot(input.job);
  const linkedJobs = Array.isArray(input.linkedJobs) ? input.linkedJobs : [];
  const events = sortByCreatedAtAsc((Array.isArray(input.events) ? input.events : []).map(normalizeEvent));

  const facts: JobHistorySummaryFact[] = [];
  const gaps = new Set<string>();
  const operationalStory: string[] = [];
  const scheduleStory: string[] = [];
  const relationshipStory: string[] = [];

  const closedLike = isClosedLike(jobStatus, opsStatus);
  const stateLabel = opsStatus || jobStatus || "open";

  facts.push({ code: "job_state", value: stateLabel, source: "job" });

  if (hasSchedule(scheduleFromJob)) {
    facts.push({ code: "current_schedule", value: formatSchedule(scheduleFromJob), source: "job" });
    scheduleStory.push(`Currently scheduled for ${formatSchedule(scheduleFromJob)}.`);
  }

  const scheduleEvent = latestSchedulingEvent(events);
  if (scheduleEvent) {
    const { previous, next } = getPreviousAndNextSchedule(scheduleEvent);
    const changed = formatSchedule(previous) !== formatSchedule(next);

    if (changed && hasSchedule(previous) && hasSchedule(next)) {
      scheduleStory.push(`Rescheduled from ${formatSchedule(previous)} to ${formatSchedule(next)}.`);
      facts.push({ code: "schedule_change", value: `${formatSchedule(previous)} -> ${formatSchedule(next)}`, source: "event" });
    }

    if (!scheduleEvent.actorUserId) {
      gaps.add("missing_actor");
    }
  } else if (hasSchedule(scheduleFromJob) && opsStatus !== "scheduled") {
    gaps.add("missing_schedule_change_event");
  }

  const opsEvent = latestOpsBlockerEvent(events);
  const blockerReason =
    parseReason(opsEvent?.meta ?? {}) ||
    clean(opsStatus === "on_hold" ? input.job.on_hold_reason : input.job.pending_info_reason) ||
    null;

  if (opsStatus === "on_hold") {
    operationalStory.push(
      blockerReason
        ? `Job is on hold: ${blockerReason}.`
        : "Job is on hold pending blocker release.",
    );
    facts.push({ code: "ops_status", value: "on_hold", source: "job" });
    if (!blockerReason) gaps.add("missing_hold_reason");
  }

  if (opsStatus === "pending_info") {
    operationalStory.push(
      blockerReason
        ? `Job is waiting on info: ${blockerReason}.`
        : "Job is waiting on additional information.",
    );
    facts.push({ code: "ops_status", value: "pending_info", source: "job" });
    if (!blockerReason) gaps.add("missing_pending_info_reason");
  }

  if (fieldComplete && !closedLike) {
    operationalStory.push("Field work is complete, but closeout steps are still open.");
    facts.push({ code: "field_complete", value: "true", source: "job" });
  }

  if (opsStatus === "failed" || jobStatus === "failed") {
    operationalStory.push("Job is in failed/exception state and needs correction or retest attention.");
    facts.push({ code: "failed_state", value: "true", source: "job" });
  }

  if (opsStatus === "paperwork_required") {
    operationalStory.push("Paperwork is still required.");
  }

  if (opsStatus === "invoice_required") {
    operationalStory.push("Invoice follow-up is still required.");
  }

  if (closedLike) {
    operationalStory.push("Job is closed/completed.");
  }

  const retestEvent = latestRetestCreatedEvent(events);
  const retestEventChildId = clean(asObject(retestEvent?.meta ?? {}).child_job_id) || null;
  const linkedChildren = linkedJobs.filter((job) => clean(job.parent_job_id) === clean(input.job.id));

  if (retestEvent || linkedChildren.length > 0) {
    const linkedCount = linkedChildren.length;
    if (linkedCount > 0) {
      relationshipStory.push(
        linkedCount === 1
          ? "A linked retest/follow-up job exists."
          : `${linkedCount} linked retest/follow-up jobs exist.`,
      );
      facts.push({ code: "linked_retest_count", value: String(linkedCount), source: "linked_job" });
    } else {
      relationshipStory.push("A retest/follow-up was created.");
      facts.push({ code: "retest_created", value: "true", source: "event" });
    }

    if (retestEvent && !retestEventChildId && linkedCount === 0) {
      gaps.add("linked_job_context_incomplete");
    }

    const closedLinkedChild = linkedChildren.find((child) =>
      isClosedLike(normalizeStatus(child.status), normalizeStatus(child.ops_status)),
    );
    if (closedLinkedChild) {
      relationshipStory.push("A linked retest/follow-up job is complete.");
      facts.push({ code: "linked_retest_closed", value: closedLinkedChild.id, source: "linked_job" });
    }
  }

  if (clean(input.job.parent_job_id)) {
    relationshipStory.push("This job is a follow-up/retest linked to another job.");
    facts.push({ code: "parent_job_id", value: clean(input.job.parent_job_id), source: "job" });
  }

  const story = [...operationalStory, ...scheduleStory, ...relationshipStory];

  let nextAction: string | null = null;
  if (closedLike) {
    nextAction = null;
  } else if (opsStatus === "on_hold") {
    nextAction = "Release hold and update schedule when ready.";
  } else if (opsStatus === "pending_info") {
    nextAction = "Collect missing information and clear pending-info blocker.";
  } else if (opsStatus === "failed" || jobStatus === "failed") {
    nextAction = "Review failure details and schedule correction or retest steps.";
  } else if (opsStatus === "paperwork_required") {
    nextAction = "Complete required paperwork for closeout.";
  } else if (opsStatus === "invoice_required") {
    nextAction = "Complete invoice follow-up to finish closeout.";
  } else if (fieldComplete) {
    nextAction = "Complete remaining closeout steps.";
  } else if (hasSchedule(scheduleFromJob)) {
    nextAction = "Execute scheduled field work and capture field notes.";
  } else {
    nextAction = "Schedule the next visit.";
  }

  const hasNormalizedSupport = Boolean(
    events.find((event) => {
      if (event.timelineVersion !== 1) return false;
      if (event.eventFamily === "scheduling" && hasSchedule(scheduleFromJob)) return true;
      if (event.eventFamily === "ops_blocker" && ["on_hold", "pending_info", "failed"].includes(opsStatus)) {
        return true;
      }
      return false;
    }),
  );

  let confidence: Confidence = "low";
  const hasCoreState = Boolean(clean(input.job.id) && (stateLabel || hasSchedule(scheduleFromJob)));

  if (hasCoreState && hasNormalizedSupport) {
    confidence = "high";
  } else if (hasCoreState) {
    confidence = "medium";
  }

  if (confidence === "high" && gaps.size > 0) {
    confidence = "medium";
  }
  if (gaps.size >= 2 && confidence === "medium") {
    confidence = "low";
  }

  if (story.length === 0) {
    story.push("Insufficient historical evidence to summarize beyond current job state.");
  }

  const headline = buildHeadline(stateLabel, closedLike);
  const currentState = stateLabel.replace(/_/g, " ");

  return {
    headline,
    currentState,
    story,
    nextAction,
    confidence,
    facts,
    gaps: Array.from(gaps),
  };
}