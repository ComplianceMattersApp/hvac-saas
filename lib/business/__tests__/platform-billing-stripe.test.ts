import { describe, expect, it, vi } from "vitest";
import {
  buildPlatformEntitlementStripePatch,
  createPlatformSubscriptionCheckoutSession,
  derivePlatformCheckoutSeatQuantity,
  mapStripeSubscriptionStatusToEntitlementStatus,
  reconcilePlatformSubscriptionSeatQuantity,
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

  it("derives checkout seat quantity with a minimum of one", () => {
    expect(derivePlatformCheckoutSeatQuantity(5)).toBe(5);
    expect(derivePlatformCheckoutSeatQuantity(1)).toBe(1);
    expect(derivePlatformCheckoutSeatQuantity(0)).toBe(1);
  });

  it("uses active internal seat count for initial checkout quantity", async () => {
    process.env.APP_URL = "https://app.example.com";
    process.env.STRIPE_PRICE_ID = "price_123";

    const entitlementRow = {
      account_owner_user_id: "owner_1",
      plan_key: "starter",
      entitlement_status: "active",
      seat_limit: 10,
      trial_ends_at: null,
      entitlement_valid_until: null,
      notes: null,
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: null,
      stripe_price_id: null,
      stripe_subscription_status: "active",
      stripe_current_period_end: null,
      stripe_cancel_at_period_end: false,
      stripe_last_webhook_event_id: null,
      stripe_last_synced_at: null,
    };

    const admin = {
      from: (table: string) => {
        if (table === "internal_users") {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({ data: null, count: 3, error: null }),
              }),
            }),
          };
        }

        if (table === "platform_account_entitlements") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: entitlementRow, error: null }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const stripe = {
      checkout: {
        sessions: {
          create: async (payload: any) => ({
            id: "cs_test_123",
            url: "https://checkout.stripe.test/session",
            payload,
          }),
        },
      },
      customers: {
        create: async () => ({ id: "cus_new" }),
      },
      subscriptions: {
        update: async () => ({ id: "sub_unused" }),
      },
    } as any;

    const checkoutCreateSpy = vi.spyOn(stripe.checkout.sessions, "create");
    const subscriptionUpdateSpy = vi.spyOn(stripe.subscriptions, "update");

    const result = await createPlatformSubscriptionCheckoutSession({
      accountOwnerUserId: "owner_1",
      admin,
      stripe,
      successUrl: "https://app.example.com/success",
      cancelUrl: "https://app.example.com/cancel",
    });

    expect(result.url).toBe("https://checkout.stripe.test/session");
    expect(checkoutCreateSpy).toHaveBeenCalledTimes(1);
    expect(checkoutCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_existing",
        line_items: [
          expect.objectContaining({
            price: "price_123",
            quantity: 3,
          }),
        ],
      }),
    );
    expect(subscriptionUpdateSpy).not.toHaveBeenCalled();
  });

  it("falls back checkout quantity to 1 when active internal seat count is 0", async () => {
    process.env.APP_URL = "https://app.example.com";
    process.env.STRIPE_PRICE_ID = "price_123";

    const entitlementRow = {
      account_owner_user_id: "owner_1",
      plan_key: "starter",
      entitlement_status: "active",
      seat_limit: 3,
      trial_ends_at: null,
      entitlement_valid_until: null,
      notes: null,
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: null,
      stripe_price_id: null,
      stripe_subscription_status: "active",
      stripe_current_period_end: null,
      stripe_cancel_at_period_end: false,
      stripe_last_webhook_event_id: null,
      stripe_last_synced_at: null,
    };

    const admin = {
      from: (table: string) => {
        if (table === "internal_users") {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({ data: null, count: 0, error: null }),
              }),
            }),
          };
        }

        if (table === "platform_account_entitlements") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: entitlementRow, error: null }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const stripe = {
      checkout: {
        sessions: {
          create: async (_payload: any) => ({
            id: "cs_test_123",
            url: "https://checkout.stripe.test/session",
          }),
        },
      },
      customers: {
        create: async () => ({ id: "cus_new" }),
      },
      subscriptions: {
        update: async () => ({ id: "sub_unused" }),
      },
    } as any;

    const checkoutCreateSpy = vi.spyOn(stripe.checkout.sessions, "create");
    const subscriptionUpdateSpy = vi.spyOn(stripe.subscriptions, "update");

    await createPlatformSubscriptionCheckoutSession({
      accountOwnerUserId: "owner_1",
      admin,
      stripe,
    });

    expect(checkoutCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            quantity: 1,
          }),
        ],
      }),
    );
    expect(subscriptionUpdateSpy).not.toHaveBeenCalled();
  });

  it("keeps comped/internal accounts protected from checkout quantity billing", async () => {
    process.env.APP_URL = "https://app.example.com";
    process.env.STRIPE_PRICE_ID = "price_123";

    const entitlementRow = {
      account_owner_user_id: "owner_1",
      plan_key: "starter",
      entitlement_status: "active",
      seat_limit: null,
      trial_ends_at: null,
      entitlement_valid_until: null,
      notes: "internal_comped_v1",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      stripe_price_id: null,
      stripe_subscription_status: null,
      stripe_current_period_end: null,
      stripe_cancel_at_period_end: false,
      stripe_last_webhook_event_id: null,
      stripe_last_synced_at: null,
    };

    const admin = {
      from: (table: string) => {
        if (table === "internal_users") {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({ data: null, count: 12, error: null }),
              }),
            }),
          };
        }

        if (table === "platform_account_entitlements") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: entitlementRow, error: null }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const stripe = {
      checkout: {
        sessions: {
          create: async (_payload: any) => ({
            id: "cs_test_123",
            url: "https://checkout.stripe.test/session",
          }),
        },
      },
      customers: {
        create: async () => ({ id: "cus_new" }),
      },
      subscriptions: {
        update: async () => ({ id: "sub_unused" }),
      },
    } as any;

    const checkoutCreateSpy = vi.spyOn(stripe.checkout.sessions, "create");
    const customerCreateSpy = vi.spyOn(stripe.customers, "create");
    const subscriptionUpdateSpy = vi.spyOn(stripe.subscriptions, "update");

    await expect(
      createPlatformSubscriptionCheckoutSession({
        accountOwnerUserId: "owner_1",
        admin,
        stripe,
      }),
    ).rejects.toThrow(/internal comped/i);

    expect(checkoutCreateSpy).not.toHaveBeenCalled();
    expect(customerCreateSpy).not.toHaveBeenCalled();
    expect(subscriptionUpdateSpy).not.toHaveBeenCalled();
  });

  it("reconciles Stripe quantity when exactly one matching subscription item exists", async () => {
    process.env.STRIPE_PRICE_ID = "price_123";

    const admin = {
      from: (table: string) => {
        if (table === "internal_users") {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({ data: null, count: 4, error: null }),
              }),
            }),
          };
        }

        if (table === "platform_account_entitlements") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    account_owner_user_id: "owner_1",
                    plan_key: "starter",
                    entitlement_status: "active",
                    seat_limit: 12,
                    notes: null,
                    stripe_customer_id: "cus_123",
                    stripe_subscription_id: "sub_123",
                    stripe_subscription_status: "active",
                    stripe_current_period_end: null,
                    stripe_cancel_at_period_end: false,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => ({
          id: "sub_123",
          items: {
            data: [
              { id: "si_123", price: { id: "price_123" } },
              { id: "si_other", price: { id: "price_other" } },
            ],
          },
        })),
      },
      subscriptionItems: {
        update: vi.fn(async () => ({ id: "si_123", quantity: 4 })),
      },
    } as any;

    const result = await reconcilePlatformSubscriptionSeatQuantity({
      accountOwnerUserId: "owner_1",
      admin,
      stripe,
    });

    expect(result).toEqual(
      expect.objectContaining({
        skipped: false,
        reason: "updated",
        quantity: 4,
      }),
    );
    expect(stripe.subscriptionItems.update).toHaveBeenCalledWith("si_123", {
      quantity: 4,
      proration_behavior: "none",
    });
  });

  it("skips reconciliation when no matching subscription item exists", async () => {
    process.env.STRIPE_PRICE_ID = "price_123";

    const admin = {
      from: (table: string) => {
        if (table === "internal_users") {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({ data: null, count: 2, error: null }),
              }),
            }),
          };
        }

        if (table === "platform_account_entitlements") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    account_owner_user_id: "owner_1",
                    plan_key: "starter",
                    entitlement_status: "active",
                    seat_limit: 6,
                    notes: null,
                    stripe_customer_id: "cus_123",
                    stripe_subscription_id: "sub_123",
                    stripe_subscription_status: "active",
                    stripe_current_period_end: null,
                    stripe_cancel_at_period_end: false,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => ({
          id: "sub_123",
          items: {
            data: [{ id: "si_other", price: { id: "price_other" } }],
          },
        })),
      },
      subscriptionItems: {
        update: vi.fn(async () => ({ id: "unused" })),
      },
    } as any;

    const result = await reconcilePlatformSubscriptionSeatQuantity({
      accountOwnerUserId: "owner_1",
      admin,
      stripe,
    });

    expect(result).toEqual(
      expect.objectContaining({
        skipped: true,
        reason: "no_matching_subscription_item",
      }),
    );
    expect(stripe.subscriptionItems.update).not.toHaveBeenCalled();
  });

  it("skips reconciliation when multiple matching subscription items exist", async () => {
    process.env.STRIPE_PRICE_ID = "price_123";

    const admin = {
      from: (table: string) => {
        if (table === "internal_users") {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({ data: null, count: 2, error: null }),
              }),
            }),
          };
        }

        if (table === "platform_account_entitlements") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    account_owner_user_id: "owner_1",
                    plan_key: "starter",
                    entitlement_status: "active",
                    seat_limit: 6,
                    notes: null,
                    stripe_customer_id: "cus_123",
                    stripe_subscription_id: "sub_123",
                    stripe_subscription_status: "active",
                    stripe_current_period_end: null,
                    stripe_cancel_at_period_end: false,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => ({
          id: "sub_123",
          items: {
            data: [
              { id: "si_1", price: { id: "price_123" } },
              { id: "si_2", price: { id: "price_123" } },
            ],
          },
        })),
      },
      subscriptionItems: {
        update: vi.fn(async () => ({ id: "unused" })),
      },
    } as any;

    const result = await reconcilePlatformSubscriptionSeatQuantity({
      accountOwnerUserId: "owner_1",
      admin,
      stripe,
    });

    expect(result).toEqual(
      expect.objectContaining({
        skipped: true,
        reason: "multiple_matching_subscription_items",
      }),
    );
    expect(stripe.subscriptionItems.update).not.toHaveBeenCalled();
  });

  it("skips reconciliation for comped/internal accounts", async () => {
    process.env.STRIPE_PRICE_ID = "price_123";

    const admin = {
      from: (table: string) => {
        if (table === "internal_users") {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({ data: null, count: 8, error: null }),
              }),
            }),
          };
        }

        if (table === "platform_account_entitlements") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    account_owner_user_id: "owner_1",
                    plan_key: "starter",
                    entitlement_status: "active",
                    seat_limit: null,
                    notes: "internal_comped_v1",
                    stripe_customer_id: null,
                    stripe_subscription_id: null,
                    stripe_subscription_status: null,
                    stripe_current_period_end: null,
                    stripe_cancel_at_period_end: false,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => ({ id: "sub_unused", items: { data: [] } })),
      },
      subscriptionItems: {
        update: vi.fn(async () => ({ id: "unused" })),
      },
    } as any;

    const result = await reconcilePlatformSubscriptionSeatQuantity({
      accountOwnerUserId: "owner_1",
      admin,
      stripe,
    });

    expect(result).toEqual(
      expect.objectContaining({
        skipped: true,
        reason: "internal_comped",
      }),
    );
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(stripe.subscriptionItems.update).not.toHaveBeenCalled();
  });

  it("skips reconciliation when no Stripe subscription is linked", async () => {
    process.env.STRIPE_PRICE_ID = "price_123";

    const admin = {
      from: (table: string) => {
        if (table === "internal_users") {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({ data: null, count: 2, error: null }),
              }),
            }),
          };
        }

        if (table === "platform_account_entitlements") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    account_owner_user_id: "owner_1",
                    plan_key: "starter",
                    entitlement_status: "active",
                    seat_limit: 5,
                    notes: null,
                    stripe_customer_id: "cus_123",
                    stripe_subscription_id: null,
                    stripe_subscription_status: null,
                    stripe_current_period_end: null,
                    stripe_cancel_at_period_end: false,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => ({ id: "sub_unused", items: { data: [] } })),
      },
      subscriptionItems: {
        update: vi.fn(async () => ({ id: "unused" })),
      },
    } as any;

    const result = await reconcilePlatformSubscriptionSeatQuantity({
      accountOwnerUserId: "owner_1",
      admin,
      stripe,
    });

    expect(result).toEqual(
      expect.objectContaining({
        skipped: true,
        reason: "missing_subscription",
      }),
    );
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(stripe.subscriptionItems.update).not.toHaveBeenCalled();
  });
});