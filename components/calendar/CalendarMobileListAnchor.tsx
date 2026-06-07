'use client';

import { useEffect, useRef } from 'react';

type Props = {
  rangeStartDate: string;
  rangeEndDate: string;
  currentDate: string;
  focusedDate?: string | null;
};

function inRange(date: string, startDate: string, endDate: string) {
  return date >= startDate && date <= endDate;
}

function findTargetDate(params: {
  rangeStartDate: string;
  rangeEndDate: string;
  currentDate: string;
  focusedDate?: string | null;
  availableDates: string[];
}) {
  const { rangeStartDate, rangeEndDate, currentDate, focusedDate, availableDates } = params;
  const available = new Set(availableDates);

  if (inRange(currentDate, rangeStartDate, rangeEndDate) && available.has(currentDate)) {
    return currentDate;
  }

  const normalizedFocused = String(focusedDate ?? '').trim();
  if (normalizedFocused && available.has(normalizedFocused)) {
    return normalizedFocused;
  }

  return availableDates[0] ?? null;
}

export default function CalendarMobileListAnchor({
  rangeStartDate,
  rangeEndDate,
  currentDate,
  focusedDate,
}: Props) {
  const hasAnchoredRef = useRef(false);

  useEffect(() => {
    if (hasAnchoredRef.current) return;
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(max-width: 767px)').matches) return;

    const dateSections = Array.from(document.querySelectorAll<HTMLElement>('[data-calendar-list-date]'));
    if (!dateSections.length) return;

    const availableDates = dateSections
      .map((section) => String(section.dataset.calendarListDate ?? '').trim())
      .filter(Boolean);

    const targetDate = findTargetDate({
      rangeStartDate,
      rangeEndDate,
      currentDate,
      focusedDate,
      availableDates,
    });

    if (!targetDate) return;

    const target = document.getElementById(`calendar-list-date-${targetDate}`);
    if (!target) return;

    target.scrollIntoView({ block: 'start', behavior: 'auto' });
    hasAnchoredRef.current = true;
  }, [rangeStartDate, rangeEndDate, currentDate, focusedDate]);

  return null;
}
