import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "../../../app/jobs/[id]/invoice/page.tsx"), "utf8");

describe("internal invoice PDF workspace wiring", () => {
  it("offers direct PDF download and preserves browser printing", () => {
    expect(source).toContain("Download PDF");
    expect(source).toContain("/invoice/pdf?invoice_id=${encodeURIComponent(invoice.id)}");
    expect(source).toContain("Print Invoice");
    expect(source).toContain("/invoice/print?invoice_id=${encodeURIComponent(invoice.id)}");
  });
});
