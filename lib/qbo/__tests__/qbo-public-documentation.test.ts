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
    expect(terms).toContain("replace EveryStep as the operational source of truth");
    expect(terms).not.toContain("syncs your invoice data to your connected QuickBooks");
  });

  it("keeps SMS consent current and mobile-information sharing appropriately limited", () => {
    expect(privacy).toContain("Customers may provide SMS consent verbally during appointment scheduling");
    expect(privacy).toContain(
      "Mobile numbers, SMS consent information, and messaging preferences are not sold or shared"
    );
    expect(privacy).toContain("service providers necessary to operate and deliver authorized messaging");
    expect(privacy).not.toContain("digital consent methods if and");
    expect(terms).toContain("Compliance Matters consent methods");
    expect(terms).not.toContain("digital consent method if and when one is made available");
  });

  it("describes scoped security controls without unsupported absolutes", () => {
    expect(privacy).toContain("row-level security protections where applicable");
    expect(privacy).toContain("secure limited-purpose access controls for protected information");
    expect(privacy).not.toContain("Row-level security policies on all data");
    expect(privacy).not.toContain("Authentication required for all data access");
  });
});
