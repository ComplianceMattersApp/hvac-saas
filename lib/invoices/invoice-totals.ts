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
  /** One row, or a batch — the visit-scope import inserts many at once. */
  payload: Record<string, unknown> | Record<string, unknown>[];
}): Promise<{ error: any }> {
  const first = await params.supabase.from("internal_invoice_line_items").insert(params.payload);
  if (!first?.error || !isMissingInvoiceTaxColumnError(first.error)) return { error: first?.error ?? null };
  const strip = (row: Record<string, unknown>) => {
    const copy = { ...row };
    delete copy.is_taxable;
    return copy;
  };
  const withoutTax = Array.isArray(params.payload)
    ? params.payload.map(strip)
    : strip(params.payload);
  const retry = await params.supabase.from("internal_invoice_line_items").insert(withoutTax);
  return { error: retry?.error ?? null };
}

/**
 * Recompute every DRAFT invoice billed to one customer.
 *
 * Called when `customers.tax_exempt` flips. Without it the editor would say
 * "no sales tax is charged" while the stored total still carried tax — the
 * displayed truth and the billed truth would disagree, and the invoice would
 * issue at the stale number.
 *
 * Drafts only: an issued invoice is immutable except through the void path, so
 * a later exemption never rewrites what a customer was already billed.
 */
export async function recalculateDraftInvoiceTotalsForCustomer(params: {
  supabase: any;
  accountOwnerUserId: string;
  customerId: string;
  userId: string;
}): Promise<{ recalculated: number }> {
  const customerId = String(params.customerId ?? "").trim();
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  if (!customerId || !accountOwnerUserId) return { recalculated: 0 };

  const { data, error } = await params.supabase
    .from("internal_invoices")
    .select("id")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("customer_id", customerId)
    .eq("status", "draft");
  if (error || !data) return { recalculated: 0 };

  let recalculated = 0;
  for (const row of data) {
    // One bad draft must not block the rest, nor fail the customer save that
    // triggered this — the exemption itself is already stored.
    try {
      await recalculateInvoiceTotals({
        supabase: params.supabase,
        invoiceId: String(row.id),
        userId: params.userId,
      });
      recalculated += 1;
    } catch {
      /* keep going */
    }
  }
  return { recalculated };
}

export type InvoiceTotalsResult = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  /** False when the tax columns are not deployed, so callers can stay quiet about tax. */
  taxSupported: boolean;
};

const RECALCULATE_TOTALS_RPC = "recalculate_internal_invoice_totals_v1";

function isMissingInvoiceTotalsRpcError(error: unknown) {
  const details = error && typeof error === "object"
    ? error as Record<string, unknown>
    : {};
  const code = String(details.code ?? "").trim();
  const message = [
    details.message,
    details.details,
    details.hint,
  ].map((value) => String(value ?? "").toLowerCase()).join(" ");

  return (code === "PGRST202" || code === "42883")
    && message.includes(RECALCULATE_TOTALS_RPC);
}

function logInvoiceTotalsTiming(method: "rpc" | "legacy", startedAt: number) {
  if (process.env.INVOICE_TIMING_DEBUG !== "true") return;
  console.info("[internal-invoice-totals-timing]", {
    method,
    elapsed_ms: Date.now() - startedAt,
    vercel_region: process.env.VERCEL_REGION ?? null,
  });
}

function normalizeRpcTotals(row: unknown): InvoiceTotalsResult {
  const values = row && typeof row === "object"
    ? row as Record<string, unknown>
    : {};
  const subtotalCents = Number(values.subtotal_cents);
  const taxCents = Number(values.tax_cents);
  const totalCents = Number(values.total_cents);

  if (
    !Number.isSafeInteger(subtotalCents)
    || !Number.isSafeInteger(taxCents)
    || !Number.isSafeInteger(totalCents)
    || subtotalCents < 0
    || taxCents < 0
    || totalCents !== subtotalCents + taxCents
  ) {
    throw new Error("Invoice totals RPC returned an invalid total.");
  }

  return { subtotalCents, taxCents, totalCents, taxSupported: true };
}

/**
 * Dollars-as-numeric to integer cents, matching how line_subtotal is stored.
 *
 * Throws on anything malformed or negative rather than contributing $0. A
 * corrupt line silently worth nothing would persist a total that under-bills
 * the customer and balances against nothing — the pre-slice parseMoneyToCents
 * failed loudly here, and that behavior is the safe one.
 */
function moneyToCents(value: unknown): number {
  const raw = typeof value === "number" ? value : String(value ?? "").trim();
  const amount = typeof raw === "number" ? raw : Number(raw === "" ? NaN : raw);
  if (!Number.isFinite(amount)) {
    throw new Error(`Line subtotal is not a valid amount: ${JSON.stringify(value)}`);
  }
  if (amount < 0) {
    throw new Error(`Line subtotal must not be negative: ${JSON.stringify(value)}`);
  }
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

  // Fast path: the SQL function performs the line aggregation, tax-context
  // read, and invoice update atomically in one request. Keep the legacy path
  // below for safe app-before-migration deploy ordering and test doubles.
  if (typeof params.supabase?.rpc === "function") {
    const rpcStartedAt = Date.now();
    const rpcResult = await params.supabase.rpc(RECALCULATE_TOTALS_RPC, {
      p_invoice_id: invoiceId,
      p_updated_by_user_id: params.userId,
    });
    if (!rpcResult?.error) {
      const row = Array.isArray(rpcResult?.data) ? rpcResult.data[0] : rpcResult?.data;
      if (!row) throw new Error("Invoice totals RPC did not return an invoice.");
      logInvoiceTotalsTiming("rpc", rpcStartedAt);
      return normalizeRpcTotals(row);
    }
    if (!isMissingInvoiceTotalsRpcError(rpcResult.error)) throw rpcResult.error;
  }

  const legacyStartedAt = Date.now();

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

  const result = {
    subtotalCents: totals.subtotalCents,
    taxCents: taxSupported ? totals.taxCents : 0,
    totalCents: taxSupported ? totals.totalCents : totals.subtotalCents,
    taxSupported,
  };
  logInvoiceTotalsTiming("legacy", legacyStartedAt);
  return result;
}
