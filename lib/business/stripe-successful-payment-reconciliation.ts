/* eslint-disable @typescript-eslint/no-explicit-any */
import type Stripe from "stripe";
import { getStripeServerClient } from "@/lib/business/platform-billing-stripe";
import { resolveTenantStripeConnectReadiness } from "@/lib/business/tenant-stripe-connect-readiness";
import { recordTenantInvoicePaymentFromCheckoutSession } from "@/lib/business/tenant-invoice-stripe-webhooks";
import { upsertInvoicePaymentAllocationForPaymentRow } from "@/lib/business/payment-allocations";
import { autoSyncRecordedPaymentToQbo } from "@/lib/qbo/qbo-payment-auto-sync";
import { deliverInternalPaymentReceivedEmail } from "@/lib/payments/payment-received-email";

const clean = (value: unknown) => String(value ?? "").trim();
export type StripePaymentReconciliationOutcome = "exact_paid_match_reconciled" | "already_reconciled" | "allocation_repaired" | "still_processing" | "not_paid" | "ambiguous_multiple_successes" | "amount_mismatch" | "currency_mismatch" | "connected_account_mismatch" | "invoice_scope_mismatch" | "customer_scope_mismatch" | "invoice_ineligible" | "refunded_or_disputed" | "transient_provider_error" | "blocked_unsafe";
export type StripePaymentReconciliationResult = { outcome: StripePaymentReconciliationOutcome; paymentId?: string; financialMutation: boolean; qboStatus?: "synced" | "pending" };

