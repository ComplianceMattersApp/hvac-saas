import { describe, expect, it, vi } from "vitest";

import {
  buildFieldConditionsNote,
  loadTodayFieldConditions,
  normalizeFieldConditions,
  normalizeTodayJobLocation,
  resolveTodayFieldConditionsLocation,
  type TodayFieldConditionsLocation,
} from "@/lib/home/today-field-conditions";
import type { TodayJobSummary } from "@/lib/home/today-read-model";

function job(overrides: Partial<TodayJobSummary> = {}): TodayJobSummary {
  return {
    id: "job-1",
    title: "Test Job",
    status: "scheduled",
    opsStatus: null,
    scheduledDate: "2026-06-22",
    windowStart: "09:00:00",
    windowEnd: null,
    jobAddress: "100 Main St",
    city: "Pasadena",
    state: "CA",
    customerFirstName: null,
    customerLastName: null,
    customerPhone: null,
    fieldComplete: false,
    fieldCompleteAt: null,
    ...overrides,
  };
}

const location: TodayFieldConditionsLocation = {
  city: "Pasadena",
  state: "CA",
  label: "Pasadena, CA",
  query: "Pasadena, CA",
};

describe("today field conditions notes", () => {
  it("uses friendly weather copy without scheduling advice", () => {
    const notes = [
      buildFieldConditionsNote({
        currentTempF: 72,
        highTempF: 84,
        condition: "Clear",
        rainChancePercent: 0,
        windMph: 5,
      }),
      buildFieldConditionsNote({
        currentTempF: 68,
        highTempF: 76,
        condition: "Rain possible",
        rainChancePercent: 60,
        windMph: 8,
      }),
      buildFieldConditionsNote({
        currentTempF: 87,
        highTempF: 97,
        condition: "Mostly clear",
        rainChancePercent: 0,
        windMph: 7,
      }),
      buildFieldConditionsNote({
        currentTempF: 70,
        highTempF: 82,
        condition: "Cloudy",
        rainChancePercent: 0,
        windMph: 22,
      }),
    ];

    expect(notes).toContain("Clear skies across today's route.");
    expect(notes).toContain("Light rain may show up later today.");
    expect(notes).toContain("Warm afternoon ahead.");
    expect(notes).toContain("Wind is a little noticeable today.");
    for (const note of notes) {
      expect(note).not.toMatch(/\b(reschedule|schedule changes?|move|moving|plan|consider|recommend|before rain|earlier)\b/i);
    }
  });
});

describe("today field conditions location", () => {
  it("prefers the most common scheduled work area for today", () => {
    const result = resolveTodayFieldConditionsLocation({
      today: "2026-06-22",
      jobs: [
        job({ id: "next", city: "Burbank", state: "CA", windowStart: "08:00:00" }),
        job({ id: "common-1", city: "Pasadena", state: "CA", windowStart: "09:00:00" }),
        job({ id: "common-2", city: "Pasadena", state: "CA", windowStart: "10:00:00" }),
        job({ id: "tomorrow", city: "Glendale", state: "CA", scheduledDate: "2026-06-23" }),
      ],
    });

    expect(result).toMatchObject({
      city: "Pasadena",
      state: "CA",
      label: "Pasadena, CA",
      query: "Pasadena, CA",
    });
  });

  it("returns null when no today scheduled work has a city", () => {
    expect(
      resolveTodayFieldConditionsLocation({
        today: "2026-06-22",
        jobs: [job({ city: null }), job({ scheduledDate: "2026-06-23", city: "Pasadena" })],
      }),
    ).toBeNull();
  });

  it("normalizes city/state from the joined service location when present", () => {
    expect(
      normalizeTodayJobLocation({
        city: "Legacy City",
        locations: { city: "Pasadena", state: "CA" },
      }),
    ).toEqual({ city: "Pasadena", state: "CA" });
  });
});

describe("today field conditions fetch normalization", () => {
  it("normalizes forecast data into a tiny view model", () => {
    const result = normalizeFieldConditions({
      location,
      forecast: {
        current: {
          temperature_2m: 72.4,
          weather_code: 0,
          wind_speed_10m: 6,
        },
        daily: {
          temperature_2m_max: [84.2],
          precipitation_probability_max: [10],
          weather_code: [1],
          wind_speed_10m_max: [12],
        },
      },
    });

    expect(result).toMatchObject({
      label: "Field Conditions",
      locationLabel: "Pasadena, CA",
      currentTempF: 72,
      highTempF: 84,
      condition: "Clear",
      note: "Clear skies across today's route.",
      icon: "sun",
    });
  });

  it("omits the weather card safely when provider calls fail", async () => {
    const fetcher = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;

    await expect(
      loadTodayFieldConditions({
        today: "2026-06-22",
        jobs: [job()],
        fetcher,
      }),
    ).resolves.toBeNull();
  });

  it("loads conditions without changing Today job count inputs", async () => {
    const jobs = [job({ id: "j1" }), job({ id: "j2" })];
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ name: "Pasadena", admin1: "CA", latitude: 34.1478, longitude: -118.1445 }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          current: { temperature_2m: 72, weather_code: 0, wind_speed_10m: 5 },
          daily: {
            temperature_2m_max: [84],
            precipitation_probability_max: [5],
            weather_code: [0],
            wind_speed_10m_max: [10],
          },
        }),
      }) as unknown as typeof fetch;

    const beforeCount = jobs.length;
    const result = await loadTodayFieldConditions({
      today: "2026-06-22",
      jobs,
      fetcher,
    });

    expect(result?.locationLabel).toBe("Pasadena, CA");
    expect(jobs).toHaveLength(beforeCount);
  });
});
