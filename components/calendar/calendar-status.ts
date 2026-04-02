import type { DispatchJob } from '@/lib/actions/calendar';

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
  const map: Record<string, string> = {
    scheduled: 'Scheduled',
    on_my_way: 'On My Way',
    in_progress: 'In Progress',
    field_complete: 'Field Complete',
    closed: 'Closed',
    cancelled: 'Cancelled',
  };

  return map[status] || status;
}

export function calendarStatusDotClass(status: string) {
  if (status === 'scheduled') return 'bg-sky-500';
  if (status === 'on_my_way') return 'bg-blue-500';
  if (status === 'in_progress') return 'bg-indigo-600';
  if (status === 'field_complete') return 'bg-amber-500';
  if (status === 'closed') return 'bg-green-600';
  if (status === 'cancelled') return 'bg-slate-400';
  return 'bg-gray-300';
}