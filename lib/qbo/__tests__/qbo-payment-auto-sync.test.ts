import { beforeEach, describe, expect, it, vi } from "vitest";

const { getQboAvailability, syncPaymentToQbo, createAdminClient } = vi.hoisted(() => ({
  getQboAvailability: vi.fn(),
  syncPaymentToQbo: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/qbo/qbo-env", () => ({ getQboAvailability }));
vi.mock("@/lib/qbo/qbo-payment-sync", () => ({ syncPaymentToQbo }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient }));

import { autoSyncRecordedPaymentToQbo } from "@/lib/qbo/qbo-payment-auto-sync";

function adminWithPaymentOwner(ownerId: string | null) {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({
      data: ownerId ? { account_owner_user_id: ownerId } : null,
      error: null,
    })),
  };
  return { from: vi.fn(() => builder) };
}

beforeEach(() => {
  vi.clearAllMocks();
  getQboAvailability.mockReturnValue({ available: true, missingKeys: [] });
  syncPaymentToQbo.mockResolvedValue({ paymentId: "pay-1", status: "synced" });
});

describe("autoSyncRecordedPaymentToQbo", () => {
  it("uses the supplied account scope for internal manual-payment callers", async () => {
    const admin = adminWithPaymentOwner(null);
    createAdminClient.mockReturnValue(admin);

    await autoSyncRecordedPaymentToQbo({
      accountOwnerUserId: "owner-1",
      paymentId: "pay-1",
    });

    expect(admin.from).not.toHaveBeenCalled();
    expect(syncPaymentToQbo).toHaveBeenCalledWith({
      supabase: admin,
      accountOwnerUserId: "owner-1",
      paymentId: "pay-1",
    });
  });

  it("resolves account scope from durable payment truth for Stripe webhook callers", async () => {
    const admin = adminWithPaymentOwner("owner-webhook");
    createAdminClient.mockReturnValue(admin);

    await autoSyncRecordedPaymentToQbo({ paymentId: "pay-1" });

    expect(admin.from).toHaveBeenCalledWith("internal_invoice_payments");
    expect(syncPaymentToQbo).toHaveBeenCalledWith({
      supabase: admin,
      accountOwnerUserId: "owner-webhook",
      paymentId: "pay-1",
    });
  });

  it("does not attempt QBO sync when payment scope cannot be resolved", async () => {
    createAdminClient.mockReturnValue(adminWithPaymentOwner(null));
    await autoSyncRecordedPaymentToQbo({ paymentId: "pay-missing" });
    expect(syncPaymentToQbo).not.toHaveBeenCalled();
  });

  it("never throws when downstream QBO sync fails", async () => {
    createAdminClient.mockReturnValue(adminWithPaymentOwner(null));
    syncPaymentToQbo.mockRejectedValueOnce(new Error("QBO unavailable"));
    await expect(autoSyncRecordedPaymentToQbo({
      accountOwnerUserId: "owner-1",
      paymentId: "pay-1",
    })).resolves.toBeNull();
  });

  it("returns the downstream outcome so callers can report incomplete sync", async () => {
    createAdminClient.mockReturnValue(adminWithPaymentOwner(null));
    syncPaymentToQbo.mockResolvedValueOnce({ paymentId: "pay-1", status: "error", error: "Reconnect QuickBooks" });
    await expect(autoSyncRecordedPaymentToQbo({ accountOwnerUserId: "owner-1", paymentId: "pay-1" }))
      .resolves.toMatchObject({ status: "error" });
  });
});
