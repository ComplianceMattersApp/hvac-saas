import type { DispatchJob } from '@/lib/actions/calendar';
import { CALENDAR_TECH_FILTER_UNASSIGNED, parseCalendarSelectedUserIds } from '@/lib/calendar/calendar-user-selection';

export { CALENDAR_TECH_FILTER_UNASSIGNED, parseCalendarSelectedUserIds };

export function normalizeCalendarTechFilter(value?: string | string[] | null): string | null {
  const key = Array.isArray(value) ? value.map((entry) => String(entry ?? '').trim()).filter(Boolean).join(',') : String(value ?? '').trim();
  if (!key) return null;
  return key;
}

export function isUnassignedTechFilter(value?: string | string[] | null): boolean {
  return normalizeCalendarTechFilter(value) === CALENDAR_TECH_FILTER_UNASSIGNED;
}

export function isSpecificTechnicianFilter(value?: string | string[] | null): boolean {
  const key = normalizeCalendarTechFilter(value);
  return Boolean(key) && key !== CALENDAR_TECH_FILTER_UNASSIGNED;
}

export function filterJobsForTechnician(jobs: DispatchJob[], activeTech?: string | string[] | null): DispatchJob[] {
  const techId = normalizeCalendarTechFilter(activeTech);
  if (!techId) return jobs;
  if (techId === CALENDAR_TECH_FILTER_UNASSIGNED) {
    return jobs.filter((job) => !job.assignments.length);
  }
  const selectedUserIds = parseCalendarSelectedUserIds(techId);
  if (!selectedUserIds.length) return jobs;
  const selected = new Set(selectedUserIds);
  return jobs.filter((job) => job.assignments.some((assignment) => selected.has(assignment.user_id)));
}
