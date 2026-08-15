import { readFileSync } from "fs";
import { resolve } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const migration = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/20260716090000_internal_payment_email_deliveries.sql"),
  "utf8",
);

// Structural DDL invariants for the delivery ledger. There is no runtime to
// exercise a migration file, so these stay as source assertions on purpose:
// the once-per-(payment,recipient) unique claim, RLS enablement, and the FK
// back to payment truth are the durable contract behind the delivery function.
describe("payment received email delivery ledger schema", () => {
  it("claims each payment and recipient only once behind RLS", () => {
    expect(migration).toContain("UNIQUE (internal_invoice_payment_id, recipient_email)");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("internal_invoice_payments(id)");
    expect(migration).not.toMatch(/CREATE POLICY/i);
  });
});

// The webhook wiring (`notifyNewRecordedPayment` only firing when
// `result.recorded && result.paymentId`) is proven behaviorally in
// app/api/stripe/webhook/__tests__/route.test.ts — those tests assert
// deliverInternalPaymentReceivedEmail is called with the recorded paymentId on
// success and is NOT called when recorded is false. We rely on that coverage
// rather than re-grep the webhook source here.

// Behavioral proof of the manual payment path wiring: recording a manual
// invoice payment delivers the payment-received email keyed on the newly
// recorded payment-truth id (replaces grepping manual source for
// `deliverInternalPaymentReceivedEmail` and `paymentTruth.paymentId`).
const deliverInternalPaymentReceivedEmailMock = vi.fn(async (_args: unknown) => ({ sent: true }));
const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveBillingModeByAccountOwnerIdMock = vi.fn();
const resolveInternalInvoiceByIdMock = vi.fn();
const resolveInternalInvoiceByJobIdMock = vi.fn();
const resolveInvoiceCollectedPaymentSummaryMock = vi.fn();
const createTenantInvoiceCheckoutSessionMock = vi.fn();
const createTenantInvoicePaymentLinkMock = vi.fn();
const expireStoredOpenTenantInvoiceCheckoutSessionsForInvoiceMock = vi.fn();
const upsertInvoicePaymentAllocationForPaymentRowMock = vi.fn();
const insertJobEventMock = vi.fn();
const revalidatePathMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const resolveFieldBillingCapabilitiesMock = vi.fn();
const loadFieldBillingExplicitCapabilitiesForUserMock = vi.fn();
const autoSyncRecordedPaymentToQboMock = vi.fn(async (_args?: unknown) => undefined);

vi.mock("@/lib/payments/payment-received-email", () => ({
  deliverInternalPaymentReceivedEmail: (args: unknown) => deliverInternalPaymentReceivedEmailMock(args),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

vi.mock("@/lib/auth/internal-job-scope", () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) => loadScopedInternalJobForMutationMock(...args),
}));

vi.mock("@/lib/auth/field-billing-access", () => ({
  resolveFieldBillingCapabilities: (...args: unknown[]) => resolveFieldBillingCapabilitiesMock(...args),
}));

vi.mock("@/lib/auth/internal-user-access-capabilities", () => ({
  loadFieldBillingExplicitCapabilitiesForUser: (...args: unknown[]) =>
    loadFieldBillingExplicitCapabilitiesForUserMock(...args),
}));

