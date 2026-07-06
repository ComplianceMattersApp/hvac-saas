import { describe, expect, it } from "vitest";
import {
  landingPathForDualContextAccess,
  resolveDualContextAccess,
} from "@/lib/auth/dual-context-access";

type FixtureInput = {
  internal?: {
    role?: "admin" | "office" | "tech" | "billing";
    isActive?: boolean;
    entitlementStatus?: string;
    trialEndsAt?: string | null;
    stripeSubscriptionStatus?: string | null;
  } | null;
  portal?: {
    lifecycleState?: string | null;
  } | null;
  extraPortal?: {
    contractorId: string;
    lifecycleState?: string | null;
  } | null;
  legacyOwnerPortal?: {
    contractorId: string;
    lifecycleState?: string | null;
  } | null;
};

function makeSupabaseFixture(input: FixtureInput) {
  const user = { id: "user-1", email: "user@example.com" };
  const tableReads: string[] = [];

  const auth = {
    getUser: async () => ({
      data: { user },
      error: null,
    }),
  };

  function makeQuery(table: string) {
    const filters: Record<string, unknown> = {};
    const query: any = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return query;
      },
      in: (column: string, value: unknown) => {
        filters[column] = value;
        return query;
      },
      limit: async () => {
        if (table === "contractor_users") {
          const rows = [];
          if (input.portal) rows.push({ contractor_id: "contractor-1" });
          if (input.extraPortal) rows.push({ contractor_id: input.extraPortal.contractorId });
          return { data: rows, error: null };
        }

        if (table === "contractors") {
          const requestedIds = Array.isArray(filters.id) ? filters.id.map(String) : [];
          const rows = [];
          if (input.portal && requestedIds.includes("contractor-1")) {
            rows.push({
              id: "contractor-1",
              name: "Partner Co",
              owner_user_id: "compliance-owner-1",
              lifecycle_state: input.portal.lifecycleState ?? "active",
            });
          }
          if (input.extraPortal && requestedIds.includes(input.extraPortal.contractorId)) {
            rows.push({
              id: input.extraPortal.contractorId,
              name: "Second Partner Co",
              owner_user_id: "compliance-owner-2",
              lifecycle_state: input.extraPortal.lifecycleState ?? "active",
            });
          }
          if (input.legacyOwnerPortal && filters.owner_user_id === user.id) {
            rows.push({
              id: input.legacyOwnerPortal.contractorId,
              name: "Legacy Partner Co",
              owner_user_id: user.id,
              lifecycle_state: input.legacyOwnerPortal.lifecycleState ?? "active",
            });
          }
          return { data: rows, error: null };
        }

        throw new Error(`Unexpected limit table: ${table}`);
      },
      maybeSingle: async () => {
        if (table === "internal_users") {
          if (!input.internal) return { data: null, error: null };
          return {
            data: {
              user_id: user.id,
              role: input.internal.role ?? "admin",
              is_active: input.internal.isActive ?? true,
              account_owner_user_id: "owner-1",
              created_by: null,
            },
            error: null,
          };
        }

        if (table === "platform_account_entitlements") {
          if (!input.internal?.entitlementStatus) return { data: null, error: null };
          return {
            data: {
              entitlement_status: input.internal.entitlementStatus,
              seat_limit: 5,
              trial_ends_at: input.internal.trialEndsAt ?? null,
              notes: null,
              stripe_customer_id: "cus_123",
              stripe_subscription_id: "sub_123",
              stripe_subscription_status: input.internal.stripeSubscriptionStatus ?? "active",
            },
            error: null,
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    };
    return query;
  }

  return {
    auth,
    tableReads,
    from: (table: string) => {
      tableReads.push(table);
      return makeQuery(table);
    },
  };
}

describe("resolveDualContextAccess", () => {
  it("returns no context when auth session is missing", async () => {
    const access = await resolveDualContextAccess({
      supabase: {
        auth: {
          getUser: async () => ({
            data: { user: null },
            error: { name: "AuthSessionMissingError", message: "Auth session missing!" },
          }),
        },
        from: () => {
          throw new Error("No table reads expected");
        },
      },
    });

    expect(access.user).toBeNull();
    expect(access.preferredLandingContext).toBe("none");
  });

  it("routes active app only to app context", async () => {
    const access = await resolveDualContextAccess({
      supabase: makeSupabaseFixture({
        internal: { entitlementStatus: "active" },
      }),
    });

    expect(access.hasActiveAppAccess).toBe(true);
    expect(access.hasPortalAccess).toBe(false);
    expect(access.preferredLandingContext).toBe("app");
    expect(landingPathForDualContextAccess(access)).toBe("/today");
  });

  it("routes portal only to portal context", async () => {
    const access = await resolveDualContextAccess({
      supabase: makeSupabaseFixture({
        portal: { lifecycleState: "active" },
      }),
    });

    expect(access.hasActiveAppAccess).toBe(false);
    expect(access.hasPortalAccess).toBe(true);
    expect(access.portal?.accountOwnerUserId).toBe("compliance-owner-1");
    expect(access.preferredLandingContext).toBe("portal");
    expect(landingPathForDualContextAccess(access)).toBe("/portal");
  });

  it("defaults active app plus portal to app while exposing both contexts", async () => {
    const access = await resolveDualContextAccess({
      supabase: makeSupabaseFixture({
        internal: { entitlementStatus: "active" },
        portal: { lifecycleState: "active" },
      }),
    });

    expect(access.isDualContextUser).toBe(true);
    expect(access.availableContexts).toEqual(["app", "portal"]);
    expect(access.portal).toMatchObject({
      contractorId: "contractor-1",
      accountOwnerUserId: "compliance-owner-1",
    });
    expect(access.preferredLandingContext).toBe("app");
  });

  it("treats a legacy contractor owner as dual-context without a contractor_users row", async () => {
    const supabase = makeSupabaseFixture({
      internal: { entitlementStatus: "active" },
      legacyOwnerPortal: { contractorId: "legacy-contractor-1", lifecycleState: "active" },
    });

    const access = await resolveDualContextAccess({
      supabase,
      getPortalAdmin: () => supabase,
    });

    expect(access.isDualContextUser).toBe(true);
    expect(access.hasActiveAppAccess).toBe(true);
    expect(access.hasPortalAccess).toBe(true);
    expect(access.portal).toMatchObject({
      contractorId: "legacy-contractor-1",
      accountOwnerUserId: "user-1",
    });
    expect(access.preferredLandingContext).toBe("app");
  });

  it("does not use account handoff relationships as current portal access", async () => {
    const supabase = makeSupabaseFixture({
      internal: { role: "admin", entitlementStatus: "active" },
    });

    const access = await resolveDualContextAccess({
      supabase,
    });

    expect(access.hasActiveAppAccess).toBe(true);
    expect(access.hasPortalAccess).toBe(false);
    expect(access.portal).toBeNull();
    expect(access.preferredLandingContext).toBe("app");
    expect(supabase.tableReads).not.toContain("account_handoff_connections");
  });

  it("uses any active portal membership instead of treating the first membership as exclusive", async () => {
    const access = await resolveDualContextAccess({
      supabase: makeSupabaseFixture({
        internal: { entitlementStatus: "active" },
        portal: { lifecycleState: "archived" },
        extraPortal: { contractorId: "contractor-2", lifecycleState: "active" },
      }),
    });

    expect(access.hasActiveAppAccess).toBe(true);
    expect(access.hasPortalAccess).toBe(true);
    expect(access.portal).toMatchObject({
      contractorId: "contractor-2",
      accountOwnerUserId: "compliance-owner-2",
    });
    expect(access.preferredLandingContext).toBe("app");
  });

  it("routes expired trial plus portal to portal", async () => {
    const access = await resolveDualContextAccess({
      supabase: makeSupabaseFixture({
        internal: {
          entitlementStatus: "trial",
          trialEndsAt: "2020-01-01T00:00:00.000Z",
        },
        portal: { lifecycleState: "active" },
      }),
    });

    expect(access.hasActiveAppAccess).toBe(false);
    expect(access.hasExpiredOrInactiveAppAccess).toBe(true);
    expect(access.hasPortalAccess).toBe(true);
    expect(access.appAccessBlockedReason).toBe("blocked_trial_expired");
    expect(access.preferredLandingContext).toBe("portal");
  });

  it("routes cancelled app plus portal to portal", async () => {
    const access = await resolveDualContextAccess({
      supabase: makeSupabaseFixture({
        internal: { entitlementStatus: "cancelled" },
        portal: { lifecycleState: "active" },
      }),
    });

    expect(access.hasActiveAppAccess).toBe(false);
    expect(access.hasPortalAccess).toBe(true);
    expect(access.preferredLandingContext).toBe("portal");
  });

  it("routes expired app only to inactive app context", async () => {
    const access = await resolveDualContextAccess({
      supabase: makeSupabaseFixture({
        internal: {
          entitlementStatus: "trial",
          trialEndsAt: "2020-01-01T00:00:00.000Z",
        },
      }),
    });

    expect(access.hasPortalAccess).toBe(false);
    expect(access.preferredLandingContext).toBe("inactive_app");
    expect(landingPathForDualContextAccess(access)).toBe("/access-inactive");
  });

  it("returns no valid context when neither membership exists", async () => {
    const access = await resolveDualContextAccess({
      supabase: makeSupabaseFixture({}),
    });

    expect(access.availableContexts).toEqual([]);
    expect(access.preferredLandingContext).toBe("none");
    expect(landingPathForDualContextAccess(access)).toBe("/login");
  });
});
