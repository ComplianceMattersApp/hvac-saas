"use server";

// lib/estimates/estimate-actions.ts
// Compliance Matters: Estimate V1B server actions.
// Internal-only. Account-owner scoped. No UI, no customer/contractor visibility.
// Non-goals: approval flow, conversion, email, PDF, payment, Visit Scope mutation.

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireInternalUser } from "@/lib/auth/internal-user";
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
} from "@/lib/estimates/estimate-read";
import {
  canTransitionEstimateStatus,
  isValidEstimateStatus,
  type EstimateStatus,
} from "@/lib/estimates/estimate-domain";
import { isEstimatesEnabled } from "@/lib/estimates/estimate-exposure";

export { getEstimateById, listEstimatesByAccount };

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
    // Pricebook-backed: freeze snapshot from catalog at add time
    const pbItem = await loadScopedPricebookItemForEstimate({
      pricebookItemId: rawPricebookId,
      accountOwnerUserId,
      admin,
    });
    if (!pbItem) {
      return { success: false, error: "Pricebook item not found in this account or is inactive." };
    }

    sourcePricebookItemId = pbItem.id;
    itemNameSnapshot = pbItem.item_name;
    descriptionSnapshot = pbItem.default_description;
    itemTypeSnapshot = pbItem.item_type;
    categorySnapshot = pbItem.category;
    unitLabelSnapshot = pbItem.unit_label;
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
