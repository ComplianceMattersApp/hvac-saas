import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260716173000_qbo_oauth_attempts.sql"),
  "utf8",
);

describe("QBO OAuth attempt migration", () => {
  it("registers and atomically consumes hashed single-use states", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.qbo_oauth_attempts/i);
    expect(sql).toMatch(/state_hash text NOT NULL UNIQUE/i);
    expect(sql).toMatch(/FUNCTION public\.register_qbo_oauth_attempt/i);
    expect(sql).toMatch(/FUNCTION public\.consume_qbo_oauth_attempt/i);
    expect(sql).toMatch(/consumed_at IS NULL/i);
    expect(sql).toMatch(/GET DIAGNOSTICS affected_rows = ROW_COUNT/i);
  });
});
