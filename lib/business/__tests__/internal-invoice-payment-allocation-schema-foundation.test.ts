import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260526130000_internal_invoice_payment_allocations_foundation.sql",
);

const sql = readFileSync(migrationPath, "utf8");

describe("internal invoice payment allocation schema foundation migration", () => {
  it("adds additive allocation table without mutating existing payment truth table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.internal_invoice_payment_allocations");
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.internal_invoice_payments\s+DROP/i);
    expect(sql).not.toMatch(/DROP TABLE\s+(IF EXISTS\s+)?public\.internal_invoice_payments/i);
  });

  it("locks first-posture columns and excludes deferred target fields", () => {
    expect(sql).toContain("source_internal_invoice_payment_id");
    expect(sql).toContain("target_invoice_id");
    expect(sql).not.toContain("target_service_plan_billing_period_id");
    expect(sql).not.toMatch(/customer_credit/i);
    expect(sql).not.toContain("counts_toward_collected_totals");
  });

  it("enforces allowed statuses and one allocation per source payment", () => {
    expect(sql).toContain("CHECK (allocation_status IN ('active', 'inactive', 'reversed', 'voided'))");
    expect(sql).toContain("UNIQUE (source_internal_invoice_payment_id)");
  });

  it("adds required foreign keys and scoped indexes", () => {
    expect(sql).toContain("REFERENCES public.internal_invoice_payments(id)");
    expect(sql).toContain("REFERENCES public.internal_invoices(id)");
    expect(sql).toContain("internal_invoice_payment_allocations_owner_status_idx");
    expect(sql).toContain("internal_invoice_payment_allocations_owner_invoice_status_idx");
    expect(sql).toContain("internal_invoice_payment_allocations_target_invoice_idx");
    expect(sql).toContain("internal_invoice_payment_allocations_active_invoice_idx");
  });

  it("enables account-scoped RLS policies with no delete policy", () => {
    expect(sql).toContain("ALTER TABLE public.internal_invoice_payment_allocations ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("CREATE POLICY internal_invoice_payment_allocations_select_account_scope");
    expect(sql).toContain("CREATE POLICY internal_invoice_payment_allocations_insert_account_scope");
    expect(sql).toContain("CREATE POLICY internal_invoice_payment_allocations_update_account_scope");
    expect(sql).not.toContain("CREATE POLICY internal_invoice_payment_allocations_delete_account_scope");
  });

  it("adds strong source-target account consistency enforcement trigger", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.assert_internal_invoice_payment_allocation_scope()");
    expect(sql).toContain("target invoice must match source payment invoice in V1 posture");
    expect(sql).toContain("CREATE TRIGGER internal_invoice_payment_allocations_assert_scope");
  });
});
