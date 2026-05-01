import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildInvoiceLedgerCsv,
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
        const query = {
          in: vi.fn(async () => ({ data: fixtures.jobs ?? [], error: null })),
        } as any;
        return { select: vi.fn(() => query) };
      }

      if (table === "customers") {
        const query = {
          in: vi.fn(async () => ({ data: fixtures.customers ?? [], error: null })),
        } as any;
        return { select: vi.fn(() => query) };
      }

      if (table === "locations") {
        const query = {
          in: vi.fn(async () => ({ data: fixtures.locations ?? [], error: null })),
        } as any;
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

describe("Invoice Ledger Collected Payment Reporting", () => {
  const accountOwnerUserId = "owner-1";

  let filters: ReturnType<typeof parseInvoiceLedgerFilters>;
  beforeEach(() => {
    filters = parseInvoiceLedgerFilters({});
  });

  it("listInvoiceLedgerRows populates payment columns from production read model", async () => {
    const supabase = makeSupabaseMock({
      invoices: [
        {
          id: "inv-1",
          job_id: "job-1",
          customer_id: "cust-1",
          location_id: "loc-1",
          service_case_id: null,
          invoice_number: "INV-001",
          status: "issued",
          invoice_date: "2026-04-20",
          issued_at: "2026-04-20T10:00:00Z",
          voided_at: null,
          source_type: "job",
          subtotal_cents: 15000,
          total_cents: 20000,
          billing_name: "Acme",
          billing_email: "billing@example.com",
          billing_address_line1: null,
          billing_city: null,
          billing_state: null,
          billing_zip: null,
          created_at: "2026-04-20T09:00:00Z",
        },
      ],
      jobs: [
        {
          id: "job-1",
          title: "Service Call",
          contractor_id: "con-1",
          customer_first_name: "Amy",
          customer_last_name: "Owner",
          job_address: "",
          city: "",
          contractors: [{ name: "Blue Air" }],
        },
      ],
      customers: [{ id: "cust-1", full_name: "Acme Customer", first_name: null, last_name: null }],
      locations: [{ id: "loc-1", address_line1: "100 Main St", city: "Austin", state: "TX", zip: "78701" }],
      notifications: [],
      payments: [
        {
          invoice_id: "inv-1",
          amount_cents: 1234,
          payment_status: "recorded",
          paid_at: "2026-04-24T12:00:00Z",
        },
        {
          invoice_id: "inv-1",
          amount_cents: 50,
          payment_status: "recorded",
          paid_at: "2026-04-25T15:45:17.346+00:00",
        },
        {
          invoice_id: "inv-1",
          amount_cents: 999,
          payment_status: "pending",
          paid_at: "2026-04-25T16:00:00Z",
        },
        {
          invoice_id: "inv-1",
          amount_cents: 888,
          payment_status: "failed",
          paid_at: "2026-04-25T16:10:00Z",
        },
        {
          invoice_id: "inv-1",
          amount_cents: 777,
          payment_status: "reversed",
          paid_at: "2026-04-25T16:20:00Z",
        },
      ],
    });

    const ledger = await listInvoiceLedgerRows({
      supabase,
      accountOwnerUserId,
      filters,
      limit: 250,
    });

    expect(ledger.rows).toHaveLength(1);
    const row = ledger.rows[0];

    expect(row.amountPaidDisplay).toBe("$12.84");
    expect(row.balanceDueDisplay).toBe("$187.16");
    expect(row.paymentStatusLabel).toBe("Partial");
    expect(row.lastPaymentDateDisplay).toBe("04-25-2026");
    expect(row.lastPaymentDateDisplay.includes("T")).toBe(false);
    expect(row.paymentCountDisplay).toBe("2");
  });

  it("buildInvoiceLedgerCsv keeps payment columns in expected order and uses production row values", async () => {
    const supabase = makeSupabaseMock({
      invoices: [
        {
          id: "inv-1",
          job_id: "job-1",
          customer_id: null,
          location_id: null,
          service_case_id: null,
          invoice_number: "INV-CSV-1",
          status: "issued",
          invoice_date: "2026-04-20",
          issued_at: "2026-04-20T10:00:00Z",
          voided_at: null,
          source_type: "job",
          subtotal_cents: 5000,
          total_cents: 10000,
          billing_name: "Acme",
          billing_email: "billing@example.com",
          billing_address_line1: null,
          billing_city: null,
          billing_state: null,
          billing_zip: null,
          created_at: "2026-04-20T09:00:00Z",
        },
      ],
      jobs: [{ id: "job-1", contractor_id: null, customer_first_name: null, customer_last_name: null, job_address: "", city: "", contractors: null }],
      customers: [],
      locations: [],
      notifications: [],
      payments: [
        {
          invoice_id: "inv-1",
          amount_cents: 1234,
          payment_status: "recorded",
          paid_at: "2026-04-25T15:45:17.346+00:00",
        },
      ],
    });

    const ledger = await listInvoiceLedgerRows({
      supabase,
      accountOwnerUserId,
      filters,
      limit: 250,
    });

    const csv = buildInvoiceLedgerCsv(ledger.rows);
    const [headerLine, rowLine] = csv.split("\r\n");
    const headerColumns = headerLine.split(",");

    const totalIndex = headerColumns.indexOf("Total");
    expect(headerColumns[totalIndex + 1]).toBe("Voided Date");
    expect(headerColumns[totalIndex + 2]).toBe("Amount Paid");
    expect(headerColumns[totalIndex + 3]).toBe("Balance Due");
    expect(headerColumns[totalIndex + 4]).toBe("Payment Status");
    expect(headerColumns[totalIndex + 5]).toBe("Last Payment Date");
    expect(headerColumns[totalIndex + 6]).toBe("Payment Count");

    expect(rowLine.includes(ledger.rows[0].amountPaidDisplay)).toBe(true);
    expect(rowLine.includes(ledger.rows[0].balanceDueDisplay)).toBe(true);
    expect(rowLine.includes(ledger.rows[0].paymentStatusLabel)).toBe(true);
    expect(rowLine.includes(ledger.rows[0].lastPaymentDateDisplay)).toBe(true);
    expect(rowLine.includes(ledger.rows[0].paymentCountDisplay)).toBe(true);
  });

  it("returns non-applicable empty output without fabricating payment rows", async () => {
    const supabase = makeSupabaseMock({
      invoices: [],
      jobs: [],
      customers: [],
      locations: [],
      notifications: [],
      payments: [],
    });

    const ledger = await listInvoiceLedgerRows({
      supabase,
      accountOwnerUserId,
      filters,
      limit: 250,
    });

    expect(ledger.rows).toHaveLength(0);
    expect(ledger.totalCount).toBe(0);
    expect(ledger.truncated).toBe(false);

    const csv = buildInvoiceLedgerCsv(ledger.rows);
    expect(csv.split("\r\n")).toHaveLength(1);
  });
});
