import { preferredInvoiceReference } from "@/lib/utils/display-references";
import { createQboPayment, findQboPaymentsLinkedToInvoice, getQboInvoicePaymentContext } from "./qbo-api-client";
import { getValidQboAccessToken } from "./qbo-connection";
import { getQboBaseUrl } from "./qbo-env";
import { syncInvoiceToQbo } from "./qbo-sync";

export type QboPaymentSyncResult = {
  paymentId: string;
  status: "synced" | "skipped" | "error";
  qboPaymentId?: string;
  error?: string;
};

export function normalizeQboPaymentRefNum(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  if (normalized.length <= 21) return normalized;
  return `ES-${normalized.slice(-18)}`;
}

/**
 * When the QBO invoice balance is already settled, the payment may exist in QBO
 * without our record of it — keyed in manually by the bookkeeper, or created by a
 * prior sync whose qbo_payment_id write failed. Adopting that payment (instead of
 * failing forever on the balance guard) keeps the ledgers reconciled without
 * creating a duplicate. Adoption requires an exact amount match and either a
 * matching payment reference or a single unambiguous candidate.
 */
async function findAdoptableQboPaymentId(params: {
  supabase: any;
  invoiceRowId: string;
  qboInvoiceId: string;
  customerRef: string;
  accessToken: string;
  realmId: string;
  paymentAmount: number;
  receivedReference: unknown;
}): Promise<string | null> {
  const linked = await findQboPaymentsLinkedToInvoice({
    accessToken: params.accessToken,
    realmId: params.realmId,
    baseUrl: getQboBaseUrl(),
    customerRef: params.customerRef,
    invoiceId: params.qboInvoiceId,
  });
  if (!linked.length) return null;

  const { data: siblings, error: siblingError } = await params.supabase
    .from("internal_invoice_payments")
    .select("qbo_payment_id")
    .eq("invoice_id", params.invoiceRowId)
    .not("qbo_payment_id", "is", null);
  if (siblingError) throw new Error(`Failed to load adopted QBO payment references: ${siblingError.message ?? "unknown error"}`);
  const alreadyAdopted = new Set((siblings ?? []).map((row: any) => String(row.qbo_payment_id)));

  const candidates = linked.filter((payment) =>
    !alreadyAdopted.has(payment.id) && Math.abs(payment.appliedToInvoiceAmount - params.paymentAmount) < 0.005,
  );
  if (!candidates.length) return null;

  const expectedRef = normalizeQboPaymentRefNum(params.receivedReference);
  // A candidate carrying a reference that contradicts ours is a different
  // real-world payment; adopting it would hide a genuine discrepancy.
  const compatible = expectedRef
    ? candidates.filter((payment) => !payment.paymentRefNum || payment.paymentRefNum === expectedRef)
    : candidates;
  const refMatches = expectedRef ? compatible.filter((payment) => payment.paymentRefNum === expectedRef) : [];
  if (refMatches.length === 1) return refMatches[0].id;
  if (compatible.length === 1) return compatible[0].id;
  return null;
}

async function updatePaymentSyncFields(supabase: any, paymentId: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from("internal_invoice_payments").update(patch).eq("id", paymentId);
  if (error) throw new Error(`Failed to persist QBO payment sync status: ${error.message ?? "unknown error"}`);
}

