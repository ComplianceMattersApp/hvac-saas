/**
 * The one place invoice money is computed and persisted.
 *
 * `total_cents = subtotal_cents + tax_cents` is an invariant, and it holds only
 * if exactly one routine writes those three columns. It lives here rather than
 * inside a `"use server"` action module because two action files need it
 * (`internal-invoice-actions`, `field-charge-proposal-actions`) and a
 * `"use server"` module may only export server actions.
 *
 * Tax is tolerated, not required: with the Slice-02 migration unapplied the tax
 * read fails, tax is treated as zero, and the write falls back to the exact
 * pre-tax column set — the same totals this app has always written.
 */

import {
  computeInvoiceTaxTotals,
  normalizeTaxRatePercent,
  type InvoiceTaxLineInput,
} from "./invoice-tax";
import { isMissingInvoiceTaxColumnError } from "./invoice-tax-state";

/**
 * Insert an invoice line, tolerating an undeployed `is_taxable` column.
 *
 * Every line-add path snapshots taxability, so without this a lagging migration
 * would break adding a line at all — the one thing tax must never do.
 */
export async function insertInvoiceLineItemWithTaxability(params: {
  supabase: any;
  payload: Record<string, unknown>;
}): Promise<{ error: any }> {
  const first = await params.supabase.from("internal_invoice_line_items").insert(params.payload);
  if (!first?.error || !isMissingInvoiceTaxColumnError(first.error)) return { error: first?.error ?? null };
  const withoutTax = { ...params.payload };
  delete withoutTax.is_taxable;
  const retry = await params.supabase.from("internal_invoice_line_items").insert(withoutTax);
  return { error: retry?.error ?? null };
}

export type InvoiceTotalsResult = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  /** False when the tax columns are not deployed, so callers can stay quiet about tax. */
  taxSupported: boolean;
};

/** Dollars-as-numeric to integer cents, matching how line_subtotal is stored. */
function moneyToCents(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(String(value ?? "0").trim() || "0");
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

/**
 * Read the invoice's rate and its customer's exemption, tolerating undeployed
 * columns. Returns null when tax is not available on this deployment at all.
 */
async function readTaxContext(params: {
  supabase: any;
  invoiceId: string;
}): Promise<{ ratePercent: number | null; taxExempt: boolean } | null> {
  const { data, error } = await params.supabase
    .from("internal_invoices")
    .select("id, customer_id, tax_rate_percent")
    .eq("id", params.invoiceId)
    .maybeSingle();
  if (error) {
    if (isMissingInvoiceTaxColumnError(error)) return null;
    throw error;
  }
  if (!data) return null;

  const ratePercent = normalizeTaxRatePercent(data.tax_rate_percent);
  const customerId = String(data.customer_id ?? "").trim();
  if (!customerId || ratePercent === null) return { ratePercent, taxExempt: false };

  const { data: customer, error: customerError } = await params.supabase
    .from("customers")
    .select("id, tax_exempt")
    .eq("id", customerId)
    .maybeSingle();
  if (customerError) {
    if (isMissingInvoiceTaxColumnError(customerError)) return { ratePercent, taxExempt: false };
    throw customerError;
  }
  return { ratePercent, taxExempt: Boolean(customer?.tax_exempt) };
}

/**
 * Recompute subtotal/tax/total from the invoice's line items and persist them.
 *
 * Called after every mutation that can change a line — add, edit, remove,
 * discard, import, supplemental — so the invariant cannot drift.
 */
export async function recalculateInvoiceTotals(params: {
  supabase: any;
  invoiceId: string;
  userId: string;
}): Promise<InvoiceTotalsResult> {
  const invoiceId = String(params.invoiceId ?? "").trim();

  // Ask for taxability alongside the amounts; fall back to amounts alone when
  // the column is not deployed, so this path never 42703s.
  let rows: any[] = [];
  let taxColumnAvailable = true;
  const withTax = await params.supabase
    .from("internal_invoice_line_items")
    .select("line_subtotal, is_taxable")
    .eq("invoice_id", invoiceId);
  if (withTax.error) {
    if (!isMissingInvoiceTaxColumnError(withTax.error)) throw withTax.error;
    taxColumnAvailable = false;
    const withoutTax = await params.supabase
      .from("internal_invoice_line_items")
      .select("line_subtotal")
      .eq("invoice_id", invoiceId);
    if (withoutTax.error) throw withoutTax.error;
    rows = withoutTax.data ?? [];
  } else {
    rows = withTax.data ?? [];
  }

  const lineItems: InvoiceTaxLineInput[] = rows.map((row: any) => ({
    lineSubtotalCents: moneyToCents(row?.line_subtotal),
    isTaxable: taxColumnAvailable ? Boolean(row?.is_taxable) : false,
  }));

  const taxContext = taxColumnAvailable ? await readTaxContext({ supabase: params.supabase, invoiceId }) : null;
  const taxSupported = taxColumnAvailable && taxContext !== null;
  const totals = computeInvoiceTaxTotals({
    lineItems,
    ratePercent: taxContext?.ratePercent ?? null,
    taxExempt: taxContext?.taxExempt ?? false,
  });

  const patch: Record<string, unknown> = {
    subtotal_cents: totals.subtotalCents,
    total_cents: totals.totalCents,
    updated_by_user_id: params.userId,
    updated_at: new Date().toISOString(),
  };
  if (taxSupported) patch.tax_cents = totals.taxCents;

  const { error: updateError } = await params.supabase
    .from("internal_invoices")
    .update(patch)
    .eq("id", invoiceId);
  if (updateError) {
    // A lagging migration must not break saving an invoice: retry without tax.
    if (!isMissingInvoiceTaxColumnError(updateError)) throw updateError;
    delete patch.tax_cents;
    patch.total_cents = totals.subtotalCents;
    const { error: retryError } = await params.supabase
      .from("internal_invoices")
      .update(patch)
      .eq("id", invoiceId);
    if (retryError) throw retryError;
    return {
      subtotalCents: totals.subtotalCents,
      taxCents: 0,
      totalCents: totals.subtotalCents,
      taxSupported: false,
    };
  }

  return {
    subtotalCents: totals.subtotalCents,
    taxCents: taxSupported ? totals.taxCents : 0,
    totalCents: taxSupported ? totals.totalCents : totals.subtotalCents,
    taxSupported,
  };
}
