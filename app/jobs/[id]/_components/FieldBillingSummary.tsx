import type { FieldBillingCapabilities } from "@/lib/auth/field-billing-access";

type FieldBillingInvoiceSnapshot = {
  status: "draft" | "issued" | "void";
  invoiceNumber?: string | null;
  invoiceDisplayNumber?: string | null;
  totalCents: number;
  lineItemCount: number;
};

type FieldBillingPaymentSummary = {
  amountPaidCents: number;
  balanceDueCents: number;
  paymentStatus: "unpaid" | "partial" | "paid";
};

type FieldBillingSummaryProps = {
  capabilities: FieldBillingCapabilities;
  invoice: FieldBillingInvoiceSnapshot | null;
  latestVoidedInvoice?: FieldBillingInvoiceSnapshot | null;
  paymentSummary?: FieldBillingPaymentSummary | null;
};

function formatCurrencyFromCents(cents?: number | null) {
  const value = Number(cents ?? 0) / 100;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function formatInvoiceReference(invoice: FieldBillingInvoiceSnapshot | null | undefined) {
  return String(invoice?.invoiceDisplayNumber ?? invoice?.invoiceNumber ?? "").trim() || "Not available";
}

function resolveSummaryState(props: FieldBillingSummaryProps) {
  const invoice = props.invoice;
  const latestVoidedInvoice = props.latestVoidedInvoice ?? null;
  const paymentSummary = props.paymentSummary ?? null;

  if (!invoice && latestVoidedInvoice) {
    return {
      eyebrow: "Voided Invoice",
      headline: "Invoice voided.",
      body: "A previous invoice is voided. Billing review is needed before payment can be collected.",
      invoiceForMetrics: latestVoidedInvoice,
      paymentSummary: null,
    };
  }

  if (!invoice) {
    return {
      eyebrow: "Not Started",
      headline: "No invoice has been created yet.",
      body: "Office billing review may be needed before payment can be collected.",
      invoiceForMetrics: null,
      paymentSummary: null,
    };
  }

  if (invoice.status === "draft") {
    return {
      eyebrow: "Draft",
      headline: "Draft invoice exists.",
      body: "Charges are not ready for collection until reviewed and issued.",
      invoiceForMetrics: invoice,
      paymentSummary: null,
    };
  }

  if (invoice.status === "void") {
    return {
      eyebrow: "Voided Invoice",
      headline: "Invoice voided.",
      body: "This invoice is kept for history only. Billing review is needed before payment can be collected.",
      invoiceForMetrics: invoice,
      paymentSummary: null,
    };
  }

  const paid = paymentSummary?.paymentStatus === "paid" || Number(paymentSummary?.balanceDueCents ?? invoice.totalCents) <= 0;
  return {
    eyebrow: paid ? "Paid" : "Issued",
    headline: paid ? "Invoice paid." : "Issued invoice.",
    body: paid
      ? "Payment history is read-only from this field view."
      : "Payment collection is not enabled from field view yet.",
    invoiceForMetrics: invoice,
    paymentSummary,
  };
}

export default function FieldBillingSummary(props: FieldBillingSummaryProps) {
  if (!props.capabilities.can_view_field_billing_summary) {
    return null;
  }

  const state = resolveSummaryState(props);
  const invoiceForMetrics = state.invoiceForMetrics;
  const paymentSummary = state.paymentSummary;
  const canMutateFieldBilling =
    props.capabilities.can_select_pricebook_lines
    || props.capabilities.can_convert_visit_scope_to_invoice_line
    || props.capabilities.can_add_manual_charge
    || props.capabilities.can_edit_charge_description
    || props.capabilities.can_edit_charge_quantity
    || props.capabilities.can_edit_charge_price
    || props.capabilities.can_remove_field_charge
    || props.capabilities.can_collect_card_payment
    || props.capabilities.can_report_non_card_collection;

  return (
    <section className="mt-4 rounded-xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_10px_24px_-28px_rgba(15,23,42,0.22)]" aria-labelledby="field-billing-summary-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Field Billing Summary</div>
          <h3 id="field-billing-summary-title" className="mt-1 text-base font-semibold text-slate-950">{state.headline}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">{state.body}</p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
          {state.eyebrow}
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Invoice</div>
          <div className="mt-1 text-sm font-semibold text-slate-950">{formatInvoiceReference(invoiceForMetrics)}</div>
        </div>
        <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Total</div>
          <div className="mt-1 text-sm font-semibold text-slate-950">{formatCurrencyFromCents(invoiceForMetrics?.totalCents ?? 0)}</div>
        </div>
        <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Paid</div>
          <div className="mt-1 text-sm font-semibold text-slate-950">{formatCurrencyFromCents(paymentSummary?.amountPaidCents ?? 0)}</div>
        </div>
        <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Balance</div>
          <div className="mt-1 text-sm font-semibold text-slate-950">{formatCurrencyFromCents(paymentSummary?.balanceDueCents ?? invoiceForMetrics?.totalCents ?? 0)}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
          {invoiceForMetrics?.lineItemCount ?? 0} line{(invoiceForMetrics?.lineItemCount ?? 0) === 1 ? "" : "s"}
        </span>
        {!canMutateFieldBilling ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
            You can view billing status only. Charge edits and payment collection require permission.
          </span>
        ) : (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
            Billing actions remain in the invoice workspace.
          </span>
        )}
      </div>
    </section>
  );
}
