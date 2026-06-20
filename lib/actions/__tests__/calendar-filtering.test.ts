import { describe, expect, it } from 'vitest';
import {
  CALENDAR_TECH_FILTER_UNASSIGNED,
  filterJobsForTechnician,
  parseCalendarSelectedUserIds,
} from '@/components/calendar/calendar-filtering';
import { compactCalendarUserLabel } from '@/lib/calendar/calendar-user-label';
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
    work_context_label: null,
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
  it('builds compact calendar labels from profile names or email local-parts', () => {
    expect(compactCalendarUserLabel({ displayName: 'Alex Rivera', email: 'alex@example.com' })).toBe('Alex Rivera');
    expect(compactCalendarUserLabel({ displayName: 'adnguyen1005@example.com' })).toBe('adnguyen1005');
    expect(compactCalendarUserLabel({ displayName: '', email: 'verylongcalendaruser@example.com', maxLength: 12 })).toBe('verylongc...');
    expect(compactCalendarUserLabel({ displayName: '', email: '' })).toBe('User');
  });

  it('parses repeated and comma-separated technician selections without duplicates', () => {
    expect(parseCalendarSelectedUserIds(['tech-1, tech-2', 'tech-2', '', CALENDAR_TECH_FILTER_UNASSIGNED])).toEqual([
      'tech-1',
      'tech-2',
    ]);
  });

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

    expect(filterJobsForTechnician(jobs, 'tech-1,tech-2').map((job) => job.id)).toEqual([
      'assigned-tech-1',
      'assigned-tech-2',
    ]);

    // Unassigned filter includes only jobs with no assigned technician.
    expect(filterJobsForTechnician(jobs, CALENDAR_TECH_FILTER_UNASSIGNED).map((job) => job.id)).toEqual([
      'unassigned',
    ]);
  });
});
