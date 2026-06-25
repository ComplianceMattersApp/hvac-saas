import { describe, expect, it } from 'vitest';
import {
  buildAutoScheduleWindowLA,
  formatBusinessDateUS,
  formatDateOnlyDisplay,
  formatTimestampDateDisplayLA,
  formatTimestampDateTimeDisplayLA,
} from '@/lib/utils/schedule-la';

describe('date-only display formatting', () => {
  it('formats YYYY-MM-DD to MM-DD-YYYY', () => {
    expect(formatDateOnlyDisplay('2026-04-29')).toBe('04-29-2026');
  });

  it('keeps zero padding for single-digit month/day', () => {
    expect(formatDateOnlyDisplay('2026-01-05')).toBe('01-05-2026');
  });

  it('returns safe fallback for null/empty/invalid values', () => {
    expect(formatDateOnlyDisplay(null)).toBe('');
    expect(formatDateOnlyDisplay('')).toBe('');
    expect(formatDateOnlyDisplay('not-a-date')).toBe('not-a-date');
  });

  it('keeps formatBusinessDateUS aligned with date-only display helper', () => {
    expect(formatBusinessDateUS('2026-12-31')).toBe('12-31-2026');
  });

  it('formats LA timestamps to MM-DD-YYYY', () => {
    expect(formatTimestampDateDisplayLA('2026-04-29T18:30:00.000Z')).toBe('04-29-2026');
  });

  it('formats timestamps through the app LA timezone instead of raw UTC', () => {
    expect(formatTimestampDateTimeDisplayLA('2026-04-29T01:30:00.000Z')).toBe('04-28-2026 18:30');
  });

  it('builds unscheduled On the way auto-filled windows in the app timezone', () => {
    expect(buildAutoScheduleWindowLA(new Date('2026-04-29T01:30:00.000Z'))).toEqual({
      scheduled_date: '2026-04-28',
      window_start: '18:30',
      window_end: '20:30',
    });
  });
});
