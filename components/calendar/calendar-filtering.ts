import type { DispatchJob } from '@/lib/actions/calendar';

export const CALENDAR_TECH_FILTER_UNASSIGNED = 'unassigned';

export function normalizeCalendarTechFilter(value?: string | null): string | null {
  const key = String(value ?? '').trim();
  if (!key) return null;
  return key;
}

export function isUnassignedTechFilter(value?: string | null): boolean {
  return normalizeCalendarTechFilter(value) === CALENDAR_TECH_FILTER_UNASSIGNED;
}

export function isSpecificTechnicianFilter(value?: string | null): boolean {
  const key = normalizeCalendarTechFilter(value);
  return Boolean(key) && key !== CALENDAR_TECH_FILTER_UNASSIGNED;
}

export function filterJobsForTechnician(jobs: DispatchJob[], activeTech?: string | null): DispatchJob[] {
  const techId = normalizeCalendarTechFilter(activeTech);
  if (!techId) return jobs;
  if (techId === CALENDAR_TECH_FILTER_UNASSIGNED) {
    return jobs.filter((job) => !job.assignments.length);
  }
  return jobs.filter((job) => job.assignments.some((assignment) => assignment.user_id === techId));
}
