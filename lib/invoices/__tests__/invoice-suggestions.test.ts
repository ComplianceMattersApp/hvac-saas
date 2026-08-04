import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveCustomerVisibilityScope = vi.fn();

vi.mock("@/lib/customers/visibility", () => ({
  resolveCustomerVisibilityScope: (...args: unknown[]) => resolveCustomerVisibilityScope(...args),
}));

import {
  buildInvoiceSuggestions,
  parseInvoiceSearchQuery,
  searchScopedInvoiceSuggestions,
} from "@/lib/invoices/invoice-suggestions";

type QueryState = {
  table: string;
  eq: Record<string, unknown>;
  ilike: { column: string; pattern: string } | null;
  in: { column: string; values: string[] } | null;
  or: string | null;
  orderedBy: string | null;
  limit: number | null;
};

function createSupabase(rowsByTable: Record<string, (state: QueryState) => unknown[]>) {
  const queries: QueryState[] = [];

  function from(table: string) {
    const state: QueryState = {
      table,
      eq: {},
      ilike: null,
      in: null,
      or: null,
      orderedBy: null,
      limit: null,
    };
    queries.push(state);

    const builder: any = {
      select: () => builder,
      limit: (value: number) => {
        state.limit = value;
        return builder;
      },
      order: (column: string) => {
        state.orderedBy = column;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        state.eq[column] = value;
        return builder;
      },
      ilike: (column: string, pattern: string) => {
        state.ilike = { column, pattern };
        return builder;
      },
      or: (filter: string) => {
        state.or = filter;
        return builder;
      },
      in: (column: string, values: string[]) => {
        state.in = { column, values };
        return builder;
      },
      then: (resolve: any, reject: any) =>
        Promise.resolve({ data: rowsByTable[table]?.(state) ?? [], error: null }).then(resolve, reject),
    };

    return builder;
  }

  return { supabase: { from }, queries };
}

const INVOICE_ROW = {
  id: "inv-1",
  job_id: "job-1",
  invoice_display_number: 2043,
  invoice_number: "INV-20260530-A1B2",
  status: "issued",
  invoice_date: "2026-05-30",
  total_cents: 125000,
  billing_name: "Acme Property Group",
};

describe("parseInvoiceSearchQuery", () => {
  it("reads the short display number people type off an invoice", () => {
    for (const raw of ["2043", "#2043", " 2043 ", "inv 2043", "INV#2043", "invoice #2043"]) {
      expect(parseInvoiceSearchQuery(raw).displayNumber).toBe(2043);
    }
  });

  it("routes a customer name to the bill-to lookup only", () => {
    expect(parseInvoiceSearchQuery("acme")).toEqual({
      displayNumber: null,
      legacyNumberText: null,
      billToText: "acme",
    });
  });

  it("does not treat a single stray letter as a name worth scanning for", () => {
    expect(parseInvoiceSearchQuery("a").billToText).toBeNull();
  });

  it("keeps legacy INV- numbers off both the display-number and bill-to lookups", () => {
    expect(parseInvoiceSearchQuery("INV-20260530-A1B2")).toEqual({
      displayNumber: null,
      legacyNumberText: "INV-20260530-A1B2",
      billToText: null,
    });
  });

  it("does not send a bare number to the bill-to lookup", () => {
    expect(parseInvoiceSearchQuery("2043").billToText).toBeNull();
  });

  it("rejects an implausibly long digit run instead of querying for it", () => {
    expect(parseInvoiceSearchQuery("1234567890123456").displayNumber).toBeNull();
  });

  it("returns nothing for an empty query", () => {
    expect(parseInvoiceSearchQuery("   ")).toEqual({
      displayNumber: null,
      legacyNumberText: null,
      billToText: null,
    });
  });
});

