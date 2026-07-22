import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260721120000_permit_request_structured_address.sql"),
  "utf8",
);

describe("permit request structured address migration", () => {
  it("adds each address component without assigning a default state", () => {
    expect(sql).toContain("address_line1_snapshot text NULL");
    expect(sql).toContain("address_line2_snapshot text NULL");
    expect(sql).toContain("city_snapshot text NULL");
    expect(sql).toContain("state_snapshot text NULL");
    expect(sql).toContain("zip_snapshot text NULL");
    expect(sql).not.toMatch(/default\s+'CA'/i);
  });
});
