import { describe, expect, it, vi } from "vitest";

import {
  insertInvoiceLineItemWithTaxability,
  recalculateDraftInvoiceTotalsForCustomer,
  recalculateInvoiceTotals,
} from "@/lib/invoices/invoice-totals";
import { isMissingInvoiceTaxColumnError } from "@/lib/invoices/invoice-tax-state";

const MISSING_TAX_COLUMN = {
  code: "42703",
  message: 'column internal_invoice_line_items.is_taxable does not exist',
};

/**
 * Fake supabase driven by a per-(table, columns) response map, so a test can
 * make exactly the tax-bearing selects fail — which is what an unapplied
 * migration looks like from the app's side.
 */
function makeSupabase(config: {
  lineItems: any[];
  invoice?: any;
  customer?: any;
  failSelectsMentioning?: string[];
  failUpdatesWithTax?: boolean;
  /** Exact error the tax-bearing UPDATE should return (e.g. the PGRST204 shape). */
  updateErrorWithTax?: any;
  /** Exact error the tax-bearing INSERT should return. */
  insertErrorWithTax?: any;
}) {
  const updates: any[] = [];
  const inserts: any[] = [];
  const shouldFail = (columns: string) =>
    (config.failSelectsMentioning ?? []).some((needle) => columns.includes(needle));

  const supabase = {
    from(table: string) {
      const state: any = { table, columns: "", isUpdate: false, payload: null, isInsert: false };
      const builder: any = {
        select(columns: string) { state.columns = columns; return builder; },
        eq() { return builder; },
        update(payload: any) { state.isUpdate = true; state.payload = payload; return builder; },
        insert(payload: any) { state.isInsert = true; state.payload = payload; return builder; },
        async maybeSingle() {
          if (shouldFail(state.columns)) return { data: null, error: MISSING_TAX_COLUMN };
          if (table === "internal_invoices") return { data: config.invoice ?? null, error: null };
          if (table === "customers") return { data: config.customer ?? null, error: null };
          return { data: null, error: null };
        },
        then(resolve: (value: any) => void) {
          if (state.isInsert) {
            const hasTax = Object.prototype.hasOwnProperty.call(state.payload ?? {}, "is_taxable");
            if (hasTax && config.insertErrorWithTax) {
              return resolve({ data: null, error: config.insertErrorWithTax });
            }
            if (hasTax && (config.failSelectsMentioning ?? []).includes("is_taxable")) {
              return resolve({ data: null, error: MISSING_TAX_COLUMN });
            }
            inserts.push(state.payload);
            return resolve({ data: null, error: null });
          }
          if (state.isUpdate) {
            const hasTax = Object.prototype.hasOwnProperty.call(state.payload ?? {}, "tax_cents");
            if (hasTax && (config.updateErrorWithTax || config.failUpdatesWithTax)) {
              return resolve({
                data: null,
                error: config.updateErrorWithTax ?? { code: "42703", message: "column tax_cents does not exist" },
              });
            }
            updates.push({ table, payload: state.payload });
            return resolve({ data: null, error: null });
          }
          if (shouldFail(state.columns)) return resolve({ data: null, error: MISSING_TAX_COLUMN });
          if (table === "internal_invoice_line_items") return resolve({ data: config.lineItems, error: null });
          return resolve({ data: [], error: null });
        },
      };
      return builder;
    },
  };
  return { supabase, updates, inserts };
}

