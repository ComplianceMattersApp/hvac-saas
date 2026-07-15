import { describe, expect, it } from "vitest";
import {
  buildRetestContinuationParentIds,
  countCurrentExceptionStatuses,
  excludeHistoricalRetestParents,
  isHistoricalRetestParent,
} from "@/lib/ops/retest-queue-exclusivity";

describe("ECC retest active queue exclusivity", () => {
  const continuationParentIds = buildRetestContinuationParentIds([
    { parent_job_id: "failed-parent" },
    { parent_job_id: "retest-ready-parent" },
  ]);

  it("keeps unresolved failed jobs visible until a real continuation exists", () => {
    expect(isHistoricalRetestParent({ id: "unresolved", ops_status: "failed" }, continuationParentIds)).toBe(false);
  });

  it.each(["failed", "retest_needed", "pending_office_review"])(
    "suppresses a linked historical parent in %s",
    (opsStatus) => {
      expect(isHistoricalRetestParent({ id: "failed-parent", ops_status: opsStatus }, continuationParentIds)).toBe(true);
    },
  );

  it("does not suppress unrelated parent workflow states", () => {
    expect(isHistoricalRetestParent({ id: "failed-parent", ops_status: "on_hold" }, continuationParentIds)).toBe(false);
  });

  it("counts only the current workflow item after retest handoff", () => {
    const rows = [
      { id: "failed-parent", ops_status: "failed" },
      { id: "retest-child", ops_status: "need_to_schedule" },
      { id: "unresolved", ops_status: "failed" },
    ];

    expect(excludeHistoricalRetestParents(rows, continuationParentIds)).toEqual([
      { id: "retest-child", ops_status: "need_to_schedule" },
      { id: "unresolved", ops_status: "failed" },
    ]);
    expect(countCurrentExceptionStatuses(rows, continuationParentIds).get("failed")).toBe(1);
  });
});
