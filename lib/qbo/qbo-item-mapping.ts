/**
 * Read-side helpers for QuickBooks item mapping.
 *
 * Deliberately NOT folded into the shared pricebook / connection SELECTs: those
 * feed every catalog and connection read in the app, so adding columns to them
 * would turn a lagging migration into an app-wide 42703 outage. These are
 * additive, separately tolerated reads — if the columns are not deployed yet,
 * callers get "no mapping" and the sync falls through to the app-owned
 * EveryStep Services item exactly as it did before. Same pattern as
 * qbo-void-state.ts.
 *
 * Resolution order for one invoice line (implemented by callers):
 *   1. the line's pricebook item has a qbo_item_id  → use it
 *   2. the account's default_qbo_item_id is set     → use it
 *   3. the app-owned EveryStep Services fallback
 */

export type QboItemMapping = {
  qboItemId: string;
  /** Cached display name. Not authoritative — QuickBooks may have renamed it. */
  qboItemName: string | null;
};

export type PricebookQboItemMapping = QboItemMapping & {
  /** The EveryStep pricebook item name, for operator-facing error messages. */
  pricebookItemName: string | null;
};

/** True when the failure is "these columns aren't deployed yet", not a real error. */
export function isMissingQboItemMappingColumnError(error: unknown): boolean {
  const code = String((error as any)?.code ?? "").trim();
  const message = String((error as any)?.message ?? "").toLowerCase();
  if (code === "42703") return message.includes("qbo_item") || message.includes("default_qbo_item");
  return (
    message.includes("column")
    && (message.includes("qbo_item") || message.includes("default_qbo_item"))
    && message.includes("does not exist")
  );
}

function toMapping(qboItemId: unknown, qboItemName: unknown): QboItemMapping | null {
  const id = String(qboItemId ?? "").trim();
  if (!id) return null;
  return { qboItemId: id, qboItemName: String(qboItemName ?? "").trim() || null };
}

/**
 * The account-level default QuickBooks item, or null when none is configured
 * (or the columns are not deployed).
 */
export async function readAccountDefaultQboItem(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<QboItemMapping | null> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  if (!accountOwnerUserId) return null;

  try {
    const { data, error } = await params.supabase
      .from("qbo_connections")
      .select("default_qbo_item_id, default_qbo_item_name")
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("status", "active")
      .maybeSingle();
    if (error || !data) return null;
    return toMapping(data.default_qbo_item_id, data.default_qbo_item_name);
  } catch {
    return null;
  }
}

/**
 * QuickBooks item mappings for a set of pricebook items, keyed by pricebook id.
 *
 * One batched query for every line on the invoice — never per line. Unmapped
 * pricebook items are simply absent from the map.
 */
export async function readPricebookQboItemMappings(params: {
  supabase: any;
  accountOwnerUserId: string;
  pricebookItemIds: string[];
}): Promise<Map<string, PricebookQboItemMapping>> {
  const result = new Map<string, PricebookQboItemMapping>();
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  const ids = [...new Set((params.pricebookItemIds ?? []).map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (!accountOwnerUserId || ids.length === 0) return result;

  try {
    const { data, error } = await params.supabase
      .from("pricebook_items")
      .select("id, item_name, qbo_item_id, qbo_item_name")
      .eq("account_owner_user_id", accountOwnerUserId)
      .in("id", ids);
    if (error || !data) return result;
    for (const row of data) {
      const mapping = toMapping(row?.qbo_item_id, row?.qbo_item_name);
      if (!mapping) continue;
      result.set(String(row.id), {
        ...mapping,
        pricebookItemName: String(row?.item_name ?? "").trim() || null,
      });
    }
    return result;
  } catch {
    return result;
  }
}

/**
 * Form encoding for the mapping selectors.
 *
 * The <option> carries both id and name so saving does not need a second QBO
 * round-trip. Only the id is authoritative; the name is a cached display label,
 * so accepting it from the form costs nothing. Split on the FIRST separator —
 * QuickBooks item names may contain one.
 */
const QBO_ITEM_SELECTION_SEPARATOR = "|";

export function encodeQboItemSelection(item: { id: string; name: string }): string {
  return `${String(item.id ?? "").trim()}${QBO_ITEM_SELECTION_SEPARATOR}${String(item.name ?? "").trim()}`;
}

export function parseQboItemSelection(raw: unknown): QboItemMapping | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const separatorIndex = value.indexOf(QBO_ITEM_SELECTION_SEPARATOR);
  const id = (separatorIndex === -1 ? value : value.slice(0, separatorIndex)).trim();
  if (!id) return null;
  const name = separatorIndex === -1 ? "" : value.slice(separatorIndex + 1).trim();
  return { qboItemId: id, qboItemName: name || null };
}
