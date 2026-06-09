import { describe, expect, it, vi } from "vitest";
import { syncStripePaymentSettlementForPayment } from "@/lib/business/stripe-payment-settlements";

type SupabaseFixtureOptions = {
  payment?: Record<string, unknown> | null;
  readiness?: Record<string, unknown> | null;
  settlementId?: string;
  paymentError?: { message?: string } | null;
  upsertError?: { message?: string } | null;
};

function basePayment(overrides?: Record<string, unknown>) {
  return {
    id: "pay_1",
    account_owner_user_id: "owner-1",
    payment_status: "recorded",
    payment_method: "card_stripe_online",
    amount_cents: 50000,
    processor_name: "stripe",
    processor_payment_reference: "ch_1",
    processor_charge_id: "ch_1",
    stripe_checkout_session_id: "cs_1",
    stripe_payment_intent_id: "pi_1",
    ...overrides,
  };
}

function baseReadiness(overrides?: Record<string, unknown>) {
  return {
    stripe_connected_account_id: "acct_1",
    stripe_connect_onboarding_status: "complete",
    stripe_charges_enabled: true,
    stripe_payouts_enabled: true,
    stripe_details_submitted: true,
    stripe_connect_disabled_reason: null,
    stripe_connect_last_synced_at: "2026-06-10T12:00:00.000Z",
    ...overrides,
  };
}

function makeSupabase(options?: SupabaseFixtureOptions) {
  const tableCalls: string[] = [];
  const payment = options?.payment === undefined ? basePayment() : options.payment;
  const readiness = options?.readiness === undefined ? baseReadiness() : options.readiness;
  const upserts: Array<{ payload: Record<string, unknown>; options: Record<string, unknown> }> = [];

  const supabase = {
    from: vi.fn((table: string) => {
      tableCalls.push(table);

      if (table === "internal_invoice_payments") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({
            data: payment,
            error: options?.paymentError ?? null,
          })),
        };
        return query;
      }

      if (table === "internal_business_profiles") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({
            data: readiness,
            error: null,
          })),
        };
        return query;
      }

      if (table === "stripe_payment_settlements") {
        const query: any = {
          upsert: vi.fn((payload: Record<string, unknown>, opts: Record<string, unknown>) => {
            upserts.push({ payload, options: opts });
            return query;
          }),
          select: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({
            data: options?.upsertError ? null : { id: options?.settlementId ?? "settlement-1" },
            error: options?.upsertError ?? null,
          })),
        };
        return query;
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { supabase, tableCalls, upserts };
}

function makeStripe(options?: {
  charge?: Record<string, unknown>;
  balanceTransaction?: Record<string, unknown>;
  payout?: Record<string, unknown>;
  chargeError?: Error;
  balanceError?: Error;
  payoutError?: Error;
}) {
  const stripe = {
    charges: {
      retrieve: vi.fn(async () => {
        if (options?.chargeError) throw options.chargeError;
        return {
          id: "ch_1",
          amount: 50000,
          currency: "usd",
          payment_intent: "pi_1",
          balance_transaction: "txn_1",
          ...options?.charge,
        };
      }),
    },
    balanceTransactions: {
      retrieve: vi.fn(async () => {
        if (options?.balanceError) throw options.balanceError;
        return {
          id: "txn_1",
          amount: 50000,
          fee: 1000,
          net: 49000,
          currency: "usd",
          available_on: 1781049600,
          reporting_category: "charge",
          payout: "po_1",
          fee_details: [
            {
              amount: 1000,
              currency: "usd",
              type: "stripe_fee",
              description: "Stripe processing fees",
            },
          ],
          ...options?.balanceTransaction,
        };
      }),
    },
    payouts: {
      retrieve: vi.fn(async () => {
        if (options?.payoutError) throw options.payoutError;
        return {
          id: "po_1",
          status: "paid",
          arrival_date: 1781136000,
          ...options?.payout,
        };
      }),
    },
  };

  return stripe;
}

