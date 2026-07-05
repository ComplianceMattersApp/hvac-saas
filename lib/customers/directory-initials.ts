export const CUSTOMER_DIRECTORY_LETTER_VALUES = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
] as const;

export type CustomerDirectoryAlphaLetter = (typeof CUSTOMER_DIRECTORY_LETTER_VALUES)[number];
export type CustomerDirectoryInitialKey = CustomerDirectoryAlphaLetter | "other";
export type CustomerDirectoryLetterFilter = CustomerDirectoryInitialKey | "all";

export function getCustomerDirectoryInitialKey(displayName: unknown): CustomerDirectoryInitialKey {
  const trimmed = String(displayName ?? "").trim();
  const upper = (trimmed[0] ?? "").toUpperCase();
  return /^[A-Z]$/.test(upper) ? (upper as CustomerDirectoryAlphaLetter) : "other";
}

export function normalizeCustomerDirectoryLetterFilter(value: unknown): CustomerDirectoryLetterFilter {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "all") return "all";
  if (normalized === "other" || normalized === "#") return "other";

  const upper = normalized.toUpperCase();
  return /^[A-Z]$/.test(upper) ? (upper as CustomerDirectoryAlphaLetter) : "all";
}

export function customerDirectoryLetterFilterLabel(filter: CustomerDirectoryLetterFilter) {
  if (filter === "all") return "All";
  if (filter === "other") return "#";
  return filter;
}
