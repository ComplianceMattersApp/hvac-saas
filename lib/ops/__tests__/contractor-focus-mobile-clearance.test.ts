import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const selectorSource = readFileSync(
  resolve(process.cwd(), "app/ops/_components/ContractorFocusSelector.tsx"),
  "utf8",
);

describe("Contractor Focus mobile clearance", () => {
  it("keeps the filter action footer touch-safe and above the mobile safe area", () => {
    expect(selectorSource).toContain("max-h-[86dvh]");
    expect(selectorSource).toContain("xl:h-auto xl:max-h-[78vh]");
    expect(selectorSource).toContain('className="flex shrink-0 items-center justify-between');
    expect(selectorSource).toContain("env(safe-area-inset-bottom)");
    expect(selectorSource).toContain("min-h-11");
    expect(selectorSource).toContain("onClick={() => apply()}");
  });

  it("uses a mobile bottom sheet without changing the existing selection wiring", () => {
    expect(selectorSource).toContain("flex items-end");
    expect(selectorSource).toContain("rounded-t-[18px]");
    expect(selectorSource).toContain("xl:rounded-2xl");
    expect(selectorSource).toContain("new URLSearchParams(searchParams.toString())");
    expect(selectorSource).toContain('params.set("contractor", nextIds.join(","))');
    expect(selectorSource).toContain("setDraftValue(internalWorkId");
    expect(selectorSource).toContain('event.key === "Escape"');
  });
});
