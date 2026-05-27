import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260526150000_maintenance_agreement_billing_periods_foundation.sql",
);

const sql = readFileSync(migrationPath, "utf8");

describe("service plan billing period schema foundation migration", () => {
  it("creates additive maintenance_agreement_billing_periods table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.maintenance_agreement_billing_periods");
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.internal_invoices\s+ADD COLUMN/i);
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.internal_invoice_payments\s+ADD COLUMN/i);
  });

  it("includes required first-posture columns", () => {
    expect(sql).toContain("id                           uuid");
    expect(sql).toContain("account_owner_user_id        uuid");
    expect(sql).toContain("maintenance_agreement_id     uuid");
    expect(sql).toContain("customer_id                  uuid");
    expect(sql).toContain("coverage_start_date          date");
    expect(sql).toContain("coverage_end_date            date");
    expect(sql).toContain("billing_due_date             date");
    expect(sql).toContain("billing_cadence              text");
    expect(sql).toContain("amount_due_cents             integer");
    expect(sql).toContain("currency                     text        NOT NULL DEFAULT 'usd'");
    expect(sql).toContain("billing_posture              text");
    expect(sql).toContain("billing_period_status        text");
    expect(sql).toContain("internal_invoice_id          uuid");
    expect(sql).toContain("external_reference           text");
    expect(sql).toContain("external_notes               text");
    expect(sql).toContain("status_reason                text");
    expect(sql).toContain("created_at                   timestamptz");
    expect(sql).toContain("created_by_user_id           uuid");
    expect(sql).toContain("updated_at                   timestamptz");
    expect(sql).toContain("updated_by_user_id           uuid");
  });

  it("does not introduce forbidden fields", () => {
    expect(sql).not.toMatch(/source_internal_invoice_payment_id/i);
    expect(sql).not.toMatch(/allocation_status/i);
    expect(sql).not.toMatch(/target_invoice_id/i);
    expect(sql).not.toMatch(/target_service_plan_billing_period_id/i);
    expect(sql).not.toMatch(/maintenance_agreement_visit/i);
    expect(sql).not.toMatch(/counts_toward_visit_balance/i);
    expect(sql).not.toMatch(/next_due_date/i);
    expect(sql).not.toMatch(/stripe/i);
    expect(sql).not.toMatch(/subscription/i);
    expect(sql).not.toMatch(/qbo/i);
  });

  it("enforces lifecycle status and billing posture checks", () => {
    expect(sql).toContain("maintenance_agreement_billing_periods_status_valid_chk");
    expect(sql).toContain("'draft'");
    expect(sql).toContain("'pending_billing'");
    expect(sql).toContain("'invoice_linked'");
    expect(sql).toContain("'externally_billed'");
    expect(sql).toContain("'no_charge'");
    expect(sql).toContain("'waived'");
    expect(sql).toContain("'not_billed'");
    expect(sql).toContain("'cancelled'");
    expect(sql).toContain("maintenance_agreement_billing_periods_posture_valid_chk");
    expect(sql).toContain("'internal_invoice'");
    expect(sql).toContain("'external_off_platform'");
    expect(sql).toContain("'manual'");
    expect(sql).toContain("'not_billed_through_compliance_matters'");
  });

  it("locks date and amount constraints for first posture", () => {
    expect(sql).toContain("CHECK (coverage_end_date >= coverage_start_date)");
    expect(sql).toContain("CHECK (amount_due_cents >= 0)");
    expect(sql).toContain("CHECK (currency ~ '^[a-z]{3}$')");
  });

  it("enforces unique period per agreement window and optional unique invoice claim", () => {
    expect(sql).toContain("maintenance_agreement_billing_periods_unique_coverage_window");
    expect(sql).toContain("UNIQUE (");
    expect(sql).toContain("maintenance_agreement_id,");
    expect(sql).toContain("coverage_start_date,");
    expect(sql).toContain("coverage_end_date");
    expect(sql).toContain("ma_billing_periods_internal_invoice_unique_idx");
    expect(sql).toContain("WHERE internal_invoice_id IS NOT NULL");
  });

  it("includes required maintenance agreement and internal invoice foreign keys", () => {
    expect(sql).toContain("maintenance_agreement_id     uuid        NOT NULL REFERENCES public.maintenance_agreements(id)");
    expect(sql).toContain("internal_invoice_id          uuid        NULL REFERENCES public.internal_invoices(id)");
  });

  it("enables account-scoped RLS with no delete policy", () => {
    expect(sql).toContain("ALTER TABLE public.maintenance_agreement_billing_periods ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("CREATE POLICY maintenance_agreement_billing_periods_select_account_scope");
    expect(sql).toContain("CREATE POLICY maintenance_agreement_billing_periods_insert_account_scope");
    expect(sql).toContain("CREATE POLICY maintenance_agreement_billing_periods_update_account_scope");
    expect(sql).not.toContain("CREATE POLICY maintenance_agreement_billing_periods_delete_account_scope");
  });

  it("adds same-account integrity trigger/function", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.assert_maintenance_agreement_billing_period_scope()");
    expect(sql).toContain("agreement/account mismatch");
    expect(sql).toContain("internal invoice/account mismatch");
    expect(sql).toContain("CREATE TRIGGER maintenance_agreement_billing_periods_assert_scope");
  });
});