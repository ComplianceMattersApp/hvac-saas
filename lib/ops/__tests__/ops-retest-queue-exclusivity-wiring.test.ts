import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const source = readFileSync(resolve(__dirname, "../../../app/ops/page.tsx"), "utf8");
const exceptionsSource = readFileSync(resolve(__dirname, "../../../app/ops/queues/exceptions/page.tsx"), "utf8");
const waitingSource = readFileSync(resolve(__dirname, "../../../app/ops/queues/waiting/page.tsx"), "utf8");

describe("/ops ECC retest queue exclusivity wiring", () => {
  it("loads linked ECC continuations once for shared count and row classification", () => {
    expect(source).toContain('.select("parent_job_id")');
    expect(source).toContain('.eq("job_type", "ecc")');
    expect(source).toContain('buildRetestContinuationParentIds(retestContinuationRowsRes.data)');
    expect(source).toContain("countCurrentExceptionStatuses(");
  });

  it("filters historical retest parents from both exception and waiting rows", () => {
    expect(source).toContain(
      'workspaceKey === "exceptions" || workspaceKey === "waiting"',
    );
    expect(source).toContain(
      "excludeHistoricalRetestParents(queueRes.data ?? [], retestContinuationParentIds)",
    );
    expect(exceptionsSource).toContain("excludeHistoricalRetestParents(");
    expect(waitingSource).toContain("excludeHistoricalRetestParents(");
  });

  it("does not mutate parent jobs or historical ECC test truth from the queue read path", () => {
    expect(source).not.toContain("retestContinuationParentIds).update(");
    expect(source).not.toContain('from("ecc_test_runs").delete');
  });
});
