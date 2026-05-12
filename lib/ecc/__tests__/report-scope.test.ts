import { describe, expect, it } from "vitest";
import { getEccReportScopedTestTypes, isEccTestInReportScope } from "@/lib/ecc/report-scope";
import type { EccTestType } from "@/lib/ecc/test-registry";

const optionalTests: EccTestType[] = [
  "ahri_verification",
  "local_mechanical_exhaust",
  "qii_insulation",
  "fan_watt_draw",
  "air_filter_device",
];

describe("ECC report scope", () => {
  it("does not include unselected optional tests when no run exists", () => {
    const scoped = getEccReportScopedTestTypes({
      suggestedTests: [
        { testType: "duct_leakage", required: true },
        { testType: "airflow", required: true },
        { testType: "refrigerant_charge", required: true },
      ],
      runTestTypes: [],
    });

    for (const optionalTest of optionalTests) {
      expect(isEccTestInReportScope(scoped, optionalTest)).toBe(false);
    }
  });

  it("includes optional tests when an existing run marks them selected/started", () => {
    const scoped = getEccReportScopedTestTypes({
      suggestedTests: [],
      runTestTypes: optionalTests,
    });

    for (const optionalTest of optionalTests) {
      expect(isEccTestInReportScope(scoped, optionalTest)).toBe(true);
    }
  });

  it("keeps required duct leakage, airflow, and refrigerant report sections in scope", () => {
    const scoped = getEccReportScopedTestTypes({
      suggestedTests: [
        { testType: "duct_leakage", required: true },
        { testType: "airflow", required: true },
        { testType: "refrigerant_charge", required: true },
      ],
      runTestTypes: [],
    });

    expect(scoped).toEqual(["duct_leakage", "airflow", "refrigerant_charge"]);
  });

  it("keeps mini split ductless scope to refrigerant charge when that is the only required test", () => {
    const scoped = getEccReportScopedTestTypes({
      suggestedTests: [{ testType: "refrigerant_charge", required: true }],
      runTestTypes: [],
    });

    expect(scoped).toEqual(["refrigerant_charge"]);
  });
});
