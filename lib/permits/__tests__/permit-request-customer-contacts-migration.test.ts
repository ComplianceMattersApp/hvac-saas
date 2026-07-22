import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260721130000_permit_request_customer_contacts.sql"),
  "utf8",
);

describe("permit request customer contacts migration", () => {
  it("adds nullable email and phone snapshots", () => {
    expect(sql).toContain("customer_email_snapshot text NULL");
    expect(sql).toContain("customer_phone_snapshot text NULL");
  });
});
