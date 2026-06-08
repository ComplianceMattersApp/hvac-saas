import { describe, expect, it } from 'vitest';

import { resolveMobileListAnchorDate } from '@/components/calendar/CalendarMobileListAnchor';

describe('resolveMobileListAnchorDate', () => {
  const rangeStartDate = '2026-06-01';
  const rangeEndDate = '2026-06-30';

  it('uses the exact target date when it has a rendered section', () => {
    expect(
      resolveMobileListAnchorDate({
        rangeStartDate,
        rangeEndDate,
        currentDate: '2026-06-08',
        focusedDate: '2026-06-15',
        availableDates: ['2026-06-03', '2026-06-08', '2026-06-20'],
      }),
    ).toBe('2026-06-08');
  });

  it('uses the next available rendered date when the target date is missing', () => {
    expect(
      resolveMobileListAnchorDate({
        rangeStartDate,
        rangeEndDate,
        currentDate: '2026-06-08',
        focusedDate: '2026-06-15',
        availableDates: ['2026-06-02', '2026-06-11', '2026-06-24'],
      }),
    ).toBe('2026-06-11');
  });

  it('falls back to the closest prior rendered date when no later date exists', () => {
    expect(
      resolveMobileListAnchorDate({
        rangeStartDate,
        rangeEndDate,
        currentDate: '2026-06-28',
        focusedDate: '2026-06-15',
        availableDates: ['2026-06-03', '2026-06-12', '2026-06-20'],
      }),
    ).toBe('2026-06-20');
  });

  it('returns null when there are no rendered date sections', () => {
    expect(
      resolveMobileListAnchorDate({
        rangeStartDate,
        rangeEndDate,
        currentDate: '2026-06-08',
        focusedDate: '2026-06-15',
        availableDates: [],
      }),
    ).toBeNull();
  });

  it('uses the focused date when today is outside the visible month', () => {
    expect(
      resolveMobileListAnchorDate({
        rangeStartDate,
        rangeEndDate,
        currentDate: '2026-07-08',
        focusedDate: '2026-06-15',
        availableDates: ['2026-06-03', '2026-06-16', '2026-06-24'],
      }),
    ).toBe('2026-06-16');
  });
});
