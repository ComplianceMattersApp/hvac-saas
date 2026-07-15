import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260714153000_internal_invoices_bill_to_identity.sql"),
  "utf8",
).toLowerCase();

describe("internal invoice Bill To identity foundation", () => {
  it("freezes payer type and contractor identity on the invoice", () => {
    expect(migration).toContain("add column if not exists bill_to_kind text");
    expect(migration).toContain("add column if not exists bill_to_contractor_id uuid");
    expect(migration).toContain("bill_to_kind in ('customer', 'contractor', 'other')");
    expect(migration).toContain("bill_to_kind = 'contractor' and bill_to_contractor_id is not null");
  });

  it("does not guess payer identity for historical invoices", () => {
    expect(migration).not.toContain("update public.internal_invoices");
  });
});
