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

  it("uses existing service-plan summary truth including the 30-day window", () => {
    expect(todayReadModelSource).toContain("due_in_next_7_days");
    expect(todayReadModelSource).toContain("due_in_next_30_days");
    expect(todayReadModelSource).toContain("not_scheduled_active");
    expect(todayReadModelSource).toContain("upcomingService,");
  });
});
