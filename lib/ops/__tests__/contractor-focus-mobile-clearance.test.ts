import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const selectorSource = readFileSync(
  resolve(process.cwd(), "app/ops/_components/ContractorFocusSelector.tsx"),
  "utf8",
);

describe("Contractor Focus mobile clearance", () => {
  it("keeps the filter action footer above the fixed CM assistant launcher", () => {
    expect(selectorSource).toContain("h-[calc(100dvh-7rem)] max-h-[calc(100dvh-7rem)]");
    expect(selectorSource).toContain("sm:h-auto sm:max-h-[78vh]");
    expect(selectorSource).toContain('className="flex shrink-0 items-center justify-between');
    expect(selectorSource).toContain("onClick={() => apply()}");
  });
});
