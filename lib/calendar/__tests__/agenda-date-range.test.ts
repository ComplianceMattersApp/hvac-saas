import { describe, expect, it } from 'vitest';

import { mergeAgendaDateKeys, normalizeAgendaDateKeys } from '@/lib/calendar/agenda-date-range';

describe('agenda date range helpers', () => {
  it('normalizes valid date keys without shifting timezone-sensitive date-only values', () => {
    expect(
      normalizeAgendaDateKeys([
        '2026-06-25',
        '2026-06-24',
        '2026-06-25',
        '2026-06-24T23:00:00.000Z',
        '',
        null,
      ]),
    ).toEqual(['2026-06-24', '2026-06-25']);
  });

  it('keeps empty dates between scheduled dates when visible dates are provided', () => {
    expect(
      mergeAgendaDateKeys({
        visibleDates: ['2026-06-24', '2026-06-25', '2026-06-26'],
        occupiedDates: ['2026-06-24', '2026-06-26'],
      }),
    ).toEqual(['2026-06-24', '2026-06-25', '2026-06-26']);
  });

  it('keeps empty dates before and after scheduled dates within the visible range', () => {
    expect(
      mergeAgendaDateKeys({
        visibleDates: ['2026-06-24', '2026-06-25', '2026-06-26', '2026-06-27'],
        occupiedDates: ['2026-06-25', '2026-06-26'],
      }),
    ).toEqual(['2026-06-24', '2026-06-25', '2026-06-26', '2026-06-27']);
  });

  it('keeps the legacy sparse agenda when no visible skeleton is supplied', () => {
    expect(
      mergeAgendaDateKeys({
        occupiedDates: ['2026-06-28', '2026-06-24'],
      }),
    ).toEqual(['2026-06-24', '2026-06-28']);
  });

  it('keeps the date skeleton even when filters leave no occupied dates', () => {
    expect(
      mergeAgendaDateKeys({
        visibleDates: ['2026-06-24', '2026-06-25'],
        occupiedDates: [],
      }),
    ).toEqual(['2026-06-24', '2026-06-25']);
  });
});
