/**
 * Trust-boundary helpers for equipment lifecycle mutations (replace/retire).
 *
 * public.replace_customer_location_equipment trusts its p_owner_user_id
 * argument rather than deriving it from auth.uid() (see the migration
 * comment) — it is only safe to call because the server action supplies that
 * value from the session-derived account scope, never from client input.
 * These two checks are the app-layer half of that contract:
 *   1. assertNoClientSuppliedOwnerId — reject any request that itself tries
 *      to submit an owner/account id, since a legitimate client never needs to.
 *   2. requireScopedEquipmentForMutation — confirm the equipment id a caller
 *      supplied actually belongs to the session-scoped location/owner before
 *      it's handed to a function that only re-checks owner, not location.
 */

const CLIENT_SUPPLIED_OWNER_ID_KEYS = ["owner_user_id", "account_owner_user_id", "p_owner_user_id"];

export function assertNoClientSuppliedOwnerId(formData: FormData) {
  for (const key of CLIENT_SUPPLIED_OWNER_ID_KEYS) {
    if (formData.has(key)) {
      throw new Error(`Unexpected client-supplied ${key} — owner scope must come from the session, not the request`);
    }
  }
}

export async function requireScopedEquipmentForMutation(params: {
  admin: any;
  equipmentId: string;
  locationId: string;
  ownerUserId: string;
}) {
  const { data, error } = await params.admin
    .from("equipment")
    .select("id, location_id, owner_user_id, status")
    .eq("id", params.equipmentId)
    .eq("location_id", params.locationId)
    .eq("owner_user_id", params.ownerUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error("Equipment not found in internal account scope");
  return data;
}