describe("buildInvoiceSuggestions", () => {
  it("links each invoice to its job invoice workspace and labels it for the dropdown", () => {
    const [suggestion] = buildInvoiceSuggestions({
      invoices: [INVOICE_ROW],
      jobs: [{ id: "job-1", job_display_number: 1042, customer_first_name: "Rae", customer_last_name: "Diaz" }],
      resultLimit: 5,
    });

    expect(suggestion).toEqual({
      invoice_id: "inv-1",
      job_id: "job-1",
      invoice_reference: "Invoice #2043",
      status: "issued",
      invoice_date: "2026-05-30",
      total_cents: 125000,
      bill_to_display: "Acme Property Group",
      job_reference: "Job #1042",
      href: "/jobs/job-1/invoice?invoice_id=inv-1#invoice-workspace",
    });
  });

  it("falls back to the job customer name when the invoice has no billing name", () => {
    const [suggestion] = buildInvoiceSuggestions({
      invoices: [{ ...INVOICE_ROW, billing_name: null }],
      jobs: [{ id: "job-1", job_display_number: 1042, customer_first_name: "Rae", customer_last_name: "Diaz" }],
      resultLimit: 5,
    });

    expect(suggestion.bill_to_display).toBe("Rae Diaz");
  });

  it("dedupes invoices matched by both lookups and orders newest display number first", () => {
    const results = buildInvoiceSuggestions({
      invoices: [
        INVOICE_ROW,
        INVOICE_ROW,
        { ...INVOICE_ROW, id: "inv-2", job_id: "job-2", invoice_display_number: 2101 },
      ],
      jobs: [],
      resultLimit: 5,
    });

    expect(results.map((row) => row.invoice_id)).toEqual(["inv-2", "inv-1"]);
  });

  it("honors the result limit", () => {
    const results = buildInvoiceSuggestions({
      invoices: [INVOICE_ROW, { ...INVOICE_ROW, id: "inv-2", invoice_display_number: 2101 }],
      jobs: [],
      resultLimit: 1,
    });

    expect(results).toHaveLength(1);
  });
});

