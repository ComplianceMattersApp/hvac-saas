"use server";

// app/estimates/[id]/actions.ts
// Compliance Matters: Thin route-level server action wrappers.
// Delegates to V1B domain actions and revalidates the estimate detail route.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/internal-user";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getEstimateById } from "@/lib/estimates/estimate-read";
import {
  buildEstimateCoachAiContext,
  ESTIMATE_COACH_MODEL,
  estimateCoachReservationMicrousd,
  generateEstimateCoachAiSuggestions,
  type EstimateCoachAiResponse,
} from "@/lib/ai/estimate-coach-provider";
import { releaseAiUsage, reserveAiUsage, settleAiUsage } from "@/lib/ai/usage-budget";
import {
  ESTIMATE_LINE_REWRITE_MODEL,
  estimateLineRewriteReservationMicrousd,
  rewriteEstimateLineDescription,
  type EstimateLineRewrite,
} from "@/lib/ai/estimate-line-rewrite-provider";
import {
  addEstimateLineItem,
  addEstimateOptionLineItem,
  updateEstimateLineItem,
  updateEstimateOptionLineItem,
  removeEstimateLineItem,
  removeEstimateOptionLineItem,
  transitionEstimateStatus,
  createDefaultEstimateOptions,
  addOptionalThirdEstimateOption,
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
import {
  issueEstimateProposalLink,
  regenerateEstimateProposalLink,
  revokeEstimateProposalLink,
} from "@/lib/estimates/estimate-proposal-links";
import {
  initialEstimateProposalLinkActionState,
  type EstimateProposalLinkActionState,
} from "./proposal-link-action-state";
import { sendEstimateCommunication } from "@/lib/estimates/estimate-communication";
import { sendEstimateProposalEmail } from "@/lib/estimates/estimate-proposal-email";
import {
  isEstimateProposalLinksEnabled,
  isEstimateCoachAiEnabled,
  isEstimatesEnabled,
} from "@/lib/estimates/estimate-exposure";
import {
  initialProposalEmailActionState,
  type ProposalEmailActionState,
} from "./proposal-email-action-state";
import {
  initialFinalizeAndSendProposalActionState,
  type FinalizeAndSendProposalActionState,
} from "./finalize-send-action-state";

type TransitionTargetStatus = "sent" | "approved" | "declined" | "expired" | "cancelled";

type ProposalLinkActionIntent = "issue" | "regenerate" | "revoke";

export type EstimateCoachAiActionResult =
  | { success: true; suggestions: EstimateCoachAiResponse }
  | { success: false; error: string };

export type EstimateLineRewriteActionResult =
  | { success: true; rewrite: EstimateLineRewrite }
  | { success: false; error: string };

export async function rewriteEstimateLineDescriptionAction(input: {
  estimateId: string;
  itemName: string;
  itemType: string;
  roughDescription: string;
}): Promise<EstimateLineRewriteActionResult> {
  if (!isEstimatesEnabled() || !isEstimateCoachAiEnabled()) return { success: false, error: "AI rewrite is currently unavailable." };
  const estimateId = String(input.estimateId ?? "").trim();
  const itemName = String(input.itemName ?? "").replace(/\0/g, "").trim().slice(0, 180);
  const itemType = String(input.itemType ?? "").replace(/\0/g, "").trim().slice(0, 80);
  const roughDescription = String(input.roughDescription ?? "").replace(/\0/g, "").trim().slice(0, 2_000);
  if (!estimateId || (!itemName && roughDescription.length < 3)) return { success: false, error: "Add a name or a few rough notes first." };
  const supabase = await createClient();
  const { userId, internalUser } = await requireInternalUser({ supabase });
  const estimate = await getEstimateById({ estimateId, internalUser, supabase });
  if (!estimate) return { success: false, error: "Estimate was not found." };
  const admin = createAdminClient();
  const requestId = `estimate-line-rewrite:${crypto.randomUUID()}`;
  let reservation;
  try {
    reservation = await reserveAiUsage({
      admin,
      requestId,
      featureKey: "estimate_coach",
      accountOwnerUserId: internalUser.account_owner_user_id,
      actorUserId: userId,
      model: ESTIMATE_LINE_REWRITE_MODEL,
      estimatedCostMicrousd: estimateLineRewriteReservationMicrousd({ itemName, itemType, roughDescription }),
      metadata: { operation: "line_description_rewrite" },
    });
  } catch {
    return { success: false, error: "AI budget controls are unavailable. No rewrite was requested." };
  }
  if (!reservation.accepted) return { success: false, error: reservation.reason === "monthly_cap_reached" ? "The monthly AI budget has been reached." : "AI rewrites are paused by the Platform Owner." };
  let providerCompleted = false;
  try {
    const result = await rewriteEstimateLineDescription({ itemName, itemType, roughDescription });
    providerCompleted = true;
    await settleAiUsage({ admin, requestId, actualCostMicrousd: result.usage.actualCostMicrousd, inputTokens: result.usage.inputTokens, cachedInputTokens: result.usage.cachedInputTokens, outputTokens: result.usage.outputTokens });
    return { success: true, rewrite: result.rewrite };
  } catch {
    if (!providerCompleted) await releaseAiUsage({ admin, requestId }).catch(() => undefined);
    return { success: false, error: "The rewrite could not be generated. Your notes were not changed." };
  }
}

export async function generateEstimateCoachSuggestionsAction(params: {
  estimateId: string;
}): Promise<EstimateCoachAiActionResult> {
  if (!isEstimatesEnabled() || !isEstimateCoachAiEnabled()) {
    return { success: false, error: "AI suggestions are currently unavailable." };
  }

  const estimateId = String(params.estimateId ?? "").trim();
  if (!estimateId) return { success: false, error: "Estimate is required." };

  const supabase = await createClient();
  const { userId, internalUser } = await requireInternalUser({ supabase });
  const estimate = await getEstimateById({ estimateId, internalUser, supabase });
  if (!estimate) return { success: false, error: "Estimate was not found." };

  const context = buildEstimateCoachAiContext(estimate);
  const admin = createAdminClient();
  const requestId = `estimate-coach:${crypto.randomUUID()}`;
  let reservation: Awaited<ReturnType<typeof reserveAiUsage>>;
  try {
    reservation = await reserveAiUsage({
      admin,
      requestId,
      featureKey: "estimate_coach",
      accountOwnerUserId: internalUser.account_owner_user_id,
      actorUserId: userId,
      model: ESTIMATE_COACH_MODEL,
      estimatedCostMicrousd: estimateCoachReservationMicrousd(context),
      metadata: { proposal_mode: estimate.proposalMode },
    });
  } catch {
    return { success: false, error: "AI budget controls are unavailable. No provider request was made." };
  }

  if (!reservation.accepted) {
    return {
      success: false,
      error: reservation.reason === "monthly_cap_reached"
        ? "The monthly AI budget has been reached. Deterministic guidance remains available."
        : "AI suggestions are paused by the Platform Owner.",
    };
  }

  let providerCompleted = false;
  try {
    const result = await generateEstimateCoachAiSuggestions({
      context,
    });
    providerCompleted = true;
    await settleAiUsage({
      admin,
      requestId,
      actualCostMicrousd: result.usage.actualCostMicrousd,
      inputTokens: result.usage.inputTokens,
      cachedInputTokens: result.usage.cachedInputTokens,
      outputTokens: result.usage.outputTokens,
    });
    return { success: true, suggestions: result.suggestions };
  } catch {
    if (!providerCompleted) {
      await releaseAiUsage({ admin, requestId }).catch(() => undefined);
    }
    return { success: false, error: "AI suggestions could not be generated. No estimate changes were made." };
  }
}

function toSafeProposalLinkErrorState(message?: string | null): EstimateProposalLinkActionState {
  const normalized = String(message ?? "").toLowerCase();
  const schemaUnavailable =
    normalized.includes("setup is unavailable") || normalized.includes("schema");

  return {
    status: "error",
    message: schemaUnavailable
      ? "Proposal link setup is unavailable in this environment."
      : "Unable to update proposal link right now.",
    hasActiveLink: false,
    copyToken: null,
    expiresAt: null,
    schemaUnavailable,
  };
}

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
 * Attempt proposal-email delivery for a sent estimate.
 * Backend-only foundation wrapper; no UI contract yet.
 */
export async function sendEstimateProposalEmailFromForm(
  formData: FormData
): Promise<ProposalEmailActionState> {
  if (!isEstimatesEnabled()) {
    return {
      ...initialProposalEmailActionState,
      success: false,
      error: "Estimates are currently unavailable.",
      code: "estimates_unavailable",
    };
  }

  const estimateId = String(formData.get("estimate_id") ?? "").trim();
  const recipientEmail = String(formData.get("recipient_email") ?? "").trim();

  if (!estimateId) {
    return {
      ...initialProposalEmailActionState,
      success: false,
      error: "Estimate not found.",
      code: "estimate_not_found",
    };
  }

  if (!recipientEmail) {
    return {
      ...initialProposalEmailActionState,
      success: false,
      error: "Recipient email is required.",
      code: "recipient_required",
    };
  }

  const result = await sendEstimateProposalEmail({ estimateId, recipientEmail });
  if (result.success) {
    revalidatePath(`/estimates/${estimateId}`);
    return {
      success: true,
      error: null,
      attemptStatus: result.attemptStatus,
      deliveryMode: result.deliveryMode,
      communicationId: result.communicationId,
      proposalLinkId: result.proposalLinkId,
      proposalUrl: result.proposalUrl,
      emailPreviewUrl: result.emailPreviewUrl,
      providerMessageId: result.providerMessageId,
      emailDisabled: result.emailDisabled,
    };
  }

  return {
    success: false,
    error: result.error,
    code: result.code,
  };
}

/**
 * Unified form action for internal proposal-email controls.
 */
export async function submitEstimateProposalEmailActionFromForm(
  _previousState: ProposalEmailActionState,
  formData: FormData
): Promise<ProposalEmailActionState> {
  return sendEstimateProposalEmailFromForm(formData);
}

function validateFinalizeAndSendContent(estimate: Awaited<ReturnType<typeof getEstimateById>>) {
  if (!estimate) return "Estimate was not found.";
  if (estimate.proposalMode === "multi_option_packages") {
    const populatedOptions = (estimate.options ?? []).filter((option) => option.line_items?.length > 0);
    if (populatedOptions.length < 2) return "Add line items to at least two proposal options before finalizing.";
    return null;
  }
  if (!estimate.line_items?.length) return "Add at least one line item before finalizing.";
  return null;
}

export async function submitFinalizeAndSendProposalActionFromForm(
  _previousState: FinalizeAndSendProposalActionState,
  formData: FormData,
): Promise<FinalizeAndSendProposalActionState> {
  if (!isEstimatesEnabled()) {
    return { ...initialFinalizeAndSendProposalActionState, error: "Estimates are currently unavailable.", code: "estimates_unavailable" };
  }

  const estimateId = String(formData.get("estimate_id") ?? "").trim();
  const recipientEmail = String(formData.get("recipient_email") ?? "").trim().toLowerCase();
  if (!estimateId) return { ...initialFinalizeAndSendProposalActionState, error: "Estimate not found.", code: "estimate_not_found" };
  if (!recipientEmail) return { ...initialFinalizeAndSendProposalActionState, error: "Customer email is required.", code: "recipient_required" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return { ...initialFinalizeAndSendProposalActionState, error: "Enter a valid customer email.", code: "recipient_invalid" };
  }

  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });
  const estimate = await getEstimateById({ estimateId, internalUser, supabase });
  const contentError = validateFinalizeAndSendContent(estimate);
  if (contentError) return { ...initialFinalizeAndSendProposalActionState, error: contentError, code: "proposal_incomplete" };

  const currentStatus = String(estimate?.status ?? "").trim().toLowerCase();
  let finalized = currentStatus === "sent";
  if (currentStatus !== "draft" && currentStatus !== "sent") {
    return { ...initialFinalizeAndSendProposalActionState, error: "Only a draft proposal can be finalized and sent.", code: "invalid_status" };
  }

  if (!finalized) {
    const transition = await transitionEstimateStatus({ estimateId, nextStatus: "sent" });
    if (!transition.success) {
      return { ...initialFinalizeAndSendProposalActionState, error: transition.error, code: "finalize_failed" };
    }
    finalized = true;
  }

  try {
    const delivery = await sendEstimateProposalEmail({ estimateId, recipientEmail });
    revalidatePath(`/estimates/${estimateId}`);
    if (!delivery.success) {
      return { ...initialFinalizeAndSendProposalActionState, finalized, error: delivery.error, code: delivery.code };
    }
    return {
      success: delivery.attemptStatus === "accepted",
      finalized,
      error: delivery.attemptStatus === "accepted" ? null : "The proposal is finalized, but email delivery did not complete.",
      attemptStatus: delivery.attemptStatus,
      deliveryMode: delivery.deliveryMode,
      communicationId: delivery.communicationId,
      proposalLinkId: delivery.proposalLinkId,
      proposalUrl: delivery.proposalUrl,
      emailPreviewUrl: delivery.emailPreviewUrl,
      providerMessageId: delivery.providerMessageId,
      emailDisabled: delivery.emailDisabled,
    };
  } catch {
    revalidatePath(`/estimates/${estimateId}`);
    return { ...initialFinalizeAndSendProposalActionState, finalized, error: "The proposal is finalized, but email delivery failed.", code: "send_failed" };
  }
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

