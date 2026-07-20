// lib/estimates/estimate-document.ts
// Compliance Matters: Estimate V1J internal document template/readiness layer.
// Internal-only helper for stable document view modeling and wording boundaries.

import type { EstimateReadResult } from "@/lib/estimates/estimate-read";

export const ESTIMATE_DOCUMENT_DISCLAIMERS = [
  "This proposal is valid until the date shown, unless updated by the company.",
  "Final work and billing are confirmed by the company.",
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

export type EstimateDocumentOptionLineViewModel = {
  id: string;
  sortOrder: number;
  itemName: string;
  description: string | null;
  itemType: string;
  quantity: number;
  unitPriceCents: number;
  lineSubtotalCents: number;
};

export type EstimateDocumentOptionViewModel = {
  id: string;
  slotIndex: number;
  label: string;
  summary: string | null;
  // notes: excluded from print view per spec
  subtotalCents: number;
  totalCents: number;
  lines: EstimateDocumentOptionLineViewModel[];
};

export type EstimateDocumentViewModel = {
  proposalMode: "single_option_flat" | "multi_option_packages";
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
  options: EstimateDocumentOptionViewModel[];
};

export type EstimateQuoteReadinessStatus = "ready" | "attention";

export type EstimateQuoteReadinessItem = {
  key:
    | "customer_location_context"
    | "title_scope_summary"
    | "line_items"
    | "total_amount"
    | "recipient_email"
    | "proposed_scope_boundary"
    | "internal_manual_boundary";
  label: string;
  status: EstimateQuoteReadinessStatus;
  detail: string;
};

export type EstimateQuoteReadinessChecklist = {
  readyCount: number;
  attentionCount: number;
  items: EstimateQuoteReadinessItem[];
};

export function buildEstimateDocumentViewModel(params: {
  estimate: EstimateReadResult;
  customerName?: string | null;
  locationDisplay?: string | null;
}): EstimateDocumentViewModel {
  const status = String(params.estimate.status ?? "").trim();
  const proposalMode = params.estimate.proposalMode;
  const options: EstimateDocumentOptionViewModel[] =
    proposalMode === "multi_option_packages" && Array.isArray(params.estimate.options)
      ? params.estimate.options.filter((opt) => opt.line_items.length > 0).map((opt) => ({
          id: opt.id,
          slotIndex: opt.slot_index,
          label: opt.label,
          summary: opt.summary,
          // notes are excluded from document view per print spec
          subtotalCents: opt.subtotal_cents,
          totalCents: opt.total_cents,
          lines: opt.line_items.map((line) => ({
            id: line.id,
            sortOrder: line.sort_order,
            itemName: line.item_name_snapshot,
            description: line.description_snapshot,
            itemType: line.item_type_snapshot,
            quantity: line.quantity,
            unitPriceCents: line.unit_price_cents,
            lineSubtotalCents: line.line_subtotal_cents,
          })),
        }))
      : [];

  return {
    proposalMode,
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
    options,
  };
}

function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function isLikelyEmail(value: string | null | undefined): boolean {
  const normalized = normalizeEmail(value);
  return Boolean(normalized) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function buildEstimateQuoteReadinessChecklist(params: {
  documentView: EstimateDocumentViewModel;
  scopeSummary: string | null;
  customerEmail: string | null;
  isEmailSendEnabled: boolean;
}): EstimateQuoteReadinessChecklist {
  const hasCustomer = Boolean(String(params.documentView.context.customerName ?? "").trim());
  const hasLocation = Boolean(String(params.documentView.context.locationDisplay ?? "").trim());
  const hasTitle = Boolean(String(params.documentView.identity.title ?? "").trim());
  const hasScopeSummary = Boolean(String(params.scopeSummary ?? "").trim());
  const hasLineItems = params.documentView.lines.length > 0;
  const hasNonZeroTotal = params.documentView.totals.totalCents > 0;
  const hasRecipientEmail = isLikelyEmail(params.customerEmail);

  const items: EstimateQuoteReadinessItem[] = [
    {
      key: "customer_location_context",
      label: "Customer and location context",
      status: hasCustomer && hasLocation ? "ready" : "attention",
      detail:
        hasCustomer && hasLocation
          ? "Customer and location context are present."
          : "Customer and location context should both be present before manual sharing.",
    },
    {
      key: "title_scope_summary",
      label: "Title and scope summary",
      status: hasTitle ? "ready" : "attention",
      detail: hasTitle
        ? hasScopeSummary
          ? "Estimate title and scope summary notes are present."
          : "Estimate title is present. Scope summary notes are optional and currently empty."
        : "Estimate title is required for clear manual sharing context.",
    },
    {
      key: "line_items",
      label: "At least one estimate line item",
      status: hasLineItems ? "ready" : "attention",
      detail: hasLineItems
        ? `Estimate includes ${params.documentView.lines.length} line item${params.documentView.lines.length === 1 ? "" : "s"}.`
        : "Add at least one Estimate Line before manual sharing.",
    },
    {
      key: "total_amount",
      label: "Total amount readiness",
      status: hasNonZeroTotal ? "ready" : "attention",
      detail: hasNonZeroTotal
        ? "Estimate total is non-zero."
        : "Estimate total is zero. If intentional, treat this as internal/manual-only and confirm before sharing.",
    },
    {
      key: "recipient_email",
      label: "Recipient email for send-attempt logging",
      status: hasRecipientEmail ? "ready" : "attention",
      detail: hasRecipientEmail
        ? `Customer email on file: ${normalizeEmail(params.customerEmail)}.`
        : "No valid customer email is on file. Manual send-attempt recording still allows operator entry.",
    },
    {
      key: "proposed_scope_boundary",
      label: "Proposed commercial scope boundary",
      status: "ready",
      detail:
        "Estimate Lines are proposed commercial scope only; they are not Work Items, Invoice Charges, or payment truth.",
    },
    {
      key: "internal_manual_boundary",
      label: "Internal-only manual-sharing boundary",
      status: "ready",
      detail: params.isEmailSendEnabled
        ? "Environment email send is enabled; this checklist remains internal/manual-readiness only."
        : "Email send is disabled by feature flag; no public links, customer portal exposure, conversion, or payment behavior is enabled.",
    },
  ];

  const readyCount = items.filter((item) => item.status === "ready").length;
  const attentionCount = items.length - readyCount;

  return {
    readyCount,
    attentionCount,
    items,
  };
}
