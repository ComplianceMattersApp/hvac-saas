/**
 * Sales tax math for the invoice domain. Pure — no I/O, no Supabase.
 *
 * One rate per invoice, applied to taxable lines only. The rate is a PERCENT
 * with four decimals (7.975% arrives as 7.975), not money: California rates
 * genuinely use the fourth decimal, so the integer-cents rule that governs
 * amounts does not apply to the rate itself.
 *
 * Rounding happens ONCE, on the summed taxable subtotal — never per line.
 * Rounding each line and adding drifts by a cent or two on long invoices, and
 * that drift is exactly what makes a customer's total disagree with the books.
 */

export type InvoiceTaxLineInput = {
  /** This line's extended amount in integer cents. */
  lineSubtotalCents: number;
  isTaxable: boolean;
};

export type InvoiceTaxInputs = {
  subtotalCents: number;
  taxableSubtotalCents: number;
  nonTaxableSubtotalCents: number;
};

export type InvoiceTaxTotals = InvoiceTaxInputs & {
  taxCents: number;
  totalCents: number;
};

function toInteger(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** A usable rate, or null. Zero and negatives mean "no tax", never a computation. */
export function normalizeTaxRatePercent(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const rate = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return rate;
}

/** Split the line items into taxable and non-taxable subtotals. */
export function deriveInvoiceTaxInputs(lineItems: InvoiceTaxLineInput[]): InvoiceTaxInputs {
  let taxableSubtotalCents = 0;
  let nonTaxableSubtotalCents = 0;
  for (const line of lineItems ?? []) {
    const cents = toInteger(line?.lineSubtotalCents);
    if (line?.isTaxable) taxableSubtotalCents += cents;
    else nonTaxableSubtotalCents += cents;
  }
  return {
    subtotalCents: taxableSubtotalCents + nonTaxableSubtotalCents,
    taxableSubtotalCents,
    nonTaxableSubtotalCents,
  };
}

/**
 * Tax on a taxable subtotal, rounded half-up to the cent.
 *
 * Half-up (not banker's rounding) because that is what every US point-of-sale
 * and QuickBooks itself do; matching them keeps our tax line and the customer's
 * expectation in agreement.
 */
export function computeTaxCents(taxableSubtotalCents: number, ratePercent: unknown): number {
  const rate = normalizeTaxRatePercent(ratePercent);
  if (rate === null) return 0;
  const taxable = toInteger(taxableSubtotalCents);
  if (taxable <= 0) return 0;
  return Math.floor((taxable * rate) / 100 + 0.5);
}

/**
 * The whole invoice money picture from its lines.
 *
 * `taxExempt` short-circuits to zero tax regardless of line taxability: a
 * builder holding a resale certificate is not charged tax on parts they will
 * resell, and that decision belongs to the customer record, not the catalog.
 */
export function computeInvoiceTaxTotals(params: {
  lineItems: InvoiceTaxLineInput[];
  ratePercent: unknown;
  taxExempt?: boolean;
}): InvoiceTaxTotals {
  const inputs = deriveInvoiceTaxInputs(params.lineItems);
  const taxCents = params.taxExempt
    ? 0
    : computeTaxCents(inputs.taxableSubtotalCents, params.ratePercent);
  return { ...inputs, taxCents, totalCents: inputs.subtotalCents + taxCents };
}

/** Display form of a stored rate: 7.975 → "7.975%". Trailing zeros trimmed. */
export function formatTaxRatePercent(value: unknown): string | null {
  const rate = normalizeTaxRatePercent(value);
  if (rate === null) return null;
  return `${String(Number(rate.toFixed(4)))}%`;
}

/**
 * Parse an operator-entered rate. Accepts "7.975" or "7.975%"; rejects anything
 * that is not a number in [0, 100]. Blank clears the rate (returns null).
 */
export function parseTaxRatePercentInput(raw: unknown): number | null | "INVALID" {
  const text = String(raw ?? "").trim().replace(/%$/, "").trim();
  if (!text) return null;
  const rate = Number(text);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return "INVALID";
  // Stored as numeric(6,4); anything finer is not representable.
  return Math.round(rate * 10000) / 10000;
}
