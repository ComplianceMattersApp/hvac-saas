type InvoiceBillingAddressFields = {
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
};

type ServiceLocationAddressFields = {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeAddressForComparison(parts: string[]) {
  return parts
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isContractorBillingRecipient(value: unknown) {
  return clean(value).toLowerCase() === "contractor";
}

export function formatInvoiceBillingAddressLines(
  invoice: InvoiceBillingAddressFields,
  _billingRecipient: unknown,
) {
  return [
    invoice.billing_address_line1,
    invoice.billing_address_line2,
    [invoice.billing_city, invoice.billing_state, invoice.billing_zip].map(clean).filter(Boolean).join(" "),
  ]
    .map(clean)
    .filter(Boolean);
}

export function formatServiceLocationAddressLines(location: ServiceLocationAddressFields | null | undefined) {
  return [
    location?.address_line1,
    location?.address_line2,
    [location?.city, location?.state, location?.zip].map(clean).filter(Boolean).join(" "),
  ]
    .map(clean)
    .filter(Boolean);
}

export function invoiceServiceLocationMatchesBillingAddress(params: {
  billingRecipient: unknown;
  billingAddressLines: string[];
  serviceLocationLines: string[];
}) {
  if (params.billingAddressLines.length === 0 || params.serviceLocationLines.length === 0) return false;

  return (
    normalizeAddressForComparison(params.billingAddressLines)
    === normalizeAddressForComparison(params.serviceLocationLines)
  );
}
