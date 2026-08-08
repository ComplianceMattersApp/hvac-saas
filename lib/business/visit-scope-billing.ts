/**
 * Reconciles the two independently-stored money numbers a job detail screen shows:
 * the Work Item's captured price (jobs.visit_scope_items) and the invoice charge it
 * was imported into (internal_invoice_line_items).
 *
 * Invoice lines are deliberate frozen snapshots and are never written back to the
 * job, so a Work Item priced at $55.00 keeps reading $55.00 after the tech edits the
 * charge to 10 x $55.00 = $500.00 in the invoice workspace. Rather than syncing the
 * two (issued invoices are immutable, and a consolidated invoice spans several jobs
 * so there is no single job to sync back to), this labels them: once a Work Item is
 * on an invoice the row reports what was actually billed, and an un-billed price is
 * marked as an estimate so a bare amount never reads as a total.
 */

export type VisitScopeBilledLine = {
  quantity: number;
  unitPriceCents: number;
  lineSubtotalCents: number;
};

export type VisitScopeItemPriceDisplay =
  | {
      state: "billed";
      badgeLabel: string;
      amountText: string;
      mathText: string | null;
    }
  | {
      state: "estimate";
      badgeLabel: null;
      amountText: string;
      mathText: string | null;
    }
  | { state: "none"; badgeLabel: null; amountText: null; mathText: null };

const NO_PRICE_DISPLAY: VisitScopeItemPriceDisplay = {
  state: "none",
  badgeLabel: null,
  amountText: null,
  mathText: null,
};