describe("recalculateInvoiceTotals", () => {
  const taxableInvoice = { id: "inv-1", customer_id: "cust-1", tax_rate_percent: 7.975 };

  it("uses the one-round-trip totals RPC when it is deployed", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ subtotal_cents: 12500, tax_cents: 798, total_cents: 13298 }],
      error: null,
    }));
    const supabase = {
      rpc,
      from: vi.fn(() => {
        throw new Error("legacy totals path should not run");
      }),
    };

    await expect(
      recalculateInvoiceTotals({ supabase, invoiceId: "inv-1", userId: "user-1" }),
    ).resolves.toEqual({
      subtotalCents: 12500,
      taxCents: 798,
      totalCents: 13298,
      taxSupported: true,
    });
    expect(rpc).toHaveBeenCalledWith("recalculate_internal_invoice_totals_v1", {
      p_invoice_id: "inv-1",
      p_updated_by_user_id: "user-1",
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("falls back safely while the totals RPC is not in the schema cache", async () => {
    const fixture = makeSupabase({
      lineItems: [{ line_subtotal: "10.00", is_taxable: false }],
      invoice: { id: "inv-1", customer_id: null, tax_rate_percent: null },
    });
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.recalculate_internal_invoice_totals_v1",
      },
    }));
    const supabase = { ...fixture.supabase, rpc };

    const totals = await recalculateInvoiceTotals({ supabase, invoiceId: "inv-1", userId: "user-1" });

    expect(totals).toMatchObject({ subtotalCents: 1000, taxCents: 0, totalCents: 1000 });
    expect(fixture.updates).toHaveLength(1);
  });

  it("writes total = subtotal + tax from the line items", async () => {
    const { supabase, updates } = makeSupabase({
      lineItems: [
        { line_subtotal: "100.00", is_taxable: true },
        { line_subtotal: "25.00", is_taxable: false },
      ],
      invoice: taxableInvoice,
      customer: { id: "cust-1", tax_exempt: false },
    });

    const totals = await recalculateInvoiceTotals({ supabase, invoiceId: "inv-1", userId: "user-1" });

    expect(totals).toMatchObject({ subtotalCents: 12500, taxCents: 798, totalCents: 13298, taxSupported: true });
    const written = updates.find((row) => row.table === "internal_invoices")?.payload;
    expect(written).toMatchObject({ subtotal_cents: 12500, tax_cents: 798, total_cents: 13298 });
    expect(written.total_cents).toBe(written.subtotal_cents + written.tax_cents);
  });

  it("charges no tax when the bill-to customer is exempt", async () => {
    const { supabase, updates } = makeSupabase({
      lineItems: [{ line_subtotal: "100.00", is_taxable: true }],
      invoice: taxableInvoice,
      customer: { id: "cust-1", tax_exempt: true },
    });

    const totals = await recalculateInvoiceTotals({ supabase, invoiceId: "inv-1", userId: "user-1" });

    expect(totals).toMatchObject({ taxCents: 0, subtotalCents: 10000, totalCents: 10000 });
    expect(updates.find((row) => row.table === "internal_invoices")?.payload).toMatchObject({ tax_cents: 0 });
  });

  it("writes no tax when the invoice has no rate", async () => {
    const { supabase } = makeSupabase({
      lineItems: [{ line_subtotal: "100.00", is_taxable: true }],
      invoice: { id: "inv-1", customer_id: null, tax_rate_percent: null },
    });

    const totals = await recalculateInvoiceTotals({ supabase, invoiceId: "inv-1", userId: "user-1" });

    expect(totals).toMatchObject({ taxCents: 0, totalCents: 10000 });
  });

  it("falls back to pre-tax behavior when the columns are not deployed", async () => {
    const { supabase, updates } = makeSupabase({
      lineItems: [{ line_subtotal: "100.00" }, { line_subtotal: "25.00" }],
      failSelectsMentioning: ["is_taxable", "tax_rate_percent"],
    });

    const totals = await recalculateInvoiceTotals({ supabase, invoiceId: "inv-1", userId: "user-1" });

    expect(totals).toMatchObject({ subtotalCents: 12500, taxCents: 0, totalCents: 12500, taxSupported: false });
    const written = updates.find((row) => row.table === "internal_invoices")?.payload;
    // Exactly the columns this app wrote before tax existed.
    expect(written).not.toHaveProperty("tax_cents");
    expect(written).toMatchObject({ subtotal_cents: 12500, total_cents: 12500 });
  });

  it("retries without tax when the UPDATE itself hits an undeployed column", async () => {
    const { supabase, updates } = makeSupabase({
      lineItems: [{ line_subtotal: "100.00", is_taxable: true }],
      invoice: taxableInvoice,
      customer: { id: "cust-1", tax_exempt: false },
      failUpdatesWithTax: true,
    });

    const totals = await recalculateInvoiceTotals({ supabase, invoiceId: "inv-1", userId: "user-1" });

    expect(totals).toMatchObject({ taxCents: 0, totalCents: 10000, taxSupported: false });
    expect(updates.at(-1)?.payload).not.toHaveProperty("tax_cents");
  });

  it("surfaces a real database error instead of silently zeroing tax", async () => {
    const supabase = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          then(resolve: (value: any) => void) {
            resolve({ data: null, error: { code: "57014", message: "statement timeout" } });
          },
        };
      },
    };
    await expect(
      recalculateInvoiceTotals({ supabase, invoiceId: "inv-1", userId: "user-1" }),
    ).rejects.toMatchObject({ message: "statement timeout" });
  });
});

