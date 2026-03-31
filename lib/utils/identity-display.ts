export function firstNonEmptyText(values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }

  return "";
}

export function emailToDisplayFallback(email: string | null | undefined): string {
  const raw = String(email ?? "").trim().toLowerCase();
  if (!raw) return "";

  const localPart = raw.split("@")[0] ?? "";
  const normalized = localPart.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  return normalized
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function resolveHumanDisplayName(input: {
  profileFullName?: unknown;
  metadataName?: unknown;
  metadataFullName?: unknown;
  metadataFirstName?: unknown;
  metadataLastName?: unknown;
  metadataGivenName?: unknown;
  email?: unknown;
  fallback?: string;
}): string {
  const fromMetadataParts = [input.metadataFirstName, input.metadataLastName]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(" ");

  const display = firstNonEmptyText([
    input.profileFullName,
    input.metadataName,
    input.metadataFullName,
    fromMetadataParts,
    input.metadataGivenName,
    emailToDisplayFallback(String(input.email ?? "")),
  ]);

  return display || String(input.fallback ?? "User");
}

export function firstNameFromDisplayName(displayName: string | null | undefined, fallback = "Account") {
  const text = String(displayName ?? "").trim();
  if (!text) return fallback;
  return text.split(/\s+/)[0] || fallback;
}
