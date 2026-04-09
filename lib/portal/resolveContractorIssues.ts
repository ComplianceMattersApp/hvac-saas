import { displayWindowLA, formatBusinessDateUS } from "@/lib/utils/schedule-la";

export type ContractorIssueGroup = "needs_info" | "failed" | "in_progress" | "passed";

export type ContractorBucket = "action_required" | "in_progress" | "passed";

export type ContractorIssue = {
  group: ContractorIssueGroup;
  headline: string;
  explanation?: string;
  detailLines?: string[];
  stage?: string;
};

export type ContractorSafeEvent = {
  event_type?: string | null;
  created_at?: string | null;
  meta?: Record<string, unknown> | null;
};

export type ResolveContractorIssuesInput = {
  job: {
    id: string;
    ops_status?: string | null;
    pending_info_reason?: string | null;
    follow_up_date?: string | null;
    next_action_note?: string | null;
    action_required_by?: string | null;
    scheduled_date?: string | null;
    window_start?: string | null;
    window_end?: string | null;
  };
  failureReasons?: string[];
  events?: ContractorSafeEvent[];
  chain?: {
    hasOpenRetestChild?: boolean;
    hasRetestReadyRequest?: boolean;
    retestScheduledDate?: string | null;
    retestWindowStart?: string | null;
    retestWindowEnd?: string | null;
  };
};

export type ResolveContractorIssuesOutput = {
  bucket: ContractorBucket;
  primaryIssue: ContractorIssue;
  secondaryIssues?: ContractorIssue[];
  statusLabel: string;
  nextStep: string;
  actionRequired: boolean;
  retestState: "none" | "pending_scheduling" | "scheduled";
};

export type ContractorResponseType = "note" | "correction" | "retest";

export type ContractorResponseTracking = {
  latestReportSentAt: string | null;
  hasContractorResponse: boolean;
  waitingOnContractor: boolean;
  awaitingInternalReview: boolean;
  lastResponseType: ContractorResponseType | null;
  lastResponseAt: string | null;
};