describe("searchScopedInvoiceSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveCustomerVisibilityScope.mockResolvedValue({
      kind: "internal",
      userId: "user-1",
      accountOwnerUserId: "owner-1",
    });
  });

  it("looks up the display number scoped to the caller's account owner", async () => {
    const { supabase, queries } = createSupabase({
      internal_invoices: () => [INVOICE_ROW],
      jobs: () => [{ id: "job-1", job_display_number: 1042 }],
    });

    const result = await searchScopedInvoiceSuggestions({
      supabase,
      userId: "user-1",
      searchText: "#2043",
    });

    expect(result.results.map((row) => row.invoice_reference)).toEqual(["Invoice #2043"]);

    expect(result.matchedBy).toBe("number");

    const invoiceQuery = queries.find((query) => query.table === "internal_invoices");
    expect(invoiceQuery?.eq).toEqual({
      account_owner_user_id: "owner-1",
      invoice_display_number: 2043,
    });
  });

  it("orders every capped invoice lookup by newest display number", async () => {
    const { supabase, queries } = createSupabase({
      internal_invoices: () => [INVOICE_ROW],
      customers: () => [{ id: "cust-1" }],
      jobs: () => [],
    });

    await searchScopedInvoiceSuggestions({ supabase, userId: "user-1", searchText: "acme" });

    const invoiceQueries = queries.filter((query) => query.table === "internal_invoices");
    expect(invoiceQueries.length).toBeGreaterThan(0);
    for (const query of invoiceQueries) {
      expect(query.orderedBy).toBe("invoice_display_number");
      expect(query.limit).toBe(5);
    }
  });

  it("never returns invoices to a contractor-scoped caller", async () => {
    resolveCustomerVisibilityScope.mockResolvedValue({
      kind: "contractor",
      userId: "user-1",
      contractorId: "contractor-1",
    });

    const { supabase, queries } = createSupabase({ internal_invoices: () => [INVOICE_ROW] });

    const result = await searchScopedInvoiceSuggestions({
      supabase,
      userId: "user-1",
      searchText: "2043",
    });

    expect(result.results).toEqual([]);
    expect(queries).toHaveLength(0);
  });

  it("skips the database entirely when the query cannot reach an invoice at all", async () => {
    const { supabase, queries } = createSupabase({ internal_invoices: () => [INVOICE_ROW] });

    const result = await searchScopedInvoiceSuggestions({
      supabase,
      userId: "user-1",
      searchText: "a",
    });

    expect(result).toEqual({ results: [], matchedBy: null });
    expect(queries).toHaveLength(0);
    expect(resolveCustomerVisibilityScope).not.toHaveBeenCalled();
  });

  it("finds invoices by the name they are billed to", async () => {
    const { supabase, queries } = createSupabase({
      internal_invoices: (state) => (state.ilike?.column === "billing_name" ? [INVOICE_ROW] : []),
      customers: () => [],
      jobs: () => [],
    });

    const result = await searchScopedInvoiceSuggestions({
      supabase,
      userId: "user-1",
      searchText: "acme",
    });

    expect(result.matchedBy).toBe("name");
    expect(result.results.map((row) => row.invoice_id)).toEqual(["inv-1"]);

    const billingNameQuery = queries.find((query) => query.ilike?.column === "billing_name");
    expect(billingNameQuery?.ilike?.pattern).toBe("%acme%");
    expect(billingNameQuery?.eq.account_owner_user_id).toBe("owner-1");
  });

  it("also finds invoices that carry no billing name via their customer record", async () => {
    const unnamedInvoice = { ...INVOICE_ROW, id: "inv-9", billing_name: null };
    const { supabase, queries } = createSupabase({
      internal_invoices: (state) => (state.in?.column === "customer_id" ? [unnamedInvoice] : []),
      customers: () => [{ id: "cust-1" }, { id: "cust-1" }],
      jobs: () => [{ id: "job-1", customer_first_name: "Rae", customer_last_name: "Diaz" }],
    });

    const result = await searchScopedInvoiceSuggestions({
      supabase,
      userId: "user-1",
      searchText: "diaz",
    });

    expect(result.results.map((row) => row.invoice_id)).toEqual(["inv-9"]);
    expect(result.results[0]?.bill_to_display).toBe("Rae Diaz");

    const customerQuery = queries.find((query) => query.table === "customers");
    expect(customerQuery?.eq.owner_user_id).toBe("owner-1");

    // Deduped before it becomes an `in` filter.
    const byCustomerQuery = queries.find((query) => query.in?.column === "customer_id");
    expect(byCustomerQuery?.in?.values).toEqual(["cust-1"]);
  });

  it("keeps a name carrying PostgREST filter punctuation in a single quoted operand", async () => {
    const { supabase, queries } = createSupabase({
      internal_invoices: () => [],
      customers: () => [],
    });

    await searchScopedInvoiceSuggestions({
      supabase,
      userId: "user-1",
      searchText: "Diaz, Rae (HVAC)",
    });

    const customerQuery = queries.find((query) => query.table === "customers");
    expect(customerQuery?.or).toBe(
      'full_name.ilike."%Diaz, Rae (HVAC)%",first_name.ilike."%Diaz, Rae (HVAC)%",last_name.ilike."%Diaz, Rae (HVAC)%"',
    );
  });

  it("does not query for a customer name when the caller is contractor-scoped", async () => {
    resolveCustomerVisibilityScope.mockResolvedValue({
      kind: "contractor",
      userId: "user-1",
      contractorId: "contractor-1",
    });

    const { supabase, queries } = createSupabase({ internal_invoices: () => [INVOICE_ROW] });

    const result = await searchScopedInvoiceSuggestions({
      supabase,
      userId: "user-1",
      searchText: "acme",
    });

    expect(result.results).toEqual([]);
    expect(queries).toHaveLength(0);
  });

  it("matches legacy INV- numbers through the text lookup", async () => {
    const { supabase, queries } = createSupabase({
      internal_invoices: () => [INVOICE_ROW],
      jobs: () => [],
    });

    const result = await searchScopedInvoiceSuggestions({
      supabase,
      userId: "user-1",
      searchText: "INV-20260530-A1B2",
    });

    expect(result.results).toHaveLength(1);
    expect(queries[0]?.ilike).toEqual({
      column: "invoice_number",
      pattern: "%INV-20260530-A1B2%",
    });
  });
});
