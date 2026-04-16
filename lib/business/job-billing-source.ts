export type BillingSourceFields = {
  billing_name?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
};

export type CustomerBillingSource = BillingSourceFields & {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export type ContractorBillingSource = BillingSourceFields & {
  name?: string | null;
};

export type BillingRecipientMode = 'customer' | 'contractor' | 'other';

export function resolveJobBillingSource(params: {
  billingRecipient?: string | null;
  customerBilling?: CustomerBillingSource | null;
  contractorBilling?: ContractorBillingSource | null;
  jobBilling?: BillingSourceFields | null;
}) {
  const recipient = String(params.billingRecipient ?? '').trim().toLowerCase();
  const customerFullName = [params.customerBilling?.first_name, params.customerBilling?.last_name].filter(Boolean).join(' ').trim();
  const customerBillingName = params.customerBilling?.billing_name ?? params.customerBilling?.full_name ?? customerFullName;

  if (recipient === 'contractor') {
    return {
      billingSourceLabel: 'Contractor',
      billing: {
        billing_name: params.contractorBilling?.billing_name ?? params.contractorBilling?.name ?? null,
        billing_email: params.contractorBilling?.billing_email ?? null,
        billing_phone: params.contractorBilling?.billing_phone ?? null,
        billing_address_line1: params.contractorBilling?.billing_address_line1 ?? null,
        billing_address_line2: params.contractorBilling?.billing_address_line2 ?? null,
        billing_city: params.contractorBilling?.billing_city ?? null,
        billing_state: params.contractorBilling?.billing_state ?? null,
        billing_zip: params.contractorBilling?.billing_zip ?? null,
      },
    };
  }

  if (recipient === 'customer') {
    return {
      billingSourceLabel: 'Customer',
      billing: {
        billing_name: customerBillingName || null,
        billing_email: params.customerBilling?.billing_email ?? null,
        billing_phone: params.customerBilling?.billing_phone ?? null,
        billing_address_line1: params.customerBilling?.billing_address_line1 ?? null,
        billing_address_line2: params.customerBilling?.billing_address_line2 ?? null,
        billing_city: params.customerBilling?.billing_city ?? null,
        billing_state: params.customerBilling?.billing_state ?? null,
        billing_zip: params.customerBilling?.billing_zip ?? null,
      },
    };
  }

  if (recipient === 'other') {
    return {
      billingSourceLabel: 'Other (job override)',
      billing: {
        billing_name: params.jobBilling?.billing_name ?? null,
        billing_email: params.jobBilling?.billing_email ?? null,
        billing_phone: params.jobBilling?.billing_phone ?? null,
        billing_address_line1: params.jobBilling?.billing_address_line1 ?? null,
        billing_address_line2: params.jobBilling?.billing_address_line2 ?? null,
        billing_city: params.jobBilling?.billing_city ?? null,
        billing_state: params.jobBilling?.billing_state ?? null,
        billing_zip: params.jobBilling?.billing_zip ?? null,
      },
    };
  }

  return {
    billingSourceLabel: 'Not set',
    billing: {
      billing_name: null,
      billing_email: null,
      billing_phone: null,
      billing_address_line1: null,
      billing_address_line2: null,
      billing_city: null,
      billing_state: null,
      billing_zip: null,
    },
  };
}