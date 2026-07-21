import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACCOUNT_TIME_ZONE,
  formatTimestampInAccountTimeZone,
  isValidIanaTimeZone,
  listAccountTimeZoneOptions,
  normalizeAccountTimeZone,
} from "@/lib/utils/account-time-zone";

describe("account time zone", () => {
  it("accepts IANA zones and falls back safely", () => {
    expect(isValidIanaTimeZone("America/Chicago")).toBe(true);
    expect(isValidIanaTimeZone("not/a-zone")).toBe(false);
    expect(normalizeAccountTimeZone("not/a-zone")).toBe(DEFAULT_ACCOUNT_TIME_ZONE);
    expect(normalizeAccountTimeZone(null)).toBe(DEFAULT_ACCOUNT_TIME_ZONE);
  });

  it("offers common US zones first while supporting international IANA zones", () => {
    const options = listAccountTimeZoneOptions();
    expect(options[0]?.value).toBe("America/Los_Angeles");
    expect(options.some((option) => option.value === "Europe/London")).toBe(true);
    expect(options.some((option) => option.value === "Asia/Tokyo")).toBe(true);
  });

  it("formats one UTC instant in the tenant time zone", () => {
    const options: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    };
    const instant = "2026-07-20T18:00:00.000Z";

    expect(formatTimestampInAccountTimeZone(instant, "America/Los_Angeles", options)).toBe("Jul 20, 11:00 AM");
    expect(formatTimestampInAccountTimeZone(instant, "America/Chicago", options)).toBe("Jul 20, 1:00 PM");
    expect(formatTimestampInAccountTimeZone(instant, "America/New_York", options)).toBe("Jul 20, 2:00 PM");
  });

  it("observes daylight-saving boundaries", () => {
    const options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", timeZoneName: "short" };
    expect(formatTimestampInAccountTimeZone("2026-01-20T18:00:00.000Z", "America/Los_Angeles", options)).toContain("10:00 AM");
    expect(formatTimestampInAccountTimeZone("2026-07-20T18:00:00.000Z", "America/Los_Angeles", options)).toContain("11:00 AM");
  });
});
