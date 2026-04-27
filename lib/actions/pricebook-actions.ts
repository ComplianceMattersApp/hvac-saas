"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInternalRole } from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";

const ITEM_TYPES = new Set(["service", "material", "diagnostic", "adjustment"]);

type PricebookNotice =
  | "created"
  | "updated"
  | "status_updated"
  | "invalid_item_name"
  | "invalid_item_type"
  | "invalid_unit_price"
  | "negative_only_for_adjustment"
  | "not_found"
  | "save_failed";

function withNotice(notice: PricebookNotice) {
  return `/ops/admin/pricebook?notice=${encodeURIComponent(notice)}`;
}

function normalizeText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function normalizeNullableText(value: FormDataEntryValue | null) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function parseItemType(raw: FormDataEntryValue | null): string | null {
  const value = normalizeText(raw).toLowerCase();
  if (!ITEM_TYPES.has(value)) return null;
  return value;
}

function parseDefaultUnitPrice(raw: FormDataEntryValue | null): number | null {
  const value = normalizeText(raw);
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) / 100;
}

function validatePriceForType(itemType: string, unitPrice: number) {
  if (itemType !== "adjustment" && unitPrice < 0) {
    return false;
  }

  return true;
}

async function requirePricebookMutationContext() {
  const supabase = await createClient();
  const { internalUser } = await requireInternalRole("admin", { supabase });

  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();
  if (!accountOwnerUserId) {
    throw new Error("PRICEBOOK_SCOPE_MISSING");
  }

  return { supabase, accountOwnerUserId };
}

export async function createPricebookItemFromForm(formData: FormData) {
  const { supabase, accountOwnerUserId } = await requirePricebookMutationContext();

  const itemName = normalizeText(formData.get("item_name"));
  if (!itemName) {
    redirect(withNotice("invalid_item_name"));
  }

  const itemType = parseItemType(formData.get("item_type"));
  if (!itemType) {
    redirect(withNotice("invalid_item_type"));
  }

  const unitPrice = parseDefaultUnitPrice(formData.get("default_unit_price"));
  if (unitPrice === null) {
    redirect(withNotice("invalid_unit_price"));
  }

  if (!validatePriceForType(itemType, unitPrice)) {
    redirect(withNotice("negative_only_for_adjustment"));
  }

  const category = normalizeNullableText(formData.get("category"));
  const defaultDescription = normalizeNullableText(formData.get("default_description"));
  const unitLabel = normalizeNullableText(formData.get("unit_label"));

  const { error } = await supabase.from("pricebook_items").insert({
    account_owner_user_id: accountOwnerUserId,
    item_name: itemName,
    item_type: itemType,
    category,
    default_description: defaultDescription,
    default_unit_price: unitPrice,
    unit_label: unitLabel,
    is_active: true,
  });

  if (error) {
    redirect(withNotice("save_failed"));
  }

  revalidatePath("/ops/admin");
  revalidatePath("/ops/admin/pricebook");
  redirect(withNotice("created"));
}

export async function updatePricebookItemFromForm(formData: FormData) {
  const { supabase, accountOwnerUserId } = await requirePricebookMutationContext();

  const itemId = normalizeText(formData.get("item_id"));
  if (!itemId) {
    redirect(withNotice("not_found"));
  }

  const itemName = normalizeText(formData.get("item_name"));
  if (!itemName) {
    redirect(withNotice("invalid_item_name"));
  }

  const itemType = parseItemType(formData.get("item_type"));
  if (!itemType) {
    redirect(withNotice("invalid_item_type"));
  }

  const unitPrice = parseDefaultUnitPrice(formData.get("default_unit_price"));
  if (unitPrice === null) {
    redirect(withNotice("invalid_unit_price"));
  }

  if (!validatePriceForType(itemType, unitPrice)) {
    redirect(withNotice("negative_only_for_adjustment"));
  }

  const category = normalizeNullableText(formData.get("category"));
  const defaultDescription = normalizeNullableText(formData.get("default_description"));
  const unitLabel = normalizeNullableText(formData.get("unit_label"));

  const { data: existing, error: existingError } = await supabase
    .from("pricebook_items")
    .select("id")
    .eq("id", itemId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (existingError || !existing?.id) {
    redirect(withNotice("not_found"));
  }

  const { error } = await supabase
    .from("pricebook_items")
    .update({
      item_name: itemName,
      item_type: itemType,
      category,
      default_description: defaultDescription,
      default_unit_price: unitPrice,
      unit_label: unitLabel,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("account_owner_user_id", accountOwnerUserId);

  if (error) {
    redirect(withNotice("save_failed"));
  }

  revalidatePath("/ops/admin/pricebook");
  redirect(withNotice("updated"));
}

export async function setPricebookItemActiveFromForm(formData: FormData) {
  const { supabase, accountOwnerUserId } = await requirePricebookMutationContext();

  const itemId = normalizeText(formData.get("item_id"));
  const nextActive = normalizeText(formData.get("is_active")) === "1";

  if (!itemId) {
    redirect(withNotice("not_found"));
  }

  const { data: existing, error: existingError } = await supabase
    .from("pricebook_items")
    .select("id")
    .eq("id", itemId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (existingError || !existing?.id) {
    redirect(withNotice("not_found"));
  }

  const { error } = await supabase
    .from("pricebook_items")
    .update({
      is_active: nextActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("account_owner_user_id", accountOwnerUserId);

  if (error) {
    redirect(withNotice("save_failed"));
  }

  revalidatePath("/ops/admin/pricebook");
  redirect(withNotice("status_updated"));
}
