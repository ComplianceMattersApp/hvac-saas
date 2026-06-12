export type JobInvoicePaymentStatus = "unpaid" | "partial" | "paid";

export type JobInvoiceActionInput = {
  hasInvoice: boolean;
  invoiceStatus?: string | null;
  invoiceTotalCents?: number | null;
  paymentStatus?: JobInvoicePaymentStatus | null;
  balanceDueCents?: number | null;
  billingDispositionLabel?: string | null;
  billedTruthSatisfied?: boolean | null;
  hasVisitScopeDefined?: boolean | null;
};

function normalizeInvoiceStatus(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "draft" || normalized === "issued" || normalized === "void") {
    return normalized;
  }
  return normalized || null;
}

function normalizePaymentStatus(value?: string | null): JobInvoicePaymentStatus | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "paid" || normalized === "partial" || normalized === "unpaid") {
    return normalized;
  }
  return null;
}

export function resolveJobInvoiceActionLabel(input: JobInvoiceActionInput) {
  const billingDispositionLabel = String(input.billingDispositionLabel ?? "").trim();
  if (!input.hasInvoice) {
    return billingDispositionLabel || (input.billedTruthSatisfied ? "View Billing Details" : "Create Invoice");
  }

  if (billingDispositionLabel) return billingDispositionLabel;

  const invoiceStatus = normalizeInvoiceStatus(input.invoiceStatus);
  const invoiceTotalCents = Number(input.invoiceTotalCents ?? 0) || 0;
  const paymentStatus = normalizePaymentStatus(input.paymentStatus);
  const balanceDueCents = Number(input.balanceDueCents ?? invoiceTotalCents) || 0;

  if (invoiceStatus === "draft") {
    return invoiceTotalCents === 0 ? "Resolve $0 Invoice" : "Issue Invoice";
  }

  if (invoiceStatus === "issued") {
    if (paymentStatus === "paid" || balanceDueCents <= 0) return "View Paid Invoice";
    if (paymentStatus === "partial") return "Collect Balance";
    return "Collect Payment";
  }

  if (invoiceStatus === "void") return "View Voided Invoice";

  return "View Invoice";
}

export function resolveJobInvoiceStateLabel(input: JobInvoiceActionInput) {
  const billingDispositionLabel = String(input.billingDispositionLabel ?? "").trim();
  if (!input.hasInvoice) {
    return billingDispositionLabel || (input.hasVisitScopeDefined ? "Ready to build invoice" : "Add work items first");
  }

  if (billingDispositionLabel) return billingDispositionLabel;

  const invoiceStatus = normalizeInvoiceStatus(input.invoiceStatus);
  const paymentStatus = normalizePaymentStatus(input.paymentStatus);
  const balanceDueCents = Number(input.balanceDueCents ?? input.invoiceTotalCents ?? 0) || 0;

  if (invoiceStatus === "draft") return "Draft Invoice";
  if (invoiceStatus === "issued") {
    if (paymentStatus === "paid" || balanceDueCents <= 0) return "Paid Invoice";
    if (paymentStatus === "partial") return "Partially Paid Invoice";
    return "Issued Invoice";
  }
  if (invoiceStatus === "void") return "Voided Invoice";
  return "Invoice";
}
