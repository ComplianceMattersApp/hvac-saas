import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const calendarViewSource = readFileSync(
  resolve(__dirname, "../../../components/calendar/calendar-view.tsx"),
  "utf-8",
);

const openJobButtonSource = readFileSync(
  resolve(__dirname, "../../../components/calendar/CalendarOpenJobButton.tsx"),
  "utf-8",
);

describe("calendar action responsiveness", () => {
  it("uses a dedicated client open-job button in calendar inspector", () => {
    expect(calendarViewSource).toContain("CalendarOpenJobButton");
    expect(calendarViewSource).toContain('href={`/jobs/${job.id}`}');
  });

  it("open-job button prefetches and pushes navigation immediately", () => {
    expect(openJobButtonSource).toContain("router.prefetch(href)");
    expect(openJobButtonSource).toContain("router.push(href)");
  });

  it("open-job button renders pending feedback label", () => {
    expect(openJobButtonSource).toContain('loadingLabel = "Opening..."');
    expect(openJobButtonSource).toContain("isPending ? loadingLabel : children");
  });

  it("calendar schedule actions remain wired to updateJobScheduleFromForm", () => {
    expect(calendarViewSource).toContain("updateJobScheduleFromForm");
  });

  it("calendar contact logging remains wired to existing server action", () => {
    expect(calendarViewSource).toContain("logCustomerContactAttemptFromForm");
  });

  it("month view dispatch range uses visible month grid bounds", () => {
    expect(calendarViewSource).toContain("getMonthVisibleRange");
    expect(calendarViewSource).toContain("rangeStartDate: monthVisibleRange.startDate");
    expect(calendarViewSource).toContain("rangeEndDate: monthVisibleRange.endDate");
  });
});
