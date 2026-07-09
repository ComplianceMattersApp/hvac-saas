import type { EccTestType } from "@/lib/ecc/test-registry";

type SystemApplicabilityContext = {
  heatOnlySystem: boolean;
  ductlessMiniSplit: boolean;
  projectType?: string | null;
};

function normalizeTestType(testType: string | EccTestType) {
  return String(testType ?? "").trim().toLowerCase();
}

function isTestExcludedForHeatOnly(testType: string | EccTestType) {
  const normalized = normalizeTestType(testType);
  return normalized === "airflow" || normalized === "refrigerant_charge";
}

function isTestExcludedForDuctlessMiniSplit(testType: string | EccTestType) {
  const normalized = normalizeTestType(testType);
  return (
    normalized === "airflow" ||
    normalized === "duct_leakage" ||
    normalized === "fan_watt_draw" ||
    normalized === "air_filter_device"
  );
}

export function isEccTestApplicableToSystem(
  testType: string | EccTestType,
  context: SystemApplicabilityContext,
) {
  if (context.heatOnlySystem) {
    return !isTestExcludedForHeatOnly(testType);
  }

  if (context.ductlessMiniSplit) {
    return !isTestExcludedForDuctlessMiniSplit(testType);
  }

  return true;
}
