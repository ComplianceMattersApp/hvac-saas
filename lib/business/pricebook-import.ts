export const PRICEBOOK_IMPORT_HEADERS = [
  "Service Name",
  "Category",
  "Kind",
  "Unit",
  "Price",
  "Active",
  "Description",
] as const;

export const PRICEBOOK_IMPORT_MAX_ROWS = 500;
export const PRICEBOOK_IMPORT_TEMPLATE_CSV = [
  PRICEBOOK_IMPORT_HEADERS.join(","),
  "General Cleaning,Cleaning,Service,Job,0,Yes,Standard one-off cleaning service",
  "After-Hours Service,Add-on,Service,Job,0,No,Optional after-hours add-on",
  "Extra Labor Hour,Labor,Labor,Hour,0,Yes,Additional labor time",
  "Supplies / Consumables,Supplies,Material,Item,0,Yes,Materials or consumables used for the job",
].join("\r\n");

export type PricebookImportItemType = "service" | "material" | "diagnostic" | "adjustment";

export type PricebookImportInsertRow = {
  account_owner_user_id: string;
  item_name: string;
  item_type: PricebookImportItemType;
  category: string | null;
  default_description: string | null;
  default_unit_price: number;
  unit_label: string | null;
  is_active: boolean;
  is_starter: false;
  seed_key: null;
};

export type PricebookImportPreviewRow = {
  rowNumber: number;
  serviceName: string;
  category: string | null;
  kind: string;
  unit: string;
  price: number | null;
  active: boolean | null;
  description: string | null;
  status: "ready" | "exists" | "review";
  reason: string;
  insertRow?: Omit<PricebookImportInsertRow, "account_owner_user_id">;
};

export type PricebookImportPreview = {
  readyToAdd: PricebookImportPreviewRow[];
  alreadyExists: PricebookImportPreviewRow[];
  needsReview: PricebookImportPreviewRow[];
  missingHeaders: string[];
  errors: string[];
};

export type PricebookImportResult = {
  added: number;
  skippedExisting: number;
  needsReview: number;
  insertedRows: Array<{ item_name: string }>;
  errors: string[];
};

