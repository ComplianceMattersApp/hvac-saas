import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "../today-read-model.ts"), "utf8");

describe("Today Ops queue count wiring", () => {
  it("uses the Ops field-work date window and active-work filters", () => {
    expect(source).toContain('.neq("ops_status", "closed")');
    expect(source).toContain('.eq("field_complete", false)');
    expect(source).toContain('.gte("scheduled_date", startOfTodayUtcIsoLA())');
    expect(source).toContain('.lt("scheduled_date", startOfTomorrowUtcIsoLA())');
  });

  it("uses the complete Ops waiting and exception status sets", () => {
    expect(source).toContain('["on_hold", "waiting", "pending_office_review"]');
    expect(source).toContain('["failed", "retest_needed", "pending_office_review", "problem"]');
    expect(source).toContain("countCurrentExceptionStatuses(");
  });

  it("uses the same assignment and billing projections as Ops", () => {
    expect(source).toContain("buildScheduledWithoutTechSnapshot({");
    expect(source).toContain("buildBillingTruthCloseoutProjectionMap({");
    expect(source).toContain("listCloseoutQueueJobs(");
  });
});
