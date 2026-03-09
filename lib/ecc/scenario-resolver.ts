import type { EccTestType } from "@/lib/ecc/test-registry";

export type EquipmentLike = {
  component_type?: string | null;
  equipment_role?: string | null;
};

export type EccScenarioCode =
  | "furnace_only_alteration"
  | "condenser_only_alteration"
  | "coil_only_alteration"
  | "split_system_alteration"
  | "package_unit_alteration"
  | "all_new_ductwork_only"
  | "all_new_ductwork_plus_furnace"
  | "all_new_ductwork_plus_condenser"
  | "all_new_ductwork_plus_split_system"
  | "all_new_ductwork_plus_package_unit"
  | "mini_split"
  | "new_construction_plan_driven"
  | "unknown";

export type SuggestedTestRule = {
  testType: EccTestType;
  required: boolean;
  threshold?: {
    value: number | string | null;
    unit: string;
    operator: string;
  } | null;
  note?: string | null;
};

export type EccScenarioResult = {
  scenario: EccScenarioCode;
  suggestedTests: SuggestedTestRule[];
  notes: string[];
};

function normalizeOneType(raw: string): string {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return "";

  const normalized = value.replace(/[\s-]+/g, "_");

  // canonical mappings
  if (normalized === "outdoor_unit") return "outdoor_unit";
  if (normalized === "condenser") return "outdoor_unit";
  if (normalized === "condenser_ac") return "outdoor_unit";

  if (normalized === "coil") return "coil";

  if (normalized === "air_handler") return "air_handler";
  if (normalized === "air_handler_electric") return "air_handler";

  if (normalized === "furnace") return "furnace";
  if (normalized === "furnace_gas") return "furnace";

  if (normalized === "heat_pump") return "heat_pump";
  if (normalized === "heat_pump_outdoor") return "heat_pump";

  if (normalized === "pack_unit") return "package_unit";
  if (normalized === "package_unit") return "package_unit";
  if (normalized === "package_gas_electric") return "package_unit";
  if (normalized === "package_heat_pump") return "package_unit";

  if (normalized === "mini_split_outdoor") return "mini_split_outdoor";
  if (normalized === "mini_split_head") return "mini_split_head";

  if (normalized === "other") return "other";

  return normalized;
}

function normalizeTypes(systemEquipment: EquipmentLike[]): string[] {
  return systemEquipment
    .map((eq) => {
      // prefer component_type, but fall back to equipment_role
      const raw = eq?.component_type ?? eq?.equipment_role ?? "";
      return normalizeOneType(raw);
    })
    .filter(Boolean);
}

function has(types: string[], value: string) {
  return types.includes(value);
}

function hasAny(types: string[], values: string[]) {
  return values.some((v) => types.includes(v));
}

