import { normalizeCoordinatePair, type CoordinatePair } from "./coordinates";
import { requireGoogleMapsServerKey } from "./routing-env";

/**
 * Server-side address geocoder (Google Geocoding API). Used by the location
 * backfill script and the dispatch home-base save — NOT by hot request paths.
 * Every failure mode returns a structured result instead of throwing so
 * callers can degrade gracefully (save the address without coordinates).
 */

export type GeocodeAddressInput = {
  addressLine1: string;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export type GeocodeAddressResult =
  | { status: "ok"; coordinates: CoordinatePair; locationType: string; formattedAddress: string }
  | { status: "zero_results" }
  | {
      status: "unavailable";
      reason: "missing_key" | "timeout" | "http_error" | "api_error" | "invalid_response";
      detail?: string;
    };

const GEOCODE_TIMEOUT_MS = 2500;

export function buildGeocodeQuery(input: GeocodeAddressInput): string {
  return [input.addressLine1, input.addressLine2, input.city, input.state, input.zip]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export async function geocodeAddress(
  input: GeocodeAddressInput,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<GeocodeAddressResult> {
  let apiKey: string;
  try {
    apiKey = requireGoogleMapsServerKey();
  } catch {
    return { status: "unavailable", reason: "missing_key" };
  }

  const query = buildGeocodeQuery(input);
  if (!query) return { status: "zero_results" };

  const params = new URLSearchParams({
    address: query,
    components: "country:US",
    key: apiKey,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? GEOCODE_TIMEOUT_MS);

  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
      { signal: controller.signal, cache: "no-store" },
    );

    if (!response.ok) {
      return { status: "unavailable", reason: "http_error", detail: String(response.status) };
    }

    const body = (await response.json()) as {
      status?: string;
      error_message?: string;
      results?: Array<{
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number }; location_type?: string };
      }>;
    };

    const apiStatus = String(body?.status ?? "").trim();
    if (apiStatus === "ZERO_RESULTS") return { status: "zero_results" };
    if (apiStatus !== "OK") {
      const errorMessage = String(body?.error_message ?? "").trim();
      return {
        status: "unavailable",
        reason: "api_error",
        detail: errorMessage ? `${apiStatus}: ${errorMessage}` : apiStatus || "empty_status",
      };
    }

    const first = body.results?.[0];
    const coordinates = normalizeCoordinatePair(
      first?.geometry?.location?.lat,
      first?.geometry?.location?.lng,
    );
    if (!coordinates) return { status: "unavailable", reason: "invalid_response" };

    return {
      status: "ok",
      coordinates,
      locationType: String(first?.geometry?.location_type ?? "").trim(),
      formattedAddress: String(first?.formatted_address ?? "").trim(),
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      status: "unavailable",
      reason: aborted ? "timeout" : "http_error",
      detail: error instanceof Error ? error.message : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}
