import { beforeEach, describe, expect, it, vi } from "vitest";
import { inspectStaleStripePendingPayments } from "@/lib/business/stripe-pending-payment-inspector";

vi.mock("@/lib/business/tenant-stripe-connect-readiness", () => ({
  resolveTenantStripeConnectReadiness: vi.fn(async () => ({ connectedAccountId: "acct_tenant_1", isReady: true })),
}));

function query(result: any) {
  const chain: any = {};
  for (const method of ["select", "eq", "not", "lte", "order", "limit", "in"]) chain[method] = vi.fn(() => chain);
  chain.then = (resolve: any) => resolve(result);
  return chain;
}

function adminFor(paymentRows: any[]) {
  const payments = query({ data: paymentRows, error: null });
  const invoices = query({ data: [{ id: "inv-1", invoice_number: "2104", billing_name: "Angkor HVAC" }], error: null });
  const readiness = query({ data: { stripe_connected_account_id: "acct_tenant_1" }, error: null });
  readiness.maybeSingle = vi.fn(async () => ({ data: { stripe_connected_account_id: "acct_tenant_1", stripe_connect_onboarding_status: "complete", stripe_charges_enabled: true, stripe_payouts_enabled: true, stripe_details_submitted: true }, error: null }));
  return { from: vi.fn((table: string) => table === "internal_invoice_payments" ? payments : table === "internal_invoices" ? invoices : readiness), payments };
}

const row = { id: "pay-1", invoice_id: "inv-1", job_id: "job-1", amount_cents: 41000, created_at: "2026-07-15T10:00:00.000Z", stripe_checkout_session_id: "cs_live_ABCDEFGH" };

describe("inspectStaleStripePendingPayments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("classifies a paid, scoped, amount-matched session without writing", async () => {
    const admin = adminFor([row]);
    const stripe: any = {
      checkout: { sessions: { retrieve: vi.fn(async () => ({ id: row.stripe_checkout_session_id, status: "complete", payment_status: "paid", amount_total: 41000, payment_intent: "pi_live_12345678", metadata: { account_owner_user_id: "owner-1", invoice_id: "inv-1", job_id: "job-1" } })) } },
      paymentIntents: { retrieve: vi.fn(async () => ({ latest_charge: "ch_live_87654321" })) },
    };
    const result = await inspectStaleStripePendingPayments({ admin, stripe, accountOwnerUserId: "owner-1", staleBefore: new Date("2026-07-16T00:00:00Z") });
    expect(result[0]).toMatchObject({ diagnosis: "succeeded_match", checkoutSessionSuffix: "ABCDEFGH", paymentIntentSuffix: "12345678", chargeSuffix: "87654321" });
    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith(row.stripe_checkout_session_id, {}, { stripeAccount: "acct_tenant_1" });
    expect(admin.from).not.toHaveBeenCalledWith("internal_invoice_payment_allocations");
  });

  it("refuses to call a paid session a match when tenant metadata differs", async () => {
    const admin = adminFor([row]);
    const stripe: any = { checkout: { sessions: { retrieve: vi.fn(async () => ({ status: "complete", payment_status: "paid", amount_total: 41000, payment_intent: null, metadata: { account_owner_user_id: "other-owner", invoice_id: "inv-1", job_id: "job-1" } })) } }, paymentIntents: { retrieve: vi.fn() } };
    const result = await inspectStaleStripePendingPayments({ admin, stripe, accountOwnerUserId: "owner-1" });
    expect(result[0].diagnosis).toBe("metadata_mismatch");
  });

  it("limits inspection to stale scoped pending Stripe rows", async () => {
    const admin = adminFor([]);
    await inspectStaleStripePendingPayments({ admin, stripe: {} as any, accountOwnerUserId: "owner-1", limit: 999, staleBefore: new Date("2026-07-16T00:00:00Z") });
    expect(admin.payments.eq).toHaveBeenCalledWith("payment_status", "pending");
    expect(admin.payments.eq).toHaveBeenCalledWith("processor_name", "stripe");
    expect(admin.payments.eq).toHaveBeenCalledWith("payment_method", "card_stripe_online");
    expect(admin.payments.lte).toHaveBeenCalledWith("created_at", "2026-07-16T00:00:00.000Z");
    expect(admin.payments.limit).toHaveBeenCalledWith(50);
  });
});
