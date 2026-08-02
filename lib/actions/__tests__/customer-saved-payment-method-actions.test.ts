import { beforeEach, describe, expect, it, vi } from "vitest";

// Behavioral tests for the customer saved-payment-method server actions.
// These replace source-grep wiring assertions: every intent (auth gating,
// customer/agreement scope reads, connect readiness, redirect-outside-try/catch,
// delegation to the attempt service, and the payment-truth table boundary) is
// proven by importing the real actions and observing redirects / delegate calls.

const requireInternalUserMock = vi.fn();
const isInternalAccessErrorMock = vi.fn();
const canManageInvoiceLifecycleMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveBillingModeByAccountOwnerIdMock = vi.fn();
const resolveTenantStripeConnectReadinessMock = vi.fn();
const startTenantSavedCardSetupCheckoutSessionMock = vi.fn();
const startManualSavedMethodPaymentAttemptMock = vi.fn();
const retryFailedScheduledAutopayAttemptManuallyMock = vi.fn();
const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/auth/financial-access", () => ({
  canManageInvoiceLifecycle: (...args: unknown[]) => canManageInvoiceLifecycleMock(...args),
}));

vi.mock("@/lib/auth/internal-job-scope", () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) => loadScopedInternalJobForMutationMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  isInternalAccessError: (...args: unknown[]) => isInternalAccessErrorMock(...args),
}));

vi.mock("@/lib/business/internal-business-profile", () => ({
  resolveBillingModeByAccountOwnerId: (...args: unknown[]) => resolveBillingModeByAccountOwnerIdMock(...args),
}));

vi.mock("@/lib/business/failed-autopay-manual-retry", () => ({
  retryFailedScheduledAutopayAttemptManually: (...args: unknown[]) =>
    retryFailedScheduledAutopayAttemptManuallyMock(...args),
}));

vi.mock("@/lib/business/tenant-saved-method-payment-attempts", () => ({
  startManualSavedMethodPaymentAttempt: (...args: unknown[]) => startManualSavedMethodPaymentAttemptMock(...args),
}));

vi.mock("@/lib/business/tenant-stripe-connect-readiness", () => ({
  resolveTenantStripeConnectReadiness: (...args: unknown[]) => resolveTenantStripeConnectReadinessMock(...args),
}));

vi.mock("@/lib/business/tenant-saved-payment-method-setups", () => ({
  startTenantSavedCardSetupCheckoutSession: (...args: unknown[]) =>
    startTenantSavedCardSetupCheckoutSessionMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";
const AGREEMENT_ID = "22222222-2222-4222-9222-222222222222";
const JOB_ID = "33333333-3333-4333-a333-333333333333";
const INVOICE_ID = "44444444-4444-4444-b444-444444444444";
const PM_ID = "55555555-5555-4555-8555-555555555555";

const internalUser = {
  user_id: "user-1",
  role: "admin" as const,
  is_active: true,
  account_owner_user_id: "owner-1",
};

/**
 * Admin client stub that records every `.from(table)` access and returns the
 * configured row for customers / maintenance_agreements reads.
 */
function makeAdminStub(rows: { customer?: unknown; agreement?: unknown } = {}) {
  const tables: string[] = [];
  const admin = {
    from(table: string) {
      tables.push(table);
      const data =
        table === "customers"
          ? rows.customer ?? null
          : table === "maintenance_agreements"
            ? rows.agreement ?? null
            : null;
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data, error: null }),
      };
      return q;
    },
  };
  return { admin, tables };
}

function setupForm(overrides: Record<string, string | null> = {}) {
  const form = new FormData();
  form.set("customer_id", CUSTOMER_ID);
  form.set("return_path", "/customers/abc");
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) form.delete(key);
    else form.set(key, value);
  }
  return form;
}

function chargeForm(overrides: Record<string, string | null> = {}) {
  const form = new FormData();
  form.set("job_id", JOB_ID);
  form.set("invoice_id", INVOICE_ID);
  form.set("customer_id", CUSTOMER_ID);
  form.set("tenant_customer_payment_method_id", PM_ID);
  form.set("return_to", "/jobs/x/invoice");
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) form.delete(key);
    else form.set(key, value);
  }
  return form;
}

async function importActions() {
  return import("@/lib/actions/customer-saved-payment-method-actions");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  requireInternalUserMock.mockResolvedValue({ internalUser, userId: "user-1" });
  isInternalAccessErrorMock.mockReturnValue(true);
  canManageInvoiceLifecycleMock.mockReturnValue(true);
  loadScopedInternalJobForMutationMock.mockResolvedValue({ id: JOB_ID });
  resolveBillingModeByAccountOwnerIdMock.mockResolvedValue("internal_invoicing");
  createClientMock.mockResolvedValue({});
  createAdminClientMock.mockReturnValue(makeAdminStub().admin);
});

