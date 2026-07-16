import Stripe from "stripe";
import { NextResponse } from "next/server";
import {
  getPlatformBillingAvailability,
  getStripeServerClient,
  requireStripeWebhookSecret,
  syncPlatformEntitlementFromCheckoutSession,
  syncPlatformEntitlementFromStripeSubscriptionEvent,
} from "@/lib/business/platform-billing-stripe";
import {
  recordTenantInvoicePaymentFromCheckoutSession,
  recordTenantInvoicePaymentFromStripeCharge,
  recordTenantInvoicePaymentFailureFromStripeCharge,
} from "@/lib/business/tenant-invoice-stripe-webhooks";
import { recordTenantSavedPaymentMethodSetupFromCheckoutSession } from "@/lib/business/tenant-saved-payment-method-setups";
import { createAdminClient } from "@/lib/supabase/server";
import { deliverInternalPaymentReceivedEmail } from "@/lib/payments/payment-received-email";

async function notifyNewRecordedPayment(result: { recorded: boolean; paymentId?: string }) {
  if (!result.recorded || !result.paymentId) return;
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
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.succeeded",
  "charge.failed",
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
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      requireStripeWebhookSecret(),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Stripe signature.";
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
        await recordTenantInvoicePaymentFailureFromStripeCharge({
          charge,
          eventId: event.id,
          connectedAccountId,
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
