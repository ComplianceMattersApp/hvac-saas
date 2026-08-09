import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Wiring pins for the route-planning view: the plan surface must stay reachable
 * from its entry points, ride the scoped calendar loaders (never its own job
 * query), and schedule through the canonical schedule action.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const planViewSource = read("components/calendar/RoutePlanView.tsx");
const calendarPageSource = read("app/calendar/page.tsx");
const calendarViewSource = read("components/calendar/calendar-view.tsx");
const opsPageSource = read("app/ops/page.tsx");
const calendarActionsSource = read("lib/actions/calendar-actions.ts");

describe("route plan view wiring", () => {
  it("is reachable from the calendar page, view tabs, and the ops scheduling queue", () => {
    expect(calendarPageSource).toContain("view === 'plan'");
    expect(calendarPageSource).toContain("<RoutePlanView");
    expect(calendarViewSource).toContain("buildCalendarHref('plan'");
    // Entry rides the active-queue panel's headerRightAction slot, keyed by the
    // "pending" (Needs Scheduling) bucket — NOT /ops/call-list, which is
    // orphaned from navigation since the ops redesign.
    expect(opsPageSource).toContain('href: "/calendar?view=plan"');
  });

  it("reads through the scoped calendar loaders, not its own jobs query", () => {
    expect(planViewSource).toContain("getDispatchCalendarBoardData");
    expect(planViewSource).toContain("getDispatchCalendarQueueData");
    expect(planViewSource).not.toContain('from("jobs")');
    expect(planViewSource).not.toContain("createAdminClient");
  });

  it("schedules through the canonical schedule action with a plan return path", () => {
    expect(planViewSource).toContain("action={updateJobScheduleFromForm}");
    for (const field of ["job_id", "scheduled_date", "window_start", "window_end", "return_to"]) {
      expect(planViewSource).toContain(`name="${field}"`);
    }
  });

  it("logs failed calls through the canonical contact-attempt action", () => {
    expect(planViewSource).toContain("action={logCustomerContactAttemptFromForm}");
    expect(planViewSource).toContain('name="method"');
    expect(planViewSource).toContain('name="result"');
  });

  it("keeps coordinates and duration flowing through the dispatch select", () => {
    expect(calendarActionsSource).toContain("'locations:location_id(city, latitude, longitude)'");
    expect(calendarActionsSource).toContain("'estimated_duration_minutes'");
    expect(calendarActionsSource).toContain("location_latitude: locationLatitude");
    expect(calendarActionsSource).toContain("estimated_duration_minutes: estimatedDurationMinutes");
  });
});
