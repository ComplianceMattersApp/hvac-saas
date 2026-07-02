import { describe, expect, it } from "vitest";
import type { DualContextAccess } from "@/lib/auth/dual-context-access";
import { resolvePostLoginDestination } from "@/lib/auth/post-login-destination";

function access(overrides: Partial<DualContextAccess>): DualContextAccess {
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

describe("resolvePostLoginDestination", () => {
  it("sends portal-only users to /portal by default", () => {
    expect(
      resolvePostLoginDestination({
        access: access({
          hasPortalAccess: true,
          availableContexts: ["portal"],
          preferredLandingContext: "portal",
          portal: {
            contractorId: "contractor-1",
            contractorName: "Partner Co",
            accountOwnerUserId: "compliance-owner-1",
            lifecycleState: "active",
          },
        }),
      }),
    ).toEqual({ kind: "redirect", path: "/portal" });
  });

  it("does not preserve an internal /ops return path for portal-only users", () => {
    expect(
      resolvePostLoginDestination({
        access: access({
          hasPortalAccess: true,
          availableContexts: ["portal"],
          preferredLandingContext: "portal",
          portal: {
            contractorId: "contractor-1",
            contractorName: "Partner Co",
            accountOwnerUserId: "compliance-owner-1",
            lifecycleState: "active",
          },
        }),
        nextPath: "/ops",
      }),
    ).toEqual({ kind: "redirect", path: "/portal" });
  });

  it("keeps internal-only login on the internal default", () => {
    expect(
      resolvePostLoginDestination({
        access: access({
          hasInternalMembership: true,
          hasActiveAppAccess: true,
          availableContexts: ["app"],
          preferredLandingContext: "app",
          internalUser: {
            userId: "user-1",
            role: "admin",
            isActive: true,
            accountOwnerUserId: "owner-1",
            createdBy: null,
          },
        }),
      }),
    ).toEqual({ kind: "redirect", path: "/today" });
  });

  it("does not send internal-only users to /portal through a stale next path", () => {
    expect(
      resolvePostLoginDestination({
        access: access({
          hasInternalMembership: true,
          hasActiveAppAccess: true,
          availableContexts: ["app"],
          preferredLandingContext: "app",
          internalUser: {
            userId: "user-1",
            role: "office",
            isActive: true,
            accountOwnerUserId: "owner-1",
            createdBy: null,
          },
        }),
        nextPath: "/portal",
      }),
    ).toEqual({ kind: "redirect", path: "/today" });
  });

  it("preserves explicit portal navigation for dual-context users", () => {
    expect(
      resolvePostLoginDestination({
        access: access({
          hasInternalMembership: true,
          hasActiveAppAccess: true,
          hasPortalAccess: true,
          isDualContextUser: true,
          availableContexts: ["app", "portal"],
          preferredLandingContext: "app",
          internalUser: {
            userId: "user-1",
            role: "admin",
            isActive: true,
            accountOwnerUserId: "owner-1",
            createdBy: null,
          },
          portal: {
            contractorId: "contractor-1",
            contractorName: "Partner Co",
            accountOwnerUserId: "compliance-owner-1",
            lifecycleState: "active",
          },
        }),
        nextPath: "/portal/jobs",
      }),
    ).toEqual({ kind: "redirect", path: "/portal/jobs" });
  });

  it("sends inactive internal plus valid portal access to /portal", () => {
    expect(
      resolvePostLoginDestination({
        access: access({
          hasInternalMembership: true,
          hasExpiredOrInactiveAppAccess: true,
          hasPortalAccess: true,
          isDualContextUser: true,
          availableContexts: ["portal"],
          preferredLandingContext: "portal",
          internalUser: {
            userId: "user-1",
            role: "admin",
            isActive: false,
            accountOwnerUserId: "owner-1",
            createdBy: null,
          },
          portal: {
            contractorId: "contractor-1",
            contractorName: "Partner Co",
            accountOwnerUserId: "compliance-owner-1",
            lifecycleState: "active",
          },
          appAccessBlockedReason: "inactive_internal_user",
        }),
      }),
    ).toEqual({ kind: "redirect", path: "/portal" });
  });
});
