import { beforeEach, describe, expect, it, vi } from "vitest";

const syncSettlement = vi.fn();
const getStripeServerClient = vi.fn(() => ({ charges: {}, balanceTransactions: {}, payouts: {} }));
const createAdminClient = vi.fn();

vi.mock("@/lib/business/stripe-payment-settlements", () => ({
  syncStripePaymentSettlementForPayment: syncSettlement,
}));
vi.mock("@/lib/business/platform-billing-stripe", () => ({ getStripeServerClient }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient }));

function makeAdmin(payment: Record<string, unknown> | null, error: unknown = null) {
  const maybeSingle = vi.fn(async () => ({ data: payment, error }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return { from: vi.fn(() => ({ select })) };
}

describe("autoSyncRecordedPaymentSettlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncSettlement.mockResolvedValue({
      status: "synced",
      code: "synced",
      reason: "Settlement synchronized.",
      settlementId: "set-1",
      platformFeeProven: true,
    });
  });

  it("syncs only after recorded payment truth exists and preserves account scope", async () => {
    const admin = makeAdmin({ id: "pay-1", account_owner_user_id: "owner-1", payment_status: "recorded" });
    const { autoSyncRecordedPaymentSettlement } = await import("@/lib/business/stripe-settlement-auto-sync");

    const result = await autoSyncRecordedPaymentSettlement({ paymentId: "pay-1", admin });

    expect(result.status).toBe("synced");
    expect(syncSettlement).toHaveBeenCalledWith(expect.objectContaining({
      supabase: admin,
      accountOwnerUserId: "owner-1",
      internalInvoicePaymentId: "pay-1",
    }));
  });

  it("does not call Stripe or settlement writes for an unrecorded payment", async () => {
    const admin = makeAdmin({ id: "pay-1", account_owner_user_id: "owner-1", payment_status: "pending" });
    const { autoSyncRecordedPaymentSettlement } = await import("@/lib/business/stripe-settlement-auto-sync");

    const result = await autoSyncRecordedPaymentSettlement({ paymentId: "pay-1", admin });

    expect(result.code).toBe("payment_not_recorded");
    expect(syncSettlement).not.toHaveBeenCalled();
    expect(getStripeServerClient).not.toHaveBeenCalled();
  });
});
