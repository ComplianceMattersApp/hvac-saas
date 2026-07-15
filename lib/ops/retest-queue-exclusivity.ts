const RETEST_PARENT_EXCEPTION_STATUSES = new Set([
  "failed",
  "retest_needed",
  "pending_office_review",
]);

export type RetestQueueJob = {
  id?: string | null;
  ops_status?: string | null;
};

export function buildRetestContinuationParentIds(
  rows: Array<{ parent_job_id?: string | null }> | null | undefined,
) {
  return new Set(
    (rows ?? [])
      .map((row) => String(row?.parent_job_id ?? "").trim())
      .filter(Boolean),
  );
}

export function isHistoricalRetestParent(
  job: RetestQueueJob,
  continuationParentIds: ReadonlySet<string>,
) {
  const jobId = String(job?.id ?? "").trim();
  const opsStatus = String(job?.ops_status ?? "").trim().toLowerCase();
  return Boolean(
    jobId &&
      continuationParentIds.has(jobId) &&
      RETEST_PARENT_EXCEPTION_STATUSES.has(opsStatus),
  );
}

export function excludeHistoricalRetestParents<T extends RetestQueueJob>(
  rows: T[] | null | undefined,
  continuationParentIds: ReadonlySet<string>,
) {
  return (rows ?? []).filter((row) => !isHistoricalRetestParent(row, continuationParentIds));
}

export function countCurrentExceptionStatuses(
  rows: RetestQueueJob[] | null | undefined,
  continuationParentIds: ReadonlySet<string>,
) {
  const counts = new Map<string, number>();
  for (const row of excludeHistoricalRetestParents(rows, continuationParentIds)) {
    const status = String(row?.ops_status ?? "").trim().toLowerCase();
    if (status) counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return counts;
}
