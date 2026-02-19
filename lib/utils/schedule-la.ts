// lib/utils/schedule-la.ts
const TZ = "America/Los_Angeles";

// --- Formatting (DB -> UI) ---
// Accepts ISO/timestamptz strings. Also tolerates legacy "HH:MM[:SS]" strings.
export function displayDateLA(value?: string | null): string {
  if (!value) return "";
  const s = String(value).trim();
  if (!s) return "";

  // If someone previously stored YYYY-MM-DD, pass through
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d); // YYYY-MM-DD
}

export function displayTimeLA(value?: string | null): string {
  if (!value) return "";
  const s = String(value).trim();
  if (!s) return "";

  // Legacy time-only (HH:MM or HH:MM:SS)
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return s.slice(0, 5);

  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d); // HH:MM
}

export function displayWindowLA(start?: string | null, end?: string | null): string {
  const a = displayTimeLA(start);
  const b = displayTimeLA(end);
  if (!a && !b) return "";
  if (a && b) return `${a}–${b}`;
  return a || b;
}

// --- Parsing (UI -> DB) ---
// Build a UTC ISO instant from an LA date (YYYY-MM-DD) and time (HH:MM).
export function laDateTimeToUtcIso(dateYYYYMMDD: string, timeHHMM: string): string {
  // Validate minimal shape (do not guess)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYYYYMMDD)) throw new Error("Invalid date");
  if (!/^\d{2}:\d{2}$/.test(timeHHMM)) throw new Error("Invalid time");

  const [y, m, d] = dateYYYYMMDD.split("-").map(Number);
  const [hh, mm] = timeHHMM.split(":").map(Number);

  // Start with a UTC guess, then shift by LA offset at that instant.
  const guessUtc = Date.UTC(y, m - 1, d, hh, mm, 0);

  const offsetMinutes = getTimeZoneOffsetMinutes(TZ, guessUtc);
  const utcMs = guessUtc - offsetMinutes * 60 * 1000;

  return new Date(utcMs).toISOString();
}

// LA midnight for scheduled_date
export function laDateToUtcMidnightIso(dateYYYYMMDD: string): string {
  return laDateTimeToUtcIso(dateYYYYMMDD, "00:00");
}

// Query helpers (LA “today” boundaries as UTC ISO instants)
export function startOfTodayUtcIsoLA(now = new Date()): string {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // YYYY-MM-DD
  return laDateToUtcMidnightIso(ymd);
}

export function startOfTomorrowUtcIsoLA(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const y = Number(parts.find(p => p.type === "year")?.value);
  const m = Number(parts.find(p => p.type === "month")?.value);
  const d = Number(parts.find(p => p.type === "day")?.value);

  // Add 1 day in UTC calendar space, then re-format in LA to stay correct around DST boundaries.
  const plus1 = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0));
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(plus1);

  return laDateToUtcMidnightIso(ymd);
}

// Internal: get timezone offset minutes for a given UTC millis instant
function getTimeZoneOffsetMinutes(timeZone: string, utcMillis: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMillis));

  const tzName = parts.find(p => p.type === "timeZoneName")?.value || "GMT+00:00";
  const m = tzName.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;

  const sign = m[1].startsWith("-") ? -1 : 1;
  const hours = Math.abs(Number(m[1]));
  const mins = m[2] ? Number(m[2]) : 0;
  return sign * (hours * 60 + mins);
}