function formatCurrencyFromCents(cents: number): string {
  const amount = Number(cents ?? 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatQuantity(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2);
}

function toCents(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function toQuantity(value: unknown): number {
  const parsed = Number(value ?? 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * Keys invoice charges by the Work Item they were imported from. Only lines that
 * still carry source_kind='visit_scope' are linked — a charge typed by hand in the
 * invoice workspace has no Work Item to reconcile against.
 */
export function buildVisitScopeBilledLineMap(
  lineItems: ReadonlyArray<{
    source_kind?: string | null;
    source_visit_scope_item_id?: string | null;
    quantity?: unknown;
    unit_price?: unknown;
    line_subtotal?: unknown;
  }> | null | undefined,
): Record<string, VisitScopeBilledLine> {
  const billedLines: Record<string, VisitScopeBilledLine> = {};

  for (const lineItem of lineItems ?? []) {
    if (String(lineItem?.source_kind ?? "").trim().toLowerCase() !== "visit_scope") continue;

    const sourceId = String(lineItem?.source_visit_scope_item_id ?? "").trim();
    if (!sourceId) continue;

    billedLines[sourceId] = {
      quantity: toQuantity(lineItem.quantity),
      unitPriceCents: toCents(lineItem.unit_price),
      lineSubtotalCents: toCents(lineItem.line_subtotal),
    };
  }

  return billedLines;
}

export type UnlinkedInvoiceCharge = {
  title: string;
  amountText: string;
  mathText: string | null;
  /** Where the charge lives, e.g. "Added on the invoice" or "Add-on invoice #2190". */
  sourceLabel: string;
};

/**
 * Invoice charges that no Work Item accounts for — a pricebook item or manual line
 * added while building the invoice. The tech's work list is their arrival playbook,
 * so these are listed alongside the Work Items to make the list add up to the
 * invoice total instead of silently falling short of it.
 *
 * On a consolidated invoice, only this job's charges are returned.
 */
export function buildUnlinkedInvoiceCharges(params: {
  lineItems: ReadonlyArray<{
    source_kind?: string | null;
    source_visit_scope_item_id?: string | null;
    source_job_id?: string | null;
    item_name_snapshot?: unknown;
    quantity?: unknown;
    unit_price?: unknown;
    line_subtotal?: unknown;
  }> | null | undefined;
  jobId: string;
  isConsolidated?: boolean;
  sourceLabel?: string;
}): UnlinkedInvoiceCharge[] {
  const normalizedJobId = String(params.jobId ?? "").trim();
  const sourceLabel = params.sourceLabel ?? "Added on the invoice";
  const charges: UnlinkedInvoiceCharge[] = [];

  for (const lineItem of params.lineItems ?? []) {
    const sourceKind = String(lineItem?.source_kind ?? "").trim().toLowerCase();
    const sourceId = String(lineItem?.source_visit_scope_item_id ?? "").trim();
    // A visit_scope line is already represented by its Work Item row.
    if (sourceKind === "visit_scope" && sourceId) continue;

    if (params.isConsolidated) {
      const lineJobId = String(lineItem?.source_job_id ?? "").trim();
      if (!lineJobId || lineJobId !== normalizedJobId) continue;
    }

    const title = String(lineItem?.item_name_snapshot ?? "").trim();
    if (!title) continue;

    const quantity = toQuantity(lineItem.quantity);
    const unitPriceCents = toCents(lineItem.unit_price);
    const lineSubtotalCents = toCents(lineItem.line_subtotal);

    charges.push({
      title,
      amountText: formatCurrencyFromCents(lineSubtotalCents),
      mathText:
        quantity > 1
          ? `${formatQuantity(quantity)} × ${formatCurrencyFromCents(unitPriceCents)} = ${formatCurrencyFromCents(lineSubtotalCents)}`
          : null,
      sourceLabel,
    });
  }

  return charges;
}

export type InvoiceFamilyBillingView = {
  billedLines: Record<string, VisitScopeBilledLine>;
  unlinkedCharges: UnlinkedInvoiceCharge[];
};

export function formatAddOnInvoiceLabel(displayNumber: string | null | undefined): string {
  const normalized = String(displayNumber ?? "").trim();
  return normalized ? `Add-on invoice #${normalized}` : "Add-on invoice";
}

/**
 * Folds the primary invoice and every add-on into one view of what this job was
 * actually billed. Without this, work billed on an add-on reads as un-billed and
 * add-on charges never surface on the job screen at all.
 */
export function buildInvoiceFamilyBillingView(params: {
  jobId: string;
  primaryLineItems?: ReadonlyArray<any> | null;
  isPrimaryConsolidated?: boolean;
  addOnInvoices?: ReadonlyArray<{
    invoice_display_number?: string | null;
    line_items?: ReadonlyArray<any> | null;
  }> | null;
}): InvoiceFamilyBillingView {
  const billedLines = buildVisitScopeBilledLineMap(params.primaryLineItems);
  const unlinkedCharges = buildUnlinkedInvoiceCharges({
    lineItems: params.primaryLineItems,
    jobId: params.jobId,
    isConsolidated: params.isPrimaryConsolidated,
  });

  for (const addOn of params.addOnInvoices ?? []) {
    const label = formatAddOnInvoiceLabel(addOn.invoice_display_number);

    // Later add-ons win: a Work Item re-billed on a newer add-on should report the
    // charge that actually stands, not the earlier one it supersedes.
    Object.assign(billedLines, buildVisitScopeBilledLineMap(addOn.line_items));

    unlinkedCharges.push(
      ...buildUnlinkedInvoiceCharges({
        lineItems: addOn.line_items,
        jobId: params.jobId,
        sourceLabel: label,
      }),
    );
  }

  return { billedLines, unlinkedCharges };
}

export function resolveVisitScopeItemPriceDisplay(params: {
  itemId: unknown;
  expectedUnitPrice: unknown;
  expectedQuantity?: unknown;
  billedLines?: Record<string, VisitScopeBilledLine> | null;
}): VisitScopeItemPriceDisplay {
  const sourceId = String(params.itemId ?? "").trim();
  const billed = sourceId ? params.billedLines?.[sourceId] ?? null : null;

  // Billed wins over the captured price: the invoice charge is the money truth.
  if (billed) {
    return {
      state: "billed",
      badgeLabel: "Billed",
      amountText: formatCurrencyFromCents(billed.lineSubtotalCents),
      mathText:
        billed.quantity > 1
          ? `${formatQuantity(billed.quantity)} × ${formatCurrencyFromCents(billed.unitPriceCents)} = ${formatCurrencyFromCents(billed.lineSubtotalCents)}`
          : null,
    };
  }

  if (params.expectedUnitPrice === null || params.expectedUnitPrice === undefined) {
    return NO_PRICE_DISPLAY;
  }

  const unitPrice = Number(params.expectedUnitPrice);
  if (!Number.isFinite(unitPrice)) return NO_PRICE_DISPLAY;
  // A zero estimate means "not priced yet", not "free": the scope builder used to
  // coerce an empty price box to 0, so historical rows carry 0 instead of null.
  // A zero *billed* line still renders above — that one is a real invoice fact.
  if (unitPrice <= 0) return NO_PRICE_DISPLAY;

  const unitPriceCents = Math.round(unitPrice * 100);
  const quantity = toQuantity(params.expectedQuantity);
  const subtotalCents = Math.round(unitPriceCents * quantity);

  return {
    state: "estimate",
    badgeLabel: null,
    amountText: `Est. ${formatCurrencyFromCents(subtotalCents)}`,
    mathText:
      quantity > 1
        ? `${formatQuantity(quantity)} × ${formatCurrencyFromCents(unitPriceCents)} = ${formatCurrencyFromCents(subtotalCents)}`
        : null,
  };
}
