import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const todayPageSource = readFileSync(resolve(process.cwd(), "app/today/page.tsx"), "utf8");
const todayReadModelSource = readFileSync(resolve(process.cwd(), "lib/home/today-read-model.ts"), "utf8");

describe("Today upcoming service visibility", () => {
  it("renders a dedicated service-plan section in both responsive layouts", () => {
    expect(todayPageSource.match(/<UpcomingServiceSection service=\{model\.upcomingService\} \/>/g)).toHaveLength(2);
    expect(todayPageSource).toContain("Upcoming Service");
    expect(todayPageSource).toContain("View all service plans");
  });

  it("does not repeat Operations queues in the main Today stream", () => {
    expect(todayPageSource).not.toContain("<FollowUpSection groups={model.followUpGroups");
  });

  it("renders every queue supplied by the Today read model without a stale UI allowlist", () => {
    expect(todayPageSource).not.toContain("const snapshotKeys = new Set");
    expect(todayPageSource).toContain("{chips.map((chip) => (");
    expect(todayPageSource).toContain('chip.key === "without_tech"');
    expect(todayPageSource).toContain('chip.key === "contractor_intake"');
    expect(todayReadModelSource).toContain('key: "permits"');
    expect(todayReadModelSource).toContain('key: "updates"');
  });

  it("shows booked work for the next seven days in both responsive layouts", () => {
    expect(todayPageSource.match(/<ComingUpSection comingUp=\{model\.comingUp\} \/>/g)).toHaveLength(2);
    expect(todayReadModelSource).toContain("safeLoadComingUp");
    expect(todayReadModelSource).toContain('.gt("scheduled_date", params.today)');
    expect(todayReadModelSource).toContain('assignmentLabel: assignments.length');
  });

  it("reconciles service-plan due windows with linked-job fulfillment truth", () => {
    expect(todayReadModelSource).toContain("listMaintenanceAgreementDrilldownForAccount");
    expect(todayReadModelSource).toContain('row.fulfillment_state === "due_for_booking"');
    expect(todayReadModelSource).toContain('row.fulfillment_state === "job_created_unscheduled"');
    expect(todayReadModelSource).toContain("upcomingService,");
  });
});
