import { describe, expect, it } from "vitest";

import {
  getRequiredTestsForSystem,
  getThresholdRuleForTest,
  normalizeProjectTypeToRuleProfile,
} from "@/lib/ecc/rule-profiles";

describe("rule-profiles airflow threshold normalization", () => {
  it("maps airflow threshold to 350 CFM/ton for new-prescriptive aliases", () => {
    const aliases = ["all_new", "allnew", "new", "new_prescriptive"];

    for (const alias of aliases) {
      const profile = normalizeProjectTypeToRuleProfile(alias);
      const threshold = getThresholdRuleForTest(alias, "airflow");

      expect(profile).toBe("new_prescriptive");
      expect(threshold?.unit).toBe("cfm_per_ton");
      expect(threshold?.targetValue).toBe(350);
    }
  });

  it("keeps alteration airflow threshold at 300 CFM/ton", () => {
    const threshold = getThresholdRuleForTest("alteration", "airflow");

    expect(normalizeProjectTypeToRuleProfile("alteration")).toBe("alteration");
    expect(threshold?.unit).toBe("cfm_per_ton");
    expect(threshold?.targetValue).toBe(300);
  });

  it("requires all-new standard forced-air set including fan and air filter", () => {
    const required = getRequiredTestsForSystem({
      projectType: "all_new",
      systemEquipment: [{ component_type: "outdoor_unit" }, { component_type: "air_handler" }],
    });

    expect(required).toEqual(
      expect.arrayContaining([
        "duct_leakage",
        "airflow",
        "fan_watt_draw",
        "air_filter_device",
        "refrigerant_charge",
      ]),
    );
  });

  it("excludes refrigerant charge for package-unit systems", () => {
    for (const component_type of ["package_unit", "gas_pack_unit", "heat_pump_pack_unit"]) {
      const required = getRequiredTestsForSystem({
        projectType: "all_new",
        systemEquipment: [{ component_type }],
      });

      expect(required).not.toContain("refrigerant_charge");
    }
  });
});