export async function addOptionalThirdEstimateOptionFromForm(formData: FormData) {
  if (!isEstimatesEnabled()) return;
  const estimateId = String(formData.get("estimate_id") ?? "").trim();
  if (!estimateId) return;
  const result = await addOptionalThirdEstimateOption({ estimateId });
  if (result.success) revalidatePath(`/estimates/${estimateId}`);
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

/**
 * Create an active customer proposal link for a sent estimate.
 * Returns a short-lived raw token only in this action response for immediate copy UX.
 */
export async function issueEstimateProposalLinkFromForm(
  formData: FormData
): Promise<EstimateProposalLinkActionState> {
  const estimateId = String(formData.get("estimate_id") ?? "").trim();
  if (!estimateId) {
    return {
      ...initialEstimateProposalLinkActionState,
      status: "error",
      message: "Estimate not found.",
    };
  }

  if (!isEstimatesEnabled() || !isEstimateProposalLinksEnabled()) {
    return {
      ...initialEstimateProposalLinkActionState,
      status: "error",
      message: "Proposal link setup is unavailable in this environment.",
      schemaUnavailable: true,
    };
  }

  const result = await issueEstimateProposalLink({ estimateId });
  if (!result.success) {
    if (result.code === "already_exists") {
      return {
        status: "error",
        message: "An active link already exists. Regenerate to copy a fresh link.",
        hasActiveLink: true,
        copyToken: null,
        expiresAt: result.expiresAt ?? null,
        schemaUnavailable: false,
      };
    }
    return toSafeProposalLinkErrorState(result.error);
  }

  revalidatePath(`/estimates/${estimateId}`);
  return {
    status: "success",
    message: "Proposal link created.",
    hasActiveLink: true,
    copyToken: result.rawToken,
    expiresAt: result.expiresAt,
    schemaUnavailable: false,
  };
}

/**
 * Revoke the current active proposal link and issue a fresh one for copy.
 */
export async function regenerateEstimateProposalLinkFromForm(
  formData: FormData
): Promise<EstimateProposalLinkActionState> {
  const estimateId = String(formData.get("estimate_id") ?? "").trim();
  if (!estimateId) {
    return {
      ...initialEstimateProposalLinkActionState,
      status: "error",
      message: "Estimate not found.",
    };
  }

  if (!isEstimatesEnabled() || !isEstimateProposalLinksEnabled()) {
    return {
      ...initialEstimateProposalLinkActionState,
      status: "error",
      message: "Proposal link setup is unavailable in this environment.",
      schemaUnavailable: true,
    };
  }

  const result = await regenerateEstimateProposalLink({ estimateId });
  if (!result.success) {
    return toSafeProposalLinkErrorState(result.error);
  }

  revalidatePath(`/estimates/${estimateId}`);
  return {
    status: "success",
    message: "Proposal link regenerated.",
    hasActiveLink: true,
    copyToken: result.rawToken,
    expiresAt: result.expiresAt,
    schemaUnavailable: false,
  };
}

/**
 * Revoke the current active proposal link for this estimate.
 */
export async function revokeEstimateProposalLinkFromForm(
  formData: FormData
): Promise<EstimateProposalLinkActionState> {
  const estimateId = String(formData.get("estimate_id") ?? "").trim();
  if (!estimateId) {
    return {
      ...initialEstimateProposalLinkActionState,
      status: "error",
      message: "Estimate not found.",
    };
  }

  if (!isEstimatesEnabled() || !isEstimateProposalLinksEnabled()) {
    return {
      ...initialEstimateProposalLinkActionState,
      status: "error",
      message: "Proposal link setup is unavailable in this environment.",
      schemaUnavailable: true,
    };
  }

  const result = await revokeEstimateProposalLink({ estimateId });
  if (!result.success) {
    return toSafeProposalLinkErrorState(result.error);
  }

  revalidatePath(`/estimates/${estimateId}`);
  return {
    status: "success",
    message: result.revoked ? "Proposal link revoked." : "No active proposal link to revoke.",
    hasActiveLink: false,
    copyToken: null,
    expiresAt: null,
    schemaUnavailable: false,
  };
}

/**
 * Unified form action for internal proposal-link controls.
 */
export async function submitEstimateProposalLinkActionFromForm(
  _previousState: EstimateProposalLinkActionState,
  formData: FormData
): Promise<EstimateProposalLinkActionState> {
  const intent = String(formData.get("intent") ?? "").trim().toLowerCase() as ProposalLinkActionIntent;

  if (intent === "issue") {
    return issueEstimateProposalLinkFromForm(formData);
  }
  if (intent === "regenerate") {
    return regenerateEstimateProposalLinkFromForm(formData);
  }
  if (intent === "revoke") {
    return revokeEstimateProposalLinkFromForm(formData);
  }

  return {
    ...initialEstimateProposalLinkActionState,
    status: "error",
    message: "Unsupported proposal link action.",
  };
}
