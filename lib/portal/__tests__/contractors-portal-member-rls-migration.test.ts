import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260618160000_contractors_portal_member_select_policy.sql",
);

const sql = readFileSync(migrationPath, "utf8");

describe("contractors portal member RLS migration", () => {
  it("adds a narrow SELECT policy for active contractor members", () => {
    expect(sql).toContain("CREATE POLICY contractors_portal_member_select_own_active");
    expect(sql).toContain("ON public.contractors");
    expect(sql).toContain("FOR SELECT");
    expect(sql).toContain("TO authenticated");
    expect(sql).toContain("lifecycle_state = 'active'");
    expect(sql).toContain("public.current_user_has_contractor_membership(id)");
  });

  it("scopes membership through contractor_users and auth.uid", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.current_user_has_contractor_membership");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO 'public'");
    expect(sql).toContain("FROM public.contractor_users cu");
    expect(sql).toContain("cu.contractor_id = p_contractor_id");
    expect(sql).toContain("cu.user_id = auth.uid()");
    expect(sql).toContain("auth.uid() IS NOT NULL");
  });

  it("does not add portal write access or unrelated domain changes", () => {
    expect(sql).not.toMatch(/CREATE POLICY\s+contractors_portal_.*FOR INSERT/i);
    expect(sql).not.toMatch(/CREATE POLICY\s+contractors_portal_.*FOR UPDATE/i);
    expect(sql).not.toMatch(/CREATE POLICY\s+contractors_portal_.*FOR DELETE/i);
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.internal_users/i);
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.internal_invoices/i);
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.internal_invoice/i);
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.jobs/i);
    expect(sql).not.toMatch(/stripe|billing|payment|invoice|ecc/i);
  });
});
