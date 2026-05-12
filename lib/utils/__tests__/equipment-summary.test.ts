import { describe, expect, it } from "vitest";

import { buildEquipmentSummaryLine } from "@/lib/utils/equipment-summary";

describe("buildEquipmentSummaryLine", () => {
  it("includes heating fields for furnace equipment", () => {
    const line = buildEquipmentSummaryLine({
      equipment_role: "furnace",
      manufacturer: "Carrier",
      model: "59TP6",
      serial: "A123",
      heating_capacity_kbtu: "100",
      heating_output_btu: "80000",
      heating_efficiency_percent: "80",
    });

    expect(line).toContain("Furnace");
    expect(line).toContain("Heating Input: 100 KBTU/h");
    expect(line).toContain("Heating Output: 80,000 BTU/h");
    expect(line).toContain("Efficiency / AFUE: 80%");
  });

  it("includes cooling fields for coil/condenser style equipment", () => {
    const line = buildEquipmentSummaryLine({
      equipment_role: "indoor_unit",
      manufacturer: "Lennox",
      model: "C35",
      serial: "B777",
      tonnage: "3.5",
      refrigerant_type: "R-410A",
    });

    expect(line).toContain("Coil");
    expect(line).toContain("Tonnage: 3.5");
    expect(line).toContain("Refrigerant: R-410A");
  });

  it("includes coil manufacturer/model/serial in summary output", () => {
    const line = buildEquipmentSummaryLine({
      equipment_role: "indoor_unit",
      manufacturer: "ADP",
      model: "CAPMP",
      serial: "COIL-991",
    });

    expect(line).toContain("Coil");
    expect(line).toContain("Manufacturer: ADP");
    expect(line).toContain("Model: CAPMP");
    expect(line).toContain("Serial: COIL-991");
  });

  it("uses placeholder markers for missing base identity fields", () => {
    const line = buildEquipmentSummaryLine({
      equipment_role: "furnace",
    });

    expect(line).toContain("Manufacturer: -");
    expect(line).toContain("Model: -");
    expect(line).toContain("Serial: -");
  });

  it("keeps explicit mini-split labels in summary output", () => {
    const outdoor = buildEquipmentSummaryLine({
      equipment_role: "mini_split_outdoor",
      manufacturer: "Mitsubishi",
      model: "MXZ",
      serial: "ODU-1",
    });

    const indoor = buildEquipmentSummaryLine({
      equipment_role: "mini_split_head",
      manufacturer: "Mitsubishi",
      model: "MSZ",
      serial: "IDU-1",
    });

    expect(outdoor).toContain("Mini-Split Outdoor");
    expect(indoor).toContain("Mini-Split Indoor Head");
  });
});
