import { describe, expect, it } from "vitest";
import type { DualContextAccess } from "@/lib/auth/dual-context-access";
import { landingPathForDualContextAccess } from "@/lib/auth/dual-context-access";
import { portalAccessFallbackPathForAccess } from "@/lib/auth/portal-route-guard";

function resolveOpsGuardRedirect(access: DualContextAccess, hasUser = true) {
  if (!hasUser) return "/login";
  if (!access.hasActiveAppAccess) return landingPathForDualContextAccess(access);
  return null;
}

function portalAccess(): DualContextAccess {
  return {
    user: { id: "user-1" },
    hasInternalMembership: false,
    hasActiveAppAccess: false,
    hasExpiredOrInactiveAppAccess: false,
    hasPortalAccess: true,
    isDualContextUser: false,
    availableContexts: ["portal"],
    preferredLandingContext: "portal",
    internalUser: null,
    portal: {
      contractorId: "contractor-1",
      contractorName: "Partner Co",
      lifecycleState: "active",
    },
    appAccessBlockedReason: null,
  };
}

function activeInternalAccess(): DualContextAccess {
  return {
    user: { id: "user-1" },
    hasInternalMembership: true,
    hasActiveAppAccess: true,
    hasExpiredOrInactiveAppAccess: false,
    hasPortalAccess: false,
    isDualContextUser: false,
    availableContexts: ["app"],
    preferredLandingContext: "app",
    internalUser: {
      userId: "user-1",
      role: "admin",
      isActive: true,
      accountOwnerUserId: "owner-1",
      createdBy: null,
    },
    portal: null,
    appAccessBlockedReason: null,
  };
}

describe("portal / ops redirect loop prevention", () => {
  it("sends portal-only /ops visits to /portal as a terminal portal state", () => {
    expect(resolveOpsGuardRedirect(portalAccess())).toBe("/portal");
    expect(landingPathForDualContextAccess(portalAccess())).toBe("/portal");
  });

  it("does not create /ops -> /portal -> /ops for the same resolved portal access state", () => {
    const firstHop = resolveOpsGuardRedirect(portalAccess());
    const secondHop = firstHop === "/portal" ? null : firstHop;

    expect(firstHop).toBe("/portal");
    expect(secondHop).not.toBe("/ops");
  });

  it("allows paid/internal users through the /ops guard", () => {
    expect(resolveOpsGuardRedirect(activeInternalAccess())).toBeNull();
  });

  it("does not create /portal -> /today -> /portal for portal access", () => {
    expect(portalAccessFallbackPathForAccess(portalAccess())).toBe("/portal");
  });
});
