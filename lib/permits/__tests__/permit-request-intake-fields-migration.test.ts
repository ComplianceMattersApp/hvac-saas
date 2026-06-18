import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260616160000_permit_request_intake_fields.sql",
);

function migrationSql() {
  return readFileSync(MIGRATION_PATH, "utf8");
}

describe("permit request intake fields migration", () => {
  it("adds nullable permit intake snapshot fields without job/customer creation", () => {
    const sql = migrationSql();

    expect(sql).toContain("ADD COLUMN IF NOT EXISTS request_label text NULL");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS customer_first_name_snapshot text NULL");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS customer_last_name_snapshot text NULL");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS service_address_text_snapshot text NULL");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS internal_intake_note text NULL");
    expect(sql.toLowerCase()).not.toContain("alter table public.jobs");
    expect(sql.toLowerCase()).not.toContain("insert into public.jobs");
  });

  it("allows durable intake update events without adding route-completion behavior", () => {
    const sql = migrationSql();

    expect(sql).toContain("'permit_request_intake_updated'");
    expect(sql.toLowerCase()).not.toContain("job_events");
    expect(sql.toLowerCase()).not.toContain("ops_status");
    expect(sql.toLowerCase()).not.toContain("ecc");
    expect(sql.toLowerCase()).not.toContain("stripe");
  });
});