describe("insertInvoiceLineItemWithTaxability", () => {
  it("retries without is_taxable when the column is not deployed", async () => {
    const { supabase, inserts } = makeSupabase({ lineItems: [], failSelectsMentioning: ["is_taxable"] });

    const { error } = await insertInvoiceLineItemWithTaxability({
      supabase,
      payload: { invoice_id: "inv-1", is_taxable: true, line_subtotal: "10.00" },
    });

    expect(error).toBeNull();
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).not.toHaveProperty("is_taxable");
    expect(inserts[0]).toMatchObject({ invoice_id: "inv-1" });
  });

  it("keeps taxability when the column exists", async () => {
    const { supabase, inserts } = makeSupabase({ lineItems: [] });
    await insertInvoiceLineItemWithTaxability({
      supabase,
      payload: { invoice_id: "inv-1", is_taxable: true },
    });
    expect(inserts[0]).toMatchObject({ is_taxable: true });
  });
});

describe("isMissingInvoiceTaxColumnError", () => {
  it("recognizes every tax column", () => {
    for (const column of ["tax_rate_percent", "tax_cents", "tax_label", "is_taxable", "tax_exempt"]) {
      expect(isMissingInvoiceTaxColumnError({ code: "42703", message: `column x.${column} does not exist` })).toBe(true);
    }
  });

  it("does not swallow unrelated failures", () => {
    expect(isMissingInvoiceTaxColumnError({ code: "42703", message: "column x.widget does not exist" })).toBe(false);
    expect(isMissingInvoiceTaxColumnError(new Error("permission denied"))).toBe(false);
  });
});

describe("PostgREST write-failure shape", () => {
  // A SELECT fails as 42703 "does not exist"; an INSERT/UPDATE is rejected by
  // PostgREST against its schema cache as PGRST204 "Could not find ...". Only
  // matching the read shape left every tolerant write throwing.
  const PGRST204 = {
    code: "PGRST204",
    message: "Could not find the 'tax_cents' column of 'internal_invoices' in the schema cache",
  };

  it("recognizes the PGRST204 write shape", () => {
    expect(isMissingInvoiceTaxColumnError(PGRST204)).toBe(true);
    expect(
      isMissingInvoiceTaxColumnError({
        code: "PGRST204",
        message: "Could not find the 'is_taxable' column of 'pricebook_items' in the schema cache",
      }),
    ).toBe(true);
  });

  it("matches on message alone when no code is supplied", () => {
    expect(
      isMissingInvoiceTaxColumnError({ message: "Could not find the 'tax_exempt' column" }),
    ).toBe(true);
  });

  it("reads details as well as message", () => {
    expect(
      isMissingInvoiceTaxColumnError({ message: "Bad Request", details: "could not find the 'tax_label' column" }),
    ).toBe(true);
  });

  it("still refuses to swallow an unrelated PGRST204", () => {
    expect(
      isMissingInvoiceTaxColumnError({
        code: "PGRST204",
        message: "Could not find the 'widget' column of 'internal_invoices' in the schema cache",
      }),
    ).toBe(false);
  });

  it("retries the totals write when PostgREST rejects tax_cents", async () => {
    const { supabase, updates } = makeSupabase({
      lineItems: [{ line_subtotal: "100.00", is_taxable: true }],
      invoice: { id: "inv-1", customer_id: null, tax_rate_percent: 7.975 },
      updateErrorWithTax: PGRST204,
    });

    const totals = await recalculateInvoiceTotals({ supabase, invoiceId: "inv-1", userId: "user-1" });

    expect(totals).toMatchObject({ taxCents: 0, totalCents: 10000, taxSupported: false });
    expect(updates.at(-1)?.payload).not.toHaveProperty("tax_cents");
  });

  it("retries a line insert when PostgREST rejects is_taxable", async () => {
    const { supabase, inserts } = makeSupabase({
      lineItems: [],
      insertErrorWithTax: {
        code: "PGRST204",
        message: "Could not find the 'is_taxable' column of 'internal_invoice_line_items' in the schema cache",
      },
    });

    const { error } = await insertInvoiceLineItemWithTaxability({
      supabase,
      payload: { invoice_id: "inv-1", is_taxable: true },
    });

    expect(error).toBeNull();
    expect(inserts[0]).not.toHaveProperty("is_taxable");
  });
});

