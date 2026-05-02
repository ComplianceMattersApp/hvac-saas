// lib/estimates/estimate-document.ts
// Compliance Matters: Estimate V1J internal document template/readiness layer.
// Internal-only helper for stable document view modeling and wording boundaries.

import type { EstimateReadResult } from "@/lib/estimates/estimate-read";

export const ESTIMATE_DOCUMENT_DISCLAIMERS = [
  "Estimate is proposed commercial scope.",
  "Estimate is not customer approval.",
  "Estimate is not invoice issuance.",
  "Estimate is not payment collection.",
  "Provider acceptance is not delivery/read confirmation.",
  "Invoice/payment remain separate downstream truths.",
] as const;

export const ESTIMATE_DOCUMENT_READINESS_GUIDANCE = [
  "Document structure ready for review.",
  "Send/email still disabled unless explicitly enabled.",
  "No PDF generated or stored.",
  "No approval/payment/conversion created.",
] as const;

export const ESTIMATE_REVISION_FREEZE_TRIGGER = "send_attempt_created" as const;
export const ESTIMATE_REVISION_HISTORY_POLICY = "immutable" as const;
export const ESTIMATE_REVISION_POST_FREEZE_EDIT_POLICY = "new_revision_required" as const;

export const ESTIMATE_REVISION_PLANNING_DEFAULTS = {
  freezeTrigger: ESTIMATE_REVISION_FREEZE_TRIGGER,
  historyPolicy: ESTIMATE_REVISION_HISTORY_POLICY,
  postFreezeEditPolicy: ESTIMATE_REVISION_POST_FREEZE_EDIT_POLICY,
} as const;

export type EstimateRevisionFreezeTrigger = typeof ESTIMATE_REVISION_FREEZE_TRIGGER;
export type EstimateRevisionHistoryPolicy = typeof ESTIMATE_REVISION_HISTORY_POLICY;
export type EstimateRevisionPostFreezeEditPolicy = typeof ESTIMATE_REVISION_POST_FREEZE_EDIT_POLICY;

export type EstimateDocumentViewModel = {
  identity: {
    estimateId: string;
    estimateNumber: string;
    title: string;
    status: string;
    statusLabel: string;
  };
  context: {
    customerName: string | null;
    locationDisplay: string | null;
  };
  lifecycle: {
    createdAt: string;
    sentAt: string | null;
    updatedAt: string;
  };
  totals: {
    subtotalCents: number;
    totalCents: number;
  };
  lines: Array<{
    id: string;
    sortOrder: number;
    itemName: string;
    description: string | null;
    itemType: string;
    quantity: number;
    unitPriceCents: number;
    lineSubtotalCents: number;
  }>;
};

export function buildEstimateDocumentViewModel(params: {
  estimate: EstimateReadResult;
  customerName?: string | null;
  locationDisplay?: string | null;
}): EstimateDocumentViewModel {
  const status = String(params.estimate.status ?? "").trim();
  return {
    identity: {
      estimateId: params.estimate.id,
      estimateNumber: params.estimate.estimate_number,
      title: params.estimate.title,
      status,
      statusLabel: status ? status.charAt(0).toUpperCase() + status.slice(1) : "-",
    },
    context: {
      customerName: params.customerName ?? null,
      locationDisplay: params.locationDisplay ?? null,
    },
    lifecycle: {
      createdAt: params.estimate.created_at,
      sentAt: params.estimate.sent_at,
      updatedAt: params.estimate.updated_at,
    },
    totals: {
      subtotalCents: params.estimate.subtotal_cents,
      totalCents: params.estimate.total_cents,
    },
    lines: params.estimate.line_items.map((line) => ({
      id: line.id,
      sortOrder: line.sort_order,
      itemName: line.item_name_snapshot,
      description: line.description_snapshot,
      itemType: line.item_type_snapshot,
      quantity: line.quantity,
      unitPriceCents: line.unit_price_cents,
      lineSubtotalCents: line.line_subtotal_cents,
    })),
  };
}