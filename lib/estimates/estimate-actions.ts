"use server";

// lib/estimates/estimate-actions.ts
// Compliance Matters: Estimate V1B server actions.
// Internal-only. Account-owner scoped. No UI, no customer/contractor visibility.
// Non-goals: approval flow, conversion, email, PDF, payment, Visit Scope mutation.

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireInternalUser } from "@/lib/auth/internal-user";
import { findOrCreateCustomer } from "@/lib/customers/findOrCreateCustomer";
import {
  buildEstimateNumber,
  loadScopedCustomerForEstimate,
  loadScopedLocationForEstimate,
  loadScopedServiceCaseForEstimate,
  loadScopedJobForEstimate,
  loadScopedPricebookItemForEstimate,
  recomputeEstimateTotals,
  getEstimateById,
  listEstimatesByAccount,
  isEstimateToJobConversionSchemaReady,
  getEstimateToJobConversionSchemaReady,
  getEstimateConvertedJobId,
} from "@/lib/estimates/estimate-read";
import {
  canTransitionEstimateStatus,
  isValidEstimateStatus,
  type EstimateStatus,
} from "@/lib/estimates/estimate-domain";
import { isEstimatesEnabled } from "@/lib/estimates/estimate-exposure";
import { sanitizeVisitScopeItems, type VisitScopeItem } from "@/lib/jobs/visit-scope";

export { getEstimateById, listEstimatesByAccount };

function normalizeLocationPart(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function validLocationZip(zip: string) {
  return /^\d{5}(?:-\d{4})?$/.test(zip);
}

function splitName(name: string) {
  const cleaned = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return { firstName: "", lastName: "" };
  }

  const parts = cleaned.split(" ").filter(Boolean);
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ");
  return { firstName, lastName };
}

export type EstimateCustomerAssistParams = {
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  zip: string;
};

export type EstimateCustomerAssistResult =
  | {
      success: true;
      customerId: string;
      locationId: string;
      customer: {
        id: string;
        full_name: string | null;
        first_name: string | null;
        last_name: string | null;
        phone: string | null;
        email: string | null;
      };
      location: {
        id: string;
        customer_id: string;
        address_line1: string | null;
        address_line2: string | null;
        city: string | null;
        state: string | null;
        zip: string | null;
        nickname: string | null;
      };
      reusedCustomer: boolean;
      reusedLocation: boolean;
    }
  | {
      success: false;
      error: string;
    };

export async function resolveEstimateCustomerLocationAssist(
  params: EstimateCustomerAssistParams
): Promise<EstimateCustomerAssistResult> {
  if (!isEstimatesEnabled()) {
    return { success: false, error: "Estimates are currently unavailable." };
  }

  const customerName = String(params.customerName ?? "").trim().replace(/\s+/g, " ");
  const customerPhone = String(params.customerPhone ?? "").trim();
  const customerEmail = String(params.customerEmail ?? "").trim() || null;
  const addressLine1 = String(params.addressLine1 ?? "").trim().replace(/\s+/g, " ");
  const addressLine2 = String(params.addressLine2 ?? "").trim().replace(/\s+/g, " ") || null;
  const city = String(params.city ?? "").trim().replace(/\s+/g, " ");
  const state = String(params.state ?? "").trim().toUpperCase();
  const zip = String(params.zip ?? "").trim();

  if (!customerName) {
    return { success: false, error: "Customer name is required." };
  }
  if (!customerPhone) {
    return { success: false, error: "Customer phone is required." };
  }
  if (!addressLine1 || !city || !state || !zip) {
    return {
      success: false,
      error: "Address, city, state, and ZIP are required.",
    };
  }
  if (!validLocationZip(zip)) {
    return {
      success: false,
      error: "ZIP must be 5 digits (or ZIP+4).",
    };
  }

  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });
  const admin = createAdminClient();

  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();
  if (!accountOwnerUserId) {
    return { success: false, error: "Internal account scope is required." };
  }

  const { firstName, lastName } = splitName(customerName);

  const { customerId, reused: reusedCustomer } = await findOrCreateCustomer({
    supabase: admin,
    firstName,
    lastName,
    phone: customerPhone,
    email: customerEmail,
    ownerUserId: accountOwnerUserId,
  });

  const locationAddressNorm = normalizeLocationPart(addressLine1);
  const locationAddress2Norm = normalizeLocationPart(addressLine2);
  const locationCityNorm = normalizeLocationPart(city);
  const locationStateNorm = normalizeLocationPart(state);
  const locationZipNorm = normalizeLocationPart(zip);

  const { data: customerLocations, error: locationsErr } = await admin
    .from("locations")
    .select("id, customer_id, address_line1, address_line2, city, state, zip, postal_code, nickname")
    .eq("owner_user_id", accountOwnerUserId)
    .eq("customer_id", customerId);
  if (locationsErr) throw locationsErr;

  const existingLocation = (customerLocations ?? []).find((row: any) => {
    const rowAddress1 = normalizeLocationPart(row.address_line1);
    const rowAddress2 = normalizeLocationPart(row.address_line2);
    const rowCity = normalizeLocationPart(row.city);
    const rowState = normalizeLocationPart(row.state);
    const rowZip = normalizeLocationPart(row.zip ?? row.postal_code);

    if (!rowAddress1 || !rowCity) return false;
    if (rowAddress1 !== locationAddressNorm) return false;
    if (rowCity !== locationCityNorm) return false;
    if (locationStateNorm && rowState && rowState !== locationStateNorm) return false;
    if (locationZipNorm && rowZip && rowZip !== locationZipNorm) return false;
    if (locationAddress2Norm && rowAddress2 && rowAddress2 !== locationAddress2Norm) {
      return false;
    }
    return true;
  });

  let locationId = "";
  let reusedLocation = false;
  let locationSnapshot: {
    id: string;
    customer_id: string;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    nickname: string | null;
  } | null = null;

  if (existingLocation?.id) {
    locationId = String(existingLocation.id);
    reusedLocation = true;
    locationSnapshot = {
      id: locationId,
      customer_id: String(existingLocation.customer_id ?? customerId),
      address_line1: String(existingLocation.address_line1 ?? "").trim() || null,
      address_line2: String(existingLocation.address_line2 ?? "").trim() || null,
      city: String(existingLocation.city ?? "").trim() || null,
      state: String(existingLocation.state ?? "").trim() || null,
      zip:
        String(existingLocation.zip ?? existingLocation.postal_code ?? "").trim() || null,
      nickname: String(existingLocation.nickname ?? "").trim() || null,
    };
  } else {
    const { data: insertedLocation, error: insertLocationErr } = await admin
      .from("locations")
      .insert({
        owner_user_id: accountOwnerUserId,
        customer_id: customerId,
        address_line1: addressLine1,
        address_line2: addressLine2,
        city,
        state,
        zip,
        postal_code: zip,
      })
      .select("id, customer_id, address_line1, address_line2, city, state, zip, nickname")
      .single();
    if (insertLocationErr) throw insertLocationErr;

    locationId = String(insertedLocation.id ?? "").trim();
    locationSnapshot = {
      id: locationId,
      customer_id: String(insertedLocation.customer_id ?? customerId),
      address_line1: String(insertedLocation.address_line1 ?? "").trim() || null,
      address_line2: String(insertedLocation.address_line2 ?? "").trim() || null,
      city: String(insertedLocation.city ?? "").trim() || null,
      state: String(insertedLocation.state ?? "").trim() || null,
      zip: String(insertedLocation.zip ?? "").trim() || null,
      nickname: String(insertedLocation.nickname ?? "").trim() || null,
    };
  }

  if (!locationId) {
    return { success: false, error: "Failed to resolve location." };
  }

  const { data: customerRow, error: customerReadErr } = await admin
    .from("customers")
    .select("id, full_name, first_name, last_name, phone, email")
    .eq("owner_user_id", accountOwnerUserId)
    .eq("id", customerId)
    .maybeSingle();
  if (customerReadErr) throw customerReadErr;

  if (!customerRow?.id || !locationSnapshot) {
    return { success: false, error: "Failed to resolve customer or location." };
  }

  return {
    success: true,
    customerId,
    locationId,
    reusedCustomer,
    reusedLocation,
    customer: {
      id: String(customerRow.id),
      full_name: String(customerRow.full_name ?? "").trim() || null,
      first_name: String(customerRow.first_name ?? "").trim() || null,
      last_name: String(customerRow.last_name ?? "").trim() || null,
      phone: String(customerRow.phone ?? "").trim() || null,
      email: String(customerRow.email ?? "").trim() || null,
    },
    location: locationSnapshot,
  };
}

