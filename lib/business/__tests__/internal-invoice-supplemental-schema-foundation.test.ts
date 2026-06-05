import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260605223000_internal_invoices_supplemental_foundation.sql",
);

const sql = readFileSync(migrationPath, "utf8");

describe("internal invoice supplemental schema foundation migration", () => {
  it("adds additive supplemental invoice columns without mutating payment truth tables", () => {
    expect(sql).toContain("add column if not exists invoice_kind text not null default 'primary'");
    expect(sql).toContain("add column if not exists original_internal_invoice_id uuid null references public.internal_invoices(id)");
    expect(sql).toContain("add column if not exists supplemental_reason text null");
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.internal_invoice_payments\s+DROP/i);
    expect(sql).not.toMatch(/DROP TABLE\s+(IF EXISTS\s+)?public\.internal_invoice_payments/i);
  });

  it("keeps primary invoices as the default posture for existing rows", () => {
    expect(sql).toContain("default 'primary'");
    expect(sql).toContain("check (invoice_kind in ('primary', 'supplemental'))");
    expect(sql).toContain("check (invoice_kind <> 'primary' or original_internal_invoice_id is null)");
  });

  it("allows supplemental invoices to reference original invoices while preserving independent identity", () => {
    expect(sql).toContain("references public.internal_invoices(id)");
    expect(sql).toContain("internal_invoices_original_invoice_idx");
    expect(sql).toContain("internal_invoices_owner_job_kind_status_idx");
  });

  it("updates the active invoice uniqueness rule to preserve one active primary invoice per job", () => {
    expect(sql).toContain("internal_invoices_job_active_primary_unique_idx");
    expect(sql).toContain("where status <> 'void' and invoice_kind = 'primary'");
  });

  it("adds trigger-based cross-account and same-job supplemental scope enforcement", () => {
    expect(sql).toContain("create or replace function public.assert_internal_invoice_supplemental_scope()");
    expect(sql).toContain("supplemental invoice must match original invoice account owner");
    expect(sql).toContain("supplemental invoice must match original invoice job");
    expect(sql).toContain("supplemental invoice must match original invoice customer when both are present");
    expect(sql).toContain("supplemental invoice must match original invoice service case when both are present");
    expect(sql).toContain("supplemental invoice must reference a primary invoice in first posture");
    expect(sql).toContain("supplemental invoice original reference must be an issued invoice");
    expect(sql).toContain("trg_internal_invoices_zz_assert_supplemental_scope");
  });
});