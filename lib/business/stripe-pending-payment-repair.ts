import type Stripe from "stripe";
import { getStripeServerClient } from "@/lib/business/platform-billing-stripe";
import { resolveTenantStripeConnectReadiness } from "@/lib/business/tenant-stripe-connect-readiness";
import { recordTenantInvoicePaymentFromCheckoutSession } from "@/lib/business/tenant-invoice-stripe-webhooks";
import { autoSyncRecordedPaymentToQbo } from "@/lib/qbo/qbo-payment-auto-sync";
import { deliverInternalPaymentReceivedEmail } from "@/lib/payments/payment-received-email";

function clean(value: unknown) { return String(value ?? "").trim(); }

export async function repairVerifiedStripePendingPayment(params: {
  admin: any;
  accountOwnerUserId: string;
  paymentId: string;
  stripe?: Stripe;
  syncQbo?: typeof autoSyncRecordedPaymentToQbo;
  sendReceipt?: typeof deliverInternalPaymentReceivedEmail;
}) {
  const ownerId = clean(params.accountOwnerUserId);
  const paymentId = clean(params.paymentId);
  if (!ownerId || !paymentId) return { repaired: false, reason: "invalid_request" } as const;

  const { data: selected, error } = await params.admin.from("internal_invoice_payments")
    .select("id, account_owner_user_id, invoice_id, job_id, amount_cents, payment_status, processor_name, payment_method, stripe_checkout_session_id")
    .eq("id", paymentId).eq("account_owner_user_id", ownerId).maybeSingle();
  if (error) throw new Error(`Failed to load pending payment: ${error.message ?? "unknown error"}`);
  if (!selected?.id || selected.payment_status !== "pending" || selected.processor_name !== "stripe" || selected.payment_method !== "card_stripe_online" || !clean(selected.stripe_checkout_session_id)) {
    return { repaired: false, reason: "payment_not_repairable" } as const;
  }

  const readiness = await resolveTenantStripeConnectReadiness(ownerId, params.admin);
  if (!readiness.isReady || !readiness.connectedAccountId) return { repaired: false, reason: "stripe_connect_not_ready" } as const;
  const stripe = params.stripe ?? getStripeServerClient();

  const { data: candidates, error: candidatesError } = await params.admin.from("internal_invoice_payments")
    .select("id, amount_cents, stripe_checkout_session_id")
    .eq("account_owner_user_id", ownerId).eq("invoice_id", selected.invoice_id)
    .eq("payment_status", "pending").eq("processor_name", "stripe").eq("payment_method", "card_stripe_online")
    .not("stripe_checkout_session_id", "is", null);
  if (candidatesError) throw new Error(`Failed to check duplicate sessions: ${candidatesError.message ?? "unknown error"}`);

  const inspected = await Promise.all((candidates ?? []).map(async (candidate: any) => ({
    candidate,
    session: await stripe.checkout.sessions.retrieve(clean(candidate.stripe_checkout_session_id), {}, { stripeAccount: readiness.connectedAccountId! }),
  })));
  const paid = inspected.filter(({ session }) => session.payment_status === "paid");
  if (paid.length !== 1) return { repaired: false, reason: paid.length > 1 ? "multiple_paid_sessions" : "no_paid_session" } as const;
  const match = paid[0];
  if (clean(match.candidate.id) !== paymentId) return { repaired: false, reason: "selected_session_not_paid" } as const;
  const session = match.session;
  const scoped = clean(session.metadata?.account_owner_user_id) === ownerId
    && clean(session.metadata?.invoice_id) === clean(selected.invoice_id)
    && clean(session.metadata?.job_id) === clean(selected.job_id);
  if (!scoped) return { repaired: false, reason: "metadata_mismatch" } as const;
  if (Number(session.amount_total ?? 0) !== Number(selected.amount_cents ?? 0)) return { repaired: false, reason: "amount_mismatch" } as const;

  const events = await stripe.events.list({ type: "checkout.session.completed", created: { gte: Math.max(Number(session.created ?? 0) - 300, 0) }, limit: 100 }, { stripeAccount: readiness.connectedAccountId });
  const event = events.data.find((candidate) => clean((candidate.data.object as Stripe.Checkout.Session)?.id) === clean(session.id));
  if (!event?.id) return { repaired: false, reason: "original_event_not_found" } as const;

  const result = await recordTenantInvoicePaymentFromCheckoutSession({ session, eventId: event.id, connectedAccountId: readiness.connectedAccountId, admin: params.admin, stripe });
  if (!result.recorded || !result.paymentId) return { repaired: false, reason: result.reason || "not_recorded" } as const;

  let qboSynced = true;
  let receiptSent = true;
  try { await (params.syncQbo ?? autoSyncRecordedPaymentToQbo)({ paymentId: result.paymentId }); } catch { qboSynced = false; }
  try { await (params.sendReceipt ?? deliverInternalPaymentReceivedEmail)({ paymentId: result.paymentId }); } catch { receiptSent = false; }
  return { repaired: true, paymentId: result.paymentId, qboSynced, receiptSent } as const;
}