// ---------------------------------------------------------------------------
// Create estimate draft
// ---------------------------------------------------------------------------

export type CreateEstimateDraftParams = {
  customerId: string;
  locationId: string;
  title: string;
  notes?: string | null;
  serviceCaseId?: string | null;
  originJobId?: string | null;
};

export type CreateEstimateDraftResult =
  | { success: true; estimateId: string; estimateNumber: string }
  | { success: false; error: string };

export async function createEstimateDraft(
  params: CreateEstimateDraftParams
): Promise<CreateEstimateDraftResult> {
  if (!isEstimatesEnabled()) {
    return { success: false, error: "Estimates are currently unavailable." };
  }

  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });

  const accountOwnerUserId = internalUser.account_owner_user_id;
  const userId = internalUser.user_id;
  const admin = createAdminClient();

  // Validate required: customer must belong to this account
  const customerId = String(params.customerId ?? "").trim();
  if (!customerId) return { success: false, error: "customer_id is required." };

  const scopedCustomer = await loadScopedCustomerForEstimate({
    customerId,
    accountOwnerUserId,
    admin,
  });
  if (!scopedCustomer) {
    return { success: false, error: "customer_id not found in this account." };
  }

  // Validate required: location must belong to this account
  const locationId = String(params.locationId ?? "").trim();
  if (!locationId) return { success: false, error: "location_id is required." };

  const scopedLocation = await loadScopedLocationForEstimate({
    locationId,
    accountOwnerUserId,
    admin,
  });
  if (!scopedLocation) {
    return { success: false, error: "location_id not found in this account." };
  }

  // Validate optional: service_case_id must belong to this account if provided
  const serviceCaseId = params.serviceCaseId?.trim() || null;
  if (serviceCaseId) {
    const scopedSC = await loadScopedServiceCaseForEstimate({
      serviceCaseId,
      accountOwnerUserId,
      admin,
    });
    if (!scopedSC) {
      return { success: false, error: "service_case_id not found in this account." };
    }
  }

  // Validate optional: origin_job_id must belong to this account if provided
  const originJobId = params.originJobId?.trim() || null;
  if (originJobId) {
    const scopedJob = await loadScopedJobForEstimate({
      jobId: originJobId,
      accountOwnerUserId,
      admin,
    });
    if (!scopedJob) {
      return { success: false, error: "origin_job_id not found in this account." };
    }
  }

  const title = String(params.title ?? "").trim();
  if (!title) return { success: false, error: "title is required." };

  const notes = params.notes?.trim() || null;

  // Generate a unique estimate number (DB unique index is final guard)
  const estimateNumber = buildEstimateNumber();

  const { data: estimate, error: insertErr } = await supabase
    .from("estimates")
    .insert({
      account_owner_user_id: accountOwnerUserId,
      estimate_number: estimateNumber,
      customer_id: customerId,
      location_id: locationId,
      service_case_id: serviceCaseId,
      origin_job_id: originJobId,
      status: "draft",
      title,
      notes,
      subtotal_cents: 0,
      total_cents: 0,
      created_by_user_id: userId,
      updated_by_user_id: userId,
    })
    .select("id")
    .single();

  if (insertErr || !estimate?.id) {
    return { success: false, error: insertErr?.message ?? "Failed to create estimate." };
  }

  // Append creation event
  await supabase.from("estimate_events").insert({
    estimate_id: estimate.id,
    event_type: "estimate_created",
    meta: { status: "draft", estimate_number: estimateNumber },
    user_id: userId,
  });

  return { success: true, estimateId: estimate.id, estimateNumber };
}

// ---------------------------------------------------------------------------
// Add estimate line item
// ---------------------------------------------------------------------------

export type AddEstimateLineItemParams = {
  estimateId: string;
  // Manual fields (required if not pricebook-backed)
  itemName?: string;
  description?: string | null;
  itemType?: string;
  category?: string | null;
  unitLabel?: string | null;
  quantity: number;        // decimal, e.g. 1.5
  unitPriceCents: number;  // integer cents
  // Optional pricebook provenance
  sourcePricebookItemId?: string | null;
};

export type AddEstimateLineItemResult =
  | { success: true; lineItemId: string; subtotal_cents: number; total_cents: number }
  | { success: false; error: string };

export async function addEstimateLineItem(
  params: AddEstimateLineItemParams
): Promise<AddEstimateLineItemResult> {
  if (!isEstimatesEnabled()) {
    return { success: false, error: "Estimates are currently unavailable." };
  }

  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });

  const accountOwnerUserId = internalUser.account_owner_user_id;
  const userId = internalUser.user_id;
  const admin = createAdminClient();

  const estimateId = String(params.estimateId ?? "").trim();
  if (!estimateId) return { success: false, error: "estimate_id is required." };

  // Load and scope-check the estimate
  const { data: estimate, error: estErr } = await supabase
    .from("estimates")
    .select("id, status, account_owner_user_id")
    .eq("id", estimateId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (estErr) throw estErr;
  if (!estimate?.id) {
    return { success: false, error: "Estimate not found in this account." };
  }

  // Draft-only guard: line editing not allowed after draft
  if (estimate.status !== "draft") {
    return { success: false, error: "Line items can only be added to draft estimates." };
  }

  // Validate quantity and unit price
  const quantity = Number(params.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { success: false, error: "quantity must be a positive number." };
  }
  const unitPriceCents = Math.round(Number(params.unitPriceCents));
  if (!Number.isFinite(unitPriceCents) || unitPriceCents < 0) {
    return { success: false, error: "unit_price_cents must be a non-negative integer." };
  }

  const lineSubtotalCents = Math.floor(quantity * unitPriceCents);

  let itemNameSnapshot: string;
  let descriptionSnapshot: string | null;
  let itemTypeSnapshot: string;
  let categorySnapshot: string | null;
  let unitLabelSnapshot: string | null;
  let sourcePricebookItemId: string | null = null;

  const rawPricebookId = params.sourcePricebookItemId?.trim() || null;

  if (rawPricebookId) {
    // Pricebook-backed: preserve source provenance and use submitted values as editable defaults,
    // falling back to catalog values when fields are omitted.
    const pbItem = await loadScopedPricebookItemForEstimate({
      pricebookItemId: rawPricebookId,
      accountOwnerUserId,
      admin,
    });
    if (!pbItem) {
      return { success: false, error: "Pricebook item not found in this account or is inactive." };
    }

    sourcePricebookItemId = pbItem.id;
    itemNameSnapshot = String(params.itemName ?? "").trim() || pbItem.item_name;
    itemTypeSnapshot = String(params.itemType ?? "").trim() || pbItem.item_type;
    descriptionSnapshot = params.description?.trim() ?? pbItem.default_description;
    categorySnapshot = params.category?.trim() ?? pbItem.category;
    unitLabelSnapshot = params.unitLabel?.trim() ?? pbItem.unit_label;

    if (!itemNameSnapshot) {
      return { success: false, error: "item_name is required for pricebook line items." };
    }
    if (!itemTypeSnapshot) {
      return { success: false, error: "item_type is required for pricebook line items." };
    }
  } else {
    // Manual line item: caller must supply name/type
    itemNameSnapshot = String(params.itemName ?? "").trim();
    if (!itemNameSnapshot) {
      return { success: false, error: "item_name is required for manual line items." };
    }
    itemTypeSnapshot = String(params.itemType ?? "").trim();
    if (!itemTypeSnapshot) {
      return { success: false, error: "item_type is required for manual line items." };
    }
    descriptionSnapshot = params.description?.trim() || null;
    categorySnapshot = params.category?.trim() || null;
    unitLabelSnapshot = params.unitLabel?.trim() || null;
  }

  // Determine sort_order as next position
  const { data: existingLines, error: countErr } = await supabase
    .from("estimate_line_items")
    .select("id")
    .eq("estimate_id", estimateId);
  if (countErr) throw countErr;
  const sortOrder = (existingLines?.length ?? 0) + 1;

  const { data: lineItem, error: insertErr } = await supabase
    .from("estimate_line_items")
    .insert({
      estimate_id: estimateId,
      sort_order: sortOrder,
      source_pricebook_item_id: sourcePricebookItemId,
      item_name_snapshot: itemNameSnapshot,
      description_snapshot: descriptionSnapshot,
      item_type_snapshot: itemTypeSnapshot,
      category_snapshot: categorySnapshot,
      unit_label_snapshot: unitLabelSnapshot,
      quantity,
      unit_price_cents: unitPriceCents,
      line_subtotal_cents: lineSubtotalCents,
      created_by_user_id: userId,
      updated_by_user_id: userId,
    })
    .select("id")
    .single();

  if (insertErr || !lineItem?.id) {
    return { success: false, error: insertErr?.message ?? "Failed to insert line item." };
  }

  // Recompute estimate totals
  const totals = await recomputeEstimateTotals({
    estimateId,
    updatedByUserId: userId,
    supabase,
  });

  // Append event
  await supabase.from("estimate_events").insert({
    estimate_id: estimateId,
    event_type: "line_item_added",
    meta: {
      line_item_id: lineItem.id,
      item_name: itemNameSnapshot,
      source: sourcePricebookItemId ? "pricebook" : "manual",
      line_subtotal_cents: lineSubtotalCents,
    },
    user_id: userId,
  });

  return {
    success: true,
    lineItemId: lineItem.id,
    ...totals,
  };
}

