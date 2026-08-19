import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const mockUpsertAllocation = vi.fn();
const mockConnectReadiness = vi.fn();

vi.mock("@/lib/business/payment-allocations", () => ({
  upsertInvoicePaymentAllocationForPaymentRow: (...args: unknown[]) => mockUpsertAllocation(...args),
}));
vi.mock("@/lib/business/tenant-stripe-connect-readiness", () => ({
  resolveTenantStripeConnectReadiness: (...args: unknown[]) => mockConnectReadiness(...args),
}));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/actions/job-actions", () => ({ insertJobEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/business/stripe-abandoned-session-cleanup", () => ({
  closeVerifiedAbandonedStripeSession: vi.fn(),
}));

/** Fake admin serving one payment row and recording every update payload. */
function makeAdmin(paymentRow: Record<string, unknown> | null) {
  const updates: Array<Record<string, unknown>> = [];
  const admin = {
    from: vi.fn(() => {
      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        or: vi.fn(() => query),
        limit: vi.fn(async () => ({ data: paymentRow ? [paymentRow] : [], error: null })),
        maybeSingle: vi.fn(async () => ({
          data: paymentRow ? { id: paymentRow.id, amount_cents: paymentRow.amount_cents } : null,
          error: null,
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          updates.push(payload);
          return query;
        }),
      };
      return query;
    }),
  };
  return { admin, updates };
}

const RECORDED_PAYMENT = {
  id: "pay-1",
  invoice_id: "inv-1",
  job_id: "job-1",
  amount_cents: 48500,
  payment_status: "recorded",
  dispute_status: null,
  stripe_dispute_id: null,
  stripe_refunded_amount_cents: null,
  account_owner_user_id: "owner-1",
};

function refundCharge(overrides: Partial<Stripe.Charge> = {}): Stripe.Charge {
  return {
    id: "ch_1",
    amount: 48500,
    amount_refunded: 48500,
    payment_intent: "pi_1",
    metadata: { account_owner_user_id: "owner-1", invoice_id: "inv-1", job_id: "job-1" },
    ...overrides,
  } as Stripe.Charge;
}

function dispute(overrides: Partial<Stripe.Dispute> = {}): Stripe.Dispute {
  return {
    id: "dp_1",
    charge: "ch_1",
    payment_intent: "pi_1",
    reason: "fraudulent",
    status: "needs_response",
    metadata: { account_owner_user_id: "owner-1" },
    ...overrides,
  } as Stripe.Dispute;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpsertAllocation.mockResolvedValue({ ok: true, status: "written", allocationStatus: "active" });
  mockConnectReadiness.mockResolvedValue({ isReady: true, connectedAccountId: "acct_1" });
});

