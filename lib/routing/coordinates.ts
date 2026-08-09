/**
 * Pure coordinate helpers shared by the browser capture path (address
 * autocomplete hidden fields) and the server write paths (location inserts,
 * geocode backfill). No environment or Supabase dependencies — safe to import
 * from client components.
 */

export type CoordinatePair = {
  latitude: number;
  longitude: number;
};

/** Form field names carrying captured service-address coordinates. */
export const LOCATION_LATITUDE_FIELD = "location_latitude";
export const LOCATION_LONGITUDE_FIELD = "location_longitude";

export type GeocodeSource =
  | "places_autocomplete"
  | "geocoding_backfill"
  | "dispatch_profile_save";

// ~0.11 m of precision — plenty for routing, avoids storing float noise.
const COORDINATE_DECIMAL_PLACES = 6;

function roundCoordinate(value: number): number {
  const factor = 10 ** COORDINATE_DECIMAL_PLACES;
  return Math.round(value * factor) / factor;
}

function toFiniteNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * Validates and normalizes a latitude/longitude pair from untrusted input
 * (form fields, provider payloads). Returns null unless both values are
 * finite, in range, and not the 0,0 "null island" placeholder.
 */
export function normalizeCoordinatePair(
  latitudeRaw: unknown,
  longitudeRaw: unknown,
): CoordinatePair | null {
  const latitude = toFiniteNumber(latitudeRaw);
  const longitude = toFiniteNumber(longitudeRaw);
  if (latitude === null || longitude === null) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) };
}

/** Reads the hidden autocomplete coordinate fields from a submitted form. */
export function readCoordinateFormFields(formData: FormData): CoordinatePair | null {
  return normalizeCoordinatePair(
    formData.get(LOCATION_LATITUDE_FIELD),
    formData.get(LOCATION_LONGITUDE_FIELD),
  );
}

/**
 * Columns to spread into a `locations` insert/update. Empty object when no
 * coordinates were captured, so callers can spread unconditionally.
 */
export function coordinateWriteColumns(
  pair: CoordinatePair | null,
  source: GeocodeSource,
):
  | { latitude: number; longitude: number; geocode_source: GeocodeSource; geocoded_at: string }
  | Record<string, never> {
  if (!pair) return {};
  return {
    latitude: pair.latitude,
    longitude: pair.longitude,
    geocode_source: source,
    geocoded_at: new Date().toISOString(),
  };
}
