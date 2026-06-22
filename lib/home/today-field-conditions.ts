import type { TodayJobSummary } from "@/lib/home/today-read-model";

export type TodayFieldConditionsLocation = {
  city: string;
  state: string | null;
  label: string;
  query: string;
};

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

type GeocodingResult = {
  latitude?: unknown;
  longitude?: unknown;
  name?: unknown;
  admin1?: unknown;
  country_code?: unknown;
};

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

function pickRelatedObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function normalizeTodayJobLocation(row: any): { city: string | null; state: string | null } {
  const location = pickRelatedObject(row?.locations);
  return {
    city: clean(location?.city as string | null | undefined) || clean(row?.city) || null,
    state: clean(location?.state as string | null | undefined) || null,
  };
}

export function resolveTodayFieldConditionsLocation(params: {
  jobs: TodayJobSummary[];
  today: string;
}): TodayFieldConditionsLocation | null {
  const ranked = params.jobs
    .filter((job) => job.scheduledDate === params.today && !job.fieldComplete)
    .map((job, index) => ({
      city: clean(job.city),
      state: clean(job.state),
      windowStart: clean(job.windowStart),
      index,
    }))
    .filter((location) => location.city);

  if (ranked.length === 0) return null;

  const counts = new Map<string, { city: string; state: string | null; count: number; firstWindow: string; firstIndex: number }>();
  for (const location of ranked) {
    const key = `${location.city.toLowerCase()}|${location.state.toLowerCase()}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.firstWindow && location.windowStart) existing.firstWindow = location.windowStart;
      continue;
    }
    counts.set(key, {
      city: location.city,
      state: location.state || null,
      count: 1,
      firstWindow: location.windowStart,
      firstIndex: location.index,
    });
  }

  const [best] = [...counts.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const aWindow = a.firstWindow || "99:99:99";
    const bWindow = b.firstWindow || "99:99:99";
    const windowSort = aWindow.localeCompare(bWindow);
    return windowSort !== 0 ? windowSort : a.firstIndex - b.firstIndex;
  });

  if (!best) return null;
  const label = [best.city, best.state].filter(Boolean).join(", ");
  return {
    city: best.city,
    state: best.state,
    label,
    query: label,
  };
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

export function buildFieldConditionsNote(params: {
  currentTempF: number;
  highTempF: number;
  condition: string;
  rainChancePercent: number | null;
  windMph: number | null;
}): string {
  let note = "Looks like a steady field day.";
  if ((params.rainChancePercent ?? 0) >= 50 || /rain|storm/i.test(params.condition)) {
    note = "Light rain may show up later today.";
  } else if ((params.rainChancePercent ?? 0) >= 25) {
    note = "Light rain possible later today.";
  } else if (params.highTempF >= 95) {
    note = "Warm afternoon ahead.";
  } else if (params.currentTempF <= 55 && params.highTempF <= 72) {
    note = "Cool morning, mild afternoon.";
  } else if ((params.windMph ?? 0) >= 18) {
    note = "Wind is a little noticeable today.";
  } else if (/clear|sunny|mostly clear/i.test(params.condition)) {
    note = "Clear skies across today's route.";
  }

  return ADVICE_WORD_PATTERN.test(note) ? "Looks like a steady field day." : note;
}

export function normalizeFieldConditions(params: {
  location: TodayFieldConditionsLocation;
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
  });

  return {
    label: "Field Conditions",
    locationLabel: params.location.label,
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

async function geocodeLocation(
  location: TodayFieldConditionsLocation,
  fetcher: FetchLike,
): Promise<{ latitude: number; longitude: number } | null> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", location.query);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  url.searchParams.set("countryCode", "US");

  const data = await fetchJson(fetcher, url);
  const results = Array.isArray(data?.results) ? (data.results as GeocodingResult[]) : [];
  const stateLower = clean(location.state).toLowerCase();
  const cityLower = clean(location.city).toLowerCase();
  const result =
    results.find((item) => {
      const nameMatches = clean(item.name as string | null | undefined).toLowerCase() === cityLower;
      const stateMatches = !stateLower || clean(item.admin1 as string | null | undefined).toLowerCase() === stateLower;
      return nameMatches && stateMatches;
    }) ?? results[0];

  const latitude = toNumber(result?.latitude);
  const longitude = toNumber(result?.longitude);
  if (latitude == null || longitude == null) return null;
  return { latitude, longitude };
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

export async function loadTodayFieldConditions(params: {
  jobs: TodayJobSummary[];
  today: string;
  fetcher?: FetchLike;
}): Promise<TodayFieldConditions | null> {
  const location = resolveTodayFieldConditionsLocation({
    jobs: params.jobs,
    today: params.today,
  });
  if (!location) return null;

  try {
    const fetcher = params.fetcher ?? fetch;
    const coordinates = await geocodeLocation(location, fetcher);
    if (!coordinates) return null;
    const forecast = await fetchForecast(coordinates, fetcher);
    if (!forecast) return null;
    return normalizeFieldConditions({ location, forecast });
  } catch {
    return null;
  }
}
