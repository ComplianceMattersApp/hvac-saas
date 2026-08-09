import { describe, expect, it } from "vitest";
import {
  parseGeocodeBackfillArgs,
  runLocationGeocodeBackfill,
  type GeocodeBackfillDeps,
} from "../backfill-location-geocodes";

type QueryFilters = {
  table: string;
  updates: Array<Record<string, unknown>>;
};

function createFakeSupabase(rows: Array<Record<string, unknown>>) {
  const state: QueryFilters = { table: "", updates: [] };

  const selectBuilder = {
    is: () => selectBuilder,
    not: () => selectBuilder,
    order: () => selectBuilder,
    eq: () => selectBuilder,
    limit: () => Promise.resolve({ data: rows, error: null }),
  };

  const client = {
    from(table: string) {
      state.table = table;
      return {
        select: () => selectBuilder,
        update(values: Record<string, unknown>) {
          state.updates.push(values);
          return {
            eq: () => ({
              is: () => Promise.resolve({ error: null }),
            }),
          };
        },
      };
    },
  };

  return { client, state };
}

const availableRouting = () => ({ available: true, missingKeys: [] as string[] });
const noSleep = { delayMs: 0, sleep: async () => {} };

const sampleRow = {
  id: "loc-1",
  owner_user_id: "owner-1",
  address_line1: "437 Cordova Lane",
  address_line2: null,
  city: "Stockton",
  state: "CA",
  zip: "95207",
};

describe("parseGeocodeBackfillArgs", () => {
  it("defaults to a bounded dry run", () => {
    expect(parseGeocodeBackfillArgs([])).toEqual({
      apply: false,
      accountOwnerUserId: null,
      limit: 200,
      jsonOutput: false,
    });
  });

  it("parses apply, account, limit, and json flags", () => {
    expect(parseGeocodeBackfillArgs(["--apply", "--account", "owner-1", "--limit", "50", "--json"])).toEqual({
      apply: true,
      accountOwnerUserId: "owner-1",
      limit: 50,
      jsonOutput: true,
    });
  });

  it("rejects unknown arguments and invalid limits", () => {
    expect(parseGeocodeBackfillArgs(["--nope"])).toEqual({ error: "Unknown argument: --nope" });
    expect(parseGeocodeBackfillArgs(["--limit", "0"])).toEqual({
      error: "--limit must be an integer between 1 and 5000",
    });
  });
});

describe("runLocationGeocodeBackfill", () => {
  it("dry run geocodes without writing", async () => {
    const { client, state } = createFakeSupabase([sampleRow]);
    const deps: GeocodeBackfillDeps = {
      createClient: () => client,
      geocode: async () => ({
        status: "ok",
        coordinates: { latitude: 37.95776, longitude: -121.2908 },
        locationType: "ROOFTOP",
        formattedAddress: "437 Cordova Ln",
      }),
      routingAvailability: availableRouting,
      ...noSleep,
    };

    const result = await runLocationGeocodeBackfill(
      { apply: false, accountOwnerUserId: null, limit: 200, jsonOutput: false },
      deps,
    );

    expect(result).toMatchObject({ mode: "dry_run", scanned: 1, geocoded: 1, applied: 0 });
    expect(state.updates).toEqual([]);
  });

  it("apply mode writes coordinates with backfill provenance", async () => {
    const { client, state } = createFakeSupabase([sampleRow]);
    const deps: GeocodeBackfillDeps = {
      createClient: () => client,
      geocode: async () => ({
        status: "ok",
        coordinates: { latitude: 37.95776, longitude: -121.2908 },
        locationType: "ROOFTOP",
        formattedAddress: "437 Cordova Ln",
      }),
      routingAvailability: availableRouting,
      ...noSleep,
    };

    const result = await runLocationGeocodeBackfill(
      { apply: true, accountOwnerUserId: null, limit: 200, jsonOutput: false },
      deps,
    );

    expect(result).toMatchObject({ mode: "apply", scanned: 1, geocoded: 1, applied: 1 });
    expect(state.updates[0]).toMatchObject({
      latitude: 37.95776,
      longitude: -121.2908,
      geocode_source: "geocoding_backfill",
    });
  });

  it("counts zero-result addresses without failing the run", async () => {
    const { client } = createFakeSupabase([sampleRow]);
    const deps: GeocodeBackfillDeps = {
      createClient: () => client,
      geocode: async () => ({ status: "zero_results" }),
      routingAvailability: availableRouting,
      ...noSleep,
    };

    const result = await runLocationGeocodeBackfill(
      { apply: true, accountOwnerUserId: null, limit: 200, jsonOutput: false },
      deps,
    );

    expect(result).toMatchObject({ scanned: 1, geocoded: 0, applied: 0, zeroResults: 1 });
    expect(result.errors).toEqual([]);
  });

  it("stops immediately when the geocoder has no key", async () => {
    const rows = [sampleRow, { ...sampleRow, id: "loc-2" }];
    const { client } = createFakeSupabase(rows);
    let calls = 0;
    const deps: GeocodeBackfillDeps = {
      createClient: () => client,
      geocode: async () => {
        calls += 1;
        return { status: "unavailable", reason: "missing_key" };
      },
      routingAvailability: availableRouting,
      ...noSleep,
    };

    const result = await runLocationGeocodeBackfill(
      { apply: true, accountOwnerUserId: null, limit: 200, jsonOutput: false },
      deps,
    );

    expect(calls).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("refuses to run at all when routing env is missing", async () => {
    const { client } = createFakeSupabase([sampleRow]);
    let geocodeCalled = false;
    const deps: GeocodeBackfillDeps = {
      createClient: () => client,
      geocode: async () => {
        geocodeCalled = true;
        return { status: "zero_results" };
      },
      routingAvailability: () => ({ available: false, missingKeys: ["GOOGLE_MAPS_API_KEY"] }),
      ...noSleep,
    };

    const result = await runLocationGeocodeBackfill(
      { apply: true, accountOwnerUserId: null, limit: 200, jsonOutput: false },
      deps,
    );

    expect(geocodeCalled).toBe(false);
    expect(result.scanned).toBe(0);
    expect(result.errors[0]).toContain("GOOGLE_MAPS_API_KEY");
  });
});
