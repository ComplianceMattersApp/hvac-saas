import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serviceChainSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/DeferredServiceChainPanelBody.tsx"),
  "utf8",
);

describe("service chain visual hierarchy", () => {
  it("renders linked child visits as an indented connected chain", () => {
    expect(serviceChainSource).toContain("isLinkedChildVisit");
    expect(serviceChainSource).toContain("relative max-h-96 space-y-2 overflow-auto pl-7");
    expect(serviceChainSource).toContain("absolute bottom-4 left-3 top-4 w-px bg-slate-200");
    expect(serviceChainSource).toContain('isLinkedChildVisit ? "ml-5 sm:ml-7" : ""');
    expect(serviceChainSource).toContain("Linked to previous visit");
  });
});
