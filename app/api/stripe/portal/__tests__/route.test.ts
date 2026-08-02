import { beforeEach, describe, expect, it, vi } from "vitest";

const getPlatformBillingAvailability = vi.fn();
const createPlatformBillingPortalSession = vi.fn();
const requireInternalRole = vi.fn();
const createClient = vi.fn(async () => ({ __supabase: true }));

vi.mock("@/lib/business/platform-billing-stripe", () => ({
  getPlatformBillingAvailability: (...args: unknown[]) => getPlatformBillingAvailability(...args),
  createPlatformBillingPortalSession: (...args: unknown[]) =>
    createPlatformBillingPortalSession(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalRole: (...args: unknown[]) => requireInternalRole(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}));

async function postPortal() {
  const { POST } = await import("@/app/api/stripe/portal/route");
  return POST();
}

describe("POST /api/stripe/portal — platform billing portal", () => {
  beforeEach(() => {
    getPlatformBillingAvailability.mockReturnValue({
      checkoutAvailable: true,
      portalAvailable: true,
      missingKeys: [],
    });
    requireInternalRole.mockResolvedValue({
      userId: "user-1",
      internalUser: { account_owner_user_id: "owner-1" },
    });
    createPlatformBillingPortalSession.mockResolvedValue({
      url: "https://billing.stripe.test/portal_123",
    });
  });

  it("returns 503 with the missing keys when the portal is not configured, without touching auth or Stripe", async () => {
    getPlatformBillingAvailability.mockReturnValue({
      checkoutAvailable: false,
      portalAvailable: false,
      missingKeys: ["STRIPE_SECRET_KEY"],
    });

    const res = await postPortal();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/not configured/i);
    expect(body.missingKeys).toEqual(["STRIPE_SECRET_KEY"]);
    expect(requireInternalRole).not.toHaveBeenCalled();
    expect(createPlatformBillingPortalSession).not.toHaveBeenCalled();
  });

  it("redirects (303) to the Stripe billing portal URL for an authorized admin, scoped to their account owner", async () => {
    const res = await postPortal();

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://billing.stripe.test/portal_123");
    expect(requireInternalRole).toHaveBeenCalledWith(
      "admin",
      expect.objectContaining({ supabase: expect.anything() }),
    );
    expect(createPlatformBillingPortalSession).toHaveBeenCalledWith({
      accountOwnerUserId: "owner-1",
    });
  });

  it("returns 403 (not 500) when the caller is not an authorized internal admin", async () => {
    requireInternalRole.mockRejectedValue(new Error("Admin role required"));

    const res = await postPortal();

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Admin role required");
    expect(createPlatformBillingPortalSession).not.toHaveBeenCalled();
  });

  it("returns 500 when portal session creation fails for a non-auth reason", async () => {
    createPlatformBillingPortalSession.mockRejectedValue(new Error("Stripe upstream error"));

    const res = await postPortal();

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Stripe upstream error");
  });
});
