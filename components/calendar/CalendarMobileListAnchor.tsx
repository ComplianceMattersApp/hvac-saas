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

export function resolveMobileListAnchorDate(params: {
  rangeStartDate: string;
  rangeEndDate: string;
  currentDate: string;
  focusedDate?: string | null;
  availableDates: string[];
}) {
  const { rangeStartDate, rangeEndDate, currentDate, focusedDate, availableDates } = params;
  const sortedDates = Array.from(
    new Set(
      availableDates
        .map((date) => String(date ?? '').trim())
        .filter(Boolean),
    ),
  ).sort();

  if (!sortedDates.length) return null;

  const normalizedFocused = String(focusedDate ?? '').trim();
  const targetDate = inRange(currentDate, rangeStartDate, rangeEndDate)
    ? currentDate
    : normalizedFocused && inRange(normalizedFocused, rangeStartDate, rangeEndDate)
    ? normalizedFocused
    : currentDate;

  const exactMatch = sortedDates.find((date) => date === targetDate);
  if (exactMatch) return exactMatch;

  const nextAvailable = sortedDates.find((date) => date >= targetDate);
  if (nextAvailable) return nextAvailable;

  return sortedDates[sortedDates.length - 1] ?? null;
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

    const targetDate = resolveMobileListAnchorDate({
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
