import { describe, expect, it, vi } from "vitest";

import { lookupDriveMinutes } from "../drive-time-matrix";
import {
  fetchDriveTimeMatrix,
  fetchDriveTimeMatrixForPoints,
  MAX_MATRIX_ELEMENTS,
} from "../routes-api";

const A = { latitude: 37.9577, longitude: -121.2908 };
const B = { latitude: 38.1302, longitude: -121.2724 };

function okResponse(rows: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => rows,
    text: async () => JSON.stringify(rows),
  } as unknown as Response;
}

describe("fetchDriveTimeMatrix", () => {
  it("builds a matrix from ROUTE_EXISTS rows", async () => {
    const fetchImpl = vi.fn(async () =>
      okResponse([
        { originIndex: 0, destinationIndex: 1, duration: "1320s", condition: "ROUTE_EXISTS" },
      ]),
    );

    const matrix = await fetchDriveTimeMatrix({
      origins: [A, B], destinations: [A, B], apiKey: "k", fetchImpl: fetchImpl as any,
    });

    expect(lookupDriveMinutes(matrix, A, B)).toBe(22);
  });

  it("skips rows without a drivable route rather than treating them as zero", async () => {
    const fetchImpl = vi.fn(async () =>
      okResponse([
        { originIndex: 0, destinationIndex: 1, duration: "0s", condition: "ROUTE_NOT_FOUND" },
      ]),
    );

    const matrix = await fetchDriveTimeMatrix({
      origins: [A, B], destinations: [A, B], apiKey: "k", fetchImpl: fetchImpl as any,
    });

    expect(matrix).toBeNull();
  });

  it("requests TRAFFIC_UNAWARE, because the planner proposes days not departures", async () => {
    const fetchImpl = vi.fn(async () =>
      okResponse([{ originIndex: 0, destinationIndex: 1, duration: "60s", condition: "ROUTE_EXISTS" }]),
    );

    await fetchDriveTimeMatrix({
      origins: [A, B], destinations: [A, B], apiKey: "k", fetchImpl: fetchImpl as any,
    });

    const body = JSON.parse((fetchImpl.mock.calls[0] as any)[1].body);
    expect(body.routingPreference).toBe("TRAFFIC_UNAWARE");
    expect(body.travelMode).toBe("DRIVE");
  });

  it("refuses an oversized request before spending money on it", async () => {
    const fetchImpl = vi.fn();
    const many = Array.from({ length: MAX_MATRIX_ELEMENTS }, (_, i) => ({
      latitude: 37 + i / 1000, longitude: -121 - i / 1000,
    }));

    const matrix = await fetchDriveTimeMatrix({
      origins: many, destinations: many, apiKey: "k", fetchImpl: fetchImpl as any,
    });

    expect(matrix).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null instead of throwing when the provider fails", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false, status: 403, json: async () => ({}), text: async () => "REQUEST_DENIED",
    }) as unknown as Response);

    await expect(
      fetchDriveTimeMatrix({ origins: [A], destinations: [B], apiKey: "k", fetchImpl: fetchImpl as any }),
    ).resolves.toBeNull();
  });

  it("returns null instead of throwing when the request blows up", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("network down"); });

    await expect(
      fetchDriveTimeMatrix({ origins: [A], destinations: [B], apiKey: "k", fetchImpl: fetchImpl as any }),
    ).resolves.toBeNull();
  });

  it("does no work without points", async () => {
    const fetchImpl = vi.fn();
    await expect(
      fetchDriveTimeMatrix({ origins: [], destinations: [B], apiKey: "k", fetchImpl: fetchImpl as any }),
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("fetchDriveTimeMatrixForPoints", () => {
  it("deduplicates repeated coordinates so a location is not billed twice", async () => {
    const fetchImpl = vi.fn(async () =>
      okResponse([{ originIndex: 0, destinationIndex: 1, duration: "60s", condition: "ROUTE_EXISTS" }]),
    );

    await fetchDriveTimeMatrixForPoints({
      points: [A, { ...A }, B, B], apiKey: "k", fetchImpl: fetchImpl as any,
    });

    const body = JSON.parse((fetchImpl.mock.calls[0] as any)[1].body);
    expect(body.origins).toHaveLength(2);
    expect(body.destinations).toHaveLength(2);
  });

  it("does not call out for a single point", async () => {
    const fetchImpl = vi.fn();
    await expect(
      fetchDriveTimeMatrixForPoints({ points: [A], apiKey: "k", fetchImpl: fetchImpl as any }),
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
