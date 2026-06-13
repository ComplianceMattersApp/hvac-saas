import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const syncPlatformEntitlementFromStripeForAccountOwnerMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalRole: (...args: unknown[]) => requireInternalRoleMock(...args),
}));

vi.mock("@/lib/business/platform-billing-stripe", () => ({
  syncPlatformEntitlementFromStripeForAccountOwner: (...args: unknown[]) =>
    syncPlatformEntitlementFromStripeForAccountOwnerMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

describe("platform billing actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    createClientMock.mockResolvedValue({});
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: {
        user_id: "admin-1",
        role: "admin",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });
    syncPlatformEntitlementFromStripeForAccountOwnerMock.mockResolvedValue({
      skipped: false,
      reason: "synced",
      entitlement: {
        stripe_subscription_status: "active",
      },
    });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  it("refreshes platform subscription status for the current admin account and returns to the app when active", async () => {
    const { refreshPlatformSubscriptionStatusFromForm } = await import(
      "@/lib/actions/platform-billing-actions"
    );

    await expect(refreshPlatformSubscriptionStatusFromForm()).rejects.toThrow(
      "REDIRECT:/today",
    );

    expect(requireInternalRoleMock).toHaveBeenCalledWith("admin", {
      supabase: expect.anything(),
    });
    expect(syncPlatformEntitlementFromStripeForAccountOwnerMock).toHaveBeenCalledWith({
      accountOwnerUserId: "owner-1",
    });
    expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith({
      accountOwnerUserId: "owner-1",
      supabase: expect.anything(),
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/access-inactive");
    expect(revalidatePathMock).toHaveBeenCalledWith("/ops/admin/company-profile");
  });

  it("redirects with a missing subscription notice when no linked subscription exists", async () => {
    syncPlatformEntitlementFromStripeForAccountOwnerMock.mockResolvedValueOnce({
      skipped: true,
      reason: "missing_subscription",
      entitlement: {
        stripe_subscription_status: null,
      },
    });

    const { refreshPlatformSubscriptionStatusFromForm } = await import(
      "@/lib/actions/platform-billing-actions"
    );

    await expect(refreshPlatformSubscriptionStatusFromForm()).rejects.toThrow(
      "REDIRECT:/access-inactive?notice=platform_subscription_refresh_missing_subscription",
    );

    expect(resolveOperationalMutationEntitlementAccessMock).not.toHaveBeenCalled();
  });

  it("denies non-admin refresh attempts before calling Stripe sync", async () => {
    requireInternalRoleMock.mockRejectedValueOnce(new Error("Required internal role: admin"));

    const { refreshPlatformSubscriptionStatusFromForm } = await import(
      "@/lib/actions/platform-billing-actions"
    );

    await expect(refreshPlatformSubscriptionStatusFromForm()).rejects.toThrow(
      "REDIRECT:/forbidden",
    );

    expect(syncPlatformEntitlementFromStripeForAccountOwnerMock).not.toHaveBeenCalled();
  });
});
