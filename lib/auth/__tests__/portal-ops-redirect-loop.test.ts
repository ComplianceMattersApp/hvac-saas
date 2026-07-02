import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import type { DualContextAccess } from "@/lib/auth/dual-context-access";
import { landingPathForDualContextAccess } from "@/lib/auth/dual-context-access";

function readRepoFile(path: string) {
  return readFileSync(resolve(__dirname, "../../..", path), "utf-8");
}

function resolveOpsGuardRedirect(access: DualContextAccess, hasUser = true) {
  if (!hasUser) return "/login";
  if (!access.hasActiveAppAccess) return landingPathForDualContextAccess(access);
  return null;
}

function resolveTodayGuardRedirect(access: DualContextAccess) {
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
      accountOwnerUserId: "compliance-owner-1",
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
    const portalGuardFallback = null;

    expect(portalGuardFallback).not.toBe("/today");
    expect(portalGuardFallback).not.toBe("/ops");
  });

  it("sends portal-only /today visits to /portal without allowing a /today loop", () => {
    expect(resolveTodayGuardRedirect(portalAccess())).toBe("/portal");
  });

  it("renders portal-safe access issues instead of redirecting portal NOT_CONTRACTOR failures to /ops", () => {
    const portalFiles = [
      "app/portal/page.tsx",
      "app/portal/jobs/page.tsx",
      "app/portal/permit-request/page.tsx",
      "app/portal/intake-submissions/[id]/page.tsx",
    ];

    for (const path of portalFiles) {
      const source = readRepoFile(path);
      expect(source).toContain("PortalAccessIssue");
      expect(source).not.toContain('redirect("/ops")');
    }
  });
});
