import { getQboBaseUrl } from "./qbo-env";
import { getValidQboAccessToken, recordQboConnectionSyncOutcome } from "./qbo-connection";
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
  const nameFromCustomer =
    nonEmpty(customerRow?.billing_name) ??
    nonEmpty(customerRow?.full_name) ??
    nonEmpty(
      [customerRow?.first_name, customerRow?.last_name].filter(Boolean).join(" "),
    );
  const displayName =
    nameFromCustomer ??
    nonEmpty(invoiceRow.billing_name) ??
    `Invoice ${invoiceRow.invoice_display_number ?? invoiceRow.invoice_number ?? invoiceRow.id}`;

  return {
    displayName,
    email: nonEmpty(customerRow?.email) ?? nonEmpty(invoiceRow.billing_email),
    phone: nonEmpty(customerRow?.phone) ?? nonEmpty(invoiceRow.billing_phone),
    billingAddressLine1:
      nonEmpty(customerRow?.billing_address_line1) ?? nonEmpty(invoiceRow.billing_address_line1),
    billingCity: nonEmpty(customerRow?.billing_city) ?? nonEmpty(invoiceRow.billing_city),
    billingState: nonEmpty(customerRow?.billing_state) ?? nonEmpty(invoiceRow.billing_state),
    billingZip: nonEmpty(customerRow?.billing_zip) ?? nonEmpty(invoiceRow.billing_zip),
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

  // Candidate query: issued invoices not yet synced (or previously errored).
  const { data: candidateRows, error: candidateError } = await supabase
    .from("internal_invoices")
    .select("id")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("status", "issued")
    .or("qbo_sync_status.is.null,qbo_sync_status.eq.error");

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
