import {
  isActiveFieldWorkStatus,
} from "@/lib/ops/queue-status-contracts";
import { isScheduledAssignedMyWorkEligible } from "@/lib/ops/queue-membership";

export type FieldQueueJob = {
  id: string;
  title?: string | null;
  status?: string | null;
  ops_status?: string | null;
  scheduled_date?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  field_complete?: boolean | null;
  field_complete_at?: string | null;
  deleted_at?: string | null;
  follow_up_date?: string | null;
  next_action_note?: string | null;
  action_required_by?: string | null;
};

export type GroupedFieldJobs<T extends FieldQueueJob> = {
  inProgress: T[];
  today: T[];
  overdue: T[];
  upcoming: T[];
  completed: T[];
};

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

function businessDateLA(value: unknown): string {
  const parsed = new Date(String(value ?? ""));
  if (!Number.isFinite(parsed.getTime())) return "";

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function sortByCompletionNewest<T extends FieldQueueJob>(a: T, b: T): number {
  const aTime = Date.parse(String(a?.field_complete_at ?? ""));
  const bTime = Date.parse(String(b?.field_complete_at ?? ""));
  const completionDiff = (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  return completionDiff || sortBySchedule(a, b);
}

/**
 * Groups a tech's assigned jobs into the My Work sections: jobs already
 * underway, jobs scheduled for today, overdue jobs (most recent first),
 * upcoming scheduled jobs, and jobs field-completed today. `todayLA` is the
 * account's "today" business date (YYYY-MM-DD) so callers control the
 * timezone/clock source.
 */
export function groupFieldJobs<T extends FieldQueueJob>(
  jobs: T[],
  todayLA: string,
): GroupedFieldJobs<T> {
  const completed = (jobs ?? [])
    .filter(
      (job) =>
        Boolean(job?.field_complete) &&
        businessDateLA(job?.field_complete_at) === todayLA,
    )
    .sort(sortByCompletionNewest);

  const visibleMyWorkJobs = (jobs ?? []).filter((job) =>
    isScheduledAssignedMyWorkEligible({
      status: job?.status,
      ops_status: job?.ops_status,
      deleted_at: job?.deleted_at,
      scheduledDate: job?.scheduled_date,
      fieldComplete: job?.field_complete,
      follow_up_date: job?.follow_up_date,
      next_action_note: job?.next_action_note,
      action_required_by: job?.action_required_by,
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

  return { inProgress, today, overdue, upcoming, completed };
}
