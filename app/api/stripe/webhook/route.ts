import Stripe from "stripe";
import { NextResponse } from "next/server";
import {
  getPlatformBillingAvailability,
  getStripeServerClient,
  getStripeWebhookSecrets,
  syncPlatformEntitlementFromCheckoutSession,
  syncPlatformEntitlementFromStripeSubscriptionEvent,
} from "@/lib/business/platform-billing-stripe";
import {
  closeTenantInvoicePendingPaymentFromExpiredCheckoutSession,
  recordTenantInvoicePaymentFromCheckoutSession,
  recordTenantInvoicePaymentFromStripeCharge,
  recordTenantInvoicePaymentFailureFromStripeCharge,
  recordTenantInvoiceRefundFromStripeCharge,
  recordTenantInvoiceDisputeFromStripe,
} from "@/lib/business/tenant-invoice-stripe-webhooks";
import { recordTenantSavedPaymentMethodSetupFromCheckoutSession } from "@/lib/business/tenant-saved-payment-method-setups";
import { createAdminClient } from "@/lib/supabase/server";
import { deliverInternalPaymentReceivedEmail } from "@/lib/payments/payment-received-email";
import { autoSyncRecordedPaymentToQbo } from "@/lib/qbo/qbo-payment-auto-sync";
import { autoSyncRecordedPaymentSettlement } from "@/lib/business/stripe-settlement-auto-sync";
import { releaseInvoiceCollectionReservation } from "@/lib/business/invoice-collection-reservations";

type TenantPaymentWebhookResult = {
  recorded?: boolean;
  closed?: boolean;
  paymentId?: string;
  reason?: string;
};

function throwIfTenantMoneyEventShouldRetry(result: TenantPaymentWebhookResult) {
  if (result.paymentId) return;
  const reason = String(result.reason ?? "").trim();
  if (
    reason === "Missing connected account context"
    || reason === "Tenant connected account is not ready"
    || reason === "Event already recorded (idempotency check)"
  ) {
    throw new Error(`Retryable tenant payment webhook result: ${reason}`);
  }
}

function throwIfTenantMoneyOutEventShouldRetry(
  result: { applied: boolean; reason?: string },
  kind: 'refund' | 'dispute',
) {
  if (result.applied) return;
  const reason = String(result.reason ?? '').trim();
  if (
    reason === 'Tenant connected account is not ready'
    || (kind === 'refund' && reason.startsWith('No matching payment for the '))
    || (kind === 'refund' && reason.startsWith('Could not resolve the account for the '))
  ) {
    throw new Error(`Retryable tenant money-out webhook result: ${reason}`);
  }
}

async function releaseCollectionReservationForStripeObject(object: {
  id?: string | null;
  metadata?: Record<string, string> | null;
}) {
  const accountOwnerUserId = String(object.metadata?.account_owner_user_id ?? "").trim();
  const invoiceId = String(object.metadata?.invoice_id ?? "").trim();
  const reservationKey = String(object.metadata?.collection_reservation_key ?? "").trim();
  if (!accountOwnerUserId || !invoiceId || !reservationKey) return;

  await releaseInvoiceCollectionReservation({
    supabase: createAdminClient(),
    accountOwnerUserId,
    invoiceId,
    reservationKey,
  });
}

async function notifyNewRecordedPayment(result: { recorded: boolean; paymentId?: string }) {
  // A Stripe retry or the companion success event can resolve an already-
  // recorded row. Re-run every idempotent downstream step whenever we know the
  // canonical payment id so a crash after the truth write cannot strand QBO,
  // settlement, or receipt delivery forever.
  if (!result.paymentId) return;
  try {
    const settlementResult = await autoSyncRecordedPaymentSettlement({ paymentId: result.paymentId });
    if (settlementResult.status !== "synced") {
      console.warn("Stripe settlement sync did not complete after payment truth was recorded", {
        paymentId: result.paymentId,
        status: settlementResult.status,
        code: settlementResult.code,
      });
    }
  } catch (error) {
    console.warn("Stripe settlement sync failed after payment truth was recorded", {
      paymentId: result.paymentId,
      message: error instanceof Error ? error.message : "unknown_error",
    });
  }
  try {
    const qboResult = await autoSyncRecordedPaymentToQbo({ paymentId: result.paymentId });
    if (qboResult && qboResult.status !== "synced") {
      console.warn("QBO payment sync did not complete after Stripe payment truth was recorded", {
        paymentId: result.paymentId,
        status: qboResult.status,
        message: qboResult.error ?? "unknown_error",
      });
    }
  } catch (error) {
    console.warn("QBO payment sync failed after Stripe payment truth was recorded", {
      paymentId: result.paymentId,
      message: error instanceof Error ? error.message : "unknown_error",
    });
  }
  try {
    await deliverInternalPaymentReceivedEmail({ paymentId: result.paymentId });
  } catch (error) {
    console.warn("Payment received email failed after Stripe payment truth was recorded", {
      paymentId: result.paymentId,
      message: error instanceof Error ? error.message : "unknown_error",
    });
  }
}

const HANDLED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.expired",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.succeeded",
  "charge.failed",
  // Money leaving. Without these, a refund or chargeback issued from the Stripe
  // dashboard never reaches EveryStep: the invoice stays marked paid, the job
  // stays closed, and nothing detects it.
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
]);

function getStripeSignature(request: Request) {
  return request.headers.get("stripe-signature") ?? "";
}

