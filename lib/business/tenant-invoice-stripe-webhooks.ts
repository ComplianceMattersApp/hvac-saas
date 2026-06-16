'use server';

import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/server';
import { getStripeServerClient } from '@/lib/business/platform-billing-stripe';
import {
  isStripeEventAlreadyRecorded,
  isStripePaymentAlreadyRecorded,
  validateInvoiceEligibleForOnlinePayment,
  buildStripePaymentReference,
  resolveInvoiceCollectedPaymentSummary,
  resolveJobBlocksOnlineInvoicePayment,
} from '@/lib/business/internal-invoice-payments';
import { upsertInvoicePaymentAllocationForPaymentRow } from '@/lib/business/payment-allocations';
import {
  mapAttemptFailureStatus,
  resolveManualSavedMethodAttemptFromWebhook,
} from '@/lib/business/tenant-saved-method-payment-attempts';
import { resolveTenantStripeConnectReadiness } from '@/lib/business/tenant-stripe-connect-readiness';
import { insertJobEvent } from '@/lib/actions/job-actions';

function toCleanString(value: unknown): string {
  return String(value ?? '').trim();
}

async function resolveInternalInvoiceById(params: {
  admin: any;
  invoiceId: string;
}) {
  const invoiceId = toCleanString(params.invoiceId);
  if (!invoiceId) return null;

  const { data, error } = await params.admin
    .from('internal_invoices')
    .select('id, account_owner_user_id, job_id, invoice_number, status, total_cents')
    .eq('id', invoiceId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  if (toCleanString(data.status).toLowerCase() === 'void') {
    return null;
  }

  return data;
}

type StripePaymentIdentityRow = {
  id: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  processor_charge_id: string | null;
  processor_payment_reference: string | null;
  received_reference: string | null;
  stripe_event_id: string | null;
  stripe_charged_at: string | null;
  paid_at: string | null;
  notes: string | null;
  payment_status: 'recorded' | 'failed' | 'pending' | 'reversed' | null;
  created_at: string | null;
};

function isStripeIdentityUniqueConflict(error: unknown): boolean {
  const code = toCleanString((error as { code?: unknown } | null)?.code);
  if (code === '23505') return true;

  const message = toCleanString((error as { message?: unknown } | null)?.message).toLowerCase();
  return message.includes('duplicate key') || message.includes('unique constraint');
}

async function insertPaymentRecordedJobEventIfMissing(params: {
  admin: any;
  jobId: string;
  paymentId?: string | null;
  meta: Record<string, unknown>;
}) {
  const jobId = toCleanString(params.jobId);
  const paymentId = toCleanString(params.paymentId);

  if (jobId && paymentId) {
    const { data, error } = await params.admin
      .from('job_events')
      .select('id')
      .eq('job_id', jobId)
      .eq('event_type', 'payment_recorded')
      .contains('meta', { payment_id: paymentId })
      .limit(1);

    if (error) {
      console.warn('Stripe webhook job event dedupe lookup failed', {
        jobId,
        paymentId,
        error: error.message ?? 'unknown error',
      });
    } else {
      const existing = Array.isArray(data) ? data[0] : null;
      if (existing?.id) {
        return;
      }
    }
  }

  await insertJobEvent({
    supabase: params.admin,
    jobId,
    event_type: 'payment_recorded',
    userId: null,
    meta: params.meta,
  });
}

async function resolveCanonicalStripePaymentByIdentity(params: {
  admin: any;
  accountOwnerUserId: string;
  invoiceId: string;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  processorChargeId?: string | null;
}) {
  const accountOwnerUserId = toCleanString(params.accountOwnerUserId);
  const invoiceId = toCleanString(params.invoiceId);
  const stripeCheckoutSessionId = toCleanString(params.stripeCheckoutSessionId);
  const stripePaymentIntentId = toCleanString(params.stripePaymentIntentId);
  const processorChargeId = toCleanString(params.processorChargeId);

  if (!accountOwnerUserId || !invoiceId) return null;

  const identityClauses = [
    stripeCheckoutSessionId && `stripe_checkout_session_id.eq.${stripeCheckoutSessionId}`,
    stripePaymentIntentId && `stripe_payment_intent_id.eq.${stripePaymentIntentId}`,
    processorChargeId && `processor_charge_id.eq.${processorChargeId}`,
  ].filter(Boolean);

  if (!identityClauses.length) return null;

  const { data, error } = await params.admin
    .from('internal_invoice_payments')
    .select(
      [
        'id',
        'stripe_checkout_session_id',
        'stripe_payment_intent_id',
        'processor_charge_id',
        'processor_payment_reference',
        'received_reference',
        'stripe_event_id',
        'stripe_charged_at',
        'paid_at',
        'notes',
        'payment_status',
        'created_at',
      ].join(', '),
    )
    .eq('account_owner_user_id', accountOwnerUserId)
    .eq('invoice_id', invoiceId)
    .or(identityClauses.join(','))
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    return null;
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;

  return row as StripePaymentIdentityRow;
}

async function enrichCanonicalStripePaymentIdentity(params: {
  admin: any;
  row: StripePaymentIdentityRow;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  processorChargeId?: string | null;
  processorPaymentReference?: string | null;
  stripeChargedAt?: string | null;
  paidAtIso?: string | null;
  note?: string | null;
}) {
  const row = params.row;
  const patch: Record<string, string> = {};

  const stripeCheckoutSessionId = toCleanString(params.stripeCheckoutSessionId);
  const stripePaymentIntentId = toCleanString(params.stripePaymentIntentId);
  const processorChargeId = toCleanString(params.processorChargeId);
  const processorPaymentReference = toCleanString(params.processorPaymentReference);
  const stripeChargedAt = toCleanString(params.stripeChargedAt);
  const paidAtIso = toCleanString(params.paidAtIso);
  const note = toCleanString(params.note);

  if (!toCleanString(row.stripe_checkout_session_id) && stripeCheckoutSessionId) {
    patch.stripe_checkout_session_id = stripeCheckoutSessionId;
  }

  if (!toCleanString(row.stripe_payment_intent_id) && stripePaymentIntentId) {
    patch.stripe_payment_intent_id = stripePaymentIntentId;
  }

  if (!toCleanString(row.processor_charge_id) && processorChargeId) {
    patch.processor_charge_id = processorChargeId;
  }

  if (!toCleanString(row.processor_payment_reference) && processorPaymentReference) {
    patch.processor_payment_reference = processorPaymentReference;
  }

  if (!toCleanString(row.received_reference) && processorPaymentReference) {
    patch.received_reference = processorPaymentReference;
  }

  if (!toCleanString(row.stripe_charged_at) && stripeChargedAt) {
    patch.stripe_charged_at = stripeChargedAt;
  }

  if (!toCleanString(row.paid_at) && paidAtIso) {
    patch.paid_at = paidAtIso;
  }

  if (!toCleanString(row.notes) && note) {
    patch.notes = note;
  }

  const patchKeys = Object.keys(patch);
  if (!patchKeys.length) {
    return {
      updated: false,
      id: toCleanString(row.id),
    };
  }

  const { data, error } = await params.admin
    .from('internal_invoice_payments')
    .update(patch)
    .eq('id', toCleanString(row.id))
    .select('id')
    .maybeSingle();

  if (error) {
    console.warn('Stripe webhook payment enrichment update failed', {
      paymentId: toCleanString(row.id),
      patchKeys,
      error: error.message ?? 'unknown error',
    });
  }

  return {
    updated: !error,
    id: toCleanString(data?.id) || toCleanString(row.id),
  };
}

async function promotePendingStripePaymentToRecorded(params: {
  admin: any;
  row: StripePaymentIdentityRow;
  amountCents: number;
  processorPaymentReference: string;
  processorChargeId?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeChargedAt?: string | null;
  stripeEventId: string;
  paidAtIso: string;
  note: string;
}) {
  const rowId = toCleanString(params.row.id);
  if (!rowId || params.row.payment_status !== 'pending') return null;

  const { data, error } = await params.admin
    .from('internal_invoice_payments')
    .update({
      payment_status: 'recorded',
      amount_cents: params.amountCents,
      paid_at: params.paidAtIso,
      received_reference: params.processorPaymentReference,
      notes: params.note,
      processor_name: 'stripe',
      processor_payment_reference: params.processorPaymentReference,
      processor_charge_id: toCleanString(params.processorChargeId) || null,
      stripe_checkout_session_id: toCleanString(params.stripeCheckoutSessionId) || null,
      stripe_event_id: params.stripeEventId,
      stripe_payment_intent_id: toCleanString(params.stripePaymentIntentId) || null,
      stripe_charged_at: toCleanString(params.stripeChargedAt) || null,
      stripe_identity_dedupe_scope: 'recorded_v1',
    })
    .eq('id', rowId)
    .eq('payment_status', 'pending')
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to promote pending Stripe payment: ${error.message ?? 'unknown error'}`);
  }

  return toCleanString(data?.id) || null;
}

async function resolveStripePaymentIdByEventId(params: {
  admin: any;
  eventId: string;
}) {
  const eventId = toCleanString(params.eventId);
  if (!eventId) return null;

  const { data, error } = await params.admin
    .from('internal_invoice_payments')
    .select('id')
    .eq('stripe_event_id', eventId)
    .maybeSingle();

  if (error) return null;
  return toCleanString(data?.id) || null;
}

async function resolveStripePaymentIdByIdentity(params: {
  admin: any;
  accountOwnerUserId: string;
  invoiceId: string;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  processorChargeId?: string | null;
}) {
  const accountOwnerUserId = toCleanString(params.accountOwnerUserId);
  const invoiceId = toCleanString(params.invoiceId);
  const stripeCheckoutSessionId = toCleanString(params.stripeCheckoutSessionId);
  const stripePaymentIntentId = toCleanString(params.stripePaymentIntentId);
  const processorChargeId = toCleanString(params.processorChargeId);

  if (!accountOwnerUserId || !invoiceId) return null;

  const identityClauses = [
    stripeCheckoutSessionId && `stripe_checkout_session_id.eq.${stripeCheckoutSessionId}`,
    stripePaymentIntentId && `stripe_payment_intent_id.eq.${stripePaymentIntentId}`,
    processorChargeId && `processor_charge_id.eq.${processorChargeId}`,
  ].filter(Boolean);

  if (!identityClauses.length) return null;

  const canonical = await resolveCanonicalStripePaymentByIdentity({
    admin: params.admin,
    accountOwnerUserId,
    invoiceId,
    stripeCheckoutSessionId,
    stripePaymentIntentId,
    processorChargeId,
  });

  return toCleanString(canonical?.id) || null;
}

async function attemptAllocationWebhookDualWrite(params: {
  admin: any;
  paymentId?: string | null;
  paymentRow?: {
    id: string;
    account_owner_user_id: string;
    invoice_id: string;
    amount_cents: number;
    payment_status: 'recorded' | 'failed';
  };
  logContext: {
    webhookKind: 'checkout_session' | 'charge_succeeded' | 'charge_failed';
    eventId: string;
    invoiceId: string;
    jobId: string;
  };
}) {
  const paymentId = toCleanString(params.paymentId);
  const paymentRow = params.paymentRow;

  const result = await upsertInvoicePaymentAllocationForPaymentRow({
    supabase: params.admin,
    paymentId: paymentId || undefined,
    paymentRow: paymentRow
      ? {
          id: paymentRow.id,
          account_owner_user_id: paymentRow.account_owner_user_id,
          invoice_id: paymentRow.invoice_id,
          amount_cents: paymentRow.amount_cents,
          payment_status: paymentRow.payment_status,
        }
      : undefined,
  });

  if (!result.ok) {
    console.warn('Stripe webhook allocation dual-write failed after payment-row success', {
      ...params.logContext,
      paymentId: (paymentRow?.id ?? paymentId) || null,
      allocationStatus: result.allocationStatus,
      allocationResultStatus: result.status,
      allocationReason: result.reason,
    });
  }
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
    const existingPaymentId = await resolveStripePaymentIdByEventId({
      admin,
      eventId,
    });

    if (existingPaymentId) {
      await attemptAllocationWebhookDualWrite({
        admin,
        paymentId: existingPaymentId,
        logContext: {
          webhookKind: 'checkout_session',
          eventId,
          invoiceId: toCleanString(session.metadata?.invoice_id),
          jobId: toCleanString(session.metadata?.job_id),
        },
      });
    }

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

  if (
    await resolveJobBlocksOnlineInvoicePayment({
      accountOwnerUserId,
      jobId: invoiceJobId || jobIdFromMetadata || '',
      supabase: admin,
    })
  ) {
    return {
      recorded: false,
      reason: 'Invoice already paid or resolved outside online payment',
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

  const processorPaymentReference =
    processorChargeId || paymentIntentId || checkoutSessionId || `checkout_event_${eventId}`;

  const paymentAlreadyRecorded = await isStripePaymentAlreadyRecorded({
    accountOwnerUserId,
    invoiceId,
    stripeCheckoutSessionId: checkoutSessionId || null,
    stripePaymentIntentId: paymentIntentId || null,
    processorChargeId,
    supabase: admin,
  });

  if (paymentAlreadyRecorded) {
    const canonicalExistingPayment = await resolveCanonicalStripePaymentByIdentity({
      admin,
      accountOwnerUserId,
      invoiceId,
      stripeCheckoutSessionId: checkoutSessionId || null,
      stripePaymentIntentId: paymentIntentId || null,
      processorChargeId,
    });

    const existingPaymentId = toCleanString(canonicalExistingPayment?.id) || null;

    if (canonicalExistingPayment?.payment_status === 'pending' && existingPaymentId) {
      const promotedPaymentId = await promotePendingStripePaymentToRecorded({
        admin,
        row: canonicalExistingPayment,
        amountCents: sessionAmountCents,
        processorPaymentReference,
        processorChargeId,
        stripeCheckoutSessionId: checkoutSessionId || null,
        stripePaymentIntentId: paymentIntentId || null,
        stripeChargedAt: chargedAtIso,
        stripeEventId: eventId,
        paidAtIso: new Date().toISOString(),
        note: `Stripe checkout session ${checkoutSessionId || 'unknown session'}`,
      });

      if (promotedPaymentId) {
        await attemptAllocationWebhookDualWrite({
          admin,
          paymentRow: {
            id: promotedPaymentId,
            account_owner_user_id: accountOwnerUserId,
            invoice_id: invoiceId,
            amount_cents: sessionAmountCents,
            payment_status: 'recorded',
          },
          logContext: {
            webhookKind: 'checkout_session',
            eventId,
            invoiceId,
            jobId: invoiceJobId || jobIdFromMetadata || '',
          },
        });

        await insertPaymentRecordedJobEventIfMissing({
          admin,
          jobId: invoiceJobId || jobIdFromMetadata || '',
          paymentId: promotedPaymentId,
          meta: {
            invoice_id: invoiceId,
            invoice_number: invoice.invoice_number,
            payment_id: promotedPaymentId,
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
          paymentId: promotedPaymentId,
        };
      }
    }

    if (canonicalExistingPayment && existingPaymentId) {
      await enrichCanonicalStripePaymentIdentity({
        admin,
        row: canonicalExistingPayment,
        stripeCheckoutSessionId: checkoutSessionId || null,
        stripePaymentIntentId: paymentIntentId || null,
        processorChargeId,
        processorPaymentReference:
          processorChargeId || paymentIntentId || checkoutSessionId || null,
        stripeChargedAt: chargedAtIso,
        paidAtIso: new Date().toISOString(),
        note: `Stripe checkout session ${checkoutSessionId || 'unknown session'}`,
      });
    }

    if (existingPaymentId) {
      await attemptAllocationWebhookDualWrite({
        admin,
        paymentId: existingPaymentId,
        logContext: {
          webhookKind: 'checkout_session',
          eventId,
          invoiceId,
          jobId: invoiceJobId || jobIdFromMetadata || '',
        },
      });
    }

    return {
      recorded: false,
      reason: 'Payment already recorded for Stripe payment identity',
    };
  }

  const canonicalPendingPayment = await resolveCanonicalStripePaymentByIdentity({
    admin,
    accountOwnerUserId,
    invoiceId,
    stripeCheckoutSessionId: checkoutSessionId || null,
    stripePaymentIntentId: paymentIntentId || null,
    processorChargeId,
  });

  if (canonicalPendingPayment?.payment_status === 'pending') {
    const promotedPaymentId = await promotePendingStripePaymentToRecorded({
      admin,
      row: canonicalPendingPayment,
      amountCents: sessionAmountCents,
      processorPaymentReference,
      processorChargeId,
      stripeCheckoutSessionId: checkoutSessionId || null,
      stripePaymentIntentId: paymentIntentId || null,
      stripeChargedAt: chargedAtIso,
      stripeEventId: eventId,
      paidAtIso: new Date().toISOString(),
      note: `Stripe checkout session ${checkoutSessionId || 'unknown session'}`,
    });

    if (promotedPaymentId) {
      await attemptAllocationWebhookDualWrite({
        admin,
        paymentRow: {
          id: promotedPaymentId,
          account_owner_user_id: accountOwnerUserId,
          invoice_id: invoiceId,
          amount_cents: sessionAmountCents,
          payment_status: 'recorded',
        },
        logContext: {
          webhookKind: 'checkout_session',
          eventId,
          invoiceId,
          jobId: invoiceJobId || jobIdFromMetadata || '',
        },
      });

      await insertPaymentRecordedJobEventIfMissing({
        admin,
        jobId: invoiceJobId || jobIdFromMetadata || '',
        paymentId: promotedPaymentId,
        meta: {
          invoice_id: invoiceId,
          invoice_number: invoice.invoice_number,
          payment_id: promotedPaymentId,
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
        paymentId: promotedPaymentId,
      };
    }
  }

  const canonicalBeforeInsert = await resolveCanonicalStripePaymentByIdentity({
    admin,
    accountOwnerUserId,
    invoiceId,
    stripeCheckoutSessionId: checkoutSessionId || null,
    stripePaymentIntentId: paymentIntentId || null,
    processorChargeId,
  });

  if (canonicalBeforeInsert) {
    const canonicalPaymentId = toCleanString(canonicalBeforeInsert.id);

    await enrichCanonicalStripePaymentIdentity({
      admin,
      row: canonicalBeforeInsert,
      stripeCheckoutSessionId: checkoutSessionId || null,
      stripePaymentIntentId: paymentIntentId || null,
      processorChargeId,
      processorPaymentReference,
      stripeChargedAt: chargedAtIso,
      paidAtIso: new Date().toISOString(),
      note: `Stripe checkout session ${checkoutSessionId || 'unknown session'}`,
    });

    await attemptAllocationWebhookDualWrite({
      admin,
      paymentId: canonicalPaymentId,
      logContext: {
        webhookKind: 'checkout_session',
        eventId,
        invoiceId,
        jobId: invoiceJobId || jobIdFromMetadata || '',
      },
    });

    return {
      recorded: false,
      reason: 'Payment already recorded for Stripe payment identity',
      paymentId: canonicalPaymentId,
    };
  }

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
      stripe_identity_dedupe_scope: 'recorded_v1',
    })
    .select('id')
    .single();

  if (insertErr) {
    if (isStripeIdentityUniqueConflict(insertErr)) {
      const canonicalAfterInsertError = await resolveCanonicalStripePaymentByIdentity({
        admin,
        accountOwnerUserId,
        invoiceId,
        stripeCheckoutSessionId: checkoutSessionId || null,
        stripePaymentIntentId: paymentIntentId || null,
        processorChargeId,
      });

      if (canonicalAfterInsertError) {
        const canonicalPaymentId = toCleanString(canonicalAfterInsertError.id);

        await enrichCanonicalStripePaymentIdentity({
          admin,
          row: canonicalAfterInsertError,
          stripeCheckoutSessionId: checkoutSessionId || null,
          stripePaymentIntentId: paymentIntentId || null,
          processorChargeId,
          processorPaymentReference,
          stripeChargedAt: chargedAtIso,
          paidAtIso: new Date().toISOString(),
          note: `Stripe checkout session ${checkoutSessionId || 'unknown session'}`,
        });

        await attemptAllocationWebhookDualWrite({
          admin,
          paymentId: canonicalPaymentId,
          logContext: {
            webhookKind: 'checkout_session',
            eventId,
            invoiceId,
            jobId: invoiceJobId || jobIdFromMetadata || '',
          },
        });

        return {
          recorded: false,
          reason: 'Payment already recorded for Stripe payment identity',
          paymentId: canonicalPaymentId,
        };
      }
    }

    throw new Error(
      `Failed to record checkout session payment: ${insertErr.message ?? 'unknown error'}`,
    );
  }

  await attemptAllocationWebhookDualWrite({
    admin,
    paymentRow: {
      id: toCleanString(insertedPayment?.id),
      account_owner_user_id: accountOwnerUserId,
      invoice_id: invoiceId,
      amount_cents: sessionAmountCents,
      payment_status: 'recorded',
    },
    logContext: {
      webhookKind: 'checkout_session',
      eventId,
      invoiceId,
      jobId: invoiceJobId || jobIdFromMetadata || '',
    },
  });

  await insertPaymentRecordedJobEventIfMissing({
    admin,
    jobId: invoiceJobId || jobIdFromMetadata || '',
    paymentId: insertedPayment?.id ?? null,
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
  const attemptIdFromMetadata = toCleanString(charge.metadata?.attempt_id) || null;

  if (!eventId) {
    return {
      recorded: false,
      reason: 'Missing Stripe event ID for idempotency check',
    };
  }

  // Idempotency: check if this event was already processed
  const alreadyRecorded = await isStripeEventAlreadyRecorded(eventId, admin);
  if (alreadyRecorded) {
    const existingPaymentId = await resolveStripePaymentIdByEventId({
      admin,
      eventId,
    });

    if (existingPaymentId) {
      await attemptAllocationWebhookDualWrite({
        admin,
        paymentId: existingPaymentId,
        logContext: {
          webhookKind: 'charge_succeeded',
          eventId,
          invoiceId: toCleanString(charge.metadata?.invoice_id),
          jobId: toCleanString(charge.metadata?.job_id),
        },
      });

      await resolveManualSavedMethodAttemptFromWebhook({
        admin,
        accountOwnerUserId: toCleanString(charge.metadata?.account_owner_user_id),
        invoiceId: toCleanString(charge.metadata?.invoice_id),
        stripePaymentIntentId: toCleanString(charge.payment_intent) || null,
        stripeChargeId: toCleanString(charge.id) || null,
        stripeEventId: eventId,
        attemptIdFromMetadata: toCleanString(charge.metadata?.attempt_id) || null,
        outcome: 'succeeded',
        resolvedInternalInvoicePaymentId: existingPaymentId,
      });
    }

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

  const invoice = await resolveInternalInvoiceById({
    admin,
    invoiceId,
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

  const effectiveJobId = toCleanString(invoice.job_id) || jobId;

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

  if (
    await resolveJobBlocksOnlineInvoicePayment({
      accountOwnerUserId,
      jobId: effectiveJobId,
      supabase: admin,
    })
  ) {
    return {
      recorded: false,
      reason: 'Invoice already paid or resolved outside online payment',
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
    const canonicalExistingPayment = await resolveCanonicalStripePaymentByIdentity({
      admin,
      accountOwnerUserId,
      invoiceId,
      stripeCheckoutSessionId: toCleanString(charge.metadata?.checkout_session_id) || null,
      stripePaymentIntentId: stripeRef.stripe_payment_intent_id,
      processorChargeId: stripeRef.processor_charge_id,
    });

    const existingPaymentId = toCleanString(canonicalExistingPayment?.id) || null;

    if (canonicalExistingPayment?.payment_status === 'pending' && existingPaymentId) {
      const promotedPaymentId = await promotePendingStripePaymentToRecorded({
        admin,
        row: canonicalExistingPayment,
        amountCents: chargeAmountCents,
        processorPaymentReference: stripeRef.processor_payment_reference || stripeRef.processor_charge_id || eventId,
        processorChargeId: stripeRef.processor_charge_id,
        stripeCheckoutSessionId: toCleanString(charge.metadata?.checkout_session_id) || null,
        stripePaymentIntentId: stripeRef.stripe_payment_intent_id,
        stripeChargedAt: stripeRef.stripe_charged_at,
        stripeEventId: eventId,
        paidAtIso: new Date(charge.created * 1000).toISOString(),
        note: `Stripe charge ${stripeRef.processor_charge_id}`,
      });

      if (promotedPaymentId) {
        await attemptAllocationWebhookDualWrite({
          admin,
          paymentRow: {
            id: promotedPaymentId,
            account_owner_user_id: accountOwnerUserId,
            invoice_id: invoiceId,
            amount_cents: chargeAmountCents,
            payment_status: 'recorded',
          },
          logContext: {
            webhookKind: 'charge_succeeded',
            eventId,
            invoiceId,
            jobId: effectiveJobId,
          },
        });

        await resolveManualSavedMethodAttemptFromWebhook({
          admin,
          accountOwnerUserId,
          invoiceId,
          stripePaymentIntentId: stripeRef.stripe_payment_intent_id,
          stripeChargeId: stripeRef.processor_charge_id,
          stripeEventId: eventId,
          attemptIdFromMetadata,
          outcome: 'succeeded',
          resolvedInternalInvoicePaymentId: promotedPaymentId,
        });

        await insertPaymentRecordedJobEventIfMissing({
          admin,
          jobId: effectiveJobId,
          paymentId: promotedPaymentId,
          meta: {
            invoice_id: invoiceId,
            invoice_number: invoice.invoice_number,
            payment_id: promotedPaymentId,
            payment_status: 'recorded',
            payment_method: 'card_stripe_online',
            amount_cents: chargeAmountCents,
            amount_display: (chargeAmountCents / 100).toFixed(2),
            source: 'stripe_charge_webhook',
            stripe_payment_intent_id: stripeRef.stripe_payment_intent_id,
            stripe_charge_id: stripeRef.processor_charge_id,
            stripe_event_id: eventId,
          },
        });

        return {
          recorded: true,
          paymentId: promotedPaymentId,
        };
      }
    }

    if (canonicalExistingPayment && existingPaymentId) {
      await enrichCanonicalStripePaymentIdentity({
        admin,
        row: canonicalExistingPayment,
        stripeCheckoutSessionId: toCleanString(charge.metadata?.checkout_session_id) || null,
        stripePaymentIntentId: stripeRef.stripe_payment_intent_id,
        processorChargeId: stripeRef.processor_charge_id,
        processorPaymentReference: stripeRef.processor_payment_reference,
        stripeChargedAt: stripeRef.stripe_charged_at,
        paidAtIso: new Date(charge.created * 1000).toISOString(),
        note: `Stripe charge ${stripeRef.processor_charge_id}`,
      });
    }

    if (existingPaymentId) {
      await attemptAllocationWebhookDualWrite({
        admin,
        paymentId: existingPaymentId,
        logContext: {
          webhookKind: 'charge_succeeded',
          eventId,
          invoiceId,
          jobId: effectiveJobId,
        },
      });

      await resolveManualSavedMethodAttemptFromWebhook({
        admin,
        accountOwnerUserId,
        invoiceId,
        stripePaymentIntentId: stripeRef.stripe_payment_intent_id,
        stripeChargeId: stripeRef.processor_charge_id,
        stripeEventId: eventId,
        attemptIdFromMetadata,
        outcome: 'succeeded',
        resolvedInternalInvoicePaymentId: existingPaymentId,
      });
    }

    return {
      recorded: false,
      reason: 'Payment already recorded for Stripe payment identity',
    };
  }

  const canonicalBeforeInsert = await resolveCanonicalStripePaymentByIdentity({
    admin,
    accountOwnerUserId,
    invoiceId,
    stripeCheckoutSessionId: toCleanString(charge.metadata?.checkout_session_id) || null,
    stripePaymentIntentId: stripeRef.stripe_payment_intent_id,
    processorChargeId: stripeRef.processor_charge_id,
  });

  if (canonicalBeforeInsert) {
    const canonicalPaymentId = toCleanString(canonicalBeforeInsert.id);

    await enrichCanonicalStripePaymentIdentity({
      admin,
      row: canonicalBeforeInsert,
      stripeCheckoutSessionId: toCleanString(charge.metadata?.checkout_session_id) || null,
      stripePaymentIntentId: stripeRef.stripe_payment_intent_id,
      processorChargeId: stripeRef.processor_charge_id,
      processorPaymentReference: stripeRef.processor_payment_reference,
      stripeChargedAt: stripeRef.stripe_charged_at,
      paidAtIso: new Date(charge.created * 1000).toISOString(),
      note: `Stripe charge ${stripeRef.processor_charge_id}`,
    });

    await attemptAllocationWebhookDualWrite({
      admin,
      paymentId: canonicalPaymentId,
      logContext: {
        webhookKind: 'charge_succeeded',
        eventId,
        invoiceId,
        jobId: effectiveJobId,
      },
    });

    await resolveManualSavedMethodAttemptFromWebhook({
      admin,
      accountOwnerUserId,
      invoiceId,
      stripePaymentIntentId: stripeRef.stripe_payment_intent_id,
      stripeChargeId: stripeRef.processor_charge_id,
      stripeEventId: eventId,
      attemptIdFromMetadata,
      outcome: 'succeeded',
      resolvedInternalInvoicePaymentId: canonicalPaymentId,
    });

    return {
      recorded: false,
      reason: 'Payment already recorded for Stripe payment identity',
      paymentId: canonicalPaymentId,
    };
  }

  // Insert payment row
  const { data: insertedPayment, error: insertErr } = await admin
    .from('internal_invoice_payments')
    .insert({
      account_owner_user_id: accountOwnerUserId,
      invoice_id: invoiceId,
      job_id: effectiveJobId,
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
      stripe_identity_dedupe_scope: 'recorded_v1',
    })
    .select('id')
    .single();

  if (insertErr) {
    if (isStripeIdentityUniqueConflict(insertErr)) {
      const canonicalAfterInsertError = await resolveCanonicalStripePaymentByIdentity({
        admin,
        accountOwnerUserId,
        invoiceId,
        stripeCheckoutSessionId: toCleanString(charge.metadata?.checkout_session_id) || null,
        stripePaymentIntentId: stripeRef.stripe_payment_intent_id,
        processorChargeId: stripeRef.processor_charge_id,
      });

      if (canonicalAfterInsertError) {
        const canonicalPaymentId = toCleanString(canonicalAfterInsertError.id);

        await enrichCanonicalStripePaymentIdentity({
          admin,
          row: canonicalAfterInsertError,
          stripeCheckoutSessionId: toCleanString(charge.metadata?.checkout_session_id) || null,
          stripePaymentIntentId: stripeRef.stripe_payment_intent_id,
          processorChargeId: stripeRef.processor_charge_id,
          processorPaymentReference: stripeRef.processor_payment_reference,
          stripeChargedAt: stripeRef.stripe_charged_at,
          paidAtIso: new Date(charge.created * 1000).toISOString(),
          note: `Stripe charge ${stripeRef.processor_charge_id}`,
        });

        await attemptAllocationWebhookDualWrite({
          admin,
          paymentId: canonicalPaymentId,
          logContext: {
            webhookKind: 'charge_succeeded',
            eventId,
            invoiceId,
            jobId: effectiveJobId,
          },
        });

        await resolveManualSavedMethodAttemptFromWebhook({
          admin,
          accountOwnerUserId,
          invoiceId,
          stripePaymentIntentId: stripeRef.stripe_payment_intent_id,
          stripeChargeId: stripeRef.processor_charge_id,
          stripeEventId: eventId,
          attemptIdFromMetadata,
          outcome: 'succeeded',
          resolvedInternalInvoicePaymentId: canonicalPaymentId,
        });

        return {
          recorded: false,
          reason: 'Payment already recorded for Stripe payment identity',
          paymentId: canonicalPaymentId,
        };
      }
    }

    throw new Error(
      `Failed to record Stripe charge payment: ${insertErr.message ?? 'unknown error'}`,
    );
  }

  await attemptAllocationWebhookDualWrite({
    admin,
    paymentRow: {
      id: toCleanString(insertedPayment?.id),
      account_owner_user_id: accountOwnerUserId,
      invoice_id: invoiceId,
      amount_cents: chargeAmountCents,
      payment_status: 'recorded',
    },
    logContext: {
      webhookKind: 'charge_succeeded',
      eventId,
      invoiceId,
      jobId: effectiveJobId,
    },
  });

  await resolveManualSavedMethodAttemptFromWebhook({
    admin,
    accountOwnerUserId,
    invoiceId,
    stripePaymentIntentId: stripeRef.stripe_payment_intent_id,
    stripeChargeId: stripeRef.processor_charge_id,
    stripeEventId: eventId,
    attemptIdFromMetadata,
    outcome: 'succeeded',
    resolvedInternalInvoicePaymentId: toCleanString(insertedPayment?.id) || null,
  });

  // Log job event for audit trail
  await insertPaymentRecordedJobEventIfMissing({
    admin,
    jobId: effectiveJobId,
    paymentId: insertedPayment?.id ?? null,
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
  const attemptIdFromMetadata = toCleanString(charge.metadata?.attempt_id) || null;

  if (!eventId) {
    return {
      recorded: false,
      reason: 'Missing Stripe event ID for idempotency check',
    };
  }

  // Idempotency: check if this event was already processed
  const alreadyRecorded = await isStripeEventAlreadyRecorded(eventId, admin);
  if (alreadyRecorded) {
    const existingPaymentId = await resolveStripePaymentIdByEventId({
      admin,
      eventId,
    });

    if (existingPaymentId) {
      await attemptAllocationWebhookDualWrite({
        admin,
        paymentId: existingPaymentId,
        logContext: {
          webhookKind: 'charge_failed',
          eventId,
          invoiceId: toCleanString(charge.metadata?.invoice_id),
          jobId: toCleanString(charge.metadata?.job_id),
        },
      });

      await resolveManualSavedMethodAttemptFromWebhook({
        admin,
        accountOwnerUserId: toCleanString(charge.metadata?.account_owner_user_id),
        invoiceId: toCleanString(charge.metadata?.invoice_id),
        stripePaymentIntentId: toCleanString(charge.payment_intent) || null,
        stripeChargeId: toCleanString(charge.id) || null,
        stripeEventId: eventId,
        attemptIdFromMetadata,
        outcome: 'failed_declined',
        resolvedInternalInvoicePaymentId: existingPaymentId,
      });
    }

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

  const invoice = await resolveInternalInvoiceById({
    admin,
    invoiceId,
  });

  if (!invoice || invoice.account_owner_user_id !== accountOwnerUserId) {
    return {
      recorded: false,
      reason: 'Invoice not found or does not belong to account owner',
    };
  }

  const effectiveJobId = toCleanString(invoice.job_id) || jobId;

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
  const failedOutcome = mapAttemptFailureStatus({
    failureCode: toCleanString(charge.failure_code),
    failureMessage: toCleanString(charge.failure_message),
    paymentIntentStatus: null,
  });

  // Insert failed payment row (does not count toward balance)
  const { data: insertedPayment, error: insertErr } = await admin
    .from('internal_invoice_payments')
    .insert({
      account_owner_user_id: accountOwnerUserId,
      invoice_id: invoiceId,
      job_id: effectiveJobId,
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

  await attemptAllocationWebhookDualWrite({
    admin,
    paymentRow: {
      id: toCleanString(insertedPayment?.id),
      account_owner_user_id: accountOwnerUserId,
      invoice_id: invoiceId,
      amount_cents: chargeAmountCents,
      payment_status: 'failed',
    },
    logContext: {
      webhookKind: 'charge_failed',
      eventId,
      invoiceId,
      jobId: effectiveJobId,
    },
  });

  await resolveManualSavedMethodAttemptFromWebhook({
    admin,
    accountOwnerUserId,
    invoiceId,
    stripePaymentIntentId: stripeRef.stripe_payment_intent_id,
    stripeChargeId: stripeRef.processor_charge_id,
    stripeEventId: eventId,
    attemptIdFromMetadata,
    outcome: failedOutcome,
    resolvedInternalInvoicePaymentId: toCleanString(insertedPayment?.id) || null,
    failureCode: toCleanString(charge.failure_code) || null,
    failureMessage: toCleanString(charge.failure_message) || null,
  });

  // Log job event for audit trail
  await insertJobEvent({
    supabase: admin,
    jobId: effectiveJobId,
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
