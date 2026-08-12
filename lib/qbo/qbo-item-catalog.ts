import { getValidQboAccessToken } from "./qbo-connection";
import { getQboAvailability, getQboBaseUrl } from "./qbo-env";
import { listActiveQboItems, type QboItemOption } from "./qbo-api-client";

/**
 * Server-side loader for the QuickBooks item pickers (account default item,
 * per-pricebook-item mapping).
 *
 * Never throws. The hard rule that a QBO failure may not break the calling
 * workflow applies to reads too: if QuickBooks is unreachable, the caller still
 * renders its form — just with the selector disabled and a plain note — instead
 * of failing the page.
 */
export type QboItemCatalog = {
  /** True when this account has an active QBO connection to pick items from. */
  connected: boolean;
  items: QboItemOption[];
  /** Operator-facing reason the list is empty, when it should not have been. */
  error: string | null;
};

const UNAVAILABLE: QboItemCatalog = { connected: false, items: [], error: null };

/**
 * The display name QuickBooks currently uses for an item id.
 *
 * Returns null when the catalog could not be loaded or the id is not in it —
 * the name is a cache for the admin UI, never a reference, so storing null is
 * correct rather than storing a name we could not confirm.
 */
export function resolveQboItemName(catalog: QboItemCatalog, qboItemId: string): string | null {
  const id = String(qboItemId ?? "").trim();
  if (!id) return null;
  return catalog.items.find((item) => item.id === id)?.name ?? null;
}

export async function loadQboItemCatalog(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<QboItemCatalog> {
  if (!getQboAvailability().available) return UNAVAILABLE;

  let token: Awaited<ReturnType<typeof getValidQboAccessToken>>;
  try {
    token = await getValidQboAccessToken({
      supabase: params.supabase,
      accountOwnerUserId: params.accountOwnerUserId,
    });
  } catch {
    // Connected, but the token could not be resolved (refresh failed, lease
    // contention). Treat as connected-but-unreadable so the UI explains itself.
    return {
      connected: true,
      items: [],
      error: "We couldn't reach QuickBooks just now, so the item list is unavailable.",
    };
  }
  if (!token) return UNAVAILABLE;

  try {
    return {
      connected: true,
      items: await listActiveQboItems({
        accessToken: token.accessToken,
        realmId: token.realmId,
        baseUrl: getQboBaseUrl(),
      }),
      error: null,
    };
  } catch {
    return {
      connected: true,
      items: [],
      error: "We couldn't load your QuickBooks items just now. Saving other fields still works.",
    };
  }
}
