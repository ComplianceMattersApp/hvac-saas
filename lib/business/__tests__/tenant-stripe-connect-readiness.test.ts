import { describe, expect, it, vi } from "vitest";
import {
  isTenantStripePaymentReady,
  resolveTenantStripeConnectReadiness,
} from "@/lib/business/tenant-stripe-connect-readiness";

function makeSupabase(row: any) {
  return {
    from: vi.fn((table: string) => {
      if (table !== "internal_business_profiles") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: row, error: null })),
          })),
        })),
      };
    }),
  } as any;
}

describe("tenant Stripe Connect readiness", () => {
  it("no connected account id => not ready", async () => {
    const supabase = makeSupabase({
      stripe_connected_account_id: null,
      stripe_connect_onboarding_status: "complete",
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_details_submitted: true,
      stripe_connect_disabled_reason: null,
      stripe_connect_last_synced_at: "2026-05-19T12:00:00Z",
    });

    const readiness = await resolveTenantStripeConnectReadiness("owner-1", supabase);

    expect(readiness.connectedAccountId).toBeNull();
    expect(readiness.isReady).toBe(false);
  });

  it("connected account but charges disabled => not ready", async () => {
    const readiness = await resolveTenantStripeConnectReadiness(
      "owner-1",
      makeSupabase({
        stripe_connected_account_id: "acct_123",
        stripe_connect_onboarding_status: "complete",
        stripe_charges_enabled: false,
        stripe_payouts_enabled: true,
        stripe_details_submitted: true,
      }),
    );

    expect(readiness.isReady).toBe(false);
  });

  it("connected account but payouts disabled => not ready", async () => {
    const readiness = await resolveTenantStripeConnectReadiness(
      "owner-1",
      makeSupabase({
        stripe_connected_account_id: "acct_123",
        stripe_connect_onboarding_status: "complete",
        stripe_charges_enabled: true,
        stripe_payouts_enabled: false,
        stripe_details_submitted: true,
      }),
    );

    expect(readiness.isReady).toBe(false);
  });

  it("connected account but details not submitted => not ready", async () => {
    const readiness = await resolveTenantStripeConnectReadiness(
      "owner-1",
      makeSupabase({
        stripe_connected_account_id: "acct_123",
        stripe_connect_onboarding_status: "complete",
        stripe_charges_enabled: true,
        stripe_payouts_enabled: true,
        stripe_details_submitted: false,
      }),
    );

    expect(readiness.isReady).toBe(false);
  });

  it("complete onboarding + charges/payouts/details true => ready", async () => {
    const readiness = await resolveTenantStripeConnectReadiness(
      "owner-1",
      makeSupabase({
        stripe_connected_account_id: "acct_123",
        stripe_connect_onboarding_status: "complete",
        stripe_charges_enabled: true,
        stripe_payouts_enabled: true,
        stripe_details_submitted: true,
        stripe_connect_last_synced_at: "2026-05-19T12:00:00Z",
      }),
    );

    expect(readiness.connectedAccountId).toBe("acct_123");
    expect(readiness.onboardingStatus).toBe("complete");
    expect(readiness.chargesEnabled).toBe(true);
    expect(readiness.payoutsEnabled).toBe(true);
    expect(readiness.detailsSubmitted).toBe(true);
    expect(readiness.lastSyncedAt).toBe("2026-05-19T12:00:00Z");
    expect(readiness.isReady).toBe(true);
  });

  it("disabled reason is surfaced", async () => {
    const readiness = await resolveTenantStripeConnectReadiness(
      "owner-1",
      makeSupabase({
        stripe_connected_account_id: "acct_123",
        stripe_connect_onboarding_status: "pending",
        stripe_charges_enabled: false,
        stripe_payouts_enabled: false,
        stripe_details_submitted: false,
        stripe_connect_disabled_reason: "requirements.past_due",
      }),
    );

    expect(readiness.disabledReason).toBe("requirements.past_due");
    expect(readiness.isReady).toBe(false);
  });

  it("helper does not call Stripe", async () => {
    const stripeSpy = vi.fn();
    const supabase = makeSupabase({
      stripe_connected_account_id: "acct_123",
      stripe_connect_onboarding_status: "complete",
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_details_submitted: true,
    });

    await resolveTenantStripeConnectReadiness("owner-1", supabase);

    expect(stripeSpy).not.toHaveBeenCalled();
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.from).toHaveBeenCalledWith("internal_business_profiles");
  });

  it("pure readiness helper mirrors required gate", () => {
    expect(
      isTenantStripePaymentReady({
        connectedAccountId: "acct_123",
        onboardingStatus: "complete",
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
      }),
    ).toBe(true);

    expect(
      isTenantStripePaymentReady({
        connectedAccountId: "acct_123",
        onboardingStatus: "pending",
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
      }),
    ).toBe(false);
  });
});
