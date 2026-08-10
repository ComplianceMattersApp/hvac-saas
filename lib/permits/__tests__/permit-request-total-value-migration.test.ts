import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("permit request total value migration", () => {
  it("adds a nullable, non-negative cents column", () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/20260809210000_permit_request_total_value.sql"),
      "utf8",
    );

    expect(sql).toContain("ADD COLUMN IF NOT EXISTS total_value_cents bigint NULL");
    expect(sql).toContain("total_value_cents IS NULL OR total_value_cents >= 0");
  });
});
