import { preferredInvoiceReference } from "@/lib/utils/display-references";
import { getQboInvoicePaymentContext } from "./qbo-api-client";
import { getValidQboAccessToken } from "./qbo-connection";
import { getQboAvailability, getQboBaseUrl } from "./qbo-env";

export type QboCollectionPreflightResult =
  | { blocked: false; checked: boolean }
  | { blocked: true; qboBalanceCents: number; message: string };

/**
 * Double-collection guard: refuses to initiate a charge or checkout when
 * QuickBooks shows the invoice with less open balance than the amount about to
 * be collected — meaning money was already collected outside EveryStep
 * (QuickBooks Payments, a manually keyed payment, a credit).
 *
 * Fails OPEN by design: QBO not configured/connected, invoice never synced, or
 * a lookup failure all allow collection to proceed. An accounting outage must
 * never block field payment collection; only a confirmed "QuickBooks says this
 * is already settled" blocks, because that is the double-charge scenario.
 */
export async function checkQboBalanceBeforeCollection(params: {
  supabase: any;
  accountOwnerUserId: string;
  invoiceId: string;
  collectAmountCents: number;
}): Promise<QboCollectionPreflightResult> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  const invoiceId = String(params.invoiceId ?? "").trim();
  const collectAmountCents = Math.round(Number(params.collectAmountCents ?? 0));
  if (!accountOwnerUserId || !invoiceId || collectAmountCents <= 0) {
    return { blocked: false, checked: false };
  }

  try {
    if (!getQboAvailability().available) return { blocked: false, checked: false };

    const { data: invoice, error } = await params.supabase
      .from("internal_invoices")
      .select("id, invoice_display_number, invoice_number, qbo_invoice_id")
      .eq("id", invoiceId)
      .eq("account_owner_user_id", accountOwnerUserId)
      .maybeSingle();
    if (error || !invoice?.qbo_invoice_id) return { blocked: false, checked: false };

    const token = await getValidQboAccessToken({ supabase: params.supabase, accountOwnerUserId });
    if (!token) return { blocked: false, checked: false };

    const qboInvoice = await getQboInvoicePaymentContext({
      accessToken: token.accessToken,
      realmId: token.realmId,
      baseUrl: getQboBaseUrl(),
      invoiceId: String(invoice.qbo_invoice_id),
    });
    if (!qboInvoice?.id) return { blocked: false, checked: false };

    const qboBalanceCents = Math.round(Number(qboInvoice.balance ?? 0) * 100);
    if (qboBalanceCents >= collectAmountCents) return { blocked: false, checked: true };

    const label = preferredInvoiceReference({
      invoiceDisplayNumber: invoice.invoice_display_number,
      invoiceNumber: invoice.invoice_number,
      invoiceId: String(invoice.qbo_invoice_id ?? ""),
    });
    return {
      blocked: true,
      qboBalanceCents,
      message: `QuickBooks shows invoice ${label} with only $${(qboBalanceCents / 100).toFixed(2)} left to collect, but this request is for $${(collectAmountCents / 100).toFixed(2)}. A payment may already exist outside EveryStep — reconcile in QuickBooks before collecting again.`,
    };
  } catch (error) {
    console.warn("QBO collection preflight could not run; proceeding without it", {
      accountOwnerUserId,
      invoiceId,
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return { blocked: false, checked: false };
  }
}
