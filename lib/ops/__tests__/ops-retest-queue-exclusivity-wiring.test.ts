import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const source = readFileSync(resolve(__dirname, "../../../app/ops/page.tsx"), "utf8");
const workspaceLoaderSource = readFileSync(resolve(__dirname, "../ops-workspace-data-loader.ts"), "utf8");
const overviewLoaderSource = readFileSync(resolve(__dirname, "../ops-workspace-overview-loader.ts"), "utf8");
const loaderSource = readFileSync(resolve(__dirname, "../waiting-exception-loader.ts"), "utf8");
const exceptionsSource = readFileSync(resolve(__dirname, "../../../app/ops/queues/exceptions/page.tsx"), "utf8");
const waitingSource = readFileSync(resolve(__dirname, "../../../app/ops/queues/waiting/page.tsx"), "utf8");

describe("/ops ECC retest queue exclusivity wiring", () => {
  it("loads linked ECC continuations once for shared count and row classification", () => {
    expect(overviewLoaderSource).toContain("loadWaitingExceptionQueueSnapshot({ supabase: params.supabase })");
    expect(loaderSource).toContain('.select("parent_job_id")');
    expect(loaderSource).toContain('.eq("job_type", "ecc")');
    expect(loaderSource).toContain("buildRetestContinuationParentIds(");
    expect(loaderSource).toContain("countCurrentExceptionStatuses(");
  });

  it("filters historical retest parents from both exception and waiting rows", () => {
    expect(workspaceLoaderSource).toContain(
      'workspaceKey === "waiting" || workspaceKey === "exceptions"',
    );
    expect(workspaceLoaderSource).toContain("loadFocusedOpsQueueRows({");
    expect(source).toContain("createOpsWorkspacePreviewLoader({");
    expect(loaderSource).toContain("excludeHistoricalRetestParents(");
    expect(exceptionsSource).toContain("loadFocusedOpsQueueData({");
    expect(waitingSource).toContain("loadFocusedOpsQueueData({");
    expect(exceptionsSource).not.toContain("excludeHistoricalRetestParents(");
    expect(waitingSource).not.toContain("excludeHistoricalRetestParents(");
  });

  it("does not mutate parent jobs or historical ECC test truth from the queue read path", () => {
    expect(source).not.toContain("retestContinuationParentIds).update(");
    expect(source).not.toContain('from("ecc_test_runs").delete');
    expect(loaderSource).not.toContain('from("ecc_test_runs").delete');
  });
});
