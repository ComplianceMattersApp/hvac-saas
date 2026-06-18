"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInternalRole } from "@/lib/auth/internal-user";
import {
  buildPricebookImportPreview,
  importPricebookRows,
  type PricebookImportPreview,
  type PricebookImportResult,
  type PricebookImportStore,
} from "@/lib/business/pricebook-import";
import { resolveOperationalMutationEntitlementAccess } from "@/lib/business/platform-entitlement";
import {
  parsePricebookCategory,
  parsePricebookUnitLabel,
} from "@/lib/business/pricebook-options";
import { createClient } from "@/lib/supabase/server";

const ITEM_TYPES = new Set(["service", "material", "diagnostic", "adjustment"]);
const MAX_IMPORT_FILE_BYTES = 256 * 1024;

type PricebookNotice =
  | "created"
  | "updated"
  | "status_updated"
  | "invalid_item_name"
  | "invalid_item_type"
  | "invalid_category"
  | "invalid_unit_label"
  | "invalid_unit_price"
  | "negative_only_for_adjustment"
  | "not_found"
  | "save_failed";

export type PricebookImportActionState = {
  status: "idle" | "preview" | "imported" | "error";
  message?: string;
  csvText?: string;
  preview?: PricebookImportPreview;
  result?: PricebookImportResult;
};

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

function parseAllowedCategory(raw: FormDataEntryValue | null): string | null | "INVALID" {
  const normalized = normalizeNullableText(raw);
  if (!normalized) return null;
  const parsed = parsePricebookCategory(normalized);
  if (!parsed) return "INVALID";
  return parsed;
}

function parseAllowedUnitLabel(raw: FormDataEntryValue | null): string | null | "INVALID" {
  const normalized = normalizeNullableText(raw);
  if (!normalized) return null;
  const parsed = parsePricebookUnitLabel(normalized);
  if (!parsed) return "INVALID";
  return parsed;
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

async function requireOperationalPricebookMutationAccessOrRedirect(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  accountOwnerUserId: string;
}) {
  const access = await resolveOperationalMutationEntitlementAccess({
    accountOwnerUserId: params.accountOwnerUserId,
    supabase: params.supabase,
  });

  if (access.authorized) {
    return;
  }

  const search = new URLSearchParams({
    err: "entitlement_blocked",
    reason: access.reason,
  });
  redirect(`/ops/admin/company-profile?${search.toString()}`);
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

function createPricebookImportStore(supabase: Awaited<ReturnType<typeof createClient>>): PricebookImportStore {
  return {
    async listExistingPricebookItems(accountOwnerUserId) {
      const { data, error } = await supabase
        .from("pricebook_items")
        .select("item_name")
        .eq("account_owner_user_id", accountOwnerUserId);

      return {
        data: data ? (data as Array<{ item_name: string | null }>) : null,
        error: error ? { message: error.message } : null,
      };
    },
    async insertPricebookItems(rows) {
      const { error } = await supabase.from("pricebook_items").insert(rows);
      return { error: error ? { message: error.message } : null };
    },
  };
}

function isCsvFile(file: File) {
  const name = String(file.name ?? "").toLowerCase();
  const type = String(file.type ?? "").toLowerCase();
  return name.endsWith(".csv") || type === "text/csv" || type === "application/vnd.ms-excel";
}

async function readCsvFileFromForm(formData: FormData): Promise<
  | { ok: true; csvText: string }
  | { ok: false; message: string }
> {
  const file = formData.get("csv_file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a CSV file to upload." };
  }

  if (!isCsvFile(file)) {
    return { ok: false, message: "Upload a CSV file." };
  }

  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return { ok: false, message: "Use a CSV file smaller than 256 KB." };
  }

  try {
    return { ok: true, csvText: await file.text() };
  } catch {
    return { ok: false, message: "We could not read that CSV file. Please try again." };
  }
}

export async function previewPricebookImportFromForm(
  _previousState: PricebookImportActionState,
  formData: FormData,
): Promise<PricebookImportActionState> {
  const { supabase, accountOwnerUserId } = await requirePricebookMutationContext();
  const fileResult = await readCsvFileFromForm(formData);

  if (!fileResult.ok) {
    return { status: "error", message: fileResult.message };
  }

  const preview = await buildPricebookImportPreview({
    csv: fileResult.csvText,
    accountOwnerUserId,
    store: createPricebookImportStore(supabase),
  });

  if (preview.errors.length > 0) {
    return {
      status: "error",
      message: preview.errors[0] ?? "We could not preview this CSV.",
      csvText: fileResult.csvText,
      preview,
    };
  }

  if (preview.missingHeaders.length > 0) {
    return {
      status: "error",
      message: `Missing required columns: ${preview.missingHeaders.join(", ")}.`,
      csvText: fileResult.csvText,
      preview,
    };
  }

  return {
    status: "preview",
    message: "Preview ready. Review the rows before importing.",
    csvText: fileResult.csvText,
    preview,
  };
}

export async function confirmPricebookImportFromForm(
  _previousState: PricebookImportActionState,
  formData: FormData,
): Promise<PricebookImportActionState> {
  const { supabase, accountOwnerUserId } = await requirePricebookMutationContext();
  await requireOperationalPricebookMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId,
  });

  const csvText = normalizeText(formData.get("csv_text"));
  if (!csvText) {
    return { status: "error", message: "Upload and preview a CSV before importing." };
  }

  const result = await importPricebookRows({
    csv: csvText,
    accountOwnerUserId,
    store: createPricebookImportStore(supabase),
  });

  if (result.errors.length > 0) {
    return {
      status: "error",
      message: result.errors[0] ?? "Could not import services. Please try again.",
      csvText,
      result,
    };
  }

  revalidatePath("/ops/admin");
  revalidatePath("/ops/admin/pricebook");

  return {
    status: "imported",
    message: "Import complete.",
    result,
  };
}

export async function createPricebookItemFromForm(formData: FormData) {
  const { supabase, accountOwnerUserId } = await requirePricebookMutationContext();

  await requireOperationalPricebookMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId,
  });

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

  const category = parseAllowedCategory(formData.get("category"));
  if (category === "INVALID") {
    redirect(withNotice("invalid_category"));
  }

  const defaultDescription = normalizeNullableText(formData.get("default_description"));
  const unitLabel = parseAllowedUnitLabel(formData.get("unit_label"));
  if (unitLabel === "INVALID") {
    redirect(withNotice("invalid_unit_label"));
  }

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

  const category = parseAllowedCategory(formData.get("category"));
  if (category === "INVALID") {
    redirect(withNotice("invalid_category"));
  }

  const defaultDescription = normalizeNullableText(formData.get("default_description"));
  const unitLabel = parseAllowedUnitLabel(formData.get("unit_label"));
  if (unitLabel === "INVALID") {
    redirect(withNotice("invalid_unit_label"));
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

  await requireOperationalPricebookMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId,
  });

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

  await requireOperationalPricebookMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId,
  });

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
