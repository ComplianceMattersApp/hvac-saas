import { describe, expect, it } from "vitest";

import { parseBooleanToggleEntries } from "@/lib/time-clock/settings-controls";

describe("parseBooleanToggleEntries", () => {
  it("returns false for empty values", () => {
    expect(parseBooleanToggleEntries([])).toBe(false);
  });

  it("returns true when any enabled value is present", () => {
    expect(parseBooleanToggleEntries(["0", "1"])) .toBe(true);
    expect(parseBooleanToggleEntries(["false", "on"])) .toBe(true);
  });

  it("returns false for disabled-only values", () => {
    expect(parseBooleanToggleEntries(["0", "false", "off", "no"])) .toBe(false);
  });
});