// ---------------------------------------------------------------------------
// Remove estimate line item
// ---------------------------------------------------------------------------

export type RemoveEstimateLineItemResult =
  | { success: true; subtotal_cents: number; total_cents: number }
  | { success: false; error: string };

export async function removeEstimateLineItem(params: {
  estimateId: string;
  lineItemId: string;
}): Promise<RemoveEstimateLineItemResult> {
  if (!isEstimatesEnabled()) {
    return { success: false, error: "Estimates are currently unavailable." };
  }

  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });

  const accountOwnerUserId = internalUser.account_owner_user_id;
  const userId = internalUser.user_id;

  const estimateId = String(params.estimateId ?? "").trim();
  const lineItemId = String(params.lineItemId ?? "").trim();

  if (!estimateId || !lineItemId) {
    return { success: false, error: "estimate_id and line_item_id are required." };
  }

  // Load and scope-check the estimate
  const { data: estimate, error: estErr } = await supabase
    .from("estimates")
    .select("id, status, account_owner_user_id")
    .eq("id", estimateId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (estErr) throw estErr;
  if (!estimate?.id) {
    return { success: false, error: "Estimate not found in this account." };
  }

  // Draft-only guard
  if (estimate.status !== "draft") {
    return { success: false, error: "Line items can only be removed from draft estimates." };
  }

  // Verify line item belongs to this estimate (RLS + explicit check)
  const { data: lineItem, error: lineErr } = await supabase
    .from("estimate_line_items")
    .select("id, item_name_snapshot")
    .eq("id", lineItemId)
    .eq("estimate_id", estimateId)
    .maybeSingle();

  if (lineErr) throw lineErr;
  if (!lineItem?.id) {
    return { success: false, error: "Line item not found on this estimate." };
  }

  const { error: deleteErr } = await supabase
    .from("estimate_line_items")
    .delete()
    .eq("id", lineItemId)
    .eq("estimate_id", estimateId);

  if (deleteErr) throw deleteErr;

  // Recompute estimate totals
  const totals = await recomputeEstimateTotals({
    estimateId,
    updatedByUserId: userId,
    supabase,
  });

  // Append event
  await supabase.from("estimate_events").insert({
    estimate_id: estimateId,
    event_type: "line_item_removed",
    meta: {
      line_item_id: lineItemId,
      item_name: lineItem.item_name_snapshot,
    },
    user_id: userId,
  });

  return { success: true, ...totals };
}

// ---------------------------------------------------------------------------
// Recompute estimate option totals (option-only)
// ---------------------------------------------------------------------------

