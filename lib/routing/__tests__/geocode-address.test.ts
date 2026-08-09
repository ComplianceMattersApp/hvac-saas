import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildGeocodeQuery, geocodeAddress } from "../geocode-address";

const ORIGINAL_KEY = process.env.GOOGLE_MAPS_API_KEY;
const ORIGINAL_GEOCODING_KEY = process.env.GOOGLE_MAPS_GEOCODING_API_KEY;

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  process.env.GOOGLE_MAPS_API_KEY = "test-server-key";
  delete process.env.GOOGLE_MAPS_GEOCODING_API_KEY;
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.GOOGLE_MAPS_API_KEY;
  } else {
    process.env.GOOGLE_MAPS_API_KEY = ORIGINAL_KEY;
  }
  if (ORIGINAL_GEOCODING_KEY === undefined) {
    delete process.env.GOOGLE_MAPS_GEOCODING_API_KEY;
  } else {
    process.env.GOOGLE_MAPS_GEOCODING_API_KEY = ORIGINAL_GEOCODING_KEY;
  }
});

describe("buildGeocodeQuery", () => {
  it("joins non-empty parts in address order", () => {
    expect(
      buildGeocodeQuery({
        addressLine1: "437 Cordova Lane",
        addressLine2: "",
        city: "Stockton",
        state: "CA",
        zip: "95207",
      }),
    ).toBe("437 Cordova Lane, Stockton, CA, 95207");
  });

  it("returns an empty string for an all-blank address", () => {
    expect(buildGeocodeQuery({ addressLine1: " ", city: null, state: null, zip: null })).toBe("");
  });
});

describe("geocodeAddress", () => {
  it("returns coordinates on an OK response", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return jsonResponse({
        status: "OK",
        results: [
          {
            formatted_address: "437 Cordova Ln, Stockton, CA 95207, USA",
            geometry: {
              location: { lat: 37.9857761234567, lng: -121.3320769876543 },
              location_type: "ROOFTOP",
            },
          },
        ],
      });
    }) as typeof fetch;

    const result = await geocodeAddress(
      { addressLine1: "437 Cordova Lane", city: "Stockton", state: "CA", zip: "95207" },
      { fetchImpl },
    );

    expect(result).toEqual({
      status: "ok",
      coordinates: { latitude: 37.985776, longitude: -121.332077 },
      locationType: "ROOFTOP",
      formattedAddress: "437 Cordova Ln, Stockton, CA 95207, USA",
    });
    expect(calls[0]).toContain("maps.googleapis.com/maps/api/geocode/json");
    expect(calls[0]).toContain("components=country%3AUS");
    expect(calls[0]).toContain("key=test-server-key");
  });

  it("maps ZERO_RESULTS to a zero_results status", async () => {
    const fetchImpl = (async () => jsonResponse({ status: "ZERO_RESULTS", results: [] })) as typeof fetch;
    expect(await geocodeAddress({ addressLine1: "nowhere" }, { fetchImpl })).toEqual({
      status: "zero_results",
    });
  });

  it("surfaces non-OK API statuses as api_error", async () => {
    const fetchImpl = (async () => jsonResponse({ status: "REQUEST_DENIED", results: [] })) as typeof fetch;
    expect(await geocodeAddress({ addressLine1: "437 Cordova Lane" }, { fetchImpl })).toEqual({
      status: "unavailable",
      reason: "api_error",
      detail: "REQUEST_DENIED",
    });
  });

  it("includes Google's error_message in the api_error detail when present", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        status: "REQUEST_DENIED",
        error_message: "API keys with referer restrictions cannot be used with this API.",
        results: [],
      })) as typeof fetch;
    expect(await geocodeAddress({ addressLine1: "437 Cordova Lane" }, { fetchImpl })).toEqual({
      status: "unavailable",
      reason: "api_error",
      detail: "REQUEST_DENIED: API keys with referer restrictions cannot be used with this API.",
    });
  });

  it("prefers the dedicated geocoding key over the shared maps key", async () => {
    process.env.GOOGLE_MAPS_GEOCODING_API_KEY = "dedicated-geocoding-key";
    const calls: string[] = [];
    const fetchImpl = (async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return jsonResponse({ status: "ZERO_RESULTS", results: [] });
    }) as typeof fetch;

    await geocodeAddress({ addressLine1: "437 Cordova Lane" }, { fetchImpl });
    expect(calls[0]).toContain("key=dedicated-geocoding-key");
  });

  it("surfaces HTTP failures without throwing", async () => {
    const fetchImpl = (async () => jsonResponse({}, false, 500)) as typeof fetch;
    expect(await geocodeAddress({ addressLine1: "437 Cordova Lane" }, { fetchImpl })).toEqual({
      status: "unavailable",
      reason: "http_error",
      detail: "500",
    });
  });

  it("rejects an OK response whose coordinates are invalid", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        status: "OK",
        results: [{ geometry: { location: { lat: 999, lng: 0 } } }],
      })) as typeof fetch;
    expect(await geocodeAddress({ addressLine1: "437 Cordova Lane" }, { fetchImpl })).toEqual({
      status: "unavailable",
      reason: "invalid_response",
    });
  });

  it("reports missing_key without calling the network", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return jsonResponse({ status: "OK", results: [] });
    }) as typeof fetch;

    expect(await geocodeAddress({ addressLine1: "437 Cordova Lane" }, { fetchImpl })).toEqual({
      status: "unavailable",
      reason: "missing_key",
    });
    expect(called).toBe(false);
  });

  it("returns zero_results for a blank address without calling the network", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return jsonResponse({ status: "OK", results: [] });
    }) as typeof fetch;

    expect(await geocodeAddress({ addressLine1: "" }, { fetchImpl })).toEqual({ status: "zero_results" });
    expect(called).toBe(false);
  });

  it("maps an aborted request to a timeout", async () => {
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const abortError = new Error("aborted");
          abortError.name = "AbortError";
          reject(abortError);
        });
      })) as typeof fetch;

    expect(
      await geocodeAddress({ addressLine1: "437 Cordova Lane" }, { fetchImpl, timeoutMs: 10 }),
    ).toMatchObject({ status: "unavailable", reason: "timeout" });
  });
});
