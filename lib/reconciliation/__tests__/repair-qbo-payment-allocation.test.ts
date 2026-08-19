import { beforeEach, describe, expect, it, vi } from "vitest";

const { applyAllocation, findPayment, getInvoiceContext, getToken } = vi.hoisted(() => ({
  applyAllocation: vi.fn(),
  findPayment: vi.fn(),
  getInvoiceContext: vi.fn(),
  getToken: vi.fn(),
}));

vi.mock("@/lib/qbo/qbo-api-client", () => ({
  applyUnappliedQboPaymentToInvoice: applyAllocation,
  findQboPaymentById: findPayment,
  getQboInvoicePaymentContext: getInvoiceContext,
}));
vi.mock("@/lib/qbo/qbo-connection", () => ({ getValidQboAccessToken: getToken }));
vi.mock("@/lib/qbo/qbo-env", () => ({ getQboBaseUrl: () => "https://qbo.example.com" }));

import { repairUnappliedQboPaymentAllocation } from "@/lib/reconciliation/repair-qbo-payment-allocation";

const FINDING = {
  id: "finding-1",
  finding_type: "payment_allocation_mismatch",
  subject_kind: "payment",
  subject_id: "payment-1",
  external_system: "quickbooks",
  external_id: "4533",
  resolved_at: null,
};
const PAYMENT = {
  id: "payment-1",
  invoice_id: "invoice-1",
  job_id: "job-1",
  amount_cents: 41000,
  payment_status: "recorded",
  qbo_payment_id: "4533",
};
const INVOICE = {
  id: "invoice-1",
  job_id: "job-1",
  status: "issued",
  qbo_invoice_id: "4520",
};

function qboPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "4533",
    syncToken: "3",
    customerRef: "325",
    totalAmount: 410,
    unappliedAmount: 410,
    txnDate: "2026-07-16",
    linkedInvoiceIds: [],
    appliedAmountByInvoiceId: {},
    ...overrides,
  };
}

function makeAdmin(overrides: { finding?: any; payment?: any; invoice?: any } = {}) {
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const rows: Record<string, any> = {
    reconciliation_findings: overrides.finding === undefined ? FINDING : overrides.finding,
    internal_invoice_payments: overrides.payment === undefined ? PAYMENT : overrides.payment,
    internal_invoices: overrides.invoice === undefined ? INVOICE : overrides.invoice,
  };
  const admin = {
    from: vi.fn((table: string) => {
      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        is: vi.fn(() => query),
        update: vi.fn((patch: Record<string, unknown>) => {
          updates.push({ table, patch });
          return query;
        }),
        maybeSingle: vi.fn(async () => ({ data: rows[table] ?? null, error: null })),
        then: (resolve: (value: unknown) => void) => resolve({ data: null, error: null }),
      };
      return query;
    }),
  };
  return { admin, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  getToken.mockResolvedValue({ accessToken: "AT", realmId: "R" });
  getInvoiceContext.mockResolvedValue({ id: "4520", customerRef: "325", balance: 410, totalAmount: 410 });
  applyAllocation.mockResolvedValue({ id: "4533", syncToken: "4" });
});

describe("repairUnappliedQboPaymentAllocation", () => {
  it("applies only a fully-unapplied matching payment and verifies the write before resolving", async () => {
    findPayment
      .mockResolvedValueOnce(qboPayment())
      .mockResolvedValueOnce(qboPayment({
        syncToken: "4",
        unappliedAmount: 0,
        linkedInvoiceIds: ["4520"],
        appliedAmountByInvoiceId: { "4520": 410 },
      }));
    const { admin, updates } = makeAdmin();

    await expect(repairUnappliedQboPaymentAllocation({
      admin,
      accountOwnerUserId: "owner-1",
      findingId: "finding-1",
    })).resolves.toEqual({
      status: "repaired",
      paymentId: "payment-1",
      invoiceId: "invoice-1",
      jobId: "job-1",
    });

    expect(applyAllocation).toHaveBeenCalledWith(expect.objectContaining({
      qboPaymentId: "4533",
      syncToken: "3",
      customerRef: "325",
      invoiceRef: "4520",
      amount: 410,
      requestId: "esrepair-finding-1",
    }));
    expect(findPayment).toHaveBeenCalledTimes(2);
    expect(updates).toContainEqual(expect.objectContaining({
      table: "internal_invoice_payments",
      patch: expect.objectContaining({ qbo_sync_status: "synced", qbo_sync_error: null }),
    }));
    expect(updates).toContainEqual(expect.objectContaining({
      table: "reconciliation_findings",
      patch: expect.objectContaining({ resolved_reason: expect.stringContaining("Verified unapplied") }),
    }));
  });

  it("never moves a payment already linked to another transaction", async () => {
    findPayment.mockResolvedValueOnce(qboPayment({
      unappliedAmount: 0,
      linkedInvoiceIds: ["other-invoice"],
      appliedAmountByInvoiceId: { "other-invoice": 410 },
    }));
    const { admin, updates } = makeAdmin();

    const result = await repairUnappliedQboPaymentAllocation({
      admin,
      accountOwnerUserId: "owner-1",
      findingId: "finding-1",
    });

    expect(result).toMatchObject({ status: "blocked", error: expect.stringContaining("accounting review") });
    expect(applyAllocation).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("blocks when QuickBooks customer identity does not match", async () => {
    findPayment.mockResolvedValueOnce(qboPayment({ customerRef: "different-customer" }));
    const { admin, updates } = makeAdmin();

    const result = await repairUnappliedQboPaymentAllocation({
      admin,
      accountOwnerUserId: "owner-1",
      findingId: "finding-1",
    });

    expect(result).toMatchObject({ status: "blocked", error: expect.stringContaining("customers differ") });
    expect(applyAllocation).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("does not claim success when the confirming read-back still disagrees", async () => {
    findPayment.mockResolvedValue(qboPayment());
    const { admin, updates } = makeAdmin();

    await expect(repairUnappliedQboPaymentAllocation({
      admin,
      accountOwnerUserId: "owner-1",
      findingId: "finding-1",
    })).rejects.toThrow("confirming read-back still disagrees");

    expect(applyAllocation).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(0);
  });
});
