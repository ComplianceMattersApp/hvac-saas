import type { DispatchJob } from '@/lib/actions/calendar';
import {
  resolveJobLifecycleState,
  type JobLifecycleState,
} from '@/lib/jobs/job-lifecycle-state';

const CALENDAR_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  pending: 'Pending',
  need_to_schedule: 'Need to Schedule',
  scheduled: 'Scheduled',
  pending_info: 'Pending Info',
  pending_information: 'Pending Info',
  on_hold: 'On Hold',
  on_my_way: 'On My Way',
  in_process: 'In Progress',
  in_progress: 'In Progress',
  field_complete: 'Field Complete',
  completed: 'Completed',
  completed_paperwork_pending: 'Completed Paperwork Pending',
  paperwork_required: 'Paperwork Required',
  invoice_required: 'Invoice Required',
  pending_office_review: 'Pending Office Review',
  failed: 'Failed',
  failed_pending_retest: 'Failed Pending Retest',
  retest_needed: 'Retest Needed',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

const CALENDAR_STATUS_DOT_CLASSES: Record<string, string> = {
  open: 'bg-slate-500',
  pending: 'bg-slate-500',
  need_to_schedule: 'bg-slate-500',
  scheduled: 'bg-cyan-500',
  pending_info: 'bg-amber-500',
  pending_information: 'bg-amber-500',
  on_hold: 'bg-violet-500',
  on_my_way: 'bg-blue-700',
  in_process: 'bg-indigo-600',
  in_progress: 'bg-indigo-600',
  field_complete: 'bg-amber-500',
  completed: 'bg-green-600',
  completed_paperwork_pending: 'bg-amber-500',
  paperwork_required: 'bg-amber-500',
  invoice_required: 'bg-amber-500',
  pending_office_review: 'bg-amber-500',
  failed: 'bg-rose-600',
  failed_pending_retest: 'bg-rose-600',
  retest_needed: 'bg-rose-600',
  closed: 'bg-green-600',
  cancelled: 'bg-slate-400',
};

export const CALENDAR_STATUS_LEGEND = [
  'need_to_schedule',
  'scheduled',
  'on_my_way',
  'in_process',
  'field_complete',
  'on_hold',
  'failed',
  'closed',
  'cancelled',
].map((key) => ({
  key,
  label: CALENDAR_STATUS_LABELS[key] ?? key,
  dot: CALENDAR_STATUS_DOT_CLASSES[key] ?? 'bg-gray-300',
}));

const CALENDAR_STATUS_BY_LIFECYCLE_STATE: Record<JobLifecycleState, string> = {
  linked_active: 'closed',
  archived: 'cancelled',
  cancelled: 'cancelled',
  closed: 'closed',
  failed: 'failed',
  pending_office_review: 'pending_office_review',
  retest_needed: 'retest_needed',
  waiting: 'on_hold',
  invoice_required: 'invoice_required',
  paperwork_required: 'paperwork_required',
  on_the_way: 'on_my_way',
  in_process: 'in_process',
  scheduled: 'scheduled',
  needs_schedule: 'need_to_schedule',
  in_progress: 'scheduled',
};

// This used to rank jobs.status above jobs.ops_status — the inverse of both job-detail
// surfaces. Because a paused job keeps the field status it stopped at, a job that was
// on hold, failed, or closed still showed as "On My Way" here while the job screen
// reported the blocker. Precedence now comes from the shared resolver; only the
// calendar's own vocabulary is mapped below.
export function getCalendarDisplayStatus(job: DispatchJob) {
  const state = resolveJobLifecycleState({
    status: job.status,
    opsStatus: job.ops_status,
    hasScheduledAppointment: Boolean(
      (job as { scheduled_date?: unknown }).scheduled_date
        ?? (job as { window_start?: unknown }).window_start
        ?? (job as { window_end?: unknown }).window_end,
    ),
  });

  // `waiting` collapses pending_info and on_hold, which the calendar legend shows
  // separately, so keep the specific ops_status when it is one of those.
  if (state === 'waiting') {
    const opsStatus = String(job.ops_status ?? '').trim().toLowerCase();
    return opsStatus === 'pending_info' || opsStatus === 'pending_information'
      ? opsStatus
      : 'on_hold';
  }

  return CALENDAR_STATUS_BY_LIFECYCLE_STATE[state];
}

export function formatCalendarDisplayStatus(status: string) {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (!normalized) return 'Unknown';
  return CALENDAR_STATUS_LABELS[normalized] || normalized.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function calendarStatusDotClass(status: string) {
  return CALENDAR_STATUS_DOT_CLASSES[String(status ?? '').trim().toLowerCase()] || 'bg-gray-300';
}
