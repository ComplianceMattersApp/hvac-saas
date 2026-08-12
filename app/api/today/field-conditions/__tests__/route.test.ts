import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveDualContextAccess = vi.fn();
const loadTodayFieldConditionsForCoordinates = vi.fn();
const createClient = vi.fn(async () => ({ __supabase: true }));

vi.mock("@/lib/auth/dual-context-access", () => ({
  resolveDualContextAccess: (...args: unknown[]) => resolveDualContextAccess(...args),
}));

vi.mock("@/lib/home/today-field-conditions", () => ({
  loadTodayFieldConditionsForCoordinates: (...args: unknown[]) =>
    loadTodayFieldConditionsForCoordinates(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClient(),
}));

async function getFieldConditions(params?: { lat?: string; lon?: string }) {
  const { GET } = await import("@/app/api/today/field-conditions/route");
  const url = new URL("http://localhost/api/today/field-conditions");
  if (params?.lat !== undefined) url.searchParams.set("lat", params.lat);
  if (params?.lon !== undefined) url.searchParams.set("lon", params.lon);
  return GET(new NextRequest(url));
}

describe("GET /api/today/field-conditions — app-access gate + coordinate loading", () => {
  beforeEach(() => {
    resolveDualContextAccess.mockResolvedValue({ hasActiveAppAccess: true });
    loadTodayFieldConditionsForCoordinates.mockResolvedValue({
      temperatureF: 72,
      summary: "Clear",
    });
  });

  it("returns 401 with null conditions and never loads when the caller lacks active app access", async () => {
    resolveDualContextAccess.mockResolvedValue({ hasActiveAppAccess: false });

    const res = await getFieldConditions({ lat: "34.0", lon: "-118.2" });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ conditions: null });
    expect(loadTodayFieldConditionsForCoordinates).not.toHaveBeenCalled();
  });

  it("loads conditions for the provided coordinates when the caller has access", async () => {
    const res = await getFieldConditions({ lat: "34.0", lon: "-118.2" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conditions: { temperatureF: 72, summary: "Clear" } });
    expect(loadTodayFieldConditionsForCoordinates).toHaveBeenCalledWith({
      latitude: "34.0",
      longitude: "-118.2",
      locationLabel: "Near you",
    });
  });

  it("passes null coordinates through to the loader when lat/lon are absent", async () => {
    const res = await getFieldConditions();

    expect(res.status).toBe(200);
    expect(loadTodayFieldConditionsForCoordinates).toHaveBeenCalledWith({
      latitude: null,
      longitude: null,
      locationLabel: "Near you",
    });
  });
});
