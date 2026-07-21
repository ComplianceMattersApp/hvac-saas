import {
  buildDraftBillingSnapshot,
  type InvoiceBillingSnapshot,
} from "@/lib/business/invoice-billing-snapshot";
import type {
  BillingSourceFields,
  ContractorBillingSource,
  CustomerBillingSource,
} from "@/lib/business/job-billing-source";
import {
  normalizeInternalInvoiceItemType,
  type InternalInvoiceItemType,
} from "@/lib/business/internal-invoice";

function optionalText(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function formatScaledInt(value: number, scale: number): string {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const base = 10 ** scale;
  const whole = Math.floor(absolute / base);
  const fraction = String(absolute % base).padStart(scale, "0");
  return `${sign}${whole}.${fraction}`;
}

export type InternalInvoiceDraftSourceJob = BillingSourceFields & {
  customer_id?: string | null;
  contractor_id?: string | null;
  location_id?: string | null;
  service_case_id?: string | null;
  billing_recipient?: string | null;
};

export type InternalInvoiceDraftSource = {
  header: {
    account_owner_user_id: string;
    job_id: string;
    customer_id: string | null;
    bill_to_kind: string;
    bill_to_contractor_id: string | null;
    location_id: string | null;
    service_case_id: string | null;
    invoice_number: string;
    status: "draft";
    invoice_date: string;
    source_type: "job";
    subtotal_cents: 0;
    total_cents: 0;
    notes: null;
    created_by_user_id: string;
    updated_by_user_id: string;
  } & InvoiceBillingSnapshot;
};

/**
 * Canonical frozen header produced for one job by the established draft flow.
 * Consolidated creation composes this same per-job derivation and validates that
 * every selected job resolves to the same commercial recipient.
 */
export function buildInternalInvoiceDraftSource(params: {
  accountOwnerUserId: string;
  actorUserId: string;
  jobId: string;
  job: InternalInvoiceDraftSourceJob;
  customerBilling: CustomerBillingSource | null;
  contractorBilling: ContractorBillingSource | null;
  invoiceNumber: string;
  invoiceDate: string;
}): InternalInvoiceDraftSource {
  const billToKind = String(params.job.billing_recipient ?? "").trim().toLowerCase() || "customer";
  const billingSnapshot = buildDraftBillingSnapshot({
    billingRecipient: params.job.billing_recipient,
    customerBilling: params.customerBilling,
    contractorBilling: params.contractorBilling,
    jobBilling: params.job,
  });

  return {
    header: {
      account_owner_user_id: params.accountOwnerUserId,
      job_id: params.jobId,
      customer_id: params.job.customer_id ?? null,
      bill_to_kind: billToKind,
      bill_to_contractor_id: billToKind === "contractor" ? params.job.contractor_id ?? null : null,
      location_id: params.job.location_id ?? null,
      service_case_id: params.job.service_case_id ?? null,
      invoice_number: params.invoiceNumber,
      status: "draft",
      invoice_date: params.invoiceDate,
      source_type: "job",
      subtotal_cents: 0,
      total_cents: 0,
      notes: null,
      ...billingSnapshot,
      created_by_user_id: params.actorUserId,
      updated_by_user_id: params.actorUserId,
    },
  };
}

export function buildVisitScopeInvoiceLineSource(params: {
  invoiceId: string;
  sourceJobId: string;
  sortOrder: number;
  sourceVisitScopeItemId: string;
  title: unknown;
  details: unknown;
  itemType: unknown;
  category: unknown;
  unitLabel: unknown;
  quantityHundredths: number;
  unitPriceCents: number;
  actorUserId: string;
}) {
  const lineSubtotalCents = Math.round(
    (params.quantityHundredths * params.unitPriceCents) / 100,
  );

  return {
    invoice_id: params.invoiceId,
    source_job_id: params.sourceJobId,
    sort_order: params.sortOrder,
    source_kind: "visit_scope" as const,
    source_visit_scope_item_id: params.sourceVisitScopeItemId,
    item_name_snapshot: String(params.title ?? "").trim(),
    description_snapshot: optionalText(params.details),
    item_type_snapshot: params.itemType
      ? normalizeInternalInvoiceItemType(params.itemType)
      : ("service" as InternalInvoiceItemType),
    category_snapshot: optionalText(params.category),
    unit_label_snapshot: optionalText(params.unitLabel),
    quantity: formatScaledInt(params.quantityHundredths, 2),
    unit_price: formatScaledInt(params.unitPriceCents, 2),
    line_subtotal: formatScaledInt(lineSubtotalCents, 2),
    created_by_user_id: params.actorUserId,
    updated_by_user_id: params.actorUserId,
  };
}
