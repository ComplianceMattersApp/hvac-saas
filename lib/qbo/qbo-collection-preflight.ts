import { preferredInvoiceReference } from "@/lib/utils/display-references";
import { getQboInvoicePaymentContext } from "./qbo-api-client";
import { getValidQboAccessToken } from "./qbo-connection";
import { getQboAvailability, getQboBaseUrl } from "./qbo-env";

export type QboCollectionPreflightResult =
  | { blocked: false; checked: boolean }
  | { blocked: true; qboBalanceCents: number | null; message: string };

/**
 * Double-collection guard: refuses to initiate a charge or checkout when
 * QuickBooks shows the invoice with less open balance than the amount about to
 * be collected — meaning money was already collected outside EveryStep
 * (QuickBooks Payments, a manually keyed payment, a credit).
 *
 * Invoices that were never synced to QBO proceed without a QBO gate. Once an
 * invoice has a QBO identity, however, the check fails closed if the connection
 * or lookup is unavailable: an outage must not hide a payment posted outside
 * EveryStep and permit a second customer charge.
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

  // This deployment has no QBO integration to consult. Tenant-specific
  // connection/read failures still fail closed below once QBO is configured.
  if (!getQboAvailability().available) return { blocked: false, checked: false };

  let invoice: any = null;
  try {
    const result = await params.supabase
      .from("internal_invoices")
      .select("id, invoice_display_number, invoice_number, qbo_invoice_id")
      .eq("id", invoiceId)
      .eq("account_owner_user_id", accountOwnerUserId)
      .maybeSingle();
    if (result.error) throw result.error;
    invoice = result.data;
  } catch (error) {
    return {
      blocked: true,
      qboBalanceCents: null,
      message: `Could not verify whether this invoice is linked to QuickBooks. Collection is paused to prevent a duplicate charge. ${error instanceof Error ? error.message : "Unknown lookup error"}`,
    };
  }

  if (!invoice?.qbo_invoice_id) return { blocked: false, checked: false };

  const label = preferredInvoiceReference({
    invoiceDisplayNumber: invoice.invoice_display_number,
    invoiceNumber: invoice.invoice_number,
    invoiceId: String(invoice.qbo_invoice_id ?? ""),
  });

  try {
    const token = await getValidQboAccessToken({ supabase: params.supabase, accountOwnerUserId });
    if (!token) {
      return {
        blocked: true,
        qboBalanceCents: null,
        message: `QuickBooks must be reconnected before collecting invoice ${label}; its current balance could not be verified.`,
      };
    }

    const qboInvoice = await getQboInvoicePaymentContext({
      accessToken: token.accessToken,
      realmId: token.realmId,
      baseUrl: getQboBaseUrl(),
      invoiceId: String(invoice.qbo_invoice_id),
    });
    if (!qboInvoice?.id) {
      return {
        blocked: true,
        qboBalanceCents: null,
        message: `QuickBooks invoice ${label} could not be found. Collection is paused until the invoice link is reconciled.`,
      };
    }

    const qboBalanceCents = Math.round(Number(qboInvoice.balance ?? 0) * 100);
    if (qboBalanceCents >= collectAmountCents) return { blocked: false, checked: true };

    return {
      blocked: true,
      qboBalanceCents,
      message: `QuickBooks shows invoice ${label} with only $${(qboBalanceCents / 100).toFixed(2)} left to collect, but this request is for $${(collectAmountCents / 100).toFixed(2)}. A payment may already exist outside EveryStep — reconcile in QuickBooks before collecting again.`,
    };
  } catch (error) {
    console.warn("QBO collection preflight could not run; collection blocked", {
      accountOwnerUserId,
      invoiceId,
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return {
      blocked: true,
      qboBalanceCents: null,
      message: `QuickBooks balance verification failed for invoice ${label}. Collection is paused to prevent a duplicate charge. ${error instanceof Error ? error.message : "Unknown QuickBooks error"}`,
    };
  }
}
