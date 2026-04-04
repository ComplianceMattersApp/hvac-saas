import type { DispatchJob } from '@/lib/actions/calendar';

const CALENDAR_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  on_my_way: 'On My Way',
  in_progress: 'In Progress',
  field_complete: 'Field Complete',
  failed: 'Failed',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

const CALENDAR_STATUS_DOT_CLASSES: Record<string, string> = {
  scheduled: 'bg-cyan-500',
  on_my_way: 'bg-blue-700',
  in_progress: 'bg-indigo-600',
  field_complete: 'bg-amber-500',
  failed: 'bg-rose-600',
  closed: 'bg-green-600',
  cancelled: 'bg-slate-400',
};

export const CALENDAR_STATUS_LEGEND = [
  'scheduled',
  'on_my_way',
  'in_progress',
  'field_complete',
  'failed',
  'closed',
  'cancelled',
].map((key) => ({
  key,
  label: CALENDAR_STATUS_LABELS[key] ?? key,
  dot: CALENDAR_STATUS_DOT_CLASSES[key] ?? 'bg-gray-300',
}));

// Locked calendar display rule: use lifecycle truth for historical/in-flight markers,
// otherwise derive the display state from ops_status.
export function getCalendarDisplayStatus(job: DispatchJob) {
  const lifecycleStatus = String(job.status ?? '').trim().toLowerCase();
  if (lifecycleStatus === 'cancelled') return 'cancelled';
  if (lifecycleStatus === 'on_the_way') return 'on_my_way';
  if (lifecycleStatus === 'in_progress') return 'in_progress';

  const opsStatus = String(job.ops_status ?? '').trim().toLowerCase();
  if (!opsStatus) return 'scheduled';
  if (opsStatus === 'field_complete' || opsStatus === 'completed' || opsStatus === 'completed_paperwork_pending') {
    return 'field_complete';
  }
  if (opsStatus === 'open' || opsStatus === 'need_to_schedule' || opsStatus === 'pending' || opsStatus === 'pending_information') {
    return 'scheduled';
  }

  return opsStatus;
}

export function formatCalendarDisplayStatus(status: string) {
  return CALENDAR_STATUS_LABELS[status] || status;
}

export function calendarStatusDotClass(status: string) {
  return CALENDAR_STATUS_DOT_CLASSES[status] || 'bg-gray-300';
}