import { describe, expect, it, vi } from "vitest";

import { linkVerifiedStripePaymentIdentity } from "@/lib/reconciliation/link-stripe-payment-identity";

const OWNER = "93dd810e-3c0c-4b69-9dae-edfa0e481dbb";
const INVOICE = "3599d52f-7bb3-4c45-aeff-2bc695811be8";
const JOB = "79c851ea-af65-4090-a8a7-b6cb7729404b";

function makeAdmin(paymentOverrides: Record<string, unknown> = {}) {
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const maybeQueues: Record<string, any[]> = {
    reconciliation_findings: [{ data: { id: "finding-1", finding_type: "stripe_payment_identity_mismatch", subject_id: "payment-1", external_id: "py_1", external_system: "stripe", amount_cents: 85000, job_id: JOB, resolved_at: null }, error: null }],
    internal_invoice_payments: [
      { data: { id: "payment-1", account_owner_user_id: OWNER, invoice_id: INVOICE, job_id: JOB, amount_cents: 85000, payment_status: "recorded", payment_method: "card_stripe_online", processor_name: null, processor_payment_reference: null, processor_charge_id: null, stripe_payment_intent_id: null, ...paymentOverrides }, error: null },
      { data: { id: "payment-1" }, error: null },
    ],
    internal_business_profiles: [{ data: { stripe_connected_account_id: "acct_1", stripe_connect_onboarding_status: "complete", stripe_charges_enabled: true, stripe_payouts_enabled: true, stripe_details_submitted: true, stripe_connect_disabled_reason: null, stripe_connect_last_synced_at: null }, error: null }],
  };
  const limitQueues: Record<string, any[]> = {
    internal_invoice_payments: [{ data: [], error: null }],
  };
  const admin = {
    from: vi.fn((table: string) => {
      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        or: vi.fn(() => query),
        update: vi.fn((patch: Record<string, unknown>) => { updates.push({ table, patch }); return query; }),
        maybeSingle: vi.fn(async () => maybeQueues[table]?.shift() ?? { data: null, error: null }),
        limit: vi.fn(async () => limitQueues[table]?.shift() ?? { data: [], error: null }),
        is: vi.fn(async () => ({ data: null, error: null })),
      };
      return query;
    }),
  };
  return { admin, updates };
}

function stripeCharge(overrides: Record<string, unknown> = {}) {
  return {
    charges: {
      retrieve: vi.fn(async () => ({
        id: "py_1", status: "succeeded", paid: true, refunded: false, amount_refunded: 0,
        disputed: false, amount: 85000, currency: "usd", payment_intent: "pi_1", created: 1786380000,
        metadata: { account_owner_user_id: OWNER, invoice_id: INVOICE, job_id: JOB },
        ...overrides,
      })),
    },
  } as any;
}

describe("linkVerifiedStripePaymentIdentity", () => {
  it("links only the verified Stripe identity to an existing recorded payment", async () => {
    const { admin, updates } = makeAdmin();
    const result = await linkVerifiedStripePaymentIdentity({ admin, accountOwnerUserId: OWNER, findingId: "finding-1", stripe: stripeCharge() });

    expect(result).toEqual({ status: "linked", paymentId: "payment-1", invoiceId: INVOICE });
    expect(updates.find((entry) => entry.table === "internal_invoice_payments")?.patch).toMatchObject({
      processor_name: "stripe",
      processor_payment_reference: "py_1",
      processor_charge_id: "py_1",
      stripe_payment_intent_id: "pi_1",
      stripe_identity_dedupe_scope: "recorded_v1",
    });
    expect(updates.find((entry) => entry.table === "internal_invoice_payments")?.patch).not.toHaveProperty("amount_cents");
    expect(updates.find((entry) => entry.table === "internal_invoice_payments")?.patch).not.toHaveProperty("payment_status");
  });

  it("blocks without writing when Stripe amount does not match", async () => {
    const { admin, updates } = makeAdmin();
    const result = await linkVerifiedStripePaymentIdentity({ admin, accountOwnerUserId: OWNER, findingId: "finding-1", stripe: stripeCharge({ amount: 84999 }) });

    expect(result).toEqual({ status: "blocked", error: "Stripe and EveryStep amounts do not match." });
    expect(updates).toHaveLength(0);
  });

  it("puts a verified Stripe identity under the guard even when the legacy method label was offline", async () => {
    const { admin, updates } = makeAdmin({ payment_method: "card_off_platform" });
    const result = await linkVerifiedStripePaymentIdentity({ admin, accountOwnerUserId: OWNER, findingId: "finding-1", stripe: stripeCharge() });

    expect(result.status).toBe("linked");
    expect(updates.find((entry) => entry.table === "internal_invoice_payments")?.patch).toMatchObject({
      processor_name: "stripe",
      stripe_identity_dedupe_scope: "recorded_v1",
    });
  });
});
