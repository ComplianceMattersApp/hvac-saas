import { describe, expect, it } from 'vitest';

import { getMonthVisibleRange } from '@/lib/calendar/month-visible-range';

describe('getMonthVisibleRange', () => {
  it('includes next-month spillover days visible in May 2026 month grid', () => {
    const range = getMonthVisibleRange('2026-05-25');

    expect(range.startDate).toBe('2026-04-26');
    expect(range.endDate).toBe('2026-06-06');
  });

  it('includes previous-month spillover days visible at the start of a month', () => {
    const range = getMonthVisibleRange('2026-06-15');

    expect(range.startDate).toBe('2026-05-31');
    expect(range.endDate).toBe('2026-07-04');
  });
});