"use server";

// app/estimates/[id]/actions.ts
// Compliance Matters: Thin route-level server action wrappers.
// Delegates to V1B domain actions and revalidates the estimate detail route.

import { revalidatePath } from "next/cache";
import {
  addEstimateLineItem,
  removeEstimateLineItem,
  transitionEstimateStatus,
  type AddEstimateLineItemParams,
} from "@/lib/estimates/estimate-actions";
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
