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
        }),
      );

    expect(manualAddForDuctless).not.toContain("duct_leakage");
    expect(manualAddForDuctless).not.toContain("airflow");
    expect(manualAddForDuctless).not.toContain("fan_watt_draw");
    expect(manualAddForDuctless).not.toContain("air_filter_device");
    expect(manualAddForDuctless).toContain("refrigerant_charge");
  });

  it("retains existing manual add applicability for non-ductless systems", () => {
    const manualAddForDucted = getActiveManualAddTests()
      .map((test) => String(test.code))
      .filter((testType) =>
        isEccTestApplicableToSystem(testType, {
          heatOnlySystem: false,
          ductlessMiniSplit: false,
        }),
      );

    expect(manualAddForDucted).toContain("duct_leakage");
    expect(manualAddForDucted).toContain("airflow");
    expect(manualAddForDucted).toContain("fan_watt_draw");
    expect(manualAddForDucted).toContain("air_filter_device");
    expect(manualAddForDucted).toContain("refrigerant_charge");
  });
});
