export const CALENDAR_TECH_FILTER_UNASSIGNED = 'unassigned';

export function parseCalendarSelectedUserIds(value?: string | string[] | null): string[] {
  const values = Array.isArray(value) ? value : [value ?? ''];
  const seen = new Set<string>();
  const selected: string[] = [];

  for (const raw of values) {
    for (const part of String(raw ?? '').split(',')) {
      const userId = part.trim();
      if (!userId || userId === CALENDAR_TECH_FILTER_UNASSIGNED || seen.has(userId)) continue;
      seen.add(userId);
      selected.push(userId);
    }
  }

  return selected;
}

export function buildCalendarTechParam(selectedUserIds: string[]): string | null {
  const clean = parseCalendarSelectedUserIds(selectedUserIds);
  return clean.length ? clean.join(',') : null;
}