describe("malformed line subtotals fail loudly", () => {
  it("throws rather than counting a corrupt line as $0", async () => {
    const { supabase } = makeSupabase({
      lineItems: [{ line_subtotal: "100.00", is_taxable: false }, { line_subtotal: "not-a-number" }],
      invoice: { id: "inv-1", customer_id: null, tax_rate_percent: null },
    });
    await expect(
      recalculateInvoiceTotals({ supabase, invoiceId: "inv-1", userId: "user-1" }),
    ).rejects.toThrow(/not a valid amount/);
  });

  it("throws on a negative line subtotal", async () => {
    const { supabase } = makeSupabase({
      lineItems: [{ line_subtotal: "-25.00" }],
      invoice: { id: "inv-1", customer_id: null, tax_rate_percent: null },
    });
    await expect(
      recalculateInvoiceTotals({ supabase, invoiceId: "inv-1", userId: "user-1" }),
    ).rejects.toThrow(/must not be negative/);
  });

  it("treats a null subtotal as malformed, not as zero", async () => {
    const { supabase } = makeSupabase({
      lineItems: [{ line_subtotal: null }],
      invoice: { id: "inv-1", customer_id: null, tax_rate_percent: null },
    });
    await expect(
      recalculateInvoiceTotals({ supabase, invoiceId: "inv-1", userId: "user-1" }),
    ).rejects.toThrow(/not a valid amount/);
  });
});

describe("recalculateDraftInvoiceTotalsForCustomer", () => {
  it("recomputes every draft for the customer and leaves issued alone", async () => {
    const recalculated: string[] = [];
    const supabase = {
      from(table: string) {
        const state: any = { table, filters: {} as Record<string, unknown>, isUpdate: false };
        const builder: any = {
          select() { return builder; },
          eq(column: string, value: unknown) { state.filters[column] = value; return builder; },
          update() { state.isUpdate = true; return builder; },
          async maybeSingle() {
            if (table === "internal_invoices") {
              return { data: { id: "x", customer_id: null, tax_rate_percent: null }, error: null };
            }
            return { data: null, error: null };
          },
          then(resolve: (value: any) => void) {
            if (table === "internal_invoices" && !state.isUpdate && state.filters.status === "draft") {
              return resolve({ data: [{ id: "draft-1" }, { id: "draft-2" }], error: null });
            }
            if (table === "internal_invoices" && state.isUpdate) {
              recalculated.push(String(state.filters.id ?? ""));
              return resolve({ data: null, error: null });
            }
            return resolve({ data: [], error: null });
          },
        };
        return builder;
      },
    };

    const result = await recalculateDraftInvoiceTotalsForCustomer({
      supabase,
      accountOwnerUserId: "acct-1",
      customerId: "cust-1",
      userId: "user-1",
    });

    // Only drafts were selected, and each one was written.
    expect(result.recalculated).toBe(2);
    expect(recalculated).toEqual(["draft-1", "draft-2"]);
  });

  it("does nothing without a customer scope", async () => {
    const supabase = { from: vi.fn() };
    await expect(
      recalculateDraftInvoiceTotalsForCustomer({
        supabase, accountOwnerUserId: "acct-1", customerId: "  ", userId: "user-1",
      }),
    ).resolves.toEqual({ recalculated: 0 });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
