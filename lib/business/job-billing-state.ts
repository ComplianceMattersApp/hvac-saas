import type { BillingMode } from "@/lib/business/internal-business-profile";
import {
  normalizeInternalInvoiceStatus,
  type InternalInvoiceRecord,
  type InternalInvoiceStatus,
} from "@/lib/business/internal-invoice";

type InternalInvoiceSnapshot = Pick<InternalInvoiceRecord, "status" | "invoice_number" | "issued_at"> | null | undefined;

export type JobBillingStateTone = "slate" | "amber" | "emerald" | "rose";

export type JobBillingStateReadModel = {
  billingMode: BillingMode;
  usesExternalBilling: boolean;
  usesInternalInvoicing: boolean;
  hasInternalInvoice: boolean;
  internalInvoiceStatus: InternalInvoiceStatus | "missing";
  billedTruthSatisfied: boolean;
  jobInvoiceCompleteProjection: boolean;
  projectionMatchesBilledTruth: boolean;
  lightweightBillingAllowed: boolean;
  internalInvoicePanelEnabled: boolean;
  statusLabel: string;
  statusTone: JobBillingStateTone;
};

export function buildJobBillingStateReadModel(input: {
  billingMode: BillingMode;
  invoiceComplete?: boolean | null;
  internalInvoice?: InternalInvoiceSnapshot;
}): JobBillingStateReadModel {
  const billingMode = input.billingMode;
  const usesInternalInvoicing = billingMode === "internal_invoicing";
  const usesExternalBilling = !usesInternalInvoicing;
  const jobInvoiceCompleteProjection = Boolean(input.invoiceComplete);
  const hasInternalInvoice = input.internalInvoice != null;
  const internalInvoiceStatus = hasInternalInvoice
    ? normalizeInternalInvoiceStatus(input.internalInvoice?.status)
    : "missing";

  if (usesInternalInvoicing) {
    const billedTruthSatisfied = internalInvoiceStatus === "issued";

    return {
      billingMode,
      usesExternalBilling,
      usesInternalInvoicing,
      hasInternalInvoice,
      internalInvoiceStatus,
      billedTruthSatisfied,
      jobInvoiceCompleteProjection,
      projectionMatchesBilledTruth: jobInvoiceCompleteProjection === billedTruthSatisfied,
      lightweightBillingAllowed: false,
      internalInvoicePanelEnabled: true,
      statusLabel:
        internalInvoiceStatus === "issued"
          ? "Issued"
          : internalInvoiceStatus === "void"
            ? "Void"
            : internalInvoiceStatus === "draft"
              ? "Draft"
              : "Not Started",
      statusTone:
        internalInvoiceStatus === "issued"
          ? "emerald"
          : internalInvoiceStatus === "void"
            ? "rose"
            : internalInvoiceStatus === "draft"
              ? "amber"
              : "slate",
    };
  }

  return {
    billingMode,
    usesExternalBilling,
    usesInternalInvoicing,
    hasInternalInvoice,
    internalInvoiceStatus,
    billedTruthSatisfied: jobInvoiceCompleteProjection,
    jobInvoiceCompleteProjection,
    projectionMatchesBilledTruth: true,
    lightweightBillingAllowed: true,
    internalInvoicePanelEnabled: false,
    statusLabel: jobInvoiceCompleteProjection ? "Invoice Complete" : "Billing Pending",
    statusTone: jobInvoiceCompleteProjection ? "emerald" : "amber",
  };
}