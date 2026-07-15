import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const builder = readFileSync(resolve(process.cwd(), "components/jobs/VisitScopeBuilder.tsx"), "utf8");
const intake = readFileSync(resolve(process.cwd(), "app/jobs/new/NewJobForm.tsx"), "utf8");
const invoiceActions = readFileSync(resolve(process.cwd(), "lib/actions/internal-invoice-actions.ts"), "utf8");

describe("Work Item quantity to invoice wiring", () => {
  it("exposes quantity beside unit price during intake", () => {
    expect(builder).toContain("expected_quantity");
    expect(builder).toContain("Quantity and unit price carry into the draft invoice charge.");
    expect(builder).toContain('min="0.01"');
  });

  it("preserves quantity in new-job draft save and restore mappings", () => {
    expect(intake.match(/expected_quantity/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it("uses each Work Item quantity during automatic invoice import", () => {
    expect(invoiceActions).toContain("parseQuantityToHundredths(String(scopeItem.expected_quantity ?? 1))");
    expect(invoiceActions).not.toContain("const quantityHundredths = 100;\n  const payload = await Promise.all(eligibleScopeItems");
  });
});
