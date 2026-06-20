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

const dispatchGridSource = readFileSync(
  resolve(__dirname, "../../../components/calendar/CalendarDispatchGrid.tsx"),
  "utf-8",
);

const dragJobLinkSource = readFileSync(
  resolve(__dirname, "../../../components/calendar/CalendarDragJobLink.tsx"),
  "utf-8",
);

const responsiveJobLinkSource = readFileSync(
  resolve(__dirname, "../../../components/calendar/CalendarResponsiveJobLink.tsx"),
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

  it("keeps desktop calendar job clicks wired to the inspector command center", () => {
    expect(calendarViewSource).toContain("buildCalendarHref('list', date, { job: job.id, tech })");
    expect(dispatchGridSource).toContain("buildCalendarHref(currentView, date, { job: job.id, tech })");
    expect(calendarViewSource).toContain("const showDesktopInspectorColumn = inspectorOpen");
  });

  it("renders dispatch focus as checkbox-style multi-select controls", () => {
    expect(calendarViewSource).toContain('type="checkbox"');
    expect(calendarViewSource).toContain('name="tech"');
    expect(calendarViewSource).toContain("Apply");
    expect(calendarViewSource).toContain("All");
    expect(calendarViewSource).toContain("Clear");
    expect(calendarViewSource).toContain("Unassigned");
    expect(calendarViewSource).toContain("selectedUserIds={appliedSelectedCalendarUserIds}");
    expect(calendarViewSource).toContain("parseCalendarSelectedUserIds(activeTech)");
    expect(calendarViewSource).toContain("assignableUsers={renderedCalendarUsers}");
    expect(calendarViewSource).toContain("includeUnassignedColumn={includeUnassignedColumn}");
  });

  it("renders mobile calendar jobs as direct job-detail links", () => {
    expect(calendarViewSource).toContain("CalendarResponsiveJobLink");
    expect(calendarViewSource).toContain('mobileHref={`/jobs/${job.id}`}');
    expect(dispatchGridSource).toContain('href={`/jobs/${job.id}`}');
    expect(responsiveJobLinkSource).toContain("xl:hidden");
    expect(responsiveJobLinkSource).toContain("hidden xl:block");
  });

  it("mobile job links do not open the calendar inspector first", () => {
    expect(responsiveJobLinkSource).toContain("mobileHref");
    expect(responsiveJobLinkSource).toContain("desktopHref");
    expect(responsiveJobLinkSource).not.toContain("inspector");
    expect(dragJobLinkSource).toContain("mobileHref");
    expect(dragJobLinkSource).toContain("xl:hidden");
    expect(dragJobLinkSource).toContain("hidden xl:block");
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

  it("mobile calendar keeps controls accessible through progressive disclosure", () => {
    expect(calendarViewSource).toContain("Filters &amp; Status");
    expect(calendarViewSource).toContain("Show filters");
    expect(calendarViewSource).toContain("Hide filters");
    expect(calendarViewSource).toContain("ChevronDown");
    expect(calendarViewSource).toContain("selectedUserIds={appliedSelectedCalendarUserIds}");
    expect(calendarViewSource).toContain("Next dispatch action");
  });

  it("mobile day and week grids have intentional horizontal scrolling instead of clipped columns", () => {
    expect(calendarViewSource).toContain("overflow-x-auto overscroll-x-contain pb-2");
    expect(dispatchGridSource).toContain("const minGridWidth = 84 + columnCount * 170");
    expect(dispatchGridSource).toContain("includeUnassignedColumn");
    expect(dispatchGridSource).toContain("compactCalendarUserLabel");
    expect(dispatchGridSource).toContain("calendar_label");
    expect(dispatchGridSource).toContain("minmax(170px, 1fr)");
    expect(dispatchGridSource).toContain('style={{ minWidth: `${minGridWidth}px` }}');
  });

  it("desktop toolbar exposes jump-to-date without changing the selected view", () => {
    expect(calendarViewSource).not.toContain("const showDateJump = view === 'day' || view === 'week'");
    expect(calendarViewSource).toContain('<form action="/calendar" method="get"');
    expect(calendarViewSource).toContain('<input type="hidden" name="view" value={view} />');
    expect(calendarViewSource).toContain('name="date"');
    expect(calendarViewSource).toContain("Jump to");
  });

  it("keeps the desktop planner queue sticky while the calendar scrolls", () => {
    expect(calendarViewSource).toContain("xl:sticky xl:top-24 xl:order-1 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto");
    expect(calendarViewSource).toContain("<CalendarQueueSidebar queuePromise={queuePromise}");
    expect(calendarViewSource).toContain("Open or drag a job to place it on the schedule.");
  });
});