describe("recordTenantInvoiceRefundFromStripeCharge", () => {
  it("reverses the payment on a full refund and dual-writes the allocation", async () => {
    const { recordTenantInvoiceRefundFromStripeCharge } = await import("@/lib/business/tenant-invoice-stripe-webhooks");
    const { admin, updates } = makeAdmin(RECORDED_PAYMENT);

    const result = await recordTenantInvoiceRefundFromStripeCharge({
      charge: refundCharge(), eventId: "evt_1", connectedAccountId: "acct_1", admin,
    });

    expect(result.applied).toBe(true);
    expect(updates.at(-1)).toMatchObject({ payment_status: "reversed", stripe_refunded_amount_cents: 48500 });
    // The invoice balance derives from allocations, not the payment row — without
    // this the payment reverses while the invoice still reads paid.
    expect(mockUpsertAllocation).toHaveBeenCalledWith(
      expect.objectContaining({ paymentRow: expect.objectContaining({ payment_status: "reversed" }) }),
    );
  });

  it("does NOT reverse on a partial refund, and records the amount for a human", async () => {
    const { recordTenantInvoiceRefundFromStripeCharge } = await import("@/lib/business/tenant-invoice-stripe-webhooks");
    const { admin, updates } = makeAdmin(RECORDED_PAYMENT);

    const result = await recordTenantInvoiceRefundFromStripeCharge({
      charge: refundCharge({ amount_refunded: 10000 }), eventId: "evt_2", connectedAccountId: "acct_1", admin,
    });

    expect(result.applied).toBe(true);
    expect(updates.at(-1)).toEqual({ stripe_refunded_amount_cents: 10000 });
    expect(updates.some((u) => u.payment_status === "reversed")).toBe(false);
    expect(mockUpsertAllocation).not.toHaveBeenCalled();
  });

  it("is idempotent when the payment is already reversed", async () => {
    const { recordTenantInvoiceRefundFromStripeCharge } = await import("@/lib/business/tenant-invoice-stripe-webhooks");
    const { admin, updates } = makeAdmin({ ...RECORDED_PAYMENT, payment_status: "reversed" });

    const result = await recordTenantInvoiceRefundFromStripeCharge({
      charge: refundCharge(), eventId: "evt_replay", connectedAccountId: "acct_1", admin,
    });

    expect(result.applied).toBe(false);
    expect(updates).toHaveLength(0);
    expect(mockUpsertAllocation).toHaveBeenCalledWith(expect.objectContaining({
      paymentRow: expect.objectContaining({ id: "pay-1", payment_status: "reversed" }),
    }));
  });

  it("fails the delivery when reversal allocation cannot be confirmed", async () => {
    const { recordTenantInvoiceRefundFromStripeCharge } = await import("@/lib/business/tenant-invoice-stripe-webhooks");
    mockUpsertAllocation.mockResolvedValueOnce({ ok: false, status: "failed", reason: "allocation write failed" });
    const { admin } = makeAdmin(RECORDED_PAYMENT);

    await expect(recordTenantInvoiceRefundFromStripeCharge({
      charge: refundCharge(), eventId: "evt_allocation_failure", connectedAccountId: "acct_1", admin,
    })).rejects.toThrow("invoice allocation could not be updated");
  });

  it("ignores a refund event with no refunded money", async () => {
    const { recordTenantInvoiceRefundFromStripeCharge } = await import("@/lib/business/tenant-invoice-stripe-webhooks");
    const { admin, updates } = makeAdmin(RECORDED_PAYMENT);

    const result = await recordTenantInvoiceRefundFromStripeCharge({
      charge: refundCharge({ amount_refunded: 0 }), eventId: "evt_zero", connectedAccountId: "acct_1", admin,
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toContain("no positive refunded amount");
    expect(updates).toHaveLength(0);
  });

  it("refuses a refund arriving on a mismatched connected account", async () => {
    const { recordTenantInvoiceRefundFromStripeCharge } = await import("@/lib/business/tenant-invoice-stripe-webhooks");
    const { admin, updates } = makeAdmin(RECORDED_PAYMENT);

    const result = await recordTenantInvoiceRefundFromStripeCharge({
      charge: refundCharge(), eventId: "evt_x", connectedAccountId: "acct_other", admin,
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toContain("Connected account");
    expect(updates).toHaveLength(0);
  });
});

describe("recordTenantInvoiceDisputeFromStripe", () => {
  it("opens a dispute WITHOUT reversing — the money may still be ours", async () => {
    const { recordTenantInvoiceDisputeFromStripe } = await import("@/lib/business/tenant-invoice-stripe-webhooks");
    const { admin, updates } = makeAdmin(RECORDED_PAYMENT);

    const result = await recordTenantInvoiceDisputeFromStripe({
      dispute: dispute(), eventId: "evt_d1", closed: false, connectedAccountId: "acct_1", admin,
    });

    expect(result.applied).toBe(true);
    expect(updates.at(-1)).toMatchObject({ dispute_status: "open", dispute_reason: "fraudulent" });
    expect(updates.some((u) => u.payment_status === "reversed")).toBe(false);
    expect(mockUpsertAllocation).not.toHaveBeenCalled();
  });

  it("reverses the payment when the dispute is lost", async () => {
    const { recordTenantInvoiceDisputeFromStripe } = await import("@/lib/business/tenant-invoice-stripe-webhooks");
    const { admin, updates } = makeAdmin(RECORDED_PAYMENT);

    const result = await recordTenantInvoiceDisputeFromStripe({
      dispute: dispute({ status: "lost" }), eventId: "evt_d2", closed: true, connectedAccountId: "acct_1", admin,
    });

    expect(result.applied).toBe(true);
    expect(updates.some((u) => u.dispute_status === "lost")).toBe(true);
    expect(updates.some((u) => u.payment_status === "reversed")).toBe(true);
    expect(mockUpsertAllocation).toHaveBeenCalled();
  });

  it("leaves the payment standing when the dispute is won", async () => {
    const { recordTenantInvoiceDisputeFromStripe } = await import("@/lib/business/tenant-invoice-stripe-webhooks");
    const { admin, updates } = makeAdmin(RECORDED_PAYMENT);

    const result = await recordTenantInvoiceDisputeFromStripe({
      dispute: dispute({ status: "won" }), eventId: "evt_d3", closed: true, connectedAccountId: "acct_1", admin,
    });

    expect(result.applied).toBe(true);
    expect(updates.some((u) => u.dispute_status === "won")).toBe(true);
    expect(updates.some((u) => u.payment_status === "reversed")).toBe(false);
    expect(mockUpsertAllocation).not.toHaveBeenCalled();
  });

  it("resolves the account from the payment row when the dispute carries no metadata", async () => {
    const { recordTenantInvoiceDisputeFromStripe } = await import("@/lib/business/tenant-invoice-stripe-webhooks");
    const { admin, updates } = makeAdmin(RECORDED_PAYMENT);

    const result = await recordTenantInvoiceDisputeFromStripe({
      dispute: dispute({ metadata: {} as Stripe.Metadata }), eventId: "evt_d4", closed: false, connectedAccountId: "acct_1", admin,
    });

    expect(result.applied).toBe(true);
    expect(updates.at(-1)).toMatchObject({ dispute_status: "open" });
  });

  it("does not reopen a resolved dispute when created arrives out of order", async () => {
    const { recordTenantInvoiceDisputeFromStripe } = await import("@/lib/business/tenant-invoice-stripe-webhooks");
    const { admin, updates } = makeAdmin({
      ...RECORDED_PAYMENT,
      dispute_status: "won",
      stripe_dispute_id: "dp_1",
    });

    const result = await recordTenantInvoiceDisputeFromStripe({
      dispute: dispute(), eventId: "evt_delayed_created", closed: false, connectedAccountId: "acct_1", admin,
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("Dispute already resolved");
    expect(updates).toHaveLength(0);
  });
});