function formatRetestSchedule(chain?: ResolveContractorIssuesInput["chain"]): string {
  const date = String(chain?.retestScheduledDate ?? "").trim();
  const start = String(chain?.retestWindowStart ?? "").trim() || null;
  const end = String(chain?.retestWindowEnd ?? "").trim() || null;

  const renderedDate = date ? formatBusinessDateUS(date) : "";
  const renderedWindow = displayWindowLA(start, end);

  if (renderedDate && renderedWindow) return `${renderedDate} ${renderedWindow}`;
  return renderedDate || renderedWindow || "";
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export function finalRunPass(run: any): boolean | null {
  if (!run) return null;
  return run.override_pass != null ? Boolean(run.override_pass) : Boolean(run.computed_pass);
}

export function extractFailureReasons(run: any): string[] {
  const computed = run?.computed ?? null;
  if (!computed) return [];

  const failures = Array.isArray(computed.failures)
    ? computed.failures.map(String).map((s: string) => s.trim()).filter(Boolean)
    : [];

  if (failures.length > 0) {
    return Array.from(new Set(failures));
  }

  const warnings = Array.isArray(computed.warnings)
    ? computed.warnings.map(String).map((s: string) => s.trim()).filter(Boolean)
    : [];

  return Array.from(new Set(warnings));
}

function inProgressHeadline(opsStatus: string): string {
  if (opsStatus === "need_to_schedule") return "Waiting for scheduling";
  if (opsStatus === "scheduled") return "Scheduled";
  if (opsStatus === "on_hold") return "On hold";
  return "In progress";
}

function toMs(value: string | null | undefined): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

function responseTypeForEvent(type: string): ContractorResponseType | null {
  if (type === "contractor_note") return "note";
  if (type === "contractor_correction_submission") return "correction";
  if (type === "retest_ready_requested") return "retest";
  return null;
}

export function resolveContractorResponseTracking(
  eventsInput?: ContractorSafeEvent[]
): ContractorResponseTracking {
  const events = eventsInput ?? [];

  const reportEvents = events.filter(
    (e) => normalize(e?.event_type) === "contractor_report_sent"
  );

  if (reportEvents.length === 0) {
    return {
      latestReportSentAt: null,
      hasContractorResponse: false,
      waitingOnContractor: false,
      awaitingInternalReview: false,
      lastResponseType: null,
      lastResponseAt: null,
    };
  }

  const latestReport = reportEvents.reduce((latest, current) => {
    if (!latest) return current;
    const latestMs = toMs(latest.created_at);
    const currentMs = toMs(current.created_at);

    if (latestMs == null && currentMs != null) return current;
    if (latestMs != null && currentMs == null) return latest;
    if (latestMs == null && currentMs == null) return latest;

    return currentMs! > latestMs! ? current : latest;
  }, null as ContractorSafeEvent | null);

  const latestReportSentAt = String(latestReport?.created_at ?? "").trim() || null;
  const latestReportMs = toMs(latestReport?.created_at);

  const postReportEvents =
    latestReportMs == null
      ? []
      : events.filter((e) => {
          const ms = toMs(e?.created_at);
          return ms != null && ms > latestReportMs;
        });

  const responseEvents = postReportEvents
    .map((e) => {
      const eventType = normalize(e?.event_type);
      const responseType = responseTypeForEvent(eventType);
      return responseType
        ? {
            responseType,
            createdAt: String(e?.created_at ?? "").trim() || null,
            createdAtMs: toMs(e?.created_at),
          }
        : null;
    })
    .filter((e): e is { responseType: ContractorResponseType; createdAt: string | null; createdAtMs: number | null } => Boolean(e));

  if (responseEvents.length === 0) {
    return {
      latestReportSentAt,
      hasContractorResponse: false,
      waitingOnContractor: true,
      awaitingInternalReview: false,
      lastResponseType: null,
      lastResponseAt: null,
    };
  }

  const lastResponse = responseEvents.reduce((latest, current) => {
    if (!latest) return current;
    if (latest.createdAtMs == null && current.createdAtMs != null) return current;
    if (latest.createdAtMs != null && current.createdAtMs == null) return latest;
    if (latest.createdAtMs == null && current.createdAtMs == null) return latest;
    return current.createdAtMs! > latest.createdAtMs! ? current : latest;
  }, null as { responseType: ContractorResponseType; createdAt: string | null; createdAtMs: number | null } | null);

  return {
    latestReportSentAt,
    hasContractorResponse: true,
    waitingOnContractor: false,
    awaitingInternalReview: true,
    lastResponseType: lastResponse?.responseType ?? null,
    lastResponseAt: lastResponse?.createdAt ?? null,
  };
}

export function resolveContractorIssues(
  input: ResolveContractorIssuesInput
): ResolveContractorIssuesOutput {
  const opsStatus = normalize(input.job.ops_status);
  const pendingInfoReason = String(input.job.pending_info_reason ?? "").trim();
  const nextActionNote = String(input.job.next_action_note ?? "").trim();
  const failureReasons = (input.failureReasons ?? []).map(String).map((s) => s.trim()).filter(Boolean);
  const hasOpenRetestChild = Boolean(input.chain?.hasOpenRetestChild);
  const retestSchedule = hasOpenRetestChild ? formatRetestSchedule(input.chain) : "";
  const retestState: "none" | "pending_scheduling" | "scheduled" =
    hasOpenRetestChild
      ? retestSchedule
        ? "scheduled"
        : "pending_scheduling"
      : "none";

  let primaryIssue: ContractorIssue;

  if (opsStatus === "pending_info") {
    primaryIssue = {
      group: "needs_info",
      headline: pendingInfoReason || "Details requested",
      explanation:
        nextActionNote || "Please provide the requested information so work can continue.",
      detailLines: pendingInfoReason ? [pendingInfoReason] : undefined,
      stage: "needs_info",
    };
  } else if (opsStatus === "pending_office_review") {
    primaryIssue = {
      group: "in_progress",
      headline: "Under review",
      explanation: "Corrections submitted. Our team is reviewing your submission.",
      detailLines: failureReasons.length > 0 ? failureReasons : undefined,
      stage: "pending_office_review",
    };
  } else if (opsStatus === "failed" || opsStatus === "retest_needed") {
    if (retestState === "scheduled") {
      primaryIssue = {
        group: "in_progress",
        headline: `Retest scheduled for ${retestSchedule}`,
        explanation: "Retest scheduled for visit. No Immediate Action is required.",
        stage: "retest_scheduled",
      };
    } else if (retestState === "pending_scheduling") {
      primaryIssue = {
        group: "failed",
        headline: "Retest Pending Scheduling",
        explanation: "Retest child exists but still needs a scheduled date/time.",
        stage: "retest_pending_scheduling",
      };
    } else {
      primaryIssue = {
        group: "failed",
        headline: "Failed - Action needed",
        explanation: "Please correct the failed items and submit for review.",
        detailLines: failureReasons.length > 0 ? failureReasons : undefined,
        stage: "action_needed",
      };
    }
  } else if (["need_to_schedule", "scheduled", "on_hold"].includes(opsStatus)) {
    primaryIssue = {
      group: "in_progress",
      headline: inProgressHeadline(opsStatus),
      explanation:
        opsStatus === "need_to_schedule"
          ? "We are working to schedule this job."
          : opsStatus === "scheduled"
            ? "Your visit is scheduled."
            : "This job is currently on hold.",
      stage: opsStatus,
    };
  } else if (["paperwork_required", "invoice_required"].includes(opsStatus)) {
    primaryIssue = {
      group: "in_progress",
      headline: "Final processing",
      explanation: "This job has passed inspection and is in final processing.",
      stage: opsStatus,
    };
  } else if (opsStatus === "closed") {
    primaryIssue = {
      group: "passed",
      headline: "Passed",
      explanation: "This job is complete.",
      stage: opsStatus,
    };
  } else {
    primaryIssue = {
      group: "in_progress",
      headline: "In progress",
      explanation: "Work is in progress.",
      stage: "unknown",
    };
  }

  const bucket: ContractorBucket =
    primaryIssue.group === "needs_info" || primaryIssue.group === "failed"
      ? "action_required"
      : primaryIssue.group === "passed"
      ? "passed"
      : "in_progress";

  const secondaryIssues: ContractorIssue[] = [];

  let statusLabel =
    primaryIssue.group === "failed"
      ? "Failed"
      : primaryIssue.group === "needs_info"
      ? "Needs Info"
      : primaryIssue.group === "passed"
      ? "Passed"
      : "In Progress";

  let nextStep = primaryIssue.explanation ?? primaryIssue.headline;

  if (opsStatus === "failed" || opsStatus === "retest_needed") {
    if (retestState === "scheduled") {
      statusLabel = "Retest Scheduled";
      nextStep = `Retest scheduled for ${retestSchedule}`;
    } else if (retestState === "pending_scheduling") {
      statusLabel = "Retest Pending Scheduling";
      nextStep = "Retest needs to be scheduled";
    } else {
      statusLabel = "Failed";
      nextStep = "Retest decision needed.";
    }
  } else if (opsStatus === "pending_office_review") {
    statusLabel = "Under Review";
    nextStep = "Corrections submitted. Our team is reviewing your submission.";
  }

  const actionRequired = bucket === "action_required";

  return {
    bucket,
    primaryIssue,
    secondaryIssues: secondaryIssues.length > 0 ? secondaryIssues : undefined,
    statusLabel,
    nextStep,
    actionRequired,
    retestState,
  };
}
