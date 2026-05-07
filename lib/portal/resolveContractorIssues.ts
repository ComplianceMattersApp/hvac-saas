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
  // Photo attestation is pending human review — it is not a pass or a fail
  if (run.computed?.status === "photo_evidence") return null;
  if (run.override_pass != null) return Boolean(run.override_pass);
  if (run.computed_pass != null) return Boolean(run.computed_pass);
  return null;
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

export type ContractorFailureDetail = {
  headline: string;
  detail_lines: string[];
};

function safeNum(val: unknown): number | null {
  if (typeof val !== "number" || !Number.isFinite(val)) return null;
  return val;
}

export function extractFailureDetails(run: any): ContractorFailureDetail[] {
  const computed = run?.computed ?? null;
  if (!computed) return [];

  const testType = String(run?.test_type ?? "").trim().toLowerCase();

  if (testType === "airflow") {
    const required = safeNum(computed.required_total_cfm);
    const measured = safeNum(computed.measured_total_cfm);
    if (required == null || measured == null || measured >= required) return [];
    const diff = required - measured;
    const pct = (diff / required) * 100;
    return [
      {
        headline: "Airflow failed",
        detail_lines: [
          `Required minimum: ${Math.round(required)} CFM`,
          `Measured: ${Math.round(measured)} CFM`,
          `Difference: ${Math.round(diff)} CFM below required (${pct.toFixed(1)}% below target)`,
        ],
      },
    ];
  }

  if (testType === "duct_leakage") {
    const maxCfm = safeNum(computed.max_leakage_cfm);
    const measuredCfm = safeNum(computed.measured_duct_leakage_cfm);
    const pctAllowedDisplay = safeNum(computed.leakage_percent_allowed_display);
    const baseCfm = safeNum(computed.base_airflow_cfm);
    if (maxCfm == null || measuredCfm == null || measuredCfm <= maxCfm) return [];
    const diff = measuredCfm - maxCfm;
    const lines: string[] = [];
    if (pctAllowedDisplay != null) {
      lines.push(`Allowed maximum: ${Math.round(maxCfm)} CFM (${pctAllowedDisplay.toFixed(1)}%)`);
    } else {
      lines.push(`Allowed maximum: ${Math.round(maxCfm)} CFM`);
    }
    lines.push(`Measured: ${Math.round(measuredCfm)} CFM`);
    if (baseCfm != null && baseCfm > 0) {
      const actualPct = (measuredCfm / baseCfm) * 100;
      lines.push(`Actual leakage: ${actualPct.toFixed(1)}%`);
      if (pctAllowedDisplay != null) {
        const pctDiff = actualPct - pctAllowedDisplay;
        lines.push(
          `Difference: ${Math.round(diff)} CFM over limit, ${pctDiff.toFixed(1)} percentage points above the ${pctAllowedDisplay.toFixed(1)}% standard`,
        );
      } else {
        const pctOver = (diff / maxCfm) * 100;
        lines.push(`Difference: ${Math.round(diff)} CFM over limit (${pctOver.toFixed(1)}% over maximum)`);
      }
    } else {
      const pctOver = (diff / maxCfm) * 100;
      lines.push(`Difference: ${Math.round(diff)} CFM over limit (${pctOver.toFixed(1)}% over maximum)`);
    }
    return [{ headline: "Duct leakage failed", detail_lines: lines }];
  }

  if (testType === "refrigerant_charge") {
    const rules = computed.rules ?? {};
    const subcoolTolerance = safeNum(rules.subcool_tolerance_f);
    const superheatMax = safeNum(rules.superheat_max_f);
    const measuredSubcool = safeNum(computed.measured_subcool_f);
    const subcoolDelta = safeNum(computed.subcool_delta_f);
    const measuredSuperheat = safeNum(computed.measured_superheat_f);
    const details: ContractorFailureDetail[] = [];

    if (
      measuredSubcool != null &&
      subcoolDelta != null &&
      subcoolTolerance != null &&
      Math.abs(subcoolDelta) > subcoolTolerance
    ) {
      const targetSubcool = measuredSubcool - subcoolDelta;
      details.push({
        headline: "Refrigerant charge failed – Subcooling",
        detail_lines: [
          `Target subcooling: ${targetSubcool.toFixed(1)}°F`,
          `Allowed range: ±${subcoolTolerance.toFixed(1)}°F`,
          `Measured: ${measuredSubcool.toFixed(1)}°F`,
          `Difference: ${Math.abs(subcoolDelta).toFixed(1)}°F outside allowed range`,
        ],
      });
    }

    if (measuredSuperheat != null && superheatMax != null && measuredSuperheat >= superheatMax) {
      const diff = measuredSuperheat - superheatMax;
      details.push({
        headline: "Refrigerant charge failed – Superheat",
        detail_lines: [
          `Maximum allowed superheat: ${superheatMax.toFixed(1)}°F`,
          `Measured: ${measuredSuperheat.toFixed(1)}°F`,
          `Difference: ${diff.toFixed(1)}°F over limit`,
        ],
      });
    }

    return details;
  }

  return [];
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
        "Please provide the requested information so work can continue.",
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
      : primaryIssue.headline;

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