export function resolveEccScenario(args: {
  projectType: string | null | undefined;
  systemEquipment: EquipmentLike[] | null | undefined;
}): EccScenarioResult {
  const projectType = String(args.projectType ?? "").trim().toLowerCase();
  const types = normalizeTypes(args.systemEquipment ?? []);

  const hasFurnace = has(types, "furnace");
  const hasCondenser = has(types, "outdoor_unit");
  const hasCoil = has(types, "coil");
  const hasAirHandler = has(types, "air_handler");
  const hasHeatPump = has(types, "heat_pump");
  const hasPackage = has(types, "package_unit");
  const hasMiniSplitOutdoor = has(types, "mini_split_outdoor");
  const hasMiniSplitHead = has(types, "mini_split_head");

  const isMiniSplit = hasMiniSplitOutdoor || hasMiniSplitHead;
  const isSplitLike =
    hasCondenser || hasCoil || hasFurnace || hasAirHandler || hasHeatPump;

  if (projectType === "new_construction") {
    return {
      scenario: "new_construction_plan_driven",
      suggestedTests: [],
      notes: ["New construction will use plan-driven logic later."],
    };
  }

  if (isMiniSplit) {
    return {
      scenario: "mini_split",
      suggestedTests: [
        {
          testType: "refrigerant_charge",
          required: true,
          note: "Mini-splits require weigh-in workflow.",
        },
      ],
      notes: [
        "Capture outdoor condenser model and serial.",
        "Capture indoor head model and serial.",
      ],
    };
  }

  if (projectType === "alteration") {
    if (hasPackage) {
      return {
        scenario: "package_unit_alteration",
        suggestedTests: [
          {
            testType: "duct_leakage",
            required: true,
            threshold: { value: 10, unit: "percent", operator: "lte" },
          },
          {
            testType: "airflow",
            required: true,
            threshold: { value: 300, unit: "cfm_per_ton", operator: "gte" },
          },
        ],
        notes: ["Package unit: no refrigerant charge verification."],
      };
    }

    if (hasFurnace && !hasCondenser && !hasCoil && !hasAirHandler && !hasHeatPump) {
      return {
        scenario: "furnace_only_alteration",
        suggestedTests: [
          {
            testType: "duct_leakage",
            required: true,
            threshold: { value: 10, unit: "percent", operator: "lte" },
          },
        ],
        notes: [],
      };
    }

    if (hasCondenser && !hasCoil && !hasFurnace && !hasAirHandler && !hasHeatPump) {
      return {
        scenario: "condenser_only_alteration",
        suggestedTests: [
          {
            testType: "duct_leakage",
            required: true,
            threshold: { value: 10, unit: "percent", operator: "lte" },
          },
          {
            testType: "airflow",
            required: true,
            threshold: { value: 300, unit: "cfm_per_ton", operator: "gte" },
          },
          {
            testType: "refrigerant_charge",
            required: true,
          },
        ],
        notes: [],
      };
    }

    if (hasCoil && !hasCondenser && !hasFurnace && !hasAirHandler && !hasHeatPump) {
      return {
        scenario: "coil_only_alteration",
        suggestedTests: [
          {
            testType: "airflow",
            required: true,
            threshold: { value: 300, unit: "cfm_per_ton", operator: "gte" },
          },
          {
            testType: "refrigerant_charge",
            required: true,
          },
        ],
        notes: [],
      };
    }

    if (isSplitLike) {
      return {
        scenario: "split_system_alteration",
        suggestedTests: [
          {
            testType: "duct_leakage",
            required: true,
            threshold: { value: 10, unit: "percent", operator: "lte" },
          },
          {
            testType: "airflow",
            required: true,
            threshold: { value: 300, unit: "cfm_per_ton", operator: "gte" },
          },
          {
            testType: "refrigerant_charge",
            required: true,
          },
        ],
        notes: [],
      };
    }
  }

  if (projectType === "all_new") {
    if (hasPackage) {
      return {
        scenario: "all_new_ductwork_plus_package_unit",
        suggestedTests: [
          {
            testType: "duct_leakage",
            required: true,
            threshold: { value: 5, unit: "percent", operator: "lte" },
          },
          {
            testType: "airflow",
            required: true,
            threshold: { value: 350, unit: "cfm_per_ton", operator: "gte" },
          },
          {
            testType: "fan_watt_draw",
            required: true,
          },
        ],
        notes: ["Package unit: no refrigerant charge verification."],
      };
    }

    if (!types.length) {
      return {
        scenario: "all_new_ductwork_only",
        suggestedTests: [
          {
            testType: "duct_leakage",
            required: true,
            threshold: { value: 5, unit: "percent", operator: "lte" },
          },
        ],
        notes: [],
      };
    }

    if (hasFurnace && !hasCondenser && !hasCoil && !hasAirHandler && !hasHeatPump) {
      return {
        scenario: "all_new_ductwork_plus_furnace",
        suggestedTests: [
          {
            testType: "duct_leakage",
            required: true,
            threshold: { value: 5, unit: "percent", operator: "lte" },
          },
        ],
        notes: [],
      };
    }

    if (hasCondenser && !hasCoil && !hasFurnace && !hasAirHandler && !hasHeatPump) {
      return {
        scenario: "all_new_ductwork_plus_condenser",
        suggestedTests: [
          {
            testType: "duct_leakage",
            required: true,
            threshold: { value: 5, unit: "percent", operator: "lte" },
          },
          {
            testType: "airflow",
            required: true,
            threshold: { value: 350, unit: "cfm_per_ton", operator: "gte" },
          },
          {
            testType: "refrigerant_charge",
            required: true,
          },
          {
            testType: "fan_watt_draw",
            required: true,
          },
        ],
        notes: [],
      };
    }

    if (hasAny(types, ["outdoor_unit", "coil", "furnace", "air_handler", "heat_pump"])) {
      return {
        scenario: "all_new_ductwork_plus_split_system",
        suggestedTests: [
          {
            testType: "duct_leakage",
            required: true,
            threshold: { value: 5, unit: "percent", operator: "lte" },
          },
          {
            testType: "airflow",
            required: true,
            threshold: { value: 350, unit: "cfm_per_ton", operator: "gte" },
          },
          {
            testType: "refrigerant_charge",
            required: true,
          },
          {
            testType: "fan_watt_draw",
            required: true,
          },
        ],
        notes: [],
      };
    }
  }

  return {
    scenario: "unknown",
    suggestedTests: [],
    notes: ["Unable to detect a standard ECC scenario."],
  };
}