export async function syncPaymentToQbo(params: {
  supabase: any;
  accountOwnerUserId: string;
  paymentId: string;
}): Promise<QboPaymentSyncResult> {
  const { supabase, accountOwnerUserId, paymentId } = params;
  try {
    const { data: payment, error: paymentError } = await supabase
      .from("internal_invoice_payments")
      .select("*")
      .eq("id", paymentId)
      .eq("account_owner_user_id", accountOwnerUserId)
      .maybeSingle();
    if (paymentError) throw new Error(paymentError.message);
    if (!payment) return { paymentId, status: "skipped", error: "Payment not found" };
    if (payment.payment_status !== "recorded") {
      return { paymentId, status: "skipped", error: `Payment status is '${payment.payment_status}'` };
    }
    if (payment.qbo_payment_id) {
      return { paymentId, status: "synced", qboPaymentId: String(payment.qbo_payment_id) };
    }

    const token = await getValidQboAccessToken({ supabase, accountOwnerUserId });
    if (!token) {
      const message = "QuickBooks is not connected. Reconnect QuickBooks, then retry this payment.";
      await updatePaymentSyncFields(supabase, paymentId, { qbo_sync_status: "failed", qbo_sync_error: message });
      return { paymentId, status: "error", error: message };
    }

    let { data: invoice, error: invoiceError } = await supabase
      .from("internal_invoices")
      .select("id, invoice_display_number, invoice_number, qbo_invoice_id, qbo_customer_id")
      .eq("id", payment.invoice_id)
      .eq("account_owner_user_id", accountOwnerUserId)
      .maybeSingle();
    if (invoiceError) throw new Error(invoiceError.message);
    if (!invoice) return { paymentId, status: "skipped", error: "Invoice not found" };

    if (!invoice.qbo_invoice_id || !invoice.qbo_customer_id) {
      const invoiceResult = await syncInvoiceToQbo({
        supabase,
        accountOwnerUserId,
        invoiceId: String(payment.invoice_id),
      });
      if (invoiceResult.status !== "synced") {
        throw new Error(invoiceResult.error || "Invoice must sync before its payment");
      }
      const refreshed = await supabase
        .from("internal_invoices")
        .select("id, invoice_display_number, invoice_number, qbo_invoice_id, qbo_customer_id")
        .eq("id", payment.invoice_id)
        .eq("account_owner_user_id", accountOwnerUserId)
        .maybeSingle();
      invoice = refreshed.data;
      if (refreshed.error) throw new Error(refreshed.error.message);
    }
    if (!invoice?.qbo_invoice_id || !invoice?.qbo_customer_id) {
      throw new Error("QBO invoice or customer reference is unavailable");
    }
    // QBO's internal record id (e.g. 4548) never appears in the QuickBooks UI;
    // operators can only find the invoice by its number, so errors must use that.
    const invoiceLabel = preferredInvoiceReference({
      invoiceDisplayNumber: invoice.invoice_display_number,
      invoiceNumber: invoice.invoice_number,
      invoiceId: String(invoice.qbo_invoice_id ?? ""),
    });

    const qboInvoice = await getQboInvoicePaymentContext({
      accessToken: token.accessToken,
      realmId: token.realmId,
      baseUrl: getQboBaseUrl(),
      invoiceId: String(invoice.qbo_invoice_id),
    });
    if (!qboInvoice?.id) throw new Error(`QuickBooks invoice ${invoiceLabel} no longer exists in QuickBooks.`);
    if (!qboInvoice.customerRef) throw new Error(`QuickBooks invoice ${invoiceLabel} has no customer reference.`);
    const paymentAmount = Number(payment.amount_cents ?? 0) / 100;
    if (qboInvoice.balance + 0.005 < paymentAmount) {
      let adoptedQboPaymentId: string | null = null;
      let adoptionLookupFailed = false;
      try {
        adoptedQboPaymentId = await findAdoptableQboPaymentId({
          supabase,
          invoiceRowId: String(invoice.id),
          qboInvoiceId: String(invoice.qbo_invoice_id),
          customerRef: qboInvoice.customerRef,
          accessToken: token.accessToken,
          realmId: token.realmId,
          paymentAmount,
          receivedReference: payment.received_reference,
        });
      } catch (error) {
        adoptionLookupFailed = true;
        console.warn("QBO payment adoption lookup failed", {
          paymentId,
          invoiceId: String(invoice.id),
          message: error instanceof Error ? error.message : "unknown_error",
        });
      }
      if (adoptedQboPaymentId) {
        await updatePaymentSyncFields(supabase, paymentId, {
          qbo_sync_status: "synced",
          qbo_payment_id: adoptedQboPaymentId,
          qbo_last_synced_at: new Date().toISOString(),
          qbo_sync_error: null,
        });
        return { paymentId, status: "synced", qboPaymentId: adoptedQboPaymentId };
      }
      const adoptionHint = adoptionLookupFailed
        ? "The automatic QuickBooks payment lookup could not run — retry, and check the QuickBooks connection if this persists."
        : `No matching QuickBooks payment was found to link automatically — open invoice ${invoiceLabel} in QuickBooks and review what settled it.`;
      throw new Error(`QuickBooks invoice ${invoiceLabel} has an open balance of $${qboInvoice.balance.toFixed(2)}, less than this $${paymentAmount.toFixed(2)} payment. ${adoptionHint}`);
    }

    await updatePaymentSyncFields(supabase, paymentId, {
      qbo_sync_status: "pending",
      qbo_sync_error: null,
    });
    const synced = await createQboPayment({
      accessToken: token.accessToken,
      realmId: token.realmId,
      baseUrl: getQboBaseUrl(),
      requestId: `espay-${paymentId}`,
      payment: {
        customerRef: qboInvoice.customerRef,
        invoiceRef: String(invoice.qbo_invoice_id),
        amount: paymentAmount,
        txnDate: String(payment.paid_at ?? payment.created_at ?? new Date().toISOString()).slice(0, 10),
        paymentRefNum: normalizeQboPaymentRefNum(payment.received_reference),
        privateNote: [String(payment.notes ?? "").trim(), String(payment.received_reference ?? "").trim() ? `EveryStep payment reference: ${String(payment.received_reference).trim()}` : ""].filter(Boolean).join(" · ") || null,
      },
    });
    await updatePaymentSyncFields(supabase, paymentId, {
      qbo_sync_status: "synced",
      qbo_payment_id: synced.id,
      qbo_last_synced_at: new Date().toISOString(),
      qbo_sync_error: null,
    });
    return { paymentId, status: "synced", qboPaymentId: synced.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown QBO payment sync error";
    try {
      await updatePaymentSyncFields(supabase, paymentId, { qbo_sync_status: "failed", qbo_sync_error: message });
    } catch {
      // Payment recording remains authoritative even when downstream accounting fails.
    }
    return { paymentId, status: "error", error: message };
  }
}
