import { describe, expect, it, vi } from "vitest";
import { listInvoiceLedgerRows, parseInvoiceLedgerFilters } from "../invoice-ledger";

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
        const query = { eq: vi.fn(() => query), in: vi.fn(async () => ({ data: fixtures.payments ?? [], error: null })) } as any;
        return { select: vi.fn(() => query) };
      }
      return { select: vi.fn(() => base) };
    }),
  };
}

function invoice(overrides: Record<string, any>) {
  return {
    id: "inv-1",
    job_id: "job-1",
    customer_id: null,
    location_id: null,
    service_case_id: null,
    invoice_number: "INV-001",
    status: "draft",
    invoice_date: "2026-04-20",
    issued_at: null,
    voided_at: null,
    source_type: "job",
    subtotal_cents: 25000,
    total_cents: 25000,
    billing_name: "Acme",
    billing_email: null,
    billing_address_line1: null,
    billing_city: null,
    billing_state: null,
    billing_zip: null,
    created_at: "2026-04-20T09:00:00Z",
    ...overrides,
  };
}

function job(billing_disposition: string | null) {
  return {
    id: "job-1",
    contractor_id: null,
    customer_first_name: null,
    customer_last_name: null,
    job_address: "",
    city: "",
    billing_disposition,
    contractors: null,
  };
}

async function runOne(fixtures: Fixtures) {
  const ledger = await listInvoiceLedgerRows({
    supabase: makeSupabaseMock(fixtures) as any,
    accountOwnerUserId: "owner-1",
    filters: parseInvoiceLedgerFilters({ view: "all" }),
    limit: 250,
  });
  return ledger.rows[0];
}

describe("Invoice Ledger — disposition-aware Payment Status", () => {
  it("shows 'Externally Billed' instead of 'Unpaid' for an externally-billed job with no payment", async () => {
    const row = await runOne({ invoices: [invoice({})], jobs: [job("externally_billed")], payments: [] });
    expect(row.paymentStatusLabel).toBe("Externally Billed");
  });

  it("shows 'No Charge Recorded' for a no_charge job with no payment", async () => {
    const row = await runOne({
      invoices: [invoice({ total_cents: 0, subtotal_cents: 0 })],
      jobs: [job("no_charge")],
      payments: [],
    });
    expect(row.paymentStatusLabel).toBe("No Charge Recorded");
  });

  it("still shows 'Unpaid' when the job has no disposition", async () => {
    const row = await runOne({ invoices: [invoice({})], jobs: [job(null)], payments: [] });
    expect(row.paymentStatusLabel).toBe("Unpaid");
  });

  it("does NOT mask a real recorded payment — a paid, dispositioned invoice still shows 'Paid'", async () => {
    const row = await runOne({
      invoices: [invoice({ status: "issued", total_cents: 25000 })],
      jobs: [job("externally_billed")],
      payments: [{ invoice_id: "inv-1", amount_cents: 25000, payment_status: "recorded", paid_at: "2026-04-25T12:00:00Z" }],
    });
    expect(row.paymentStatusLabel).toBe("Paid");
  });
});
