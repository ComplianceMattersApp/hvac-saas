import Stripe from "stripe";
import { NextResponse } from "next/server";
import {
  getPlatformBillingAvailability,
  getStripeServerClient,
  requireStripeWebhookSecret,
  syncPlatformEntitlementFromCheckoutSession,
  syncPlatformEntitlementFromStripeSubscriptionEvent,
} from "@/lib/business/platform-billing-stripe";

const HANDLED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
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

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}