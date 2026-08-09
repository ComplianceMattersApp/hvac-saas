import type { CoordinatePair } from "./coordinates";

/**
 * Pure geometry/estimation helpers for route planning. Straight-line math
 * only — no external APIs. Estimates are deliberately conservative city-driving
 * numbers; the Routes API fast-follow can replace them with live drive times
 * without changing any call sites.
 */

const EARTH_RADIUS_KM = 6371;

/** Streets aren't straight lines — typical city detour multiplier. */
const ROUTE_CIRCUITY_FACTOR = 1.3;

/** Blended city/suburban average, km/h. */
const AVERAGE_SPEED_KMH = 45;

/** Park, walk up, knock — per-stop fixed overhead in minutes. */
const ARRIVAL_BUFFER_MINUTES = 3;

const KM_PER_MILE = 1.609344;

export function haversineKm(a: CoordinatePair, b: CoordinatePair): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Estimated door-to-door drive minutes between two points. */
export function estimateDriveMinutes(a: CoordinatePair, b: CoordinatePair): number {
  const km = haversineKm(a, b);
  if (km < 0.05) return 0;
  return Math.round((km * ROUTE_CIRCUITY_FACTOR * 60) / AVERAGE_SPEED_KMH) + ARRIVAL_BUFFER_MINUTES;
}

export function kmToMiles(km: number): number {
  return km / KM_PER_MILE;
}

/** Initial great-circle bearing from `a` to `b`, degrees 0–360 (0 = north). */
export function bearingDegrees(a: CoordinatePair, b: CoordinatePair): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const degrees = (Math.atan2(y, x) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

/** Smallest angle between two bearings, 0–180 degrees. */
export function angularDifferenceDegrees(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** Parses "HH:MM" or "HH:MM:SS" into minutes since midnight; null if invalid. */
export function parseTimeToMinutes(raw: string | null | undefined): number | null {
  const text = String(raw ?? "").trim();
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Formats minutes since midnight as 24h "HH:MM" (the jobs time-column format). */
export function minutesToHHMM(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(totalMinutes)));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Formats minutes since midnight as a friendly label, e.g. "9:30 AM". */
export function minutesToLabel(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(totalMinutes)));
  const hours24 = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
}

/** Snaps minutes down to the nearest half hour. */
export function snapDownToHalfHour(totalMinutes: number): number {
  return Math.floor(totalMinutes / 30) * 30;
}