export interface PricebookImportStore {
  listExistingPricebookItems(accountOwnerUserId: string): Promise<{
    data: Array<{ item_name: string | null }> | null;
    error: { message: string } | null;
  }>;
  insertPricebookItems(rows: PricebookImportInsertRow[]): Promise<{
    error: { message: string } | null;
  }>;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizePricebookImportName(value: unknown) {
  return clean(value).replace(/\s+/g, " ").toLowerCase();
}

function startsLikeFormula(value: string) {
  return /^[=+\-@]/.test(value.trim());
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    const next = csv[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);

  return rows.filter((csvRow) => csvRow.some((value) => clean(value).length > 0));
}

function parseKind(value: string): PricebookImportItemType | null {
  const normalized = clean(value).toLowerCase();
  if (normalized === "service") return "service";
  if (normalized === "labor") return "service";
  if (normalized === "material") return "material";
  if (normalized === "fee") return "service";
  return null;
}

function parseUnit(value: string): string | null {
  const normalized = clean(value).toLowerCase().replace(/\s+/g, " ");
  if (normalized === "job") return "job";
  if (normalized === "hour" || normalized === "hr") return "hr";
  if (normalized === "item" || normalized === "each") return "each";
  if (normalized === "room") return "each";
  if (normalized === "sq ft" || normalized === "sqft" || normalized === "square foot" || normalized === "square feet") {
    return "flat";
  }
  return null;
}

function parseActive(value: string): boolean | null {
  const normalized = clean(value).toLowerCase();
  if (["yes", "y", "true", "1"].includes(normalized)) return true;
  if (["no", "n", "false", "0"].includes(normalized)) return false;
  return null;
}

function parsePrice(value: string): number | null {
  const normalized = clean(value);
  if (!normalized) return 0;
  const parsed = Number(normalized.replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}

function makeReviewRow(rowNumber: number, reason: string, values: Partial<PricebookImportPreviewRow> = {}): PricebookImportPreviewRow {
  return {
    rowNumber,
    serviceName: values.serviceName ?? "",
    category: values.category ?? null,
    kind: values.kind ?? "",
    unit: values.unit ?? "",
    price: values.price ?? null,
    active: values.active ?? null,
    description: values.description ?? null,
    status: "review",
    reason,
  };
}

export function parsePricebookImportCsv(csv: string): {
  rows: Array<Record<(typeof PRICEBOOK_IMPORT_HEADERS)[number], string> & { rowNumber: number }>;
  missingHeaders: string[];
  errors: string[];
} {
  const parsedRows = parseCsvRows(csv);
  if (parsedRows.length === 0) {
    return { rows: [], missingHeaders: PRICEBOOK_IMPORT_HEADERS.slice(), errors: ["CSV file is empty."] };
  }

  const headerRow = parsedRows[0].map((header) => clean(header));
  const headerIndex = new Map(headerRow.map((header, index) => [header.toLowerCase(), index]));
  const missingHeaders = PRICEBOOK_IMPORT_HEADERS.filter(
    (header) => !headerIndex.has(header.toLowerCase()),
  );

  if (missingHeaders.length > 0) {
    return { rows: [], missingHeaders, errors: [] };
  }

  const rows = parsedRows.slice(1).map((csvRow, index) => {
    const row = { rowNumber: index + 2 } as Record<(typeof PRICEBOOK_IMPORT_HEADERS)[number], string> & {
      rowNumber: number;
    };
    PRICEBOOK_IMPORT_HEADERS.forEach((header) => {
      row[header] = csvRow[headerIndex.get(header.toLowerCase()) ?? -1] ?? "";
    });
    return row;
  });

  if (rows.length > PRICEBOOK_IMPORT_MAX_ROWS) {
    return {
      rows: [],
      missingHeaders: [],
      errors: [`CSV has more than ${PRICEBOOK_IMPORT_MAX_ROWS} rows. Import fewer rows and try again.`],
    };
  }

  return { rows, missingHeaders: [], errors: [] };
}

export async function buildPricebookImportPreview(params: {
  csv: string;
  accountOwnerUserId: string;
  store: Pick<PricebookImportStore, "listExistingPricebookItems">;
}): Promise<PricebookImportPreview> {
  const parsed = parsePricebookImportCsv(params.csv);
  const preview: PricebookImportPreview = {
    readyToAdd: [],
    alreadyExists: [],
    needsReview: [],
    missingHeaders: parsed.missingHeaders,
    errors: parsed.errors,
  };

  if (parsed.errors.length > 0 || parsed.missingHeaders.length > 0) {
    return preview;
  }

  const { data: existing, error } = await params.store.listExistingPricebookItems(params.accountOwnerUserId);
  if (error) {
    return {
      ...preview,
      errors: ["Could not check existing services. Please try again."],
    };
  }

  const existingNames = new Set((existing ?? []).map((row) => normalizePricebookImportName(row.item_name)));
  const seenFileNames = new Set<string>();

  parsed.rows.forEach((row) => {
    const serviceName = clean(row["Service Name"]);
    const category = clean(row.Category) || null;
    const kindRaw = clean(row.Kind);
    const unitRaw = clean(row.Unit);
    const priceRaw = clean(row.Price);
    const activeRaw = clean(row.Active);
    const description = clean(row.Description) || null;
    const normalizedName = normalizePricebookImportName(serviceName);

    const baseValues = {
      serviceName,
      category,
      kind: kindRaw,
      unit: unitRaw,
      description,
    };

    if (!serviceName) {
      preview.needsReview.push(makeReviewRow(row.rowNumber, "Missing Service Name.", baseValues));
      return;
    }

    if ([serviceName, category ?? "", kindRaw, unitRaw, description ?? ""].some(startsLikeFormula)) {
      preview.needsReview.push(makeReviewRow(row.rowNumber, "Remove formula-like text from this row.", baseValues));
      return;
    }

    const itemType = parseKind(kindRaw);
    if (!itemType) {
      preview.needsReview.push(makeReviewRow(row.rowNumber, "Unsupported Kind.", baseValues));
      return;
    }

    const unitLabel = parseUnit(unitRaw);
    if (!unitLabel) {
      preview.needsReview.push(makeReviewRow(row.rowNumber, "Unsupported Unit.", baseValues));
      return;
    }

    const price = parsePrice(priceRaw);
    if (price === null) {
      preview.needsReview.push(makeReviewRow(row.rowNumber, "Invalid Price.", { ...baseValues, price: null }));
      return;
    }

    const active = parseActive(activeRaw);
    if (active === null) {
      preview.needsReview.push(makeReviewRow(row.rowNumber, "Invalid Active value.", { ...baseValues, price }));
      return;
    }

    if (seenFileNames.has(normalizedName)) {
      preview.needsReview.push(
        makeReviewRow(row.rowNumber, "Already exists in this file.", { ...baseValues, price, active }),
      );
      return;
    }
    seenFileNames.add(normalizedName);

    if (existingNames.has(normalizedName)) {
      preview.alreadyExists.push({
        rowNumber: row.rowNumber,
        serviceName,
        category,
        kind: kindRaw,
        unit: unitRaw,
        price,
        active,
        description,
        status: "exists",
        reason: "A service with this name already exists.",
      });
      return;
    }

    preview.readyToAdd.push({
      rowNumber: row.rowNumber,
      serviceName,
      category,
      kind: kindRaw,
      unit: unitRaw,
      price,
      active,
      description,
      status: "ready",
      reason: "Ready to add.",
      insertRow: {
        item_name: serviceName,
        item_type: itemType,
        category,
        default_description: description,
        default_unit_price: price,
        unit_label: unitLabel,
        is_active: active,
        is_starter: false,
        seed_key: null,
      },
    });
  });

  return preview;
}

export async function importPricebookRows(params: {
  csv: string;
  accountOwnerUserId: string;
  store: PricebookImportStore;
}): Promise<PricebookImportResult> {
  const preview = await buildPricebookImportPreview(params);
  if (preview.errors.length > 0 || preview.missingHeaders.length > 0) {
    return {
      added: 0,
      skippedExisting: preview.alreadyExists.length,
      needsReview: preview.needsReview.length + preview.missingHeaders.length,
      insertedRows: [],
      errors: preview.errors,
    };
  }

  const rows = preview.readyToAdd
    .map((row) => row.insertRow)
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) => ({
      ...row,
      account_owner_user_id: params.accountOwnerUserId,
    }));

  if (rows.length === 0) {
    return {
      added: 0,
      skippedExisting: preview.alreadyExists.length,
      needsReview: preview.needsReview.length,
      insertedRows: [],
      errors: [],
    };
  }

  const { error } = await params.store.insertPricebookItems(rows);
  if (error) {
    return {
      added: 0,
      skippedExisting: preview.alreadyExists.length,
      needsReview: preview.needsReview.length,
      insertedRows: [],
      errors: ["Could not add services. Please try again."],
    };
  }

  return {
    added: rows.length,
    skippedExisting: preview.alreadyExists.length,
    needsReview: preview.needsReview.length,
    insertedRows: rows.map((row) => ({ item_name: row.item_name })),
    errors: [],
  };
}
