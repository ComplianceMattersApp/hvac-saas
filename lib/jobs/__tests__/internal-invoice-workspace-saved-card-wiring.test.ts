import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/invoice/page.tsx"),
  "utf8",
);

describe("internal invoice workspace saved-card charge wiring", () => {
  it("wires manual saved-card charge action and one-time copy", () => {
    expect(source).toContain("chargeSavedCardForIssuedInvoiceFromForm");
    expect(source).toContain("Charge saved card");
    expect(source).toContain("One-time saved-card charge");
    expect(source).toContain("This is not autopay");
    expect(source).toContain("no subscription is created");
    expect(source).toContain("recorded only after Stripe webhook confirmation");
  });

  it("preserves existing payment actions while adding saved-card control", () => {
    expect(source).toContain("Collect payment now");
    expect(source).toContain("Record Payment");
  });
});
