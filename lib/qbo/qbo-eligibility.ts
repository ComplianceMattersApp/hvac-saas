/**
 * Read-only QBO invoice-sync ELIGIBILITY evaluator.
 *
 * This module answers a single question for a controlled, zero-write dry run:
 * "Which internal invoices WOULD be eligible to sync to QuickBooks Online, and
 * for every ineligible invoice, what is the single canonical reason?"
 *
 * HARD GUARANTEES (asserted by tests):
 *  - It imports NOTHING from the QBO API client. It never touches QBO.
 *  - It performs ONLY Supabase `select` reads. No insert/update/upsert/delete,
 *    no `updateInvoiceSyncFields`, no token resolution, no `revalidatePath`.
 *
 * It intentionally does NOT reuse `syncSingleInvoiceWithContext` from
 * `qbo-sync.ts`, because that path calls QBO (find-or-create customer/invoice).
 * The eligibility gates here mirror `qbo-sync.ts` exactly, evaluated from the DB.
 */

// One canonical PRIMARY exclusion reason per invoice, in precedence order.
export type QboInvoiceExclusionReason =
  | "unsupported_state"
  | "voided"
  | "draft"
  | "already_synced"
  | "previously_skipped"
  | "before_sync_start"
  | "external_billing_or_no_charge"
  | "zero_or_invalid_total"
  | "no_line_items"
  | "unresolvable_customer";

export const QBO_INVOICE_EXCLUSION_REASONS: QboInvoiceExclusionReason[] = [
  "unsupported_state",
  "voided",
  "draft",
  "already_synced",
  "previously_skipped",
  "before_sync_start",
  "external_billing_or_no_charge",
  "zero_or_invalid_total",
  "no_line_items",
  "unresolvable_customer",
];

export interface QboInvoiceEligibilityScope {
  /** Inclusive lower bound on internal_invoices.invoice_date (YYYY-MM-DD). */
  invoiceDateFrom?: string | null;
  /** Inclusive upper bound on internal_invoices.invoice_date (YYYY-MM-DD). */
  invoiceDateTo?: string | null;
  /** Exact matches against invoice_number OR invoice_display_number. */
  invoiceNumbers?: string[] | null;
  /**
   * Sync-start cutoff: invoices issued (issued_at) BEFORE this instant are
   * excluded as `before_sync_start`. This is the connect-time baseline that
   * keeps pre-connect invoices (already handled outside QBO) from syncing and
   * duplicating. Accepts a date (YYYY-MM-DD) or full ISO timestamp.
   */
  issuedOnOrAfter?: string | null;
}

export interface QboInvoiceEligibilityRow {
  invoiceId: string;
  invoiceRef: string | null;
  status: string;
  qboSyncStatus: string | null;
  eligible: boolean;
  /** null when eligible; otherwise the single canonical reason. */
  primaryReason: QboInvoiceExclusionReason | null;
  /** All applicable reasons (superset of primary), for diagnostics only. */
  diagnostics: QboInvoiceExclusionReason[];
}

export interface QboInvoiceEligibilityReport {
  evaluated: number;
  eligible: number;
  excludedByReason: Record<QboInvoiceExclusionReason, number>;
  results: QboInvoiceEligibilityRow[];
}

const KNOWN_STATUSES = new Set(["draft", "issued", "void"]);

function nonEmpty(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > 0 ? s : null;
}

