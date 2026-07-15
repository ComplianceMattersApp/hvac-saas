import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/20260715120000_permit_request_not_needed.sql"),
  "utf8",
);

describe("permit request not-needed migration", () => {
  it("adds a terminal not-needed status and auditable transition without changing the active queue", () => {
    expect(sql).toContain("'not_needed'");
    expect(sql).toContain("'permit_request_not_needed'");
    expect(sql).toContain("status NOT IN ('permit_created', 'not_needed')");
    expect(sql).not.toContain("DELETE FROM public.permit_requests");
    expect(sql).not.toContain("DROP TABLE");
  });
});
