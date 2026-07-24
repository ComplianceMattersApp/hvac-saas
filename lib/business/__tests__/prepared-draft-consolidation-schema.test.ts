import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("prepared draft consolidation migration", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260723123000_consume_prepared_drafts_in_consolidation.sql"),
    "utf8",
  ).toLowerCase();

  it("only consumes single-job primary drafts and delegates creation atomically", () => {
    expect(sql).toContain("invoice.status <> 'draft'");
    expect(sql).toContain("source_membership.internal_invoice_id = invoice.id");
    expect(sql).toContain("status = 'void'");
    expect(sql).toContain("create_consolidated_invoice_draft_v1");
    expect(sql).toContain("pg_advisory_xact_lock");
  });
});
