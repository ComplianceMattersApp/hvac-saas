import { DateTime } from "luxon";

/**
 * Treat inputs as Los Angeles wall-clock times, store as UTC ISO.
 * date: "YYYY-MM-DD"
 * time: "HH:mm"
 */
export function laWallClockToUtcIso(date: string, time: string) {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: "America/Los_Angeles" });
  if (!dt.isValid) return null;
  return dt.toUTC().toISO();
}
