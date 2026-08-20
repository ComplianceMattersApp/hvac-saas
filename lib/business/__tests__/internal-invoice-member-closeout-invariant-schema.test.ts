import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260820120000_internal_invoice_member_closeout_invariant.sql"),
  "utf8",
).toLowerCase();

describe("issued internal invoice member closeout invariant", () => {
  it("projects issue truth through canonical invoice membership", () => {
    expect(migration).toContain("reconcile_internal_invoice_members_on_issue");
    expect(migration).toContain("from public.internal_invoice_jobs as membership");
    expect(migration).toContain("membership.internal_invoice_id = new.id");
    expect(migration).toContain("invoice_complete = true");
    expect(migration).toContain("invoice_number = new.invoice_number");
  });

  it("closes only satisfied derived closeout states", () => {
    expect(migration).toContain("('paperwork_required', 'invoice_required')");
    expect(migration).toContain("coalesce(job.field_complete, false) = true");
    expect(migration).toContain("coalesce(job.certs_complete, false) = true");
    expect(migration).not.toMatch(/ops_status\s*=\s*'closed'\s*where/);
  });

  it("repairs historical issued members and records an auditable event", () => {
    expect(migration).toContain("with repair_candidates as materialized");
    expect(migration).toContain("invoice.status = 'issued'");
    expect(migration).toContain("issued consolidated invoice closeout projection repaired");
    expect(migration).toContain("issued_invoice_member_closeout_projection");
  });
});
