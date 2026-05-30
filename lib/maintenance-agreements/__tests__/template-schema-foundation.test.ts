import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260530150000_maintenance_agreement_templates_slice_a_foundation.sql",
);

const sql = readFileSync(migrationPath, "utf8");
const sqlWithoutComments = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

describe("service plan template schema foundation migration", () => {
  it("creates additive maintenance_agreement_templates table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.maintenance_agreement_templates");
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.maintenance_agreements\s+ADD COLUMN/i);
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.maintenance_agreement_billing_periods\s+ADD COLUMN/i);
  });

  it("includes required template fields", () => {
    expect(sql).toContain("id                           uuid");
    expect(sql).toContain("account_owner_user_id        uuid");
    expect(sql).toContain("template_name                text");
    expect(sql).toContain("agreement_type               text");
    expect(sql).toContain("frequency                    text");
    expect(sql).toContain("default_visit_scope_summary  text");
    expect(sql).toContain("default_visit_scope_items    jsonb");
    expect(sql).toContain("internal_notes_default       text");
    expect(sql).toContain("lifecycle_status             text");
    expect(sql).toContain("created_by_user_id           uuid");
    expect(sql).toContain("updated_by_user_id           uuid");
    expect(sql).toContain("created_at                   timestamptz");
    expect(sql).toContain("updated_at                   timestamptz");
  });

  it("enforces lifecycle, type, frequency, and visit scope validation", () => {
    expect(sql).toContain("maintenance_agreement_templates_type_valid_chk");
    expect(sql).toContain("maintenance_agreement_templates_frequency_valid_chk");
    expect(sql).toContain("maintenance_agreement_templates_lifecycle_status_valid_chk");
    expect(sql).toContain("maintenance_agreement_templates_visit_scope_items_array_chk");
    expect(sql).toContain("'active'");
    expect(sql).toContain("'archived'");
  });

  it("adds owner/name uniqueness and status index", () => {
    expect(sql).toContain("maintenance_agreement_templates_owner_name_unique_idx");
    expect(sql).toContain("lower(btrim(template_name))");
    expect(sql).toContain("maintenance_agreement_templates_owner_status_idx");
  });

  it("enables account-scoped RLS with no delete policy", () => {
    expect(sql).toContain("ALTER TABLE public.maintenance_agreement_templates ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("CREATE POLICY maintenance_agreement_templates_select_account_scope");
    expect(sql).toContain("CREATE POLICY maintenance_agreement_templates_insert_account_scope");
    expect(sql).toContain("CREATE POLICY maintenance_agreement_templates_update_account_scope");
    expect(sql).not.toContain("CREATE POLICY maintenance_agreement_templates_delete_account_scope");
    expect(sql).toContain("actor.user_id = auth.uid()");
    expect(sql).toContain("actor.is_active = true");
    expect(sql).not.toMatch(/TO\s+anon/i);
  });

  it("does not introduce out-of-scope billing, payment, or automation behavior", () => {
    expect(sqlWithoutComments).not.toMatch(/maintenance_agreement_billing_period/i);
    expect(sqlWithoutComments).not.toMatch(/internal_invoice/i);
    expect(sqlWithoutComments).not.toMatch(/internal_invoice_payment/i);
    expect(sqlWithoutComments).not.toMatch(/autopay/i);
    expect(sqlWithoutComments).not.toMatch(/visit_count/i);
    expect(sqlWithoutComments).not.toMatch(/next_due_date/i);
    expect(sqlWithoutComments).not.toMatch(/job_events/i);
    expect(sqlWithoutComments).not.toMatch(/recurren/i);
    expect(sqlWithoutComments).not.toMatch(/sms/i);
    expect(sqlWithoutComments).not.toMatch(/portal/i);
    expect(sqlWithoutComments).not.toMatch(/qbo/i);
  });
});
