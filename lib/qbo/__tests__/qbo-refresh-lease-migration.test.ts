import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260714233000_qbo_refresh_lease.sql"),
  "utf8",
);

describe("QBO refresh lease migration", () => {
  it("adds an expiring database lease and atomic acquisition function", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS refresh_lease_id uuid/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS refresh_lease_expires_at timestamptz/i);
    expect(sql).toMatch(/FUNCTION public\.acquire_qbo_refresh_lease/i);
    expect(sql).toMatch(/refresh_lease_expires_at <= timezone\('utc', now\(\)\)/i);
    expect(sql).toMatch(/GET DIAGNOSTICS affected_rows = ROW_COUNT/i);
  });

  it("scopes lease acquisition to the current tenant or service role", () => {
    expect(sql).toMatch(/auth\.role\(\) <> 'service_role'/i);
    expect(sql).toMatch(/current_internal_account_owner_id\(\)[\s\S]*p_account_owner_user_id/i);
    expect(sql).toMatch(/GRANT EXECUTE.*TO authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE.*TO service_role/i);
  });
});
