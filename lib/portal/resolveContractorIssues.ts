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
  };
};

export type ResolveContractorIssuesOutput = {
  bucket: ContractorBucket;
  primaryIssue: ContractorIssue;
  secondaryIssues?: ContractorIssue[];
};

const PRIORITY: Record<ContractorIssueGroup, number> = {
  needs_info: 1,
  failed: 2,
  in_progress: 3,
  passed: 4,
};

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

export function resolveContractorIssues(
  input: ResolveContractorIssuesInput
): ResolveContractorIssuesOutput {
  const opsStatus = normalize(input.job.ops_status);
  const pendingInfoReason = String(input.job.pending_info_reason ?? "").trim();
  const nextActionNote = String(input.job.next_action_note ?? "").trim();
  const failureReasons = (input.failureReasons ?? []).map(String).map((s) => s.trim()).filter(Boolean);
  const events = input.events ?? [];

  const hasCorrectionSubmission = events.some(
    (e) => normalize(e?.event_type) === "contractor_correction_submission"
  );

  const issues: ContractorIssue[] = [];

  if (opsStatus === "pending_info") {
    issues.push({
      group: "needs_info",
      headline: pendingInfoReason || "Need information from you",
      explanation:
        nextActionNote || "Please provide the requested information so work can continue.",
      detailLines: pendingInfoReason ? [pendingInfoReason] : undefined,
      stage: "needs_info",
    });
  }

  if (opsStatus === "failed" || opsStatus === "retest_needed") {
    const stage = hasCorrectionSubmission ? "awaiting_review" : "action_needed";

    issues.push({
      group: "failed",
      headline:
        stage === "awaiting_review"
          ? "Failed - Awaiting review"
          : "Failed - Action needed",
      explanation:
        stage === "awaiting_review"
          ? "Corrections submitted. Our team is reviewing your submission."
          : "Please correct the failed items and submit for review.",
      detailLines: failureReasons.length > 0 ? failureReasons : undefined,
      stage,
    });
  }

  if (["need_to_schedule", "scheduled", "on_hold"].includes(opsStatus)) {
    issues.push({
      group: "in_progress",
      headline: inProgressHeadline(opsStatus),
      explanation: "Work is in progress.",
      stage: opsStatus,
    });
  }

  if (["paperwork_required", "invoice_required", "closed"].includes(opsStatus)) {
    issues.push({
      group: "passed",
      headline: "Passed",
      explanation:
        opsStatus === "closed"
          ? "This job is complete."
          : "This job has passed and is in final processing.",
      stage: opsStatus,
    });
  }

  if (issues.length === 0) {
    issues.push({
      group: "in_progress",
      headline: "In progress",
      explanation: "Work is in progress.",
      stage: "unknown",
    });
  }

  issues.sort((a, b) => PRIORITY[a.group] - PRIORITY[b.group]);

  const primaryIssue = issues[0];
  const hasBlockingPrimary = primaryIssue.group === "needs_info" || primaryIssue.group === "failed";

  const secondaryIssues = issues
    .slice(1)
    .filter((issue) => {
      if (!hasBlockingPrimary) return true;
      return issue.group === "needs_info" || issue.group === "failed";
    });

  const hasBlockingIssue = issues.some(
    (issue) => issue.group === "needs_info" || issue.group === "failed"
  );

  const bucket: ContractorBucket = hasBlockingIssue
    ? "action_required"
    : issues.some((issue) => issue.group === "in_progress")
    ? "in_progress"
    : "passed";

  return {
    bucket,
    primaryIssue,
    secondaryIssues: secondaryIssues.length > 0 ? secondaryIssues : undefined,
  };
}
