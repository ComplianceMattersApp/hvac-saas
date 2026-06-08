import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repairMigrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260608180000_repair_maintenance_agreement_templates_schema_drift.sql",
);

const templateFoundationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260530150000_maintenance_agreement_templates_slice_a_foundation.sql",
);

const provenanceFoundationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260530160000_maintenance_agreement_template_provenance_slice_e.sql",
);

const lockingFoundationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260530173000_maintenance_agreement_template_locking_slice_l1.sql",
);

const repairSql = readFileSync(repairMigrationPath, "utf8");
const templateFoundationSql = readFileSync(templateFoundationPath, "utf8");
const provenanceFoundationSql = readFileSync(provenanceFoundationPath, "utf8");
const lockingFoundationSql = readFileSync(lockingFoundationPath, "utf8");

describe("maintenance agreement template schema drift repair migration", () => {
  it("restores only template/provenance/locking schema without data or billing mutations", () => {
    expect(repairSql).toContain("CREATE TABLE IF NOT EXISTS public.maintenance_agreement_templates");
    expect(repairSql).toContain("ALTER TABLE public.maintenance_agreements");

    expect(repairSql).not.toMatch(/INSERT\s+INTO\s+public\./i);
    expect(repairSql).not.toMatch(/UPDATE\s+public\./i);
    expect(repairSql).not.toMatch(/DELETE\s+FROM\s+public\./i);
    expect(repairSql).not.toMatch(/ALTER TABLE\s+public\.internal_invoice/i);
    expect(repairSql).not.toMatch(/ALTER TABLE\s+public\.maintenance_agreement_billing_period/i);
    expect(repairSql).not.toMatch(/ALTER TABLE\s+public\.maintenance_agreement_visits/i);
    expect(repairSql).not.toMatch(/stripe|checkout_session|payment_intent|payment_method/i);
  });

  it("keeps the template table, indexes, trigger, and RLS policy contract aligned", () => {
    const requiredTokens = [
      "template_name                text        NOT NULL",
      "agreement_type               text        NOT NULL",
      "frequency                    text        NOT NULL",
      "default_visit_scope_items    jsonb       NOT NULL DEFAULT '[]'::jsonb",
      "lifecycle_status             text        NOT NULL DEFAULT 'active'",
      "maintenance_agreement_templates_name_not_blank_chk",
      "maintenance_agreement_templates_type_valid_chk",
      "maintenance_agreement_templates_frequency_valid_chk",
      "maintenance_agreement_templates_lifecycle_status_valid_chk",
      "maintenance_agreement_templates_visit_scope_items_array_chk",
      "maintenance_agreement_templates_owner_name_unique_idx",
      "maintenance_agreement_templates_owner_status_idx",
      "CREATE TRIGGER maintenance_agreement_templates_set_updated_at",
      "ALTER TABLE public.maintenance_agreement_templates ENABLE ROW LEVEL SECURITY",
      "CREATE POLICY maintenance_agreement_templates_select_account_scope",
      "CREATE POLICY maintenance_agreement_templates_insert_account_scope",
      "CREATE POLICY maintenance_agreement_templates_update_account_scope",
    ];

    for (const token of requiredTokens) {
      expect(templateFoundationSql).toContain(token);
      expect(repairSql).toContain(token);
    }

    expect(repairSql).not.toContain("CREATE POLICY maintenance_agreement_templates_delete_account_scope");
    expect(repairSql).not.toMatch(/FOR DELETE/i);
  });

  it("keeps the provenance column and constraint contract aligned", () => {
    const requiredTokens = [
      "ADD COLUMN IF NOT EXISTS source_template_id uuid",
      "REFERENCES public.maintenance_agreement_templates(id) ON DELETE SET NULL",
      "ADD COLUMN IF NOT EXISTS source_template_name_snapshot text NULL",
      "ADD COLUMN IF NOT EXISTS source_template_lifecycle_status_snapshot text NULL",
      "ADD COLUMN IF NOT EXISTS source_template_applied_at timestamptz NULL",
      "ADD COLUMN IF NOT EXISTS source_template_snapshot jsonb NULL",
      "maintenance_agreements_source_template_name_snapshot_not_blank_chk",
      "maintenance_agreements_source_template_lifecycle_status_snapshot_valid_chk",
      "source_template_lifecycle_status_snapshot IN ('active', 'archived')",
      "maintenance_agreements_source_template_snapshot_object_chk",
      "jsonb_typeof(source_template_snapshot) = 'object'",
      "maintenance_agreements_source_template_idx",
      "WHERE source_template_id IS NOT NULL",
    ];

    for (const token of requiredTokens) {
      expect(provenanceFoundationSql).toContain(token);
      expect(repairSql).toContain(token);
    }
  });

  it("keeps template and agreement locking metadata aligned", () => {
    const requiredTokens = [
      "ADD COLUMN IF NOT EXISTS locked_field_keys jsonb NOT NULL DEFAULT",
      "ADD COLUMN IF NOT EXISTS lock_policy_version integer NOT NULL DEFAULT 1",
      "maintenance_agreement_templates_locked_field_keys_array_chk",
      "maintenance_agreement_templates_lock_policy_version_positive_chk",
      "ADD COLUMN IF NOT EXISTS template_locked_field_keys jsonb NULL",
      "ADD COLUMN IF NOT EXISTS template_lock_policy_version integer NULL",
      "ADD COLUMN IF NOT EXISTS template_lock_snapshot_applied_at timestamptz NULL",
      "maintenance_agreements_template_locked_field_keys_array_chk",
      "maintenance_agreements_template_lock_policy_version_positive_chk",
    ];

    for (const token of requiredTokens) {
      expect(lockingFoundationSql).toContain(token);
      expect(repairSql).toContain(token);
    }
  });
});
