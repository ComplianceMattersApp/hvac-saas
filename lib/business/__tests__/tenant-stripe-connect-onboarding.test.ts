import { describe, expect, it, vi } from "vitest";
import {
  createTenantStripeConnectOnboardingLink,
  ensureTenantStripeConnectedAccount,
  normalizeStripeConnectError,
  syncTenantStripeConnectReadinessForAccountOwner,
} from "@/lib/business/tenant-stripe-connect-onboarding";

vi.mock("@/lib/business/platform-billing-stripe", () => ({
  getStripeServerClient: vi.fn(),
  resolvePlatformBillingAppUrl: vi.fn(() => "http://localhost:3000"),
}));

type ProfileRow = {
  account_owner_user_id: string;
  display_name: string;
  stripe_connected_account_id: string | null;
  stripe_connect_onboarding_status?: string | null;
  stripe_charges_enabled?: boolean | null;
  stripe_payouts_enabled?: boolean | null;
  stripe_details_submitted?: boolean | null;
  stripe_connect_disabled_reason?: string | null;
  stripe_connect_last_synced_at?: string | null;
};

function buildAdmin(profile: ProfileRow) {
  const updates: Array<Record<string, unknown>> = [];

  const admin = {
    from(table: string) {
      if (table !== "internal_business_profiles") {
        throw new Error(`Unexpected table: ${table}`);
      }

      const query: any = {
        _updatePayload: null as Record<string, unknown> | null,
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: string) => {
          if (column === "account_owner_user_id" && value !== profile.account_owner_user_id) {
            throw new Error("Unexpected account_owner_user_id");
          }

          if (query._updatePayload) {
            updates.push(query._updatePayload);
            Object.assign(profile, query._updatePayload);
          }

          return query;
        }),
        maybeSingle: vi.fn(async () => ({ data: profile, error: null })),
        single: vi.fn(async () => ({ data: profile, error: null })),
        upsert: vi.fn(async (payload: Record<string, unknown>) => {
          Object.assign(profile, payload);
          return { data: profile, error: null };
        }),
        update: vi.fn((payload: Record<string, unknown>) => {
          query._updatePayload = payload;
          return query;
        }),
      };

      return query;
    },
  };

  return {
    admin,
    updates,
    profile,
  };
}