vi.mock("@/lib/business/internal-business-profile", () => ({
  resolveBillingModeByAccountOwnerId: (...args: unknown[]) => resolveBillingModeByAccountOwnerIdMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("@/lib/business/internal-invoice", () => ({
  resolveInternalInvoiceById: (...args: unknown[]) => resolveInternalInvoiceByIdMock(...args),
  resolveInternalInvoiceByJobId: (...args: unknown[]) => resolveInternalInvoiceByJobIdMock(...args),
}));

vi.mock("@/lib/business/internal-invoice-payments", () => ({
  INTERNAL_INVOICE_PAYMENT_METHODS: [
    "cash",
    "check",
    "ach_off_platform",
    "card_off_platform",
    "bank_transfer",
    "other",
  ],
  resolveInvoiceCollectedPaymentSummary: (...args: unknown[]) => resolveInvoiceCollectedPaymentSummaryMock(...args),
  createTenantInvoiceCheckoutSession: (...args: unknown[]) => createTenantInvoiceCheckoutSessionMock(...args),
  createTenantInvoicePaymentLink: (...args: unknown[]) => createTenantInvoicePaymentLinkMock(...args),
  expireStoredOpenTenantInvoiceCheckoutSessionsForInvoice: (...args: unknown[]) =>
    expireStoredOpenTenantInvoiceCheckoutSessionsForInvoiceMock(...args),
}));

vi.mock("@/lib/qbo/qbo-payment-auto-sync", () => ({
  autoSyncRecordedPaymentToQbo: (...args: unknown[]) => autoSyncRecordedPaymentToQboMock(...args),
}));

vi.mock("@/lib/actions/job-actions-shared", () => ({
  insertJobEvent: (...args: unknown[]) => insertJobEventMock(...args),
}));

vi.mock("@/lib/business/payment-allocations", () => ({
  upsertInvoicePaymentAllocationForPaymentRow: (...args: unknown[]) =>
    upsertInvoicePaymentAllocationForPaymentRowMock(...args),
}));

function makeSupabaseFixture() {
  const writes: Array<{ table: string; op: string; payload?: unknown }> = [];

  const supabase = {
    rpc: vi.fn(async (functionName: string) => {
      if (functionName === "claim_internal_invoice_collection_reservation") {
        return { data: true, error: null };
      }
      if (functionName === "release_internal_invoice_collection_reservation") {
        return { data: true, error: null };
      }
      throw new Error(`Unexpected RPC ${functionName}`);
    }),
    from: vi.fn((table: string) => {
      if (table === "internal_invoice_payments") {
        return {
          insert: vi.fn((payload: unknown) => {
            writes.push({ table, op: "insert", payload });
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "pay-1" }, error: null })),
              })),
            };
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { supabase, writes };
}

function buildFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("tab", "info");
  formData.set("payment_amount", "25.00");
  formData.set("payment_method", "cash");
  formData.set("received_reference", "CHK-1001");
  formData.set("notes", "Paid at office");
  return formData;
}

describe("manual invoice payment delivers the payment received email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      userId: "user-1",
      internalUser: {
        user_id: "user-1",
        role: "admin",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValue("internal_invoicing");
    loadFieldBillingExplicitCapabilitiesForUserMock.mockResolvedValue({});
    resolveInternalInvoiceByJobIdMock.mockResolvedValue({
      id: "inv-1",
      account_owner_user_id: "owner-1",
      job_id: "job-1",
      invoice_number: "INV-1",
      status: "issued",
      total_cents: 10000,
    });
    resolveInvoiceCollectedPaymentSummaryMock.mockResolvedValue({
      invoiceId: "inv-1",
      invoiceTotalCents: 10000,
      amountPaidCents: 2000,
      balanceDueCents: 8000,
      paymentStatus: "partial",
    });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({ authorized: true, reason: "allowed_active" });
    insertJobEventMock.mockResolvedValue(undefined);
    expireStoredOpenTenantInvoiceCheckoutSessionsForInvoiceMock.mockResolvedValue({ attempted: 0, expired: 0, skipped: 0 });
    upsertInvoicePaymentAllocationForPaymentRowMock.mockResolvedValue({
      ok: true,
      status: "created",
      allocationId: "alloc-1",
      allocationStatus: "active",
      reason: null,
    });
  });

  it("delivers keyed on the newly recorded payment-truth id", async () => {
    const { supabase } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);

    const { recordInternalInvoicePaymentFromForm } = await import(
      "@/lib/actions/internal-invoice-payment-actions"
    );

    await expect(recordInternalInvoicePaymentFromForm(buildFormData())).rejects.toThrow(
      "banner=internal_invoice_payment_recorded",
    );

    // Same id that the payment-truth insert returned ("pay-1"), proving the
    // delivery is keyed on paymentTruth.paymentId rather than a raw form value.
    expect(deliverInternalPaymentReceivedEmailMock).toHaveBeenCalledWith({ paymentId: "pay-1" });
  });

  it("does not abort the recorded payment when email delivery throws", async () => {
    const { supabase } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    deliverInternalPaymentReceivedEmailMock.mockRejectedValueOnce(new Error("smtp down"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { recordInternalInvoicePaymentFromForm } = await import(
      "@/lib/actions/internal-invoice-payment-actions"
    );

    // Delivery failure is swallowed: the caller still lands on the recorded banner.
    await expect(recordInternalInvoicePaymentFromForm(buildFormData())).rejects.toThrow(
      "banner=internal_invoice_payment_recorded",
    );
    expect(deliverInternalPaymentReceivedEmailMock).toHaveBeenCalledWith({ paymentId: "pay-1" });

    warnSpy.mockRestore();
  });
});
