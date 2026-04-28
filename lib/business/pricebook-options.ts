export const PRICEBOOK_CATEGORY_OPTIONS = [
  "HVAC - General",
  "HVAC - Diagnostics",
  "HVAC - Maintenance",
  "HVAC - Repair",
  "Compliance",
  "Compliance Docs",
  "ECC / Compliance Testing",
  "Duct / Airflow",
  "Electrical",
  "Refrigerant",
  "Refrigerant Services",
  "Fees",
  "Permits / Documentation",
  "Controls",
  "Parts",
  "Labor",
  "Adjustments",
  "Other",
] as const;

export const PRICEBOOK_UNIT_LABEL_OPTIONS = [
  "each",
  "hr",
  "lb",
  "visit",
  "test",
  "job",
  "flat",
  "system",
  "trip",
  "doc",
] as const;

const CATEGORY_OPTION_SET = new Set<string>(PRICEBOOK_CATEGORY_OPTIONS);
const UNIT_LABEL_OPTION_SET = new Set<string>(PRICEBOOK_UNIT_LABEL_OPTIONS);

export function parsePricebookCategory(value: string | null): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  if (!CATEGORY_OPTION_SET.has(normalized)) return null;
  return normalized;
}

export function parsePricebookUnitLabel(value: string | null): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  if (!UNIT_LABEL_OPTION_SET.has(normalized)) return null;
  return normalized;
}

export function isKnownPricebookCategory(value: string | null): boolean {
  return parsePricebookCategory(value) !== null;
}

export function isKnownPricebookUnitLabel(value: string | null): boolean {
  return parsePricebookUnitLabel(value) !== null;
}
