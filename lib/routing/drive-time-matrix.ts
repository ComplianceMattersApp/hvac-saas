import type { CoordinatePair } from "./coordinates";

/**
 * Live drive times, carried as plain data.
 *
 * The planner is pure and deterministic and its output is never persisted — a
 * schedule change simply re-flows the plan. Fetching drive times *inside* the
 * engine would destroy all three properties at once: it would become async,
 * non-deterministic, and untestable without a network.
 *
 * So the network call happens before planning and the result is passed in as a
 * lookup. Same input plus same matrix always yields the same plan, tests hand it
 * a fixed matrix, and an absent matrix degrades to the straight-line estimates
 * the lane shipped with.
 */

export type DriveTimeMatrix = {
  /** `${originKey}|${destinationKey}` -> minutes. */
  readonly entries: ReadonlyMap<string, number>;
  /** Where the numbers came from, for operator-facing honesty. */
  readonly source: "routes_api";
};

/**
 * ~1.1 m of precision. Coordinates round-trip through the database and the
 * Routes API response, so keys are quantized rather than compared as floats —
 * an exact-equality lookup would miss on the last decimal place and silently
 * fall back to straight-line for every pair.
 */
const KEY_PRECISION = 5;

export function driveTimePointKey(point: CoordinatePair): string {
  return `${point.latitude.toFixed(KEY_PRECISION)},${point.longitude.toFixed(KEY_PRECISION)}`;
}

function pairKey(origin: CoordinatePair, destination: CoordinatePair): string {
  return `${driveTimePointKey(origin)}|${driveTimePointKey(destination)}`;
}

export function createDriveTimeMatrix(
  pairs: Array<{ origin: CoordinatePair; destination: CoordinatePair; minutes: number }>,
): DriveTimeMatrix {
  const entries = new Map<string, number>();
  for (const pair of pairs) {
    const minutes = Number(pair.minutes);
    if (!Number.isFinite(minutes) || minutes < 0) continue;
    entries.set(pairKey(pair.origin, pair.destination), Math.round(minutes));
  }
  return { entries, source: "routes_api" };
}

/**
 * Minutes for one leg, or null when this pair is not in the matrix.
 *
 * Null is normal, not exceptional: the matrix is bounded, so legs outside the
 * fetched set fall back to the straight-line estimate. Callers must treat a miss
 * as "estimate it" rather than "no drive time".
 */
export function lookupDriveMinutes(
  matrix: DriveTimeMatrix | null | undefined,
  origin: CoordinatePair,
  destination: CoordinatePair,
): number | null {
  if (!matrix) return null;
  const value = matrix.entries.get(pairKey(origin, destination));
  return typeof value === "number" ? value : null;
}

/** True when at least one leg in the plan came from live data. */
export function matrixHasCoverage(matrix: DriveTimeMatrix | null | undefined): boolean {
  return Boolean(matrix && matrix.entries.size > 0);
}
