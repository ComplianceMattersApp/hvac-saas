export const DEFAULT_ACCOUNT_TIME_ZONE = "America/Los_Angeles";

export const ACCOUNT_TIME_ZONE_OPTIONS = [
  { value: "America/Los_Angeles", label: "Pacific Time" },
  { value: "America/Denver", label: "Mountain Time" },
  { value: "America/Phoenix", label: "Arizona Time" },
  { value: "America/Chicago", label: "Central Time" },
  { value: "America/New_York", label: "Eastern Time" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
] as const;

export type AccountTimeZoneOption = { value: string; label: string };

export function listAccountTimeZoneOptions(): AccountTimeZoneOption[] {
  const common = ACCOUNT_TIME_ZONE_OPTIONS.map((option) => ({ ...option }));
  const commonValues = new Set<string>(common.map((option) => option.value));
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };
  const supported = intlWithSupportedValues.supportedValuesOf?.("timeZone") ?? [];
  const remaining = supported
    .filter((value) => !commonValues.has(value))
    .map((value) => ({ value, label: value.replace(/_/g, " ") }));

  return [...common, ...remaining];
}

export function isValidIanaTimeZone(value: string | null | undefined): boolean {
  const normalized = String(value ?? "").trim();
  if (!normalized) return false;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function normalizeAccountTimeZone(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  return isValidIanaTimeZone(normalized) ? normalized : DEFAULT_ACCOUNT_TIME_ZONE;
}

export function formatTimestampInAccountTimeZone(
  value: string | Date | null | undefined,
  timeZone: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  fallback = "-",
): string {
  if (value == null || value === "") return fallback;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;

  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: normalizeAccountTimeZone(timeZone),
  }).format(parsed);
}
