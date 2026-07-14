import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const actionsSrc = readFileSync(resolve(__dirname, "../contractor-actions.ts"), "utf-8");
const formSrc = readFileSync(
  resolve(__dirname, "../../../app/contractors/_components/ContractorForm.tsx"),
  "utf-8",
);
const migrationSrc = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/20260713120000_contractors_billing_expansion.sql"),
  "utf-8",
);

const NEW_FIELDS = ["billing_country", "billing_contact_name", "billing_contact_email", "qbo_customer_name"];

describe("contractor billing expansion wiring", () => {
  it("migration adds the new contractor columns and customer billing_country", () => {
    for (const f of NEW_FIELDS) expect(migrationSrc).toContain(`add column if not exists ${f}`);
    expect(migrationSrc).toContain("alter table public.customers");
    expect(migrationSrc).toContain("add column if not exists billing_country");
  });

  it("create AND update actions read and write the new fields", () => {
    for (const f of NEW_FIELDS) {
      // read from the form
      expect(actionsSrc).toContain(`formData.get("${f}")`);
      // written to the row
      expect(actionsSrc).toContain(`${f},`);
    }
  });

  it("update no longer blanks the billing name — defaults to the contractor name", () => {
    const start = actionsSrc.indexOf("export async function updateContractorFromForm");
    const end = actionsSrc.indexOf("export async function", start + 10);
    const fn = actionsSrc.slice(start, end);
    expect(fn).toContain("billing_name: billing_name || name");
  });

  it("form exposes the new bill-to inputs", () => {
    expect(formSrc).toContain('name="billing_contact_name"');
    expect(formSrc).toContain('name="billing_contact_email"');
    expect(formSrc).toContain('name="billing_country"');
    expect(formSrc).toContain('name="qbo_customer_name"');
    expect(formSrc).toContain("Bill-To (contractor-billed invoices)");
  });

  it("the invoice contractor billing-source read includes the AP contact fields", () => {
    const invoiceActions = readFileSync(resolve(__dirname, "../internal-invoice-actions.ts"), "utf-8");
    expect(invoiceActions).toContain("billing_contact_name, billing_contact_email");
  });
});
