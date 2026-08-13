import { getQboBaseUrl } from "./qbo-env";
import { getQboConnectionForAccount, getValidQboAccessToken, recordQboConnectionSyncOutcome } from "./qbo-connection";
import {
  createQboInvoice,
  findQboInvoiceByDocNumber,
  findQboInvoiceById,
  findOrCreateQboCustomer,
  findOrCreateEveryStepServicesItem,
  updateQboInvoice,
  type QboCustomerInput,
  type QboInvoiceInput,
} from "./qbo-api-client";
import {
  readAccountDefaultQboItem,
  readPricebookQboItemMappings,
  type QboItemMapping,
} from "./qbo-item-mapping";
import { centsMatch, toCents } from "./qbo-money";

/**
 * One-way EveryStep -> QBO invoice sync orchestrator.
 *
 * Hard rule: syncing must NEVER throw. Every failure degrades to an 'error'
 * result and is recorded on the invoice row (qbo_sync_status='error') so the
 * operational workflow is never blocked. EveryStep stays the source of truth.
 */

export interface QboInvoiceSyncResult {
  invoiceId: string;
  status: "synced" | "skipped" | "error";
  qboInvoiceId?: string;
  error?: string;
}

interface QboSyncContext {
  supabase: any;
  accountOwnerUserId: string;
  accessToken: string;
  realmId: string;
  baseUrl: string;
  /** Account-level fallback item for lines with no pricebook mapping. */
  defaultQboItem: QboItemMapping | null;
  /**
   * Last-resort item ref, resolved at most once per sync run and only when a
   * line actually needs it — an account that maps everything never has an
   * EveryStep-owned item created in its QuickBooks file.
   */
  resolveFallbackItemRef: () => Promise<string>;
  /** Connect-time cutoff: invoices issued before this instant never sync. */
  syncStartAt?: string | null;
}

/**
 * Memoizes the find-or-create so one run makes at most one round trip for it.
 *
 * The memo is cleared on rejection: caching a rejected promise would make one
 * transient QBO failure fail every remaining invoice in a bulk run with the same
 * stale error, turning a single blip into a whole-sweep outage.
 */
function createFallbackItemRefResolver(params: {
  accessToken: string;
  realmId: string;
  baseUrl: string;
}): () => Promise<string> {
  let inFlight: Promise<string> | null = null;
  return () => {
    inFlight ??= findOrCreateEveryStepServicesItem(params).catch((error) => {
      inFlight = null;
      throw error;
    });
    return inFlight;
  };
}

/** True when an issued invoice predates the connect-time sync-start cutoff. */
function issuedBeforeSyncStart(issuedAt: unknown, syncStartAt: string): boolean {
  const raw = typeof issuedAt === "string" ? issuedAt.trim() : "";
  if (!raw) return true; // issued invoice with no timestamp → treat as pre-cutoff (safer to skip)
  const issuedMs = new Date(raw).getTime();
  const startMs = new Date(syncStartAt).getTime();
  if (Number.isNaN(issuedMs) || Number.isNaN(startMs)) return false;
  return issuedMs < startMs;
}

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function nonEmpty(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > 0 ? s : null;
}

function qboInvoiceOriginMarker(invoiceId: unknown) {
  return `EveryStep invoice ID: ${String(invoiceId ?? "").trim()}`;
}

