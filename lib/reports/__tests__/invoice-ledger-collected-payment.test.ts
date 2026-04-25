import { describe, it, expect, beforeEach, vi } from "vitest";
import { formatTimestampDisplay } from "../invoice-ledger";

type InvoicePaymentSummary = {
  amountPaidCents: number;
  balanceDueCents: number;
  paymentStatus: "unpaid" | "partial" | "paid";
  lastPaymentDate: string | null;
  paymentCount: number;
};

type PaymentRow = {
  invoice_id: string;
  amount_cents: number;
  payment_status: string;
  paid_at: string;
};

async function buildInvoicePaymentSummaryMap(params: {
  supabase: any;
  accountOwnerUserId: string;
  invoiceIds: string[];
  invoiceTotalsByCents: Map<string, number>;
}): Promise<Map<string, InvoicePaymentSummary>> {
  const summaryMap = new Map<string, InvoicePaymentSummary>();

  if (params.invoiceIds.length === 0) {
    return summaryMap;
  }

  const { data, error } = await params.supabase
    .from("internal_invoice_payments")
    .select("invoice_id, amount_cents, payment_status, paid_at")
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .in("invoice_id", params.invoiceIds);

  if (error) {
    throw new Error(
      `Failed to fetch invoice payment summaries: ${error.message ?? "unknown error"}`
    );
  }

  const paymentsByInvoiceId = new Map<string, PaymentRow[]>();
  for (const row of data ?? []) {
    const invoiceId = String(row?.invoice_id ?? "").trim();
    if (!invoiceId) continue;
    if (!paymentsByInvoiceId.has(invoiceId)) {
      paymentsByInvoiceId.set(invoiceId, []);
    }
    paymentsByInvoiceId.get(invoiceId)!.push(row as PaymentRow);
  }

  for (const invoiceId of params.invoiceIds) {
    const invoiceTotalCents = params.invoiceTotalsByCents.get(invoiceId) ?? 0;
    const payments = paymentsByInvoiceId.get(invoiceId) ?? [];

    let amountPaidCents = 0;
    let lastPaymentDate: string | null = null;
    let recordedPaymentCount = 0;

    for (const payment of payments) {
      const status = String(payment.payment_status ?? "").trim().toLowerCase();
      if (status === "recorded") {
        const amountCents = Number(payment.amount_cents ?? 0) || 0;
        amountPaidCents += amountCents;
        recordedPaymentCount += 1;

        const paidAt = String(payment.paid_at ?? "").trim();
        if (paidAt && (!lastPaymentDate || paidAt > lastPaymentDate)) {
          lastPaymentDate = paidAt;
        }
      }
    }

    const balanceDueCents = Math.max(0, invoiceTotalCents - amountPaidCents);
    const paymentStatus =
      amountPaidCents <= 0
        ? "unpaid"
        : amountPaidCents >= invoiceTotalCents
          ? "paid"
          : "partial";

    summaryMap.set(invoiceId, {
      amountPaidCents,
      balanceDueCents,
      paymentStatus,
      lastPaymentDate,
      paymentCount: recordedPaymentCount,
    });
  }

  return summaryMap;
}

