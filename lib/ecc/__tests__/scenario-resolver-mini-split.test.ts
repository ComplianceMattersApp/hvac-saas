import { describe, expect, it } from "vitest";

import { isDuctlessMiniSplitSystem, resolveEccScenario } from "@/lib/ecc/scenario-resolver";

describe("resolveEccScenario mini split trigger alignment", () => {
  it("treats mini-split indoor head only as ductless refrigerant-charge required", () => {
    const result = resolveEccScenario({
      projectType: "alteration",
      systemEquipment: [{ component_type: "mini_split_head" }],
    });

    expect(isDuctlessMiniSplitSystem([{ component_type: "mini_split_head" }])).toBe(true);
    expect(result.scenario).toBe("mini_split");
    expect(result.suggestedTests).toEqual([
      {
        testType: "refrigerant_charge",
        required: true,
        note: "Mini-splits require weigh-in workflow.",
      },
    ]);
  });

  it("treats mini-split outdoor plus indoor head as ductless refrigerant-charge required", () => {
    const result = resolveEccScenario({
      projectType: "alteration",
      systemEquipment: [
        { component_type: "mini_split_outdoor" },
        { component_type: "mini_split_head" },
      ],
    });

    expect(result.scenario).toBe("mini_split");
    expect(result.suggestedTests.map((test) => test.testType)).toEqual(["refrigerant_charge"]);
    expect(result.suggestedTests.every((test) => test.required)).toBe(true);
  });

  it("does not treat mini-split outdoor alone as ductless", () => {
    const equipment = [{ component_type: "mini_split_outdoor" }];
    const result = resolveEccScenario({
      projectType: "alteration",
      systemEquipment: equipment,
    });

    expect(isDuctlessMiniSplitSystem(equipment)).toBe(false);
    expect(result.scenario).not.toBe("mini_split");
    expect(result.suggestedTests).not.toEqual([
      {
        testType: "refrigerant_charge",
        required: true,
        note: "Mini-splits require weigh-in workflow.",
      },
    ]);
  });

  it("keeps mini-split outdoor plus air handler on non-ductless path", () => {
    const equipment = [
      { component_type: "mini_split_outdoor" },
      { component_type: "air_handler" },
    ];

    const result = resolveEccScenario({
      projectType: "alteration",
      systemEquipment: equipment,
    });

    expect(isDuctlessMiniSplitSystem(equipment)).toBe(false);
    expect(result.scenario).toBe("split_system_alteration");
    expect(result.suggestedTests.map((test) => test.testType)).toEqual([
      "duct_leakage",
      "airflow",
      "refrigerant_charge",
    ]);
  });

  it("all_new forced-air split includes duct leakage, airflow, fan efficacy, air filter, and refrigerant", () => {
    const result = resolveEccScenario({
      projectType: "all_new",
      systemEquipment: [{ component_type: "outdoor_unit" }, { component_type: "air_handler" }],
    });

    expect(result.scenario).toBe("all_new_ductwork_plus_split_system");
    expect(result.suggestedTests.map((test) => test.testType)).toEqual([
      "duct_leakage",
      "airflow",
      "air_filter_device",
      "refrigerant_charge",
      "fan_watt_draw",
    ]);
  });

  it("all_new mini-split remains refrigerant-charge only", () => {
    const result = resolveEccScenario({
      projectType: "all_new",
      systemEquipment: [{ component_type: "mini_split_head" }, { component_type: "mini_split_outdoor" }],
    });

    expect(result.scenario).toBe("mini_split");
    expect(result.suggestedTests.map((test) => test.testType)).toEqual(["refrigerant_charge"]);
  });
});
