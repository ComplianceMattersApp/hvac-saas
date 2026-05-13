import { afterEach, describe, expect, it } from "vitest";

import { isMaintenanceAgreementsEnabled } from "@/lib/maintenance-agreements/agreement-exposure";

describe("isMaintenanceAgreementsEnabled", () => {
  afterEach(() => {
    delete process.env.ENABLE_MAINTENANCE_AGREEMENTS;
  });

  it("returns false when env var is not set", () => {
    delete process.env.ENABLE_MAINTENANCE_AGREEMENTS;
    expect(isMaintenanceAgreementsEnabled()).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isMaintenanceAgreementsEnabled("")).toBe(false);
  });

  it("returns false for blank string", () => {
    expect(isMaintenanceAgreementsEnabled("   ")).toBe(false);
  });

  it("returns false for unrecognized value", () => {
    expect(isMaintenanceAgreementsEnabled("yes_please")).toBe(false);
  });

  it.each(["1", "true", "yes", "on", "TRUE", "YES", "ON", "True"])(
    "returns true for enabled value %s",
    (v) => {
      expect(isMaintenanceAgreementsEnabled(v)).toBe(true);
    },
  );

  it("reads from ENABLE_MAINTENANCE_AGREEMENTS env var when no argument provided", () => {
    process.env.ENABLE_MAINTENANCE_AGREEMENTS = "1";
    expect(isMaintenanceAgreementsEnabled()).toBe(true);
  });

  it("explicit argument overrides env var", () => {
    process.env.ENABLE_MAINTENANCE_AGREEMENTS = "1";
    expect(isMaintenanceAgreementsEnabled("false")).toBe(false);
  });
});
