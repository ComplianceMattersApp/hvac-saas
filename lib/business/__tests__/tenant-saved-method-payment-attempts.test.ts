import { beforeEach, describe, expect, it, vi } from "vitest";

const mockResolveInvoiceCollectedPaymentSummary = vi.fn();
const mockResolveTenantStripeConnectReadiness = vi.fn();

vi.mock("@/lib/business/internal-invoice-payments", () => ({
  resolveInvoiceCollectedPaymentSummary: (...args: unknown[]) =>
    mockResolveInvoiceCollectedPaymentSummary(...args),
}));

vi.mock("@/lib/business/tenant-stripe-connect-readiness", () => ({
  resolveTenantStripeConnectReadiness: (...args: unknown[]) =>
    mockResolveTenantStripeConnectReadiness(...args),
}));

type TestState = {
  invoiceStatus?: string;
  balanceDueCents?: number;
  setupAuthorized?: boolean;
  inflightAttempt?: boolean;
  paymentIntentStatus?: string;
  paymentIntentFailureCode?: string | null;
  paymentIntentFailureMessage?: string | null;
};

function makeAdmin(state: TestState = {}) {
  const writes: Array<{ table: string; op: "insert" | "update"; payload: any }> = [];

  const invoiceStatus = state.invoiceStatus ?? "issued";
  const balanceDueCents = state.balanceDueCents ?? 2500;
  const setupAuthorized = state.setupAuthorized ?? true;
  const inflightAttempt = state.inflightAttempt ?? false;

  const methodsRow = {
    id: "pm-row-1",
    tenant_stripe_customer_id: "tsc-1",
    stripe_connected_account_id: "acct_test_123",
    stripe_customer_id: "cus_test_123",
    stripe_payment_method_id: "pm_test_123",
    payment_method_status: "active",
    is_default: true,
  };

  const makeSelectQuery = (table: string) => {
    const filters: Record<string, unknown> = {};
    const inFilters: Record<string, unknown[]> = {};

    const query: any = {
      eq: (key: string, value: unknown) => {
        filters[key] = value;
        return query;
      },
      in: (key: string, value: unknown[]) => {
        inFilters[key] = value;
        return query;
      },
      order: () => query,
      limit: async () => {
        if (table === "tenant_stripe_customers") {
          return {
            data: [
              {
                id: "tsc-1",
                stripe_connected_account_id: "acct_test_123",
                stripe_customer_id: "cus_test_123",
                profile_status: "active",
                is_current: true,
              },
            ],
            error: null,
          };
        }

        if (table === "tenant_customer_payment_methods") {
          return {
            data: [methodsRow],
            error: null,
          };
        }

        if (table === "tenant_saved_payment_method_setups") {
          return {
            data: setupAuthorized ? [{ id: "setup-1" }] : [],
            error: null,
          };
        }

        if (table === "tenant_saved_method_payment_attempts") {
          const byInvoice = String(filters.invoice_id ?? "");
          if (inflightAttempt && byInvoice === "inv-1") {
            return { data: [{ id: "attempt-inflight" }], error: null };
          }

          if (String(filters.id ?? "") === "attempt-webhook") {
            return { data: [{ id: "attempt-webhook" }], error: null };
          }

          return { data: [], error: null };
        }

        if (table === "maintenance_agreement_billing_periods") {
          return {
            data: [{ id: "bp-1", maintenance_agreement_id: "ma-1", billing_period_status: "invoice_linked" }],
            error: null,
          };
        }

        return { data: [], error: null };
      },
      maybeSingle: async () => {
        if (table === "internal_invoices") {
          return {
            data: {
              id: "inv-1",
              account_owner_user_id: "owner-1",
              customer_id: "cust-1",
              status: invoiceStatus,
            },
            error: null,
          };
        }

        return { data: null, error: null };
      },
    };

    return query;
  };

  return {
    writes,
    admin: {
      from: (table: string) => {
        const selectQuery = makeSelectQuery(table);

        return {
          select: () => selectQuery,
          insert: async (payload: any) => {
            writes.push({ table, op: "insert", payload });
            return { error: null };
          },
          update: (payload: any) => {
            writes.push({ table, op: "update", payload });
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      },
    },
    setupMocks() {
      mockResolveTenantStripeConnectReadiness.mockResolvedValue({
        connectedAccountId: "acct_test_123",
        isReady: true,
      });
      mockResolveInvoiceCollectedPaymentSummary.mockResolvedValue({
        invoiceId: "inv-1",
        invoiceTotalCents: 3000,
        amountPaidCents: 500,
        balanceDueCents,
        paymentStatus: "partial",
      });
    },
  };
}

describe("tenant saved-method payment attempts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks when invoice is not issued", async () => {
    const ctx = makeAdmin({ invoiceStatus: "draft" });
    ctx.setupMocks();

    const stripe = {
      paymentIntents: {
        create: vi.fn(),
      },
    };

    const { startManualSavedMethodPaymentAttempt } = await import(
      "@/lib/business/tenant-saved-method-payment-attempts"
    );

    const result = await startManualSavedMethodPaymentAttempt({
      admin: ctx.admin,
      stripe: stripe as any,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
      invoiceId: "inv-1",
      triggeredByUserId: "user-1",
    });

    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe("invoice_not_issued");
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("blocks when setup-flow authorization cannot be proven", async () => {
    const ctx = makeAdmin({ setupAuthorized: false });
    ctx.setupMocks();

    const stripe = {
      paymentIntents: {
        create: vi.fn(),
      },
    };

    const { startManualSavedMethodPaymentAttempt } = await import(
      "@/lib/business/tenant-saved-method-payment-attempts"
    );

    const result = await startManualSavedMethodPaymentAttempt({
      admin: ctx.admin,
      stripe: stripe as any,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
      invoiceId: "inv-1",
      triggeredByUserId: "user-1",
    });

    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe("missing_saved_method_reuse_authorization");
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("blocks duplicate in-flight manual attempts", async () => {
    const ctx = makeAdmin({ inflightAttempt: true });
    ctx.setupMocks();

    const stripe = {
      paymentIntents: {
        create: vi.fn(),
      },
    };

    const { startManualSavedMethodPaymentAttempt } = await import(
      "@/lib/business/tenant-saved-method-payment-attempts"
    );

    const result = await startManualSavedMethodPaymentAttempt({
      admin: ctx.admin,
      stripe: stripe as any,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
      invoiceId: "inv-1",
      triggeredByUserId: "user-1",
    });

    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe("duplicate_inflight_attempt");
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("creates attempt row and submits PaymentIntent without direct payment-row writes", async () => {
    const ctx = makeAdmin();
    ctx.setupMocks();

    const stripe = {
      paymentIntents: {
        create: vi.fn(async () => ({
          id: "pi_123",
          status: "processing",
          last_payment_error: null,
        })),
      },
    };

    const { startManualSavedMethodPaymentAttempt } = await import(
      "@/lib/business/tenant-saved-method-payment-attempts"
    );

    const result = await startManualSavedMethodPaymentAttempt({
      admin: ctx.admin,
      stripe: stripe as any,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
      invoiceId: "inv-1",
      triggeredByUserId: "user-1",
    });

    expect(result.ok).toBe(true);
    expect(result.attemptStatus).toBe("submitted");
    expect(result.stripePaymentIntentId).toBe("pi_123");
    expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
    const firstCall = stripe.paymentIntents.create.mock.calls[0] as unknown as Array<Record<string, unknown>>;
    const payload = firstCall[0];
    const requestOptions = firstCall[1];
    expect(payload.amount).toBe(2500);
    expect(payload.application_fee_amount).toBe(13);
    expect(Number(payload.application_fee_amount)).toBeLessThan(Number(payload.amount));
    expect(payload.metadata).toEqual(
      expect.objectContaining({
        account_owner_user_id: "owner-1",
        customer_id: "cust-1",
        invoice_id: "inv-1",
        attempt_kind: "manual_saved_method",
      }),
    );
    expect(requestOptions).toEqual(
      expect.objectContaining({
        stripeAccount: "acct_test_123",
      }),
    );
    expect(String(requestOptions.idempotencyKey ?? "")).toContain("manual_saved_method:owner-1:inv-1:");
    expect(ctx.writes.some((w) => w.table === "tenant_saved_method_payment_attempts" && w.op === "insert")).toBe(true);
    expect(ctx.writes.some((w) => w.table === "internal_invoice_payments")).toBe(false);
    expect(ctx.writes.some((w) => w.table === "internal_invoice_payment_allocations")).toBe(false);
  });

  it("calculates 9-cent application fee for 17.50 manual saved-card charge", async () => {
    const ctx = makeAdmin({ balanceDueCents: 1750 });
    ctx.setupMocks();

    const stripe = {
      paymentIntents: {
        create: vi.fn(async () => ({
          id: "pi_1750",
          status: "processing",
          last_payment_error: null,
        })),
      },
    };

    const { startManualSavedMethodPaymentAttempt } = await import(
      "@/lib/business/tenant-saved-method-payment-attempts"
    );

    const result = await startManualSavedMethodPaymentAttempt({
      admin: ctx.admin,
      stripe: stripe as any,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
      invoiceId: "inv-1",
      triggeredByUserId: "user-1",
    });

    expect(result.ok).toBe(true);
    const firstCall = stripe.paymentIntents.create.mock.calls[0] as unknown as Array<Record<string, unknown>>;
    const payload = firstCall[0];
    expect(payload.amount).toBe(1750);
    expect(payload.application_fee_amount).toBe(9);
    expect(Number(payload.application_fee_amount)).toBeLessThan(Number(payload.amount));
  });

  it("omits application_fee_amount when saved-card charge rounds to zero fee", async () => {
    const ctx = makeAdmin({ balanceDueCents: 1 });
    ctx.setupMocks();

    const stripe = {
      paymentIntents: {
        create: vi.fn(async () => ({
          id: "pi_1cent",
          status: "processing",
          last_payment_error: null,
        })),
      },
    };

    const { startManualSavedMethodPaymentAttempt } = await import(
      "@/lib/business/tenant-saved-method-payment-attempts"
    );

    const result = await startManualSavedMethodPaymentAttempt({
      admin: ctx.admin,
      stripe: stripe as any,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
      invoiceId: "inv-1",
      triggeredByUserId: "user-1",
    });

    expect(result.ok).toBe(true);
    const firstCall = stripe.paymentIntents.create.mock.calls[0] as unknown as Array<Record<string, unknown>>;
    const payload = firstCall[0];
    expect(payload.amount).toBe(1);
    expect(payload.application_fee_amount).toBeUndefined();
  });

  it("marks immediate requires_action outcome as failed_requires_action", async () => {
    const ctx = makeAdmin();
    ctx.setupMocks();

    const stripe = {
      paymentIntents: {
        create: vi.fn(async () => ({
          id: "pi_124",
          status: "requires_action",
          last_payment_error: {
            code: "authentication_required",
            message: "Authentication required",
          },
        })),
      },
    };

    const { startManualSavedMethodPaymentAttempt } = await import(
      "@/lib/business/tenant-saved-method-payment-attempts"
    );

    const result = await startManualSavedMethodPaymentAttempt({
      admin: ctx.admin,
      stripe: stripe as any,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
      invoiceId: "inv-1",
      triggeredByUserId: "user-1",
    });

    expect(result.ok).toBe(true);
    expect(result.attemptStatus).toBe("failed_requires_action");
    expect(result.failureCode).toContain("authentication");
  });

  it("resolves webhook outcome to attempt row", async () => {
    const ctx = makeAdmin();
    ctx.setupMocks();

    const { resolveManualSavedMethodAttemptFromWebhook } = await import(
      "@/lib/business/tenant-saved-method-payment-attempts"
    );

    const result = await resolveManualSavedMethodAttemptFromWebhook({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
      invoiceId: "inv-1",
      attemptIdFromMetadata: "attempt-webhook",
      stripePaymentIntentId: "pi_test_1",
      stripeChargeId: "ch_test_1",
      stripeEventId: "evt_test_1",
      outcome: "succeeded",
      resolvedInternalInvoicePaymentId: "payment-1",
    });

    expect(result.matched).toBe(true);
    expect(result.attemptId).toBe("attempt-webhook");
    expect(
      ctx.writes.some(
        (w) => w.table === "tenant_saved_method_payment_attempts" && w.op === "update",
      ),
    ).toBe(true);
  });

  it("does not mark succeeded webhook outcome without resolved payment row id", async () => {
    const ctx = makeAdmin();
    ctx.setupMocks();

    const { resolveManualSavedMethodAttemptFromWebhook } = await import(
      "@/lib/business/tenant-saved-method-payment-attempts"
    );

    const result = await resolveManualSavedMethodAttemptFromWebhook({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
      invoiceId: "inv-1",
      attemptIdFromMetadata: "attempt-webhook",
      stripePaymentIntentId: "pi_test_1",
      stripeChargeId: "ch_test_1",
      stripeEventId: "evt_test_2",
      outcome: "succeeded",
      resolvedInternalInvoicePaymentId: null,
    });

    expect(result.matched).toBe(false);
    expect(
      ctx.writes.some(
        (w) => w.table === "tenant_saved_method_payment_attempts" && w.op === "update",
      ),
    ).toBe(false);
  });
});
