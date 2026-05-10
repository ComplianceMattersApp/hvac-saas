import { describe, expect, it } from "vitest";
import { buildPlatformOwnerDashboardModel } from "@/lib/business/platform-owner-dashboard";

describe("platform owner dashboard model", () => {
  it("aggregates user counts per account and includes product/billing/entitlement fields", () => {
    const model = buildPlatformOwnerDashboardModel({
      businessProfiles: [
        {
          account_owner_user_id: "owner-1",
          display_name: "Acme Service",
          billing_mode: "self_serve",
          created_at: "2026-05-01T00:00:00.000Z",
          updated_at: "2026-05-02T00:00:00.000Z",
        },
      ],
      accountSettings: [
        {
          account_owner_user_id: "owner-1",
          product_mode: "hvac_service",
        },
      ],
      entitlements: [
        {
          account_owner_user_id: "owner-1",
          plan_key: "starter",
          entitlement_status: "trial",
          trial_ends_at: "2026-05-20T00:00:00.000Z",
        },
      ],
      internalUsers: [
        {
          account_owner_user_id: "owner-1",
          user_id: "u1",
          is_active: true,
        },
        {
          account_owner_user_id: "owner-1",
          user_id: "u2",
          is_active: false,
        },
      ],
      ownerProfiles: [
        {
          id: "owner-1",
          email: "owner@example.com",
          full_name: "Owner User",
        },
      ],
      ownerAuthUsers: [
        {
          id: "owner-1",
          email: "owner@example.com",
          invited_at: "2026-05-01T01:00:00.000Z",
          email_confirmed_at: null,
          confirmed_at: null,
        },
      ],
    });

    expect(model.summary.totalAccounts).toBe(1);
    expect(model.summary.hvacServiceAccounts).toBe(1);
    expect(model.summary.totalInternalUsers).toBe(2);
    expect(model.summary.activeInternalUsers).toBe(1);

    expect(model.rows[0]).toMatchObject({
      company: "Acme Service",
      ownerEmail: "owner@example.com",
      ownerName: "Owner User",
      accountOwnerUserId: "owner-1",
      productMode: "hvac_service",
      billingMode: "self_serve",
      planKey: "starter",
      entitlementStatus: "trial",
      trialEnd: "2026-05-20T00:00:00.000Z",
      activeUsers: 1,
      totalUsers: 2,
      setupInviteState: "invite_pending",
    });
  });

  it("does not expose raw stripe identifiers", () => {
    const model = buildPlatformOwnerDashboardModel({
      businessProfiles: [
        {
          account_owner_user_id: "owner-1",
          display_name: "Acme Service",
          billing_mode: "self_serve",
          created_at: "2026-05-01T00:00:00.000Z",
          updated_at: "2026-05-02T00:00:00.000Z",
        },
      ],
      accountSettings: [],
      entitlements: [
        {
          account_owner_user_id: "owner-1",
          plan_key: "starter",
          entitlement_status: "active",
          trial_ends_at: null,
          // Intentionally ignored by model: stripe_customer_id, stripe_subscription_id
        } as any,
      ],
      internalUsers: [],
      ownerProfiles: [],
      ownerAuthUsers: [],
    });

    expect(JSON.stringify(model)).not.toContain("stripe_customer_id");
    expect(JSON.stringify(model)).not.toContain("stripe_subscription_id");
    expect(JSON.stringify(model)).not.toContain("cus_");
    expect(JSON.stringify(model)).not.toContain("sub_");
  });
});
