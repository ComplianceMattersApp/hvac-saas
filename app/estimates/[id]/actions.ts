"use server";

// app/estimates/[id]/actions.ts
// Compliance Matters: Thin route-level server action wrappers.
// Delegates to V1B domain actions and revalidates the estimate detail route.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addEstimateLineItem,
  addEstimateOptionLineItem,
  updateEstimateLineItem,
  updateEstimateOptionLineItem,
  removeEstimateLineItem,
  removeEstimateOptionLineItem,
  transitionEstimateStatus,
  createDefaultEstimateOptions,
  updateEstimateOptionMetadata,
  recordEstimateApprovalResponse,
  convertApprovedEstimateToJob,
  recordEstimateToInvoiceDraftConversion,
  saveManualEstimateLineToPricebook,
  type AddEstimateLineItemParams,
  type AddEstimateOptionLineItemParams,
  type SaveManualEstimateLineToPricebookParams,
  type UpdateEstimateLineItemParams,
  type UpdateEstimateOptionLineItemParams,
  type UpdateEstimateOptionMetadataParams,
} from "@/lib/estimates/estimate-actions";
import { sendEstimateCommunication } from "@/lib/estimates/estimate-communication";
import { isEstimatesEnabled } from "@/lib/estimates/estimate-exposure";

type TransitionTargetStatus = "sent" | "approved" | "declined" | "expired" | "cancelled";

/**
 * Add a line item to a draft estimate and revalidate the detail route.
 */
export async function addLineItemAction(
  params: AddEstimateLineItemParams
) {
  if (!isEstimatesEnabled()) {
    return {
      success: false as const,
      error: "Estimates are currently unavailable.",
    };
  }

  const result = await addEstimateLineItem(params);
  if (result.success) {
    revalidatePath(`/estimates/${params.estimateId}`);
  }
  return result;
}

/**
 * Remove a line item from a draft estimate (form-data variant).
 * Used via HTML <form action={removeLineItemFromForm}>.
 */
export async function removeLineItemFromForm(formData: FormData) {
  if (!isEstimatesEnabled()) {
    return;
  }

  const estimateId = String(formData.get("estimate_id") ?? "").trim();
  const lineItemId = String(formData.get("line_item_id") ?? "").trim();
  if (!estimateId || !lineItemId) return;

  await removeEstimateLineItem({ estimateId, lineItemId });
  revalidatePath(`/estimates/${estimateId}`);
}

/**
 * Update a draft line item on an estimate and revalidate the detail route.
 */
