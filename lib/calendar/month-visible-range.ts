import { endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';

export type MonthVisibleRange = {
  startDate: string;
  endDate: string;
};

export function getMonthVisibleRange(anchorDateYmd: string): MonthVisibleRange {
  const anchor = parseISO(anchorDateYmd);
  const startDate = format(startOfWeek(startOfMonth(anchor)), 'yyyy-MM-dd');
  const endDate = format(endOfWeek(endOfMonth(anchor)), 'yyyy-MM-dd');
  return { startDate, endDate };
}