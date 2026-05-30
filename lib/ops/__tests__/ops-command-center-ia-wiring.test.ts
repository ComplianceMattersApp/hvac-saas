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
  it("keeps Financial Attention and Service Plans ahead of workflow and queue previews", () => {
    const fullOpsStart = opsPageSource.indexOf("Ops Command Center");
    assertFound("Ops Command Center", fullOpsStart);

    const fullOpsSource = opsPageSource.slice(fullOpsStart);
    const financialAttentionIndex = fullOpsSource.indexOf("Financial Attention");
    const servicePlansIndex = fullOpsSource.indexOf("View Service Plans");
    const workflowHealthIndex = fullOpsSource.indexOf("Workflow Health");
    const attentionBoardIndex = fullOpsSource.indexOf("Attention Board");
    const queueShortcutsIndex = fullOpsSource.indexOf("Queue Shortcuts");

    assertFound("Financial Attention", financialAttentionIndex);
    assertFound("Service Plans", servicePlansIndex);
    assertFound("Workflow Health", workflowHealthIndex);
    assertFound("Attention Board", attentionBoardIndex);
    assertFound("Queue Shortcuts", queueShortcutsIndex);

    expect(financialAttentionIndex).toBeLessThan(servicePlansIndex);
    expect(servicePlansIndex).toBeLessThan(workflowHealthIndex);
    expect(workflowHealthIndex).toBeLessThan(attentionBoardIndex);
    expect(attentionBoardIndex).toBeLessThan(queueShortcutsIndex);
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

  it("keeps focused queue preview compact instead of duplicating full queue lists", () => {
    expect(opsPageSource).toContain("Focused Queue Preview");
    expect(opsPageSource).toContain("sortedBucketJobs.slice(0, 12)");
  });
});