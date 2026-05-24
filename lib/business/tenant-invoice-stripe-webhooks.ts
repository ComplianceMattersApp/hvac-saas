'use server';

import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/server';
import { resolveInternalInvoiceByJobId } from '@/lib/business/internal-invoice';
import { getStripeServerClient } from '@/lib/business/platform-billing-stripe';
import {
  isStripeEventAlreadyRecorded,
  isStripePaymentAlreadyRecorded,
  validateInvoiceEligibleForOnlinePayment,
  buildStripePaymentReference,
  resolveInvoiceCollectedPaymentSummary,
} from '@/lib/business/internal-invoice-payments';
import { resolveTenantStripeConnectReadiness } from '@/lib/business/tenant-stripe-connect-readiness';
import { insertJobEvent } from '@/lib/actions/job-actions';

function toCleanString(value: unknown): string {
  return String(value ?? '').trim();
}

export async function recordTenantInvoicePaymentFromCheckoutSession(params: {
  session: Stripe.Checkout.Session;
  eventId: string;
  connectedAccountId?: string | null;
  admin?: any;
  stripe?: Stripe;
}): Promise<{
  recorded: boolean;
  reason?: string;
  paymentId?: string;
}> {
  const admin = params.admin ?? createAdminClient();
  const session = params.session;
  const eventId = toCleanString(params.eventId);
  const eventConnectedAccountId = toCleanString(params.connectedAccountId);

  if (!eventId) {
    return {
      recorded: false,
      reason: 'Missing Stripe event ID for idempotency check',
    };
  }

  if (session.mode !== 'payment') {
    return {
      recorded: false,
      reason: 'Checkout session is not payment mode',
    };
  }

  if (toCleanString(session.payment_status).toLowerCase() !== 'paid') {
    return {
      recorded: false,
      reason: 'Checkout session payment status is not paid',
    };
  }

  const alreadyRecorded = await isStripeEventAlreadyRecorded(eventId, admin);
  if (alreadyRecorded) {
    return {
      recorded: false,
      reason: 'Event already recorded (idempotency check)',
    };
  }

  const accountOwnerUserId = toCleanString(session.metadata?.account_owner_user_id);
  const invoiceId = toCleanString(session.metadata?.invoice_id);
  const jobIdFromMetadata = toCleanString(session.metadata?.job_id);
  const checkoutSessionId = toCleanString(session.id);
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? toCleanString(session.payment_intent) : '';

  if (!accountOwnerUserId || !invoiceId) {
    return {
      recorded: false,
      reason: 'Missing metadata: account_owner_user_id or invoice_id',
    };
  }

  if (!eventConnectedAccountId) {
    console.warn('Tenant invoice checkout webhook skipped: missing connected account context', {
      eventId,
      checkoutSessionId: checkoutSessionId || null,
      paymentIntentId: paymentIntentId || null,
      accountOwnerUserId,
      invoiceId,
      jobId: jobIdFromMetadata || null,
    });
    return {
      recorded: false,
      reason: 'Missing connected account context',
    };
  }

  const connectReadiness = await resolveTenantStripeConnectReadiness(accountOwnerUserId, admin);
  const expectedConnectedAccountId = toCleanString(connectReadiness.connectedAccountId);

  if (!connectReadiness.isReady || !expectedConnectedAccountId) {
    console.warn('Tenant invoice checkout webhook skipped: tenant connected account not ready', {
      eventId,
      checkoutSessionId: checkoutSessionId || null,
      paymentIntentId: paymentIntentId || null,
      accountOwnerUserId,
      invoiceId,
      jobId: jobIdFromMetadata || null,
      onboardingStatus: connectReadiness.onboardingStatus,
      chargesEnabled: connectReadiness.chargesEnabled,
      payoutsEnabled: connectReadiness.payoutsEnabled,
      detailsSubmitted: connectReadiness.detailsSubmitted,
      disabledReason: connectReadiness.disabledReason,
      expectedConnectedAccountId: expectedConnectedAccountId || null,
      eventConnectedAccountId,
    });
    return {
      recorded: false,
      reason: 'Tenant connected account is not ready',
    };
  }

  if (expectedConnectedAccountId !== eventConnectedAccountId) {
    console.warn('Tenant invoice checkout webhook skipped: connected account mismatch', {
      eventId,
      checkoutSessionId: checkoutSessionId || null,
      paymentIntentId: paymentIntentId || null,
      accountOwnerUserId,
      invoiceId,
      jobId: jobIdFromMetadata || null,
      expectedConnectedAccountId,
      eventConnectedAccountId,
    });
    return {
      recorded: false,
      reason: 'Connected account mismatch',
    };
  }

  const { data: invoice, error: invoiceErr } = await admin
    .from('internal_invoices')
    .select('id, account_owner_user_id, job_id, invoice_number, status, total_cents')
    .eq('id', invoiceId)
    .eq('account_owner_user_id', accountOwnerUserId)
    .maybeSingle();

  if (invoiceErr) {
    throw new Error(
      `Failed to resolve invoice from checkout session webhook: ${invoiceErr.message ?? 'unknown error'}`,
    );
  }

  if (!invoice?.id) {
    return {
      recorded: false,
      reason: 'Invoice not found',
    };
  }

  const invoiceJobId = toCleanString(invoice.job_id);
  if (jobIdFromMetadata && invoiceJobId && jobIdFromMetadata !== invoiceJobId) {
    return {
      recorded: false,
      reason: 'Checkout metadata job_id does not match invoice job',
    };
  }

  const paymentSummary = await resolveInvoiceCollectedPaymentSummary(
    accountOwnerUserId,
    invoiceId,
    admin,
  );

  const eligibility = validateInvoiceEligibleForOnlinePayment(invoice, paymentSummary);
  if (!eligibility.eligible) {
    return {
      recorded: false,
      reason: eligibility.reason ?? 'Invoice not eligible for payment',
    };
  }

  const sessionAmountCents = Number(session.amount_total ?? 0) || 0;
  if (sessionAmountCents <= 0) {
    return {
      recorded: false,
      reason: 'Checkout session amount must be positive',
    };
  }

  if (sessionAmountCents > paymentSummary.balanceDueCents) {
    return {
      recorded: false,
      reason: 'Checkout session amount exceeds balance due',
    };
  }

  const stripe = params.stripe ?? getStripeServerClient();

  let processorChargeId: string | null = null;
  let chargedAtIso: string | null = null;

  if (paymentIntentId) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      }, {
        stripeAccount: eventConnectedAccountId,
      });

      processorChargeId =
        typeof paymentIntent.latest_charge === 'string'
          ? toCleanString(paymentIntent.latest_charge) || null
          : null;
      if (Number.isFinite(paymentIntent.created)) {
        chargedAtIso = new Date(Number(paymentIntent.created) * 1000).toISOString();
      }
    } catch (error) {
      console.warn('Tenant invoice checkout webhook payment intent lookup failed', {
        eventId,
        checkoutSessionId: checkoutSessionId || null,
        paymentIntentId,
        eventConnectedAccountId,
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  const paymentAlreadyRecorded = await isStripePaymentAlreadyRecorded({
    accountOwnerUserId,
    invoiceId,
    stripeCheckoutSessionId: checkoutSessionId || null,
    stripePaymentIntentId: paymentIntentId || null,
    processorChargeId,
    supabase: admin,
  });

  if (paymentAlreadyRecorded) {
    return {
      recorded: false,
      reason: 'Payment already recorded for Stripe payment identity',
    };
  }

  const processorPaymentReference =
    processorChargeId || paymentIntentId || checkoutSessionId || `checkout_event_${eventId}`;

  const { data: insertedPayment, error: insertErr } = await admin
    .from('internal_invoice_payments')
    .insert({
      account_owner_user_id: accountOwnerUserId,
      invoice_id: invoiceId,
      job_id: invoiceJobId || jobIdFromMetadata || '',
      payment_status: 'recorded',
      payment_method: 'card_stripe_online',
      amount_cents: sessionAmountCents,
      paid_at: new Date().toISOString(),
      received_reference: processorPaymentReference,
      notes: `Stripe checkout session ${checkoutSessionId || 'unknown session'}`,
      recorded_by_user_id: accountOwnerUserId,
      processor_name: 'stripe',
      processor_payment_reference: processorPaymentReference,
      processor_charge_id: processorChargeId,
      stripe_checkout_session_id: checkoutSessionId || null,
      stripe_event_id: eventId,
      stripe_payment_intent_id: paymentIntentId || null,
      stripe_charged_at: chargedAtIso,
    })
    .select('id')
    .single();

  if (insertErr) {
    throw new Error(
      `Failed to record checkout session payment: ${insertErr.message ?? 'unknown error'}`,
    );
  }

  await insertJobEvent({
    supabase: admin,
    jobId: invoiceJobId || jobIdFromMetadata || '',
    event_type: 'payment_recorded',
    userId: null,
    meta: {
      invoice_id: invoiceId,
      invoice_number: invoice.invoice_number,
      payment_id: insertedPayment?.id ?? null,
      payment_status: 'recorded',
      payment_method: 'card_stripe_online',
      amount_cents: sessionAmountCents,
      amount_display: (sessionAmountCents / 100).toFixed(2),
      source: 'stripe_checkout_session_webhook',
      stripe_checkout_session_id: checkoutSessionId || null,
      stripe_payment_intent_id: paymentIntentId || null,
      stripe_charge_id: processorChargeId,
      stripe_event_id: eventId,
    },
  });

  return {
    recorded: true,
    paymentId: insertedPayment?.id,
  };
}

/**
 * Records a successful Stripe charge as an internal invoice payment.
 * Follows idempotency pattern: stripe_event_id prevents double-crediting on webhook retry.
 */
export async function recordTenantInvoicePaymentFromStripeCharge(params: {
  charge: Stripe.Charge;
  eventId: string;
  connectedAccountId?: string | null;
  admin?: any;
  stripe?: any;
}): Promise<{
  recorded: boolean;
  reason?: string;
  paymentId?: string;
}> {
  const admin = params.admin ?? createAdminClient();
  const charge = params.charge;
  const eventId = toCleanString(params.eventId);
  const eventConnectedAccountId = toCleanString(params.connectedAccountId);

  if (!eventId) {
    return {
      recorded: false,
      reason: 'Missing Stripe event ID for idempotency check',
    };
  }

  // Idempotency: check if this event was already processed
  const alreadyRecorded = await isStripeEventAlreadyRecorded(eventId, admin);
  if (alreadyRecorded) {
    return {
      recorded: false,
      reason: 'Event already recorded (idempotency check)',
    };
  }

  // Extract metadata from charge
  const accountOwnerUserId = toCleanString(charge.metadata?.account_owner_user_id);
  const invoiceId = toCleanString(charge.metadata?.invoice_id);
  const jobId = toCleanString(charge.metadata?.job_id);

  if (!accountOwnerUserId || !invoiceId) {
    return {
      recorded: false,
      reason: 'Missing metadata: account_owner_user_id or invoice_id',
    };
  }

  // Validate invoice exists, belongs to account owner, and is issued
  const invoice = await resolveInternalInvoiceByJobId({
    supabase: admin,
    jobId,
  });

  if (!invoice) {
    return {
      recorded: false,
      reason: 'Invoice not found',
    };
  }

  if (invoice.account_owner_user_id !== accountOwnerUserId) {
    return {
      recorded: false,
      reason: 'Invoice does not belong to account owner',
    };
  }

  if (!eventConnectedAccountId) {
    console.warn('Tenant invoice webhook skipped: missing connected account context', {
      eventId,
      chargeId: toCleanString(charge.id) || null,
      accountOwnerUserId,
      invoiceId,
      jobId,
    });
    return {
      recorded: false,
      reason: 'Missing connected account context',
    };
  }

  const connectReadiness = await resolveTenantStripeConnectReadiness(accountOwnerUserId, admin);
  const expectedConnectedAccountId = toCleanString(connectReadiness.connectedAccountId);

  if (!connectReadiness.isReady || !expectedConnectedAccountId) {
    console.warn('Tenant invoice webhook skipped: tenant connected account not ready', {
      eventId,
      chargeId: toCleanString(charge.id) || null,
      accountOwnerUserId,
      invoiceId,
      jobId,
      onboardingStatus: connectReadiness.onboardingStatus,
      chargesEnabled: connectReadiness.chargesEnabled,
      payoutsEnabled: connectReadiness.payoutsEnabled,
      detailsSubmitted: connectReadiness.detailsSubmitted,
      disabledReason: connectReadiness.disabledReason,
      expectedConnectedAccountId: expectedConnectedAccountId || null,
      eventConnectedAccountId,
    });
    return {
      recorded: false,
      reason: 'Tenant connected account is not ready',
    };
  }

  if (expectedConnectedAccountId !== eventConnectedAccountId) {
    console.warn('Tenant invoice webhook skipped: connected account mismatch', {
      eventId,
      chargeId: toCleanString(charge.id) || null,
      accountOwnerUserId,
      invoiceId,
      jobId,
      expectedConnectedAccountId,
      eventConnectedAccountId,
    });
    return {
      recorded: false,
      reason: 'Connected account mismatch',
    };
  }

  // Validate invoice status and balance
  const paymentSummary = await resolveInvoiceCollectedPaymentSummary(
    accountOwnerUserId,
    invoiceId,
    admin,
  );

  const eligibility = validateInvoiceEligibleForOnlinePayment(invoice, paymentSummary);
  if (!eligibility.eligible) {
    return {
      recorded: false,
      reason: eligibility.reason ?? 'Invoice not eligible for payment',
    };
  }

  // Validate charge amount
  const chargeAmountCents = Number(charge.amount) || 0;
  if (chargeAmountCents <= 0) {
    return {
      recorded: false,
      reason: 'Charge amount must be positive',
    };
  }

  if (chargeAmountCents > paymentSummary.balanceDueCents) {
    return {
      recorded: false,
      reason: 'Charge amount exceeds balance due',
    };
  }

  // Build Stripe payment reference
  const stripeRef = buildStripePaymentReference(charge);

  const paymentAlreadyRecorded = await isStripePaymentAlreadyRecorded({
    accountOwnerUserId,
    invoiceId,
    stripeCheckoutSessionId: toCleanString(charge.metadata?.checkout_session_id) || null,
    stripePaymentIntentId: stripeRef.stripe_payment_intent_id,
    processorChargeId: stripeRef.processor_charge_id,
    supabase: admin,
  });

  if (paymentAlreadyRecorded) {
    return {
      recorded: false,
      reason: 'Payment already recorded for Stripe payment identity',
    };
  }

  // Insert payment row
  const { data: insertedPayment, error: insertErr } = await admin
    .from('internal_invoice_payments')
    .insert({
      account_owner_user_id: accountOwnerUserId,
      invoice_id: invoiceId,
      job_id: jobId,
      payment_status: 'recorded',
      payment_method: 'card_stripe_online',
      amount_cents: chargeAmountCents,
      paid_at: new Date(charge.created * 1000).toISOString(),
      received_reference: stripeRef.processor_payment_reference,
      notes: `Stripe charge ${stripeRef.processor_charge_id}`,
      recorded_by_user_id: accountOwnerUserId,
      processor_name: stripeRef.processor_name,
      processor_payment_reference: stripeRef.processor_payment_reference,
      processor_charge_id: stripeRef.processor_charge_id,
      stripe_checkout_session_id: toCleanString(charge.metadata?.checkout_session_id) || null,
      stripe_event_id: eventId,
      stripe_payment_intent_id: stripeRef.stripe_payment_intent_id,
      stripe_charged_at: stripeRef.stripe_charged_at,
    })
    .select('id')
    .single();

  if (insertErr) {
    throw new Error(
      `Failed to record Stripe charge payment: ${insertErr.message ?? 'unknown error'}`,
    );
  }

  // Log job event for audit trail
  await insertJobEvent({
    supabase: admin,
    jobId,
    event_type: 'payment_recorded',
    userId: null,
    meta: {
      invoice_id: invoiceId,
      invoice_number: invoice.invoice_number,
      payment_id: insertedPayment?.id ?? null,
      payment_status: 'recorded',
      payment_method: 'card_stripe_online',
      amount_cents: chargeAmountCents,
      amount_display: (chargeAmountCents / 100).toFixed(2),
      source: 'stripe_charge_webhook',
      stripe_charge_id: stripeRef.processor_charge_id,
      stripe_event_id: eventId,
    },
  });

  return {
    recorded: true,
    paymentId: insertedPayment?.id,
  };
}

/**
 * Records a failed Stripe charge attempt as a failed payment.
 * Does not count toward balance due.
 */
export async function recordTenantInvoicePaymentFailureFromStripeCharge(params: {
  charge: Stripe.Charge;
  eventId: string;
  connectedAccountId?: string | null;
  admin?: any;
}): Promise<{
  recorded: boolean;
  reason?: string;
  paymentId?: string;
}> {
  const admin = params.admin ?? createAdminClient();
  const charge = params.charge;
  const eventId = toCleanString(params.eventId);
  const eventConnectedAccountId = toCleanString(params.connectedAccountId);

  if (!eventId) {
    return {
      recorded: false,
      reason: 'Missing Stripe event ID for idempotency check',
    };
  }

  // Idempotency: check if this event was already processed
  const alreadyRecorded = await isStripeEventAlreadyRecorded(eventId, admin);
  if (alreadyRecorded) {
    return {
      recorded: false,
      reason: 'Event already recorded (idempotency check)',
    };
  }

  // Extract metadata from charge
  const accountOwnerUserId = toCleanString(charge.metadata?.account_owner_user_id);
  const invoiceId = toCleanString(charge.metadata?.invoice_id);
  const jobId = toCleanString(charge.metadata?.job_id);

  if (!accountOwnerUserId || !invoiceId) {
    return {
      recorded: false,
      reason: 'Missing metadata: cannot record failed attempt',
    };
  }

  // Validate invoice exists
  const invoice = await resolveInternalInvoiceByJobId({
    supabase: admin,
    jobId,
  });

  if (!invoice || invoice.account_owner_user_id !== accountOwnerUserId) {
    return {
      recorded: false,
      reason: 'Invoice not found or does not belong to account owner',
    };
  }

  if (!eventConnectedAccountId) {
    console.warn('Tenant invoice failure webhook skipped: missing connected account context', {
      eventId,
      chargeId: toCleanString(charge.id) || null,
      accountOwnerUserId,
      invoiceId,
      jobId,
    });
    return {
      recorded: false,
      reason: 'Missing connected account context',
    };
  }

  const connectReadiness = await resolveTenantStripeConnectReadiness(accountOwnerUserId, admin);
  const expectedConnectedAccountId = toCleanString(connectReadiness.connectedAccountId);

  if (!connectReadiness.isReady || !expectedConnectedAccountId) {
    console.warn('Tenant invoice failure webhook skipped: tenant connected account not ready', {
      eventId,
      chargeId: toCleanString(charge.id) || null,
      accountOwnerUserId,
      invoiceId,
      jobId,
      onboardingStatus: connectReadiness.onboardingStatus,
      chargesEnabled: connectReadiness.chargesEnabled,
      payoutsEnabled: connectReadiness.payoutsEnabled,
      detailsSubmitted: connectReadiness.detailsSubmitted,
      disabledReason: connectReadiness.disabledReason,
      expectedConnectedAccountId: expectedConnectedAccountId || null,
      eventConnectedAccountId,
    });
    return {
      recorded: false,
      reason: 'Tenant connected account is not ready',
    };
  }

  if (expectedConnectedAccountId !== eventConnectedAccountId) {
    console.warn('Tenant invoice failure webhook skipped: connected account mismatch', {
      eventId,
      chargeId: toCleanString(charge.id) || null,
      accountOwnerUserId,
      invoiceId,
      jobId,
      expectedConnectedAccountId,
      eventConnectedAccountId,
    });
    return {
      recorded: false,
      reason: 'Connected account mismatch',
    };
  }

  // Build Stripe payment reference
  const stripeRef = buildStripePaymentReference(charge);
  const chargeAmountCents = Number(charge.amount) || 0;

  // Insert failed payment row (does not count toward balance)
  const { data: insertedPayment, error: insertErr } = await admin
    .from('internal_invoice_payments')
    .insert({
      account_owner_user_id: accountOwnerUserId,
      invoice_id: invoiceId,
      job_id: jobId,
      payment_status: 'failed',
      payment_method: 'card_stripe_online',
      amount_cents: chargeAmountCents,
      paid_at: new Date(charge.created * 1000).toISOString(),
      received_reference: stripeRef.processor_payment_reference,
      notes: `Stripe charge failed: ${charge.failure_message ?? 'unknown reason'}`,
      recorded_by_user_id: accountOwnerUserId,
      processor_name: stripeRef.processor_name,
      processor_payment_reference: stripeRef.processor_payment_reference,
      processor_charge_id: stripeRef.processor_charge_id,
      stripe_checkout_session_id: toCleanString(charge.metadata?.checkout_session_id) || null,
      stripe_event_id: eventId,
      stripe_payment_intent_id: stripeRef.stripe_payment_intent_id,
      stripe_charged_at: stripeRef.stripe_charged_at,
    })
    .select('id')
    .single();

  if (insertErr) {
    throw new Error(
      `Failed to record Stripe charge failure: ${insertErr.message ?? 'unknown error'}`,
    );
  }

  // Log job event for audit trail
  await insertJobEvent({
    supabase: admin,
    jobId,
    event_type: 'payment_recorded',
    userId: null,
    meta: {
      invoice_id: invoiceId,
      invoice_number: invoice.invoice_number,
      payment_id: insertedPayment?.id ?? null,
      payment_status: 'failed',
      payment_method: 'card_stripe_online',
      amount_cents: chargeAmountCents,
      amount_display: (chargeAmountCents / 100).toFixed(2),
      source: 'stripe_charge_webhook_failed',
      stripe_charge_id: stripeRef.processor_charge_id,
      stripe_event_id: eventId,
      failure_reason: charge.failure_message ?? 'unknown',
    },
  });

  return {
    recorded: true,
    paymentId: insertedPayment?.id,
  };
}