export async function reconcileStripeSuccessfulPayment(params: { admin: any; accountOwnerUserId: string; paymentId: string; stripe?: Stripe; syncQbo?: typeof autoSyncRecordedPaymentToQbo; sendReceipt?: typeof deliverInternalPaymentReceivedEmail }): Promise<StripePaymentReconciliationResult> {
  const ownerId = clean(params.accountOwnerUserId), paymentId = clean(params.paymentId);
  if (!ownerId || !paymentId) return { outcome: "blocked_unsafe", financialMutation: false };
  const { data: selected, error } = await params.admin.from("internal_invoice_payments").select("id, account_owner_user_id, invoice_id, job_id, amount_cents, payment_status, processor_name, payment_method, stripe_checkout_session_id").eq("id", paymentId).eq("account_owner_user_id", ownerId).maybeSingle();
  if (error) throw new Error(`Failed to load pending payment: ${error.message ?? "unknown error"}`);
  if (!selected?.id) return { outcome: "blocked_unsafe", financialMutation: false };
  if (selected.payment_status === "recorded") {
    const allocation = await upsertInvoicePaymentAllocationForPaymentRow({ supabase: params.admin, paymentId });
    return allocation.ok ? { outcome: allocation.status === "deduped" ? "already_reconciled" : "allocation_repaired", paymentId, financialMutation: false } : { outcome: "blocked_unsafe", paymentId, financialMutation: false };
  }
  if (selected.payment_status !== "pending" || selected.processor_name !== "stripe" || selected.payment_method !== "card_stripe_online" || !clean(selected.stripe_checkout_session_id)) return { outcome: "invoice_ineligible", financialMutation: false };
  const readiness = await resolveTenantStripeConnectReadiness(ownerId, params.admin);
  if (!readiness.isReady || !readiness.connectedAccountId) return { outcome: "connected_account_mismatch", financialMutation: false };
  const stripe = params.stripe ?? getStripeServerClient();
  try {
    const { data: candidates, error: candidateError } = await params.admin.from("internal_invoice_payments").select("id, stripe_checkout_session_id").eq("account_owner_user_id", ownerId).eq("invoice_id", selected.invoice_id).eq("payment_status", "pending").eq("processor_name", "stripe").eq("payment_method", "card_stripe_online").not("stripe_checkout_session_id", "is", null);
    if (candidateError) throw new Error(candidateError.message ?? "candidate lookup failed");
    const inspected = await Promise.all((candidates ?? []).map(async (candidate: any) => ({ candidate, session: await stripe.checkout.sessions.retrieve(clean(candidate.stripe_checkout_session_id), {}, { stripeAccount: readiness.connectedAccountId! }) })));
    const paid = inspected.filter(({ session }) => session.status === "complete" && session.payment_status === "paid");
    if (paid.length > 1) return { outcome: "ambiguous_multiple_successes", financialMutation: false };
    if (!paid.length) return { outcome: inspected.some(({ session }) => session.status === "open") ? "still_processing" : "not_paid", financialMutation: false };
    if (clean(paid[0].candidate.id) !== paymentId) return { outcome: "ambiguous_multiple_successes", financialMutation: false };
    const session = paid[0].session;
    if (session.mode !== "payment" || clean(session.metadata?.account_owner_user_id) !== ownerId || clean(session.metadata?.invoice_id) !== clean(selected.invoice_id) || clean(session.metadata?.job_id) !== clean(selected.job_id)) return { outcome: "invoice_scope_mismatch", financialMutation: false };
    if (Number(session.amount_total ?? 0) !== Number(selected.amount_cents ?? 0)) return { outcome: "amount_mismatch", financialMutation: false };
    if (clean(session.currency).toLowerCase() !== "usd") return { outcome: "currency_mismatch", financialMutation: false };
    const { data: invoice, error: invoiceError } = await params.admin.from("internal_invoices").select("id, job_id, status, billing_email").eq("id", selected.invoice_id).eq("account_owner_user_id", ownerId).maybeSingle();
    if (invoiceError) throw new Error(invoiceError.message ?? "invoice lookup failed");
    if (!invoice?.id || clean(invoice.job_id) !== clean(selected.job_id) || ["void", "cancelled", "canceled"].includes(clean(invoice.status).toLowerCase())) return { outcome: "invoice_ineligible", financialMutation: false };
    const invoiceEmail = clean(invoice.billing_email).toLowerCase(), stripeEmail = clean(session.customer_details?.email || session.customer_email).toLowerCase();
    if (invoiceEmail && stripeEmail && invoiceEmail !== stripeEmail) return { outcome: "customer_scope_mismatch", financialMutation: false };
    const intentId = typeof session.payment_intent === "string" ? clean(session.payment_intent) : clean(session.payment_intent?.id);
    if (!intentId) return { outcome: "blocked_unsafe", financialMutation: false };
    const intent = await stripe.paymentIntents.retrieve(intentId, {}, { stripeAccount: readiness.connectedAccountId });
    if (intent.status !== "succeeded" || Number(intent.amount_received ?? intent.amount ?? 0) !== Number(selected.amount_cents ?? 0) || clean(intent.currency).toLowerCase() !== "usd") return { outcome: "blocked_unsafe", financialMutation: false };
    const chargeId = typeof intent.latest_charge === "string" ? clean(intent.latest_charge) : clean(intent.latest_charge?.id);
    if (!chargeId) return { outcome: "blocked_unsafe", financialMutation: false };
    const charge = await stripe.charges.retrieve(chargeId, {}, { stripeAccount: readiness.connectedAccountId });
    if (!charge.paid || charge.refunded || Number(charge.amount_refunded ?? 0) > 0 || charge.disputed) return { outcome: "refunded_or_disputed", financialMutation: false };
    const events = await stripe.events.list({ type: "checkout.session.completed", created: { gte: Math.max(Number(session.created ?? 0) - 300, 0) }, limit: 100 }, { stripeAccount: readiness.connectedAccountId });
    const event = events.data.find((candidate) => clean((candidate.data.object as Stripe.Checkout.Session)?.id) === clean(session.id));
    if (!event?.id) return { outcome: "blocked_unsafe", financialMutation: false };
    const recorded = await recordTenantInvoicePaymentFromCheckoutSession({ session, eventId: event.id, connectedAccountId: readiness.connectedAccountId, admin: params.admin, stripe });
    const durablePaymentId = clean(recorded.paymentId) || paymentId;
    if (!recorded.recorded && !recorded.paymentId) return { outcome: "blocked_unsafe", financialMutation: false };
    let qboStatus: "synced" | "pending" = "pending";
    try { const qbo = await (params.syncQbo ?? autoSyncRecordedPaymentToQbo)({ paymentId: durablePaymentId }); qboStatus = qbo?.status === "synced" ? "synced" : "pending"; } catch {}
    try { await (params.sendReceipt ?? deliverInternalPaymentReceivedEmail)({ paymentId: durablePaymentId }); } catch {}
    return { outcome: recorded.recorded ? "exact_paid_match_reconciled" : "already_reconciled", paymentId: durablePaymentId, financialMutation: recorded.recorded, qboStatus };
  } catch (error) {
    console.warn("Stripe successful-payment reconciliation deferred", { paymentId, accountOwnerUserId: ownerId, message: error instanceof Error ? error.message : "unknown_error" });
    return { outcome: "transient_provider_error", financialMutation: false };
  }
}

export async function reconcileStaleStripeSuccessfulPayments(params: { admin: any; staleBefore?: Date; limit?: number; stripe?: Stripe }) {
  const staleBefore = params.staleBefore ?? new Date(Date.now() - 15 * 60 * 1000), limit = Math.min(Math.max(Number(params.limit ?? 25), 1), 50);
  const { data, error } = await params.admin.from("internal_invoice_payments").select("id, account_owner_user_id").eq("payment_status", "pending").eq("processor_name", "stripe").eq("payment_method", "card_stripe_online").not("stripe_checkout_session_id", "is", null).lte("created_at", staleBefore.toISOString()).order("created_at", { ascending: true }).limit(limit);
  if (error) throw new Error(`Failed to enumerate stale Stripe payments: ${error.message ?? "unknown error"}`);
  const results: StripePaymentReconciliationResult[] = [];
  for (const row of data ?? []) results.push(await reconcileStripeSuccessfulPayment({ admin: params.admin, accountOwnerUserId: clean(row.account_owner_user_id), paymentId: clean(row.id), stripe: params.stripe }));
  return results;
}
