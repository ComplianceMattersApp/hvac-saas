import type Stripe from "stripe";
import { getStripeServerClient } from "@/lib/business/platform-billing-stripe";
import { resolveTenantStripeConnectReadiness } from "@/lib/business/tenant-stripe-connect-readiness";

type PendingPaymentRow = {
  id: string;
  invoice_id: string;
  job_id: string;
  amount_cents: number;
  created_at: string;
  stripe_checkout_session_id: string;
};

export type StripePendingPaymentInspection = {
  paymentId: string;
  invoiceId: string;
  jobId: string;
  invoiceNumber: string;
  billingName: string;
  amountCents: number;
  createdAt: string;
  checkoutSessionSuffix: string;
  paymentIntentSuffix: string | null;
  chargeSuffix: string | null;
  checkoutStatus: string;
  paymentStatus: string;
  diagnosis: "succeeded_match" | "still_open" | "not_paid" | "metadata_mismatch" | "amount_mismatch" | "retrieve_error";
  detail: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function suffix(value: unknown) {
  const normalized = clean(value);
  return normalized ? normalized.slice(-8) : null;
}

function stripeId(value: string | Stripe.PaymentIntent | null) {
  return typeof value === "string" ? clean(value) : clean(value?.id);
}

export async function inspectStaleStripePendingPayments(params: {
  admin: any;
  accountOwnerUserId: string;
  stripe?: Stripe;
  limit?: number;
  staleBefore?: Date;
}): Promise<StripePendingPaymentInspection[]> {
  const ownerId = clean(params.accountOwnerUserId);
  if (!ownerId) return [];

  const staleBefore = params.staleBefore ?? new Date(Date.now() - 15 * 60 * 1000);
  const limit = Math.min(Math.max(Number(params.limit ?? 25), 1), 50);
  const { data, error } = await params.admin
    .from("internal_invoice_payments")
    .select("id, invoice_id, job_id, amount_cents, created_at, stripe_checkout_session_id")
    .eq("account_owner_user_id", ownerId)
    .eq("payment_status", "pending")
    .eq("processor_name", "stripe")
    .eq("payment_method", "card_stripe_online")
    .not("stripe_checkout_session_id", "is", null)
    .lte("created_at", staleBefore.toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to load pending Stripe payments: ${error.message ?? "unknown error"}`);
  const rows = (data ?? []) as PendingPaymentRow[];
  if (!rows.length) return [];

  const readiness = await resolveTenantStripeConnectReadiness(ownerId, params.admin);
  if (!readiness.connectedAccountId) throw new Error("Tenant Stripe connected account is not configured.");
  const stripe = params.stripe ?? getStripeServerClient();
  const invoiceIds = [...new Set(rows.map((row) => clean(row.invoice_id)).filter(Boolean))];
  const { data: invoices, error: invoiceError } = await params.admin
    .from("internal_invoices")
    .select("id, invoice_number, billing_name")
    .eq("account_owner_user_id", ownerId)
    .in("id", invoiceIds);
  if (invoiceError) throw new Error(`Failed to load invoice labels: ${invoiceError.message ?? "unknown error"}`);
  const invoiceById = new Map<string, { invoice_number?: string | null; billing_name?: string | null }>(
    (invoices ?? []).map((row: any) => [clean(row.id), row]),
  );

  return Promise.all(rows.map(async (row) => {
    const sessionId = clean(row.stripe_checkout_session_id);
    const invoice = invoiceById.get(clean(row.invoice_id));
    const base = {
      paymentId: clean(row.id), invoiceId: clean(row.invoice_id), jobId: clean(row.job_id),
      invoiceNumber: clean(invoice?.invoice_number) || clean(row.invoice_id),
      billingName: clean(invoice?.billing_name) || "Billing recipient",
      amountCents: Number(row.amount_cents ?? 0), createdAt: clean(row.created_at),
      checkoutSessionSuffix: suffix(sessionId) ?? "unknown",
    };
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {}, { stripeAccount: readiness.connectedAccountId! });
      const paymentIntentId = stripeId(session.payment_intent);
      let chargeId = "";
      if (paymentIntentId) {
        const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {}, { stripeAccount: readiness.connectedAccountId! });
        chargeId = typeof intent.latest_charge === "string" ? clean(intent.latest_charge) : clean(intent.latest_charge?.id);
      }
      const metadataMatches = clean(session.metadata?.account_owner_user_id) === ownerId
        && clean(session.metadata?.invoice_id) === clean(row.invoice_id)
        && clean(session.metadata?.job_id) === clean(row.job_id);
      const amountMatches = Number(session.amount_total ?? 0) === Number(row.amount_cents ?? 0);
      let diagnosis: StripePendingPaymentInspection["diagnosis"] = "not_paid";
      let detail = `Stripe reports checkout ${clean(session.status) || "unknown"} and payment ${clean(session.payment_status) || "unknown"}.`;
      if (!metadataMatches) { diagnosis = "metadata_mismatch"; detail = "Stripe metadata does not match this tenant, invoice, and job."; }
      else if (!amountMatches) { diagnosis = "amount_mismatch"; detail = "Stripe and EveryStep amounts do not match."; }
      else if (session.payment_status === "paid") { diagnosis = "succeeded_match"; detail = "Stripe shows paid with matching scope and amount. Review before any repair."; }
      else if (session.status === "open") { diagnosis = "still_open"; detail = "Checkout remains open and has not been paid."; }
      return { ...base, paymentIntentSuffix: suffix(paymentIntentId), chargeSuffix: suffix(chargeId), checkoutStatus: clean(session.status) || "unknown", paymentStatus: clean(session.payment_status) || "unknown", diagnosis, detail };
    } catch (error) {
      return { ...base, paymentIntentSuffix: null, chargeSuffix: null, checkoutStatus: "unknown", paymentStatus: "unknown", diagnosis: "retrieve_error" as const, detail: error instanceof Error ? error.message : "Stripe lookup failed." };
    }
  }));
}
