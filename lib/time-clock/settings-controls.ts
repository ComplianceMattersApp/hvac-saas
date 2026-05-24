function normalizeToggleValue(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function parseBooleanToggleEntries(values: unknown[]): boolean {
  return (values ?? []).some((value) => {
    const normalized = normalizeToggleValue(value);
    return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
  });
}
