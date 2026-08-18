import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetToken, mockListInvoices, mockListPayments, mockStripeReadiness } = vi.hoisted(() => ({
  mockGetToken: vi.fn(),
  mockListInvoices: vi.fn(),
  mockListPayments: vi.fn(),
  mockStripeReadiness: vi.fn(),
}));

vi.mock("@/lib/qbo/qbo-connection", () => ({ getValidQboAccessToken: mockGetToken }));
vi.mock("@/lib/qbo/qbo-api-client", () => ({
  listQboInvoicesSince: mockListInvoices,
  listQboPaymentsSince: mockListPayments,
}));
vi.mock("@/lib/qbo/qbo-env", () => ({
  getQboAvailability: () => ({ available: true, missingKeys: [] }),
  getQboBaseUrl: () => "https://qbo.example.com",
}));
vi.mock("@/lib/business/platform-billing-stripe", () => ({ getStripeServerClient: vi.fn() }));
vi.mock("@/lib/business/tenant-stripe-connect-readiness", () => ({
  resolveTenantStripeConnectReadiness: mockStripeReadiness,
}));

import { runThreeWayReconciliation } from "@/lib/reconciliation/three-way-reconciliation";

function makeAdmin(invoices: any[], payments: any[]) {
  return {
    from: vi.fn((table: string) => {
      const rows = table === "internal_invoices" ? invoices : payments;
      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        gte: vi.fn(() => query),
        is: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(async () => ({ data: rows, error: null })),
      };
      return query;
    }),
  };
}

/** Stripe charges as an async-iterable, matching stripe.charges.list auto-pagination. */
function stripeWithCharges(charges: any[]) {
  return { charges: { list: () => ({ async *[Symbol.asyncIterator]() { for (const c of charges) yield c; } }) } } as any;
}

const INVOICE = {
  id: "inv-1", job_id: "job-1", invoice_number: "2109", invoice_display_number: "2109",
  status: "issued", total_cents: 84000, qbo_invoice_id: "4534", invoice_date: "2026-08-01",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetToken.mockResolvedValue({ accessToken: "AT", realmId: "R" });
  mockListInvoices.mockResolvedValue([]);
  mockListPayments.mockResolvedValue([]);
  mockStripeReadiness.mockResolvedValue({ isReady: false, connectedAccountId: null });
});

describe("invoice reconciliation against QuickBooks", () => {
  it("flags an invoice EveryStep thinks is synced but QuickBooks does not have", async () => {
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([INVOICE], []), accountOwnerUserId: "owner-1",
    });
    expect(result.findings.map((f) => f.findingType)).toContain("invoice_missing_in_qbo");
  });

  it("flags a voided invoice QuickBooks still shows open", async () => {
    mockListInvoices.mockResolvedValue([
      { id: "4534", syncToken: "1", docNumber: "2109", balance: 840, totalAmount: 840, looksVoided: false },
    ]);
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([{ ...INVOICE, status: "void" }], []), accountOwnerUserId: "owner-1",
    });
    const finding = result.findings.find((f) => f.findingType === "voided_invoice_open_in_qbo");
    expect(finding).toBeDefined();
    expect(finding?.externalValue).toContain("840.00");
  });

  it("flags totals that disagree", async () => {
    mockListInvoices.mockResolvedValue([
      { id: "4534", syncToken: "1", docNumber: "2109", balance: 900, totalAmount: 900, looksVoided: false },
    ]);
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([INVOICE], []), accountOwnerUserId: "owner-1",
    });
    const finding = result.findings.find((f) => f.findingType === "invoice_total_mismatch");
    expect(finding).toMatchObject({ everystepValue: "$840.00", externalValue: "$900.00" });
  });

  it("flags a linked invoice whose visible number differs in QuickBooks", async () => {
    mockListInvoices.mockResolvedValue([
      { id: "4534", syncToken: "1", docNumber: "1708", balance: 840, totalAmount: 840, looksVoided: false },
    ]);
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([INVOICE], []), accountOwnerUserId: "owner-1",
    });
    expect(result.findings).toContainEqual(expect.objectContaining({
      findingType: "invoice_number_mismatch",
      everystepValue: "2109",
      externalValue: "1708",
    }));
  });

  it("flags an invoice voided in QuickBooks only", async () => {
    mockListInvoices.mockResolvedValue([
      { id: "4534", syncToken: "1", docNumber: "2109", balance: 0, totalAmount: 0, looksVoided: true },
    ]);
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([INVOICE], []), accountOwnerUserId: "owner-1",
    });
    expect(result.findings.map((f) => f.findingType)).toContain("invoice_voided_only_in_qbo");
  });

  it("reports nothing when both sides agree", async () => {
    mockListInvoices.mockResolvedValue([
      { id: "4534", syncToken: "1", docNumber: "2109", balance: 840, totalAmount: 840, looksVoided: false },
    ]);
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([INVOICE], []), accountOwnerUserId: "owner-1",
    });
    expect(result.findings).toHaveLength(0);
  });

  it("ignores invoices that were never pushed, rather than second-guessing sync eligibility", async () => {
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([{ ...INVOICE, qbo_invoice_id: null }], []), accountOwnerUserId: "owner-1",
    });
    expect(result.findings).toHaveLength(0);
  });
});

