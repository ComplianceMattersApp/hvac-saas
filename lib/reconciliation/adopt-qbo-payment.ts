import { findQboPaymentById } from "@/lib/qbo/qbo-api-client";
import { getValidQboAccessToken } from "@/lib/qbo/qbo-connection";
import { getQboAvailability, getQboBaseUrl } from "@/lib/qbo/qbo-env";
import {
  claimInvoiceCollectionReservation,
  releaseInvoiceCollectionReservation,
} from "@/lib/business/invoice-collection-reservations";
import { upsertInvoicePaymentAllocationForPaymentRow } from "@/lib/business/payment-allocations";

const clean = (value: unknown) => String(value ?? "").trim();
const toCents = (amount: unknown) => Math.round(Number(amount ?? 0) * 100);

export type QboPaymentAdoptionResult =
  | { status: "adopted"; paymentId: string; invoiceId: string; jobId: string | null; amountCents: number }
  | { status: "blocked"; error: string };

/**
 * Adopt a QuickBooks-side payment into EveryStep from a qbo_payment_unrecorded
 * reconciliation finding — the customer paid through QuickBooks (or a
 * bookkeeper keyed a payment there), so EveryStep still shows a balance due
 * and could double-collect.
 *
 * Mirrors the Stripe identity-repair lane's discipline: every fact is
 * re-verified against QuickBooks LIVE at adoption time — the stored finding is
 * only a pointer, never trusted. Any surprise blocks with no writes. The
 * created payment row carries qbo_payment_id + qbo_sync_status='synced' so the
 * payment push sweep can never send a duplicate to QuickBooks.
 */
