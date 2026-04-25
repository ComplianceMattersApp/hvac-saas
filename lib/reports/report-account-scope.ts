/**
 * Shared account-scope resolution helpers for the report center.
 *
 * The `jobs` and `service_cases` tables have no direct `account_owner_user_id`
 * column. Account scope is enforced by filtering through the owning FK chain:
 *   - jobs → contractor_id → contractors.owner_user_id
 *   - service_cases / customers → customers.owner_user_id
 *
 * These helpers must be called before assembling any multi-row dataset so that
 * cross-account rows are excluded at the query level, not filtered in-memory.
 */

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * Returns the contractor IDs that belong to the given account owner.
 * Pass the returned array as `.in("contractor_id", contractorIds)` on jobs
 * queries. If the array is empty the caller should return an empty result set
 * immediately (no jobs exist for this account yet).
 */
export async function resolveReportAccountContractorIds(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<string[]> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  if (!accountOwnerUserId) return [];

  const { data, error } = await params.supabase
    .from("contractors")
    .select("id")
    .eq("owner_user_id", accountOwnerUserId);

  if (error) throw error;

  return Array.from(
    new Set(
      (data ?? []).map((row: any) => String(row?.id ?? "").trim()).filter(Boolean),
    ),
  );
}

/**
 * Returns the customer IDs that belong to the given account owner.
 * Pass the returned array as `.in("customer_id", customerIds)` on
 * service_cases queries. If the array is empty the caller should return an
 * empty result set immediately.
 */
export async function resolveReportAccountCustomerIds(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<string[]> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  if (!accountOwnerUserId) return [];

  const { data, error } = await params.supabase
    .from("customers")
    .select("id")
    .eq("owner_user_id", accountOwnerUserId)
    .is("deleted_at", null);

  if (error) throw error;

  return Array.from(
    new Set(
      (data ?? []).map((row: any) => String(row?.id ?? "").trim()).filter(Boolean),
    ),
  );
}

/**
 * Returns either the ids array as-is, or a guaranteed-non-matching sentinel
 * UUID suitable for use with Supabase `.in(column, ...)` when the array is
 * empty (to avoid a "0 items in list" API error while still returning zero
 * rows).
 */
export function accountScopeInList(ids: string[]): string[] {
  return ids.length ? ids : [ZERO_UUID];
}
