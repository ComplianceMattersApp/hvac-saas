export type VisitScopeItemKind = "primary" | "companion_service";

export type VisitScopeItem = {
  id?: string;
  title: string;
  details: string | null;
  kind: VisitScopeItemKind;
  source_pricebook_item_id?: string | null;
  expected_unit_price?: number | null;
  expected_quantity?: number | null;
  unit_label?: string | null;
  item_type?: string | null;
  category?: string | null;
  promoted_service_job_id?: string | null;
  promoted_at?: string | null;
  promoted_by_user_id?: string | null;
};

export const VISIT_SCOPE_ITEM_LIMIT = 8;
const VISIT_SCOPE_SUMMARY_MAX = 600;
const VISIT_SCOPE_ITEM_TITLE_MAX = 160;
const VISIT_SCOPE_ITEM_DETAILS_MAX = 500;
const VISIT_SCOPE_ITEM_UNIT_LABEL_MAX = 40;
const VISIT_SCOPE_ITEM_ITEM_TYPE_MAX = 40;
const VISIT_SCOPE_ITEM_CATEGORY_MAX = 80;
const VISIT_SCOPE_ITEM_EXPECTED_PRICE_MAX = 99999999;
const VISIT_SCOPE_ITEM_EXPECTED_QUANTITY_MAX = 999999;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isVisitScopeItemId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return UUID_PATTERN.test(value.trim());
}

export function sanitizeVisitScopeItemId(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return isVisitScopeItemId(normalized) ? normalized : null;
}

function sanitizeVisitScopeExpectedUnitPrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).replace(/\$/g, "").replace(/,/g, "").trim());

  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return null;

  const bounded = Math.min(parsed, VISIT_SCOPE_ITEM_EXPECTED_PRICE_MAX);
  return Number(bounded.toFixed(2));
}

function sanitizeVisitScopeExpectedQuantity(value: unknown): number {
  if (value === null || value === undefined || value === "") return 1;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value).trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Number(Math.min(parsed, VISIT_SCOPE_ITEM_EXPECTED_QUANTITY_MAX).toFixed(2));
}

function buildFallbackUuidV4() {
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createVisitScopeItemId() {
  const candidate = globalThis.crypto?.randomUUID?.();
  if (candidate && isVisitScopeItemId(candidate)) return candidate;
  return buildFallbackUuidV4();
}

export function normalizeVisitScopeItemKind(value: unknown): VisitScopeItemKind {
  return String(value ?? "").trim().toLowerCase() === "companion_service"
    ? "companion_service"
    : "primary";
}

export function sanitizeVisitScopeSummary(value: unknown): string | null {
  const summary = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!summary) return null;
  return summary.slice(0, VISIT_SCOPE_SUMMARY_MAX);
}

export function sanitizeVisitScopeItems(value: unknown): VisitScopeItem[] {
  if (!Array.isArray(value)) return [];

  const items: VisitScopeItem[] = [];

  for (const row of value) {
    const id = sanitizeVisitScopeItemId((row as { id?: unknown })?.id) ?? createVisitScopeItemId();
    const title = String((row as { title?: unknown })?.title ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, VISIT_SCOPE_ITEM_TITLE_MAX);
    const detailsValue = String((row as { details?: unknown })?.details ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, VISIT_SCOPE_ITEM_DETAILS_MAX);
    const sourcePricebookItemId = sanitizeVisitScopeItemId(
      (row as { source_pricebook_item_id?: unknown })?.source_pricebook_item_id,
    );
    const expectedUnitPrice = sanitizeVisitScopeExpectedUnitPrice(
      (row as { expected_unit_price?: unknown })?.expected_unit_price,
    );
    const expectedQuantity = sanitizeVisitScopeExpectedQuantity(
      (row as { expected_quantity?: unknown })?.expected_quantity,
    );
    const unitLabel = String((row as { unit_label?: unknown })?.unit_label ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, VISIT_SCOPE_ITEM_UNIT_LABEL_MAX);
    const itemType = String((row as { item_type?: unknown })?.item_type ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, VISIT_SCOPE_ITEM_ITEM_TYPE_MAX);
    const category = String((row as { category?: unknown })?.category ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, VISIT_SCOPE_ITEM_CATEGORY_MAX);
    const promotedServiceJobId = String(
      (row as { promoted_service_job_id?: unknown })?.promoted_service_job_id ?? "",
    ).trim();
    const promotedAt = String((row as { promoted_at?: unknown })?.promoted_at ?? "").trim();
    const promotedByUserId = String(
      (row as { promoted_by_user_id?: unknown })?.promoted_by_user_id ?? "",
    ).trim();

    if (!title && !detailsValue) continue;
    if (!title) {
      throw new Error("Visit scope items require a title.");
    }

    items.push({
      id,
      title,
      details: detailsValue || null,
      kind: normalizeVisitScopeItemKind((row as { kind?: unknown })?.kind),
      source_pricebook_item_id: sourcePricebookItemId,
      expected_unit_price: expectedUnitPrice,
      expected_quantity: expectedQuantity,
      unit_label: unitLabel || null,
      item_type: itemType || null,
      category: category || null,
      promoted_service_job_id: promotedServiceJobId || null,
      promoted_at: promotedAt || null,
      promoted_by_user_id: promotedByUserId || null,
    });
  }

  if (items.length > VISIT_SCOPE_ITEM_LIMIT) {
    throw new Error(`Visit scope is limited to ${VISIT_SCOPE_ITEM_LIMIT} items.`);
  }

  return items;
}

