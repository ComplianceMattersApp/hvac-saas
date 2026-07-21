import { describe, expect, it } from "vitest";
import { resolveCustomerVisitSummary } from "@/lib/customers/customer-visit-summary";

const JULY_20_LA = new Date("2026-07-20T19:00:00.000Z");
const scheduled = (scheduled_date: string, overrides = {}) => ({
  scheduled_date,
  status: "active",
  ops_status: "scheduled",
  deleted_at: null,
  ...overrides,
});

describe("customer visit summary", () => {
  it("labels the earliest future scheduled visit as next visit with future wording", () => {
    const result = resolveCustomerVisitSummary([
      scheduled("2026-07-25"),
      scheduled("2026-07-22"),
    ], JULY_20_LA);

    expect(result).toEqual({ heading: "NEXT VISIT", scheduledDate: "2026-07-22", relativeLabel: "in 2 days" });
    expect(result?.heading).not.toBe("LAST VISIT");
    expect(result?.relativeLabel).not.toBe("today");
  });

  it.each([
    ["2026-07-20", "today"],
    ["2026-07-21", "tomorrow"],
  ])("formats an upcoming %s visit as %s", (date, relativeLabel) => {
    expect(resolveCustomerVisitSummary([scheduled(date)], JULY_20_LA)).toMatchObject({
      heading: "NEXT VISIT",
      relativeLabel,
    });
  });

  it("falls back to the latest completed historical visit", () => {
    const result = resolveCustomerVisitSummary([
      scheduled("2026-07-18", { status: "completed", ops_status: "closed" }),
      scheduled("2026-07-19", { status: "completed", ops_status: "closed" }),
    ], JULY_20_LA);
    expect(result).toEqual({ heading: "LAST VISIT", scheduledDate: "2026-07-19", relativeLabel: "yesterday" });
  });

  it("does not promote cancelled, archived, deleted, draft, or unscheduled future records", () => {
    const jobs = [
      scheduled("2026-07-21", { status: "cancelled" }),
      scheduled("2026-07-22", { status: "archived" }),
      scheduled("2026-07-23", { deleted_at: "2026-07-19T00:00:00Z" }),
      scheduled("2026-07-24", { status: "draft" }),
      scheduled("2026-07-25", { ops_status: "need_to_schedule" }),
    ];
    expect(resolveCustomerVisitSummary(jobs, JULY_20_LA)).toBeNull();
  });

  it("uses the Los Angeles calendar date across the UTC boundary", () => {
    const lateSundayInLosAngeles = new Date("2026-07-20T06:30:00.000Z");
    expect(resolveCustomerVisitSummary([scheduled("2026-07-19")], lateSundayInLosAngeles)).toMatchObject({
      heading: "NEXT VISIT",
      relativeLabel: "today",
    });
  });
});
