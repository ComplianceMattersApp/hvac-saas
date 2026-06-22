import { describe, expect, it, vi } from "vitest";

import {
  buildFieldConditionsNote,
  loadTodayFieldConditionsForCoordinates,
  normalizeFieldConditions,
  normalizeFieldConditionCoordinates,
} from "@/lib/home/today-field-conditions";

describe("today field conditions notes", () => {
  it("uses friendly weather copy without scheduling advice", () => {
    const notes = [
      buildFieldConditionsNote({
        currentTempF: 72,
        highTempF: 84,
        condition: "Clear",
        rainChancePercent: 0,
        windMph: 5,
        locationLabel: "Stockton",
      }),
      buildFieldConditionsNote({
        currentTempF: 68,
        highTempF: 76,
        condition: "Rain possible",
        rainChancePercent: 60,
        windMph: 8,
        locationLabel: "Near you",
      }),
      buildFieldConditionsNote({
        currentTempF: 87,
        highTempF: 97,
        condition: "Mostly clear",
        rainChancePercent: 0,
        windMph: 7,
        locationLabel: "Sacramento",
      }),
      buildFieldConditionsNote({
        currentTempF: 70,
        highTempF: 82,
        condition: "Cloudy",
        rainChancePercent: 0,
        windMph: 22,
      }),
    ];

    expect(notes).toContain("Clear skies around Stockton.");
    expect(notes).toContain("Light rain possible near you later today.");
    expect(notes).toContain("Warm afternoon in Sacramento.");
    expect(notes).toContain("Wind is a little noticeable today.");
    for (const note of notes) {
      expect(note).not.toMatch(/\b(reschedule|schedule changes?|move|moving|plan|consider|recommend|before rain|earlier)\b/i);
    }
  });
});

describe("today field conditions coordinates", () => {
  it("normalizes device coordinates to a coarse weather location", () => {
    expect(
      normalizeFieldConditionCoordinates({
        latitude: 37.957701,
        longitude: -121.29078,
      }),
    ).toEqual({
      latitude: 37.96,
      longitude: -121.29,
    });
  });

  it("rejects invalid coordinates", () => {
    expect(normalizeFieldConditionCoordinates({ latitude: 91, longitude: -121 })).toBeNull();
    expect(normalizeFieldConditionCoordinates({ latitude: 37, longitude: -181 })).toBeNull();
    expect(normalizeFieldConditionCoordinates({ latitude: "nope", longitude: -121 })).toBeNull();
  });
});

describe("today field conditions fetch normalization", () => {
  it("normalizes forecast data into a tiny view model", () => {
    const result = normalizeFieldConditions({
      locationLabel: "Stockton",
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
      locationLabel: "Stockton",
      currentTempF: 72,
      highTempF: 84,
      condition: "Clear",
      note: "Clear skies around Stockton.",
      icon: "sun",
    });
  });

  it("falls back to near you when city name is unavailable", () => {
    const result = normalizeFieldConditions({
      forecast: {
        current: {
          temperature_2m: 67,
          weather_code: 61,
          wind_speed_10m: 8,
        },
        daily: {
          temperature_2m_max: [76],
          precipitation_probability_max: [55],
          weather_code: [61],
          wind_speed_10m_max: [12],
        },
      },
    });

    expect(result?.locationLabel).toBe("Near you");
    expect(result?.note).toBe("Light rain possible near you later today.");
  });

  it("omits the weather card safely when provider calls fail", async () => {
    const fetcher = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;

    await expect(
      loadTodayFieldConditionsForCoordinates({
        latitude: 37.96,
        longitude: -121.29,
        fetcher,
      }),
    ).resolves.toBeNull();
  });

  it("loads conditions from current device coordinates without a scheduled-job-city dependency", async () => {
    const fetcher = vi
      .fn()
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

    const result = await loadTodayFieldConditionsForCoordinates({
      latitude: 37.957701,
      longitude: -121.29078,
      locationLabel: "Near you",
      fetcher,
    });

    expect(result?.locationLabel).toBe("Near you");
    const fetchMock = fetcher as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("latitude=37.96");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("longitude=-121.29");
  });
});
