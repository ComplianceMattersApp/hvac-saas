import {
  isActiveFieldWorkStatus,
  isScheduledAssignedMyWorkEligible,
} from "@/lib/ops/queue-status-contracts";

export type FieldQueueJob = {
  id: string;
  title?: string | null;
  status?: string | null;
  scheduled_date?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  field_complete?: boolean | null;
};

export type GroupedFieldJobs<T extends FieldQueueJob> = {
  inProgress: T[];
  today: T[];
  overdue: T[];
  upcoming: T[];
};

function isLifecycleComplete(job: FieldQueueJob): boolean {
  const status = String(job?.status ?? "").toLowerCase();
  return ["completed", "closed", "cancelled"].includes(status);
}

function sortBySchedule<T extends FieldQueueJob>(a: T, b: T): number {
  const dateDiff = String(a?.scheduled_date ?? "").localeCompare(String(b?.scheduled_date ?? ""));
  if (dateDiff !== 0) return dateDiff;

  const windowDiff = String(a?.window_start ?? "").localeCompare(String(b?.window_start ?? ""));
  if (windowDiff !== 0) return windowDiff;

  const titleDiff = String(a?.title ?? "").localeCompare(String(b?.title ?? ""), undefined, {
    sensitivity: "base",
    numeric: true,
  });
  if (titleDiff !== 0) return titleDiff;

  return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
}

/**
 * Groups a tech's assigned jobs into the My Work sections: jobs already
 * underway, jobs scheduled for today, overdue jobs (most recent first),
 * and upcoming scheduled jobs. `todayLA` is the account's "today" business
 * date (YYYY-MM-DD) so callers control the timezone/clock source.
 */
export function groupFieldJobs<T extends FieldQueueJob>(
  jobs: T[],
  todayLA: string,
): GroupedFieldJobs<T> {
  const activeJobs = (jobs ?? []).filter((job) => {
    if (isLifecycleComplete(job)) return false;
    if (Boolean(job?.field_complete)) return false;
    return true;
  });

  const visibleMyWorkJobs = activeJobs.filter((job) =>
    isScheduledAssignedMyWorkEligible({
      status: job?.status,
      scheduledDate: job?.scheduled_date,
      fieldComplete: job?.field_complete,
    }),
  );

  const inProgress = visibleMyWorkJobs
    .filter((job) => isActiveFieldWorkStatus(job?.status))
    .sort(sortBySchedule);

  const inProgressIds = new Set(inProgress.map((job) => String(job.id ?? "")));

  const today = visibleMyWorkJobs
    .filter((job) => {
      const jobId = String(job?.id ?? "");
      return !inProgressIds.has(jobId) && String(job?.scheduled_date ?? "") === todayLA;
    })
    .sort(sortBySchedule);

  const overdue = visibleMyWorkJobs
    .filter((job) => {
      const jobId = String(job?.id ?? "");
      if (inProgressIds.has(jobId)) return false;

      const scheduledDate = String(job?.scheduled_date ?? "").trim();
      return !!scheduledDate && scheduledDate < todayLA;
    })
    .sort(sortBySchedule)
    .reverse();

  const upcoming = visibleMyWorkJobs
    .filter((job) => {
      const jobId = String(job?.id ?? "");
      if (inProgressIds.has(jobId)) return false;

      const scheduledDate = String(job?.scheduled_date ?? "").trim();
      return !!scheduledDate && scheduledDate > todayLA;
    })
    .sort(sortBySchedule);

  return { inProgress, today, overdue, upcoming };
}