export async function updateLineItemFromForm(formData: FormData) {
  if (!isEstimatesEnabled()) {
    return {
      success: false as const,
      error: "Estimates are currently unavailable.",
    };
  }

  const estimateId = String(formData.get("estimate_id") ?? "").trim();
  const lineItemId = String(formData.get("line_item_id") ?? "").trim();
  const itemName = String(formData.get("item_name") ?? "").trim();
  const itemType = String(formData.get("item_type") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const category = String(formData.get("category") ?? "").trim() || null;
  const unitLabel = String(formData.get("unit_label") ?? "").trim() || null;

  const quantity = Number(formData.get("quantity") ?? "");
  const unitPriceDollars = Number(formData.get("unit_price") ?? "");
  const unitPriceCents = Math.round(unitPriceDollars * 100);

  const result = await updateEstimateLineItem({
    estimateId,
    lineItemId,
    itemName,
    itemType,
    description,
    category,
    unitLabel,
    quantity,
    unitPriceCents,
  } satisfies UpdateEstimateLineItemParams);

  if (result.success) {
    revalidatePath(`/estimates/${estimateId}`);
  }

  return result;
}

/**
 * Transition estimate status (draft->sent/cancelled, sent->approved|declined|expired|cancelled).
 */
export async function transitionEstimateStatusFromForm(formData: FormData) {
  const estimateId = String(formData.get("estimate_id") ?? "").trim();
  const nextStatus = String(formData.get("next_status") ?? "").trim();
  if (!estimateId || !nextStatus) {
    return;
  }

  await transitionEstimateStatusAction({
    estimateId,
    nextStatus: nextStatus as TransitionTargetStatus,
  });
}

/**
 * Parameter-based transition action for status buttons in server components.
 */
export async function transitionEstimateStatusAction(params: {
  estimateId: string;
  nextStatus: TransitionTargetStatus;
}): Promise<void> {
  if (!isEstimatesEnabled()) return;

  const estimateId = String(params.estimateId ?? "").trim();
  if (!estimateId) return;

  const result = await transitionEstimateStatus({
    estimateId,
    nextStatus: params.nextStatus,
  });

  if (result.success) {
    revalidatePath(`/estimates/${estimateId}`);
  }
}

/**
 * Attempt to send (or record a blocked send attempt for) an estimate.
 * Reads estimate_id and recipient_email from FormData.
 * Always records the attempt in estimate_communications.
 */
export async function sendEstimateFromForm(formData: FormData) {
  if (!isEstimatesEnabled()) return;

  const estimateId = String(formData.get("estimate_id") ?? "").trim();
  const recipientEmail = String(formData.get("recipient_email") ?? "").trim();
  if (!estimateId || !recipientEmail) return;

  await sendEstimateCommunication({ estimateId, recipientEmail });
  revalidatePath(`/estimates/${estimateId}`);
}

/**
 * Create default estimate option packages (Good, Better, Best).
 * Route-level wrapper that revalidates the estimate detail page.
 */
export async function createDefaultEstimateOptionsFromForm(formData: FormData) {
  if (!isEstimatesEnabled()) return;

  const estimateId = String(formData.get("estimate_id") ?? "").trim();
  if (!estimateId) return;

  const result = await createDefaultEstimateOptions({ estimateId });
  if (result.success) {
    revalidatePath(`/estimates/${estimateId}`);
  }
}

/**
 * Update draft-only option label and summary from the internal option card.
 */
export async function updateEstimateOptionMetadataAction(
  params: UpdateEstimateOptionMetadataParams
) {
  if (!isEstimatesEnabled()) {
    return {
      success: false as const,
      error: "Estimates are currently unavailable.",
    };
  }

  const result = await updateEstimateOptionMetadata(params);
  if (result.success) {
    revalidatePath(`/estimates/${result.estimateId}`);
  }
  return result;
}

/**
 * Add a manual line item to a specific draft option package.
 */
export async function addEstimateOptionLineItemFromForm(formData: FormData) {
  if (!isEstimatesEnabled()) {
    return {
      success: false as const,
      error: "Estimates are currently unavailable.",
    };
  }

  const estimateId = String(formData.get("estimate_id") ?? "").trim();
  const estimateOptionId = String(formData.get("estimate_option_id") ?? "").trim();
  const sourcePricebookItemId =
    String(formData.get("source_pricebook_item_id") ?? "").trim() || null;
  const itemName = String(formData.get("item_name") ?? "").trim();
  const itemType = String(formData.get("item_type") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const category = String(formData.get("category") ?? "").trim() || null;
  const unitLabel = String(formData.get("unit_label") ?? "").trim() || null;

  const quantity = Number(formData.get("quantity") ?? "");
  const unitPriceDollars = Number(formData.get("unit_price") ?? "");
  const unitPriceCents = Math.round(unitPriceDollars * 100);

  const result = await addEstimateOptionLineItem({
    estimateId,
    estimateOptionId,
    sourcePricebookItemId,
    itemName,
    itemType,
    quantity,
    unitPriceCents,
    description,
    category,
    unitLabel,
  } satisfies AddEstimateOptionLineItemParams);

  if (result.success) {
    revalidatePath(`/estimates/${estimateId}`);
  }

  return result;
}

/**
 * Remove a manual line item from a specific draft option package.
 */
export async function removeEstimateOptionLineItemFromForm(formData: FormData) {
  if (!isEstimatesEnabled()) {
    return {
      success: false as const,
      error: "Estimates are currently unavailable.",
    };
  }

  const estimateId = String(formData.get("estimate_id") ?? "").trim();
  const estimateOptionId = String(formData.get("estimate_option_id") ?? "").trim();
  const lineItemId = String(formData.get("line_item_id") ?? "").trim();

  const result = await removeEstimateOptionLineItem({
    estimateId,
    estimateOptionId,
    lineItemId,
  });

  if (result.success) {
    revalidatePath(`/estimates/${estimateId}`);
  }

  return result;
}

/**
 * Update a manual line item on a specific draft option package.
 */
export async function updateEstimateOptionLineItemFromForm(formData: FormData) {
  if (!isEstimatesEnabled()) {
    return {
      success: false as const,
      error: "Estimates are currently unavailable.",
    };
  }

  const estimateId = String(formData.get("estimate_id") ?? "").trim();
  const estimateOptionId = String(formData.get("estimate_option_id") ?? "").trim();
  const lineItemId = String(formData.get("line_item_id") ?? "").trim();
  const itemName = String(formData.get("item_name") ?? "").trim();
  const itemType = String(formData.get("item_type") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const category = String(formData.get("category") ?? "").trim() || null;
  const unitLabel = String(formData.get("unit_label") ?? "").trim() || null;

  const quantity = Number(formData.get("quantity") ?? "");
  const unitPriceDollars = Number(formData.get("unit_price") ?? "");
  const unitPriceCents = Math.round(unitPriceDollars * 100);

  const result = await updateEstimateOptionLineItem({
    estimateId,
    estimateOptionId,
    lineItemId,
    itemName,
    itemType,
    description,
    category,
    unitLabel,
    quantity,
    unitPriceCents,
  } satisfies UpdateEstimateOptionLineItemParams);

  if (result.success) {
    revalidatePath(`/estimates/${estimateId}`);
  }

  return result;
}

/**
 * Save an existing draft manual estimate line to Pricebook for future reuse.
 * Does not mutate the line item's source_pricebook_item_id provenance.
 */
export async function saveManualEstimateLineToPricebookFromForm(formData: FormData) {
  if (!isEstimatesEnabled()) {
    return {
      success: false as const,
      error: "Estimates are currently unavailable.",
    };
  }

  const estimateId = String(formData.get("estimate_id") ?? "").trim();
  const lineScopeRaw = String(formData.get("line_scope") ?? "").trim().toLowerCase();
  const lineItemId = String(formData.get("line_item_id") ?? "").trim();
  const estimateOptionId = String(formData.get("estimate_option_id") ?? "").trim() || null;

  const lineScope: SaveManualEstimateLineToPricebookParams["lineScope"] =
    lineScopeRaw === "option" ? "option" : "flat";

  const result = await saveManualEstimateLineToPricebook({
    lineScope,
    estimateId,
    lineItemId,
    estimateOptionId,
  });

  if (result.success) {
    revalidatePath(`/estimates/${estimateId}`);
  }

  return result;
}

/**
 * Record an internal approval response for a sent estimate.
 * Reads estimate_id, selected_option_id (optional), and response_note (optional) from FormData.
 * For multi-option proposals, selected_option_id is required.
 * Does NOT send email, create a job, invoice, payment, or conversion record.
 */
export async function recordEstimateApprovalResponseFromForm(formData: FormData) {
  if (!isEstimatesEnabled()) return;

  const estimateId = String(formData.get("estimate_id") ?? "").trim();
  if (!estimateId) return;

  const selectedOptionId = String(formData.get("selected_option_id") ?? "").trim() || null;
  const responseNote = String(formData.get("response_note") ?? "").trim() || null;

  const result = await recordEstimateApprovalResponse({
    estimateId,
    selectedOptionId,
    responseNote,
  });

  if (result.success) {
    revalidatePath(`/estimates/${estimateId}`);
  }
}

/**
 * Convert an approved estimate to an internal job (Section 2C Action A).
 * Safe no-op when estimates are disabled or form payload is missing.
 */
export async function convertEstimateToJobFromForm(formData: FormData) {
  if (!isEstimatesEnabled()) return;

  const estimateId = String(formData.get("estimate_id") ?? "").trim();
  if (!estimateId) return;

  const result = await convertApprovedEstimateToJob({ estimateId });
  if (result.success) {
    revalidatePath(`/estimates/${estimateId}`);
    revalidatePath(`/jobs/${result.jobId}`);
    revalidatePath("/jobs");
    redirect(`/jobs/${result.jobId}`);
  }

  return result;
}

/**
 * Convert a converted estimate to an internal invoice draft (Section 2F Action B).
 * Requires Section 2C conversion to job first.
 * Draft only; no issue, send, payment, QBO, SMS, email, or provider behavior.
 * Safe no-op when estimates are disabled or form payload is missing.
 */
export async function convertEstimateToInvoiceDraftFromForm(formData: FormData) {
  if (!isEstimatesEnabled()) return;

  const estimateId = String(formData.get("estimate_id") ?? "").trim();
  if (!estimateId) return;

  const result = await recordEstimateToInvoiceDraftConversion({ estimateId });
  if (result.success) {
    revalidatePath(`/estimates/${estimateId}`);
  }

  return result;
}
