import { describe, expect, it } from "vitest";

import { getActiveManualAddTests } from "@/lib/ecc/test-registry";
import { isEccTestApplicableToSystem } from "@/lib/ecc/test-applicability";

describe("isEccTestApplicableToSystem", () => {
  it("excludes duct leakage and airflow for ductless mini split systems", () => {
    const manualAddForDuctless = getActiveManualAddTests()
      .map((test) => String(test.code))
      .filter((testType) =>
        isEccTestApplicableToSystem(testType, {
          heatOnlySystem: false,
          ductlessMiniSplit: true,
          projectType: "alteration",
        }),
      );

    expect(manualAddForDuctless).not.toContain("duct_leakage");
    expect(manualAddForDuctless).not.toContain("airflow");
    expect(manualAddForDuctless).not.toContain("fan_watt_draw");
    expect(manualAddForDuctless).not.toContain("air_filter_device");
    expect(manualAddForDuctless).toContain("refrigerant_charge");
    expect(manualAddForDuctless).toContain("local_mechanical_exhaust");
    expect(manualAddForDuctless).toContain("qii_insulation");
  });

  it("excludes air filter from alteration systems", () => {
    const manualAddForAlteration = getActiveManualAddTests()
      .map((test) => String(test.code))
      .filter((testType) =>
        isEccTestApplicableToSystem(testType, {
          heatOnlySystem: false,
          ductlessMiniSplit: false,
          projectType: "alteration",
        }),
      );

    expect(manualAddForAlteration).toContain("duct_leakage");
    expect(manualAddForAlteration).toContain("airflow");
    expect(manualAddForAlteration).toContain("fan_watt_draw");
    expect(manualAddForAlteration).not.toContain("air_filter_device");
    expect(manualAddForAlteration).toContain("refrigerant_charge");
    expect(manualAddForAlteration).toContain("local_mechanical_exhaust");
    expect(manualAddForAlteration).toContain("qii_insulation");
  });

  it("allows air filter only for all-new systems", () => {
    const manualAddForAllNew = getActiveManualAddTests()
      .map((test) => String(test.code))
      .filter((testType) =>
        isEccTestApplicableToSystem(testType, {
          heatOnlySystem: false,
          ductlessMiniSplit: false,
          projectType: "all_new",
        }),
      );

    expect(manualAddForAllNew).toContain("air_filter_device");
  });
});
