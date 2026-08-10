import type { CoordinatePair } from "./coordinates";
import { createDriveTimeMatrix, type DriveTimeMatrix } from "./drive-time-matrix";
import { getRoutingAvailability, requireGoogleMapsServerKey } from "./routing-env";

/**
 * Google Routes API `computeRouteMatrix` client.
 *
 * The only I/O in `lib/routing`. Everything else stays pure, and this runs
 * *before* planning so the engine receives finished data.
 *
 * Hard rules:
 *  - **Never throws.** Route planning must work during a provider outage; a
 *    failure returns null and the planner falls back to straight-line estimates,
 *    which is exactly how the lane shipped.
 *  - **Bounded.** computeRouteMatrix bills per element (origins × destinations),
 *    so the element count is capped before the request is made rather than
 *    discovered on an invoice.
 *
 * Requires GOOGLE_MAPS_GEOCODING_API_KEY — a server key with no referrer
 * restriction. The house GOOGLE_MAPS_API_KEY ships inside Static Maps <img>
 * URLs and is referrer-restricted, which Routes rejects with REQUEST_DENIED.
 */

const ROUTES_MATRIX_ENDPOINT = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";

/**
 * Element ceiling for a single call. Google's own limit is higher, but a day of
 * planning should not silently become an expensive request: 12 points each way
 * covers a home base plus a full day's stops with room to spare.
 */
export const MAX_MATRIX_ELEMENTS = 144;

/** Square-matrix point ceiling implied by MAX_MATRIX_ELEMENTS (12 × 12 = 144). */
export const MAX_MATRIX_POINTS = 12;

/** Seconds before we give up and plan with estimates instead. */
const REQUEST_TIMEOUT_MS = 8_000;

function toWaypoint(point: CoordinatePair) {
  return {
    waypoint: {
      location: {
        latLng: { latitude: point.latitude, longitude: point.longitude },
      },
    },
  };
}

/** Google returns durations as a string like "832s". */
function parseDurationSeconds(raw: unknown): number | null {
  const text = String(raw ?? "").trim();
  const match = /^(\d+(?:\.\d+)?)s$/.exec(text);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : null;
}

/**
 * Fetch live drive times between every origin and every destination.
 *
 * Returns null when routing is unavailable, the request is too large, or the
 * provider fails — all of which mean "plan with estimates", never "stop".
 */
export async function fetchDriveTimeMatrix(params: {
  origins: CoordinatePair[];
  destinations: CoordinatePair[];
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<DriveTimeMatrix | null> {
  const origins = params.origins ?? [];
  const destinations = params.destinations ?? [];
  if (origins.length === 0 || destinations.length === 0) return null;

  const elements = origins.length * destinations.length;
  if (elements > MAX_MATRIX_ELEMENTS) {
    console.warn("Route matrix request skipped: too many elements", {
      elements,
      limit: MAX_MATRIX_ELEMENTS,
    });
    return null;
  }

  let apiKey = params.apiKey;
  if (!apiKey) {
    if (!getRoutingAvailability().available) return null;
    try {
      apiKey = requireGoogleMapsServerKey();
    } catch {
      return null;
    }
  }

  const doFetch = params.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await doFetch(ROUTES_MATRIX_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        // Ask only for what the planner uses. Requesting fewer fields keeps the
        // response small and, on this API, cheaper.
        "X-Goog-FieldMask": "originIndex,destinationIndex,duration,condition",
      },
      body: JSON.stringify({
        origins: origins.map(toWaypoint),
        destinations: destinations.map(toWaypoint),
        travelMode: "DRIVE",
        // Deliberately NOT traffic-aware. Traffic estimates are tied to a
        // departure time, and the planner proposes days rather than departures;
        // a traffic number for "now" would be wrong for a job two weeks out and
        // would make the plan non-deterministic between renders.
        routingPreference: "TRAFFIC_UNAWARE",
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn("Route matrix request failed", {
        status: response.status,
        detail: body.slice(0, 300),
      });
      return null;
    }

    const rows = await response.json();
    if (!Array.isArray(rows)) return null;

    const pairs: Array<{ origin: CoordinatePair; destination: CoordinatePair; minutes: number }> = [];
    for (const row of rows) {
      // ROUTE_EXISTS is the only condition we can plan on; anything else means
      // no drivable route was found and the leg should fall back to an estimate.
      if (String(row?.condition ?? "") !== "ROUTE_EXISTS") continue;
      const origin = origins[Number(row?.originIndex)];
      const destination = destinations[Number(row?.destinationIndex)];
      if (!origin || !destination) continue;
      const seconds = parseDurationSeconds(row?.duration);
      if (seconds === null) continue;
      pairs.push({ origin, destination, minutes: seconds / 60 });
    }

    return pairs.length > 0 ? createDriveTimeMatrix(pairs) : null;
  } catch (error) {
    console.warn("Route matrix request could not complete; planning with estimates", {
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Convenience for the common shape: one set of points where any stop may follow
 * any other, plus the home base. Deduplicates by coordinate key so a repeated
 * location is not billed twice.
 */
export async function fetchDriveTimeMatrixForPoints(params: {
  points: CoordinatePair[];
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<DriveTimeMatrix | null> {
  const seen = new Set<string>();
  const unique: CoordinatePair[] = [];
  for (const point of params.points ?? []) {
    const key = `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(point);
  }
  if (unique.length < 2) return null;

  return fetchDriveTimeMatrix({
    origins: unique,
    destinations: unique,
    apiKey: params.apiKey,
    fetchImpl: params.fetchImpl,
  });
}
