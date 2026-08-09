/**
 * Routing/geocoding environment configuration.
 * All `require*` functions throw if required vars are missing — fail loud, fail
 * early. Mirrors the house per-service `require*()` guard pattern (see
 * lib/qbo/qbo-env.ts).
 *
 * Key selection: prefers GOOGLE_MAPS_GEOCODING_API_KEY — a dedicated
 * server-to-server key with NO referrer restriction (Google rejects
 * referrer-restricted keys for Geocoding/Routes with REQUEST_DENIED). Falls
 * back to GOOGLE_MAPS_API_KEY, which works only if that key is unrestricted;
 * the house GOOGLE_MAPS_API_KEY is referrer-restricted because it ships in
 * Static Maps <img> URLs, so production setups need the dedicated key.
 */

export function requireGoogleMapsServerKey(): string {
  const dedicated = process.env.GOOGLE_MAPS_GEOCODING_API_KEY?.trim();
  if (dedicated) return dedicated;
  const fallback = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (fallback) return fallback;
  throw new Error("Neither GOOGLE_MAPS_GEOCODING_API_KEY nor GOOGLE_MAPS_API_KEY is set");
}

export function getRoutingAvailability(): { available: boolean; missingKeys: string[] } {
  const hasKey =
    !!process.env.GOOGLE_MAPS_GEOCODING_API_KEY?.trim() || !!process.env.GOOGLE_MAPS_API_KEY?.trim();
  return {
    available: hasKey,
    missingKeys: hasKey ? [] : ["GOOGLE_MAPS_GEOCODING_API_KEY"],
  };
}