describe("payment reconciliation", () => {
  it("flags a reversed payment QuickBooks still holds", async () => {
    mockListPayments.mockResolvedValue([{ id: "qp-1", totalAmount: 840, txnDate: "2026-08-01", linkedInvoiceIds: ["4534"] }]);
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([INVOICE], [
        { id: "pay-1", invoice_id: "inv-1", job_id: "job-1", amount_cents: 84000, payment_status: "reversed", qbo_payment_id: "qp-1" },
      ]),
      accountOwnerUserId: "owner-1",
    });
    expect(result.findings.map((f) => f.findingType)).toContain("reversed_payment_present_in_qbo");
  });

  it("flags a recorded payment missing from QuickBooks", async () => {
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([INVOICE], [
        { id: "pay-1", invoice_id: "inv-1", job_id: "job-1", amount_cents: 84000, payment_status: "recorded", qbo_payment_id: "qp-gone" },
      ]),
      accountOwnerUserId: "owner-1",
    });
    expect(result.findings.map((f) => f.findingType)).toContain("payment_missing_in_qbo");
  });

  it("flags a QuickBooks payment with the wrong amount or invoice allocation", async () => {
    mockListPayments.mockResolvedValue([{ id: "qp-1", totalAmount: 700, txnDate: "2026-08-01", linkedInvoiceIds: ["different-invoice"] }]);
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([INVOICE], [
        { id: "pay-1", invoice_id: "inv-1", job_id: "job-1", amount_cents: 84000, payment_status: "recorded", qbo_payment_id: "qp-1" },
      ]),
      accountOwnerUserId: "owner-1",
    });
    expect(result.findings.map((f) => f.findingType)).toContain("payment_allocation_mismatch");
  });

  it("compares the invoice allocation instead of a multi-invoice payment total", async () => {
    mockListPayments.mockResolvedValue([{
      id: "qp-1",
      totalAmount: 1000,
      txnDate: "2026-08-01",
      linkedInvoiceIds: ["4534", "other-invoice"],
      appliedAmountByInvoiceId: { "4534": 840, "other-invoice": 160 },
    }]);
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([INVOICE], [
        { id: "pay-1", invoice_id: "inv-1", job_id: "job-1", amount_cents: 84000, payment_status: "recorded", qbo_payment_id: "qp-1" },
      ]),
      accountOwnerUserId: "owner-1",
    });
    expect(result.findings.map((f) => f.findingType)).not.toContain("payment_allocation_mismatch");
  });
});

