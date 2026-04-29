import { describe, expect, it } from 'vitest';
import { formatBusinessDateUS, formatDateOnlyDisplay } from '@/lib/utils/schedule-la';

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
});
