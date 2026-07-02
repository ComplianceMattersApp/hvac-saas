import { describe, expect, it } from "vitest";
import {
  resolveAppAccessCta,
  type AppAccessCtaEntitlementSnapshot,
} from "@/lib/business/app-access-cta";
import type { DualContextAccess } from "@/lib/auth/dual-context-access";

function makeAccess(overrides: Partial<DualContextAccess> = {}): DualContextAccess {
  return {
    user: { id: "user-1" },
    hasInternalMembership: false,
    hasActiveAppAccess: false,
    hasExpiredOrInactiveAppAccess: false,
    hasPortalAccess: false,
    isDualContextUser: false,
    availableContexts: [],
    preferredLandingContext: "none",
    internalUser: null,
    portal: null,
    appAccessBlockedReason: null,
    ...overrides,
  };
}

function adminAccess(overrides: Partial<DualContextAccess> = {}) {
  return makeAccess({
    hasInternalMembership: true,
    hasExpiredOrInactiveAppAccess: true,
    internalUser: {
      userId: "user-1",
      role: "admin",
      isActive: true,
      accountOwnerUserId: "owner-1",
      createdBy: null,
    },
    ...overrides,
  });
}

function directPortal() {
  return {
    contractorId: "contractor-1",
    contractorName: "Partner Co",
    accountOwnerUserId: "compliance-owner-1",
    lifecycleState: "active",
  };
}

const checkoutAvailable = { checkoutAvailable: true, portalAvailable: true };

describe("resolveAppAccessCta", () => {
  it("returns start_trial for portal-only never trialed users", () => {
    const cta = resolveAppAccessCta({
      access: makeAccess({
        hasPortalAccess: true,
        portal: directPortal(),
      }),
      billingAvailability: checkoutAvailable,
    });

    expect(cta.kind).toBe("start_trial");
    expect(cta.buttonLabel).toBe("Start 30-day trial");
    expect(cta.target).toEqual({ mode: "link", href: "/signup/service" });
  });

  it("returns open_app for active trial app access", () => {
    const cta = resolveAppAccessCta({
      access: adminAccess({
        hasActiveAppAccess: true,
        hasExpiredOrInactiveAppAccess: false,
        preferredLandingContext: "app",
        availableContexts: ["app"],
      }),
      entitlement: {
        entitlementStatus: "trial",
        trialEndsAt: "2026-06-20T00:00:00.000Z",
      },
      billingAvailability: checkoutAvailable,
      now: new Date("2026-06-11T00:00:00.000Z"),
    });

    expect(cta.kind).toBe("open_app");
    expect(cta.target).toEqual({ mode: "link", href: "/today" });
  });

  it("returns resume_app_access for expired trial plus portal plus internal admin", () => {
    const cta = resolveAppAccessCta({
      access: adminAccess({
        hasPortalAccess: true,
        isDualContextUser: true,
        appAccessBlockedReason: "blocked_trial_expired",
      }),
      entitlement: {
        entitlementStatus: "trial",
        trialEndsAt: "2026-06-01T00:00:00.000Z",
      },
      billingAvailability: checkoutAvailable,
      now: new Date("2026-06-11T00:00:00.000Z"),
    });

    expect(cta.kind).toBe("resume_app_access");
    expect(cta.buttonLabel).toBe("Resume app access");
    expect(cta.target).toEqual({ mode: "post", action: "/api/stripe/checkout" });
    expect(cta.helper).toContain("Portal work with Compliance Matters is still available");
  });

  it("does not offer checkout when inactive app access already has linked Stripe billing", () => {
    const cta = resolveAppAccessCta({
      access: adminAccess({
        appAccessBlockedReason: "blocked_trial_expired",
      }),
      entitlement: {
        entitlementStatus: "trial",
        trialEndsAt: "2026-06-01T00:00:00.000Z",
        billingCustomerLinked: true,
        billingSubscriptionLinked: false,
      },
      billingAvailability: checkoutAvailable,
      now: new Date("2026-06-11T00:00:00.000Z"),
    });

    expect(cta.kind).toBe("none");
    expect(cta.target).toBeNull();
  });

  it.each([
    { status: "cancelled", expected: "reactivate_app_access" },
    { status: "suspended", expected: "reactivate_app_access" },
  ] as const)(
    "returns reactivate_app_access for $status app plus portal plus internal admin",
    ({ status, expected }) => {
      const cta = resolveAppAccessCta({
        access: adminAccess({
          hasPortalAccess: true,
          isDualContextUser: true,
          appAccessBlockedReason: "blocked_entitlement_status",
        }),
        entitlement: {
          entitlementStatus: status,
          trialEndsAt: null,
        },
        billingAvailability: checkoutAvailable,
      });

      expect(cta.kind).toBe(expected);
      expect(cta.buttonLabel).toBe("Reactivate app access");
      expect(cta.target).toEqual({ mode: "post", action: "/api/stripe/checkout" });
    },
  );

  it("returns open_app for active app plus portal", () => {
    const cta = resolveAppAccessCta({
      access: adminAccess({
        hasActiveAppAccess: true,
        hasExpiredOrInactiveAppAccess: false,
        hasPortalAccess: true,
        isDualContextUser: true,
        availableContexts: ["app", "portal"],
        preferredLandingContext: "app",
      }),
      billingAvailability: checkoutAvailable,
    });

    expect(cta.kind).toBe("open_app");
    expect(cta.buttonLabel).toBe("Open app");
  });

  it("returns resume/reactivate for internal-only inactive admins", () => {
    const expiredTrial = resolveAppAccessCta({
      access: adminAccess({
        appAccessBlockedReason: "blocked_trial_expired",
      }),
      entitlement: {
        entitlementStatus: "trial",
        trialEndsAt: "2026-06-01T00:00:00.000Z",
      },
      billingAvailability: checkoutAvailable,
      now: new Date("2026-06-11T00:00:00.000Z"),
    });

    const cancelled = resolveAppAccessCta({
      access: adminAccess({
        appAccessBlockedReason: "blocked_entitlement_status",
      }),
      entitlement: {
        entitlementStatus: "cancelled",
        trialEndsAt: null,
      },
      billingAvailability: checkoutAvailable,
    });

    expect(expiredTrial.kind).toBe("resume_app_access");
    expect(cancelled.kind).toBe("reactivate_app_access");
  });

  it("returns none when no safe action is available", () => {
    const cta = resolveAppAccessCta({
      access: adminAccess({
        internalUser: {
          userId: "user-1",
          role: "office",
          isActive: true,
          accountOwnerUserId: "owner-1",
          createdBy: null,
        },
        appAccessBlockedReason: "blocked_trial_expired",
      }),
      entitlement: {
        entitlementStatus: "trial",
        trialEndsAt: "2026-06-01T00:00:00.000Z",
      } satisfies AppAccessCtaEntitlementSnapshot,
      billingAvailability: checkoutAvailable,
      now: new Date("2026-06-11T00:00:00.000Z"),
    });

    expect(cta.kind).toBe("none");
    expect(cta.target).toBeNull();
  });
});
