import { getQboBaseUrl } from "./qbo-env";
import { getQboConnectionForAccount, getValidQboAccessToken, recordQboConnectionSyncOutcome } from "./qbo-connection";
import {
  createQboInvoice,
  findOrCreateQboCustomer,
  findOrCreateQboServicesItem,
  updateQboInvoice,
  type QboCustomerInput,
  type QboInvoiceInput,
} from "./qbo-api-client";

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
  servicesItemRef: string;
  /** Connect-time cutoff: invoices issued before this instant never sync. */
  syncStartAt?: string | null;
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

async function updateInvoiceSyncFields(
  supabase: any,
  invoiceId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await supabase.from("internal_invoices").update(patch).eq("id", invoiceId);
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

function buildInvoiceInput(
  invoiceRow: any,
  lineItems: any[],
  customerRef: string,
): QboInvoiceInput {
  return {
    docNumber: String(invoiceRow.invoice_display_number ?? invoiceRow.invoice_number ?? ""),
    txnDate: String(invoiceRow.invoice_date ?? "").slice(0, 10),
    customerRef,
    lines: lineItems.map((line) => {
      const quantity = toNumber(line.quantity);
      const unitPrice = toNumber(line.unit_price);
      const amount = line.line_subtotal != null ? toNumber(line.line_subtotal) : quantity * unitPrice;
      return {
        description: nonEmpty(line.description_snapshot) ?? String(line.item_name_snapshot ?? "Services"),
        amount,
        quantity,
        unitPrice,
      };
    }),
    privateNote: nonEmpty(invoiceRow.notes),
  };
}

async function syncSingleInvoiceWithContext(
  ctx: QboSyncContext,
  invoiceId: string,
): Promise<QboInvoiceSyncResult> {
  const { supabase, accountOwnerUserId, accessToken, realmId, baseUrl, servicesItemRef } = ctx;
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
    if (invoiceRow.job_id) {
      const { data: jobRow } = await supabase
        .from("jobs")
        .select("billing_disposition")
        .eq("id", invoiceRow.job_id)
        .maybeSingle();
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

    const invoiceInput = buildInvoiceInput(invoiceRow, lineItems, qboCustomer.id);

    let synced;
    if (!invoiceRow.qbo_invoice_id) {
      synced = await createQboInvoice({
        accessToken,
        realmId,
        baseUrl,
        invoice: invoiceInput,
        servicesItemRef,
      });
    } else {
      synced = await updateQboInvoice({
        accessToken,
        realmId,
        baseUrl,
        qboInvoiceId: invoiceRow.qbo_invoice_id,
        syncToken: invoiceRow.qbo_sync_token ?? "0",
        invoice: invoiceInput,
        servicesItemRef,
      });
    }

    await updateInvoiceSyncFields(supabase, invoiceId, {
      qbo_invoice_id: synced.id,
      qbo_customer_id: qboCustomer.id,
      qbo_sync_token: synced.syncToken,
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
    const servicesItemRef = await findOrCreateQboServicesItem({
      accessToken: token.accessToken,
      realmId: token.realmId,
      baseUrl,
    });

    return await syncSingleInvoiceWithContext(
      {
        supabase,
        accountOwnerUserId,
        accessToken: token.accessToken,
        realmId: token.realmId,
        baseUrl,
        servicesItemRef,
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

  // Candidate query: issued invoices not yet synced (or previously errored),
  // restricted to those issued on/after the sync-start cutoff.
  let candidateQuery = supabase
    .from("internal_invoices")
    .select("id")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("status", "issued")
    .or("qbo_sync_status.is.null,qbo_sync_status.eq.error");
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

  // Resolve auth + the catch-all Services item once for the whole run.
  let ctx: QboSyncContext;
  try {
    const token = await getValidQboAccessToken({ supabase, accountOwnerUserId });
    if (!token) {
      return { synced: 0, skipped: 0, errors: 0, results };
    }
    const baseUrl = getQboBaseUrl();
    const servicesItemRef = await findOrCreateQboServicesItem({
      accessToken: token.accessToken,
      realmId: token.realmId,
      baseUrl,
    });
    ctx = {
      supabase,
      accountOwnerUserId,
      accessToken: token.accessToken,
      realmId: token.realmId,
      baseUrl,
      servicesItemRef,
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
