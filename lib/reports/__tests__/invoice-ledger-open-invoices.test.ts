import { describe, expect, it, vi } from "vitest";
import {
  buildInvoiceLedgerSearchParams,
  listInvoiceLedgerRows,
  parseInvoiceLedgerFilters,
} from "../invoice-ledger";

type Fixtures = {
  invoices: any[];
  jobs?: any[];
  customers?: any[];
  locations?: any[];
  notifications?: any[];
  payments?: any[];
};

function makeSupabaseMock(fixtures: Fixtures) {
  const base = {
    eq: vi.fn(() => base),
    is: vi.fn(() => base),
    in: vi.fn(() => base),
    gte: vi.fn(() => base),
    lte: vi.fn(() => base),
    lt: vi.fn(() => base),
    order: vi.fn(() => base),
    limit: vi.fn(async () => ({ data: [], error: null })),
  } as any;

  return {
    from: vi.fn((table: string) => {
      if (table === "internal_invoices") {
        const query = {
          eq: vi.fn(() => query),
          is: vi.fn(() => query),
          in: vi.fn(() => query),
          gte: vi.fn(() => query),
          lte: vi.fn(() => query),
          lt: vi.fn(() => query),
          order: vi.fn(() => query),
          limit: vi.fn(async () => ({ data: fixtures.invoices ?? [], error: null })),
        } as any;
        return { select: vi.fn(() => query) };
      }

      if (table === "jobs") {
        const query = { in: vi.fn(async () => ({ data: fixtures.jobs ?? [], error: null })) } as any;
        return { select: vi.fn(() => query) };
      }

      if (table === "customers") {
        const query = { in: vi.fn(async () => ({ data: fixtures.customers ?? [], error: null })) } as any;
        return { select: vi.fn(() => query) };
      }

      if (table === "locations") {
        const query = { in: vi.fn(async () => ({ data: fixtures.locations ?? [], error: null })) } as any;
        return { select: vi.fn(() => query) };
      }

      if (table === "notifications") {
        const query = {
          eq: vi.fn(() => query),
          in: vi.fn(() => query),
          order: vi.fn(async () => ({ data: fixtures.notifications ?? [], error: null })),
        } as any;
        return { select: vi.fn(() => query) };
      }

      if (table === "internal_invoice_payments") {
        const query = {
          eq: vi.fn(() => query),
          in: vi.fn(async () => ({ data: fixtures.payments ?? [], error: null })),
        } as any;
        return { select: vi.fn(() => query) };
      }

      return { select: vi.fn(() => base) };
    }),
  };
}

function invoice(id: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    job_id: `job-${id}`,
    customer_id: null,
    location_id: null,
    service_case_id: null,
    invoice_display_number: null,
    invoice_number: `INV-${id}`,
    status: "issued",
    invoice_date: "2026-05-01",
    issued_at: "2026-05-02T12:00:00Z",
    voided_at: null,
    source_type: "job",
    subtotal_cents: 10000,
    total_cents: 10000,
    billing_name: "Acme",
    billing_email: "billing@example.com",
    billing_address_line1: null,
    billing_city: null,
    billing_state: null,
    billing_zip: null,
    created_at: "2026-05-01T12:00:00Z",
    ...overrides,
  };
}

describe("invoice ledger open invoices view", () => {
  it("defaults to view=open and preserves explicit all-invoices view", () => {
    expect(parseInvoiceLedgerFilters({}).view).toBe("open");
    expect(parseInvoiceLedgerFilters({ view: "all" }).view).toBe("all");
    expect(buildInvoiceLedgerSearchParams(parseInvoiceLedgerFilters({})).toString()).toBe("");
    expect(buildInvoiceLedgerSearchParams(parseInvoiceLedgerFilters({ view: "all" })).toString()).toBe("view=all");
  });

  it("shows only issued non-void invoices with positive computed balance due", async () => {
    const supabase = makeSupabaseMock({
      invoices: [
        invoice("open-unpaid"),
        invoice("partial"),
        invoice("paid"),
        invoice("void", { voided_at: "2026-05-04T12:00:00Z" }),
        invoice("draft", { status: "draft" }),
        invoice("zero", { total_cents: 0 }),
      ],
      payments: [
        { invoice_id: "partial", amount_cents: 2500, payment_status: "recorded", paid_at: "2026-05-03T12:00:00Z" },
        { invoice_id: "partial", amount_cents: 9900, payment_status: "failed", paid_at: "2026-05-03T13:00:00Z" },
        { invoice_id: "partial", amount_cents: 9900, payment_status: "pending", paid_at: "2026-05-03T14:00:00Z" },
        { invoice_id: "partial", amount_cents: 9900, payment_status: "reversed", paid_at: "2026-05-03T15:00:00Z" },
        { invoice_id: "paid", amount_cents: 10000, payment_status: "recorded", paid_at: "2026-05-03T12:00:00Z" },
      ],
    });

    const ledger = await listInvoiceLedgerRows({
      supabase,
      accountOwnerUserId: "owner-1",
      filters: parseInvoiceLedgerFilters({ view: "open" }),
      limit: 250,
    });

    expect(ledger.rows.map((row) => row.invoiceId)).toEqual(["open-unpaid", "partial"]);
    expect(ledger.summary.openInvoiceCount).toBe(2);
    expect(ledger.summary.totalArCents).toBe(17500);
    expect(ledger.summary.partialOpenCount).toBe(1);
    expect(ledger.summary.unpaidOpenCount).toBe(1);
    expect(ledger.rows.find((row) => row.invoiceId === "partial")?.balanceDueDisplay).toBe("$75.00");
  });

  it("keeps paid and draft rows available in the all-invoices ledger", async () => {
    const supabase = makeSupabaseMock({
      invoices: [
        invoice("open-unpaid"),
        invoice("paid"),
        invoice("draft", { status: "draft" }),
      ],
      payments: [
        { invoice_id: "paid", amount_cents: 10000, payment_status: "recorded", paid_at: "2026-05-03T12:00:00Z" },
      ],
    });

    const ledger = await listInvoiceLedgerRows({
      supabase,
      accountOwnerUserId: "owner-1",
      filters: parseInvoiceLedgerFilters({ view: "all" }),
      limit: 250,
    });

    expect(ledger.rows.map((row) => row.invoiceId)).toEqual(["open-unpaid", "paid", "draft"]);
    expect(ledger.summary.openInvoiceCount).toBe(1);
  });
});
