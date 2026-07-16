import { beforeEach, describe, expect, it, vi } from "vitest";

const recordMock = vi.fn();
vi.mock("@/lib/business/tenant-stripe-connect-readiness", () => ({ resolveTenantStripeConnectReadiness: vi.fn(async () => ({ isReady: true, connectedAccountId: "acct_1" })) }));
vi.mock("@/lib/business/tenant-invoice-stripe-webhooks", () => ({ recordTenantInvoicePaymentFromCheckoutSession: (...args: any[]) => recordMock(...args) }));
vi.mock("@/lib/qbo/qbo-payment-auto-sync", () => ({ autoSyncRecordedPaymentToQbo: vi.fn() }));
vi.mock("@/lib/payments/payment-received-email", () => ({ deliverInternalPaymentReceivedEmail: vi.fn() }));

import { repairVerifiedStripePendingPayment } from "@/lib/business/stripe-pending-payment-repair";

function chain(result: any, single = false) {
  const value: any = {};
  for (const method of ["select", "eq", "not"]) value[method] = vi.fn(() => value);
  value.then = (resolve: any) => resolve(result);
  if (single) value.maybeSingle = vi.fn(async () => result);
  return value;
}

function admin(candidates: any[]) {
  const selected = { id: "11111111-1111-4111-8111-111111111111", account_owner_user_id: "owner-1", invoice_id: "inv-1", job_id: "job-1", amount_cents: 41000, payment_status: "pending", processor_name: "stripe", payment_method: "card_stripe_online", stripe_checkout_session_id: "cs_paid" };
  const queries = [chain({ data: selected, error: null }, true), chain({ data: candidates, error: null })];
  return { from: vi.fn(() => queries.shift()) };
}

function session(id: string, status: "paid" | "unpaid" = "paid") {
  return { id, mode: "payment", created: 1000, payment_status: status, status: status === "paid" ? "complete" : "open", amount_total: 41000, payment_intent: "pi_1", metadata: { account_owner_user_id: "owner-1", invoice_id: "inv-1", job_id: "job-1" } };
}

describe("repairVerifiedStripePendingPayment", () => {
  beforeEach(() => { vi.clearAllMocks(); recordMock.mockResolvedValue({ recorded: true, paymentId: "11111111-1111-4111-8111-111111111111" }); });

  it("settles one exactly matched paid session through the webhook truth path", async () => {
    const stripe: any = { checkout: { sessions: { retrieve: vi.fn(async () => session("cs_paid")) } }, events: { list: vi.fn(async () => ({ data: [{ id: "evt_real_1", data: { object: session("cs_paid") } }] })) } };
    const syncQbo = vi.fn(); const sendReceipt = vi.fn();
    const result = await repairVerifiedStripePendingPayment({ admin: admin([{ id: "11111111-1111-4111-8111-111111111111", amount_cents: 41000, stripe_checkout_session_id: "cs_paid" }]), stripe, accountOwnerUserId: "owner-1", paymentId: "11111111-1111-4111-8111-111111111111", syncQbo, sendReceipt });
    expect(result).toMatchObject({ repaired: true, qboSynced: true, receiptSent: true });
    expect(recordMock).toHaveBeenCalledWith(expect.objectContaining({ eventId: "evt_real_1", connectedAccountId: "acct_1" }));
    expect(syncQbo).toHaveBeenCalledTimes(1); expect(sendReceipt).toHaveBeenCalledTimes(1);
  });

  it("refuses two successful sessions before recording any payment", async () => {
    const stripe: any = { checkout: { sessions: { retrieve: vi.fn(async (id: string) => session(id)) } }, events: { list: vi.fn() } };
    const result = await repairVerifiedStripePendingPayment({ admin: admin([{ id: "11111111-1111-4111-8111-111111111111", stripe_checkout_session_id: "cs_paid" }, { id: "22222222-2222-4222-8222-222222222222", stripe_checkout_session_id: "cs_other" }]), stripe, accountOwnerUserId: "owner-1", paymentId: "11111111-1111-4111-8111-111111111111" });
    expect(result).toEqual({ repaired: false, reason: "multiple_paid_sessions" });
    expect(recordMock).not.toHaveBeenCalled(); expect(stripe.events.list).not.toHaveBeenCalled();
  });
});
