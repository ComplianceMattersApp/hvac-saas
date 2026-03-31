const STREET_EQUIVALENTS: Record<string, string> = {
  n: "north",
  north: "north",
  s: "south",
  south: "south",
  e: "east",
  east: "east",
  w: "west",
  west: "west",
  ne: "northeast",
  northeast: "northeast",
  nw: "northwest",
  northwest: "northwest",
  se: "southeast",
  southeast: "southeast",
  sw: "southwest",
  southwest: "southwest",
  st: "street",
  street: "street",
  ave: "avenue",
  av: "avenue",
  avenue: "avenue",
  ln: "lane",
  lane: "lane",
  rd: "road",
  road: "road",
  blvd: "boulevard",
  boulevard: "boulevard",
  dr: "drive",
  drive: "drive",
  ct: "court",
  court: "court",
  pl: "place",
  place: "place",
  pkwy: "parkway",
  parkway: "parkway",
  hwy: "highway",
  highway: "highway",
};

function normalizeToken(token: string) {
  const t = token.trim().toLowerCase();
  if (!t) return "";
  return STREET_EQUIVALENTS[t] ?? t;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizePunctuation(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
}

export function normalizeSearchText(value: string | null | undefined): string {
  const base = normalizeWhitespace(normalizePunctuation(String(value ?? "")));
  if (!base) return "";

  return base
    .split(" ")
    .map((part) => normalizeToken(part))
    .filter(Boolean)
    .join(" ");
}

export function searchTokens(value: string | null | undefined): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}

export function buildIlikeSearchTerms(value: string | null | undefined): string[] {
  const raw = normalizeWhitespace(normalizePunctuation(String(value ?? "")));
  const normalized = normalizeSearchText(value);

  const terms = new Set<string>();

  if (raw) terms.add(raw);
  if (normalized) terms.add(normalized);

  for (const token of raw.split(" ")) {
    const t = token.trim();
    if (t.length >= 2) terms.add(t);
  }

  for (const token of normalized.split(" ")) {
    const t = token.trim();
    if (t.length >= 2) terms.add(t);
  }

  return Array.from(terms).slice(0, 10);
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function matchesNormalizedSearch(params: {
  query: string | null | undefined;
  values: Array<string | null | undefined>;
}): boolean {
  const queryNorm = normalizeSearchText(params.query);
  if (!queryNorm) return true;

  const queryTokens = searchTokens(params.query);
  const haystackNorm = params.values
    .map((value) => normalizeSearchText(value))
    .filter(Boolean)
    .join(" ");

  const haystackDigits = digitsOnly(params.values.map((value) => String(value ?? "")).join(" "));

  return queryTokens.every((token) => {
    const tokenDigits = digitsOnly(token);
    if (tokenDigits.length >= 3) return haystackDigits.includes(tokenDigits);
    return haystackNorm.includes(token);
  });
}
