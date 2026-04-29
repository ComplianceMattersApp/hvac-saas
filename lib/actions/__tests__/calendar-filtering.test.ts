import { describe, expect, it } from 'vitest';
import {
  CALENDAR_TECH_FILTER_UNASSIGNED,
  filterJobsForTechnician,
} from '@/components/calendar/calendar-filtering';
import type { DispatchJob } from '@/lib/actions/calendar';

function makeJob(params: {
  id: string;
  assignmentUserIds: string[];
}): DispatchJob {
  return {
    id: params.id,
    customer_id: 'cust-1',
    location_id: 'loc-1',
    title: 'Job title',
    job_type: 'service',
    status: 'open',
    ops_status: 'scheduled',
    parent_job_id: null,
    scheduled_date: '2026-04-29',
    window_start: '09:00',
    window_end: '10:00',
    city: 'Los Angeles',
    job_address: '111 Main St',
    customer_first_name: 'Alex',
    customer_last_name: 'Kim',
    customer_phone: '555-1212',
    contractor_id: null,
    contractor_name: null,
    assignments: params.assignmentUserIds.map((userId, index) => ({
      user_id: userId,
      display_name: userId,
      is_primary: index === 0,
    })),
    assignment_names: params.assignmentUserIds,
    assignment_primary_name: params.assignmentUserIds[0] ?? null,
    latest_event_type: null,
    latest_event_at: null,
  };
}

describe('calendar technician filtering', () => {
  it('supports all, specific-tech, and explicit unassigned filters', () => {
    const jobs = [
      makeJob({ id: 'assigned-tech-1', assignmentUserIds: ['tech-1'] }),
      makeJob({ id: 'assigned-tech-2', assignmentUserIds: ['tech-2'] }),
      makeJob({ id: 'unassigned', assignmentUserIds: [] }),
    ];

    // All/default view includes assigned and unassigned.
    expect(filterJobsForTechnician(jobs, null).map((job) => job.id)).toEqual([
      'assigned-tech-1',
      'assigned-tech-2',
      'unassigned',
    ]);

    // Specific technician excludes unassigned and other technicians.
    expect(filterJobsForTechnician(jobs, 'tech-1').map((job) => job.id)).toEqual([
      'assigned-tech-1',
    ]);

    // Unassigned filter includes only jobs with no assigned technician.
    expect(filterJobsForTechnician(jobs, CALENDAR_TECH_FILTER_UNASSIGNED).map((job) => job.id)).toEqual([
      'unassigned',
    ]);
  });
});
