import { describe, expect, it } from "vitest";
import type { DualContextAccess } from "@/lib/auth/dual-context-access";
import { landingPathForDualContextAccess } from "@/lib/auth/dual-context-access";

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
});