export async function recomputeEstimateOptionTotals(params: {
  estimateId: string;
  estimateOptionId: string;
  updatedByUserId: string;
  supabase: any;
}): Promise<{ subtotal_cents: number; total_cents: number }> {
  const { data: lines, error: linesErr } = await params.supabase
    .from("estimate_option_line_items")
    .select("line_subtotal_cents")
    .eq("estimate_id", params.estimateId)
    .eq("estimate_option_id", params.estimateOptionId);
  if (linesErr) throw linesErr;

  const subtotal = (lines ?? []).reduce(
    (sum: number, li: { line_subtotal_cents: number }) => sum + (li.line_subtotal_cents ?? 0),
    0
  );
  const total = subtotal;

  const { error: updateErr } = await params.supabase
    .from("estimate_options")
    .update({
      subtotal_cents: subtotal,
      total_cents: total,
      updated_by_user_id: params.updatedByUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.estimateOptionId)
    .eq("estimate_id", params.estimateId);
  if (updateErr) throw updateErr;

  return { subtotal_cents: subtotal, total_cents: total };
}

// ---------------------------------------------------------------------------
// Add / remove estimate option line item (manual, draft-only)
// ---------------------------------------------------------------------------

export type AddEstimateOptionLineItemParams = {
  estimateId: string;
  estimateOptionId: string;
  itemName?: string;
  itemType?: string;
  quantity: number;
  unitPriceCents: number;
  sourcePricebookItemId?: string | null;
  description?: string | null;
  category?: string | null;
  unitLabel?: string | null;
};

export type AddEstimateOptionLineItemResult =
  | {
      success: true;
      estimateId: string;
      estimateOptionId: string;
      lineItemId: string;
      subtotal_cents: number;
      total_cents: number;
    }
  | { success: false; error: string };

export async function addEstimateOptionLineItem(
  params: AddEstimateOptionLineItemParams
): Promise<AddEstimateOptionLineItemResult> {
  if (!isEstimatesEnabled()) {
    return { success: false, error: "Estimates are currently unavailable." };
  }

  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });

  const accountOwnerUserId = internalUser.account_owner_user_id;
  const userId = internalUser.user_id;

  const estimateId = String(params.estimateId ?? "").trim();
  const estimateOptionId = String(params.estimateOptionId ?? "").trim();
  if (!estimateId || !estimateOptionId) {
    return { success: false, error: "estimate_id and estimate_option_id are required." };
  }

  const quantity = Number(params.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { success: false, error: "quantity must be a positive number." };
  }

  const unitPriceCents = Math.round(Number(params.unitPriceCents));
  if (!Number.isFinite(unitPriceCents) || unitPriceCents < 0) {
    return { success: false, error: "unit_price_cents must be a non-negative integer." };
  }

  const lineSubtotalCents = Math.floor(quantity * unitPriceCents);

  let itemNameSnapshot: string;
  let descriptionSnapshot: string | null;
  let itemTypeSnapshot: string;
  let categorySnapshot: string | null;
  let unitLabelSnapshot: string | null;
  let sourcePricebookItemId: string | null = null;

  const rawPricebookId = params.sourcePricebookItemId?.trim() || null;

  if (rawPricebookId) {
    const admin = createAdminClient();
    const pbItem = await loadScopedPricebookItemForEstimate({
      pricebookItemId: rawPricebookId,
      accountOwnerUserId,
      admin,
    });
    if (!pbItem) {
      return { success: false, error: "Pricebook item not found in this account or is inactive." };
    }

    sourcePricebookItemId = pbItem.id;
    itemNameSnapshot = String(params.itemName ?? "").trim() || pbItem.item_name;
    itemTypeSnapshot = String(params.itemType ?? "").trim() || pbItem.item_type;
    descriptionSnapshot = params.description?.trim() ?? pbItem.default_description;
    categorySnapshot = params.category?.trim() ?? pbItem.category;
    unitLabelSnapshot = params.unitLabel?.trim() ?? pbItem.unit_label;

    if (!itemNameSnapshot) {
      return { success: false, error: "item_name is required for pricebook line items." };
    }
    if (!itemTypeSnapshot) {
      return { success: false, error: "item_type is required for pricebook line items." };
    }
  } else {
    itemNameSnapshot = String(params.itemName ?? "").trim();
    if (!itemNameSnapshot) {
      return { success: false, error: "item_name is required for manual line items." };
    }

    itemTypeSnapshot = String(params.itemType ?? "").trim();
    if (!itemTypeSnapshot) {
      return { success: false, error: "item_type is required for manual line items." };
    }

    descriptionSnapshot = String(params.description ?? "").trim() || null;
    categorySnapshot = String(params.category ?? "").trim() || null;
    unitLabelSnapshot = String(params.unitLabel ?? "").trim() || null;
  }

  const { data: estimate, error: estErr } = await supabase
    .from("estimates")
    .select("id, status, account_owner_user_id")
    .eq("id", estimateId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (estErr) throw estErr;
  if (!estimate?.id) {
    return { success: false, error: "Estimate not found in this account." };
  }

  if (estimate.status !== "draft") {
    return {
      success: false,
      error: "Option line items can only be added to draft estimates.",
    };
  }

  const { data: flatLines, error: flatErr } = await supabase
    .from("estimate_line_items")
    .select("id")
    .eq("estimate_id", estimateId)
    .limit(1);
  if (flatErr) throw flatErr;
  if ((flatLines ?? []).length > 0) {
    return {
      success: false,
      error: "Option line items are unavailable while flat estimate lines exist on this estimate.",
    };
  }

  const { data: option, error: optionErr } = await supabase
    .from("estimate_options")
    .select("id")
    .eq("id", estimateOptionId)
    .eq("estimate_id", estimateId)
    .maybeSingle();
  if (optionErr) throw optionErr;
  if (!option?.id) {
    return { success: false, error: "Option package not found on this estimate." };
  }

  const { data: existingLines, error: countErr } = await supabase
    .from("estimate_option_line_items")
    .select("id")
    .eq("estimate_option_id", estimateOptionId);
  if (countErr) throw countErr;
  const sortOrder = (existingLines?.length ?? 0) + 1;

  const { data: lineItem, error: insertErr } = await supabase
    .from("estimate_option_line_items")
    .insert({
      estimate_option_id: estimateOptionId,
      estimate_id: estimateId,
      sort_order: sortOrder,
      source_pricebook_item_id: sourcePricebookItemId,
      item_name_snapshot: itemNameSnapshot,
      description_snapshot: descriptionSnapshot,
      item_type_snapshot: itemTypeSnapshot,
      category_snapshot: categorySnapshot,
      unit_label_snapshot: unitLabelSnapshot,
      quantity,
      unit_price_cents: unitPriceCents,
      line_subtotal_cents: lineSubtotalCents,
      created_by_user_id: userId,
      updated_by_user_id: userId,
    })
    .select("id")
    .single();

  if (insertErr || !lineItem?.id) {
    return { success: false, error: insertErr?.message ?? "Failed to add option line item." };
  }

  const totals = await recomputeEstimateOptionTotals({
    estimateId,
    estimateOptionId,
    updatedByUserId: userId,
    supabase,
  });

  const eventMeta: Record<string, unknown> = {
    estimate_option_id: estimateOptionId,
    line_item_id: lineItem.id,
    item_name: itemNameSnapshot,
    line_subtotal_cents: lineSubtotalCents,
    option_total_cents: totals.total_cents,
    source: sourcePricebookItemId ? "pricebook" : "manual",
  };
  if (sourcePricebookItemId) {
    eventMeta.source_pricebook_item_id = sourcePricebookItemId;
  }

  await supabase.from("estimate_events").insert({
    estimate_id: estimateId,
    event_type: "estimate_option_line_item_added",
    meta: eventMeta,
    user_id: userId,
  });

  return {
    success: true,
    estimateId,
    estimateOptionId,
    lineItemId: lineItem.id,
    ...totals,
  };
}

export type RemoveEstimateOptionLineItemParams = {
  estimateId: string;
  estimateOptionId: string;
  lineItemId: string;
};

export type RemoveEstimateOptionLineItemResult =
  | {
      success: true;
      estimateId: string;
      estimateOptionId: string;
      lineItemId: string;
      subtotal_cents: number;
      total_cents: number;
    }
  | { success: false; error: string };

export async function removeEstimateOptionLineItem(
  params: RemoveEstimateOptionLineItemParams
): Promise<RemoveEstimateOptionLineItemResult> {
  if (!isEstimatesEnabled()) {
    return { success: false, error: "Estimates are currently unavailable." };
  }

  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });

  const accountOwnerUserId = internalUser.account_owner_user_id;
  const userId = internalUser.user_id;

  const estimateId = String(params.estimateId ?? "").trim();
  const estimateOptionId = String(params.estimateOptionId ?? "").trim();
  const lineItemId = String(params.lineItemId ?? "").trim();

  if (!estimateId || !estimateOptionId || !lineItemId) {
    return {
      success: false,
      error: "estimate_id, estimate_option_id, and line_item_id are required.",
    };
  }

  const { data: estimate, error: estErr } = await supabase
    .from("estimates")
    .select("id, status, account_owner_user_id")
    .eq("id", estimateId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (estErr) throw estErr;
  if (!estimate?.id) {
    return { success: false, error: "Estimate not found in this account." };
  }

  if (estimate.status !== "draft") {
    return {
      success: false,
      error: "Option line items can only be removed from draft estimates.",
    };
  }

  const { data: flatLines, error: flatErr } = await supabase
    .from("estimate_line_items")
    .select("id")
    .eq("estimate_id", estimateId)
    .limit(1);
  if (flatErr) throw flatErr;
  if ((flatLines ?? []).length > 0) {
    return {
      success: false,
      error: "Option line items are unavailable while flat estimate lines exist on this estimate.",
    };
  }

  const { data: option, error: optionErr } = await supabase
    .from("estimate_options")
    .select("id")
    .eq("id", estimateOptionId)
    .eq("estimate_id", estimateId)
    .maybeSingle();
  if (optionErr) throw optionErr;
  if (!option?.id) {
    return { success: false, error: "Option package not found on this estimate." };
  }

  const { data: lineItem, error: lineErr } = await supabase
    .from("estimate_option_line_items")
    .select("id, item_name_snapshot")
    .eq("id", lineItemId)
    .eq("estimate_option_id", estimateOptionId)
    .eq("estimate_id", estimateId)
    .maybeSingle();
  if (lineErr) throw lineErr;
  if (!lineItem?.id) {
    return { success: false, error: "Option line item not found on this option package." };
  }

  const { error: deleteErr } = await supabase
    .from("estimate_option_line_items")
    .delete()
    .eq("id", lineItemId)
    .eq("estimate_option_id", estimateOptionId)
    .eq("estimate_id", estimateId);
  if (deleteErr) throw deleteErr;

  const totals = await recomputeEstimateOptionTotals({
    estimateId,
    estimateOptionId,
    updatedByUserId: userId,
    supabase,
  });

  await supabase.from("estimate_events").insert({
    estimate_id: estimateId,
    event_type: "estimate_option_line_item_removed",
    meta: {
      estimate_option_id: estimateOptionId,
      line_item_id: lineItemId,
      item_name: lineItem.item_name_snapshot,
    },
    user_id: userId,
  });

  return {
    success: true,
    estimateId,
    estimateOptionId,
    lineItemId,
    ...totals,
  };
}

