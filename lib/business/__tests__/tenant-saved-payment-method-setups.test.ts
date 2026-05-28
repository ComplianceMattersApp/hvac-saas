import { beforeEach, describe, expect, it, vi } from "vitest";

const mockResolvePlatformBillingAppUrl = vi.fn(() => "https://app.example.test");

vi.mock("@/lib/business/platform-billing-stripe", () => ({
  getStripeServerClient: vi.fn(() => ({})),
  resolvePlatformBillingAppUrl: () => mockResolvePlatformBillingAppUrl(),
}));

function makeTenantStripeCustomersSelectEmpty() {
  const query: any = {
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => ({ data: [], error: null })),
  };
  return query;
}

function makeAdminForStartFlow() {
  const tenantStripeCustomerSelect = makeTenantStripeCustomersSelectEmpty();

  const tenantStripeCustomerInsertSingle = vi.fn(async () => ({
    data: { id: "tsc_1" },
    error: null,
  }));
  const tenantStripeCustomerInsertSelect = vi.fn(() => ({ single: tenantStripeCustomerInsertSingle }));
  const tenantStripeCustomerInsert = vi.fn(() => ({ select: tenantStripeCustomerInsertSelect }));

  const setupInsertSingle = vi.fn(async () => ({ data: { id: "setup_1" }, error: null }));
  const setupInsertSelect = vi.fn(() => ({ single: setupInsertSingle }));
  const setupInsert = vi.fn(() => ({ select: setupInsertSelect }));
  const setupUpdateEq = vi.fn(async () => ({ error: null }));
  const setupUpdate = vi.fn(() => ({ eq: setupUpdateEq }));

  const from = vi.fn((table: string) => {
    if (table === "tenant_stripe_customers") {
      return {
        select: vi.fn(() => tenantStripeCustomerSelect),
        insert: tenantStripeCustomerInsert,
      };
    }

    if (table === "tenant_saved_payment_method_setups") {
      return {
        insert: setupInsert,
        update: setupUpdate,
      };
    }

    throw new Error(`Unexpected table ${table}`);
  });

  return {
    admin: { from },
    setupUpdate,
    setupUpdateEq,
  };
}

function makeAdminForDuplicateReceipt() {
  const receiptInsertSingle = vi.fn(async () => ({
    data: null,
    error: { code: "23505", message: "duplicate key value violates unique constraint" },
  }));
  const receiptInsertSelect = vi.fn(() => ({ single: receiptInsertSingle }));
  const receiptInsert = vi.fn(() => ({ select: receiptInsertSelect }));

  const from = vi.fn((table: string) => {
    if (table === "tenant_stripe_event_receipts") {
      return {
        insert: receiptInsert,
      };
    }

    throw new Error(`Unexpected table ${table}`);
  });

  return {
    admin: { from },
  };
}

describe("tenant saved payment method setups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts setup-mode checkout and persists setup/session ids", async () => {
    const { startTenantSavedCardSetupCheckoutSession } = await import(
      "@/lib/business/tenant-saved-payment-method-setups"
    );

    const { admin, setupUpdate, setupUpdateEq } = makeAdminForStartFlow();

    const stripe = {
      customers: {
        create: vi.fn(async () => ({ id: "cus_1" })),
      },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({ id: "cs_setup_1", url: "https://checkout.stripe.test/cs_setup_1" })),
        },
      },
    } as any;

    const result = await startTenantSavedCardSetupCheckoutSession({
      admin,
      stripe,
      accountOwnerUserId: "owner-1",
      customerId: "customer-1",
      connectedAccountId: "acct_connected_1",
      customerName: "Ada Customer",
      customerEmail: "ada@example.test",
      returnPath: "/customers/customer-1",
      initiatedByUserId: "user-1",
    });

    expect(result.setupId).toBe("setup_1");
    expect(result.checkoutSessionId).toBe("cs_setup_1");
    expect(result.checkoutSessionUrl).toContain("https://checkout.stripe.test/");
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "setup",
        payment_method_types: ["card"],
      }),
      expect.objectContaining({ stripeAccount: "acct_connected_1" }),
    );
    expect(setupUpdateEq).toHaveBeenCalledTimes(1);
    // stripe_checkout_session_id must be persisted for traceability/idempotency
    expect(setupUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_checkout_session_id: "cs_setup_1",
        setup_status: "pending_customer_action",
      }),
    );
  });

  it("ignores non-setup checkout sessions in webhook recorder", async () => {
    const { recordTenantSavedPaymentMethodSetupFromCheckoutSession } = await import(
      "@/lib/business/tenant-saved-payment-method-setups"
    );

    const result = await recordTenantSavedPaymentMethodSetupFromCheckoutSession({
      admin: { from: vi.fn() },
      session: {
        id: "cs_payment_1",
        mode: "payment",
        metadata: {},
      } as any,
      eventId: "evt_1",
      connectedAccountId: "acct_connected_1",
    });

    expect(result.recorded).toBe(false);
    expect(result.reason).toContain("not setup mode");
  });

  it("treats duplicate event receipt as idempotent no-op", async () => {
    const { recordTenantSavedPaymentMethodSetupFromCheckoutSession } = await import(
      "@/lib/business/tenant-saved-payment-method-setups"
    );

    const { admin } = makeAdminForDuplicateReceipt();

    const result = await recordTenantSavedPaymentMethodSetupFromCheckoutSession({
      admin,
      session: {
        id: "cs_setup_2",
        mode: "setup",
        metadata: {
          setup_id: "setup-1",
          account_owner_user_id: "owner-1",
          customer_id: "customer-1",
        },
      } as any,
      eventId: "evt_dupe_1",
      connectedAccountId: "acct_connected_1",
    });

    expect(result.recorded).toBe(false);
    expect(result.reason).toContain("idempotency");
  });
});
