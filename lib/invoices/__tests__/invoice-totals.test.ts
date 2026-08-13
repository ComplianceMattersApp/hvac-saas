import { describe, expect, it, vi } from "vitest";

import { insertInvoiceLineItemWithTaxability, recalculateInvoiceTotals } from "@/lib/invoices/invoice-totals";
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
            if (hasTax && (config.failSelectsMentioning ?? []).includes("is_taxable")) {
              return resolve({ data: null, error: MISSING_TAX_COLUMN });
            }
            inserts.push(state.payload);
            return resolve({ data: null, error: null });
          }
          if (state.isUpdate) {
            const hasTax = Object.prototype.hasOwnProperty.call(state.payload ?? {}, "tax_cents");
            if (hasTax && config.failUpdatesWithTax) {
              return resolve({ data: null, error: { code: "42703", message: "column tax_cents does not exist" } });
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