export async function POST(request: Request) {
  const availability = getPlatformBillingAvailability();
  if (!availability.webhookAvailable) {
    return NextResponse.json(
      {
        error: "Stripe webhook is not configured.",
        missingKeys: availability.missingKeys,
      },
      { status: 503 },
    );
  }

  const payload = await request.text();
  const signature = getStripeSignature(request);
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const stripe = getStripeServerClient();
  let event: Stripe.Event | null = null;

  // One secret per Stripe event destination (account-scoped + connected-accounts),
  // both pointed at this endpoint — verify against each until one matches.
  let verificationError: unknown = null;
  for (const secret of getStripeWebhookSecrets()) {
    try {
      event = stripe.webhooks.constructEvent(payload, signature, secret);
      break;
    } catch (error) {
      verificationError = error;
    }
  }
  if (!event) {
    const message = verificationError instanceof Error
      ? verificationError.message
      : "Invalid Stripe signature.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!HANDLED_EVENT_TYPES.has(event.type)) {
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const connectedAccountId = typeof event.account === "string"
        ? event.account.trim()
        : "";

      if (session.mode === "payment") {
        const paymentResult = await recordTenantInvoicePaymentFromCheckoutSession({
          session,
          eventId: event.id,
          connectedAccountId,
          stripe,
        });
        throwIfTenantMoneyEventShouldRetry(paymentResult);
        if (paymentResult.paymentId) {
          await releaseCollectionReservationForStripeObject(session);
        }
        await notifyNewRecordedPayment(paymentResult);

        return NextResponse.json({ received: true });
      }

      if (session.mode === "setup") {
        const admin = createAdminClient();

        await recordTenantSavedPaymentMethodSetupFromCheckoutSession({
          session,
          eventId: event.id,
          connectedAccountId,
          eventType: event.type,
          livemode: event.livemode,
          apiVersion: event.api_version ?? null,
          admin,
          stripe,
        });

        return NextResponse.json({ received: true });
      }

      // Only process subscription-mode sessions that our platform created.
      // Unmanaged or fixture sessions (no metadata owner, wrong mode, missing
      // customer/subscription IDs) are not actionable — acknowledge and skip.
      const metadataOwnerId =
        typeof session.metadata?.account_owner_user_id === "string"
          ? session.metadata.account_owner_user_id.trim()
          : "";
      const isSubscriptionMode = session.mode === "subscription";
      const hasCustomer =
        typeof session.customer === "string" && session.customer.trim().length > 0;
      const hasSubscription =
        typeof session.subscription === "string" && session.subscription.trim().length > 0;

      if (!metadataOwnerId || !isSubscriptionMode || !hasCustomer || !hasSubscription) {
        return NextResponse.json({ received: true, ignored: true });
      }

      await syncPlatformEntitlementFromCheckoutSession({
        session,
        eventId: event.id,
        stripe,
      });
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "payment") {
        const closeResult = await closeTenantInvoicePendingPaymentFromExpiredCheckoutSession({ session });
        if (closeResult.closed) {
          await releaseCollectionReservationForStripeObject(session);
        }
      }
      return NextResponse.json({ received: true });
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await syncPlatformEntitlementFromStripeSubscriptionEvent({
        subscription: event.data.object as Stripe.Subscription,
        eventId: event.id,
      });
    }

    if (event.type === "charge.succeeded") {
      const charge = event.data.object as Stripe.Charge;
      const connectedAccountId = typeof event.account === "string"
        ? event.account.trim()
        : "";

      // Charge.succeeded can come from multiple sources (subscriptions, payment intents, etc).
      // We only process if metadata includes invoice_id (tenant customer invoice payment).
      // Platform subscription charges have no invoice_id, so they're safely ignored.
      const invoiceId = typeof charge.metadata?.invoice_id === "string"
        ? charge.metadata.invoice_id.trim()
        : "";

      if (invoiceId) {
        const paymentResult = await recordTenantInvoicePaymentFromStripeCharge({
          charge,
          eventId: event.id,
          connectedAccountId,
        });
        throwIfTenantMoneyEventShouldRetry(paymentResult);
        if (paymentResult.paymentId) {
          await releaseCollectionReservationForStripeObject(charge);
        }
        await notifyNewRecordedPayment(paymentResult);
      }
    }

    if (event.type === "charge.failed") {
      const charge = event.data.object as Stripe.Charge;
      const connectedAccountId = typeof event.account === "string"
        ? event.account.trim()
        : "";

      // Similar to charge.succeeded, only process if this is a tenant invoice payment
      const invoiceId = typeof charge.metadata?.invoice_id === "string"
        ? charge.metadata.invoice_id.trim()
        : "";

      if (invoiceId) {
        const failureResult = await recordTenantInvoicePaymentFailureFromStripeCharge({
          charge,
          eventId: event.id,
          connectedAccountId,
        });
        throwIfTenantMoneyEventShouldRetry(failureResult);
        if (failureResult.paymentId) {
          await releaseCollectionReservationForStripeObject(charge);
        }
      }
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const connectedAccountId = typeof event.account === "string" ? event.account.trim() : "";
      const invoiceId = typeof charge.metadata?.invoice_id === "string"
        ? charge.metadata.invoice_id.trim()
        : "";

      if (invoiceId) {
        const refundResult = await recordTenantInvoiceRefundFromStripeCharge({
          charge,
          eventId: event.id,
          connectedAccountId,
        });
        throwIfTenantMoneyOutEventShouldRetry(refundResult, 'refund');
      }
    }

    if (event.type === "charge.dispute.created" || event.type === "charge.dispute.closed") {
      // Disputes do not reliably carry our metadata, so the handler resolves the
      // account from the payment row the original charge produced.
      const disputeResult = await recordTenantInvoiceDisputeFromStripe({
        dispute: event.data.object as Stripe.Dispute,
        eventId: event.id,
        closed: event.type === "charge.dispute.closed",
        connectedAccountId: typeof event.account === "string" ? event.account.trim() : "",
      });
      throwIfTenantMoneyOutEventShouldRetry(disputeResult, 'dispute');
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