// ---------------------------------------------------------------------------
// Transition estimate status (V1E internal-only transitions)
// ---------------------------------------------------------------------------

const ESTIMATE_TRANSITION_EVENT_BY_STATUS = {
  sent: "estimate_sent",
  approved: "estimate_approved",
  declined: "estimate_declined",
  expired: "estimate_expired",
  cancelled: "estimate_cancelled",
} as const;

type AllowedTransitionStatus = keyof typeof ESTIMATE_TRANSITION_EVENT_BY_STATUS;

const ESTIMATE_TIMESTAMP_FIELD_BY_STATUS: Record<AllowedTransitionStatus, string> = {
  sent: "sent_at",
  approved: "approved_at",
  declined: "declined_at",
  expired: "expired_at",
  cancelled: "cancelled_at",
};

export type TransitionEstimateStatusParams = {
  estimateId: string;
  nextStatus: AllowedTransitionStatus;
};

export type TransitionEstimateStatusResult =
  | {
      success: true;
      estimateId: string;
      previousStatus: EstimateStatus;
      nextStatus: AllowedTransitionStatus;
    }
  | { success: false; error: string };

export async function transitionEstimateStatus(
  params: TransitionEstimateStatusParams
): Promise<TransitionEstimateStatusResult> {
  if (!isEstimatesEnabled()) {
    return { success: false, error: "Estimates are currently unavailable." };
  }

  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });

  const accountOwnerUserId = internalUser.account_owner_user_id;
  const userId = internalUser.user_id;

  const estimateId = String(params.estimateId ?? "").trim();
  if (!estimateId) return { success: false, error: "estimate_id is required." };

  const nextStatus = params.nextStatus;
  if (!Object.prototype.hasOwnProperty.call(ESTIMATE_TRANSITION_EVENT_BY_STATUS, nextStatus)) {
    return { success: false, error: "Unsupported target status for V1E transition." };
  }

  const { data: estimate, error: estimateErr } = await supabase
    .from("estimates")
    .select("id, status, account_owner_user_id")
    .eq("id", estimateId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (estimateErr) throw estimateErr;
  if (!estimate?.id) {
    return { success: false, error: "Estimate not found in this account." };
  }

  const previousStatus = estimate.status;
  if (!isValidEstimateStatus(previousStatus)) {
    return { success: false, error: "Estimate has invalid status state." };
  }

  if (!canTransitionEstimateStatus(previousStatus, nextStatus)) {
    return {
      success: false,
      error: `Invalid estimate status transition: ${previousStatus} -> ${nextStatus}.`,
    };
  }

  const nowIso = new Date().toISOString();
  const timestampField = ESTIMATE_TIMESTAMP_FIELD_BY_STATUS[nextStatus];

  const { error: updateErr } = await supabase
    .from("estimates")
    .update({
      status: nextStatus,
      [timestampField]: nowIso,
      updated_by_user_id: userId,
      updated_at: nowIso,
    })
    .eq("id", estimateId);

  if (updateErr) throw updateErr;

  await supabase.from("estimate_events").insert({
    estimate_id: estimateId,
    event_type: ESTIMATE_TRANSITION_EVENT_BY_STATUS[nextStatus],
    meta: {
      previous_status: previousStatus,
      next_status: nextStatus,
    },
    user_id: userId,
  });

  return {
    success: true,
    estimateId,
    previousStatus,
    nextStatus,
  };
}

// ---------------------------------------------------------------------------
// Create default estimate option packages (V1 internal-only)
// ---------------------------------------------------------------------------

export type CreateDefaultEstimateOptionsParams = {
  estimateId: string;
};

export type CreateDefaultEstimateOptionsResult =
  | {
      success: true;
      estimateId: string;
      createdOptions: number;
    }
  | { success: false; error: string };

/**
 * Create exactly three default empty option packages (Good, Better, Best)
 * on a draft estimate with no existing options and no flat line items.
 *
 * Eligibility:
 * - estimate status is draft
 * - no existing estimate_options
 * - no existing estimate_line_items (flat lines)
 * - internal active user is scoped to the account
 * - ENABLE_ESTIMATES is enabled
 *
 * Hard rule: If flat lines exist, block the action.
 * Do not copy or move flat lines into options.
 *
 * On success:
 * - Creates exactly 3 rows in estimate_options
 * - Writes estimate_options_created event
 * - Does not update parent estimate totals
 * - Returns the number of options created
 */
