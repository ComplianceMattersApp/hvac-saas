import { buildInternalInvoiceDraftSource, buildVisitScopeInvoiceLineSource } from "@/lib/business/internal-invoice-source";
import type { ContractorBillingSource, CustomerBillingSource } from "@/lib/business/job-billing-source";
import { sanitizeVisitScopeItemId, sanitizeVisitScopeItems } from "@/lib/jobs/visit-scope";

export const CONSOLIDATED_INVOICE_MAX_JOBS = 50;

export type ConsolidatedInvoiceJob = {
  id: string;
  account_owner_user_id: string;
  title?: string | null;
  status?: string | null;
  lifecycle_state?: string | null;
  deleted_at?: string | null;
  field_complete?: boolean | null;
  billing_disposition?: string | null;
  customer_id?: string | null;
  contractor_id?: string | null;
  location_id?: string | null;
  service_case_id?: string | null;
  billing_recipient?: string | null;
  billing_name?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
  scheduled_date?: string | null;
  window_start?: string | null;
  job_display_number?: number | string | null;
  visit_scope_items?: unknown;
};

export type ConsolidatedInvoiceCreationPayload = {
  invoice: Record<string, unknown>;
  memberships: Array<{ job_id: string; inclusion_order: number }>;
  lineItems: Array<Record<string, unknown>>;
  orderedJobs: ConsolidatedInvoiceJob[];
  totalCents: number;
};

export class ConsolidatedInvoiceValidationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ConsolidatedInvoiceValidationError";
  }
}

export function normalizeConsolidatedInvoiceJobIds(values: unknown[]): string[] {
  const ids = Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
  if (ids.length < 2) {
    throw new ConsolidatedInvoiceValidationError("selection_too_small", "Select at least two jobs.");
  }
  if (ids.length > CONSOLIDATED_INVOICE_MAX_JOBS) {
    throw new ConsolidatedInvoiceValidationError("selection_too_large", `Select no more than ${CONSOLIDATED_INVOICE_MAX_JOBS} jobs.`);
  }
  return ids;
}

export function sortConsolidatedInvoiceJobs(jobs: ConsolidatedInvoiceJob[]): ConsolidatedInvoiceJob[] {
  return [...jobs].sort((left, right) => {
    const leftDate = String(left.scheduled_date ?? "9999-12-31");
    const rightDate = String(right.scheduled_date ?? "9999-12-31");
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
    const leftTime = String(left.window_start ?? "99:99:99");
    const rightTime = String(right.window_start ?? "99:99:99");
    if (leftTime !== rightTime) return leftTime.localeCompare(rightTime);
    const leftNumber = Number(left.job_display_number);
    const rightNumber = Number(right.job_display_number);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }
    return left.id.localeCompare(right.id);
  });
}

export function validateConsolidatedInvoiceJobs(params: {
  jobs: ConsolidatedInvoiceJob[];
  selectedJobIds: string[];
  accountOwnerUserId: string;
}) {
  if (params.jobs.length !== params.selectedJobIds.length) {
    throw new ConsolidatedInvoiceValidationError("job_not_found", "One or more selected jobs are unavailable.");
  }

  const selectedSet = new Set(params.selectedJobIds);
  const contractors = new Set<string>();
  for (const job of params.jobs) {
    if (!selectedSet.has(job.id) || job.account_owner_user_id !== params.accountOwnerUserId) {
      throw new ConsolidatedInvoiceValidationError("account_mismatch", "Every selected job must belong to this account.");
    }
    if (job.deleted_at || String(job.lifecycle_state ?? "active").toLowerCase() !== "active") {
      throw new ConsolidatedInvoiceValidationError("job_archived", "Archived jobs cannot be consolidated.");
    }
    if (String(job.status ?? "").toLowerCase() === "cancelled") {
      throw new ConsolidatedInvoiceValidationError("job_cancelled", "Cancelled jobs cannot be consolidated.");
    }
    if (String(job.status ?? "").toLowerCase() !== "completed" || !job.field_complete) {
      throw new ConsolidatedInvoiceValidationError("job_not_ready", "Every selected job must be completed and ready for billing.");
    }
    if (job.billing_disposition) {
      throw new ConsolidatedInvoiceValidationError("external_billing", "A selected job is already resolved through external billing or no-charge.");
    }
    if (String(job.billing_recipient ?? "").toLowerCase() !== "contractor") {
      throw new ConsolidatedInvoiceValidationError("recipient_mismatch", "Every selected job must bill the contractor.");
    }
    const contractorId = String(job.contractor_id ?? "").trim();
    if (!contractorId) {
      throw new ConsolidatedInvoiceValidationError("contractor_missing", "Every selected job must have a contractor.");
    }
    contractors.add(contractorId);
  }
  if (contractors.size !== 1) {
    throw new ConsolidatedInvoiceValidationError("contractor_mismatch", "All selected jobs must use the same contractor.");
  }
  return { contractorId: [...contractors][0] };
}

