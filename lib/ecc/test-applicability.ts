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

function isAllNewProjectType(projectType: string | null | undefined) {
  const normalized = String(projectType ?? "").trim().toLowerCase();
  return (
    normalized === "all_new" ||
    normalized === "allnew" ||
    normalized === "new" ||
    normalized === "new_prescriptive"
  );
}

export function isEccTestApplicableToSystem(
  testType: string | EccTestType,
  context: SystemApplicabilityContext,
) {
  const normalized = normalizeTestType(testType);

  if (normalized === "air_filter_device" && !isAllNewProjectType(context.projectType)) {
    return false;
  }

  if (context.heatOnlySystem) {
    return !isTestExcludedForHeatOnly(testType);
  }

  if (context.ductlessMiniSplit) {
    return !isTestExcludedForDuctlessMiniSplit(testType);
  }

  return true;
}
