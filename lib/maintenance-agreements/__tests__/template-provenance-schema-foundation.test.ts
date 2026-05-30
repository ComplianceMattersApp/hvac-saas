import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260530160000_maintenance_agreement_template_provenance_slice_e.sql",
);

const sql = readFileSync(migrationPath, "utf8");
const sqlWithoutComments = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

describe("service plan template provenance schema migration", () => {
  it("adds optional provenance columns to maintenance_agreements", () => {
    expect(sql).toContain("ALTER TABLE public.maintenance_agreements");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS source_template_id uuid");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS source_template_name_snapshot text");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS source_template_lifecycle_status_snapshot text");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS source_template_applied_at timestamptz");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS source_template_snapshot jsonb");
    expect(sql).toContain("REFERENCES public.maintenance_agreement_templates(id) ON DELETE SET NULL");
  });

  it("keeps provenance nullable and adds shape constraints", () => {
    expect(sql).toContain("maintenance_agreements_source_template_name_snapshot_not_blank_chk");
    expect(sql).toContain("maintenance_agreements_source_template_lifecycle_status_snapshot_valid_chk");
    expect(sql).toContain("maintenance_agreements_source_template_snapshot_object_chk");
    expect(sql).toContain("source_template_lifecycle_status_snapshot IN ('active', 'archived')");
    expect(sql).toContain("jsonb_typeof(source_template_snapshot) = 'object'");
  });

  it("adds scoped provenance index and no automation side effects", () => {
    expect(sql).toContain("maintenance_agreements_source_template_idx");
    expect(sql).toContain("WHERE source_template_id IS NOT NULL");
    expect(sqlWithoutComments).not.toMatch(/maintenance_agreement_billing_period/i);
    expect(sqlWithoutComments).not.toMatch(/internal_invoice/i);
    expect(sqlWithoutComments).not.toMatch(/internal_invoice_payment/i);
    expect(sqlWithoutComments).not.toMatch(/job_events/i);
    expect(sqlWithoutComments).not.toMatch(/autopay/i);
    expect(sqlWithoutComments).not.toMatch(/subscription/i);
    expect(sqlWithoutComments).not.toMatch(/recurren/i);
    expect(sqlWithoutComments).not.toMatch(/sms/i);
    expect(sqlWithoutComments).not.toMatch(/portal/i);
    expect(sqlWithoutComments).not.toMatch(/qbo/i);
  });
});
