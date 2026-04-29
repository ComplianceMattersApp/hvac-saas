import { describe, expect, it } from 'vitest';

import { resolveCalendarDefaultViewHref } from '@/lib/utils/calendar-view-default';

describe('resolveCalendarDefaultViewHref', () => {
  it('does not override explicit month view', () => {
    const result = resolveCalendarDefaultViewHref({
      href: 'http://localhost:3000/calendar?view=month&date=2026-04-29',
      isMobile: true,
    });

    expect(result).toBeNull();
  });

  it('does not override explicit list view', () => {
    const result = resolveCalendarDefaultViewHref({
      href: 'http://localhost:3000/calendar?view=list&date=2026-04-29',
      isMobile: false,
    });

    expect(result).toBeNull();
  });

  it('defaults to month on desktop when view is missing', () => {
    const result = resolveCalendarDefaultViewHref({
      href: 'http://localhost:3000/calendar?date=2026-04-29',
      isMobile: false,
    });

    expect(result).toBe('/calendar?date=2026-04-29&view=month');
  });

  it('defaults to list on mobile when view is missing', () => {
    const result = resolveCalendarDefaultViewHref({
      href: 'http://localhost:3000/calendar?date=2026-04-29',
      isMobile: true,
    });

    expect(result).toBe('/calendar?date=2026-04-29&view=list');
  });

  it('preserves existing query params while adding missing view', () => {
    const result = resolveCalendarDefaultViewHref({
      href: 'http://localhost:3000/calendar?date=2026-04-29&job=job-1&tech=u-1&inspector=1&block=b-7',
      isMobile: true,
    });

    expect(result).toBe('/calendar?date=2026-04-29&job=job-1&tech=u-1&inspector=1&block=b-7&view=list');
  });

  it('returns null after view is set to avoid replace loops', () => {
    const result = resolveCalendarDefaultViewHref({
      href: 'http://localhost:3000/calendar?date=2026-04-29&view=month',
      isMobile: false,
    });

    expect(result).toBeNull();
  });
});
