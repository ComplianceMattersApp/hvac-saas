const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeAgendaDateKeys(dates: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      dates
        .map((date) => String(date ?? '').trim())
        .filter((date) => YMD_PATTERN.test(date)),
    ),
  ).sort();
}

export function mergeAgendaDateKeys(params: {
  occupiedDates: Array<string | null | undefined>;
  visibleDates?: Array<string | null | undefined> | null;
}) {
  const occupiedDates = normalizeAgendaDateKeys(params.occupiedDates);
  const visibleDates = normalizeAgendaDateKeys(params.visibleDates ?? []);

  if (!visibleDates.length) return occupiedDates;

  return normalizeAgendaDateKeys([...visibleDates, ...occupiedDates]);
}
