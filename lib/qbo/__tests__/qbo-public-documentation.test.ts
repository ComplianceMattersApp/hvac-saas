import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const privacy = readFileSync(resolve(process.cwd(), "app/privacy/page.tsx"), "utf8");
const terms = readFileSync(resolve(process.cwd(), "app/terms/page.tsx"), "utf8");

describe("public QBO policy wording", () => {
  it("describes eligible invoice and recorded-payment synchronization in the Privacy Policy", () => {
    expect(privacy).toContain("eligible invoice and recorded payment");
    expect(privacy).toContain("create a related");
    expect(privacy).toContain("QuickBooks Online payment and apply it to the corresponding invoice");
    expect(privacy).toContain("downstream accounting synchronization service");
    expect(privacy).toContain("operational source of truth");
    expect(privacy).not.toContain("We sync invoice data one-way");
  });

  it("describes QBO as an optional convenience without replacing EveryStep truth", () => {
    expect(terms).toContain("eligible invoice and recorded payment");
    expect(terms).toContain("provided as a convenience feature");
    expect(terms).toContain("operational");
    expect(terms).toContain("system of record for jobs, invoices, and recorded payment status");
    expect(terms).not.toContain("syncs your invoice data to your connected QuickBooks");
  });
});
