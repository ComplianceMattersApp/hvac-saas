import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const createTenantStripeConnectOnboardingLinkMock = vi.fn();
const syncTenantStripeConnectReadinessForAccountOwnerMock = vi.fn();
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
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalRole: (...args: unknown[]) => requireInternalRoleMock(...args),
}));

vi.mock("@/lib/business/tenant-stripe-connect-onboarding", () => ({
  createTenantStripeConnectOnboardingLink: (...args: unknown[]) =>
    createTenantStripeConnectOnboardingLinkMock(...args),
  syncTenantStripeConnectReadinessForAccountOwner: (...args: unknown[]) =>
    syncTenantStripeConnectReadinessForAccountOwnerMock(...args),
  normalizeStripeConnectError: (error: unknown, stage: string) => ({
    stage,
    message: error instanceof Error ? error.message : "unknown_error",
  }),
}));

function buildAdmin(preflightAllowed = true) {
  return {
    from(table: string) {
      if (table !== "internal_users") {
        throw new Error(`Unexpected table: ${table}`);
      }

      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => {
          if (!preflightAllowed) {
            return { data: null, error: null };
          }

          return {
            data: {
              user_id: "admin-1",
              role: "admin",
              is_active: true,
              account_owner_user_id: "owner-1",
            },
            error: null,
          };
        }),
      };

      return query;
    },
  };
}

describe("internal business profile Stripe Connect actions", () => {
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
  });

  it("starts onboarding for same-account admin and redirects to onboarding URL", async () => {
    createAdminClientMock.mockReturnValue(buildAdmin(true));
    createTenantStripeConnectOnboardingLinkMock.mockResolvedValue({
      url: "https://connect.stripe.com/setup/s/test",
    });

    const { startTenantStripeConnectOnboardingFromForm } = await import(
      "@/lib/actions/internal-business-profile-actions"
    );

    await expect(startTenantStripeConnectOnboardingFromForm()).rejects.toThrow(
      "REDIRECT:https://connect.stripe.com/setup/s/test",
    );

    expect(createTenantStripeConnectOnboardingLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1" }),
    );
  });

  it("rethrows NEXT_REDIRECT control-flow errors without mapping to failed notice", async () => {
    createAdminClientMock.mockReturnValue(buildAdmin(true));
    const nextRedirectError = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/ops/admin/company-profile;307;",
    });
    createTenantStripeConnectOnboardingLinkMock.mockRejectedValue(nextRedirectError);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { startTenantStripeConnectOnboardingFromForm } = await import(
      "@/lib/actions/internal-business-profile-actions"
    );

    await expect(startTenantStripeConnectOnboardingFromForm()).rejects.toBe(nextRedirectError);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("maps real onboarding errors to failed notice", async () => {
    createAdminClientMock.mockReturnValue(buildAdmin(true));
    createTenantStripeConnectOnboardingLinkMock.mockRejectedValue(
      new Error("StripeInvalidRequestError: account invalid"),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { startTenantStripeConnectOnboardingFromForm } = await import(
      "@/lib/actions/internal-business-profile-actions"
    );

    await expect(startTenantStripeConnectOnboardingFromForm()).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?notice=stripe_connect_onboarding_failed",
    );
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("refreshes readiness for same-account admin and redirects with success notice", async () => {
    createAdminClientMock.mockReturnValue(buildAdmin(true));
    syncTenantStripeConnectReadinessForAccountOwnerMock.mockResolvedValue({
      isReady: false,
    });

    const { refreshTenantStripeConnectReadinessFromForm } = await import(
      "@/lib/actions/internal-business-profile-actions"
    );

    await expect(refreshTenantStripeConnectReadinessFromForm()).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?notice=stripe_connect_status_refreshed",
    );

    expect(syncTenantStripeConnectReadinessForAccountOwnerMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1" }),
    );
  });

  it("denies cross-account or invalid scope before Stripe Connect actions", async () => {
    createAdminClientMock.mockReturnValue(buildAdmin(false));

    const {
      startTenantStripeConnectOnboardingFromForm,
      refreshTenantStripeConnectReadinessFromForm,
    } = await import("@/lib/actions/internal-business-profile-actions");

    await expect(startTenantStripeConnectOnboardingFromForm()).rejects.toThrow(
      "REDIRECT:/forbidden",
    );
    await expect(refreshTenantStripeConnectReadinessFromForm()).rejects.toThrow(
      "REDIRECT:/forbidden",
    );

    expect(createTenantStripeConnectOnboardingLinkMock).not.toHaveBeenCalled();
    expect(syncTenantStripeConnectReadinessForAccountOwnerMock).not.toHaveBeenCalled();
  });
});
