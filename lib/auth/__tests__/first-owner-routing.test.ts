import { describe, expect, it, vi } from "vitest";
import { resolveSetPasswordDestinationWithFirstOwnerGate } from "@/lib/auth/first-owner-routing";

type InternalUserRow = {
  user_id: string;
  account_owner_user_id: string;
  role: string;
  is_active: boolean;
};

type OwnerRow = {
  account_owner_user_id: string;
};

function makeSupabase(params?: {
  internalUser?: InternalUserRow | null;
  businessProfile?: OwnerRow | null;
  entitlement?: OwnerRow | null;
  internalUserError?: Error | null;
  businessProfileError?: Error | null;
  entitlementError?: Error | null;
}) {
  const internalUser = params?.internalUser ?? null;
  const businessProfile = params?.businessProfile ?? null;
  const entitlement = params?.entitlement ?? null;
  const internalUserError = params?.internalUserError ?? null;
  const businessProfileError = params?.businessProfileError ?? null;
  const entitlementError = params?.entitlementError ?? null;

  return {
    from: vi.fn((table: string) => {
      if (table === "internal_users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: internalUser,
                error: internalUserError,
              })),
            })),
          })),
        };
      }

      if (table === "internal_business_profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: businessProfile,
                error: businessProfileError,
              })),
            })),
          })),
        };
      }

      if (table === "platform_account_entitlements") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: entitlement,
                error: entitlementError,
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

describe("resolveSetPasswordDestinationWithFirstOwnerGate", () => {
  const ownerId = "owner-user-id";

  it("marker + valid owner anchor + business profile + entitlement routes to /ops/admin", async () => {
    const supabase = makeSupabase({
      internalUser: {
        user_id: ownerId,
        account_owner_user_id: ownerId,
        role: "admin",
        is_active: true,
      },
      businessProfile: { account_owner_user_id: ownerId },
      entitlement: { account_owner_user_id: ownerId },
    });

    const decision = await resolveSetPasswordDestinationWithFirstOwnerGate({
      supabase,
      userId: ownerId,
      isContractor: false,
      userMetadata: {
        first_owner_provisioning_v1: {
          is_first_owner: true,
          account_owner_user_id: ownerId,
        },
      },
    });

    expect(decision.target).toBe("/ops/admin");
  });

  it("marker missing + valid internal user routes to /ops", async () => {
    const supabase = makeSupabase({
      internalUser: {
        user_id: ownerId,
        account_owner_user_id: ownerId,
        role: "admin",
        is_active: true,
      },
    });

    const decision = await resolveSetPasswordDestinationWithFirstOwnerGate({
      supabase,
      userId: ownerId,
      isContractor: false,
      userMetadata: {},
    });

    expect(decision.target).toBe("/ops");
  });

  it("contractor member path remains /portal", async () => {
    const supabase = makeSupabase();

    const decision = await resolveSetPasswordDestinationWithFirstOwnerGate({
      supabase,
      userId: ownerId,
      isContractor: true,
      userMetadata: {
        first_owner_provisioning_v1: {
          is_first_owner: true,
        },
      },
    });

    expect(decision.target).toBe("/portal");
  });

  it("marker present but internal user not owner-anchored fails closed", async () => {
    const supabase = makeSupabase({
      internalUser: {
        user_id: ownerId,
        account_owner_user_id: "different-owner",
        role: "admin",
        is_active: true,
      },
      businessProfile: { account_owner_user_id: ownerId },
      entitlement: { account_owner_user_id: ownerId },
    });

    const decision = await resolveSetPasswordDestinationWithFirstOwnerGate({
      supabase,
      userId: ownerId,
      isContractor: false,
      userMetadata: {
        first_owner_provisioning_v1: {
          is_first_owner: true,
        },
      },
    });

    expect(decision.target).toBeNull();
    expect(decision.reason).toBe("FIRST_OWNER_SETUP_INCOMPLETE");
  });

  it("marker present but business profile missing fails closed", async () => {
    const supabase = makeSupabase({
      internalUser: {
        user_id: ownerId,
        account_owner_user_id: ownerId,
        role: "admin",
        is_active: true,
      },
      businessProfile: null,
      entitlement: { account_owner_user_id: ownerId },
    });

    const decision = await resolveSetPasswordDestinationWithFirstOwnerGate({
      supabase,
      userId: ownerId,
      isContractor: false,
      userMetadata: {
        first_owner_provisioning_v1: {
          is_first_owner: true,
        },
      },
    });

    expect(decision.target).toBeNull();
    expect(decision.reason).toBe("FIRST_OWNER_SETUP_INCOMPLETE");
  });

  it("marker present but entitlement missing fails closed", async () => {
    const supabase = makeSupabase({
      internalUser: {
        user_id: ownerId,
        account_owner_user_id: ownerId,
        role: "admin",
        is_active: true,
      },
      businessProfile: { account_owner_user_id: ownerId },
      entitlement: null,
    });

    const decision = await resolveSetPasswordDestinationWithFirstOwnerGate({
      supabase,
      userId: ownerId,
      isContractor: false,
      userMetadata: {
        first_owner_provisioning_v1: {
          is_first_owner: true,
        },
      },
    });

    expect(decision.target).toBeNull();
    expect(decision.reason).toBe("FIRST_OWNER_SETUP_INCOMPLETE");
  });

  it("inactive internal user fails closed under marker path", async () => {
    const supabase = makeSupabase({
      internalUser: {
        user_id: ownerId,
        account_owner_user_id: ownerId,
        role: "admin",
        is_active: false,
      },
      businessProfile: { account_owner_user_id: ownerId },
      entitlement: { account_owner_user_id: ownerId },
    });

    const decision = await resolveSetPasswordDestinationWithFirstOwnerGate({
      supabase,
      userId: ownerId,
      isContractor: false,
      userMetadata: {
        first_owner_provisioning_v1: {
          is_first_owner: true,
        },
      },
    });

    expect(decision.target).toBeNull();
  });
});
