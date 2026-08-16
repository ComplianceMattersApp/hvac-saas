import { formatFailedEccQueueReasonFromRun } from "@/lib/ops/focused-queues";
import { extractFailureReasons } from "@/lib/portal/resolveContractorIssues";

export type OpsWorkspaceFailedRunEvidence = Record<string, unknown> & {
  job_id?: unknown;
  created_at?: unknown;
  test_type?: unknown;
};

export type OpsWorkspaceJobEventEvidence = Record<string, unknown> & {
  job_id?: unknown;
  event_type?: unknown;
  created_at?: unknown;
  message?: unknown;
  meta?: unknown;
};

export type OpsWorkspaceEvidenceIndex = {
  followUpEnteredAtByJob: Map<string, string>;
  latestJobEventByJob: Map<string, OpsWorkspaceJobEventEvidence>;
  latestContractorReportSentAtByJob: Map<string, string>;
  latestFailedRunByJob: Map<string, OpsWorkspaceFailedRunEvidence>;
  primaryFailureReasonByJob: Map<string, string>;
};

export function opsWorkspaceEvidenceEpochMs(value: unknown): number {
  const timestamp = new Date(String(value ?? "")).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeRows<T extends Record<string, unknown>>(rows: readonly unknown[]): T[] {
  return rows.flatMap((row) => {
    const record = asRecord(row);
    return record ? [record as T] : [];
  });
}

function setLatestByCreatedAt<T extends { created_at?: unknown }>(
  target: Map<string, T>,
  jobId: string,
  candidate: T,
) {
  const current = target.get(jobId);
  if (
    !current ||
    opsWorkspaceEvidenceEpochMs(candidate.created_at) >
      opsWorkspaceEvidenceEpochMs(current.created_at)
  ) {
    target.set(jobId, candidate);
  }
}

function buildLatestFailedRunByJob(
  runs: readonly unknown[],
): Map<string, OpsWorkspaceFailedRunEvidence> {
  const latestByJob = new Map<string, OpsWorkspaceFailedRunEvidence>();
  for (const run of normalizeRows<OpsWorkspaceFailedRunEvidence>(runs)) {
    const jobId = String(run.job_id ?? "").trim();
    if (jobId) setLatestByCreatedAt(latestByJob, jobId, run);
  }
  return latestByJob;
}

function buildPrimaryFailureReasonByJob(
  latestFailedRunByJob: ReadonlyMap<string, OpsWorkspaceFailedRunEvidence>,
): Map<string, string> {
  const reasonByJob = new Map<string, string>();
  for (const [jobId, run] of latestFailedRunByJob) {
    const primaryLine = extractFailureReasons(run)[0] ?? "";
    const typedReason = formatFailedEccQueueReasonFromRun(run);
    const reason = typedReason || (primaryLine.trim() ? "Correction Required" : "");
    if (reason) reasonByJob.set(jobId, reason);
  }
  return reasonByJob;
}

function buildLatestJobEventByJob(
  events: readonly OpsWorkspaceJobEventEvidence[],
): Map<string, OpsWorkspaceJobEventEvidence> {
  const latestByJob = new Map<string, OpsWorkspaceJobEventEvidence>();
  for (const event of events) {
    const jobId = String(event.job_id ?? "").trim();
    if (jobId) setLatestByCreatedAt(latestByJob, jobId, event);
  }
  return latestByJob;
}

function buildLatestContractorReportSentAtByJob(
  events: readonly OpsWorkspaceJobEventEvidence[],
): Map<string, string> {
  const sentAtByJob = new Map<string, string>();
  for (const event of events) {
    if (String(event.event_type ?? "").trim() !== "contractor_report_sent") continue;

    const jobId = String(event.job_id ?? "").trim();
    const meta = asRecord(event.meta);
    const sentAt = String(meta?.sent_at_iso ?? event.created_at ?? "").trim();
    if (!jobId || !sentAt) continue;

    const current = sentAtByJob.get(jobId);
    if (!current || opsWorkspaceEvidenceEpochMs(sentAt) > opsWorkspaceEvidenceEpochMs(current)) {
      sentAtByJob.set(jobId, sentAt);
    }
  }
  return sentAtByJob;
}

function buildFollowUpEnteredAtByJob(
  events: readonly OpsWorkspaceJobEventEvidence[],
): Map<string, string> {
  const enteredAtByJob = new Map<string, string>();
  for (const event of events) {
    const jobId = String(event.job_id ?? "").trim();
    const createdAt = String(event.created_at ?? "").trim();
    if (!jobId || !createdAt) continue;

    const changes = asRecord(event.meta)?.changes;
    const enteredReminder = Array.isArray(changes) && changes.some((change) => {
      const record = asRecord(change);
      const field = String(record?.field ?? "").trim().toLowerCase();
      return (
        ["follow_up_date", "next_action_note", "action_required_by"].includes(field) &&
        Boolean(String(record?.to ?? "").trim())
      );
    });
    if (!enteredReminder) continue;

    const current = enteredAtByJob.get(jobId);
    if (!current || opsWorkspaceEvidenceEpochMs(createdAt) > opsWorkspaceEvidenceEpochMs(current)) {
      enteredAtByJob.set(jobId, createdAt);
    }
  }
  return enteredAtByJob;
}

export function buildOpsWorkspaceEvidenceIndex(params: {
  jobEvents?: readonly unknown[];
  contractorReportEvents?: readonly unknown[];
  failedRuns?: readonly unknown[];
} = {}): OpsWorkspaceEvidenceIndex {
  const jobEvents = normalizeRows<OpsWorkspaceJobEventEvidence>(params.jobEvents ?? []);
  const contractorReportEvents = normalizeRows<OpsWorkspaceJobEventEvidence>(
    params.contractorReportEvents ?? [],
  );
  const latestFailedRunByJob = buildLatestFailedRunByJob(params.failedRuns ?? []);

  return {
    followUpEnteredAtByJob: buildFollowUpEnteredAtByJob(jobEvents),
    latestJobEventByJob: buildLatestJobEventByJob(jobEvents),
    latestContractorReportSentAtByJob:
      buildLatestContractorReportSentAtByJob(contractorReportEvents),
    latestFailedRunByJob,
    primaryFailureReasonByJob: buildPrimaryFailureReasonByJob(latestFailedRunByJob),
  };
}