export async function createDefaultEstimateOptions(
  params: CreateDefaultEstimateOptionsParams
): Promise<CreateDefaultEstimateOptionsResult> {
  if (!isEstimatesEnabled()) {
    return { success: false, error: "Estimates are currently unavailable." };
  }

  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });

  const accountOwnerUserId = internalUser.account_owner_user_id;
  const userId = internalUser.user_id;

  const estimateId = String(params.estimateId ?? "").trim();
  if (!estimateId) {
    return { success: false, error: "estimate_id is required." };
  }

  // Load and scope-check the estimate
  const { data: estimate, error: estErr } = await supabase
    .from("estimates")
    .select("id, status, account_owner_user_id")
    .eq("id", estimateId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (estErr) throw estErr;
  if (!estimate?.id) {
    return { success: false, error: "Estimate not found in this account." };
  }

  // Draft-only guard
  if (estimate.status !== "draft") {
    return {
      success: false,
      error: "Option packages can only be created for draft estimates.",
    };
  }

  // Check for existing flat line items (hard rule: block if they exist)
  const { data: flatLines, error: flatErr } = await supabase
    .from("estimate_line_items")
    .select("id")
    .eq("estimate_id", estimateId)
    .limit(1);

  if (flatErr) throw flatErr;
  if (flatLines && flatLines.length > 0) {
    return {
      success: false,
      error:
        "This estimate has flat line items. Option packages cannot be created for estimates with existing lines. This functionality will be extended in a future release.",
    };
  }

  // Check for existing options (should not exist yet)
  const { data: existingOptions, error: optErr } = await supabase
    .from("estimate_options")
    .select("id")
    .eq("estimate_id", estimateId);

  // Handle schema-missing gracefully
  const isSchemaMissing =
    optErr &&
    (String(optErr.code ?? "").includes("PGRST205") ||
      String(optErr.message ?? "").toLowerCase().includes("estimate_options"));

  if (optErr && !isSchemaMissing) {
    throw optErr;
  }

  if (existingOptions && existingOptions.length > 0) {
    return {
      success: false,
      error: "This estimate already has option packages.",
    };
  }

  // If schema is missing, return graceful unavailable
  if (isSchemaMissing) {
    return {
      success: false,
      error: "Option packages are not available in this environment.",
    };
  }

  // Create exactly three default option packages
  const nowIso = new Date().toISOString();
  const defaultOptions = [
    {
      estimate_id: estimateId,
      slot_index: 1,
      default_label_key: "good",
      label: "Good",
      sort_order: 1,
      summary: null,
      notes: null,
      subtotal_cents: 0,
      total_cents: 0,
      created_by_user_id: userId,
      updated_by_user_id: userId,
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      estimate_id: estimateId,
      slot_index: 2,
      default_label_key: "better",
      label: "Better",
      sort_order: 2,
      summary: null,
      notes: null,
      subtotal_cents: 0,
      total_cents: 0,
      created_by_user_id: userId,
      updated_by_user_id: userId,
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      estimate_id: estimateId,
      slot_index: 3,
      default_label_key: "best",
      label: "Best",
      sort_order: 3,
      summary: null,
      notes: null,
      subtotal_cents: 0,
      total_cents: 0,
      created_by_user_id: userId,
      updated_by_user_id: userId,
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];

  const { error: insertErr } = await supabase
    .from("estimate_options")
    .insert(defaultOptions);

  if (insertErr) throw insertErr;

  // Write estimate_options_created event
  await supabase.from("estimate_events").insert({
    estimate_id: estimateId,
    event_type: "estimate_options_created",
    meta: {
      option_count: 3,
      labels: ["Good", "Better", "Best"],
    },
    user_id: userId,
  });

  return {
    success: true,
    estimateId,
    createdOptions: 3,
  };
}

// ---------------------------------------------------------------------------
// Update estimate option metadata (V1 internal-only)
// ---------------------------------------------------------------------------

const ESTIMATE_OPTION_LABEL_MAX_LENGTH = 100;
const ESTIMATE_OPTION_SUMMARY_MAX_LENGTH = 750;

export type UpdateEstimateOptionMetadataParams = {
  estimateId: string;
  estimateOptionId: string;
  label: string;
  summary?: string | null;
};

export type UpdateEstimateOptionMetadataResult =
  | {
      success: true;
      estimateId: string;
      estimateOptionId: string;
      label: string;
      summary: string | null;
    }
  | { success: false; error: string };

/**
 * Update draft-only option label and summary.
 *
 * This action intentionally does not edit option notes, slot/default identity,
 * sort order, line items, or option totals.
 */
export async function updateEstimateOptionMetadata(
  params: UpdateEstimateOptionMetadataParams
): Promise<UpdateEstimateOptionMetadataResult> {
  if (!isEstimatesEnabled()) {
    return { success: false, error: "Estimates are currently unavailable." };
  }

  const estimateId = String(params.estimateId ?? "").trim();
  const estimateOptionId = String(params.estimateOptionId ?? "").trim();
  const label = String(params.label ?? "").trim();
  const summary = String(params.summary ?? "").trim() || null;

  if (!estimateId || !estimateOptionId) {
    return { success: false, error: "estimate_id and estimate_option_id are required." };
  }

  if (!label) {
    return { success: false, error: "Option label is required." };
  }

  if (label.length > ESTIMATE_OPTION_LABEL_MAX_LENGTH) {
    return {
      success: false,
      error: `Option label must be ${ESTIMATE_OPTION_LABEL_MAX_LENGTH} characters or fewer.`,
    };
  }

  if (summary && summary.length > ESTIMATE_OPTION_SUMMARY_MAX_LENGTH) {
    return {
      success: false,
      error: `Option summary must be ${ESTIMATE_OPTION_SUMMARY_MAX_LENGTH} characters or fewer.`,
    };
  }

  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });

  const accountOwnerUserId = internalUser.account_owner_user_id;
  const userId = internalUser.user_id;

  const { data: estimate, error: estErr } = await supabase
    .from("estimates")
    .select("id, status, account_owner_user_id")
    .eq("id", estimateId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (estErr) throw estErr;
  if (!estimate?.id) {
    return { success: false, error: "Estimate not found in this account." };
  }

  if (estimate.status !== "draft") {
    return {
      success: false,
      error: "Option metadata can only be edited for draft estimates.",
    };
  }

  const { data: option, error: optionErr } = await supabase
    .from("estimate_options")
    .select(
      "id, estimate_id, default_label_key, slot_index, sort_order, subtotal_cents, total_cents"
    )
    .eq("id", estimateOptionId)
    .eq("estimate_id", estimateId)
    .maybeSingle();

  if (optionErr) throw optionErr;
  if (!option?.id) {
    return { success: false, error: "Option package not found on this estimate." };
  }

  const updatedAt = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from("estimate_options")
    .update({
      label,
      summary,
      updated_by_user_id: userId,
      updated_at: updatedAt,
    })
    .eq("id", estimateOptionId)
    .eq("estimate_id", estimateId);

  if (updateErr) throw updateErr;

  await supabase.from("estimate_events").insert({
    estimate_id: estimateId,
    event_type: "estimate_option_updated",
    meta: {
      estimate_option_id: estimateOptionId,
      default_label_key: option.default_label_key,
      slot_index: option.slot_index,
      label,
      has_summary: summary !== null,
    },
    user_id: userId,
  });

  return {
    success: true,
    estimateId,
    estimateOptionId,
    label,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Record estimate approval response (V1 internal-only)
// ---------------------------------------------------------------------------

export type RecordEstimateApprovalResponseParams = {
  estimateId: string;
  /**
   * Required for multi-option proposals. Must be an option_id belonging to this
   * estimate. Ignored (and must be omitted/null) for flat single-option estimates.
   */
  selectedOptionId?: string | null;
  /** Optional internal note to record alongside the approval. */
  responseNote?: string | null;
};

export type RecordEstimateApprovalResponseResult =
  | {
      success: true;
      estimateId: string;
      previousStatus: string;
      proposalMode: "single_option_flat" | "multi_option_packages";
      selectedOptionId: string | null;
      selectedOptionLabelSnapshot: string | null;
      selectedOptionTotalCents: number | null;
      responseNote: string | null;
    }
  | { success: false; error: string };

/**
 * Record an internal approval response for a sent estimate.
 *
 * Flat estimate (single_option_flat):
 *   - selectedOptionId must be null/omitted
 *   - Transitions estimate to approved, sets approved_at
 *
 * Multi-option estimate (multi_option_packages):
 *   - selectedOptionId is required and must belong to this estimate
 *   - Snapshots option label and total_cents at approval time
 *   - Transitions estimate to approved, sets approved_at + option projection fields
 *
 * In both cases:
 *   - Estimate must be in 'sent' status
 *   - Writes an enriched estimate_approved event
 *   - Does NOT create a job, invoice, payment, or conversion record
 *   - Does NOT send email or generate a PDF
 */
export async function recordEstimateApprovalResponse(
  params: RecordEstimateApprovalResponseParams
): Promise<RecordEstimateApprovalResponseResult> {
  if (!isEstimatesEnabled()) {
    return { success: false, error: "Estimates are currently unavailable." };
  }

  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });

  const accountOwnerUserId = internalUser.account_owner_user_id;
  const userId = internalUser.user_id;

  const estimateId = String(params.estimateId ?? "").trim();
  if (!estimateId) return { success: false, error: "estimate_id is required." };

  // Load and scope-check the estimate
  const { data: estimate, error: estErr } = await supabase
    .from("estimates")
    .select("id, status, account_owner_user_id")
    .eq("id", estimateId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (estErr) throw estErr;
  if (!estimate?.id) {
    return { success: false, error: "Estimate not found in this account." };
  }

  // Approval is only valid from 'sent' status
  if (estimate.status !== "sent") {
    return {
      success: false,
      error: `Approval response requires estimate status 'sent'; current status is '${estimate.status}'.`,
    };
  }

  // Determine proposal mode by counting option packages
  const { data: optionRows, error: optionCountErr } = await supabase
    .from("estimate_options")
    .select("id")
    .eq("estimate_id", estimateId)
    .limit(1);
  if (optionCountErr) throw optionCountErr;

  const isMultiOption = (optionRows ?? []).length > 0;
  const proposalMode: "single_option_flat" | "multi_option_packages" = isMultiOption
    ? "multi_option_packages"
    : "single_option_flat";

  const rawSelectedOptionId = params.selectedOptionId?.trim() || null;
  const responseNote = params.responseNote?.trim() || null;

  let selectedOptionId: string | null = null;
  let selectedOptionLabelSnapshot: string | null = null;
  let selectedOptionTotalCents: number | null = null;

  if (isMultiOption) {
    // Multi-option: require exactly one selected option
    if (!rawSelectedOptionId) {
      return {
        success: false,
        error: "selected_option_id is required for multi-option proposals.",
      };
    }

    // Load option to snapshot label and total
    const { data: option, error: optionErr } = await supabase
      .from("estimate_options")
      .select("id, label, total_cents")
      .eq("id", rawSelectedOptionId)
      .eq("estimate_id", estimateId)
      .maybeSingle();

    if (optionErr) throw optionErr;
    if (!option?.id) {
      return {
        success: false,
        error: "selected_option_id not found on this estimate.",
      };
    }

    selectedOptionId = option.id;
    selectedOptionLabelSnapshot = String(option.label ?? "").trim() || null;
    selectedOptionTotalCents = typeof option.total_cents === "number" ? option.total_cents : null;

    if (!selectedOptionLabelSnapshot) {
      return { success: false, error: "Selected option label is missing; cannot snapshot." };
    }
    if (selectedOptionTotalCents === null) {
      return { success: false, error: "Selected option total is missing; cannot snapshot." };
    }
  } else {
    // Flat estimate: selectedOptionId must not be provided
    if (rawSelectedOptionId) {
      return {
        success: false,
        error: "selected_option_id must not be provided for flat single-option estimates.",
      };
    }
  }

  const nowIso = new Date().toISOString();

  const updatePayload: Record<string, unknown> = {
    status: "approved",
    approved_at: nowIso,
    response_note: responseNote,
    updated_by_user_id: userId,
    updated_at: nowIso,
  };

  if (selectedOptionId !== null) {
    updatePayload.selected_option_id = selectedOptionId;
    updatePayload.selected_option_label_snapshot = selectedOptionLabelSnapshot;
    updatePayload.selected_option_total_cents = selectedOptionTotalCents;
  }

  let updateErr: any = null;
  try {
    const updateRes = await supabase
      .from("estimates")
      .update(updatePayload)
      .eq("id", estimateId);
    updateErr = updateRes.error;
  } catch (err: any) {
    updateErr = err;
  }
  if (updateErr) {
    // PostgREST: 42703 undefined_column, or message includes "column does not exist"
    const code = String(updateErr.code ?? "");
    const msg = String(updateErr.message ?? "").toLowerCase();
    if (code === "42703" || msg.includes("column") && msg.includes("does not exist")) {
      return { success: false, error: "approval_response_schema_unavailable" };
    }
    throw updateErr;
  }

  // Write enriched estimate_approved event
  await supabase.from("estimate_events").insert({
    estimate_id: estimateId,
    event_type: "estimate_approved",
    meta: {
      previous_status: "sent",
      next_status: "approved",
      proposal_mode: proposalMode,
      selected_option_id: selectedOptionId,
      selected_option_label_snapshot: selectedOptionLabelSnapshot,
      selected_option_total_cents: selectedOptionTotalCents,
      response_note: responseNote,
      response_source: "internal",
    },
    user_id: userId,
  });

  return {
    success: true,
    estimateId,
    previousStatus: "sent",
    proposalMode,
    selectedOptionId,
    selectedOptionLabelSnapshot,
    selectedOptionTotalCents,
    responseNote,
  };
}

// ---------------------------------------------------------------------------
// Convert approved estimate to job (Section 2C Action A, internal-only)
// ---------------------------------------------------------------------------

type EstimateConvertibleLine = {
  id: string;
  source_pricebook_item_id: string | null;
  item_name_snapshot: string;
  description_snapshot: string | null;
  item_type_snapshot: string;
  category_snapshot: string | null;
  unit_label_snapshot: string | null;
  unit_price_cents: number;
};

function isEstimateConversionSchemaUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as { code?: string | null; message?: string | null };
  const code = String(maybeError.code ?? "").trim();
  const message = String(maybeError.message ?? "").toLowerCase();

  if (code === "42703" || code === "42P01" || code === "PGRST205") {
    return true;
  }

  return (
    message.includes("converted_job_id") ||
    message.includes("converted_by_user_id") ||
    message.includes("origin_estimate_id") ||
    message.includes("schema cache") ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

function mapEstimateLineToVisitScopeItem(line: EstimateConvertibleLine): VisitScopeItem {
  return {
    title: String(line.item_name_snapshot ?? "").trim() || "Estimate item",
    details: String(line.description_snapshot ?? "").trim() || null,
    kind: "primary",
    source_pricebook_item_id: line.source_pricebook_item_id,
    expected_unit_price:
      Number.isFinite(Number(line.unit_price_cents)) && Number(line.unit_price_cents) >= 0
        ? Number((Number(line.unit_price_cents) / 100).toFixed(2))
        : null,
    unit_label: String(line.unit_label_snapshot ?? "").trim() || null,
    item_type: String(line.item_type_snapshot ?? "").trim() || null,
    category: String(line.category_snapshot ?? "").trim() || null,
  };
}

export type ConvertApprovedEstimateToJobResult =
  | {
      success: true;
      estimateId: string;
      jobId: string;
      previousStatus: "approved";
      nextStatus: "converted";
    }
  | {
      success: false;
      error: string;
      existingJobId?: string;
    };

export async function convertApprovedEstimateToJob(params: {
  estimateId: string;
}): Promise<ConvertApprovedEstimateToJobResult> {
  if (!isEstimatesEnabled()) {
    return { success: false, error: "Estimates are currently unavailable." };
  }

  const estimateId = String(params.estimateId ?? "").trim();
  if (!estimateId) {
    return { success: false, error: "estimate_id is required." };
  }

  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });

  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();
  const userId = String(internalUser.user_id ?? "").trim();

  const conversionSchemaReady = await getEstimateToJobConversionSchemaReady({ supabase });
  if (!conversionSchemaReady) {
    return { success: false, error: "estimate_conversion_schema_unavailable" };
  }

  let estimate: any = null;
  try {
    const { data, error } = await supabase
      .from("estimates")
      .select(
        "id, account_owner_user_id, estimate_number, status, title, customer_id, location_id, service_case_id, total_cents, selected_option_id, selected_option_label_snapshot, selected_option_total_cents, converted_job_id"
      )
      .eq("id", estimateId)
      .eq("account_owner_user_id", accountOwnerUserId)
      .maybeSingle();
    if (error) throw error;
    estimate = data;
  } catch (error) {
    if (isEstimateConversionSchemaUnavailableError(error)) {
      return { success: false, error: "estimate_conversion_schema_unavailable" };
    }
    throw error;
  }

  if (!estimate?.id) {
    return { success: false, error: "Estimate not found in this account." };
  }

  if (!isEstimateToJobConversionSchemaReady(estimate)) {
    return { success: false, error: "estimate_conversion_schema_unavailable" };
  }

  const alreadyConvertedJobId = getEstimateConvertedJobId(estimate);
  if (alreadyConvertedJobId) {
    return {
      success: false,
      error: "Estimate already converted.",
      existingJobId: alreadyConvertedJobId,
    };
  }

  const status = String(estimate.status ?? "").trim();
  if (status === "converted") {
    return { success: false, error: "Estimate is already converted." };
  }
  if (status !== "approved") {
    return {
      success: false,
      error: "Only approved estimates can be converted to a job.",
    };
  }

  const { data: optionPresenceRows, error: optionPresenceErr } = await supabase
    .from("estimate_options")
    .select("id")
    .eq("estimate_id", estimateId)
    .limit(1);
  if (optionPresenceErr) throw optionPresenceErr;

  const proposalMode: "single_option_flat" | "multi_option_packages" =
    (optionPresenceRows ?? []).length > 0 ? "multi_option_packages" : "single_option_flat";

  const selectedOptionId = String(estimate.selected_option_id ?? "").trim() || null;

  let lines: EstimateConvertibleLine[] = [];
  if (proposalMode === "multi_option_packages") {
    if (!selectedOptionId) {
      return {
        success: false,
        error: "selected_option_id is required before converting multi-option estimates.",
      };
    }

    const { data: selectedOption, error: selectedOptionErr } = await supabase
      .from("estimate_options")
      .select("id")
      .eq("id", selectedOptionId)
      .eq("estimate_id", estimateId)
      .maybeSingle();
    if (selectedOptionErr) throw selectedOptionErr;
    if (!selectedOption?.id) {
      return { success: false, error: "Selected option is not available on this estimate." };
    }

    const { data: optionLines, error: optionLinesErr } = await supabase
      .from("estimate_option_line_items")
      .select(
        "id, source_pricebook_item_id, item_name_snapshot, description_snapshot, item_type_snapshot, category_snapshot, unit_label_snapshot, unit_price_cents"
      )
      .eq("estimate_id", estimateId)
      .eq("estimate_option_id", selectedOptionId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (optionLinesErr) throw optionLinesErr;

    lines = (optionLines ?? []) as EstimateConvertibleLine[];
  } else {
    const { data: flatLines, error: flatLinesErr } = await supabase
      .from("estimate_line_items")
      .select(
        "id, source_pricebook_item_id, item_name_snapshot, description_snapshot, item_type_snapshot, category_snapshot, unit_label_snapshot, unit_price_cents"
      )
      .eq("estimate_id", estimateId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (flatLinesErr) throw flatLinesErr;

    lines = (flatLines ?? []) as EstimateConvertibleLine[];
  }

  if (lines.length === 0) {
    return { success: false, error: "Estimate has no convertible line items." };
  }

  const visitScopeItems = sanitizeVisitScopeItems(lines.map(mapEstimateLineToVisitScopeItem));

  let customerSnapshot: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  } | null = null;
  if (estimate.customer_id) {
    const { data: customerRow, error: customerErr } = await supabase
      .from("customers")
      .select("first_name, last_name, email, phone")
      .eq("id", estimate.customer_id)
      .eq("owner_user_id", accountOwnerUserId)
      .maybeSingle();
    if (customerErr) throw customerErr;
    customerSnapshot = customerRow;
  }

  let locationSnapshot: { address_line1: string | null; city: string | null } | null = null;
  if (estimate.location_id) {
    const { data: locationRow, error: locationErr } = await supabase
      .from("locations")
      .select("address_line1, city")
      .eq("id", estimate.location_id)
      .eq("owner_user_id", accountOwnerUserId)
      .maybeSingle();
    if (locationErr) throw locationErr;
    locationSnapshot = locationRow;
  }

  const createdAtIso = new Date().toISOString();
  const conversionJobTitle = String(estimate.title ?? "").trim() || "Estimate conversion";
  const approvedTotalCents =
    proposalMode === "multi_option_packages"
      ? Number(estimate.selected_option_total_cents ?? 0)
      : Number(estimate.total_cents ?? 0);

  let jobId = "";
  try {
    const { data: insertedJob, error: createJobErr } = await supabase
      .from("jobs")
      .insert({
        title: conversionJobTitle,
        status: "open",
        job_type: "service",
        project_type: "alteration",
        ops_status: "need_to_schedule",
        customer_id: estimate.customer_id,
        location_id: estimate.location_id,
        service_case_id: estimate.service_case_id,
        origin_estimate_id: estimate.id,
        customer_first_name: String(customerSnapshot?.first_name ?? "").trim() || null,
        customer_last_name: String(customerSnapshot?.last_name ?? "").trim() || null,
        customer_email: String(customerSnapshot?.email ?? "").trim() || null,
        customer_phone: String(customerSnapshot?.phone ?? "").trim() || null,
        job_address: String(locationSnapshot?.address_line1 ?? "").trim() || null,
        city: String(locationSnapshot?.city ?? "").trim() || null,
        visit_scope_summary: null,
        visit_scope_items: visitScopeItems,
        created_at: createdAtIso,
      })
      .select("id")
      .single();

    if (createJobErr) {
      const code = String(createJobErr.code ?? "").trim();
      const msg = String(createJobErr.message ?? "").toLowerCase();
      if (isEstimateConversionSchemaUnavailableError(createJobErr)) {
        return { success: false, error: "estimate_conversion_schema_unavailable" };
      }
      if (code === "23505" || msg.includes("origin_estimate_id")) {
        const { data: existingEstimate } = await supabase
          .from("estimates")
          .select("converted_job_id")
          .eq("id", estimateId)
          .maybeSingle();
        const existingJobId = getEstimateConvertedJobId(existingEstimate);
        return {
          success: false,
          error: "Estimate already converted.",
          existingJobId: existingJobId ?? undefined,
        };
      }
      throw createJobErr;
    }

    jobId = String(insertedJob?.id ?? "").trim();
    if (!jobId) {
      return { success: false, error: "Failed to create job from estimate." };
    }
  } catch (error) {
    if (isEstimateConversionSchemaUnavailableError(error)) {
      return { success: false, error: "estimate_conversion_schema_unavailable" };
    }
    throw error;
  }

  const nowIso = new Date().toISOString();
  try {
    const { error: updateEstimateErr } = await supabase
      .from("estimates")
      .update({
        status: "converted",
        converted_at: nowIso,
        converted_job_id: jobId,
        converted_by_user_id: userId,
        updated_by_user_id: userId,
        updated_at: nowIso,
      })
      .eq("id", estimateId)
      .eq("account_owner_user_id", accountOwnerUserId);

    if (updateEstimateErr) {
      const code = String(updateEstimateErr.code ?? "").trim();
      const msg = String(updateEstimateErr.message ?? "").toLowerCase();
      if (isEstimateConversionSchemaUnavailableError(updateEstimateErr)) {
        return { success: false, error: "estimate_conversion_schema_unavailable" };
      }
      if (code === "23505" || msg.includes("converted_job_id")) {
        const { data: existingEstimate } = await supabase
          .from("estimates")
          .select("converted_job_id")
          .eq("id", estimateId)
          .maybeSingle();
        const existingJobId = getEstimateConvertedJobId(existingEstimate);
        return {
          success: false,
          error: "Estimate already converted.",
          existingJobId: existingJobId ?? undefined,
        };
      }
      throw updateEstimateErr;
    }
  } catch (error) {
    if (isEstimateConversionSchemaUnavailableError(error)) {
      return { success: false, error: "estimate_conversion_schema_unavailable" };
    }
    throw error;
  }

  await supabase.from("estimate_events").insert({
    estimate_id: estimateId,
    event_type: "estimate_converted_to_job",
    meta: {
      job_id: jobId,
      converted_by_user_id: userId,
      approved_total_cents: Number.isFinite(approvedTotalCents) ? approvedTotalCents : 0,
      proposal_mode: proposalMode,
      selected_option_id: proposalMode === "multi_option_packages" ? selectedOptionId : null,
      selected_option_label_snapshot:
        proposalMode === "multi_option_packages"
          ? String(estimate.selected_option_label_snapshot ?? "").trim() || null
          : null,
    },
    user_id: userId,
  });

  return {
    success: true,
    estimateId,
    jobId,
    previousStatus: "approved",
    nextStatus: "converted",
  };
}
