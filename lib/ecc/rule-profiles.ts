// lib/ecc/rule-profiles.ts

import type { EccTestType } from "@/lib/ecc/test-registry";


export type RuleProfileCode =
  | "alteration"
  | "new_prescriptive"
  | "other";

export type ThresholdUnit =
  | "percent"
  | "cfm_per_ton"
  | "cfm"
  | "ratio"
  | "lookup"
  | "manual"
  | "none";

export type ThresholdOperator =
  | "lte"
  | "gte"
  | "eq"
  | "lookup"
  | "manual"
  | "none";

export type TestThresholdRule = {
  targetValue: number | string | null;
  unit: ThresholdUnit;
  operator: ThresholdOperator;
  notes?: string | null;
};

export type RuleProfileTestConfig = {
  testType: EccTestType;
  required: boolean;
  allowManualAdd?: boolean;
  supportsNotApplicable?: boolean;

  // default thresholds/rule hints for compute layer
  threshold?: TestThresholdRule | null;
};

export type RuleProfile = {
  code: RuleProfileCode;
  label: string;
  description: string;

  tests: RuleProfileTestConfig[];
};


const PACKAGE_ALIASES = new Set([
  "pack_unit",
  "package",
  "package_unit",
  "package_gas_electric",
  "package_heat_pump",
]);

type SystemEquipmentLike = {
  component_type?: string | null;
  equipment_role?: string | null;
};

function normalizeEquipmentType(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function isPackageSystem(systemEquipment: SystemEquipmentLike[] | null | undefined): boolean {
  return (systemEquipment ?? []).some((eq) => {
    const componentType = normalizeEquipmentType(eq?.component_type);
    const equipmentRole = normalizeEquipmentType(eq?.equipment_role);

    if (PACKAGE_ALIASES.has(componentType) || PACKAGE_ALIASES.has(equipmentRole)) {
      return true;
    }

    // Legacy fallback: treat explicit package-like free-text as package systems.
    return (
      componentType.includes("package") ||
      componentType.includes("pack_unit") ||
      equipmentRole.includes("package") ||
      equipmentRole.includes("pack_unit")
    );
  });
}

export function getRequiredTestsForSystem(args: {
  projectType: string | null | undefined;
  systemEquipment: SystemEquipmentLike[] | null | undefined;
}): EccTestType[] {
  const base = getRequiredTestsForProjectType(args.projectType);

  if (!base.length) return base;

  if (isPackageSystem(args.systemEquipment)) {
    return base.filter((t) => t !== "refrigerant_charge");
  }

  return base;
}

export const ECC_RULE_PROFILES: Record<RuleProfileCode, RuleProfile> = {
  alteration: {
    code: "alteration",
    label: "Alteration",
    description: "Standard alteration workflow.",
    tests: [
      {
        testType: "duct_leakage",
        required: true,
        threshold: {
          targetValue: 10,
          unit: "percent",
          operator: "lte",
          notes: "Operational display target for alteration duct leakage.",
        },
      },
      {
        testType: "airflow",
        required: true,
        threshold: {
          targetValue: 300,
          unit: "cfm_per_ton",
          operator: "gte",
          notes: "Alteration airflow target.",
        },
      },
      {
        testType: "refrigerant_charge",
        required: true,
        supportsNotApplicable: true,
        threshold: {
          targetValue: null,
          unit: "none",
          operator: "none",
          notes: "Uses refrigerant charge-specific evaluation logic.",
        },
      },
    ],
  },

  new_prescriptive: {
    code: "new_prescriptive",
    label: "New Prescriptive",
    description: "Prescriptive new-system workflow.",
    tests: [
      {
        testType: "duct_leakage",
        required: true,
        threshold: {
          targetValue: 5,
          unit: "percent",
          operator: "lte",
          notes: "New prescriptive duct leakage target.",
        },
      },
      {
        testType: "airflow",
        required: true,
        threshold: {
          targetValue: 350,
          unit: "cfm_per_ton",
          operator: "gte",
          notes: "New prescriptive airflow target.",
        },
      },
      {
        testType: "refrigerant_charge",
        required: true,
        supportsNotApplicable: true,
        threshold: {
          targetValue: null,
          unit: "none",
          operator: "none",
          notes: "Uses refrigerant charge-specific evaluation logic.",
        },
      },
      {
        testType: "ahri_verification",
        required: true,
        supportsNotApplicable: true,
        threshold: {
          targetValue: "matched_equipment_required",
          unit: "lookup",
          operator: "lookup",
          notes: "Model/coil/condenser match verification.",
        },
      },
      {
        testType: "fan_watt_draw",
        required: true,
        supportsNotApplicable: true,
        threshold: {
          targetValue: null,
          unit: "manual",
          operator: "manual",
          notes: "Uses watt draw-specific evaluation logic.",
        },
      },
    ],
  },

  other: {
    code: "other",
    label: "Other / Custom",
    description: "User-selected verification set.",
    tests: [],
  },
};

export function normalizeProjectTypeToRuleProfile(
  projectType: string | null | undefined,
): RuleProfileCode {
  const value = String(projectType ?? "").trim().toLowerCase();

  if (value === "alteration") return "alteration";
  if (value === "all_new" || value === "allnew" || value === "new" || value === "new_prescriptive") {
    return "new_prescriptive";
  }

  return "other";
}

export function getRuleProfileForProjectType(projectType: string | null | undefined): RuleProfile {
  const code = normalizeProjectTypeToRuleProfile(projectType);
  return ECC_RULE_PROFILES[code];
}

export function getRequiredTestsForProjectType(projectType: string | null | undefined): EccTestType[] {
  const profile = getRuleProfileForProjectType(projectType);
  return profile.tests.filter((t) => t.required).map((t) => t.testType);
}

export function getThresholdRuleForTest(
  projectType: string | null | undefined,
  testType: EccTestType,
): TestThresholdRule | null {
  const profile = getRuleProfileForProjectType(projectType);
  const match = profile.tests.find((t) => t.testType === testType);
  return match?.threshold ?? null;
}

export function isTestRequiredForProjectType(
  projectType: string | null | undefined,
  testType: EccTestType,
): boolean {
  return getRequiredTestsForProjectType(projectType).includes(testType);
}