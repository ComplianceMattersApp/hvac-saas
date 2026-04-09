import type { DispatchJob } from '@/lib/actions/calendar';

const CALENDAR_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  pending: 'Pending',
  need_to_schedule: 'Needs Scheduling',
  scheduled: 'Scheduled',
  pending_info: 'Pending Info',
  pending_information: 'Pending Info',
  on_hold: 'On Hold',
  on_my_way: 'On My Way',
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
  on_hold: 'bg-slate-400',
  on_my_way: 'bg-blue-700',
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

// Locked calendar display rule: operational state must reflect jobs.ops_status.
export function getCalendarDisplayStatus(job: DispatchJob) {
  const opsStatus = String(job.ops_status ?? '').trim().toLowerCase();
  return opsStatus || 'scheduled';
}

export function formatCalendarDisplayStatus(status: string) {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (!normalized) return 'Unknown';
  return CALENDAR_STATUS_LABELS[normalized] || normalized.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function calendarStatusDotClass(status: string) {
  return CALENDAR_STATUS_DOT_CLASSES[String(status ?? '').trim().toLowerCase()] || 'bg-gray-300';
}