function toCents(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** True when the invoice would sync under a real customer identity (not a synthetic "Invoice <id>" name). */
function hasResolvableCustomer(invoiceRow: any, customerRow: any | null): boolean {
  const nameFromCustomer =
    nonEmpty(customerRow?.billing_name) ??
    nonEmpty(customerRow?.full_name) ??
    nonEmpty([customerRow?.first_name, customerRow?.last_name].filter(Boolean).join(" "));
  return Boolean(nameFromCustomer ?? nonEmpty(invoiceRow?.billing_name));
}

function emptyReasonTally(): Record<QboInvoiceExclusionReason, number> {
  const tally = {} as Record<QboInvoiceExclusionReason, number>;
  for (const reason of QBO_INVOICE_EXCLUSION_REASONS) tally[reason] = 0;
  return tally;
}

const INVOICE_SELECT =
  "id, status, invoice_kind, total_cents, invoice_date, issued_at, invoice_number, invoice_display_number, customer_id, job_id, billing_name, qbo_invoice_id, qbo_sync_status";

/** True when an issued invoice's issued_at falls before the sync-start cutoff. */
function issuedBeforeCutoff(issuedAt: unknown, cutoff: string | null): boolean {
  if (!cutoff) return false;
  const raw = typeof issuedAt === "string" ? issuedAt.trim() : "";
  if (!raw) return true; // issued invoice with no timestamp → treat as pre-cutoff (safer to exclude)
  const issuedMs = new Date(raw).getTime();
  const cutoffMs = new Date(cutoff).getTime();
  if (Number.isNaN(issuedMs) || Number.isNaN(cutoffMs)) return false;
  return issuedMs < cutoffMs;
}

/**
 * Evaluate QBO invoice-sync eligibility for one account, read-only.
 *
 * Precedence (one primary reason per invoice), matching the locked contract:
 *   1. unsupported_state (status outside draft/issued/void — safety fallthrough)
 *   2. voided     (status='void'; also how replaced/superseded is modeled)
 *   3. draft      (status='draft')
 *   4. already_synced      (issued, qbo_sync_status='synced')   ← sync-state, classified before content
 *   5. previously_skipped  (issued, qbo_sync_status='skipped')  ← sync-state
 *   6. before_sync_start   (issued, retryable, issued_at < scope.issuedOnOrAfter cutoff)
 *   7. external_billing_or_no_charge (issued, retryable, in-window, job.billing_disposition set)
 *   8. zero_or_invalid_total (issued, retryable, in-window, total_cents<=0)
 *   9. no_line_items         (issued, retryable, in-window, 0 line items)
 *  10. unresolvable_customer (issued, retryable, in-window, no real customer identity)
 *   else → ELIGIBLE
 *
 * "retryable" = qbo_sync_status is null or 'error' (mirrors the bulk candidate query).
 * Content reads (job disposition, line items, customer) run ONLY for retryable,
 * in-window issued invoices — terminal + pre-cutoff states are classified from
 * the invoice row alone.
 */
export async function evaluateQboInvoiceEligibility(params: {
  supabase: any;
  accountOwnerUserId: string;
  scope?: QboInvoiceEligibilityScope;
}): Promise<QboInvoiceEligibilityReport> {
  const { supabase, accountOwnerUserId, scope } = params;

  // 1. Fetch account-scoped invoices, applying the date scope in SQL.
  let query = supabase
    .from("internal_invoices")
    .select(INVOICE_SELECT)
    .eq("account_owner_user_id", accountOwnerUserId);
  const from = nonEmpty(scope?.invoiceDateFrom);
  const to = nonEmpty(scope?.invoiceDateTo);
  if (from) query = query.gte("invoice_date", from);
  if (to) query = query.lte("invoice_date", to);

  const { data: invoiceRowsRaw, error: invoiceError } = await query;
  if (invoiceError) {
    throw new Error(`evaluateQboInvoiceEligibility: invoice read failed: ${invoiceError.message}`);
  }
  let invoiceRows: any[] = Array.isArray(invoiceRowsRaw) ? invoiceRowsRaw : [];

  // Invoice-number scope is applied in memory (matches invoice_number OR display number).
  const numberScope = (scope?.invoiceNumbers ?? [])
    .map((n) => nonEmpty(n))
    .filter((n): n is string => Boolean(n));
  if (numberScope.length > 0) {
    const wanted = new Set(numberScope);
    invoiceRows = invoiceRows.filter(
      (row) =>
        wanted.has(String(row.invoice_number ?? "")) ||
        wanted.has(String(row.invoice_display_number ?? "")),
    );
  }

  // 2. Determine which invoices reach the content stage (issued + retryable +
  //    on/after the sync-start cutoff). Terminal + pre-cutoff rows are skipped.
  const syncStartCutoff = nonEmpty(scope?.issuedOnOrAfter);
  const isRetryable = (s: unknown) => s == null || s === "error";
  const contentStageRows = invoiceRows.filter(
    (row) =>
      row.status === "issued" &&
      isRetryable(row.qbo_sync_status) &&
      !issuedBeforeCutoff(row.issued_at, syncStartCutoff),
  );

  // 3. Batch-read content-stage facts ONLY. Terminal states get no extra reads.
  const jobIds = Array.from(
    new Set(contentStageRows.map((r) => r.job_id).filter(Boolean).map(String)),
  );
  const customerIds = Array.from(
    new Set(contentStageRows.map((r) => r.customer_id).filter(Boolean).map(String)),
  );
  const contentInvoiceIds = contentStageRows.map((r) => String(r.id));

  const dispositionByJobId = new Map<string, string | null>();
  const customerById = new Map<string, any>();
  const lineCountByInvoiceId = new Map<string, number>();

  if (jobIds.length > 0) {
    const { data, error } = await supabase
      .from("jobs")
      .select("id, billing_disposition")
      .in("id", jobIds);
    if (error) throw new Error(`evaluateQboInvoiceEligibility: job read failed: ${error.message}`);
    for (const job of data ?? []) {
      dispositionByJobId.set(String(job.id), nonEmpty(job.billing_disposition));
    }
  }

  if (customerIds.length > 0) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, billing_name, full_name, first_name, last_name")
      .in("id", customerIds);
    if (error) throw new Error(`evaluateQboInvoiceEligibility: customer read failed: ${error.message}`);
    for (const customer of data ?? []) customerById.set(String(customer.id), customer);
  }

  if (contentInvoiceIds.length > 0) {
    const { data, error } = await supabase
      .from("internal_invoice_line_items")
      .select("invoice_id")
      .in("invoice_id", contentInvoiceIds);
    if (error) throw new Error(`evaluateQboInvoiceEligibility: line-item read failed: ${error.message}`);
    for (const id of contentInvoiceIds) lineCountByInvoiceId.set(id, 0);
    for (const line of data ?? []) {
      const key = String(line.invoice_id);
      lineCountByInvoiceId.set(key, (lineCountByInvoiceId.get(key) ?? 0) + 1);
    }
  }

  // 4. Classify each invoice.
  const excludedByReason = emptyReasonTally();
  let eligible = 0;
  const results: QboInvoiceEligibilityRow[] = invoiceRows.map((row) => {
    const invoiceId = String(row.id);
    const invoiceRef = nonEmpty(row.invoice_display_number) ?? nonEmpty(row.invoice_number);
    const status = String(row.status ?? "");
    const qboSyncStatus = row.qbo_sync_status == null ? null : String(row.qbo_sync_status);

    // Flags are pushed in precedence order; diagnostics[0] is therefore the
    // canonical primary reason. (Deriving primary from the array rather than a
    // mutated closure variable keeps TS control-flow analysis sound.)
    const diagnostics: QboInvoiceExclusionReason[] = [];
    const flag = (reason: QboInvoiceExclusionReason) => {
      diagnostics.push(reason);
    };

    // Lifecycle + sync-state (no content reads).
    if (!KNOWN_STATUSES.has(status)) {
      flag("unsupported_state");
    } else if (status === "void") {
      flag("voided");
    } else if (status === "draft") {
      flag("draft");
    } else {
      // status === "issued"
      if (qboSyncStatus === "synced") flag("already_synced");
      else if (qboSyncStatus === "skipped") flag("previously_skipped");
      else if (issuedBeforeCutoff(row.issued_at, syncStartCutoff)) flag("before_sync_start");
      else {
        // Content stage (retryable + in-window). Evaluate ALL content gates
        // so diagnostics is a complete superset; primary stays the first hit.
        const disposition = row.job_id ? dispositionByJobId.get(String(row.job_id)) ?? null : null;
        if (disposition) flag("external_billing_or_no_charge");
        if (toCents(row.total_cents) <= 0) flag("zero_or_invalid_total");
        if ((lineCountByInvoiceId.get(invoiceId) ?? 0) === 0) flag("no_line_items");
        const customerRow = row.customer_id ? customerById.get(String(row.customer_id)) ?? null : null;
        if (!hasResolvableCustomer(row, customerRow)) flag("unresolvable_customer");
      }
    }

    const primaryReason: QboInvoiceExclusionReason | null =
      diagnostics.length > 0 ? diagnostics[0] : null;
    const isEligible = primaryReason === null;
    if (primaryReason === null) eligible += 1;
    else excludedByReason[primaryReason] += 1;

    return {
      invoiceId,
      invoiceRef,
      status,
      qboSyncStatus,
      eligible: isEligible,
      primaryReason,
      diagnostics,
    };
  });

  return {
    evaluated: invoiceRows.length,
    eligible,
    excludedByReason,
    results,
  };
}
