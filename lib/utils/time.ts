import { DateTime } from "luxon";

/**
 * Convert a local "wall clock" date+time in America/Los_Angeles to a UTC ISO string.
 * date: "YYYY-MM-DD"
 * time: "HH:mm"
 */
export function laWallClockToUtcIso(date: string, time: string) {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: "America/Los_Angeles" });
  if (!dt.isValid) return null;
  return dt.toUTC().toISO(); // e.g. "2026-02-17T16:00:00.000Z"
}
