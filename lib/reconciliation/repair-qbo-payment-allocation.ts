import {
  applyUnappliedQboPaymentToInvoice,
  findQboPaymentById,
  getQboInvoicePaymentContext,
  type QboPaymentSnapshot,
} from "@/lib/qbo/qbo-api-client";
import { getValidQboAccessToken } from "@/lib/qbo/qbo-connection";
import { getQboBaseUrl } from "@/lib/qbo/qbo-env";
import { centsMatch } from "@/lib/qbo/qbo-money";

const clean = (value: unknown) => String(value ?? "").trim();

function matchesExpectedAllocation(params: {
  payment: QboPaymentSnapshot;
  qboInvoiceId: string;
  qboCustomerRef: string;
  amount: number;
}) {
  const { payment, qboInvoiceId, qboCustomerRef, amount } = params;
  return payment.linkedInvoiceIds.length === 1
    && payment.linkedInvoiceIds[0] === qboInvoiceId
    && centsMatch(payment.totalAmount, amount)
    && centsMatch(payment.appliedAmountByInvoiceId[qboInvoiceId] ?? 0, amount)
    && payment.customerRef === qboCustomerRef;
}

export type QboPaymentAllocationRepairResult =
  | { status: "repaired" | "already_correct"; paymentId: string; invoiceId: string; jobId: string }
  | { status: "blocked"; error: string };

/**
 * Repair the one QBO mismatch that can be changed without an accounting guess:
 * a payment whose full amount is currently unapplied and whose customer exactly
 * matches the target invoice. A payment linked anywhere else is never moved.
 *
 * The finding is only a pointer. Every payment, invoice, tenant, amount, and QBO
 * fact is re-read live before the external write, then read back again before
 * EveryStep records the repair as successful.
 */
