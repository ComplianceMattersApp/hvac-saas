export type CheckoutCompleteStatus = "success" | "cancelled";

export type CheckoutCompleteAction = {
  label: string;
  href: string;
  variant: "primary" | "secondary";
};

export type CheckoutCompleteViewModel = {
  heading: string;
  body: string;
  actions: CheckoutCompleteAction[];
  refreshHref: string | null;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function clean(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return String(value[0] ?? "").trim();
  }
  return String(value ?? "").trim();
}

function normalizeStatus(value: string): CheckoutCompleteStatus {
  return value === "cancelled" ? "cancelled" : "success";
}

export function resolveCheckoutCompleteViewModel(params: {
  status: string;
  jobId?: string | string[] | undefined;
  invoiceId?: string | string[] | undefined;
  isInternalUser: boolean;
}): CheckoutCompleteViewModel {
  const status = normalizeStatus(clean(params.status).toLowerCase());
  const jobId = clean(params.jobId);
  const invoiceId = clean(params.invoiceId);
  const hasJobContext = isUuid(jobId);
  const hasInvoiceContext = isUuid(invoiceId);
  const hasInternalContext = params.isInternalUser && (hasJobContext || hasInvoiceContext);

  const heading = status === "cancelled" ? "Payment checkout cancelled" : "Payment checkout complete";
  const body =
    status === "cancelled"
      ? "No payment was submitted. You can close this page or return to the invoice link when you are ready."
      : "Thank you. Your payment was submitted in Stripe Checkout. Invoice balance updates after Stripe confirms processing.";

  if (!hasInternalContext) {
    return {
      heading,
      body,
      actions: [{ label: "Team sign in", href: "/login", variant: "primary" }],
      refreshHref: null,
    };
  }

  const actions: CheckoutCompleteAction[] = [];
  let refreshHref: string | null = null;

  if (hasJobContext) {
    actions.push({
      label: "Return to invoice",
      href: `/jobs/${jobId}/invoice?payment_return=${status}`,
      variant: "primary",
    });
    actions.push({
      label: "Back to job",
      href: `/jobs/${jobId}?tab=ops&payment_return=${status}`,
      variant: "secondary",
    });
    refreshHref = `/jobs/${jobId}/invoice?payment_return=${status}`;
  } else if (hasInvoiceContext) {
    actions.push({
      label: "Return to invoice",
      href: `/reports/invoices?payment_return=${status}`,
      variant: "primary",
    });
    refreshHref = `/reports/invoices?payment_return=${status}`;
  }

  return { heading, body, actions, refreshHref };
}