describe("startCustomerSavedPaymentMethodSetupFromForm", () => {
  it("denies when internal auth is rejected", async () => {
    const accessError = new Error("not internal");
    requireInternalUserMock.mockRejectedValueOnce(accessError);
    isInternalAccessErrorMock.mockReturnValueOnce(true);

    const { startCustomerSavedPaymentMethodSetupFromForm } = await importActions();

    await expect(
      startCustomerSavedPaymentMethodSetupFromForm("/customers/abc", setupForm()),
    ).rejects.toThrow("banner=saved_payment_method_setup_denied");
    expect(startTenantSavedCardSetupCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("denies when the actor lacks financial authority", async () => {
    canManageInvoiceLifecycleMock.mockReturnValueOnce(false);

    const { startCustomerSavedPaymentMethodSetupFromForm } = await importActions();

    await expect(
      startCustomerSavedPaymentMethodSetupFromForm("/customers/abc", setupForm()),
    ).rejects.toThrow("banner=saved_payment_method_setup_denied");
    expect(canManageInvoiceLifecycleMock).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: "user-1", resourceAccountOwnerUserId: "owner-1" }),
    );
    expect(startTenantSavedCardSetupCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("marks the setup invalid when a submitted customer id is not a uuid", async () => {
    const { startCustomerSavedPaymentMethodSetupFromForm } = await importActions();

    await expect(
      startCustomerSavedPaymentMethodSetupFromForm("/customers/abc", setupForm({ customer_id: "not-a-uuid" })),
    ).rejects.toThrow("banner=saved_payment_method_setup_invalid");
  });

  it("verifies customer account scope and rejects a cross-account customer", async () => {
    const { admin, tables } = makeAdminStub({
      customer: { id: CUSTOMER_ID, owner_user_id: "other-owner", first_name: "A", last_name: "B" },
    });
    createAdminClientMock.mockReturnValue(admin);

    const { startCustomerSavedPaymentMethodSetupFromForm } = await importActions();

    await expect(
      startCustomerSavedPaymentMethodSetupFromForm("/customers/abc", setupForm()),
    ).rejects.toThrow("banner=saved_payment_method_setup_denied");
    expect(tables).toContain("customers");
    expect(startTenantSavedCardSetupCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("verifies optional agreement scope and marks a cross-account agreement invalid", async () => {
    const { admin, tables } = makeAdminStub({
      customer: { id: CUSTOMER_ID, owner_user_id: "owner-1", first_name: "A", last_name: "B" },
      agreement: { id: AGREEMENT_ID, account_owner_user_id: "other-owner", customer_id: CUSTOMER_ID },
    });
    createAdminClientMock.mockReturnValue(admin);

    const { startCustomerSavedPaymentMethodSetupFromForm } = await importActions();

    await expect(
      startCustomerSavedPaymentMethodSetupFromForm(
        "/customers/abc",
        setupForm({ maintenance_agreement_id: AGREEMENT_ID }),
      ),
    ).rejects.toThrow("banner=saved_payment_method_setup_invalid");
    expect(tables).toContain("customers");
    expect(tables).toContain("maintenance_agreements");
    expect(startTenantSavedCardSetupCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("requires connect readiness before opening a setup checkout session", async () => {
    createAdminClientMock.mockReturnValue(
      makeAdminStub({ customer: { id: CUSTOMER_ID, owner_user_id: "owner-1", first_name: "A", last_name: "B" } }).admin,
    );
    resolveTenantStripeConnectReadinessMock.mockResolvedValue({ isReady: false, connectedAccountId: null });

    const { startCustomerSavedPaymentMethodSetupFromForm } = await importActions();

    await expect(
      startCustomerSavedPaymentMethodSetupFromForm("/customers/abc", setupForm()),
    ).rejects.toThrow("banner=saved_payment_method_setup_connect_not_ready");
    expect(resolveTenantStripeConnectReadinessMock).toHaveBeenCalledWith("owner-1", expect.anything());
    expect(startTenantSavedCardSetupCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("redirects to the raw Stripe checkout url on success (redirect stays outside try/catch)", async () => {
    createAdminClientMock.mockReturnValue(
      makeAdminStub({ customer: { id: CUSTOMER_ID, owner_user_id: "owner-1", first_name: "A", last_name: "B" } }).admin,
    );
    resolveTenantStripeConnectReadinessMock.mockResolvedValue({ isReady: true, connectedAccountId: "acct_123" });
    startTenantSavedCardSetupCheckoutSessionMock.mockResolvedValue({
      checkoutSessionUrl: "https://checkout.stripe.com/c/pay/cs_setup_1",
    });

    const { startCustomerSavedPaymentMethodSetupFromForm } = await importActions();

    // A success redirect to the checkout url (not the failure banner) proves the
    // final redirect() runs OUTSIDE the try/catch — otherwise NEXT_REDIRECT would
    // be swallowed and mapped to saved_payment_method_setup_failed.
    await expect(
      startCustomerSavedPaymentMethodSetupFromForm("/customers/abc", setupForm()),
    ).rejects.toThrow("REDIRECT:https://checkout.stripe.com/c/pay/cs_setup_1");
    expect(startTenantSavedCardSetupCheckoutSessionMock).toHaveBeenCalledTimes(1);
  });

  it("shows the failure banner when checkout session creation throws", async () => {
    createAdminClientMock.mockReturnValue(
      makeAdminStub({ customer: { id: CUSTOMER_ID, owner_user_id: "owner-1", first_name: "A", last_name: "B" } }).admin,
    );
    resolveTenantStripeConnectReadinessMock.mockResolvedValue({ isReady: true, connectedAccountId: "acct_123" });
    startTenantSavedCardSetupCheckoutSessionMock.mockRejectedValue(new Error("stripe boom"));

    const { startCustomerSavedPaymentMethodSetupFromForm } = await importActions();

    await expect(
      startCustomerSavedPaymentMethodSetupFromForm("/customers/abc", setupForm()),
    ).rejects.toThrow("banner=saved_payment_method_setup_failed");
  });
});

describe("chargeSavedCardForIssuedInvoiceFromForm", () => {
  beforeEach(() => {
    resolveTenantStripeConnectReadinessMock.mockResolvedValue({ isReady: true, connectedAccountId: "acct_123" });
  });

  it("delegates to the manual saved-method attempt service and reports a submitted charge", async () => {
    startManualSavedMethodPaymentAttemptMock.mockResolvedValue({ ok: true, attemptStatus: "submitted" });

    const { chargeSavedCardForIssuedInvoiceFromForm } = await importActions();

    await expect(chargeSavedCardForIssuedInvoiceFromForm(chargeForm())).rejects.toThrow(
      "banner=internal_invoice_saved_card_charge_submitted",
    );
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: JOB_ID }),
    );
    expect(resolveBillingModeByAccountOwnerIdMock).toHaveBeenCalled();
    expect(startManualSavedMethodPaymentAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountOwnerUserId: "owner-1",
        customerId: CUSTOMER_ID,
        invoiceId: INVOICE_ID,
        triggeredByUserId: "user-1",
        selectedTenantCustomerPaymentMethodId: PM_ID,
      }),
    );
  });

  it("maps a missing reuse authorization block to the authorization banner", async () => {
    startManualSavedMethodPaymentAttemptMock.mockResolvedValue({
      ok: false,
      blockedReason: "missing_saved_method_reuse_authorization",
    });

    const { chargeSavedCardForIssuedInvoiceFromForm } = await importActions();

    await expect(chargeSavedCardForIssuedInvoiceFromForm(chargeForm())).rejects.toThrow(
      "banner=internal_invoice_saved_card_charge_missing_authorization",
    );
  });

  it("maps a duplicate in-flight attempt to the in-flight banner", async () => {
    startManualSavedMethodPaymentAttemptMock.mockResolvedValue({
      ok: false,
      blockedReason: "duplicate_inflight_attempt",
    });

    const { chargeSavedCardForIssuedInvoiceFromForm } = await importActions();

    await expect(chargeSavedCardForIssuedInvoiceFromForm(chargeForm())).rejects.toThrow(
      "banner=internal_invoice_saved_card_charge_inflight",
    );
  });

  it("maps a requires-action attempt status to the requires-action banner", async () => {
    startManualSavedMethodPaymentAttemptMock.mockResolvedValue({
      ok: true,
      attemptStatus: "failed_requires_action",
    });

    const { chargeSavedCardForIssuedInvoiceFromForm } = await importActions();

    await expect(chargeSavedCardForIssuedInvoiceFromForm(chargeForm())).rejects.toThrow(
      "banner=internal_invoice_saved_card_charge_failed_requires_action",
    );
  });

  it("preserves payment-truth boundaries: never writes payments/allocations/autopay-consent tables directly", async () => {
    // Route both the auth and admin clients through a from()-recording stub so
    // any inline write to a forbidden table would be observed.
    const authStub = makeAdminStub();
    const adminStub = makeAdminStub();
    createClientMock.mockResolvedValue(authStub.admin);
    createAdminClientMock.mockReturnValue(adminStub.admin);
    startManualSavedMethodPaymentAttemptMock.mockResolvedValue({ ok: true, attemptStatus: "submitted" });

    const { chargeSavedCardForIssuedInvoiceFromForm } = await importActions();

    await expect(chargeSavedCardForIssuedInvoiceFromForm(chargeForm())).rejects.toThrow(
      "banner=internal_invoice_saved_card_charge_submitted",
    );

    // Payment truth is delegated to the attempt service, not inlined here.
    expect(startManualSavedMethodPaymentAttemptMock).toHaveBeenCalledTimes(1);
    const touched = [...authStub.tables, ...adminStub.tables];
    expect(touched).not.toContain("internal_invoice_payments");
    expect(touched).not.toContain("internal_invoice_payment_allocations");
    expect(touched).not.toContain("tenant_customer_autopay_consents");
  });
});
