import { describe, expect, it } from "vitest";

import { isPackagedUnitEquipmentType, mapToCanonicalRole } from "@/lib/utils/equipment-domain";
import {
  EQUIPMENT_ROLE_OPTIONS,
  equipmentRoleLabel,
  equipmentRoleOptionsForValue,
} from "@/lib/utils/equipment-display";

describe("equipment packaged unit options", () => {
  it("offers gas and heat pump pack unit for new selections and hides generic legacy Pack Unit", () => {
    expect(EQUIPMENT_ROLE_OPTIONS).toEqual(
      expect.arrayContaining([
        { value: "gas_pack_unit", label: "Gas Pack Unit" },
        { value: "heat_pump_pack_unit", label: "Heat Pump Pack Unit" },
      ]),
    );
    expect(EQUIPMENT_ROLE_OPTIONS).not.toEqual(
      expect.arrayContaining([{ value: "package_unit", label: "Pack Unit" }]),
    );
  });

  it("keeps legacy Pack Unit display and edit selections valid", () => {
    expect(equipmentRoleLabel("package_unit")).toBe("Pack Unit");
    expect(equipmentRoleOptionsForValue("package_unit")).toEqual(
      expect.arrayContaining([{ value: "package_unit", label: "Pack Unit" }]),
    );
  });

  it("treats legacy and new packaged unit values as equivalent workflow types", () => {
    expect(isPackagedUnitEquipmentType("package_unit")).toBe(true);
    expect(isPackagedUnitEquipmentType("gas_pack_unit")).toBe(true);
    expect(isPackagedUnitEquipmentType("heat_pump_pack_unit")).toBe(true);
    expect(mapToCanonicalRole("package_gas_electric")).toBe("gas_pack_unit");
    expect(mapToCanonicalRole("package_heat_pump")).toBe("heat_pump_pack_unit");
  });
});
