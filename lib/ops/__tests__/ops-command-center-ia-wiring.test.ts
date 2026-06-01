import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
  "utf-8",
);

function assertFound(label: string, index: number) {
  expect(index, `${label} marker should exist in the Full Ops branch`).toBeGreaterThan(-1);
}

describe("/ops Full Ops command center IA wiring", () => {
  it("makes the first viewport tell the operator where to start", () => {
    const heroStart = opsPageSource.indexOf("Operations Workspace");
    assertFound("Operations Workspace", heroStart);

    const heroSource = opsPageSource.slice(heroStart, heroStart + 1200);
    expect(heroSource).toContain("Start with the queue that needs attention now.");
    expect(heroSource).toContain("focusedQueueHref");
    expect(heroSource).not.toContain("Full operations board");
  });

  it("keeps focused queue and filter wiring query-parameter driven", () => {
    expect(opsPageSource).toContain("function buildQueryString(");
    expect(opsPageSource).toContain("bucket: card.key");
    expect(opsPageSource).toContain("contractor: contractorScopeFilter ?? \"\"");
    expect(opsPageSource).toContain("q: q ?? \"\"");
    expect(opsPageSource).toContain("sort: sort ?? \"\"");
    expect(opsPageSource).toContain("signal: signal ?? \"\"");
    expect(opsPageSource).toContain('href={`/ops${buildQueryString({');
  });

  it("keeps the focused queue preview compact and reachable", () => {
    expect(opsPageSource).toContain("Active Queue");
    expect(opsPageSource).toContain("Open focused queue");
    expect(opsPageSource).toContain("Open Job");
  });
});