function resolveJobContext(customerRow: any | null, jobRow: any | null): string | null {
  const customerName =
    nonEmpty(customerRow?.full_name) ??
    nonEmpty([customerRow?.first_name, customerRow?.last_name].filter(Boolean).join(" ")) ??
    nonEmpty([jobRow?.customer_first_name, jobRow?.customer_last_name].filter(Boolean).join(" "));
  const jobNumber = nonEmpty(jobRow?.job_display_number);
  const serviceAddress = nonEmpty(jobRow?.job_address);
  const parts = [
    customerName ? `Customer: ${customerName}` : null,
    jobNumber ? `Job #${jobNumber}` : null,
    serviceAddress,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Persist sync bookkeeping, throwing when the write did not land.
 *
 * Silently ignoring the Supabase error is what lets a row be reported 'synced'
 * while the database still says otherwise — the same class of unverified
 * success this lane exists to prevent, one layer down. Callers let it throw;
 * the sync's own catch records the failure.
 */
async function updateInvoiceSyncFields(
  supabase: any,
  invoiceId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("internal_invoices").update(patch).eq("id", invoiceId);
  if (error) {
    throw new Error(`Failed to persist QBO invoice sync state: ${error.message ?? "unknown error"}`);
  }
}

function resolveCustomerInput(invoiceRow: any, customerRow: any | null): QboCustomerInput {
  // The invoice billing snapshot is the frozen bill-to and already reflects who
  // pays (contractor vs customer), so it is the PRIMARY source here — the job's
  // customer row is only a fallback. This is what makes a contractor-billed
  // invoice map to the contractor in QBO instead of the end customer.
  // `qbo_customer_name` pins the exact QBO DisplayName so the invoice attaches to
  // an existing QBO customer rather than creating a near-duplicate.
  const customerName =
    nonEmpty(customerRow?.billing_name) ??
    nonEmpty(customerRow?.full_name) ??
    nonEmpty([customerRow?.first_name, customerRow?.last_name].filter(Boolean).join(" "));
  const displayName =
    nonEmpty(invoiceRow.qbo_customer_name) ??
    nonEmpty(invoiceRow.billing_name) ??
    customerName ??
    `Invoice ${invoiceRow.invoice_display_number ?? invoiceRow.invoice_number ?? invoiceRow.id}`;

  return {
    displayName,
    email: nonEmpty(invoiceRow.billing_email) ?? nonEmpty(customerRow?.email),
    phone: nonEmpty(invoiceRow.billing_phone) ?? nonEmpty(customerRow?.phone),
    billingAddressLine1: nonEmpty(invoiceRow.billing_address_line1) ?? nonEmpty(customerRow?.billing_address_line1),
    billingAddressLine2: nonEmpty(invoiceRow.billing_address_line2) ?? nonEmpty(customerRow?.billing_address_line2),
    billingCity: nonEmpty(invoiceRow.billing_city) ?? nonEmpty(customerRow?.billing_city),
    billingState: nonEmpty(invoiceRow.billing_state) ?? nonEmpty(customerRow?.billing_state),
    billingZip: nonEmpty(invoiceRow.billing_zip) ?? nonEmpty(customerRow?.billing_zip),
    billingCountry: nonEmpty(invoiceRow.billing_country) ?? nonEmpty(customerRow?.billing_country),
  };
}

type ResolvedLineItemRefs = {
  /** One QBO Item.Id per line, positionally aligned with `lineItems`. */
  itemRefs: string[];
  /**
   * Human-readable description of every EXPLICIT mapping this invoice relied
   * on. Reported back when QuickBooks rejects the write so an operator can see
   * which mapping to fix — a silent fallback would hide a books problem.
   */
  mappingsUsed: string[];
};

function describeMapping(label: string, mapping: QboItemMapping): string {
  const name = mapping.qboItemName ? ` ("${mapping.qboItemName}")` : "";
  return `${label} → QuickBooks item ${mapping.qboItemId}${name}`;
}

/**
 * Per-line item resolution: pricebook mapping, then the account default, then
 * the app-owned EveryStep Services item. Pricebook mappings are read in one
 * batched query for the whole invoice, never per line.
 */
async function resolveLineItemRefs(
  ctx: QboSyncContext,
  lineItems: any[],
): Promise<ResolvedLineItemRefs> {
  const pricebookMappings = await readPricebookQboItemMappings({
    supabase: ctx.supabase,
    accountOwnerUserId: ctx.accountOwnerUserId,
    pricebookItemIds: lineItems
      .map((line) => nonEmpty(line.source_pricebook_item_id))
      .filter((id): id is string => Boolean(id)),
  });

  const mappingsUsed = new Set<string>();
  const itemRefs: string[] = [];
  let fallbackItemRef: string | null = null;

  for (const line of lineItems) {
    const pricebookItemId = nonEmpty(line.source_pricebook_item_id);
    const mapped = pricebookItemId ? pricebookMappings.get(pricebookItemId) : undefined;
    if (mapped) {
      mappingsUsed.add(
        describeMapping(`pricebook item "${mapped.pricebookItemName ?? pricebookItemId}"`, mapped),
      );
      itemRefs.push(mapped.qboItemId);
      continue;
    }
    if (ctx.defaultQboItem) {
      mappingsUsed.add(describeMapping("account default item", ctx.defaultQboItem));
      itemRefs.push(ctx.defaultQboItem.qboItemId);
      continue;
    }
    fallbackItemRef ??= await ctx.resolveFallbackItemRef();
    itemRefs.push(fallbackItemRef);
  }

  return { itemRefs, mappingsUsed: [...mappingsUsed] };
}

function buildInvoiceInput(
  invoiceRow: any,
  lineItems: any[],
  customerRef: string,
  jobContext: string | null,
  jobContextByJobId: Map<string, string> = new Map(),
  itemRefs: string[] = [],
): QboInvoiceInput {
  return {
    docNumber: String(invoiceRow.invoice_display_number ?? invoiceRow.invoice_number ?? ""),
    txnDate: String(invoiceRow.invoice_date ?? "").slice(0, 10),
    customerRef,
    lines: lineItems.map((line, index) => {
      const quantity = toNumber(line.quantity);
      const unitPrice = toNumber(line.unit_price);
      const amount = line.line_subtotal != null ? toNumber(line.line_subtotal) : quantity * unitPrice;
      const serviceDescription =
        nonEmpty(line.description_snapshot) ?? String(line.item_name_snapshot ?? "Services");
      return {
        description: (jobContextByJobId.get(String(line.source_job_id ?? "")) ?? jobContext)
          ? `${jobContextByJobId.get(String(line.source_job_id ?? "")) ?? jobContext}\n${serviceDescription}`
          : serviceDescription,
        amount,
        quantity,
        unitPrice,
        itemRef: itemRefs[index] ?? "",
        // Undefined until the Slice-02 migration lands, which reads as
        // non-taxable — exactly the behavior before tax existed.
        isTaxable: Boolean(line.is_taxable),
      };
    }),
    privateNote: [nonEmpty(invoiceRow.notes), qboInvoiceOriginMarker(invoiceRow.id)].filter(Boolean).join(" Â· "),
  };
}

/**
 * Confirm the invoice against QuickBooks' own state after a write.
 *
 * A 2xx from the write endpoint is not proof: production has returned success
 * for a request QuickBooks then processed differently (that is the drift this
 * lane exists to prevent). Throws — the caller's catch records 'error', which
 * is the safe direction: a false negative just retries on the next sweep, while
 * a false positive retires the row and hides the drift for good.
 */
async function verifyQboInvoiceAfterWrite(params: {
  accessToken: string;
  realmId: string;
  baseUrl: string;
  qboInvoiceId: string;
  expectedDocNumber: string;
  expectedTotal: number;
}): Promise<{ syncToken: string }> {
  const { qboInvoiceId, expectedDocNumber, expectedTotal } = params;

  let confirmation;
  try {
    confirmation = await findQboInvoiceById({
      accessToken: params.accessToken,
      realmId: params.realmId,
      baseUrl: params.baseUrl,
      qboInvoiceId,
    });
  } catch (error) {
    // The write landed but we could not look at it. Distinct from a mismatch:
    // nothing is known to be wrong in QuickBooks, only unconfirmed.
    const reason = error instanceof Error ? error.message : "unknown error";
    throw new Error(
      `QuickBooks accepted invoice ${expectedDocNumber} (QBO id ${qboInvoiceId}) but the confirming read-back failed `
      + `— unverified — read-back failed: ${reason}. It was NOT recorded as synced; the next sync run retries it.`,
    );
  }

  if (!confirmation) {
    throw new Error(
      `QuickBooks accepted invoice ${expectedDocNumber} but a read-back found no invoice with QBO id ${qboInvoiceId} `
      + `— verified mismatch. It was NOT recorded as synced.`,
    );
  }

  // Only compare the document number when we actually sent one: with an empty
  // DocNumber QuickBooks assigns its own, so there is nothing to match against
  // and the amount is the only meaningful check.
  const docNumberMatches =
    !expectedDocNumber || String(confirmation.docNumber ?? "") === String(expectedDocNumber);
  // Compare against the pre-tax subtotal. EveryStep never sends tax, but a
  // company on QuickBooks' Automated Sales Tax has it added on QBO's side, so
  // TotalAmt legitimately exceeds our line sum. Comparing TotalAmt directly
  // would fail those tenants on every run forever — and because the sweep
  // retries error rows, it would also rewrite their QBO invoice each time.
  const observedTax = Number(confirmation.totalTax ?? 0) || 0;
  const observedSubtotal = confirmation.totalAmount - observedTax;
  const totalMatches = centsMatch(observedSubtotal, expectedTotal);
  if (!docNumberMatches || !totalMatches) {
    const taxNote = observedTax
      ? ` (QuickBooks added $${observedTax.toFixed(2)} sales tax; compared pre-tax)`
      : "";
    throw new Error(
      `QuickBooks accepted invoice ${expectedDocNumber} but the read-back does not match — verified mismatch `
      + `(QBO id ${confirmation.id}, observed doc number ${confirmation.docNumber ?? "(EMPTY)"} vs expected `
      + `${expectedDocNumber || "(EMPTY)"}, observed total $${observedSubtotal.toFixed(2)} vs expected `
      + `$${expectedTotal.toFixed(2)}${taxNote}). It was NOT recorded as synced.`,
    );
  }

  return { syncToken: confirmation.syncToken };
}

async function syncSingleInvoiceWithContext(
  ctx: QboSyncContext,
  invoiceId: string,
): Promise<QboInvoiceSyncResult> {
  const { supabase, accountOwnerUserId, accessToken, realmId, baseUrl } = ctx;
  try {
    // Load invoice (scoped to account)
    const { data: invoiceRow, error: invoiceError } = await supabase
      .from("internal_invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("account_owner_user_id", accountOwnerUserId)
      .maybeSingle();
    if (invoiceError) throw new Error(invoiceError.message);
    if (!invoiceRow) return { invoiceId, status: "skipped", error: "Invoice not found" };

    // Eligibility: only issued invoices sync. Do not persist a status here so a
    // later-issued draft is still picked up by the bulk query.
    if (invoiceRow.status !== "issued") {
      return { invoiceId, status: "skipped", error: `Invoice status is '${invoiceRow.status}'` };
    }

    // Sync-start cutoff (defense-in-depth alongside the candidate-query filter):
    // invoices issued before the connect time are assumed already handled outside
    // QBO. Not persisted, so it re-evaluates if the cutoff ever changes.
    if (ctx.syncStartAt && issuedBeforeSyncStart(invoiceRow.issued_at, ctx.syncStartAt)) {
      return { invoiceId, status: "skipped", error: "Issued before QBO sync start (pre-connect)" };
    }

    // Eligibility: skip work the job resolved without a collectible platform invoice.
    let jobRow: any | null = null;
    if (invoiceRow.job_id) {
      const { data } = await supabase
        .from("jobs")
        .select(
          "billing_disposition, job_display_number, job_address, customer_first_name, customer_last_name",
        )
        .eq("id", invoiceRow.job_id)
        .maybeSingle();
      jobRow = data ?? null;
      if (jobRow?.billing_disposition) {
        await updateInvoiceSyncFields(supabase, invoiceId, {
          qbo_sync_status: "skipped",
          qbo_sync_error: `Job billing_disposition='${jobRow.billing_disposition}'`,
        });
        return {
          invoiceId,
          status: "skipped",
          error: `Job billing_disposition='${jobRow.billing_disposition}'`,
        };
      }
    }

    // Line items
    const { data: lineItems, error: lineError } = await supabase
      .from("internal_invoice_line_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("sort_order", { ascending: true });
    if (lineError) throw new Error(lineError.message);
    if (!lineItems || lineItems.length === 0) {
      await updateInvoiceSyncFields(supabase, invoiceId, {
        qbo_sync_status: "skipped",
        qbo_sync_error: "Invoice has no line items",
      });
      return { invoiceId, status: "skipped", error: "Invoice has no line items" };
    }

    // Customer — live customer row preferred, invoice snapshot as fallback
    let customerRow: any | null = null;
    if (invoiceRow.customer_id) {
      const { data } = await supabase
        .from("customers")
        .select("*")
        .eq("id", invoiceRow.customer_id)
        .maybeSingle();
      customerRow = data ?? null;
    }
    const customerInput = resolveCustomerInput(invoiceRow, customerRow);

    const qboCustomer = await findOrCreateQboCustomer({
      accessToken,
      realmId,
      baseUrl,
      customer: customerInput,
    });

    const sourceJobIds = [...new Set<string>(lineItems.map((line: any) => nonEmpty(line.source_job_id)).filter((id: string | null): id is string => Boolean(id)))];
    const jobContextByJobId = new Map<string, string>();
    if (sourceJobIds.length > 1) {
      const { data: sourceJobs, error: sourceJobsError } = await supabase
        .from("jobs")
        .select("id, job_display_number, job_address, customer_first_name, customer_last_name")
        .eq("account_owner_user_id", accountOwnerUserId)
        .in("id", sourceJobIds);
      if (sourceJobsError) throw new Error(sourceJobsError.message);
      if ((sourceJobs ?? []).length !== sourceJobIds.length) throw new Error("Invoice source-job context is incomplete");
      for (const sourceJob of sourceJobs ?? []) {
        const sourceContext = resolveJobContext(null, sourceJob);
        if (sourceContext) jobContextByJobId.set(String(sourceJob.id), sourceContext);
      }
    }

    const { itemRefs, mappingsUsed } = await resolveLineItemRefs(ctx, lineItems);
    const invoiceInput = buildInvoiceInput(
      invoiceRow,
      lineItems,
      qboCustomer.id,
      resolveJobContext(customerRow, jobRow),
      jobContextByJobId,
      itemRefs,
    );
    const expectedTotal =
      Math.round(invoiceInput.lines.reduce((sum, line) => sum + toCents(line.amount), 0)) / 100;

    // A QuickBooks rejection on a line we deliberately mapped is a books
    // problem (item deleted, made inactive, wrong type), not a transient
    // failure — so the error names the mappings instead of silently falling
    // back to the catch-all item, which would hide it.
    const withMappingContext = async <T>(write: () => Promise<T>): Promise<T> => {
      try {
        return await write();
      } catch (error) {
        if (mappingsUsed.length === 0) throw error;
        const reason = error instanceof Error ? error.message : "Unknown QBO error";
        throw new Error(
          `${reason} — QuickBooks item mapping(s) used on this invoice: ${mappingsUsed.join("; ")}. `
          + `If a mapped QuickBooks item was deleted, renamed away, or made inactive, fix the mapping in `
          + `Admin Center and retry.`,
        );
      }
    };

    let synced;
    if (!invoiceRow.qbo_invoice_id) {
      const existingQboInvoice = await findQboInvoiceByDocNumber({
        accessToken,
        realmId,
        baseUrl,
        docNumber: invoiceInput.docNumber,
      });
      if (existingQboInvoice) {
        if (nonEmpty(existingQboInvoice.privateNote)?.includes(qboInvoiceOriginMarker(invoiceRow.id))) {
          // The original create reached QBO but its response/local identity
          // write did not. The private marker proves this exact EveryStep
          // invoice created the document, so adopting it is safe.
          synced = existingQboInvoice;
        } else {
          throw new Error(
            `QuickBooks already has invoice number ${invoiceInput.docNumber}. This app invoice was not created or linked; resolve the number conflict before retrying.`,
          );
        }
      } else {
        synced = await withMappingContext(() => createQboInvoice({
          accessToken,
          realmId,
          baseUrl,
          invoice: invoiceInput,
          requestId: `esinv-${invoiceId}`,
        }));
      }
    } else {
      // Re-read the LIVE SyncToken immediately before updating. The stored one
      // goes stale the moment anything touches the invoice in QuickBooks — a
      // payment posting is enough — and using it fails with a 5010 stale-object
      // fault. No fallback to the stored token: if this read fails we take the
      // error path, because guessing the token is how the drift starts.
      const live = await findQboInvoiceById({
        accessToken,
        realmId,
        baseUrl,
        qboInvoiceId: String(invoiceRow.qbo_invoice_id),
      });
      if (!live) {
        throw new Error(
          `QuickBooks no longer has invoice ${invoiceInput.docNumber} (QBO id ${invoiceRow.qbo_invoice_id}). `
          + `It was deleted there, or the stored link is stale — relink or re-create it in QuickBooks.`,
        );
      }
      synced = await withMappingContext(() => updateQboInvoice({
        accessToken,
        realmId,
        baseUrl,
        qboInvoiceId: invoiceRow.qbo_invoice_id,
        syncToken: live.syncToken,
        invoice: invoiceInput,
        requestId: `esinvupd-${invoiceId}-${live.syncToken}`,
      }));
    }

    // Durable identity BEFORE the confirming read: the write reached
    // QuickBooks, so the id must survive even if verification fails, or a retry
    // would create a second invoice there. 'pending' is retryable and is a
    // candidate for the next sweep — it is never a terminal state.
    try {
      await updateInvoiceSyncFields(supabase, invoiceId, {
        qbo_invoice_id: synced.id,
        qbo_customer_id: qboCustomer.id,
        qbo_sync_token: synced.syncToken,
        qbo_sync_status: "pending",
        qbo_sync_error: null,
      });
    } catch (error) {
      // The identity did NOT persist. Continuing would verify and then report
      // 'synced' for a row that has no QBO id stored — and the retry would
      // create a duplicate in QuickBooks. Stop here and report it as the
      // unverified state it is, naming the id so it can be linked by hand.
      const reason = error instanceof Error ? error.message : "unknown error";
      throw new Error(
        `QuickBooks accepted invoice ${invoiceInput.docNumber} (QBO id ${synced.id}) but EveryStep could not `
        + `record the link — unverified — identity write failed: ${reason}. The invoice was NOT recorded as `
        + `synced; retry, and if QuickBooks reports a duplicate number, link QBO id ${synced.id} by hand.`,
      );
    }

    const confirmed = await verifyQboInvoiceAfterWrite({
      accessToken,
      realmId,
      baseUrl,
      qboInvoiceId: synced.id,
      expectedDocNumber: invoiceInput.docNumber,
      expectedTotal,
    });

    await updateInvoiceSyncFields(supabase, invoiceId, {
      qbo_invoice_id: synced.id,
      qbo_customer_id: qboCustomer.id,
      // The live token from the confirming read, not the write response: it is
      // the freshest one observed, so a later update is least likely to hit a
      // stale-object (5010) fault.
      qbo_sync_token: confirmed.syncToken,
      qbo_sync_status: "synced",
      qbo_last_synced_at: new Date().toISOString(),
      qbo_sync_error: null,
    });

    return { invoiceId, status: "synced", qboInvoiceId: synced.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown QBO sync error";
    // Best-effort error record — must not throw out of the sync path.
    try {
      await updateInvoiceSyncFields(supabase, invoiceId, {
        qbo_sync_status: "error",
        qbo_sync_error: message,
      });
    } catch {
      /* swallow — never block on the error record */
    }
    return { invoiceId, status: "error", error: message };
  }
}

export async function syncInvoiceToQbo(params: {
  supabase: any;
  accountOwnerUserId: string;
  invoiceId: string;
}): Promise<QboInvoiceSyncResult> {
  const { supabase, accountOwnerUserId, invoiceId } = params;
  try {
    const token = await getValidQboAccessToken({ supabase, accountOwnerUserId });
    if (!token) return { invoiceId, status: "skipped", error: "No QBO connection" };

    const baseUrl = getQboBaseUrl();
    return await syncSingleInvoiceWithContext(
      {
        supabase,
        accountOwnerUserId,
        accessToken: token.accessToken,
        realmId: token.realmId,
        baseUrl,
        defaultQboItem: await readAccountDefaultQboItem({ supabase, accountOwnerUserId }),
        resolveFallbackItemRef: createFallbackItemRefResolver({
          accessToken: token.accessToken,
          realmId: token.realmId,
          baseUrl,
        }),
      },
      invoiceId,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown QBO sync error";
    return { invoiceId, status: "error", error: message };
  }
}

export async function syncAllPendingInvoicesToQbo(params: {
  supabase: any;
  accountOwnerUserId: string;
  dryRun?: boolean;
}): Promise<{
  synced: number;
  skipped: number;
  errors: number;
  results: QboInvoiceSyncResult[];
}> {
  const { supabase, accountOwnerUserId, dryRun = false } = params;

  // Sync-start cutoff: invoices issued before the connect time are assumed already
  // handled outside QBO and must never sync (prevents duplicating pre-connect
  // invoices). Derived from the connection's connected_at. Never block the run on
  // this read — the per-invoice guard in syncSingleInvoiceWithContext still applies.
  let syncStartAt: string | null = null;
  try {
    const connection = await getQboConnectionForAccount({ supabase, accountOwnerUserId });
    syncStartAt = connection?.connectedAt ?? null;
  } catch {
    syncStartAt = null;
  }

  // Candidate query: issued invoices not yet synced, previously errored, or
  // left 'pending' (written to QuickBooks but never confirmed — including the
  // unverified read-back failures, which must always be retryable and are never
  // recorded as synced), restricted to those issued on/after the sync-start
  // cutoff.
  let candidateQuery = supabase
    .from("internal_invoices")
    .select("id")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("status", "issued")
    .or("qbo_sync_status.is.null,qbo_sync_status.eq.error,qbo_sync_status.eq.pending");
  if (syncStartAt) candidateQuery = candidateQuery.gte("issued_at", syncStartAt);
  const { data: candidateRows, error: candidateError } = await candidateQuery;

  const results: QboInvoiceSyncResult[] = [];
  if (candidateError || !candidateRows || candidateRows.length === 0) {
    return { synced: 0, skipped: 0, errors: 0, results };
  }
  const candidateIds: string[] = candidateRows.map((r: any) => String(r.id));

  if (dryRun) {
    for (const id of candidateIds) {
      results.push({ invoiceId: id, status: "skipped", error: "dry run" });
    }
    return { synced: 0, skipped: results.length, errors: 0, results };
  }

  // Resolve auth + the account's default item once for the whole run. The
  // catch-all EveryStep Services item is resolved lazily (also once per run),
  // so an account that maps every line never has one created in its books.
  let ctx: QboSyncContext;
  try {
    const token = await getValidQboAccessToken({ supabase, accountOwnerUserId });
    if (!token) {
      return { synced: 0, skipped: 0, errors: 0, results };
    }
    const baseUrl = getQboBaseUrl();
    ctx = {
      supabase,
      accountOwnerUserId,
      accessToken: token.accessToken,
      realmId: token.realmId,
      baseUrl,
      defaultQboItem: await readAccountDefaultQboItem({ supabase, accountOwnerUserId }),
      resolveFallbackItemRef: createFallbackItemRefResolver({
        accessToken: token.accessToken,
        realmId: token.realmId,
        baseUrl,
      }),
      syncStartAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "QBO sync setup failed";
    for (const id of candidateIds) {
      results.push({ invoiceId: id, status: "error", error: message });
    }
    await recordQboConnectionSyncOutcome({ supabase, accountOwnerUserId, lastSyncError: message });
    return { synced: 0, skipped: 0, errors: candidateIds.length, results };
  }

  for (const id of candidateIds) {
    // Sequential — no background infra, and QBO throttles hard.
    results.push(await syncSingleInvoiceWithContext(ctx, id));
  }

  const synced = results.filter((r) => r.status === "synced").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;

  await recordQboConnectionSyncOutcome({
    supabase,
    accountOwnerUserId,
    lastSyncError: errors > 0 ? `${errors} invoice(s) failed to sync` : null,
  });

  return { synced, skipped, errors, results };
}
