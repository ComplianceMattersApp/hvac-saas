import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.join(process.cwd(), "app", "jobs", "[id]", "v2", "page.tsx"),
  "utf8",
);

describe("desktop job detail V2 billing brief", () => {
  it("shows the intake billing recipient method instead of a section pointer", () => {
    expect(source).toContain("function formatBillingRecipientMethod");
    expect(source).toContain('billingRecipient === "contractor"');
    expect(source).toContain('billingRecipient === "customer"');
    expect(source).toContain('billingRecipient === "other"');
    expect(source).toContain("billingRecipientMethodLabel");
    expect(source).not.toContain("See billing section");
  });

  it("keeps billing completion truth visible in the brief", () => {
    expect(source).toContain("billedTruthSatisfied ? (");
    expect(source).toContain("COMPLETE");
  });
});
