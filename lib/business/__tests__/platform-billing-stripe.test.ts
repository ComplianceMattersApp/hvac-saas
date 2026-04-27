import { describe, expect, it } from "vitest";
import {
  buildPlatformEntitlementStripePatch,
  mapStripeSubscriptionStatusToEntitlementStatus,
} from "@/lib/business/platform-billing-stripe";

describe("platform-billing-stripe", () => {
  it.each([
    ["trialing", "trial"],
    ["active", "active"],
    ["past_due", "grace"],
    ["canceled", "cancelled"],
    ["unpaid", "suspended"],
    ["incomplete", "suspended"],
  ] as const)(
    "maps Stripe subscription status %s to entitlement status %s",
    (input, expected) => {
      expect(mapStripeSubscriptionStatusToEntitlementStatus(input)).toBe(expected);
    },
  );

  it("builds a platform entitlement patch from subscription payload", () => {
    const patch = buildPlatformEntitlementStripePatch({
      eventId: "evt_123",
      subscription: {
        id: "sub_123",
        customer: "cus_123",
        status: "active",
        trial_end: 1790985600,
        cancel_at_period_end: false,
        items: {
          data: [
            {
              current_period_end: 1793577600,
              price: {
                id: "price_123",
              },
            },
          ],
        },
      },
    });

    expect(patch.stripe_customer_id).toBe("cus_123");
    expect(patch.stripe_subscription_id).toBe("sub_123");
    expect(patch.stripe_price_id).toBe("price_123");
    expect(patch.stripe_subscription_status).toBe("active");
    expect(patch.entitlement_status).toBe("active");
    expect(patch.stripe_last_webhook_event_id).toBe("evt_123");
    expect(patch.stripe_last_synced_at).toBeTruthy();
    expect(patch.stripe_current_period_end).toBeTruthy();
    expect(patch.trial_ends_at).toBeTruthy();
  });
});