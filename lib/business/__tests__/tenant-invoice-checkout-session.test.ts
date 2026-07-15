import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTenantInvoiceCheckoutSession,
  createTenantInvoicePaymentLink,
  expireStoredOpenTenantInvoiceCheckoutSessionsForInvoice,
  verifyTenantInvoicePaymentLinkToken,
} from "@/lib/business/internal-invoice-payments";

const resolveTenantStripeConnectReadinessMock = vi.fn();

vi.mock("@/lib/business/tenant-stripe-connect-readiness", () => ({
  resolveTenantStripeConnectReadiness: (...args: unknown[]) =>
    resolveTenantStripeConnectReadinessMock(...args),
}));

type SupabaseFixtureOptions = {
  invoiceStatus?: string;
  invoiceTotalCents?: number;
  invoiceNumber?: string;
  billingEmail?: string | null;
  paymentRows?: Array<Record<string, unknown>>;
  jobInvoiceComplete?: boolean;
  jobBillingDisposition?: string | null;
};

function buildSupabaseFixture(options: SupabaseFixtureOptions = {}) {
  const invoiceStatus = options.invoiceStatus ?? "issued";
  const invoiceTotalCents = options.invoiceTotalCents ?? 10000;
  const invoiceNumber = options.invoiceNumber ?? "INV-1001";
  const billingEmail = options.billingEmail ?? "billing@example.com";
  const paymentRows = options.paymentRows ?? [];
  const jobInvoiceComplete = options.jobInvoiceComplete ?? false;
  const jobBillingDisposition = options.jobBillingDisposition ?? null;

  const writes: Array<{ table: string; op: string; payload?: unknown }> = [];

  const invoiceRow = {
    id: "inv-1",
    account_owner_user_id: "owner-1",
    job_id: "job-1",
    invoice_number: invoiceNumber,
    status: invoiceStatus,
    total_cents: invoiceTotalCents,
    billing_email: billingEmail,
  };

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "internal_invoices") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({ data: invoiceRow, error: null })),
        };
        return query;
      }

      if (table === "internal_invoice_payments") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          order: vi.fn(() => query),
          insert: vi.fn((payload: unknown) => {
            writes.push({ table, op: "insert", payload });
            return query;
          }),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          then: undefined,
        };

        query.order = vi
          .fn()
          .mockReturnValueOnce(query)
          .mockImplementationOnce(async () => ({ data: paymentRows, error: null }));

        return query;
      }

      if (table === "jobs") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({
            data: {
              id: "job-1",
              invoice_complete: jobInvoiceComplete,
              billing_disposition: jobBillingDisposition,
            },
            error: null,
          })),
        };
        return query;
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { supabase, writes };
}

describe("createTenantInvoiceCheckoutSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    resolveTenantStripeConnectReadinessMock.mockResolvedValue({
      connectedAccountId: "acct_connected_1",
      onboardingStatus: "complete",
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      disabledReason: null,
      lastSyncedAt: "2026-05-19T00:00:00.000Z",
      isReady: true,
    });
  });

  it("ready connected account creates checkout session using stripeAccount", async () => {
    const fixture = buildSupabaseFixture();
    const createMock = vi.fn(async () => ({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }));
    const stripe = {
      checkout: {
        sessions: {
          create: createMock,
        },
      },
    } as any;

    const result = await createTenantInvoiceCheckoutSession({
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      invoiceId: "inv-1",
      supabase: fixture.supabase,
      stripe,
      appUrl: "http://localhost:3000",
    });

    expect(result.checkoutSessionId).toBe("cs_test_1");
    expect(result.checkoutSessionUrl).toContain("checkout.stripe.com");
    expect(result.connectedAccountId).toBe("acct_connected_1");

    expect(createMock).toHaveBeenCalledTimes(1);
    const firstCall = createMock.mock.calls[0] as unknown as Array<Record<string, unknown>>;
    const requestOptions = firstCall[1];
    expect(requestOptions).toEqual(expect.objectContaining({ stripeAccount: "acct_connected_1" }));
    const payload = firstCall[0] as Record<string, any>;
    expect(payload.success_url).toBe(
      "http://localhost:3000/payments/checkout-complete?status=success&job_id=job-1&invoice_id=inv-1",
    );
    expect(payload.cancel_url).toBe(
      "http://localhost:3000/payments/checkout-complete?status=cancelled&job_id=job-1&invoice_id=inv-1",
    );
  });

  it("missing or unready connected account blocks creation", async () => {
    const fixture = buildSupabaseFixture();
    const createMock = vi.fn(async () => ({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }));
    const stripe = {
      checkout: {
        sessions: {
          create: createMock,
        },
      },
    } as any;

    resolveTenantStripeConnectReadinessMock.mockResolvedValueOnce({
      connectedAccountId: null,
      onboardingStatus: "pending",
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      disabledReason: null,
      lastSyncedAt: null,
      isReady: false,
    });

    await expect(
      createTenantInvoiceCheckoutSession({
        accountOwnerUserId: "owner-1",
        jobId: "job-1",
        invoiceId: "inv-1",
        supabase: fixture.supabase,
        stripe,
        appUrl: "http://localhost:3000",
      }),
    ).rejects.toThrow("not ready");

    expect(createMock).not.toHaveBeenCalled();
  });

  it("draft invoice blocks creation", async () => {
    const fixture = buildSupabaseFixture({ invoiceStatus: "draft" });
    const createMock = vi.fn();

    await expect(
      createTenantInvoiceCheckoutSession({
        accountOwnerUserId: "owner-1",
        jobId: "job-1",
        invoiceId: "inv-1",
        supabase: fixture.supabase,
        stripe: { checkout: { sessions: { create: createMock } } } as any,
        appUrl: "http://localhost:3000",
      }),
    ).rejects.toThrow("issued");

    expect(createMock).not.toHaveBeenCalled();
  });

  it("void invoice blocks creation", async () => {
    const fixture = buildSupabaseFixture({ invoiceStatus: "void" });
    const createMock = vi.fn();

    await expect(
      createTenantInvoiceCheckoutSession({
        accountOwnerUserId: "owner-1",
        jobId: "job-1",
        invoiceId: "inv-1",
        supabase: fixture.supabase,
        stripe: { checkout: { sessions: { create: createMock } } } as any,
        appUrl: "http://localhost:3000",
      }),
    ).rejects.toThrow("issued");

    expect(createMock).not.toHaveBeenCalled();
  });

  it("zero or fully paid balance blocks creation", async () => {
    const fixture = buildSupabaseFixture({
      invoiceStatus: "issued",
      invoiceTotalCents: 10000,
      paymentRows: [
        {
          id: "p1",
          account_owner_user_id: "owner-1",
          invoice_id: "inv-1",
          job_id: "job-1",
          payment_status: "recorded",
          payment_method: "cash",
          amount_cents: 10000,
          paid_at: "2026-05-19T00:00:00Z",
          received_reference: null,
          notes: null,
          recorded_by_user_id: "u1",
          created_at: "2026-05-19T00:00:00Z",
          updated_at: "2026-05-19T00:00:00Z",
        },
      ],
    });

    const createMock = vi.fn();

    await expect(
      createTenantInvoiceCheckoutSession({
        accountOwnerUserId: "owner-1",
        jobId: "job-1",
        invoiceId: "inv-1",
        supabase: fixture.supabase,
        stripe: { checkout: { sessions: { create: createMock } } } as any,
        appUrl: "http://localhost:3000",
      }),
    ).rejects.toThrow("greater than zero");

    expect(createMock).not.toHaveBeenCalled();
  });

  it("line item amount equals current balance due and metadata contains owner/invoice/job/invoice number", async () => {
    const fixture = buildSupabaseFixture({
      invoiceTotalCents: 10000,
      paymentRows: [
        {
          id: "p1",
          account_owner_user_id: "owner-1",
          invoice_id: "inv-1",
          job_id: "job-1",
          payment_status: "recorded",
          payment_method: "check",
          amount_cents: 2500,
          paid_at: "2026-05-19T00:00:00Z",
          received_reference: "100",
          notes: null,
          recorded_by_user_id: "u1",
          created_at: "2026-05-19T00:00:00Z",
          updated_at: "2026-05-19T00:00:00Z",
        },
      ],
    });

    const createMock = vi.fn(async () => ({ id: "cs_test_2", url: "https://checkout.stripe.com/c/pay/cs_test_2" }));

    await createTenantInvoiceCheckoutSession({
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      invoiceId: "inv-1",
      supabase: fixture.supabase,
      stripe: { checkout: { sessions: { create: createMock } } } as any,
      appUrl: "http://localhost:3000",
    });

    const firstCall = createMock.mock.calls[0] as unknown as Array<Record<string, any>>;
    const payload = firstCall[0];

    expect(payload.line_items[0].price_data.unit_amount).toBe(7500);
    expect(payload.payment_intent_data?.application_fee_amount).toBe(38);
    expect(payload.payment_intent_data?.application_fee_amount).toBeLessThan(
      payload.line_items[0].price_data.unit_amount,
    );
    expect(payload.metadata).toEqual(
      expect.objectContaining({
        account_owner_user_id: "owner-1",
        invoice_id: "inv-1",
        job_id: "job-1",
        invoice_number: "INV-1001",
      }),
    );
    expect(payload.payment_intent_data?.metadata).toEqual(
      expect.objectContaining({
        account_owner_user_id: "owner-1",
        invoice_id: "inv-1",
        job_id: "job-1",
        invoice_number: "INV-1001",
      }),
    );
  });

  it("calculates 9-cent application fee for 17.50 checkout amount", async () => {
    const fixture = buildSupabaseFixture({
      invoiceTotalCents: 1750,
      paymentRows: [],
    });
    const createMock = vi.fn(async () => ({
      id: "cs_test_1750",
      url: "https://checkout.stripe.com/c/pay/cs_test_1750",
    }));

    await createTenantInvoiceCheckoutSession({
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      invoiceId: "inv-1",
      supabase: fixture.supabase,
      stripe: { checkout: { sessions: { create: createMock } } } as any,
      appUrl: "http://localhost:3000",
    });

    const firstCall = createMock.mock.calls[0] as unknown as Array<Record<string, any>>;
    const payload = firstCall[0];

    expect(payload.line_items[0].price_data.unit_amount).toBe(1750);
    expect(payload.payment_intent_data?.application_fee_amount).toBe(9);
    expect(payload.payment_intent_data?.application_fee_amount).toBeLessThan(1750);
  });

  it("omits application_fee_amount when fee calculation resolves to zero", async () => {
    const fixture = buildSupabaseFixture({
      invoiceTotalCents: 1,
      paymentRows: [],
    });
    const createMock = vi.fn(async () => ({
      id: "cs_test_1cent",
      url: "https://checkout.stripe.com/c/pay/cs_test_1cent",
    }));

    await createTenantInvoiceCheckoutSession({
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      invoiceId: "inv-1",
      supabase: fixture.supabase,
      stripe: { checkout: { sessions: { create: createMock } } } as any,
      appUrl: "http://localhost:3000",
    });

    const firstCall = createMock.mock.calls[0] as unknown as Array<Record<string, any>>;
    const payload = firstCall[0];

    expect(payload.line_items[0].price_data.unit_amount).toBe(1);
    expect(payload.payment_intent_data?.application_fee_amount).toBeUndefined();
  });

  it("stores a pending Stripe payment row during checkout session creation", async () => {
    const fixture = buildSupabaseFixture();
    const createMock = vi.fn(async () => ({ id: "cs_test_3", url: "https://checkout.stripe.com/c/pay/cs_test_3" }));

    await createTenantInvoiceCheckoutSession({
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      invoiceId: "inv-1",
      supabase: fixture.supabase,
      stripe: { checkout: { sessions: { create: createMock } } } as any,
      appUrl: "http://localhost:3000",
    });

    const pendingWrite = fixture.writes.find((write) => write.table === "internal_invoice_payments" && write.op === "insert");
    expect(pendingWrite?.payload).toEqual(
      expect.objectContaining({
        account_owner_user_id: "owner-1",
        invoice_id: "inv-1",
        job_id: "job-1",
        payment_status: "pending",
        payment_method: "card_stripe_online",
        amount_cents: 10000,
        processor_name: "stripe",
        stripe_checkout_session_id: "cs_test_3",
      }),
    );
  });

  it("never creates platform-context checkout session without stripeAccount option", async () => {
    const fixture = buildSupabaseFixture();
    const createMock = vi.fn(async () => ({ id: "cs_test_4", url: "https://checkout.stripe.com/c/pay/cs_test_4" }));

    await createTenantInvoiceCheckoutSession({
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      invoiceId: "inv-1",
      supabase: fixture.supabase,
      stripe: { checkout: { sessions: { create: createMock } } } as any,
      appUrl: "http://localhost:3000",
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    const firstCall = createMock.mock.calls[0] as unknown as Array<Record<string, unknown>>;
    expect(firstCall[1]).toEqual(expect.objectContaining({ stripeAccount: "acct_connected_1" }));
  });

  it("allows checkout after the invoice workflow is marked complete", async () => {
    const fixture = buildSupabaseFixture({
      jobInvoiceComplete: true,
      jobBillingDisposition: null,
    });
    const createMock = vi.fn(async () => ({ id: "cs_test_closed_out", url: "https://checkout.stripe.com/c/pay/cs_test_closed_out" }));

    await expect(
      createTenantInvoiceCheckoutSession({
        accountOwnerUserId: "owner-1",
        jobId: "job-1",
        invoiceId: "inv-1",
        supabase: fixture.supabase,
        stripe: { checkout: { sessions: { create: createMock } } } as any,
        appUrl: "http://localhost:3000",
      }),
    ).resolves.toEqual(expect.objectContaining({ checkoutSessionId: "cs_test_closed_out" }));

    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("externally billed resolved jobs block checkout session creation", async () => {
    const fixture = buildSupabaseFixture({
      jobInvoiceComplete: true,
      jobBillingDisposition: "externally_billed",
    });
    const createMock = vi.fn();

    await expect(
      createTenantInvoiceCheckoutSession({
        accountOwnerUserId: "owner-1",
        jobId: "job-1",
        invoiceId: "inv-1",
        supabase: fixture.supabase,
        stripe: { checkout: { sessions: { create: createMock, expire: vi.fn() } } } as any,
        appUrl: "http://localhost:3000",
      }),
    ).rejects.toThrow("resolved outside online payment");

    expect(createMock).not.toHaveBeenCalled();
  });

  it("legacy externally billed jobs block checkout session creation even when invoice projection is stale", async () => {
    const fixture = buildSupabaseFixture({
      jobInvoiceComplete: false,
      jobBillingDisposition: "externally_billed",
    });
    const createMock = vi.fn();

    await expect(
      createTenantInvoiceCheckoutSession({
        accountOwnerUserId: "owner-1",
        jobId: "job-1",
        invoiceId: "inv-1",
        supabase: fixture.supabase,
        stripe: { checkout: { sessions: { create: createMock, expire: vi.fn() } } } as any,
        appUrl: "http://localhost:3000",
      }),
    ).rejects.toThrow("resolved outside online payment");

    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("createTenantInvoicePaymentLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    resolveTenantStripeConnectReadinessMock.mockResolvedValue({
      connectedAccountId: "acct_connected_1",
      onboardingStatus: "complete",
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      disabledReason: null,
      lastSyncedAt: "2026-05-19T00:00:00.000Z",
      isReady: true,
    });
  });

  it("creates a payment link after the invoice workflow is marked complete", async () => {
    const fixture = buildSupabaseFixture({
      jobInvoiceComplete: true,
      jobBillingDisposition: null,
    });

    await expect(
      createTenantInvoicePaymentLink({
        accountOwnerUserId: "owner-1",
        jobId: "job-1",
        invoiceId: "inv-1",
        supabase: fixture.supabase,
        appUrl: "https://app.example",
        signingSecret: "test-secret",
      }),
    ).resolves.toEqual(expect.objectContaining({
      paymentLinkUrl: expect.stringMatching(/^https:\/\/app\.example\/payments\/invoice\//),
      balanceDueCents: 10000,
    }));
  });

  it("creates an app-controlled signed payment URL without creating a Stripe Checkout Session", async () => {
    const fixture = buildSupabaseFixture();

    const result = await createTenantInvoicePaymentLink({
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      invoiceId: "inv-1",
      supabase: fixture.supabase,
      appUrl: "https://app.example",
      signingSecret: "test-secret",
    });

    expect(result.paymentLinkUrl).toMatch(/^https:\/\/app\.example\/payments\/invoice\//);
    expect(result.balanceDueCents).toBe(10000);
    expect(fixture.writes.some((write) => write.table === "internal_invoice_payments")).toBe(false);

    const payload = verifyTenantInvoicePaymentLinkToken(result.paymentLinkToken, "test-secret");
    expect(payload).toEqual(
      expect.objectContaining({
        v: 1,
        accountOwnerUserId: "owner-1",
        jobId: "job-1",
        invoiceId: "inv-1",
        balanceDueCents: 10000,
      }),
    );
  });

  it("uses the current remaining balance for partial manual payment links", async () => {
    const fixture = buildSupabaseFixture({
      invoiceTotalCents: 10000,
      paymentRows: [
        {
          id: "p1",
          account_owner_user_id: "owner-1",
          invoice_id: "inv-1",
          job_id: "job-1",
          payment_status: "recorded",
          payment_method: "cash",
          amount_cents: 2500,
          paid_at: "2026-05-19T00:00:00Z",
          received_reference: null,
          notes: null,
          recorded_by_user_id: "u1",
          created_at: "2026-05-19T00:00:00Z",
          updated_at: "2026-05-19T00:00:00Z",
        },
      ],
    });

    const result = await createTenantInvoicePaymentLink({
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      invoiceId: "inv-1",
      supabase: fixture.supabase,
      appUrl: "https://app.example",
      signingSecret: "test-secret",
    });

    const payload = verifyTenantInvoicePaymentLinkToken(result.paymentLinkToken, "test-secret");

    expect(result.balanceDueCents).toBe(7500);
    expect(payload?.balanceDueCents).toBe(7500);
  });

  it("blocks paid invoices from creating new app payment links", async () => {
    const fixture = buildSupabaseFixture({
      invoiceTotalCents: 10000,
      paymentRows: [
        {
          id: "p1",
          account_owner_user_id: "owner-1",
          invoice_id: "inv-1",
          job_id: "job-1",
          payment_status: "recorded",
          payment_method: "check",
          amount_cents: 10000,
          paid_at: "2026-05-19T00:00:00Z",
          received_reference: null,
          notes: null,
          recorded_by_user_id: "u1",
          created_at: "2026-05-19T00:00:00Z",
          updated_at: "2026-05-19T00:00:00Z",
        },
      ],
    });

    await expect(
      createTenantInvoicePaymentLink({
        accountOwnerUserId: "owner-1",
        jobId: "job-1",
        invoiceId: "inv-1",
        supabase: fixture.supabase,
        appUrl: "https://app.example",
        signingSecret: "test-secret",
      }),
    ).rejects.toThrow("greater than zero");
  });

  it("externally billed resolved jobs block new app payment links", async () => {
    const fixture = buildSupabaseFixture({
      jobInvoiceComplete: true,
      jobBillingDisposition: "externally_billed",
    });

    await expect(
      createTenantInvoicePaymentLink({
        accountOwnerUserId: "owner-1",
        jobId: "job-1",
        invoiceId: "inv-1",
        supabase: fixture.supabase,
        appUrl: "https://app.example",
        signingSecret: "test-secret",
      }),
    ).rejects.toThrow("resolved outside online payment");
  });

  it("legacy no-charge jobs block new app payment links even when invoice projection is stale", async () => {
    const fixture = buildSupabaseFixture({
      jobInvoiceComplete: false,
      jobBillingDisposition: "no_charge",
    });

    await expect(
      createTenantInvoicePaymentLink({
        accountOwnerUserId: "owner-1",
        jobId: "job-1",
        invoiceId: "inv-1",
        supabase: fixture.supabase,
        appUrl: "https://app.example",
        signingSecret: "test-secret",
      }),
    ).rejects.toThrow("resolved outside online payment");
  });
});

describe("expireStoredOpenTenantInvoiceCheckoutSessionsForInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    resolveTenantStripeConnectReadinessMock.mockResolvedValue({
      connectedAccountId: "acct_connected_1",
      onboardingStatus: "complete",
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      disabledReason: null,
      lastSyncedAt: "2026-05-19T00:00:00.000Z",
      isReady: true,
    });
  });

  it("expires pending stored Stripe checkout sessions with the tenant connected account", async () => {
    const fixture = buildSupabaseFixture({
      paymentRows: [
        {
          id: "pending-1",
          account_owner_user_id: "owner-1",
          invoice_id: "inv-1",
          job_id: "job-1",
          payment_status: "pending",
          payment_method: "card_stripe_online",
          amount_cents: 10000,
          paid_at: "2026-05-19T00:00:00Z",
          received_reference: null,
          notes: null,
          recorded_by_user_id: "owner-1",
          created_at: "2026-05-19T00:00:00Z",
          updated_at: "2026-05-19T00:00:00Z",
          stripe_checkout_session_id: "cs_test_open_1",
        },
        {
          id: "recorded-1",
          account_owner_user_id: "owner-1",
          invoice_id: "inv-1",
          job_id: "job-1",
          payment_status: "recorded",
          payment_method: "card_stripe_online",
          amount_cents: 10000,
          paid_at: "2026-05-19T00:00:00Z",
          received_reference: null,
          notes: null,
          recorded_by_user_id: "owner-1",
          created_at: "2026-05-19T00:00:00Z",
          updated_at: "2026-05-19T00:00:00Z",
          stripe_checkout_session_id: "cs_test_paid_1",
        },
      ],
    });
    const expireMock = vi.fn(async () => ({ id: "cs_test_open_1" }));

    const result = await expireStoredOpenTenantInvoiceCheckoutSessionsForInvoice({
      accountOwnerUserId: "owner-1",
      invoiceId: "inv-1",
      supabase: fixture.supabase,
      stripe: { checkout: { sessions: { expire: expireMock } } } as any,
    });

    expect(result).toEqual({ attempted: 1, expired: 1, skipped: 0 });
    expect(expireMock).toHaveBeenCalledWith(
      "cs_test_open_1",
      {},
      { stripeAccount: "acct_connected_1" },
    );
  });
});
