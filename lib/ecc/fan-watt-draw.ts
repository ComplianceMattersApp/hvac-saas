type FanWattDrawFormValues = {
  actualTestedWatts: number | null;
  actualTestedAirflowCfm: number | null;
  requiredFanEfficacyWPerCfm: number | null;
  registersFullyOpenAttested: boolean;
  fanMaxSpeedAttested: boolean;
  photoTakenAttested: boolean;
  notes: string | null;
};

export type FanWattDrawComputation = {
  actual_fan_efficacy_w_per_cfm: number | null;
  required_fan_efficacy_w_per_cfm: number | null;
  compliance_statement: string;
  failures: string[];
};

export type FanWattDrawPayload = {
  data: Record<string, unknown>;
  computed: Record<string, unknown>;
  computedPass: boolean | null;
};

function parseNumber(value: FormDataEntryValue | null): number | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTwoDecimals(value: number | null): string {
  if (value == null) return "—";
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

export function computeFanWattDrawResult(values: FanWattDrawFormValues): FanWattDrawComputation {
  const actualFanEfficacy =
    values.actualTestedWatts != null &&
    values.actualTestedAirflowCfm != null &&
    values.actualTestedAirflowCfm > 0
      ? values.actualTestedWatts / values.actualTestedAirflowCfm
      : null;

  const requiredFanEfficacy = values.requiredFanEfficacyWPerCfm;
  const hasComparableValues = actualFanEfficacy != null && requiredFanEfficacy != null;
  const passes = hasComparableValues ? actualFanEfficacy <= requiredFanEfficacy : false;
  const failures: string[] = [];

  if (hasComparableValues && !passes) {
    failures.push("Actual fan efficacy exceeds required target");
  }

  const complianceStatement = hasComparableValues
    ? passes
      ? "System fan efficacy complies"
      : "System fan efficacy does not comply"
    : "Pending inputs";

  return {
    actual_fan_efficacy_w_per_cfm: actualFanEfficacy,
    required_fan_efficacy_w_per_cfm: requiredFanEfficacy,
    compliance_statement: complianceStatement,
    failures,
  };
}

function parseFanWattDrawFormValues(formData: FormData): FanWattDrawFormValues {
  return {
    actualTestedWatts: parseNumber(formData.get("actual_tested_watts")),
    actualTestedAirflowCfm: parseNumber(formData.get("actual_tested_airflow_cfm")),
    requiredFanEfficacyWPerCfm: parseNumber(formData.get("required_fan_efficacy_w_per_cfm")),
    registersFullyOpenAttested: formData.get("registers_fully_open_attested") === "on",
    fanMaxSpeedAttested: formData.get("fan_max_speed_attested") === "on",
    photoTakenAttested: formData.get("photo_taken_attested") === "on",
    notes: String(formData.get("notes") || "").trim() || null,
  };
}

export function ensureFanWattDrawCompletionFields(formData: FormData) {
  const values = parseFanWattDrawFormValues(formData);

  if (values.actualTestedWatts == null) {
    throw new Error("Enter actual tested watts before completing this test.");
  }

  if (values.actualTestedAirflowCfm == null) {
    throw new Error("Enter actual tested airflow before completing this test.");
  }

  if (values.requiredFanEfficacyWPerCfm == null) {
    throw new Error("Enter required fan efficacy before completing this test.");
  }
}

export function buildFanWattDrawPayload(formData: FormData): FanWattDrawPayload {
  const values = parseFanWattDrawFormValues(formData);
  const result = computeFanWattDrawResult(values);

  const computedPass =
    result.actual_fan_efficacy_w_per_cfm != null &&
    result.required_fan_efficacy_w_per_cfm != null
      ? result.actual_fan_efficacy_w_per_cfm <= result.required_fan_efficacy_w_per_cfm
      : null;

  const data = {
    actual_tested_watts: values.actualTestedWatts,
    actual_tested_airflow_cfm: values.actualTestedAirflowCfm,
    required_fan_efficacy_w_per_cfm: values.requiredFanEfficacyWPerCfm,
    registers_fully_open_attested: values.registersFullyOpenAttested,
    fan_max_speed_attested: values.fanMaxSpeedAttested,
    photo_taken_attested: values.photoTakenAttested,
    notes: values.notes,
  };

  const computed = {
    actual_fan_efficacy_w_per_cfm: result.actual_fan_efficacy_w_per_cfm,
    required_fan_efficacy_w_per_cfm: result.required_fan_efficacy_w_per_cfm,
    compliance_statement: result.compliance_statement,
    failures: result.failures,
    status:
      result.actual_fan_efficacy_w_per_cfm == null || result.required_fan_efficacy_w_per_cfm == null
        ? "pending"
        : computedPass === true
          ? "pass"
          : "fail",
  };

  return { data, computed, computedPass };
}

export function formatFanEfficacy(value: number | null): string {
  return formatTwoDecimals(value);
}
