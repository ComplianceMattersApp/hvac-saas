import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repairMigrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260608120000_repair_field_billing_schema_drift.sql",
);

const reportFoundationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260605183000_field_payment_collection_reports_foundation.sql",
);

const capabilityFoundationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260606100000_internal_user_access_capabilities_foundation.sql",
);

const repairSql = readFileSync(repairMigrationPath, "utf8");
const reportFoundationSql = readFileSync(reportFoundationPath, "utf8");
const capabilityFoundationSql = readFileSync(capabilityFoundationPath, "utf8");

describe("field billing schema drift repair migration", () => {
  it("restores both missing foundation tables without editing payment truth", () => {
    expect(repairSql).toContain("CREATE TABLE IF NOT EXISTS public.field_payment_collection_reports");
    expect(repairSql).toContain("CREATE TABLE IF NOT EXISTS public.internal_user_access_capabilities");
    expect(repairSql).not.toMatch(/INSERT\s+INTO\s+public\./i);
    expect(repairSql).not.toMatch(/UPDATE\s+public\.internal_invoice/i);
    expect(repairSql).not.toMatch(/ALTER TABLE\s+public\.internal_invoices/i);
    expect(repairSql).not.toMatch(/ALTER TABLE\s+public\.internal_invoice_payments/i);
    expect(repairSql).not.toMatch(/tenant_stripe|stripe_checkout|stripe_payment|stripe_charge|stripe_event/i);
  });

  it("keeps the field payment collection report table contract aligned with the foundation migration", () => {
    const requiredReportTokens = [
      "payment_method text NOT NULL",
      "amount_cents integer NOT NULL",
      "currency text NOT NULL DEFAULT 'usd'",
      "CHECK (payment_method IN ('check', 'cash', 'other'))",
      "CHECK (status IN ('reported', 'under_review', 'needs_correction', 'verified', 'rejected', 'voided', 'corrected'))",
      "field_payment_collection_reports_verified_state_chk",
      "field_payment_collection_reports_rejected_state_chk",
      "field_payment_collection_reports_voided_state_chk",
      "field_payment_collection_reports_corrected_state_chk",
      "CREATE OR REPLACE FUNCTION public.assert_field_payment_collection_report_scope()",
      "CREATE TRIGGER field_payment_collection_reports_assert_scope",
      "ALTER TABLE public.field_payment_collection_reports ENABLE ROW LEVEL SECURITY",
      "CREATE POLICY field_payment_collection_reports_select_account_scope",
      "field_payment_collection_reports_owner_status_idx",
      "field_payment_collection_reports_owner_invoice_status_idx",
      "field_payment_collection_reports_owner_job_status_idx",
      "field_payment_collection_reports_owner_reporter_idx",
      "field_payment_collection_reports_final_payment_idx",
      "field_payment_collection_reports_corrected_from_idx",
    ];

    for (const token of requiredReportTokens) {
      expect(reportFoundationSql).toContain(token);
      expect(repairSql).toContain(token);
    }

    expect(repairSql).not.toContain("CREATE POLICY field_payment_collection_reports_insert_account_scope");
    expect(repairSql).not.toContain("CREATE POLICY field_payment_collection_reports_update_account_scope");
    expect(repairSql).not.toContain("CREATE POLICY field_payment_collection_reports_delete_account_scope");
  });

  it("keeps the internal user access capability contract aligned with the foundation migration", () => {
    const requiredCapabilityTokens = [
      "UNIQUE (account_owner_user_id, internal_user_id, capability_key)",
      "internal_user_access_capabilities_key_valid_chk",
      "'field_billing_enabled'",
      "'can_view_field_billing_summary'",
      "'can_collect_field_payment'",
      "'can_report_non_card_collection'",
      "'can_collect_card_payment'",
      "'can_verify_non_card_collection'",
      "internal_user_access_capabilities_account_user_idx",
      "internal_user_access_capabilities_enabled_key_idx",
      "CREATE TRIGGER internal_user_access_capabilities_set_updated_at",
      "EXECUTE FUNCTION public.set_updated_at()",
      "CREATE OR REPLACE FUNCTION public.assert_internal_user_access_capability_scope()",
      "CREATE TRIGGER internal_user_access_capabilities_assert_scope",
      "ALTER TABLE public.internal_user_access_capabilities ENABLE ROW LEVEL SECURITY",
      "CREATE POLICY internal_user_access_capabilities_select_account_scope",
      "CREATE POLICY internal_user_access_capabilities_insert_admin_owner_scope",
      "CREATE POLICY internal_user_access_capabilities_update_admin_owner_scope",
      "public.current_internal_account_owner_id()",
      "updated_by_user_id = auth.uid()",
    ];

    for (const token of requiredCapabilityTokens) {
      expect(capabilityFoundationSql).toContain(token);
      expect(repairSql).toContain(token);
    }

    expect(repairSql).not.toMatch(/CREATE POLICY\s+internal_user_access_capabilities_delete/i);
    expect(repairSql).not.toMatch(/FOR DELETE/i);
    expect(repairSql).not.toContain("'can_record_manual_payment'");
    expect(repairSql).not.toContain("'can_export_financial_data'");
  });
});
