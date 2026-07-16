import type Stripe from "stripe";
import { getStripeServerClient } from "@/lib/business/platform-billing-stripe";
import { resolveTenantStripeConnectReadiness } from "@/lib/business/tenant-stripe-connect-readiness";

function clean(value: unknown) { return String(value ?? "").trim(); }

export async function closeVerifiedAbandonedStripeSession(params: {
  admin: any;
  accountOwnerUserId: string;
  paymentId: string;
  stripe?: Stripe;
}) {
  const ownerId = clean(params.accountOwnerUserId);
  const paymentId = clean(params.paymentId);
  if (!ownerId || !paymentId) return { closed: false, reason: "invalid_request" } as const;

  const { data: pending, error } = await params.admin.from("internal_invoice_payments")
    .select("id, invoice_id, job_id, amount_cents, created_at, payment_status, processor_name, payment_method, stripe_checkout_session_id")
    .eq("id", paymentId).eq("account_owner_user_id", ownerId).maybeSingle();
  if (error) throw new Error(`Failed to load pending payment: ${error.message ?? "unknown error"}`);
  if (!pending?.id || pending.payment_status !== "pending" || pending.processor_name !== "stripe" || pending.payment_method !== "card_stripe_online") {
    return { closed: false, reason: "payment_not_closeable" } as const;
  }
  const sessionId = clean(pending.stripe_checkout_session_id);
  if (!sessionId) return { closed: false, reason: "missing_session" } as const;
  const createdAt = new Date(clean(pending.created_at)).getTime();
  if (!Number.isFinite(createdAt) || createdAt > Date.now() - 15 * 60 * 1000) return { closed: false, reason: "session_not_stale" } as const;

  const { data: recorded, error: recordedError } = await params.admin.from("internal_invoice_payments")
    .select("id").eq("account_owner_user_id", ownerId).eq("invoice_id", pending.invoice_id)
    .eq("payment_status", "recorded").limit(1);
  if (recordedError) throw new Error(`Failed to verify recorded payment: ${recordedError.message ?? "unknown error"}`);
  if (!(recorded ?? []).length) return { closed: false, reason: "invoice_has_no_recorded_payment" } as const;

  const readiness = await resolveTenantStripeConnectReadiness(ownerId, params.admin);
  if (!readiness.isReady || !readiness.connectedAccountId) return { closed: false, reason: "stripe_connect_not_ready" } as const;
  const stripe = params.stripe ?? getStripeServerClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {}, { stripeAccount: readiness.connectedAccountId });
  const scoped = clean(session.metadata?.account_owner_user_id) === ownerId
    && clean(session.metadata?.invoice_id) === clean(pending.invoice_id)
    && clean(session.metadata?.job_id) === clean(pending.job_id);
  if (!scoped) return { closed: false, reason: "metadata_mismatch" } as const;
  if (Number(session.amount_total ?? 0) !== Number(pending.amount_cents ?? 0)) return { closed: false, reason: "amount_mismatch" } as const;
  if (session.status !== "open" || session.payment_status === "paid") return { closed: false, reason: "session_not_abandoned" } as const;

  await stripe.checkout.sessions.expire(sessionId, {}, { stripeAccount: readiness.connectedAccountId });
  const { data: updated, error: updateError } = await params.admin.from("internal_invoice_payments")
    .update({ payment_status: "failed", notes: `Abandoned Stripe checkout session ${sessionId} expired after another payment was recorded.` })
    .eq("id", paymentId).eq("account_owner_user_id", ownerId).eq("payment_status", "pending").select("id").maybeSingle();
  if (updateError) throw new Error(`Failed to close abandoned pending payment: ${updateError.message ?? "unknown error"}`);
  if (!updated?.id) return { closed: false, reason: "pending_row_changed" } as const;
  return { closed: true, paymentId } as const;
}