describe("tenant Stripe Connect onboarding helper", () => {
  it("normalizes stripe-like errors without secrets", () => {
    const diagnostic = normalizeStripeConnectError(
      {
        name: "StripeInvalidRequestError",
        type: "StripeInvalidRequestError",
        code: "parameter_invalid_string_empty",
        decline_code: "do_not_honor",
        statusCode: 400,
        requestId: "req_123",
        message: "Missing required param: refresh_url",
      },
      "stripe.accountLinks.create",
    );

    expect(diagnostic).toEqual({
      stage: "stripe.accountLinks.create",
      name: "StripeInvalidRequestError",
      type: "StripeInvalidRequestError",
      code: "parameter_invalid_string_empty",
      declineCode: "do_not_honor",
      httpStatus: 400,
      requestId: "req_123",
      message: "Missing required param: refresh_url",
    });
  });

  it("creates connected account only when missing and stores connected account id", async () => {
    const fixture = buildAdmin({
      account_owner_user_id: "owner-1",
      display_name: "Company",
      stripe_connected_account_id: null,
    });

    const stripe = {
      accounts: {
        create: vi.fn(async () => ({ id: "acct_new_1" })),
      },
    } as any;

    const result = await ensureTenantStripeConnectedAccount({
      accountOwnerUserId: "owner-1",
      admin: fixture.admin,
      stripe,
    });

    expect(result.connectedAccountId).toBe("acct_new_1");
    expect(result.created).toBe(true);
    expect(stripe.accounts.create).toHaveBeenCalledTimes(1);
    expect(fixture.profile.stripe_connected_account_id).toBe("acct_new_1");
  });

  it("reuses existing connected account and does not create a new account", async () => {
    const fixture = buildAdmin({
      account_owner_user_id: "owner-1",
      display_name: "Company",
      stripe_connected_account_id: "acct_existing_1",
    });

    const stripe = {
      accounts: {
        create: vi.fn(async () => ({ id: "acct_new_1" })),
      },
    } as any;

    const result = await ensureTenantStripeConnectedAccount({
      accountOwnerUserId: "owner-1",
      admin: fixture.admin,
      stripe,
    });

    expect(result.connectedAccountId).toBe("acct_existing_1");
    expect(result.created).toBe(false);
    expect(stripe.accounts.create).not.toHaveBeenCalled();
  });

  it("creates Stripe-hosted onboarding link and does not create invoice checkout session", async () => {
    const fixture = buildAdmin({
      account_owner_user_id: "owner-1",
      display_name: "Company",
      stripe_connected_account_id: null,
    });

    const checkoutCreate = vi.fn();
    const stripe = {
      accounts: {
        create: vi.fn(async () => ({ id: "acct_new_1" })),
      },
      accountLinks: {
        create: vi.fn(async () => ({ url: "https://connect.stripe.com/setup/s/test" })),
      },
      checkout: {
        sessions: {
          create: checkoutCreate,
        },
      },
    } as any;

    const result = await createTenantStripeConnectOnboardingLink({
      accountOwnerUserId: "owner-1",
      admin: fixture.admin,
      stripe,
    });

    expect(result.url).toBe("https://connect.stripe.com/setup/s/test");
    expect(result.connectedAccountId).toBe("acct_new_1");
    expect(stripe.accountLinks.create).toHaveBeenCalledTimes(1);
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it("readiness sync maps Stripe account fields and marks ready when complete-equivalent", async () => {
    const fixture = buildAdmin({
      account_owner_user_id: "owner-1",
      display_name: "Company",
      stripe_connected_account_id: "acct_existing_1",
      stripe_connect_onboarding_status: "pending",
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_details_submitted: false,
      stripe_connect_disabled_reason: null,
      stripe_connect_last_synced_at: null,
    });

    const stripe = {
      accounts: {
        retrieve: vi.fn(async () => ({
          id: "acct_existing_1",
          capabilities: {
            card_payments: "active",
          },
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
          requirements: {
            disabled_reason: null,
          },
        })),
      },
    } as any;

    const readiness = await syncTenantStripeConnectReadinessForAccountOwner({
      accountOwnerUserId: "owner-1",
      admin: fixture.admin,
      stripe,
    });

    expect(readiness.connectedAccountId).toBe("acct_existing_1");
    expect(readiness.onboardingStatus).toBe("complete");
    expect(readiness.chargesEnabled).toBe(true);
    expect(readiness.payoutsEnabled).toBe(true);
    expect(readiness.detailsSubmitted).toBe(true);
    expect(readiness.isReady).toBe(true);
  });

  it("readiness sync surfaces not-ready states", async () => {
    const fixture = buildAdmin({
      account_owner_user_id: "owner-1",
      display_name: "Company",
      stripe_connected_account_id: "acct_existing_1",
      stripe_connect_onboarding_status: "pending",
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_details_submitted: false,
      stripe_connect_disabled_reason: null,
      stripe_connect_last_synced_at: null,
    });

    const stripe = {
      accounts: {
        retrieve: vi.fn(async () => ({
          id: "acct_existing_1",
          capabilities: {
            card_payments: "inactive",
          },
          charges_enabled: false,
          payouts_enabled: true,
          details_submitted: true,
          requirements: {
            disabled_reason: "requirements.past_due",
          },
        })),
      },
    } as any;

    const readiness = await syncTenantStripeConnectReadinessForAccountOwner({
      accountOwnerUserId: "owner-1",
      admin: fixture.admin,
      stripe,
    });

    expect(readiness.chargesEnabled).toBe(false);
    expect(readiness.disabledReason).toBe("requirements.past_due");
    expect(readiness.isReady).toBe(false);
  });

  it("readiness sync does not treat unrequested card_payments capability as ready for invoice payments", async () => {
    const fixture = buildAdmin({
      account_owner_user_id: "owner-1",
      display_name: "Company",
      stripe_connected_account_id: "acct_existing_1",
      stripe_connect_onboarding_status: "pending",
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_details_submitted: false,
      stripe_connect_disabled_reason: null,
      stripe_connect_last_synced_at: null,
    });

    const stripe = {
      accounts: {
        retrieve: vi.fn(async () => ({
          id: "acct_existing_1",
          capabilities: {
            card_payments: "unrequested",
          },
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
          requirements: {
            disabled_reason: null,
          },
        })),
      },
    } as any;

    const readiness = await syncTenantStripeConnectReadinessForAccountOwner({
      accountOwnerUserId: "owner-1",
      admin: fixture.admin,
      stripe,
    });

    expect(readiness.chargesEnabled).toBe(false);
    expect(readiness.isReady).toBe(false);
  });
});
