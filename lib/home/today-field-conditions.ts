export type TodayFieldConditionsIcon = "sun" | "cloud" | "rain" | "wind";

export type TodayFieldConditions = {
  label: "Field Conditions";
  locationLabel: string;
  currentTempF: number;
  highTempF: number;
  condition: string;
  rainChancePercent: number | null;
  windMph: number | null;
  note: string;
  icon: TodayFieldConditionsIcon;
};

type FetchLike = typeof fetch;

type ForecastResponse = {
  current?: {
    temperature_2m?: unknown;
    weather_code?: unknown;
    wind_speed_10m?: unknown;
  };
  daily?: {
    temperature_2m_max?: unknown[];
    precipitation_probability_max?: unknown[];
    weather_code?: unknown[];
    wind_speed_10m_max?: unknown[];
  };
};

const WEATHER_REVALIDATE_SECONDS = 20 * 60;
const WEATHER_FETCH_TIMEOUT_MS = 1500;
const ADVICE_WORD_PATTERN = /\b(reschedule|schedule changes?|move|moving|plan|consider|recommend|before rain|earlier)\b/i;

function clean(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function toNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundInt(value: unknown): number | null {
  const parsed = toNumber(value);
  return parsed == null ? null : Math.round(parsed);
}

function weatherCodeLabel(code: number | null): string {
  if (code == null) return "Steady";
  if (code === 0) return "Clear";
  if ([1, 2].includes(code)) return "Mostly clear";
  if (code === 3) return "Cloudy";
  if ([45, 48].includes(code)) return "Foggy";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain possible";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow possible";
  if ([95, 96, 99].includes(code)) return "Storms possible";
  return "Steady";
}

function iconForConditions(params: {
  condition: string;
  rainChancePercent: number | null;
  windMph: number | null;
}): TodayFieldConditionsIcon {
  if ((params.windMph ?? 0) >= 18) return "wind";
  if ((params.rainChancePercent ?? 0) >= 30 || /rain|drizzle|storm|snow/i.test(params.condition)) return "rain";
  if (/cloud|fog/i.test(params.condition)) return "cloud";
  return "sun";
}

function locationPhrase(locationLabel: string | null | undefined, preposition: "around" | "in"): string {
  const label = clean(locationLabel);
  if (!label || label.toLowerCase() === "near you") return "near you";
  return `${preposition} ${label}`;
}

export function buildFieldConditionsNote(params: {
  currentTempF: number;
  highTempF: number;
  condition: string;
  rainChancePercent: number | null;
  windMph: number | null;
  locationLabel?: string | null;
}): string {
  let note = "Looks like a steady field day.";
  const nearPhrase = locationPhrase(params.locationLabel, "around");
  const inPhrase = locationPhrase(params.locationLabel, "in");

  if ((params.rainChancePercent ?? 0) >= 50 || /rain|storm/i.test(params.condition)) {
    note = `Light rain possible ${nearPhrase} later today.`;
  } else if ((params.rainChancePercent ?? 0) >= 25) {
    note = `Light rain possible ${nearPhrase} later today.`;
  } else if (params.highTempF >= 95) {
    note = nearPhrase === "near you" ? "Warm afternoon ahead." : `Warm afternoon ${inPhrase}.`;
  } else if (params.currentTempF <= 55 && params.highTempF <= 72) {
    note = "Cool morning, mild afternoon.";
  } else if ((params.windMph ?? 0) >= 18) {
    note = "Wind is a little noticeable today.";
  } else if (/clear|sunny|mostly clear/i.test(params.condition)) {
    note = `Clear skies ${nearPhrase}.`;
  } else if (nearPhrase !== "near you") {
    note = `Looks like a steady field day ${inPhrase}.`;
  }

  return ADVICE_WORD_PATTERN.test(note) ? "Looks like a steady field day." : note;
}

export function normalizeFieldConditions(params: {
  locationLabel?: string | null;
  forecast: ForecastResponse;
}): TodayFieldConditions | null {
  const currentTempF = roundInt(params.forecast.current?.temperature_2m);
  const highTempF = roundInt(params.forecast.daily?.temperature_2m_max?.[0]);
  if (currentTempF == null || highTempF == null) return null;

  const rainChancePercent = roundInt(params.forecast.daily?.precipitation_probability_max?.[0]);
  const windMph = roundInt(
    params.forecast.current?.wind_speed_10m ?? params.forecast.daily?.wind_speed_10m_max?.[0],
  );
  const currentCode = roundInt(params.forecast.current?.weather_code);
  const dailyCode = roundInt(params.forecast.daily?.weather_code?.[0]);
  const condition = weatherCodeLabel(currentCode ?? dailyCode);
  const note = buildFieldConditionsNote({
    currentTempF,
    highTempF,
    condition,
    rainChancePercent,
    windMph,
    locationLabel: params.locationLabel,
  });
  const locationLabel = clean(params.locationLabel) || "Near you";

  return {
    label: "Field Conditions",
    locationLabel,
    currentTempF,
    highTempF,
    condition,
    rainChancePercent,
    windMph: windMph != null && windMph >= 18 ? windMph : null,
    note,
    icon: iconForConditions({ condition, rainChancePercent, windMph }),
  };
}

async function fetchJson(fetcher: FetchLike, url: URL): Promise<any | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEATHER_FETCH_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      next: { revalidate: WEATHER_REVALIDATE_SECONDS },
      signal: controller.signal,
    } as RequestInit);
    if (!response.ok) return null;
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeFieldConditionCoordinates(params: {
  latitude: unknown;
  longitude: unknown;
}): { latitude: number; longitude: number } | null {
  const latitude = toNumber(params.latitude);
  const longitude = toNumber(params.longitude);
  if (latitude == null || longitude == null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return {
    latitude: Number(latitude.toFixed(2)),
    longitude: Number(longitude.toFixed(2)),
  };
}

async function fetchForecast(
  coordinates: { latitude: number; longitude: number },
  fetcher: FetchLike,
): Promise<ForecastResponse | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", coordinates.latitude.toFixed(2));
  url.searchParams.set("longitude", coordinates.longitude.toFixed(2));
  url.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m");
  url.searchParams.set("daily", "temperature_2m_max,precipitation_probability_max,weather_code,wind_speed_10m_max");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "1");

  return fetchJson(fetcher, url) as Promise<ForecastResponse | null>;
}

export async function loadTodayFieldConditionsForCoordinates(params: {
  latitude: unknown;
  longitude: unknown;
  locationLabel?: string | null;
  fetcher?: FetchLike;
}): Promise<TodayFieldConditions | null> {
  const coordinates = normalizeFieldConditionCoordinates({
    latitude: params.latitude,
    longitude: params.longitude,
  });
  if (!coordinates) return null;

  try {
    const fetcher = params.fetcher ?? fetch;
    const forecast = await fetchForecast(coordinates, fetcher);
    if (!forecast) return null;
    return normalizeFieldConditions({
      locationLabel: clean(params.locationLabel) || "Near you",
      forecast,
    });
  } catch {
    return null;
  }
}
