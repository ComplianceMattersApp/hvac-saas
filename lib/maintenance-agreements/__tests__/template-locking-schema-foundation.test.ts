import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260530173000_maintenance_agreement_template_locking_slice_l1.sql",
);

const sql = readFileSync(migrationPath, "utf8");
const sqlWithoutComments = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

describe("service plan template locking schema foundation migration", () => {
  it("adds template lock metadata columns with safe defaults", () => {
    expect(sql).toContain("ALTER TABLE public.maintenance_agreement_templates");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS locked_field_keys jsonb NOT NULL DEFAULT");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS lock_policy_version integer NOT NULL DEFAULT 1");
    expect(sql).toContain("maintenance_agreement_templates_locked_field_keys_array_chk");
    expect(sql).toContain("maintenance_agreement_templates_lock_policy_version_positive_chk");
  });

  it("adds agreement lock snapshot columns without enforcing behavior", () => {
    expect(sql).toContain("ALTER TABLE public.maintenance_agreements");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS template_locked_field_keys jsonb NULL");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS template_lock_policy_version integer NULL");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS template_lock_snapshot_applied_at timestamptz NULL");
    expect(sql).toContain("maintenance_agreements_template_locked_field_keys_array_chk");
    expect(sql).toContain("maintenance_agreements_template_lock_policy_version_positive_chk");
  });

  it("stays additive and out of billing/payment/automation scope", () => {
    expect(sqlWithoutComments).not.toMatch(/CREATE TABLE\s+public\.maintenance_agreements/i);
    expect(sqlWithoutComments).not.toMatch(/maintenance_agreement_billing_period/i);
    expect(sqlWithoutComments).not.toMatch(/internal_invoice/i);
    expect(sqlWithoutComments).not.toMatch(/internal_invoice_payment/i);
    expect(sqlWithoutComments).not.toMatch(/autopay/i);
    expect(sqlWithoutComments).not.toMatch(/subscription/i);
    expect(sqlWithoutComments).not.toMatch(/job_events/i);
    expect(sqlWithoutComments).not.toMatch(/portal/i);
    expect(sqlWithoutComments).not.toMatch(/qbo/i);
  });
});
