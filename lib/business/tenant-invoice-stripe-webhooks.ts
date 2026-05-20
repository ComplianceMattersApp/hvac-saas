'use server';

import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/server';
import { resolveInternalInvoiceByJobId } from '@/lib/business/internal-invoice';
import {
  isStripeEventAlreadyRecorded,
  validateInvoiceEligibleForOnlinePayment,
  buildStripePaymentReference,
  resolveInvoiceCollectedPaymentSummary,
} from '@/lib/business/internal-invoice-payments';
import { resolveTenantStripeConnectReadiness } from '@/lib/business/tenant-stripe-connect-readiness';
import { insertJobEvent } from '@/lib/actions/job-actions';

function toCleanString(value: unknown): string {
  return String(value ?? '').trim();
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
      recorded_by_user_id: 'webhook',
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
    userId: 'webhook',
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
      recorded_by_user_id: 'webhook',
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
    userId: 'webhook',
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
