import { describe, expect, it } from "vitest";
import {
  didOpsStatusChangeTo,
  formatStatusAgeCompact,
  getCalendarDayAgeInLA,
  resolveStatusAgeDays,
} from "@/lib/utils/status-aging";

describe("status-aging helpers", () => {
  it("computes LA calendar-day age for known instant", () => {
    const now = new Date("2026-04-29T18:00:00.000Z");
    expect(getCalendarDayAgeInLA("2026-04-26T17:00:00.000Z", now)).toBe(3);
  });

  it("returns zero when source instant is today in LA", () => {
    const now = new Date("2026-04-29T18:00:00.000Z");
    expect(getCalendarDayAgeInLA("2026-04-29T15:00:00.000Z", now)).toBe(0);
  });

  it("detects ops_status transition in ops_update meta", () => {
    const meta = {
      changes: [
        { field: "pending_info_reason", from: null, to: "Need permit" },
        { field: "ops_status", from: "scheduled", to: "pending_info" },
      ],
    };

    expect(didOpsStatusChangeTo(meta, "pending_info")).toBe(true);
    expect(didOpsStatusChangeTo(meta, "failed")).toBe(false);
  });

  it("resolves status age by preferred source and falls back to updated_at", () => {
    const now = new Date("2026-04-29T18:00:00.000Z");

    expect(
      resolveStatusAgeDays({
        status: "failed",
        failedInstant: "2026-04-27T12:00:00.000Z",
        now,
      }),
    ).toBe(2);

    expect(
      resolveStatusAgeDays({
        status: "pending_info",
        pendingInfoInstant: "2026-04-28T12:00:00.000Z",
        now,
      }),
    ).toBe(1);

    expect(
      resolveStatusAgeDays({
        status: "pending_info",
        pendingInfoInstant: null,
        fallbackUpdatedAt: "2026-04-25T12:00:00.000Z",
        now,
      }),
    ).toBe(4);

    expect(
      resolveStatusAgeDays({
        status: "scheduled",
        failedInstant: "2026-04-25T12:00:00.000Z",
        now,
      }),
    ).toBeNull();
  });

  it("formats compact day counter", () => {
    expect(formatStatusAgeCompact(0)).toBe("0d");
    expect(formatStatusAgeCompact(7)).toBe("7d");
    expect(formatStatusAgeCompact(null)).toBe("");
  });
});
