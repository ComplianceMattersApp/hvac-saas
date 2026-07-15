import { resolveInvoiceCollectedPaymentSummary } from "@/lib/business/internal-invoice-payments";

export type CustomerAssociatedInvoiceBalanceRow = {
  id: string;
  jobId: string;
  invoiceDisplayNumber: string | null;
  invoiceNumber: string;
  status: "draft" | "issued" | "void";
  totalCents: number;
  balanceDueCents: number;
  billingName: string | null;
  billToKind: "customer" | "contractor" | "other" | null;
  isCustomerReceivable: boolean;
  payerIdentityNeedsReview: boolean;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function identity(value: unknown) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

export function invoiceBelongsToCustomerReceivable(params: {
  billToKind?: unknown;
  billingName?: unknown;
  billingEmail?: unknown;
  customerName?: unknown;
  customerEmail?: unknown;
}) {
  const kind = identity(params.billToKind);
  if (kind) return kind === "customer";

  // Compatibility only for invoices created before payer identity was frozen.
  // Exact email is strongest; exact normalized name is a conservative fallback.
  const invoiceEmail = identity(params.billingEmail);
  const customerEmail = identity(params.customerEmail);
  if (invoiceEmail && customerEmail) return invoiceEmail === customerEmail;

  const invoiceName = identity(params.billingName);
  const customerName = identity(params.customerName);
  return Boolean(invoiceName && customerName && invoiceName === customerName);
}

export async function resolveCustomerAssociatedInvoiceBalances(params: {
  supabase: any;
  accountOwnerUserId: string;
  customerId: string;
  customerName: string;
  customerEmail?: string | null;
}): Promise<{
  customerOpenBalanceCents: number;
  associatedInvoices: CustomerAssociatedInvoiceBalanceRow[];
}> {
  const { data, error } = await params.supabase
    .from("internal_invoices")
    .select("id, job_id, invoice_display_number, invoice_number, status, total_cents, billing_name, billing_email, bill_to_kind")
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("customer_id", params.customerId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const associatedInvoices = await Promise.all((data ?? []).map(async (invoice: any) => {
    const status = (["draft", "issued", "void"].includes(clean(invoice.status))
      ? clean(invoice.status)
      : "draft") as CustomerAssociatedInvoiceBalanceRow["status"];
    const isCustomerReceivable = invoiceBelongsToCustomerReceivable({
      billToKind: invoice.bill_to_kind,
      billingName: invoice.billing_name,
      billingEmail: invoice.billing_email,
      customerName: params.customerName,
      customerEmail: params.customerEmail,
    });
    const payerIdentityNeedsReview = !clean(invoice.bill_to_kind);
    const summary = status === "issued"
      ? await resolveInvoiceCollectedPaymentSummary(
          params.accountOwnerUserId,
          clean(invoice.id),
          params.supabase,
        )
      : null;

    return {
      id: clean(invoice.id),
      jobId: clean(invoice.job_id),
      invoiceDisplayNumber: clean(invoice.invoice_display_number) || null,
      invoiceNumber: clean(invoice.invoice_number),
      status,
      totalCents: Number(invoice.total_cents ?? 0) || 0,
      balanceDueCents: status === "issued" ? Number(summary?.balanceDueCents ?? 0) || 0 : 0,
      billingName: clean(invoice.billing_name) || null,
      billToKind: (["customer", "contractor", "other"].includes(clean(invoice.bill_to_kind))
        ? clean(invoice.bill_to_kind)
        : null) as CustomerAssociatedInvoiceBalanceRow["billToKind"],
      isCustomerReceivable,
      payerIdentityNeedsReview,
    };
  }));

  return {
    customerOpenBalanceCents: associatedInvoices.reduce(
      (sum, invoice) => sum + (invoice.isCustomerReceivable ? invoice.balanceDueCents : 0),
      0,
    ),
    associatedInvoices,
  };
}
