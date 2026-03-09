// lib/ecc/test-registry.ts

export type VerificationFamily =
  | "ecc"
  | "envelope"
  | "ventilation"
  | "documentation"
  | "custom";

export type EccTestType =
  | "duct_leakage"
  | "airflow"
  | "refrigerant_charge"
  | "fan_watt_draw"
  | "ahri_verification"
  | "custom"
  // framed for later
  | "qii_insulation"
  | "qii_air_sealing"
  | "building_enclosure_leakage"
  | "kitchen_exhaust"
  | "ventilation_airflow"
  | "hrv_erv_verification";

export type ApplicabilityStatus =
  | "required"
  | "optional"
  | "not_included";

export type RunDisposition =
  | "not_started"
  | "in_progress"
  | "completed_pass"
  | "completed_fail"
  | "not_applicable";

export type EccTestDefinition = {
  code: EccTestType;
  label: string;
  shortLabel: string;
  family: VerificationFamily;

  // active now vs framed for later
  active: boolean;

  // can a user manually add this from the Add Test panel?
  allowManualAdd: boolean;

  // can this appear in the "Other / custom" profile?
  allowInCustomProfile: boolean;

  // backend-ready escape hatch
  supportsNotApplicable: boolean;
  requiresReasonWhenNotApplicable: boolean;

  // UI/compute hooks for future componentized architecture
  rendererKey: string | null;
  computeKey: string | null;

  // helps ordering later
  sortOrder: number;
};

export const ECC_TEST_REGISTRY: Record<EccTestType, EccTestDefinition> = {
  duct_leakage: {
    code: "duct_leakage",
    label: "Duct Leakage",
    shortLabel: "Duct Leakage",
    family: "ecc",
    active: true,
    allowManualAdd: true,
    allowInCustomProfile: true,
    supportsNotApplicable: false,
    requiresReasonWhenNotApplicable: false,
    rendererKey: "duct_leakage",
    computeKey: "duct_leakage",
    sortOrder: 10,
  },

  airflow: {
    code: "airflow",
    label: "Airflow",
    shortLabel: "Airflow",
    family: "ecc",
    active: true,
    allowManualAdd: true,
    allowInCustomProfile: true,
    supportsNotApplicable: false,
    requiresReasonWhenNotApplicable: false,
    rendererKey: "airflow",
    computeKey: "airflow",
    sortOrder: 20,
  },

  refrigerant_charge: {
    code: "refrigerant_charge",
    label: "Refrigerant Charge Verification",
    shortLabel: "Refrigerant Charge",
    family: "ecc",
    active: true,
    allowManualAdd: true,
    allowInCustomProfile: true,
    supportsNotApplicable: true,
    requiresReasonWhenNotApplicable: true,
    rendererKey: "refrigerant_charge",
    computeKey: "refrigerant_charge",
    sortOrder: 30,
  },

  ahri_verification: {
    code: "ahri_verification",
    label: "AHRI Equipment Match Verification",
    shortLabel: "AHRI Verification",
    family: "documentation",
    active: true,
    allowManualAdd: true,
    allowInCustomProfile: true,
    supportsNotApplicable: true,
    requiresReasonWhenNotApplicable: true,
    rendererKey: "ahri_verification",
    computeKey: "ahri_verification",
    sortOrder: 40,
  },

  fan_watt_draw: {
    code: "fan_watt_draw",
    label: "Fan Watt Draw",
    shortLabel: "Watt Draw",
    family: "ecc",
    active: true,
    allowManualAdd: true,
    allowInCustomProfile: true,
    supportsNotApplicable: true,
    requiresReasonWhenNotApplicable: true,
    rendererKey: "fan_watt_draw",
    computeKey: "fan_watt_draw",
    sortOrder: 50,
  },

  custom: {
    code: "custom",
    label: "Custom Verification",
    shortLabel: "Custom",
    family: "custom",
    active: true,
    allowManualAdd: true,
    allowInCustomProfile: true,
    supportsNotApplicable: false,
    requiresReasonWhenNotApplicable: false,
    rendererKey: "custom",
    computeKey: null,
    sortOrder: 999,
  },

  // -------- Framed for later / inactive placeholders --------

  qii_insulation: {
    code: "qii_insulation",
    label: "QII Insulation Installation",
    shortLabel: "QII Insulation",
    family: "envelope",
    active: false,
    allowManualAdd: false,
    allowInCustomProfile: false,
    supportsNotApplicable: true,
    requiresReasonWhenNotApplicable: true,
    rendererKey: "qii_insulation",
    computeKey: "qii_insulation",
    sortOrder: 200,
  },

  qii_air_sealing: {
    code: "qii_air_sealing",
    label: "QII Air Sealing",
    shortLabel: "QII Air Sealing",
    family: "envelope",
    active: false,
    allowManualAdd: false,
    allowInCustomProfile: false,
    supportsNotApplicable: true,
    requiresReasonWhenNotApplicable: true,
    rendererKey: "qii_air_sealing",
    computeKey: "qii_air_sealing",
    sortOrder: 210,
  },

  building_enclosure_leakage: {
    code: "building_enclosure_leakage",
    label: "Building Enclosure Leakage",
    shortLabel: "Envelope Leakage",
    family: "envelope",
    active: false,
    allowManualAdd: false,
    allowInCustomProfile: false,
    supportsNotApplicable: true,
    requiresReasonWhenNotApplicable: true,
    rendererKey: "building_enclosure_leakage",
    computeKey: "building_enclosure_leakage",
    sortOrder: 220,
  },

  kitchen_exhaust: {
    code: "kitchen_exhaust",
    label: "Kitchen Exhaust Verification",
    shortLabel: "Kitchen Exhaust",
    family: "ventilation",
    active: false,
    allowManualAdd: false,
    allowInCustomProfile: false,
    supportsNotApplicable: true,
    requiresReasonWhenNotApplicable: true,
    rendererKey: "kitchen_exhaust",
    computeKey: "kitchen_exhaust",
    sortOrder: 300,
  },

  ventilation_airflow: {
    code: "ventilation_airflow",
    label: "Whole House Ventilation Airflow",
    shortLabel: "Ventilation Airflow",
    family: "ventilation",
    active: false,
    allowManualAdd: false,
    allowInCustomProfile: false,
    supportsNotApplicable: true,
    requiresReasonWhenNotApplicable: true,
    rendererKey: "ventilation_airflow",
    computeKey: "ventilation_airflow",
    sortOrder: 310,
  },

  hrv_erv_verification: {
    code: "hrv_erv_verification",
    label: "HRV / ERV Verification",
    shortLabel: "HRV/ERV",
    family: "ventilation",
    active: false,
    allowManualAdd: false,
    allowInCustomProfile: false,
    supportsNotApplicable: true,
    requiresReasonWhenNotApplicable: true,
    rendererKey: "hrv_erv_verification",
    computeKey: "hrv_erv_verification",
    sortOrder: 320,
  },
};

export function getTestDefinition(testType: string | null | undefined): EccTestDefinition | null {
  if (!testType) return null;
  return ECC_TEST_REGISTRY[testType as EccTestType] ?? null;
}

export function getActiveManualAddTests(): EccTestDefinition[] {
  return Object.values(ECC_TEST_REGISTRY)
    .filter((t) => t.active && t.allowManualAdd)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function isKnownTestType(testType: string | null | undefined): testType is EccTestType {
  if (!testType) return false;
  return testType in ECC_TEST_REGISTRY;
}