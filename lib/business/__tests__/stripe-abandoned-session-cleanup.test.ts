import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/business/tenant-stripe-connect-readiness", () => ({ resolveTenantStripeConnectReadiness: vi.fn(async () => ({ isReady: true, connectedAccountId: "acct_1" })) }));
import { closeVerifiedAbandonedStripeSession } from "@/lib/business/stripe-abandoned-session-cleanup";

function query(result: any, single = false) {
  const q: any = {};
  for (const method of ["select", "eq", "limit", "update"]) q[method] = vi.fn(() => q);
  q.then = (resolve: any) => resolve(result);
  if (single) q.maybeSingle = vi.fn(async () => result);
  return q;
}

function admin() {
  const pending = { id: "11111111-1111-4111-8111-111111111111", invoice_id: "inv-1", job_id: "job-1", amount_cents: 41000, created_at: "2026-07-15T00:00:00Z", payment_status: "pending", processor_name: "stripe", payment_method: "card_stripe_online", stripe_checkout_session_id: "cs_open" };
  const queries = [query({ data: pending, error: null }, true), query({ data: [{ id: "recorded-1" }], error: null }), query({ data: { id: pending.id }, error: null }, true)];
  return { client: { from: vi.fn(() => queries.shift()) }, updateQuery: queries[2] };
}

const openSession = { id: "cs_open", status: "open", payment_status: "unpaid", amount_total: 41000, metadata: { account_owner_user_id: "owner-1", invoice_id: "inv-1", job_id: "job-1" } };

describe("closeVerifiedAbandonedStripeSession", () => {
  beforeEach(() => vi.clearAllMocks());
  it("expires one verified open session before conditionally failing its pending row", async () => {
    const { client } = admin();
    const stripe: any = { checkout: { sessions: { retrieve: vi.fn(async () => openSession), expire: vi.fn(async () => ({ ...openSession, status: "expired" })) } } };
    const result = await closeVerifiedAbandonedStripeSession({ admin: client, stripe, accountOwnerUserId: "owner-1", paymentId: "11111111-1111-4111-8111-111111111111" });
    expect(result).toEqual({ closed: true, paymentId: "11111111-1111-4111-8111-111111111111" });
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_open", {}, { stripeAccount: "acct_1" });
  });

  it("does not expire when no other recorded payment exists", async () => {
    const pending = query({ data: { id: "11111111-1111-4111-8111-111111111111", invoice_id: "inv-1", job_id: "job-1", amount_cents: 41000, created_at: "2026-07-15T00:00:00Z", payment_status: "pending", processor_name: "stripe", payment_method: "card_stripe_online", stripe_checkout_session_id: "cs_open" }, error: null }, true);
    const recorded = query({ data: [], error: null });
    const client = { from: vi.fn().mockReturnValueOnce(pending).mockReturnValueOnce(recorded) };
    const stripe: any = { checkout: { sessions: { retrieve: vi.fn(), expire: vi.fn() } } };
    const result = await closeVerifiedAbandonedStripeSession({ admin: client, stripe, accountOwnerUserId: "owner-1", paymentId: "11111111-1111-4111-8111-111111111111" });
    expect(result).toEqual({ closed: false, reason: "invoice_has_no_recorded_payment" });
    expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled(); expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
  });

  it("does not expire a session Stripe now reports paid", async () => {
    const { client } = admin();
    const stripe: any = { checkout: { sessions: { retrieve: vi.fn(async () => ({ ...openSession, status: "complete", payment_status: "paid" })), expire: vi.fn() } } };
    const result = await closeVerifiedAbandonedStripeSession({ admin: client, stripe, accountOwnerUserId: "owner-1", paymentId: "11111111-1111-4111-8111-111111111111" });
    expect(result).toEqual({ closed: false, reason: "session_not_abandoned" });
    expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
  });
});