export async function adoptUnrecordedQboPayment(params: {
  admin: any;
  accountOwnerUserId: string;
  findingId: string;
  recordedByUserId: string;
}): Promise<QboPaymentAdoptionResult> {
  const { admin } = params;
  const ownerId = clean(params.accountOwnerUserId);
  const findingId = clean(params.findingId);
  const recordedByUserId = clean(params.recordedByUserId);
  if (!ownerId || !findingId || !recordedByUserId) return { status: "blocked", error: "Missing adoption scope." };
  if (!getQboAvailability().available) return { status: "blocked", error: "QuickBooks is not configured for this environment." };

  const { data: finding, error: findingError } = await admin
    .from("reconciliation_findings")
    .select("id, finding_type, subject_id, external_id, external_system, amount_cents, job_id, resolved_at")
    .eq("id", findingId)
    .eq("account_owner_user_id", ownerId)
    .maybeSingle();
  if (findingError) throw new Error(`Failed to load reconciliation finding: ${findingError.message ?? "unknown error"}`);
  if (!finding?.id || finding.resolved_at) return { status: "blocked", error: "This finding is no longer open." };
  if (finding.external_system !== "quickbooks" || clean(finding.finding_type) !== "qbo_payment_unrecorded") {
    return { status: "blocked", error: "This finding is not eligible for QuickBooks payment adoption." };
  }

  const qboPaymentId = clean(finding.external_id);
  if (!/^\d+$/.test(qboPaymentId)) return { status: "blocked", error: "The QuickBooks payment id is invalid." };

  const { data: invoice, error: invoiceError } = await admin
    .from("internal_invoices")
    .select("id, job_id, status, total_cents, qbo_invoice_id, invoice_display_number, invoice_number")
    .eq("id", clean(finding.subject_id))
    .eq("account_owner_user_id", ownerId)
    .maybeSingle();
  if (invoiceError) throw new Error(`Failed to load the invoice: ${invoiceError.message ?? "unknown error"}`);
  if (!invoice?.id) return { status: "blocked", error: "The invoice no longer exists." };
  if (clean(invoice.status).toLowerCase() !== "issued") {
    return { status: "blocked", error: `The invoice is '${clean(invoice.status)}', not issued — resolve the invoice state first.` };
  }
  const qboInvoiceId = clean(invoice.qbo_invoice_id);
  if (!qboInvoiceId) return { status: "blocked", error: "The invoice is not linked to QuickBooks." };

  // Live QuickBooks truth — the finding may be hours old.
  const token = await getValidQboAccessToken({ supabase: admin, accountOwnerUserId: ownerId });
  if (!token) return { status: "blocked", error: "QuickBooks is not connected." };
  const qboPayment = await findQboPaymentById({
    accessToken: token.accessToken,
    realmId: token.realmId,
    baseUrl: getQboBaseUrl(),
    qboPaymentId,
  });
  if (!qboPayment) return { status: "blocked", error: "QuickBooks no longer has this payment." };
  if (!qboPayment.linkedInvoiceIds.includes(qboInvoiceId)) {
    return { status: "blocked", error: "The QuickBooks payment is no longer applied to this invoice." };
  }
  const appliedCents = toCents(
    qboPayment.appliedAmountByInvoiceId?.[qboInvoiceId]
      ?? (qboPayment.linkedInvoiceIds.length === 1 ? qboPayment.totalAmount : 0),
  );
  if (appliedCents <= 0) return { status: "blocked", error: "QuickBooks shows nothing applied to this invoice." };
  if (Number(finding.amount_cents ?? 0) !== appliedCents) {
    return { status: "blocked", error: "The applied amount changed since detection — run Check for discrepancies and retry from the fresh finding." };
  }

  // Never adopt the same QuickBooks payment onto the same invoice twice.
  const { data: existingRows, error: existingError } = await admin
    .from("internal_invoice_payments")
    .select("id")
    .eq("account_owner_user_id", ownerId)
    .eq("invoice_id", clean(invoice.id))
    .eq("qbo_payment_id", qboPaymentId)
    .limit(1);
  if (existingError) throw new Error(`Failed to check for an existing adoption: ${existingError.message ?? "unknown error"}`);
  if ((existingRows ?? []).length > 0) return { status: "blocked", error: "This QuickBooks payment is already recorded in EveryStep." };

  // Soft overpay check; the database balance guard remains the hard backstop.
  const { data: recordedRows, error: recordedError } = await admin
    .from("internal_invoice_payments")
    .select("amount_cents")
    .eq("account_owner_user_id", ownerId)
    .eq("invoice_id", clean(invoice.id))
    .eq("payment_status", "recorded");
  if (recordedError) throw new Error(`Failed to read recorded payments: ${recordedError.message ?? "unknown error"}`);
  const recordedCents = (recordedRows ?? []).reduce((sum: number, row: any) => sum + (Number(row.amount_cents ?? 0) || 0), 0);
  if (recordedCents + appliedCents > Number(invoice.total_cents ?? 0)) {
    return { status: "blocked", error: "Adopting this payment would exceed the invoice total — reconcile the amounts first." };
  }

  const jobId = clean(invoice.job_id) || null;
  const reservationKey = `manual_off_platform:qbo-adoption-${qboPaymentId}-${clean(invoice.id)}`;
  const claimed = await claimInvoiceCollectionReservation({
    supabase: admin,
    accountOwnerUserId: ownerId,
    invoiceId: clean(invoice.id),
    sourceKind: "manual_off_platform",
    reservationKey,
    amountCents: appliedCents,
    ttlSeconds: 300,
  });
  if (!claimed) return { status: "blocked", error: "Another payment collection is already in progress for this invoice." };

  let paymentId = "";
  try {
    const { data: inserted, error: insertError } = await admin
      .from("internal_invoice_payments")
      .insert({
        account_owner_user_id: ownerId,
        invoice_id: clean(invoice.id),
        job_id: jobId,
        payment_status: "recorded",
        // QuickBooks' portal takes card and bank; the read does not say which,
        // so 'other' + the notes name the channel rather than guessing.
        payment_method: "other",
        amount_cents: appliedCents,
        paid_at: qboPayment.txnDate ? `${qboPayment.txnDate}T12:00:00.000Z` : new Date().toISOString(),
        received_reference: `QBO-${qboPaymentId}`,
        notes: `Collected through QuickBooks (QBO payment ${qboPaymentId}). Adopted from reconciliation.`,
        recorded_by_user_id: recordedByUserId,
        collection_reservation_key: reservationKey,
        qbo_payment_id: qboPaymentId,
        qbo_sync_status: "synced",
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message ?? "Payment insert failed");
    paymentId = clean(inserted?.id);
    if (!paymentId) throw new Error("Payment insert returned no id");
  } catch (error) {
    try {
      await releaseInvoiceCollectionReservation({
        supabase: admin,
        accountOwnerUserId: ownerId,
        invoiceId: clean(invoice.id),
        reservationKey,
      });
    } catch { /* reservation expires on its own */ }
    throw error instanceof Error ? error : new Error("Payment insert failed");
  }

  try {
    await releaseInvoiceCollectionReservation({
      supabase: admin,
      accountOwnerUserId: ownerId,
      invoiceId: clean(invoice.id),
      reservationKey,
    });
  } catch { /* short-lived lock; expires on its own */ }

  const allocationResult = await upsertInvoicePaymentAllocationForPaymentRow({
    supabase: admin,
    paymentRow: {
      id: paymentId,
      account_owner_user_id: ownerId,
      invoice_id: clean(invoice.id),
      amount_cents: appliedCents,
      payment_status: "recorded",
    },
  });
  if (!allocationResult.ok) {
    console.warn("QBO payment adoption allocation dual-write failed after payment row success", {
      paymentId,
      invoiceId: clean(invoice.id),
      allocationStatus: allocationResult.allocationStatus,
      allocationReason: allocationResult.reason,
    });
  }

  const { error: resolveError } = await admin
    .from("reconciliation_findings")
    .update({ resolved_at: new Date().toISOString(), resolved_reason: "QuickBooks payment adopted into EveryStep" })
    .eq("id", findingId)
    .eq("account_owner_user_id", ownerId)
    .is("resolved_at", null);
  if (resolveError) throw new Error(`Payment adopted, but the finding could not be resolved: ${resolveError.message ?? "unknown error"}`);

  return { status: "adopted", paymentId, invoiceId: clean(invoice.id), jobId, amountCents: appliedCents };
}
