import type { BillingMode } from "@/lib/business/internal-business-profile";

function toCleanString(value: unknown) {
  return String(value ?? "").trim();
}

function toPositiveCents(value: unknown) {
  const normalized = Number(value ?? 0);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}

function isIssuedInvoice(status?: string | null) {
  return toCleanString(status).toLowerCase() === "issued";
}

function isInternalInvoicingMode(billingMode?: BillingMode | string | null) {
  return toCleanString(billingMode) === "internal_invoicing";
}

export type InvoicePaymentLinkUiState = {
  showPanel: boolean;
  showCreateButton: boolean;
  showSetupRequired: boolean;
  setupHref: string;
};

export function resolveInvoicePaymentLinkUiState(params: {
  billingMode?: BillingMode | string | null;
  invoiceStatus?: string | null;
  balanceDueCents?: number | null;
  connectReady: boolean;
}): InvoicePaymentLinkUiState {
  const showPanel =
    isInternalInvoicingMode(params.billingMode) &&
    isIssuedInvoice(params.invoiceStatus) &&
    toPositiveCents(params.balanceDueCents) > 0;

  return {
    showPanel,
    showCreateButton: showPanel && params.connectReady,
    showSetupRequired: showPanel && !params.connectReady,
    setupHref: "/ops/admin/company-profile",
  };
}