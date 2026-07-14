import {
  resolveJobBillingSource,
  type BillingSourceFields,
  type CustomerBillingSource,
  type ContractorBillingSource,
} from './job-billing-source';

function optionalText(value: unknown): string | null {
  const s = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
  return s.length > 0 ? s : null;
}

function firstNonEmpty(...values: Array<unknown>): string | null {
  for (const value of values) {
    const normalized = optionalText(value);
    if (normalized) return normalized;
  }
  return null;
}

export type InvoiceBillingSnapshot = {
  billing_name: string | null;
  billing_email: string | null;
  billing_phone: string | null;
  billing_address_line1: string | null;
  billing_address_line2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
  billing_country: string | null;
  qbo_customer_name: string | null;
};

/**
 * Build the invoice draft's billing snapshot from the resolved bill-to source.
 * Shared by draft creation AND the "Bill To" re-pull action so the two never
 * drift. The address always comes from the recipient's OWN record (the
 * contractor's for contractor billing, the customer's for customer billing), so
 * the invoice is addressed to whoever pays. The customer and service location
 * are shown separately inside the invoice body (per line item on the print).
 */
export function buildDraftBillingSnapshot(params: {
  billingRecipient: string | null | undefined;
  customerBilling: CustomerBillingSource | null;
  contractorBilling: ContractorBillingSource | null;
  jobBilling: BillingSourceFields;
}): InvoiceBillingSnapshot {
  const { billing } = resolveJobBillingSource({
    billingRecipient: params.billingRecipient,
    customerBilling: params.customerBilling,
    contractorBilling: params.contractorBilling,
    jobBilling: params.jobBilling,
  });

  const customerFallbackName = firstNonEmpty(
    params.customerBilling?.billing_name,
    params.customerBilling?.full_name,
    [params.customerBilling?.first_name, params.customerBilling?.last_name].filter(Boolean).join(' '),
  );

  return {
    billing_name: firstNonEmpty(
      billing.billing_name,
      customerFallbackName,
      params.contractorBilling?.billing_name,
      params.contractorBilling?.name,
      params.jobBilling.billing_name,
    ),
    billing_email: firstNonEmpty(
      billing.billing_email,
      params.customerBilling?.billing_email,
      params.contractorBilling?.billing_email,
      params.jobBilling.billing_email,
    ),
    billing_phone: firstNonEmpty(
      billing.billing_phone,
      params.customerBilling?.billing_phone,
      params.contractorBilling?.billing_phone,
      params.jobBilling.billing_phone,
    ),
    // Address is the recipient's OWN address from the resolved bill-to source
    // (contractor's for contractor billing) — never the service location or a
    // job override. A contractor-billed invoice is therefore addressed to the
    // contractor; the customer + service location appear inside the invoice body.
    billing_address_line1: firstNonEmpty(billing.billing_address_line1),
    billing_address_line2: firstNonEmpty(billing.billing_address_line2),
    billing_city: firstNonEmpty(billing.billing_city),
    billing_state: firstNonEmpty(billing.billing_state),
    billing_zip: firstNonEmpty(billing.billing_zip),
    billing_country: firstNonEmpty(billing.billing_country),
    // Frozen QBO identity from the bill-to source, so the sync attaches to the
    // right existing QBO customer instead of creating a near-duplicate.
    qbo_customer_name: firstNonEmpty(billing.qbo_customer_name),
  };
}
