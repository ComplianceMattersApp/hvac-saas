import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repairMigrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260608143000_repair_internal_invoices_supplemental_schema_drift.sql",
);

const foundationMigrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260605223000_internal_invoices_supplemental_foundation.sql",
);

const repairSql = readFileSync(repairMigrationPath, "utf8");
const foundationSql = readFileSync(foundationMigrationPath, "utf8");

describe("internal invoice supplemental schema drift repair migration", () => {
  it("restores only the supplemental invoice schema contract without payment data mutation", () => {
    expect(repairSql).toContain("alter table public.internal_invoices");
    expect(repairSql).toContain("add column if not exists invoice_kind text not null default 'primary'");
    expect(repairSql).toContain("add column if not exists original_internal_invoice_id uuid null references public.internal_invoices(id)");
    expect(repairSql).toContain("add column if not exists supplemental_reason text null");

    expect(repairSql).not.toMatch(/INSERT\s+INTO\s+public\./i);
    expect(repairSql).not.toMatch(/UPDATE\s+public\./i);
    expect(repairSql).not.toMatch(/DELETE\s+FROM\s+public\./i);
    expect(repairSql).not.toMatch(/ALTER TABLE\s+public\.internal_invoice_payments/i);
    expect(repairSql).not.toMatch(/ALTER TABLE\s+public\.internal_invoice_payment_allocations/i);
    expect(repairSql).not.toMatch(/DROP TABLE\s+(IF EXISTS\s+)?public\./i);
  });

  it("keeps the intended supplemental invoice constraints and indexes aligned", () => {
    const requiredTokens = [
      "internal_invoices_kind_valid_chk",
      "check (invoice_kind in ('primary', 'supplemental'))",
      "internal_invoices_primary_has_no_original_chk",
      "check (invoice_kind <> 'primary' or original_internal_invoice_id is null)",
      "internal_invoices_supplemental_reason_trimmed_chk",
      "check (supplemental_reason is null or length(btrim(supplemental_reason)) > 0)",
      "drop index if exists public.internal_invoices_job_unique_idx",
      "drop index if exists public.internal_invoices_job_active_unique_idx",
      "internal_invoices_job_active_primary_unique_idx",
      "where status <> 'void' and invoice_kind = 'primary'",
      "internal_invoices_original_invoice_idx",
      "where original_internal_invoice_id is not null",
      "internal_invoices_owner_job_kind_status_idx",
    ];

    for (const token of requiredTokens) {
      expect(foundationSql).toContain(token);
      expect(repairSql).toContain(token);
    }
  });

  it("keeps the supplemental invoice scope function and trigger aligned", () => {
    const requiredTokens = [
      "create or replace function public.assert_internal_invoice_supplemental_scope()",
      "internal_invoices.original_internal_invoice_id cannot self-reference",
      "only supplemental invoices may reference an original invoice",
      "internal_invoices.original_internal_invoice_id must reference an existing internal invoice",
      "supplemental invoice must match original invoice account owner",
      "supplemental invoice must match original invoice job",
      "supplemental invoice must reference a primary invoice in first posture",
      "supplemental invoice original reference must be an issued invoice",
      "supplemental invoice must match original invoice customer when both are present",
      "supplemental invoice must match original invoice service case when both are present",
      "drop trigger if exists trg_internal_invoices_zz_assert_supplemental_scope on public.internal_invoices",
      "create trigger trg_internal_invoices_zz_assert_supplemental_scope",
    ];

    for (const token of requiredTokens) {
      expect(foundationSql).toContain(token);
      expect(repairSql).toContain(token);
    }
  });
});
