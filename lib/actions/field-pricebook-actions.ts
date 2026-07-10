"use server";

import { createClient } from "@/lib/supabase/server";
import { requireInternalUser } from "@/lib/auth/internal-user";
import { loadFieldBillingExplicitCapabilitiesForUser } from "@/lib/auth/internal-user-access-capabilities";
import { resolveFieldBillingCapabilities } from "@/lib/auth/field-billing-access";

// Slice C: field-tech "save this custom charge to the Pricebook for next time".
// Gated by field_billing_enabled (which is true for techs with the flag AND for
// financial-authority roles). These actions RETURN values — they never redirect —
// because the mobile invoice workspace calls them inline after a charge is added.

export type FieldPricebookNameCheckResult = { exists: boolean };

export type FieldPricebookSaveResult = {
  ok: boolean;
  status: "saved" | "already_exists" | "not_authorized" | "invalid";
  id?: string;
};

// Pricebook item_type values a field save is allowed to write. Anything else
// (e.g. "other", "adjustment", or missing) falls back to "service".
const FIELD_SAVEABLE_ITEM_TYPES = new Set(["service", "material", "diagnostic"]);

function normalizeItemName(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function normalizeItemType(value: FormDataEntryValue | null): string {
  const raw = String(value ?? "").trim().toLowerCase();
  return FIELD_SAVEABLE_ITEM_TYPES.has(raw) ? raw : "service";
}

function parseUnitPrice(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").replace(/[$,\s]/g, "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Number(parsed.toFixed(2));
}

// Escapes LIKE/ILIKE wildcards so the match is an exact (case-insensitive) compare.
function escapeIlikePattern(value: string): string {
  return value.replace(/([%_\\])/g, "\\$1");
}

async function loadFieldPricebookContext() {
  const supabase = await createClient();
  const { userId, internalUser } = await requireInternalUser({ supabase });
  const explicitCapabilities = await loadFieldBillingExplicitCapabilitiesForUser({
    supabase: supabase as any,
    accountOwnerUserId: internalUser.account_owner_user_id,
    internalUserId: userId,
  });
  const capabilities = resolveFieldBillingCapabilities({
    actorUserId: userId,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    explicitCapabilities,
  });
  return { supabase, userId, internalUser, capabilities };
}

async function activePricebookNameExists(params: {
  supabase: any;
  accountOwnerUserId: string;
  itemName: string;
}): Promise<boolean> {
  const { data, error } = await params.supabase
    .from("pricebook_items")
    .select("id")
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("is_active", true)
    .ilike("item_name", escapeIlikePattern(params.itemName))
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

// Part 1: does an active Pricebook item with this name already exist for the
// account? Used by the mobile workspace to decide whether to offer the save prompt.
export async function checkFieldPricebookItemNameExistsFromForm(
  formData: FormData,
): Promise<FieldPricebookNameCheckResult> {
  const itemName = normalizeItemName(formData.get("item_name"));
  if (!itemName) return { exists: false };

  const { supabase, internalUser, capabilities } = await loadFieldPricebookContext();
  // No field-billing access → behave as "already exists" so we never offer the
  // save prompt to a user who could not save anyway.
  if (!capabilities.field_billing_enabled) return { exists: true };

  const exists = await activePricebookNameExists({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    itemName,
  });
  return { exists };
}

// Part 3: create a new active Pricebook item from a field-entered charge.
export async function saveFieldItemToPricebookFromForm(
  formData: FormData,
): Promise<FieldPricebookSaveResult> {
  const itemName = normalizeItemName(formData.get("item_name"));
  const unitPrice = parseUnitPrice(formData.get("unit_price"));
  const itemType = normalizeItemType(formData.get("item_type"));

  if (!itemName || unitPrice === null) {
    return { ok: false, status: "invalid" };
  }

  const { supabase, internalUser, capabilities } = await loadFieldPricebookContext();
  if (!capabilities.field_billing_enabled) {
    return { ok: false, status: "not_authorized" };
  }

  const accountOwnerUserId = internalUser.account_owner_user_id;

  // Guard against the race between the client match check and this write.
  const alreadyExists = await activePricebookNameExists({
    supabase,
    accountOwnerUserId,
    itemName,
  });
  if (alreadyExists) {
    return { ok: true, status: "already_exists" };
  }

  const { data, error } = await supabase
    .from("pricebook_items")
    .insert({
      account_owner_user_id: accountOwnerUserId,
      item_name: itemName,
      item_type: itemType,
      default_unit_price: unitPrice,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    // Unique-constraint style collision → treat as already-exists, never duplicate.
    if (String((error as any)?.code ?? "") === "23505") {
      return { ok: true, status: "already_exists" };
    }
    throw error;
  }

  return { ok: true, status: "saved", id: data?.id ? String(data.id) : undefined };
}
