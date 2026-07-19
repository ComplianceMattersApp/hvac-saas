import type { InternalInvoiceRecord } from "@/lib/business/internal-invoice";
import {
  formatInvoiceBillingAddressLines,
  formatServiceLocationAddressLines,
} from "@/lib/business/internal-invoice-address-rendering";
import type { OperationalTenantIdentity } from "@/lib/email/operational-tenant-branding";
import { formatInvoiceDisplayReference } from "@/lib/utils/display-references";
import { formatPersonNamePart } from "@/lib/utils/identity-display";

export const INTERNAL_INVOICE_PDF_MIME_TYPE = "application/pdf";

export type InternalInvoiceDocumentLineItem = {
  key: string;
  name: string;
  description: string | null;
  serviceLocation: string;
  customerName: string;
  quantity: number;
  quantityLabel: string;
  unitPrice: number;
  unitPriceLabel: string;
  subtotal: number;
  subtotalLabel: string;
};

export type InternalInvoiceDocumentModel = {
  invoiceReference: string;
  invoiceNumber: string;
  invoiceDateLabel: string;
  statusLabel: string;
  jobTitle: string;
  business: {
    displayName: string;
    supportEmail: string | null;
    supportPhone: string | null;
    logoUrl: string | null;
  };
  billing: {
    name: string;
    email: string | null;
    phone: string | null;
    addressLines: string[];
  };
  serviceLocation: string;
  customerName: string;
  lineItems: InternalInvoiceDocumentLineItem[];
  subtotalCents: number;
  subtotalLabel: string;
  totalCents: number;
  totalLabel: string;
  amountPaidCents: number;
  amountPaidLabel: string;
  balanceDueCents: number;
  balanceDueLabel: string;
  paymentStatus: "unpaid" | "partial" | "paid";
  notes: string | null;
};

type InvoiceDocumentJob = {
  title?: unknown;
  customer_first_name?: unknown;
  customer_last_name?: unknown;
  billing_recipient?: unknown;
};

type InvoiceDocumentPaymentSummary = {
  amountPaidCents?: number | null;
  balanceDueCents?: number | null;
  paymentStatus?: unknown;
};

type InvoiceDocumentLocation = {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
} | null;

export function formatInvoiceDocumentCurrencyFromCents(cents?: number | null) {
  const amount = Number(cents ?? 0) / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number.isFinite(amount) ? amount : 0,
  );
}

export function formatInvoiceDocumentCurrencyFromAmount(amount?: number | null) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(amount ?? 0) || 0,
  );
}

export function formatInvoiceDocumentDate(value?: string | null) {
  const normalized = String(value ?? "").trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}-${match[3]}-${match[1]}` : normalized || "N/A";
}

export function sanitizeInternalInvoicePdfFilenamePart(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 100);
}

export function buildInternalInvoicePdfFilename(invoiceNumber: unknown) {
  const safeNumber = sanitizeInternalInvoicePdfFilenamePart(invoiceNumber);
  if (!safeNumber) throw new Error("A customer-facing invoice number is required to create a PDF filename.");
  return `Invoice-${safeNumber}.pdf`;
}

function normalizePaymentStatus(value: unknown): "unpaid" | "partial" | "paid" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "paid") return "paid";
  if (normalized === "partial") return "partial";
  return "unpaid";
}

function invoiceStatusLabel(status: unknown) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "issued") return "Issued";
  if (normalized === "void") return "Void";
  return "Draft";
}

export function buildInternalInvoiceDocumentModel(params: {
  invoice: InternalInvoiceRecord;
  job: InvoiceDocumentJob;
  location?: InvoiceDocumentLocation;
  paymentSummary: InvoiceDocumentPaymentSummary;
  tenantIdentity: OperationalTenantIdentity;
}): InternalInvoiceDocumentModel {
  const { invoice, job, tenantIdentity } = params;
  const paymentStatus = normalizePaymentStatus(params.paymentSummary.paymentStatus);
  const customerName = formatPersonNamePart(
    [job.customer_first_name, job.customer_last_name].filter(Boolean).join(" ") || "Customer",
  );
  const serviceLocation = formatServiceLocationAddressLines(params.location).join(", ");
  const invoiceReference = formatInvoiceDisplayReference({
    invoiceDisplayNumber: invoice.invoice_display_number,
    invoiceNumber: invoice.invoice_number,
    invoiceId: invoice.id,
  });
  const amountPaidCents = Math.max(0, Number(params.paymentSummary.amountPaidCents ?? 0) || 0);
  const balanceDueCents = Math.max(
    0,
    Number(params.paymentSummary.balanceDueCents ?? invoice.total_cents) || 0,
  );

  return {
    invoiceReference,
    invoiceNumber: String(invoice.invoice_number ?? "").trim(),
    invoiceDateLabel: formatInvoiceDocumentDate(invoice.invoice_date),
    statusLabel: paymentStatus === "paid"
      ? "Paid"
      : paymentStatus === "partial"
        ? "Partially Paid"
        : invoiceStatusLabel(invoice.status),
    jobTitle: String(job.title ?? "").trim() || "Service visit",
    business: {
      displayName: String(tenantIdentity.displayName ?? "").trim() || "Compliance Matters",
      supportEmail: String(tenantIdentity.supportEmail ?? "").trim() || null,
      supportPhone: String(tenantIdentity.supportPhone ?? "").trim() || null,
      logoUrl: String(tenantIdentity.logoUrl ?? "").trim() || null,
    },
    billing: {
      name: String(invoice.billing_name ?? "").trim() || customerName,
      email: String(invoice.billing_email ?? "").trim() || null,
      phone: String(invoice.billing_phone ?? "").trim() || null,
      addressLines: formatInvoiceBillingAddressLines(invoice, job.billing_recipient),
    },
    serviceLocation,
    customerName,
    lineItems: invoice.line_items.map((item) => ({
      key: item.id,
      name: item.item_name_snapshot,
      description: item.description_snapshot,
      serviceLocation,
      customerName,
      quantity: item.quantity,
      quantityLabel: Number(item.quantity ?? 0).toFixed(2),
      unitPrice: item.unit_price,
      unitPriceLabel: formatInvoiceDocumentCurrencyFromAmount(item.unit_price),
      subtotal: item.line_subtotal,
      subtotalLabel: formatInvoiceDocumentCurrencyFromAmount(item.line_subtotal),
    })),
    subtotalCents: invoice.subtotal_cents,
    subtotalLabel: formatInvoiceDocumentCurrencyFromCents(invoice.subtotal_cents),
    totalCents: invoice.total_cents,
    totalLabel: formatInvoiceDocumentCurrencyFromCents(invoice.total_cents),
    amountPaidCents,
    amountPaidLabel: formatInvoiceDocumentCurrencyFromCents(amountPaidCents),
    balanceDueCents,
    balanceDueLabel: formatInvoiceDocumentCurrencyFromCents(balanceDueCents),
    paymentStatus,
    notes: String(invoice.notes ?? "").trim() || null,
  };
}