function moneyToCents(value: unknown): number {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ConsolidatedInvoiceValidationError("invalid_price", "A selected job has invalid invoice pricing.");
  }
  return Math.round(amount * 100);
}

function recipientFingerprint(header: Record<string, unknown>) {
  return JSON.stringify([
    header.bill_to_kind,
    header.bill_to_contractor_id,
    header.billing_name,
    header.billing_email,
    header.billing_phone,
    header.billing_address_line1,
    header.billing_address_line2,
    header.billing_city,
    header.billing_state,
    header.billing_zip,
    header.billing_country,
    header.qbo_customer_name,
  ]);
}

export function composeConsolidatedInvoiceCreationPayload(params: {
  jobs: ConsolidatedInvoiceJob[];
  accountOwnerUserId: string;
  actorUserId: string;
  contractorBilling: ContractorBillingSource;
  customerBillingById: Map<string, CustomerBillingSource>;
  pricebookUnitPriceById: Map<string, unknown>;
  invoiceNumber: string;
  invoiceDate: string;
}): ConsolidatedInvoiceCreationPayload {
  const orderedJobs = sortConsolidatedInvoiceJobs(params.jobs);
  const sources = orderedJobs.map((job) => buildInternalInvoiceDraftSource({
    accountOwnerUserId: params.accountOwnerUserId,
    actorUserId: params.actorUserId,
    jobId: job.id,
    job,
    customerBilling: params.customerBillingById.get(String(job.customer_id ?? "")) ?? null,
    contractorBilling: params.contractorBilling,
    invoiceNumber: params.invoiceNumber,
    invoiceDate: params.invoiceDate,
  }));

  const expectedFingerprint = recipientFingerprint(sources[0].header);
  if (sources.some((source) => recipientFingerprint(source.header) !== expectedFingerprint)) {
    throw new ConsolidatedInvoiceValidationError("billing_identity_mismatch", "Selected jobs resolve to incompatible contractor billing identities.");
  }
  if (!String(sources[0].header.billing_name ?? "").trim()) {
    throw new ConsolidatedInvoiceValidationError("billing_identity_missing", "The contractor billing identity is incomplete.");
  }

  const lineItems: Array<Record<string, unknown>> = [];
  for (const job of orderedJobs) {
    let scopeItems;
    try {
      scopeItems = sanitizeVisitScopeItems(job.visit_scope_items ?? []);
    } catch {
      throw new ConsolidatedInvoiceValidationError("invalid_invoice_source", "A selected job has invalid Work Item invoice information.");
    }
    if (scopeItems.length === 0) {
      throw new ConsolidatedInvoiceValidationError("invoice_source_missing", "Every selected job must have invoice-ready Work Items.");
    }

    for (const scopeItem of scopeItems) {
      const scopeItemId = sanitizeVisitScopeItemId(scopeItem.id);
      if (!scopeItemId) {
        throw new ConsolidatedInvoiceValidationError("invalid_invoice_source", "A selected Work Item is missing stable provenance.");
      }
      const pricebookId = sanitizeVisitScopeItemId(scopeItem.source_pricebook_item_id);
      const unitPriceValue = scopeItem.expected_unit_price != null
        ? scopeItem.expected_unit_price
        : pricebookId
          ? params.pricebookUnitPriceById.get(pricebookId) ?? 0
          : 0;
      const line = buildVisitScopeInvoiceLineSource({
        invoiceId: "00000000-0000-0000-0000-000000000000",
        sourceJobId: job.id,
        sortOrder: lineItems.length + 1,
        sourceVisitScopeItemId: scopeItemId,
        title: scopeItem.title,
        details: scopeItem.details,
        itemType: scopeItem.item_type,
        category: scopeItem.category,
        unitLabel: scopeItem.unit_label,
        quantityHundredths: Math.round(Number(scopeItem.expected_quantity ?? 1) * 100),
        unitPriceCents: moneyToCents(unitPriceValue),
        actorUserId: params.actorUserId,
      });
      const { invoice_id: _invoiceId, created_by_user_id: _createdBy, updated_by_user_id: _updatedBy, ...rpcLine } = line;
      lineItems.push({ ...rpcLine, source_pricebook_item_id: pricebookId });
    }
  }

  const totalCents = lineItems.reduce((sum, line) => sum + moneyToCents(line.line_subtotal), 0);
  if (totalCents <= 0) {
    throw new ConsolidatedInvoiceValidationError("invoice_total_invalid", "The combined invoice total must be greater than zero.");
  }

  return {
    invoice: sources[0].header,
    memberships: orderedJobs.map((job, index) => ({ job_id: job.id, inclusion_order: index + 1 })),
    lineItems,
    orderedJobs,
    totalCents,
  };
}
