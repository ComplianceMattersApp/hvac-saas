import { beforeEach, describe, expect, it, vi } from "vitest";

const getPlatformBillingAvailability = vi.fn();
const createPlatformSubscriptionCheckoutSession = vi.fn();
const requireInternalRole = vi.fn();
const createClient = vi.fn(async () => ({ __supabase: true }));

vi.mock("@/lib/business/platform-billing-stripe", () => ({
  getPlatformBillingAvailability: (...args: unknown[]) => getPlatformBillingAvailability(...args),
  createPlatformSubscriptionCheckoutSession: (...args: unknown[]) =>
    createPlatformSubscriptionCheckoutSession(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalRole: (...args: unknown[]) => requireInternalRole(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClient(),
}));

async function postCheckout() {
  const { POST } = await import("@/app/api/stripe/checkout/route");
  return POST();
}

describe("POST /api/stripe/checkout — platform subscription checkout", () => {
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
    createPlatformSubscriptionCheckoutSession.mockResolvedValue({
      url: "https://checkout.stripe.test/session_123",
    });
  });

  it("returns 503 with the missing keys when checkout is not configured, without touching auth or Stripe", async () => {
    getPlatformBillingAvailability.mockReturnValue({
      checkoutAvailable: false,
      portalAvailable: false,
      missingKeys: ["STRIPE_SECRET_KEY", "STRIPE_PLATFORM_PRICE_ID"],
    });

    const res = await postCheckout();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/not configured/i);
    expect(body.missingKeys).toEqual(["STRIPE_SECRET_KEY", "STRIPE_PLATFORM_PRICE_ID"]);
    expect(requireInternalRole).not.toHaveBeenCalled();
    expect(createPlatformSubscriptionCheckoutSession).not.toHaveBeenCalled();
  });

  it("redirects (303) to the Stripe checkout URL for an authorized admin, scoped to their account owner", async () => {
    const res = await postCheckout();

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://checkout.stripe.test/session_123");
    expect(requireInternalRole).toHaveBeenCalledWith(
      "admin",
      expect.objectContaining({ supabase: expect.anything() }),
    );
    expect(createPlatformSubscriptionCheckoutSession).toHaveBeenCalledWith({
      accountOwnerUserId: "owner-1",
    });
  });

  it("returns 403 (not 500) when the caller is not an authorized internal admin", async () => {
    requireInternalRole.mockRejectedValue(new Error("Admin role required"));

    const res = await postCheckout();

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Admin role required");
    expect(createPlatformSubscriptionCheckoutSession).not.toHaveBeenCalled();
  });

  it("maps unauthorized/authentication error messages to 403", async () => {
    requireInternalRole.mockRejectedValue(new Error("Unauthorized"));
    expect((await postCheckout()).status).toBe(403);

    requireInternalRole.mockRejectedValue(new Error("authentication session expired"));
    expect((await postCheckout()).status).toBe(403);
  });

  it("returns 500 when Stripe session creation fails for a non-auth reason", async () => {
    createPlatformSubscriptionCheckoutSession.mockRejectedValue(new Error("Stripe upstream error"));

    const res = await postCheckout();

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Stripe upstream error");
  });
});