export function parseVisitScopeItemsJson(value: unknown): VisitScopeItem[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Visit scope items payload was invalid.");
  }

  return sanitizeVisitScopeItems(parsed);
}

export function hasStructuredVisitScopeItemsJson(value: unknown): boolean {
  try {
    return parseVisitScopeItemsJson(value).length > 0;
  } catch {
    return false;
  }
}

export function hasVisitScopeContent(summary: string | null, items: VisitScopeItem[]) {
  return Boolean(summary) || items.length > 0;
}

export function formatVisitScopeItemKindLabel(kind: VisitScopeItemKind) {
  return kind === "companion_service" ? "Companion Service" : "Primary Visit Scope";
}

export function isVisitScopeItemPromoted(item: VisitScopeItem | null | undefined) {
  return Boolean(String(item?.promoted_service_job_id ?? "").trim());
}

function truncateVisitScopeText(value: string, maxLength: number) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function buildVisitScopeReadModel(
  summaryValue: unknown,
  itemsValue: unknown,
  options?: {
    leadMaxLength?: number;
    previewItemCount?: number;
    previewItemMaxLength?: number;
  },
) {
  const summary = sanitizeVisitScopeSummary(summaryValue);

  let items: VisitScopeItem[] = [];
  try {
    items = sanitizeVisitScopeItems(itemsValue);
  } catch {
    items = [];
  }

  const leadMaxLength = options?.leadMaxLength ?? 88;
  const previewItemCount = options?.previewItemCount ?? 2;
  const previewItemMaxLength = options?.previewItemMaxLength ?? 40;
  const primaryItems = items.filter((item) => item.kind === "primary");
  const previewSource = primaryItems.length > 0 ? primaryItems : items;
  const leadSource = summary || previewSource[0]?.title || "";
  const previewItems = previewSource
    .slice(summary ? 0 : 1, summary ? previewItemCount : previewItemCount + 1)
    .map((item) => truncateVisitScopeText(item.title, previewItemMaxLength))
    .filter(Boolean)
    .slice(0, previewItemCount);

  return {
    hasContent: hasVisitScopeContent(summary, items),
    summary,
    items,
    itemCount: items.length,
    companionCount: items.filter((item) => item.kind === "companion_service").length,
    lead: truncateVisitScopeText(leadSource, leadMaxLength),
    previewItems,
  };
}

export function buildPromotedCompanionReadModel(itemsValue: unknown) {
  let items: VisitScopeItem[] = [];
  try {
    items = sanitizeVisitScopeItems(itemsValue);
  } catch {
    items = [];
  }

  const promotedJobIds = Array.from(
    new Set(
      items
        .filter((item) => item.kind === "companion_service" && isVisitScopeItemPromoted(item))
        .map((item) => String(item.promoted_service_job_id ?? "").trim())
        .filter(Boolean),
    ),
  );

  return {
    hasPromotedCompanion: promotedJobIds.length > 0,
    promotedCount: promotedJobIds.length,
    promotedJobIds,
    label:
      promotedJobIds.length === 1
        ? "1 service follow-up created"
        : `${promotedJobIds.length} service follow-ups created`,
  };
}

export function buildVisitScopeIncludesReadModel(
  summaryValue: unknown,
  itemsValue: unknown,
  options?: {
    leadMaxLength?: number;
  },
) {
  const readModel = buildVisitScopeReadModel(summaryValue, itemsValue, {
    leadMaxLength: options?.leadMaxLength ?? 72,
    previewItemCount: 1,
    previewItemMaxLength: 40,
  });

  if (!readModel.hasContent) {
    return {
      hasContent: false,
      lead: "",
      sourceItemCount: 0,
      label: "",
    };
  }

  const sourceItems = readModel.items.filter((item) => item.kind === "primary");
  const rankedSource = sourceItems.length > 0 ? sourceItems : readModel.items;
  const sourceItemCount = rankedSource.length;
  const leadSource = rankedSource[0]?.title || readModel.summary || readModel.lead;
  const lead = truncateVisitScopeText(String(leadSource ?? "").trim(), options?.leadMaxLength ?? 72);
  const extraCount = sourceItemCount > 1 ? sourceItemCount - 1 : 0;
  const label = extraCount > 0 ? `${lead} + ${extraCount} more` : lead;

  return {
    hasContent: true,
    lead,
    sourceItemCount,
    label,
  };
}
