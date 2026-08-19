import type Stripe from "stripe";

import { getStripeServerClient } from "@/lib/business/platform-billing-stripe";
import { resolveTenantStripeConnectReadiness } from "@/lib/business/tenant-stripe-connect-readiness";

const clean = (value: unknown) => String(value ?? "").trim();

export type StripeIdentityLinkResult =
  | { status: "linked"; paymentId: string; invoiceId: string }
  | { status: "blocked"; error: string };

export async function linkVerifiedStripePaymentIdentity(params: {
  admin: any;
  accountOwnerUserId: string;
  findingId: string;
  stripe?: Stripe;
}): Promise<StripeIdentityLinkResult> {
  const ownerId = clean(params.accountOwnerUserId);
  const findingId = clean(params.findingId);
  if (!ownerId || !findingId) return { status: "blocked", error: "Missing repair scope." };

  const { data: finding, error: findingError } = await params.admin
    .from("reconciliation_findings")
    .select("id, finding_type, subject_id, external_id, external_system, amount_cents, job_id, resolved_at")
    .eq("id", findingId)
    .eq("account_owner_user_id", ownerId)
    .maybeSingle();
  if (findingError) throw new Error(`Failed to load reconciliation finding: ${findingError.message ?? "unknown error"}`);
  if (!finding?.id || finding.resolved_at) return { status: "blocked", error: "This finding is no longer open." };
  if (finding.external_system !== "stripe" || !["stripe_charge_unrecorded", "stripe_payment_identity_mismatch"].includes(clean(finding.finding_type))) {
    return { status: "blocked", error: "This finding is not eligible for Stripe identity repair." };
  }

  const externalId = clean(finding.external_id);
  if (!/^[A-Za-z0-9_]+$/.test(externalId)) return { status: "blocked", error: "The Stripe identity is invalid." };

  let payment: any | null = null;
  if (finding.finding_type === "stripe_payment_identity_mismatch") {
    const result = await params.admin
      .from("internal_invoice_payments")
      .select("*")
      .eq("id", clean(finding.subject_id))
      .eq("account_owner_user_id", ownerId)
      .maybeSingle();
    if (result.error) throw new Error(`Failed to load the existing payment: ${result.error.message ?? "unknown error"}`);
    payment = result.data ?? null;
  } else {
    // Current orphan findings retain the related invoice id as subject_id. Only
    // an exact, unique recorded payment is safe to enrich.
    const result = await params.admin
      .from("internal_invoice_payments")
      .select("*")
      .eq("account_owner_user_id", ownerId)
      .eq("invoice_id", clean(finding.subject_id))
      .eq("payment_status", "recorded")
      .eq("amount_cents", Number(finding.amount_cents ?? 0))
      .limit(2);
    if (result.error) throw new Error(`Failed to locate the existing payment: ${result.error.message ?? "unknown error"}`);
    if ((result.data ?? []).length !== 1) return { status: "blocked", error: "No single exact recorded payment could be identified safely." };
    payment = result.data[0];
  }

  if (!payment?.id || clean(payment.payment_status) !== "recorded") return { status: "blocked", error: "The matching payment is not recorded." };
  if (Number(payment.amount_cents ?? 0) !== Number(finding.amount_cents ?? 0)) return { status: "blocked", error: "The payment amount no longer matches Stripe." };
  if (clean(finding.job_id) && clean(payment.job_id) !== clean(finding.job_id)) return { status: "blocked", error: "The payment job does not match the finding." };

  const readiness = await resolveTenantStripeConnectReadiness(ownerId, params.admin);
  if (!readiness.isReady || !readiness.connectedAccountId) return { status: "blocked", error: "Stripe Connect is not ready for this account." };
  const stripe = params.stripe ?? getStripeServerClient();
  const charge = await stripe.charges.retrieve(externalId, {}, { stripeAccount: readiness.connectedAccountId });
  const chargeIntentId = typeof charge.payment_intent === "string" ? clean(charge.payment_intent) : clean(charge.payment_intent?.id);
  if (charge.status !== "succeeded" || !charge.paid || charge.refunded || Number(charge.amount_refunded ?? 0) > 0 || charge.disputed) {
    return { status: "blocked", error: "Stripe does not show a final, unreversed successful payment." };
  }
  if (Number(charge.amount ?? 0) !== Number(payment.amount_cents ?? 0)) return { status: "blocked", error: "Stripe and EveryStep amounts do not match." };
  if (clean(charge.currency).toLowerCase() !== "usd") return { status: "blocked", error: "Only USD invoice payments can be linked here." };
  if (clean(charge.metadata?.account_owner_user_id) !== ownerId
    || clean(charge.metadata?.invoice_id) !== clean(payment.invoice_id)
    || clean(charge.metadata?.job_id) !== clean(payment.job_id)) {
    return { status: "blocked", error: "Stripe metadata does not match this account, invoice, and job." };
  }

  const identityClauses = [
    `processor_charge_id.eq.${externalId}`,
    `processor_payment_reference.eq.${externalId}`,
    chargeIntentId ? `stripe_payment_intent_id.eq.${chargeIntentId}` : null,
  ].filter(Boolean).join(",");
  const { data: identityRows, error: identityError } = await params.admin
    .from("internal_invoice_payments")
    .select("id")
    .eq("account_owner_user_id", ownerId)
    .or(identityClauses)
    .limit(2);
  if (identityError) throw new Error(`Failed to verify Stripe identity uniqueness: ${identityError.message ?? "unknown error"}`);
  const conflicting = (identityRows ?? []).find((row: any) => clean(row.id) !== clean(payment.id));
  if (conflicting) return { status: "blocked", error: "This Stripe payment is already linked to another EveryStep payment." };

  const existingProcessor = clean(payment.processor_name).toLowerCase();
  if (existingProcessor && existingProcessor !== "stripe") return { status: "blocked", error: "The existing payment is recorded under a different processor." };
  for (const [label, existing, expected] of [
    ["charge", clean(payment.processor_charge_id), externalId],
    ["processor reference", clean(payment.processor_payment_reference), externalId],
    ["PaymentIntent", clean(payment.stripe_payment_intent_id), chargeIntentId],
  ] as const) {
    if (existing && expected && existing !== expected) return { status: "blocked", error: `The existing Stripe ${label} conflicts with the verified value.` };
  }

  const stripeChargedAt = Number(charge.created ?? 0) > 0 ? new Date(Number(charge.created) * 1000).toISOString() : null;
  const patch: Record<string, unknown> = {
    processor_name: "stripe",
    processor_payment_reference: externalId,
    processor_charge_id: externalId,
    ...(chargeIntentId ? { stripe_payment_intent_id: chargeIntentId } : {}),
    ...(stripeChargedAt ? { stripe_charged_at: stripeChargedAt } : {}),
    stripe_identity_dedupe_scope: "recorded_v1",
  };
  const { data: updated, error: updateError } = await params.admin
    .from("internal_invoice_payments")
    .update(patch)
    .eq("id", clean(payment.id))
    .eq("account_owner_user_id", ownerId)
    .eq("invoice_id", clean(payment.invoice_id))
    .eq("payment_status", "recorded")
    .eq("amount_cents", Number(payment.amount_cents ?? 0))
    .select("id")
    .maybeSingle();
  if (updateError) throw new Error(`Failed to link the verified Stripe identity: ${updateError.message ?? "unknown error"}`);
  if (!updated?.id) return { status: "blocked", error: "The payment changed before the repair could be applied." };

  const { error: resolveError } = await params.admin
    .from("reconciliation_findings")
    .update({ resolved_at: new Date().toISOString(), resolved_reason: "Verified Stripe identity linked to existing payment" })
    .eq("id", findingId)
    .eq("account_owner_user_id", ownerId)
    .is("resolved_at", null);
  if (resolveError) throw new Error(`Payment linked, but the finding could not be resolved: ${resolveError.message ?? "unknown error"}`);

  return { status: "linked", paymentId: clean(payment.id), invoiceId: clean(payment.invoice_id) };
}
