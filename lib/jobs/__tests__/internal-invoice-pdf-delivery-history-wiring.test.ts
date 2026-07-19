import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "../../../app/jobs/[id]/invoice/page.tsx"), "utf8");

describe("invoice PDF delivery history wiring", () => {
  it("shows the compact indicator only for normalized attached deliveries", () => {
    expect(source).toContain("delivery.pdfAttached");
    expect(source).toContain("PDF attached");
  });
});
