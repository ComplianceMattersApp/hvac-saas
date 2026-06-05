import type { FieldBillingCapabilities } from "@/lib/auth/field-billing-access";
import type { FieldChargeProposalRecord } from "@/lib/business/field-charge-proposals";

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
  fieldChargeProposals?: FieldChargeProposalRecord[];
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

function formatProposalSourceKind(value: FieldChargeProposalRecord["source_kind"]) {
  if (value === "pricebook") return "Pricebook";
  if (value === "visit_scope") return "Visit Scope";
  return "Manual";
}

function formatProposalStatus(value: FieldChargeProposalRecord["status"]) {
  if (value === "submitted_for_review") return "Submitted for Review";
  if (value === "approved") return "Approved";
  if (value === "rejected") return "Rejected";
  if (value === "voided") return "Voided";
  return "Draft";
}

function formatProposalQuantity(value: number) {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized) || normalized <= 0) return "Qty not set";
  return `Qty ${normalized.toLocaleString("en-US", {
    minimumFractionDigits: normalized % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSubmittedAt(value?: string | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
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
  const fieldChargeProposals = props.fieldChargeProposals ?? [];
  const proposedTotalCents = fieldChargeProposals.reduce((sum, proposal) => {
    if (proposal.status === "rejected" || proposal.status === "voided") return sum;
    return sum + Math.max(0, Number(proposal.proposed_subtotal_cents ?? 0) || 0);
  }, 0);
  const hasProposedTotal = proposedTotalCents > 0;
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

      <div className="mt-4 border-t border-slate-200/80 pt-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-slate-950">Field charge proposals</h4>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Office review required before these become invoice charges. These proposals are not collectible yet.
            </p>
          </div>
          {hasProposedTotal ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-right">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-700">
                Proposed total
              </div>
              <div className="mt-0.5 text-sm font-semibold text-amber-950">
                {formatCurrencyFromCents(proposedTotalCents)}
              </div>
              <div className="mt-0.5 text-[11px] font-medium text-amber-800">
                Separate from invoice total
              </div>
            </div>
          ) : null}
        </div>

        {fieldChargeProposals.length === 0 ? (
          <div className="mt-3 rounded-lg border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-xs font-medium text-slate-500">
            No field charge proposals.
          </div>
        ) : (
          <div className="mt-3 grid gap-2">
            {fieldChargeProposals.map((proposal) => (
              <div key={proposal.id} className="rounded-lg border border-slate-200/80 bg-slate-50/70 px-3 py-2.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{proposal.proposed_name || "Untitled proposal"}</div>
                    {proposal.proposed_description ? (
                      <div className="mt-1 text-xs leading-5 text-slate-600">{proposal.proposed_description}</div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold text-slate-600">
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                        Source: {formatProposalSourceKind(proposal.source_kind)}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                        {formatProposalQuantity(proposal.proposed_quantity)}
                      </span>
                      {proposal.submitted_at ? (
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                          Submitted {formatSubmittedAt(proposal.submitted_at)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-row items-center gap-2 sm:flex-col sm:items-end">
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                      {formatProposalStatus(proposal.status)}
                    </span>
                    <span className="text-sm font-semibold text-slate-950">
                      {proposal.proposed_subtotal_cents == null
                        ? "Amount pending"
                        : formatCurrencyFromCents(proposal.proposed_subtotal_cents)}
                    </span>
                    {proposal.proposed_unit_price_cents != null ? (
                      <span className="text-[11px] font-medium text-slate-500">
                        Unit {formatCurrencyFromCents(proposal.proposed_unit_price_cents)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
