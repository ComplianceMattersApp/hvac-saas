import { createQboPayment } from "./qbo-api-client";
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
      .select("id, qbo_invoice_id, qbo_customer_id")
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
        .select("id, qbo_invoice_id, qbo_customer_id")
        .eq("id", payment.invoice_id)
        .eq("account_owner_user_id", accountOwnerUserId)
        .maybeSingle();
      invoice = refreshed.data;
      if (refreshed.error) throw new Error(refreshed.error.message);
    }
    if (!invoice?.qbo_invoice_id || !invoice?.qbo_customer_id) {
      throw new Error("QBO invoice or customer reference is unavailable");
    }

    await updatePaymentSyncFields(supabase, paymentId, {
      qbo_sync_status: "pending",
      qbo_sync_error: null,
    });
    const synced = await createQboPayment({
      accessToken: token.accessToken,
      realmId: token.realmId,
      baseUrl: getQboBaseUrl(),
      payment: {
        customerRef: String(invoice.qbo_customer_id),
        invoiceRef: String(invoice.qbo_invoice_id),
        amount: Number(payment.amount_cents ?? 0) / 100,
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