describe("foreign QuickBooks payments (collected through QBO)", () => {
  const AGREEING_QBO_INVOICE = { id: "4534", syncToken: "1", docNumber: "2109", balance: 0, totalAmount: 840, looksVoided: false };

  it("flags a QBO payment applied to our invoice that EveryStep never recorded", async () => {
    mockListInvoices.mockResolvedValue([AGREEING_QBO_INVOICE]);
    mockListPayments.mockResolvedValue([{
      id: "P77", totalAmount: 840, txnDate: "2026-08-10",
      linkedInvoiceIds: ["4534"], appliedAmountByInvoiceId: { "4534": 840 },
    }]);
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([INVOICE], []), accountOwnerUserId: "owner-1",
    });
    const finding = result.findings.find((f) => f.findingType === "qbo_payment_unrecorded");
    expect(finding).toMatchObject({
      subjectId: "inv-1",
      externalId: "P77",
      amountCents: 84000,
      severity: "critical",
      jobId: "job-1",
    });
  });

  it("does not flag a QBO payment EveryStep already carries by id", async () => {
    mockListInvoices.mockResolvedValue([AGREEING_QBO_INVOICE]);
    mockListPayments.mockResolvedValue([{
      id: "P77", totalAmount: 840, txnDate: "2026-08-10",
      linkedInvoiceIds: ["4534"], appliedAmountByInvoiceId: { "4534": 840 },
    }]);
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([INVOICE], [
        { id: "pay-1", invoice_id: "inv-1", job_id: "job-1", amount_cents: 84000, payment_status: "recorded", qbo_payment_id: "P77" },
      ]),
      accountOwnerUserId: "owner-1",
    });
    expect(result.findings.map((f) => f.findingType)).not.toContain("qbo_payment_unrecorded");
  });

  it("suppresses the finding when a matching recorded payment has simply not pushed to QBO yet", async () => {
    mockListInvoices.mockResolvedValue([AGREEING_QBO_INVOICE]);
    mockListPayments.mockResolvedValue([{
      id: "P88", totalAmount: 840, txnDate: "2026-08-10",
      linkedInvoiceIds: ["4534"], appliedAmountByInvoiceId: { "4534": 840 },
    }]);
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([INVOICE], [
        { id: "pay-1", invoice_id: "inv-1", job_id: "job-1", amount_cents: 84000, payment_status: "recorded", qbo_payment_id: null },
      ]),
      accountOwnerUserId: "owner-1",
    });
    expect(result.findings.map((f) => f.findingType)).not.toContain("qbo_payment_unrecorded");
  });

  it("ignores QBO payments applied to invoices that are not issued in EveryStep", async () => {
    mockListInvoices.mockResolvedValue([AGREEING_QBO_INVOICE]);
    mockListPayments.mockResolvedValue([{
      id: "P99", totalAmount: 840, txnDate: "2026-08-10",
      linkedInvoiceIds: ["4534"], appliedAmountByInvoiceId: { "4534": 840 },
    }]);
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([{ ...INVOICE, status: "void" }], []), accountOwnerUserId: "owner-1",
    });
    expect(result.findings.map((f) => f.findingType)).not.toContain("qbo_payment_unrecorded");
  });
});

