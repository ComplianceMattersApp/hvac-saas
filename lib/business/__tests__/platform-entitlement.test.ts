/**
 * Tests for platform-entitlement resolver.
 *
 * Coverage:
 * 1. Resolver returns correct context from an existing entitlement row.
 * 2. Resolver returns safe default (no throw) when no row exists.
 * 3. Live internal user seat count is derived from internal_users, not a cached column.
 * 4. isEntitlementActive is true for: trial, active, grace.
 * 5. isEntitlementActive is false for: suspended, cancelled.
 * 6. Stripe placeholder fields do not appear in resolver output.
 * 7. Seat count reflects zero internal users.
 * 8. Seat count reflects multiple active internal users.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveAccountEntitlement,
  type AccountEntitlementContext,
} from "@/lib/business/platform-entitlement";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACCOUNT_OWNER_A = "account-owner-a";
const ACCOUNT_OWNER_B = "account-owner-b";
const ACCOUNT_OWNER_UNKNOWN = "account-owner-unknown";

function makeEntitlementRow(overrides: Partial<{
  plan_key: string;
  entitlement_status: string;
  seat_limit: number | null;
  trial_ends_at: string | null;
  entitlement_valid_until: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
  stripe_current_period_end: string | null;
  stripe_cancel_at_period_end: boolean | null;
}> = {}) {
  return {
    plan_key: "starter",
    entitlement_status: "trial",
    seat_limit: null,
    trial_ends_at: null,
    entitlement_valid_until: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    stripe_subscription_status: null,
    stripe_current_period_end: null,
    stripe_cancel_at_period_end: false,
    ...overrides,
  };
}

function makeSupabase(opts: {
  entitlementRow?: ReturnType<typeof makeEntitlementRow> | null;
  entitlementError?: { message: string } | null;
  internalUserCount?: number;
  internalUserError?: { message: string } | null;
}): any {
  const entitlementData = opts.entitlementRow ?? null;
  const entitlementError = opts.entitlementError ?? null;
  const internalUserCount = opts.internalUserCount ?? 0;
  const internalUserError = opts.internalUserError ?? null;

  return {
    from: vi.fn((table: string) => {
      if (table === "platform_account_entitlements") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: entitlementData,
                error: entitlementError,
              })),
            })),
          })),
        };
      }

      if (table === "internal_users") {
        // Simulate real Supabase head:true behavior: data is null, count is populated
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: null,
                count: internalUserCount,
                error: internalUserError,
              })),
            })),
          })),
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveAccountEntitlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Resolver returns correct context from an existing row
  it("returns correct context from an existing entitlement row", async () => {
    const supabase = makeSupabase({
      entitlementRow: makeEntitlementRow({
        plan_key: "professional",
        entitlement_status: "active",
        seat_limit: 10,
        trial_ends_at: null,
        entitlement_valid_until: "2027-01-01T00:00:00Z",
      }),
      internalUserCount: 3,
    });

    const ctx = await resolveAccountEntitlement(ACCOUNT_OWNER_A, supabase);

    expect(ctx.planKey).toBe("professional");
    expect(ctx.entitlementStatus).toBe("active");
    expect(ctx.isEntitlementActive).toBe(true);
    expect(ctx.seatLimit).toBe(10);
    expect(ctx.activeSeatCount).toBe(3);
    expect(ctx.trialEndsAt).toBeNull();
    expect(ctx.entitlementValidUntil).toBeInstanceOf(Date);
    expect(ctx.billingCustomerLinked).toBe(false);
    expect(ctx.billingSubscriptionLinked).toBe(false);
    expect(ctx.billingSubscriptionStatus).toBeNull();
    expect(ctx.billingCurrentPeriodEnd).toBeNull();
    expect(ctx.billingCancelAtPeriodEnd).toBe(false);
  });

  // 2. Resolver returns safe default when no row exists (no throw)
  it("returns safe default when no entitlement row exists", async () => {
    const supabase = makeSupabase({
      entitlementRow: null,
      internalUserCount: 0,
    });

    const ctx = await resolveAccountEntitlement(ACCOUNT_OWNER_UNKNOWN, supabase);

    expect(ctx.planKey).toBe("starter");
    expect(ctx.entitlementStatus).toBe("trial");
    expect(ctx.isEntitlementActive).toBe(true);
    expect(ctx.seatLimit).toBeNull();
    expect(ctx.activeSeatCount).toBe(0);
    expect(ctx.trialEndsAt).toBeNull();
    expect(ctx.entitlementValidUntil).toBeNull();
    expect(ctx.billingCustomerLinked).toBe(false);
    expect(ctx.billingSubscriptionLinked).toBe(false);
    expect(ctx.billingSubscriptionStatus).toBeNull();
    expect(ctx.billingCurrentPeriodEnd).toBeNull();
    expect(ctx.billingCancelAtPeriodEnd).toBe(false);
  });

  // 3. Live seat count is derived from internal_users
  it("derives seat count live from internal_users", async () => {
    const supabase = makeSupabase({
      entitlementRow: makeEntitlementRow(),
      internalUserCount: 5,
    });

    const ctx = await resolveAccountEntitlement(ACCOUNT_OWNER_A, supabase);

    expect(ctx.activeSeatCount).toBe(5);
    expect(supabase.from).toHaveBeenCalledWith("internal_users");
  });

  // 4. isEntitlementActive is true for trial, active, grace
  it.each(["trial", "active", "grace"] as const)(
    "isEntitlementActive is true for status: %s",
    async (status) => {
      const supabase = makeSupabase({
        entitlementRow: makeEntitlementRow({ entitlement_status: status }),
        internalUserCount: 0,
      });

      const ctx = await resolveAccountEntitlement(ACCOUNT_OWNER_A, supabase);

      expect(ctx.entitlementStatus).toBe(status);
      expect(ctx.isEntitlementActive).toBe(true);
    },
  );

  // 5. isEntitlementActive is false for suspended, cancelled
  it.each(["suspended", "cancelled"] as const)(
    "isEntitlementActive is false for status: %s",
    async (status) => {
      const supabase = makeSupabase({
        entitlementRow: makeEntitlementRow({ entitlement_status: status }),
        internalUserCount: 0,
      });

      const ctx = await resolveAccountEntitlement(ACCOUNT_OWNER_A, supabase);

      expect(ctx.entitlementStatus).toBe(status);
      expect(ctx.isEntitlementActive).toBe(false);
    },
  );

  // 6. Stripe placeholder fields do not appear in resolver output
  it("does not include Stripe fields in resolver output", async () => {
    const supabase = makeSupabase({
      entitlementRow: makeEntitlementRow(),
      internalUserCount: 0,
    });

    const ctx = await resolveAccountEntitlement(ACCOUNT_OWNER_A, supabase);

    expect(ctx).not.toHaveProperty("stripe_customer_id");
    expect(ctx).not.toHaveProperty("stripe_subscription_id");
    expect(ctx).not.toHaveProperty("stripe_price_id");
    const keys = Object.keys(ctx as Record<string, unknown>);
    expect(keys.some((k) => k.toLowerCase().includes("stripe"))).toBe(false);
  });

  // 7. Seat count returns zero when no active internal users
  it("returns activeSeatCount of 0 when no active internal users exist", async () => {
    const supabase = makeSupabase({
      entitlementRow: makeEntitlementRow(),
      internalUserCount: 0,
    });

    const ctx = await resolveAccountEntitlement(ACCOUNT_OWNER_A, supabase);

    expect(ctx.activeSeatCount).toBe(0);
  });

  // 8. Seat count reflects multiple active users
  it("returns correct activeSeatCount for multiple active users", async () => {
    const supabase = makeSupabase({
      entitlementRow: makeEntitlementRow(),
      internalUserCount: 7,
    });

    const ctx = await resolveAccountEntitlement(ACCOUNT_OWNER_A, supabase);

    expect(ctx.activeSeatCount).toBe(7);
  });

  // 9. trial_ends_at is returned as a Date when present
  it("returns trialEndsAt as Date when entitlement row has trial_ends_at", async () => {
    const trialEnd = "2026-06-30T00:00:00Z";
    const supabase = makeSupabase({
      entitlementRow: makeEntitlementRow({
        entitlement_status: "trial",
        trial_ends_at: trialEnd,
      }),
      internalUserCount: 1,
    });

    const ctx = await resolveAccountEntitlement(ACCOUNT_OWNER_A, supabase);

    expect(ctx.trialEndsAt).toBeInstanceOf(Date);
    expect(ctx.trialEndsAt?.toISOString()).toBe(new Date(trialEnd).toISOString());
  });

  // 10. Real DB error throws — must not silently become active trial entitlement
  it("throws when entitlement query returns a real DB error", async () => {
    const supabase = makeSupabase({
      entitlementRow: null,
      entitlementError: { message: "connection error" },
      internalUserCount: 2,
    });

    await expect(
      resolveAccountEntitlement(ACCOUNT_OWNER_A, supabase),
    ).rejects.toThrow("Failed to resolve platform account entitlement");
  });

  // 11. AccountEntitlementContext shape is complete (all fields present)
  it("resolver output contains all expected AccountEntitlementContext fields", async () => {
    const supabase = makeSupabase({
      entitlementRow: makeEntitlementRow(),
      internalUserCount: 0,
    });

    const ctx: AccountEntitlementContext = await resolveAccountEntitlement(
      ACCOUNT_OWNER_A,
      supabase,
    );

    expect(ctx).toHaveProperty("planKey");
    expect(ctx).toHaveProperty("entitlementStatus");
    expect(ctx).toHaveProperty("isEntitlementActive");
    expect(ctx).toHaveProperty("seatLimit");
    expect(ctx).toHaveProperty("activeSeatCount");
    expect(ctx).toHaveProperty("trialEndsAt");
    expect(ctx).toHaveProperty("entitlementValidUntil");
    expect(ctx).toHaveProperty("billingCustomerLinked");
    expect(ctx).toHaveProperty("billingSubscriptionLinked");
    expect(ctx).toHaveProperty("billingSubscriptionStatus");
    expect(ctx).toHaveProperty("billingCurrentPeriodEnd");
    expect(ctx).toHaveProperty("billingCancelAtPeriodEnd");
  });

  it("returns narrow billing summary fields without exposing raw Stripe identifiers", async () => {
    const supabase = makeSupabase({
      entitlementRow: makeEntitlementRow({
        stripe_customer_id: "cus_123",
        stripe_subscription_id: "sub_123",
        stripe_subscription_status: "active",
        stripe_current_period_end: "2027-03-01T00:00:00Z",
        stripe_cancel_at_period_end: true,
      }),
      internalUserCount: 2,
    });

    const ctx = await resolveAccountEntitlement(ACCOUNT_OWNER_A, supabase);

    expect(ctx.billingCustomerLinked).toBe(true);
    expect(ctx.billingSubscriptionLinked).toBe(true);
    expect(ctx.billingSubscriptionStatus).toBe("active");
    expect(ctx.billingCurrentPeriodEnd).toBeInstanceOf(Date);
    expect(ctx.billingCancelAtPeriodEnd).toBe(true);
    expect(ctx).not.toHaveProperty("stripe_customer_id");
    expect(ctx).not.toHaveProperty("stripe_subscription_id");
  });
});
