import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  listInternalInvoicesByJobId,
  resolveInternalInvoiceByJobId,
  resolveInternalInvoiceFamilyByJobId,
} from "@/lib/business/internal-invoice";

function buildSupabaseFixture() {
  const invoiceRows = [
    {
      id: "inv-primary",
      account_owner_user_id: "owner-1",
      job_id: "job-1",
      customer_id: "cust-1",
      location_id: "loc-1",
      service_case_id: "svc-1",
      invoice_kind: "primary",
      original_internal_invoice_id: null,
      supplemental_reason: null,
      invoice_display_number: 2010,
      invoice_number: "INV-PRIMARY",
      status: "issued",
      invoice_date: "2026-06-05",
      issued_at: "2026-06-05T00:00:00Z",
      issued_by_user_id: "user-1",
      voided_at: null,
      voided_by_user_id: null,
      void_reason: null,
      source_type: "job",
      subtotal_cents: 10000,
      total_cents: 10000,
      notes: null,
      billing_name: "Customer One",
      billing_email: "billing@example.com",
      billing_phone: null,
      billing_address_line1: null,
      billing_address_line2: null,
      billing_city: null,
      billing_state: null,
      billing_zip: null,
      created_by_user_id: "user-1",
      updated_by_user_id: "user-1",
      created_at: "2026-06-05T00:00:00Z",
      updated_at: "2026-06-05T00:00:00Z",
    },
    {
      id: "inv-supp-1",
      account_owner_user_id: "owner-1",
      job_id: "job-1",
      customer_id: "cust-1",
      location_id: "loc-1",
      service_case_id: "svc-1",
      invoice_kind: "supplemental",
      original_internal_invoice_id: "inv-primary",
      supplemental_reason: "forgotten_charge",
      invoice_display_number: 2011,
      invoice_number: "INV-SUPP-1",
      status: "draft",
      invoice_date: "2026-06-06",
      issued_at: null,
      issued_by_user_id: null,
      voided_at: null,
      voided_by_user_id: null,
      void_reason: null,
      source_type: "job",
      subtotal_cents: 2500,
      total_cents: 2500,
      notes: null,
      billing_name: "Customer One",
      billing_email: "billing@example.com",
      billing_phone: null,
      billing_address_line1: null,
      billing_address_line2: null,
      billing_city: null,
      billing_state: null,
      billing_zip: null,
      created_by_user_id: "user-1",
      updated_by_user_id: "user-1",
      created_at: "2026-06-06T00:00:00Z",
      updated_at: "2026-06-06T00:00:00Z",
    },
    {
      id: "inv-supp-2",
      account_owner_user_id: "owner-1",
      job_id: "job-1",
      customer_id: "cust-1",
      location_id: "loc-1",
      service_case_id: "svc-1",
      invoice_kind: "supplemental",
      original_internal_invoice_id: "inv-primary",
      supplemental_reason: "service_plan",
      invoice_display_number: 2012,
      invoice_number: "INV-SUPP-2",
      status: "issued",
      invoice_date: "2026-06-07",
      issued_at: "2026-06-07T00:00:00Z",
      issued_by_user_id: "user-1",
      voided_at: null,
      voided_by_user_id: null,
      void_reason: null,
      source_type: "job",
      subtotal_cents: 5000,
      total_cents: 5000,
      notes: null,
      billing_name: "Customer One",
      billing_email: "billing@example.com",
      billing_phone: null,
      billing_address_line1: null,
      billing_address_line2: null,
      billing_city: null,
      billing_state: null,
      billing_zip: null,
      created_by_user_id: "user-1",
      updated_by_user_id: "user-1",
      created_at: "2026-06-07T00:00:00Z",
      updated_at: "2026-06-07T00:00:00Z",
    },
  ];

  const eqCalls: Array<{ column: string; value: unknown }> = [];

  return {
    eqCalls,
    supabase: {
      from(table: string) {
        if (table === "internal_invoices") {
          const state = {
            filters: [] as Array<{ type: "eq" | "neq"; column: string; value: unknown }>,
          };

          const matchesFilters = (row: Record<string, unknown>) =>
            state.filters.every((filter) =>
              filter.type === "eq"
                ? row[filter.column] === filter.value
                : row[filter.column] !== filter.value,
            );

          const query: any = {
            select: vi.fn(() => query),
            eq: vi.fn((column: string, value: unknown) => {
              eqCalls.push({ column, value });
              state.filters.push({ type: "eq", column, value });
              return query;
            }),
            neq: vi.fn((column: string, value: unknown) => {
              state.filters.push({ type: "neq", column, value });
              return query;
            }),
            order: vi.fn(async () => ({
              data: invoiceRows.filter((row) => matchesFilters(row as Record<string, unknown>)),
              error: null,
            })),
            limit: vi.fn(() => query),
            maybeSingle: vi.fn(async () => ({
              data:
                invoiceRows.find((row) => matchesFilters(row as Record<string, unknown>)) ?? null,
                error: null,
            })),
          };

          return query;
        }

        if (table === "internal_invoice_line_items") {
          const query: any = {
            select: vi.fn(() => query),
            eq: vi.fn(() => query),
            order: vi.fn(() => query),
          };

          query.order = vi
            .fn()
            .mockReturnValueOnce(query)
            .mockImplementationOnce(async () => ({ data: [], error: null }));

          return query;
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    },
  };
}

describe("internal invoice supplemental read helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists all invoices for a job including supplemental invoices", async () => {
    const fixture = buildSupabaseFixture();

    const invoices = await listInternalInvoicesByJobId({
      supabase: fixture.supabase,
      jobId: "job-1",
    });

    expect(invoices.map((invoice) => invoice.id)).toEqual([
      "inv-primary",
      "inv-supp-1",
      "inv-supp-2",
    ]);
  });

  it("separates current primary invoice from supplemental invoices for a job", async () => {
    const fixture = buildSupabaseFixture();

    const family = await resolveInternalInvoiceFamilyByJobId({
      supabase: fixture.supabase,
      jobId: "job-1",
    });

    expect(family.currentPrimaryInvoice?.id).toBe("inv-primary");
    expect(family.supplementalInvoices.map((invoice) => invoice.id)).toEqual([
      "inv-supp-1",
      "inv-supp-2",
    ]);
    expect(family.supplementalInvoices.every((invoice) => invoice.original_internal_invoice_id === "inv-primary")).toBe(true);
  });

  it("keeps the existing one-invoice resolver scoped to the primary invoice", async () => {
    const fixture = buildSupabaseFixture();

    const invoice = await resolveInternalInvoiceByJobId({
      supabase: fixture.supabase,
      jobId: "job-1",
    });

    expect(invoice?.id).toBe("inv-primary");
    expect(invoice?.invoice_kind).toBe("primary");
    expect(fixture.eqCalls).toContainEqual({ column: "invoice_kind", value: "primary" });
  });
});