describe("syncStripePaymentSettlementForPayment", () => {
  it("syncs by payment row and fetches charge in connected-account context", async () => {
    const { supabase } = makeSupabase();
    const stripe = makeStripe();

    const result = await syncStripePaymentSettlementForPayment({
      supabase,
      stripe: stripe as any,
      accountOwnerUserId: "owner-1",
      internalInvoicePaymentId: "pay_1",
      now: new Date("2026-06-10T12:00:00.000Z"),
    });

    expect(result.status).toBe("synced");
    expect(stripe.charges.retrieve).toHaveBeenCalledWith(
      "ch_1",
      {},
      { stripeAccount: "acct_1" },
    );
    expect(stripe.balanceTransactions.retrieve).toHaveBeenCalledWith(
      "txn_1",
      {},
      { stripeAccount: "acct_1" },
    );
    expect(stripe.payouts.retrieve).toHaveBeenCalledWith(
      "po_1",
      {},
      { stripeAccount: "acct_1" },
    );
  });

  it("stores balance transaction gross fee net currency availability category and fee details", async () => {
    const { supabase, upserts } = makeSupabase();
    const stripe = makeStripe();

    await syncStripePaymentSettlementForPayment({
      supabase,
      stripe: stripe as any,
      accountOwnerUserId: "owner-1",
      internalInvoicePaymentId: "pay_1",
      now: new Date("2026-06-10T12:00:00.000Z"),
    });

    expect(upserts[0]?.payload).toMatchObject({
      account_owner_user_id: "owner-1",
      internal_invoice_payment_id: "pay_1",
      stripe_connected_account_id: "acct_1",
      stripe_charge_id: "ch_1",
      stripe_payment_intent_id: "pi_1",
      stripe_checkout_session_id: "cs_1",
      stripe_balance_transaction_id: "txn_1",
      settlement_kind: "payment",
      source_object_type: "charge",
      gross_amount_cents: 50000,
      stripe_fee_cents: 1000,
      platform_fee_cents: 0,
      net_amount_cents: 49000,
      currency: "usd",
      available_on: "2026-06-10T00:00:00.000Z",
      reporting_category: "charge",
      fee_details: [
        {
          amount: 1000,
          currency: "usd",
          type: "stripe_fee",
          description: "Stripe processing fees",
          application: null,
        },
      ],
      sync_status: "synced",
      sync_error: null,
      synced_at: "2026-06-10T12:00:00.000Z",
    });
  });

  it("stores payout id status and arrival date when payout is available", async () => {
    const { supabase, upserts } = makeSupabase();

    await syncStripePaymentSettlementForPayment({
      supabase,
      stripe: makeStripe() as any,
      accountOwnerUserId: "owner-1",
      internalInvoicePaymentId: "pay_1",
    });

    expect(upserts[0]?.payload).toMatchObject({
      stripe_payout_id: "po_1",
      payout_status: "paid",
      payout_arrival_date: "2026-06-11T00:00:00.000Z",
    });
  });

  it("idempotently upserts by connected account and balance transaction identity", async () => {
    const { supabase, upserts } = makeSupabase({ settlementId: "settlement-existing" });
    const stripe = makeStripe();

    const first = await syncStripePaymentSettlementForPayment({
      supabase,
      stripe: stripe as any,
      accountOwnerUserId: "owner-1",
      internalInvoicePaymentId: "pay_1",
    });
    const second = await syncStripePaymentSettlementForPayment({
      supabase,
      stripe: stripe as any,
      accountOwnerUserId: "owner-1",
      internalInvoicePaymentId: "pay_1",
    });

    expect(first.settlementId).toBe("settlement-existing");
    expect(second.settlementId).toBe("settlement-existing");
    expect(upserts).toHaveLength(2);
    expect(upserts[0]?.options).toEqual({
      onConflict: "stripe_connected_account_id,stripe_balance_transaction_id",
    });
    expect(upserts[1]?.payload.stripe_balance_transaction_id).toBe("txn_1");
  });

  it("skips manual off-platform payments without calling Stripe", async () => {
    const { supabase } = makeSupabase({
      payment: basePayment({
        payment_method: "check",
        processor_name: null,
        processor_charge_id: null,
        processor_payment_reference: "check-1001",
        stripe_payment_intent_id: null,
        stripe_checkout_session_id: null,
      }),
    });
    const stripe = makeStripe();

    const result = await syncStripePaymentSettlementForPayment({
      supabase,
      stripe: stripe as any,
      accountOwnerUserId: "owner-1",
      internalInvoicePaymentId: "pay_1",
    });

    expect(result.status).toBe("skipped");
    expect(result.code).toBe("not_collected_stripe_payment");
    expect(stripe.charges.retrieve).not.toHaveBeenCalled();
  });

  it("skips when no usable charge id exists", async () => {
    const { supabase } = makeSupabase({
      payment: basePayment({
        processor_charge_id: null,
        processor_payment_reference: "not-a-charge",
      }),
    });
    const stripe = makeStripe();

    const result = await syncStripePaymentSettlementForPayment({
      supabase,
      stripe: stripe as any,
      accountOwnerUserId: "owner-1",
      internalInvoicePaymentId: "pay_1",
    });

    expect(result.status).toBe("skipped");
    expect(result.code).toBe("missing_charge_id");
    expect(stripe.charges.retrieve).not.toHaveBeenCalled();
  });

  it("skips when connected account is missing or not ready", async () => {
    const { supabase } = makeSupabase({
      readiness: baseReadiness({
        stripe_connected_account_id: null,
        stripe_charges_enabled: false,
      }),
    });
    const stripe = makeStripe();

    const result = await syncStripePaymentSettlementForPayment({
      supabase,
      stripe: stripe as any,
      accountOwnerUserId: "owner-1",
      internalInvoicePaymentId: "pay_1",
    });

    expect(result.status).toBe("skipped");
    expect(result.code).toBe("connect_not_ready");
    expect(stripe.charges.retrieve).not.toHaveBeenCalled();
  });

  it("returns failed when Stripe charge fetch fails", async () => {
    const { supabase, upserts } = makeSupabase();

    const result = await syncStripePaymentSettlementForPayment({
      supabase,
      stripe: makeStripe({ chargeError: new Error("charge unavailable") }) as any,
      accountOwnerUserId: "owner-1",
      internalInvoicePaymentId: "pay_1",
    });

    expect(result.status).toBe("failed");
    expect(result.code).toBe("stripe_charge_fetch_failed");
    expect(result.reason).toContain("charge unavailable");
    expect(upserts).toHaveLength(0);
  });

  it("records settlement sync failure when payout fetch fails without touching invoice truth", async () => {
    const { supabase, upserts, tableCalls } = makeSupabase();

    const result = await syncStripePaymentSettlementForPayment({
      supabase,
      stripe: makeStripe({ payoutError: new Error("payout unavailable") }) as any,
      accountOwnerUserId: "owner-1",
      internalInvoicePaymentId: "pay_1",
    });

    expect(result.status).toBe("failed");
    expect(result.code).toBe("stripe_payout_fetch_failed");
    expect(upserts[0]?.payload).toMatchObject({
      sync_status: "failed",
      sync_error: "payout unavailable",
      stripe_payout_id: "po_1",
    });
    expect(tableCalls).not.toContain("internal_invoices");
    expect(tableCalls).not.toContain("internal_invoice_payment_allocations");
  });

  it("never calls invoice payment or allocation mutation paths", async () => {
    const { supabase, tableCalls } = makeSupabase();

    await syncStripePaymentSettlementForPayment({
      supabase,
      stripe: makeStripe() as any,
      accountOwnerUserId: "owner-1",
      internalInvoicePaymentId: "pay_1",
    });

    expect(tableCalls).toEqual([
      "internal_invoice_payments",
      "internal_business_profiles",
      "stripe_payment_settlements",
    ]);
  });

  it("does not guess platform fee values when unavailable", async () => {
    const { supabase, upserts } = makeSupabase();

    const result = await syncStripePaymentSettlementForPayment({
      supabase,
      stripe: makeStripe() as any,
      accountOwnerUserId: "owner-1",
      internalInvoicePaymentId: "pay_1",
    });

    expect(result.platformFeeProven).toBe(false);
    expect(upserts[0]?.payload.platform_fee_cents).toBe(0);
    expect(upserts[0]?.payload.net_amount_cents).toBe(49000);
  });

  it("does not treat failed or reversed payment rows as collected settlements", async () => {
    for (const status of ["failed", "pending", "reversed"]) {
      const { supabase } = makeSupabase({
        payment: basePayment({ payment_status: status }),
      });
      const stripe = makeStripe();

      const result = await syncStripePaymentSettlementForPayment({
        supabase,
        stripe: stripe as any,
        accountOwnerUserId: "owner-1",
        internalInvoicePaymentId: "pay_1",
      });

      expect(result.status).toBe("skipped");
      expect(result.code).toBe("not_collected_stripe_payment");
      expect(stripe.charges.retrieve).not.toHaveBeenCalled();
    }
  });
});