export async function repairUnappliedQboPaymentAllocation(params: {
  admin: any;
  accountOwnerUserId: string;
  findingId: string;
}): Promise<QboPaymentAllocationRepairResult> {
  const { admin } = params;
  const ownerId = clean(params.accountOwnerUserId);
  const findingId = clean(params.findingId);
  if (!ownerId || !findingId) return { status: "blocked", error: "Missing repair scope." };

  const { data: finding, error: findingError } = await admin
    .from("reconciliation_findings")
    .select("id, finding_type, subject_kind, subject_id, external_system, external_id, resolved_at")
    .eq("id", findingId)
    .eq("account_owner_user_id", ownerId)
    .maybeSingle();
  if (findingError) throw new Error(`Failed to load reconciliation finding: ${findingError.message}`);
  if (!finding || finding.resolved_at) return { status: "blocked", error: "This finding is no longer open." };
  if (
    clean(finding.finding_type) !== "payment_allocation_mismatch"
    || clean(finding.subject_kind) !== "payment"
    || clean(finding.external_system) !== "quickbooks"
  ) {
    return { status: "blocked", error: "This finding is not an eligible QuickBooks allocation repair." };
  }

  const { data: payment, error: paymentError } = await admin
    .from("internal_invoice_payments")
    .select("id, invoice_id, job_id, amount_cents, payment_status, qbo_payment_id")
    .eq("id", clean(finding.subject_id))
    .eq("account_owner_user_id", ownerId)
    .maybeSingle();
  if (paymentError) throw new Error(`Failed to load payment: ${paymentError.message}`);
  if (!payment || clean(payment.payment_status) !== "recorded") {
    return { status: "blocked", error: "The EveryStep payment is no longer recorded." };
  }
  const qboPaymentId = clean(payment.qbo_payment_id);
  if (!qboPaymentId || qboPaymentId !== clean(finding.external_id)) {
    return { status: "blocked", error: "The stored QuickBooks payment link changed after this finding was created." };
  }

  const { data: invoice, error: invoiceError } = await admin
    .from("internal_invoices")
    .select("id, job_id, status, qbo_invoice_id")
    .eq("id", clean(payment.invoice_id))
    .eq("account_owner_user_id", ownerId)
    .maybeSingle();
  if (invoiceError) throw new Error(`Failed to load invoice: ${invoiceError.message}`);
  if (!invoice || clean(invoice.status) !== "issued" || !clean(invoice.qbo_invoice_id)) {
    return { status: "blocked", error: "The target invoice is not an issued QuickBooks-linked invoice." };
  }
  if (clean(invoice.job_id) !== clean(payment.job_id)) {
    return { status: "blocked", error: "Payment and invoice job scope do not agree." };
  }

  const token = await getValidQboAccessToken({ supabase: admin, accountOwnerUserId: ownerId });
  if (!token) return { status: "blocked", error: "QuickBooks must be reconnected before repair." };
  const baseUrl = getQboBaseUrl();
  const qboInvoiceId = clean(invoice.qbo_invoice_id);
  const [qboPayment, qboInvoice] = await Promise.all([
    findQboPaymentById({
      accessToken: token.accessToken,
      realmId: token.realmId,
      baseUrl,
      qboPaymentId,
    }),
    getQboInvoicePaymentContext({
      accessToken: token.accessToken,
      realmId: token.realmId,
      baseUrl,
      invoiceId: qboInvoiceId,
    }),
  ]);
  if (!qboPayment) return { status: "blocked", error: "QuickBooks no longer has this payment." };
  if (!qboInvoice?.id || !qboInvoice.customerRef) {
    return { status: "blocked", error: "QuickBooks no longer has a usable target invoice." };
  }

  const amount = Number(payment.amount_cents ?? 0) / 100;
  const expected = { payment: qboPayment, qboInvoiceId, qboCustomerRef: qboInvoice.customerRef, amount };
  let status: "repaired" | "already_correct" = "already_correct";

  if (!matchesExpectedAllocation(expected)) {
    if (!centsMatch(qboPayment.totalAmount, amount)) {
      return { status: "blocked", error: "QuickBooks payment total does not match EveryStep; no automatic change was made." };
    }
    if (qboPayment.customerRef !== qboInvoice.customerRef) {
      return { status: "blocked", error: "QuickBooks payment and invoice customers differ; no automatic change was made." };
    }
    if (qboPayment.linkedInvoiceIds.length > 0) {
      return { status: "blocked", error: "QuickBooks already applies this payment to a transaction; move it only after accounting review." };
    }
    if (!centsMatch(qboPayment.unappliedAmount, amount)) {
      return { status: "blocked", error: "QuickBooks does not show the full payment as unapplied; no automatic change was made." };
    }
    if (qboInvoice.balance + 0.005 < amount) {
      return { status: "blocked", error: "QuickBooks invoice balance is smaller than this payment; no automatic change was made." };
    }

    await applyUnappliedQboPaymentToInvoice({
      accessToken: token.accessToken,
      realmId: token.realmId,
      baseUrl,
      qboPaymentId,
      syncToken: qboPayment.syncToken,
      customerRef: qboInvoice.customerRef,
      invoiceRef: qboInvoiceId,
      amount,
      requestId: `esrepair-${findingId}`,
    });

    const confirmed = await findQboPaymentById({
      accessToken: token.accessToken,
      realmId: token.realmId,
      baseUrl,
      qboPaymentId,
    });
    if (!confirmed || !matchesExpectedAllocation({ ...expected, payment: confirmed })) {
      throw new Error("QuickBooks accepted the repair but the confirming read-back still disagrees.");
    }
    status = "repaired";
  }

  const nowIso = new Date().toISOString();
  const { data: updatedPayment, error: paymentUpdateError } = await admin
    .from("internal_invoice_payments")
    .update({ qbo_sync_status: "synced", qbo_sync_error: null, qbo_last_synced_at: nowIso })
    .eq("id", clean(payment.id))
    .eq("account_owner_user_id", ownerId)
    .eq("invoice_id", clean(invoice.id))
    .eq("payment_status", "recorded")
    .eq("amount_cents", Number(payment.amount_cents ?? 0))
    .eq("qbo_payment_id", qboPaymentId)
    .select("id")
    .maybeSingle();
  if (paymentUpdateError) throw new Error(`Failed to persist verified QBO repair: ${paymentUpdateError.message}`);
  if (!updatedPayment?.id) {
    throw new Error("The EveryStep payment changed before the verified QuickBooks repair could be persisted.");
  }

  const { error: resolveError } = await admin
    .from("reconciliation_findings")
    .update({
      resolved_at: nowIso,
      resolved_reason: status === "repaired"
        ? "Verified unapplied QuickBooks payment was applied to the expected invoice"
        : "QuickBooks allocation was already correct when re-verified",
    })
    .eq("id", findingId)
    .eq("account_owner_user_id", ownerId)
    .is("resolved_at", null);
  if (resolveError) throw new Error(`Failed to resolve reconciliation finding: ${resolveError.message}`);

  return {
    status,
    paymentId: clean(payment.id),
    invoiceId: clean(invoice.id),
    jobId: clean(invoice.job_id),
  };
}