describe("Invoice Ledger Collected Payment Summary", () => {
  let mockSupabase: any;
  const accountOwnerUserId = "test-owner";

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn(),
    };
  });

  it("returns empty map for empty invoice IDs", async () => {
    const result = await buildInvoicePaymentSummaryMap({
      supabase: mockSupabase,
      accountOwnerUserId,
      invoiceIds: [],
      invoiceTotalsByCents: new Map(),
    });

    expect(result.size).toBe(0);
  });

  it("sums only recorded payment status rows", async () => {
    const invoiceId = "inv-1";
    const invoiceTotalsByCents = new Map([[invoiceId, 10000]]);

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [
              {
                invoice_id: invoiceId,
                amount_cents: 5000,
                payment_status: "recorded",
                paid_at: "2026-04-25T10:00:00Z",
              },
              {
                invoice_id: invoiceId,
                amount_cents: 3000,
                payment_status: "pending",
                paid_at: "2026-04-25T11:00:00Z",
              },
              {
                invoice_id: invoiceId,
                amount_cents: 2000,
                payment_status: "failed",
                paid_at: "2026-04-25T12:00:00Z",
              },
            ],
            error: null,
          }),
        }),
      }),
    });

    const result = await buildInvoicePaymentSummaryMap({
      supabase: mockSupabase,
      accountOwnerUserId,
      invoiceIds: [invoiceId],
      invoiceTotalsByCents,
    });

    const summary = result.get(invoiceId);
    expect(summary?.amountPaidCents).toBe(5000);
    expect(summary?.paymentCount).toBe(1);
  });

  it("calculates unpaid status when no recorded payments", async () => {
    const invoiceId = "inv-1";
    const invoiceTotalsByCents = new Map([[invoiceId, 10000]]);

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
    });

    const result = await buildInvoicePaymentSummaryMap({
      supabase: mockSupabase,
      accountOwnerUserId,
      invoiceIds: [invoiceId],
      invoiceTotalsByCents,
    });

    const summary = result.get(invoiceId);
    expect(summary?.paymentStatus).toBe("unpaid");
    expect(summary?.amountPaidCents).toBe(0);
    expect(summary?.balanceDueCents).toBe(10000);
  });

  it("calculates partial status when recorded payment < total", async () => {
    const invoiceId = "inv-1";
    const invoiceTotalsByCents = new Map([[invoiceId, 10000]]);

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [
              {
                invoice_id: invoiceId,
                amount_cents: 3000,
                payment_status: "recorded",
                paid_at: "2026-04-25T10:00:00Z",
              },
            ],
            error: null,
          }),
        }),
      }),
    });

    const result = await buildInvoicePaymentSummaryMap({
      supabase: mockSupabase,
      accountOwnerUserId,
      invoiceIds: [invoiceId],
      invoiceTotalsByCents,
    });

    const summary = result.get(invoiceId);
    expect(summary?.paymentStatus).toBe("partial");
    expect(summary?.amountPaidCents).toBe(3000);
    expect(summary?.balanceDueCents).toBe(7000);
  });

  it("calculates paid status when recorded payment >= total", async () => {
    const invoiceId = "inv-1";
    const invoiceTotalsByCents = new Map([[invoiceId, 10000]]);

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [
              {
                invoice_id: invoiceId,
                amount_cents: 12000,
                payment_status: "recorded",
                paid_at: "2026-04-25T10:00:00Z",
              },
            ],
            error: null,
          }),
        }),
      }),
    });

    const result = await buildInvoicePaymentSummaryMap({
      supabase: mockSupabase,
      accountOwnerUserId,
      invoiceIds: [invoiceId],
      invoiceTotalsByCents,
    });

    const summary = result.get(invoiceId);
    expect(summary?.paymentStatus).toBe("paid");
    expect(summary?.amountPaidCents).toBe(12000);
    expect(summary?.balanceDueCents).toBe(0);
  });

  it("clamps balance due to 0 when overpaid", async () => {
    const invoiceId = "inv-1";
    const invoiceTotalsByCents = new Map([[invoiceId, 5000]]);

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [
              {
                invoice_id: invoiceId,
                amount_cents: 8000,
                payment_status: "recorded",
                paid_at: "2026-04-25T10:00:00Z",
              },
            ],
            error: null,
          }),
        }),
      }),
    });

    const result = await buildInvoicePaymentSummaryMap({
      supabase: mockSupabase,
      accountOwnerUserId,
      invoiceIds: [invoiceId],
      invoiceTotalsByCents,
    });

    const summary = result.get(invoiceId);
    expect(summary?.balanceDueCents).toBe(0);
  });

  it("uses latest payment date as last payment", async () => {
    const invoiceId = "inv-1";
    const invoiceTotalsByCents = new Map([[invoiceId, 10000]]);

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [
              {
                invoice_id: invoiceId,
                amount_cents: 2000,
                payment_status: "recorded",
                paid_at: "2026-04-23T10:00:00Z",
              },
              {
                invoice_id: invoiceId,
                amount_cents: 3000,
                payment_status: "recorded",
                paid_at: "2026-04-25T15:00:00Z",
              },
              {
                invoice_id: invoiceId,
                amount_cents: 1000,
                payment_status: "recorded",
                paid_at: "2026-04-24T10:00:00Z",
              },
            ],
            error: null,
          }),
        }),
      }),
    });

    const result = await buildInvoicePaymentSummaryMap({
      supabase: mockSupabase,
      accountOwnerUserId,
      invoiceIds: [invoiceId],
      invoiceTotalsByCents,
    });

    const summary = result.get(invoiceId);
    expect(summary?.lastPaymentDate).toBe("2026-04-25T15:00:00Z");
  });

  it("counts only recorded payments in payment count", async () => {
    const invoiceId = "inv-1";
    const invoiceTotalsByCents = new Map([[invoiceId, 10000]]);

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [
              {
                invoice_id: invoiceId,
                amount_cents: 2000,
                payment_status: "recorded",
                paid_at: "2026-04-23T10:00:00Z",
              },
              {
                invoice_id: invoiceId,
                amount_cents: 3000,
                payment_status: "recorded",
                paid_at: "2026-04-25T15:00:00Z",
              },
              {
                invoice_id: invoiceId,
                amount_cents: 1000,
                payment_status: "pending",
                paid_at: "2026-04-24T10:00:00Z",
              },
            ],
            error: null,
          }),
        }),
      }),
    });

    const result = await buildInvoicePaymentSummaryMap({
      supabase: mockSupabase,
      accountOwnerUserId,
      invoiceIds: [invoiceId],
      invoiceTotalsByCents,
    });

    const summary = result.get(invoiceId);
    expect(summary?.paymentCount).toBe(2);
  });

  it("handles null lastPaymentDate when no recorded payments", async () => {
    const invoiceId = "inv-1";
    const invoiceTotalsByCents = new Map([[invoiceId, 10000]]);

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [
              {
                invoice_id: invoiceId,
                amount_cents: 1000,
                payment_status: "pending",
                paid_at: "2026-04-24T10:00:00Z",
              },
            ],
            error: null,
          }),
        }),
      }),
    });

    const result = await buildInvoicePaymentSummaryMap({
      supabase: mockSupabase,
      accountOwnerUserId,
      invoiceIds: [invoiceId],
      invoiceTotalsByCents,
    });

    const summary = result.get(invoiceId);
    expect(summary?.lastPaymentDate).toBeNull();
  });

  it("throws error on DB failure", async () => {
    const invoiceId = "inv-1";

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "Database error" },
          }),
        }),
      }),
    });

    await expect(
      buildInvoicePaymentSummaryMap({
        supabase: mockSupabase,
        accountOwnerUserId,
        invoiceIds: [invoiceId],
        invoiceTotalsByCents: new Map(),
      })
    ).rejects.toThrow("Failed to fetch invoice payment summaries");
  });

  it("handles multiple invoices correctly", async () => {
    const invoice1 = "inv-1";
    const invoice2 = "inv-2";
    const invoiceTotalsByCents = new Map([
      [invoice1, 10000],
      [invoice2, 20000],
    ]);

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [
              {
                invoice_id: invoice1,
                amount_cents: 5000,
                payment_status: "recorded",
                paid_at: "2026-04-25T10:00:00Z",
              },
              {
                invoice_id: invoice2,
                amount_cents: 10000,
                payment_status: "recorded",
                paid_at: "2026-04-25T11:00:00Z",
              },
            ],
            error: null,
          }),
        }),
      }),
    });

    const result = await buildInvoicePaymentSummaryMap({
      supabase: mockSupabase,
      accountOwnerUserId,
      invoiceIds: [invoice1, invoice2],
      invoiceTotalsByCents,
    });

    const summary1 = result.get(invoice1);
    expect(summary1?.amountPaidCents).toBe(5000);
    expect(summary1?.paymentStatus).toBe("partial");

    const summary2 = result.get(invoice2);
    expect(summary2?.amountPaidCents).toBe(10000);
    expect(summary2?.paymentStatus).toBe("partial");
  });

  it("includes unrepresented invoices in result map", async () => {
    const invoice1 = "inv-1";
    const invoice2 = "inv-2";
    const invoiceTotalsByCents = new Map([
      [invoice1, 10000],
      [invoice2, 20000],
    ]);

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [
              {
                invoice_id: invoice1,
                amount_cents: 5000,
                payment_status: "recorded",
                paid_at: "2026-04-25T10:00:00Z",
              },
            ],
            error: null,
          }),
        }),
      }),
    });

    const result = await buildInvoicePaymentSummaryMap({
      supabase: mockSupabase,
      accountOwnerUserId,
      invoiceIds: [invoice1, invoice2],
      invoiceTotalsByCents,
    });

    expect(result.size).toBe(2);
    const summary2 = result.get(invoice2);
    expect(summary2?.paymentStatus).toBe("unpaid");
    expect(summary2?.amountPaidCents).toBe(0);
  });

  it("formats ISO last payment timestamps as clean report dates", () => {
    const formatted = formatTimestampDisplay("2026-04-25T15:45:17.346+00:00");
    expect(formatted).toBe("4/25/2026");
    expect(formatted.includes("T")).toBe(false);
  });
});
