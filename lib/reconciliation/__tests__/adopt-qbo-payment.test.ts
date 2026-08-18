import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetToken, mockFindQboPaymentById, mockClaim, mockRelease, mockAllocation } = vi.hoisted(() => ({
  mockGetToken: vi.fn(),
  mockFindQboPaymentById: vi.fn(),
  mockClaim: vi.fn(),
  mockRelease: vi.fn(),
  mockAllocation: vi.fn(),
}));

vi.mock("@/lib/qbo/qbo-connection", () => ({ getValidQboAccessToken: mockGetToken }));
vi.mock("@/lib/qbo/qbo-api-client", () => ({ findQboPaymentById: mockFindQboPaymentById }));
vi.mock("@/lib/qbo/qbo-env", () => ({
  getQboAvailability: () => ({ available: true, missingKeys: [] }),
  getQboBaseUrl: () => "https://qbo.example.com",
}));
vi.mock("@/lib/business/invoice-collection-reservations", () => ({
  claimInvoiceCollectionReservation: mockClaim,
  releaseInvoiceCollectionReservation: mockRelease,
}));
vi.mock("@/lib/business/payment-allocations", () => ({
  upsertInvoicePaymentAllocationForPaymentRow: mockAllocation,
}));

import { adoptUnrecordedQboPayment } from "@/lib/reconciliation/adopt-qbo-payment";

const FINDING = {
  id: "finding-1",
  finding_type: "qbo_payment_unrecorded",
  subject_id: "inv-1",
  external_id: "4730",
  external_system: "quickbooks",
  amount_cents: 40000,
  job_id: "job-1",
  resolved_at: null,
};

const INVOICE = {
  id: "inv-1",
  job_id: "job-1",
  status: "issued",
  total_cents: 40000,
  qbo_invoice_id: "4503",
  invoice_display_number: "2099",
  invoice_number: "INV-2099",
};

function makeAdmin(overrides: {
  finding?: any;
  invoice?: any;
  existingAdoptionRows?: any[];
  recordedRows?: any[];
  insertError?: { message: string } | null;
} = {}) {
  const inserted: any[] = [];
  const findingUpdates: any[] = [];

  const admin = {
    from: vi.fn((table: string) => {
      if (table === "reconciliation_findings") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          is: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({ data: overrides.finding === undefined ? FINDING : overrides.finding, error: null })),
          update: vi.fn((payload: any) => {
            findingUpdates.push(payload);
            return query;
          }),
          then: (resolve: (v: any) => void) => resolve({ data: null, error: null }),
        };
        return query;
      }
      if (table === "internal_invoices") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({ data: overrides.invoice === undefined ? INVOICE : overrides.invoice, error: null })),
        };
        return query;
      }
      if (table === "internal_invoice_payments") {
        let isInsert = false;
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          limit: vi.fn(async () => ({ data: overrides.existingAdoptionRows ?? [], error: null })),
          insert: vi.fn((payload: any) => {
            isInsert = true;
            inserted.push(payload);
            return query;
          }),
          single: vi.fn(async () =>
            overrides.insertError
              ? { data: null, error: overrides.insertError }
              : { data: { id: "pay-new" }, error: null },
          ),
          then: (resolve: (v: any) => void) => {
            if (isInsert) return resolve({ data: { id: "pay-new" }, error: null });
            return resolve({ data: overrides.recordedRows ?? [], error: null });
          },
        };
        return query;
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { admin, inserted, findingUpdates };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetToken.mockResolvedValue({ accessToken: "AT", realmId: "R" });
  mockFindQboPaymentById.mockResolvedValue({
    id: "4730",
    totalAmount: 400,
    txnDate: "2026-07-28",
    linkedInvoiceIds: ["4503"],
    appliedAmountByInvoiceId: { "4503": 400 },
  });
  mockClaim.mockResolvedValue(true);
  mockRelease.mockResolvedValue(undefined);
  mockAllocation.mockResolvedValue({ ok: true, status: "upserted", allocationId: "alloc-1", allocationStatus: "recorded" });
});

describe("adoptUnrecordedQboPayment", () => {
  it("adopts a live-verified QBO payment, stamps the QBO link, and resolves the finding", async () => {
    const { admin, inserted, findingUpdates } = makeAdmin();

    const result = await adoptUnrecordedQboPayment({
      admin,
      accountOwnerUserId: "owner-1",
      findingId: "finding-1",
      recordedByUserId: "user-1",
    });

    expect(result).toMatchObject({ status: "adopted", paymentId: "pay-new", invoiceId: "inv-1", jobId: "job-1", amountCents: 40000 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      invoice_id: "inv-1",
      payment_status: "recorded",
      amount_cents: 40000,
      // The push sweep must never re-send this to QuickBooks.
      qbo_payment_id: "4730",
      qbo_sync_status: "synced",
    });
    expect(findingUpdates).toContainEqual(
      expect.objectContaining({ resolved_reason: "QuickBooks payment adopted into EveryStep" }),
    );
  });

  it("blocks when QuickBooks no longer applies the payment to this invoice", async () => {
    mockFindQboPaymentById.mockResolvedValue({
      id: "4730", totalAmount: 400, txnDate: "2026-07-28",
      linkedInvoiceIds: ["other-doc"], appliedAmountByInvoiceId: { "other-doc": 400 },
    });
    const { admin, inserted } = makeAdmin();

    const result = await adoptUnrecordedQboPayment({
      admin, accountOwnerUserId: "owner-1", findingId: "finding-1", recordedByUserId: "user-1",
    });

    expect(result.status).toBe("blocked");
    expect(inserted).toHaveLength(0);
  });

  it("blocks when the applied amount changed since detection", async () => {
    mockFindQboPaymentById.mockResolvedValue({
      id: "4730", totalAmount: 300, txnDate: "2026-07-28",
      linkedInvoiceIds: ["4503"], appliedAmountByInvoiceId: { "4503": 300 },
    });
    const { admin, inserted } = makeAdmin();

    const result = await adoptUnrecordedQboPayment({
      admin, accountOwnerUserId: "owner-1", findingId: "finding-1", recordedByUserId: "user-1",
    });

    expect(result.status).toBe("blocked");
    expect(inserted).toHaveLength(0);
  });

  it("blocks when the QBO payment was already adopted onto this invoice", async () => {
    const { admin, inserted } = makeAdmin({ existingAdoptionRows: [{ id: "pay-existing" }] });

    const result = await adoptUnrecordedQboPayment({
      admin, accountOwnerUserId: "owner-1", findingId: "finding-1", recordedByUserId: "user-1",
    });

    expect(result.status).toBe("blocked");
    expect(inserted).toHaveLength(0);
  });

  it("blocks when adopting would exceed the invoice total", async () => {
    const { admin, inserted } = makeAdmin({ recordedRows: [{ amount_cents: 20000 }] });

    const result = await adoptUnrecordedQboPayment({
      admin, accountOwnerUserId: "owner-1", findingId: "finding-1", recordedByUserId: "user-1",
    });

    expect(result.status).toBe("blocked");
    expect(inserted).toHaveLength(0);
  });

  it("blocks a resolved or foreign finding without touching QuickBooks", async () => {
    const { admin } = makeAdmin({ finding: { ...FINDING, resolved_at: "2026-08-18T00:00:00Z" } });

    const result = await adoptUnrecordedQboPayment({
      admin, accountOwnerUserId: "owner-1", findingId: "finding-1", recordedByUserId: "user-1",
    });

    expect(result.status).toBe("blocked");
    expect(mockFindQboPaymentById).not.toHaveBeenCalled();
  });
});