describe("Stripe reconciliation", () => {
  beforeEach(() => {
    mockStripeReadiness.mockResolvedValue({ isReady: true, connectedAccountId: "acct_1" });
    mockListInvoices.mockResolvedValue([
      { id: "4534", syncToken: "1", docNumber: "2109", balance: 840, totalAmount: 840, looksVoided: false },
    ]);
  });

  it("finds money Stripe collected that EveryStep never recorded", async () => {
    const stripe = stripeWithCharges([
      { id: "ch_orphan", status: "succeeded", refunded: false, amount: 48500, amount_refunded: 0, metadata: { invoice_id: "inv-1", job_id: "job-1" } },
    ]);
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([INVOICE], []), accountOwnerUserId: "owner-1", stripe,
    });
    const finding = result.findings.find((f) => f.findingType === "stripe_charge_unrecorded");
    expect(finding).toBeDefined();
    expect(finding?.amountCents).toBe(48500);
    expect(finding?.subjectId).toBe("inv-1");
  });

  it("shows both invoice numbers on an orphan charge when QuickBooks was renumbered", async () => {
    mockListInvoices.mockResolvedValue([
      { id: "4534", syncToken: "1", docNumber: "1708", balance: 840, totalAmount: 840, looksVoided: false },
    ]);
    const stripe = stripeWithCharges([
      { id: "ch_orphan", status: "succeeded", refunded: false, amount: 48500, amount_refunded: 0, metadata: { invoice_id: "inv-1", job_id: "job-1" } },
    ]);
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([INVOICE], []), accountOwnerUserId: "owner-1", stripe,
    });
    expect(result.findings.find((finding) => finding.findingType === "stripe_charge_unrecorded")?.title)
      .toContain("invoice 2109 (QuickBooks 1708)");
  });

  it("flags a Stripe refund EveryStep still counts as collected", async () => {
    const stripe = stripeWithCharges([
      { id: "ch_1", status: "succeeded", refunded: true, amount: 48500, amount_refunded: 48500, metadata: { invoice_id: "inv-1" } },
    ]);
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([INVOICE], [
        { id: "pay-1", invoice_id: "inv-1", job_id: "job-1", amount_cents: 48500, payment_status: "recorded", processor_charge_id: "ch_1" },
      ]),
      accountOwnerUserId: "owner-1", stripe,
    });
    expect(result.findings.map((f) => f.findingType)).toContain("stripe_refund_not_reflected");
  });

  it("does not report a matching partial refund as missing from EveryStep", async () => {
    const stripe = stripeWithCharges([
      { id: "ch_1", status: "succeeded", refunded: false, amount: 48500, amount_refunded: 10000, metadata: { invoice_id: "inv-1" } },
    ]);
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([INVOICE], [
        { id: "pay-1", invoice_id: "inv-1", job_id: "job-1", amount_cents: 48500, payment_status: "recorded", processor_charge_id: "ch_1", stripe_refunded_amount_cents: 10000 },
      ]),
      accountOwnerUserId: "owner-1", stripe,
    });
    expect(result.findings.map((f) => f.findingType)).not.toContain("stripe_refund_not_reflected");
  });

  it("does not call a charge missing when its PaymentIntent is already recorded", async () => {
    const stripe = stripeWithCharges([
      { id: "ch_1", payment_intent: "pi_1", status: "succeeded", refunded: false, amount: 48500, amount_refunded: 0, metadata: { invoice_id: "inv-1" } },
    ]);
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([INVOICE], [
        { id: "pay-1", invoice_id: "inv-1", job_id: "job-1", amount_cents: 48500, payment_status: "recorded", stripe_payment_intent_id: "pi_1" },
      ]),
      accountOwnerUserId: "owner-1", stripe,
    });
    expect(result.findings.map((f) => f.findingType)).not.toContain("stripe_charge_unrecorded");
  });

  it("reports a missing Stripe identity instead of a missing payment when an exact payment exists", async () => {
    const stripe = stripeWithCharges([
      { id: "py_legacy", status: "succeeded", refunded: false, amount: 85000, amount_refunded: 0, metadata: { invoice_id: "inv-1", job_id: "job-1" } },
    ]);
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([INVOICE], [
        { id: "pay-existing", invoice_id: "inv-1", job_id: "job-1", amount_cents: 85000, payment_status: "recorded" },
      ]),
      accountOwnerUserId: "owner-1", stripe,
    });
    expect(result.findings).toContainEqual(expect.objectContaining({
      findingType: "stripe_payment_identity_mismatch",
      subjectId: "pay-existing",
      externalId: "py_legacy",
    }));
    expect(result.findings.map((finding) => finding.findingType)).not.toContain("stripe_charge_unrecorded");
  });

  it("ignores platform charges that carry no invoice id", async () => {
    const stripe = stripeWithCharges([
      { id: "ch_sub", status: "succeeded", refunded: false, amount: 9900, amount_refunded: 0, metadata: {} },
    ]);
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([INVOICE], []), accountOwnerUserId: "owner-1", stripe,
    });
    expect(result.findings).toHaveLength(0);
  });
});

describe("degradation", () => {
  it("still returns the Stripe half when QuickBooks is unreachable", async () => {
    mockListInvoices.mockRejectedValue(new Error("QBO 503"));
    mockStripeReadiness.mockResolvedValue({ isReady: true, connectedAccountId: "acct_1" });
    const stripe = stripeWithCharges([
      { id: "ch_orphan", status: "succeeded", refunded: false, amount: 1000, amount_refunded: 0, metadata: { invoice_id: "inv-1" } },
    ]);

    const result = await runThreeWayReconciliation({
      admin: makeAdmin([INVOICE], []), accountOwnerUserId: "owner-1", stripe,
    });

    expect(result.skipped.join(" ")).toContain("QuickBooks comparison failed");
    expect(result.findings.map((f) => f.findingType)).toContain("stripe_charge_unrecorded");
  });

  it("records a skip rather than findings when QBO is not connected", async () => {
    mockGetToken.mockResolvedValue(null);
    const result = await runThreeWayReconciliation({
      admin: makeAdmin([INVOICE], []), accountOwnerUserId: "owner-1",
    });
    expect(result.skipped.join(" ")).toContain("QuickBooks is not connected");
    expect(result.findings).toHaveLength(0);
  });
});
