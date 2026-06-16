import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
  "utf-8",
);

const waitingQueuePageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/queues/waiting/page.tsx"),
  "utf-8",
);

const exceptionsQueuePageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/queues/exceptions/page.tsx"),
  "utf-8",
);

const withoutTechQueuePageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/queues/without-tech/page.tsx"),
  "utf-8",
);

const contractorFilterSource = readFileSync(
  resolve(__dirname, "../../../app/ops/_components/ContractorFilter.tsx"),
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
    expect(heroSource).toContain("activeWorkspaceHref");
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

  it("keeps the board queue preview compact with job actions still reachable", () => {
    expect(opsPageSource).toContain("Active Queue");
    expect(opsPageSource).toContain("View on board");
    expect(opsPageSource).toContain("Open Job");
  });

  it("renders compact contractor and bucket filters on the primary Ops board", () => {
    expect(opsPageSource).toContain("Board Filters");
    expect(opsPageSource).toContain("ContractorFilter contractors={workspaceContractors}");
    expect(opsPageSource).toContain("All contractors");
    expect(contractorFilterSource).toContain('<option value="">All contractors</option>');
    expect(contractorFilterSource).toContain("contractors.map");
    expect(opsPageSource).toContain("OPS_BOARD_BUCKET_FILTERS.map");
    expect(opsPageSource).toContain('{ key: "all", label: "All" }');
    expect(opsPageSource).toContain('{ key: "pending", label: "Pending" }');
    expect(opsPageSource).toContain('{ key: "waiting", label: "Waiting" }');
    expect(opsPageSource).toContain('{ key: "exceptions", label: "Exceptions" }');
    expect(opsPageSource).toContain('{ key: "closeout", label: "Closeout" }');
  });

  it("maps bucket filters to existing Ops board queue categories", () => {
    expect(opsPageSource).toContain("boardBucketWorkspaceKeyMap");
    expect(opsPageSource).toContain('pending: "need_to_schedule"');
    expect(opsPageSource).toContain('waiting: "waiting"');
    expect(opsPageSource).toContain('exceptions: "exceptions"');
    expect(opsPageSource).toContain('closeout: "closeout"');
    expect(opsPageSource).toContain('const coreBoardWorkspaceKeys = ["need_to_schedule", "waiting", "exceptions", "closeout"];');
    expect(opsPageSource).not.toContain("reason filter");
  });

  it("applies contractor filtering to visible board rows without changing row actions", () => {
    expect(opsPageSource).toContain("if (contractorScopeFilter) queueQ = queueQ.eq(\"contractor_id\", contractorScopeFilter);");
    expect(opsPageSource).toContain("workspaceContractorName(job)");
    expect(opsPageSource).toContain('href={`/jobs/${job.id}?tab=ops`}');
    expect(opsPageSource).toContain("Open Job");
  });

  it("shows clear filters and empty filtered state for unmatched board filters", () => {
    expect(opsPageSource).toContain("hasActiveOpsBoardFilters");
    expect(opsPageSource).toContain('href="/ops#ops-workspace"');
    expect(opsPageSource).toContain("Clear filters");
    expect(opsPageSource).toContain("No jobs match these filters.");
  });

  it("removes visible focused queue route entry points from the main Ops surface", () => {
    expect(opsPageSource).not.toContain("/ops/queues/waiting");
    expect(opsPageSource).not.toContain("/ops/queues/exceptions");
    expect(opsPageSource).not.toContain("/ops/queues/without-tech");
    expect(opsPageSource).not.toContain("Open focused queue");
    expect(opsPageSource).toContain('href={`/ops${buildQueryString({');
    expect(opsPageSource).toContain('bucket: queue.key');
  });

  it("leaves direct focused queue route files renderable with return navigation", () => {
    expect(waitingQueuePageSource).toContain("No waiting work right now.");
    expect(waitingQueuePageSource).toContain('href="/ops"');
    expect(exceptionsQueuePageSource).toContain("No exceptions are waiting right now.");
    expect(exceptionsQueuePageSource).toContain('href="/ops"');
    expect(withoutTechQueuePageSource).toContain("No coverage gaps right now.");
    expect(withoutTechQueuePageSource).toContain('href="/ops"');
  });
});
