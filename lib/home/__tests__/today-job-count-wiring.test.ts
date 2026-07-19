import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "../today-read-model.ts"), "utf8");
const pageSource = readFileSync(resolve(__dirname, "../../../app/today/page.tsx"), "utf8");

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

  it("publishes only exact, nonzero Ops queues in the Today queue summary", () => {
    const queueSummarySource = source.slice(
      source.indexOf("export function buildPriorityChips"),
      source.indexOf("function buildRoleAwarePulse"),
    );
    for (const key of [
      "need_scheduling",
      "field_work",
      "without_tech",
      "waiting",
      "exceptions",
      "follow_ups",
      "closeout",
    ]) {
      expect(queueSummarySource).toContain(`key: "${key}"`);
    }

    expect(queueSummarySource).toContain("if (queue.count > 0) chips.push(queue)");
    expect(queueSummarySource).not.toContain('key: "service_plans_due"');
    expect(queueSummarySource).not.toContain('key: "open_invoices"');
    expect(queueSummarySource).not.toContain('key: "on_hold"');
  });

  it("renders the counts as an Operations queue summary instead of pills", () => {
    expect(pageSource).toContain("Queues requiring attention");
    expect(pageSource).toContain("Live counts from the Operations workboard.");
    expect(pageSource).toContain("grid gap-2 sm:grid-cols-2");
    expect(pageSource).not.toContain("Tap to focus");
  });
});
