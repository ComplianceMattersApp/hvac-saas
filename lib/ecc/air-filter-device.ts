type AirFilterDeviceFormValues = {
  filterLocationDescription: string | null;
  rackType: string | null;
  designAirflowCfm: number | null;
  nominalDepthInches: number | null;
  nominalLengthInches: number | null;
  nominalWidthInches: number | null;
  designAllowablePressureDropIwc: number | null;
  notes: string | null;
};

export type AirFilterDeviceComputation = {
  calculated_nominal_face_area_sq_in: number | null;
  required_minimum_face_area_sq_in: number | null;
  face_area_compliance: "complies" | "does_not_comply" | "pending";
  compliance_statement: string;
  failures: string[];
};

export type AirFilterDevicePayload = {
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

function parseAirFilterDeviceFormValues(formData: FormData): AirFilterDeviceFormValues {
  return {
    filterLocationDescription: String(formData.get("filter_location_description") || "").trim() || null,
    rackType: String(formData.get("rack_type") || "").trim() || null,
    designAirflowCfm: parseNumber(formData.get("design_airflow_cfm")),
    nominalDepthInches: parseNumber(formData.get("nominal_depth_inches")),
    nominalLengthInches: parseNumber(formData.get("nominal_length_inches")),
    nominalWidthInches: parseNumber(formData.get("nominal_width_inches")),
    designAllowablePressureDropIwc: parseNumber(formData.get("design_allowable_pressure_drop_iwc")),
    notes: String(formData.get("notes") || "").trim() || null,
  };
}

export function computeAirFilterDeviceResult(values: AirFilterDeviceFormValues): AirFilterDeviceComputation {
  const calculatedNominalFaceAreaSqIn =
    values.nominalLengthInches != null && values.nominalWidthInches != null
      ? values.nominalLengthInches * values.nominalWidthInches
      : null;

  const requiredMinimumFaceAreaSqIn =
    values.designAirflowCfm != null ? (values.designAirflowCfm / 150) * 144 : null;

  const hasComparableValues =
    calculatedNominalFaceAreaSqIn != null && requiredMinimumFaceAreaSqIn != null;

  const passes = hasComparableValues
    ? calculatedNominalFaceAreaSqIn >= requiredMinimumFaceAreaSqIn
    : false;

  const failures: string[] = [];
  if (hasComparableValues && !passes) {
    failures.push("Calculated nominal face area is below required minimum face area");
  }

  const faceAreaCompliance: "complies" | "does_not_comply" | "pending" =
    !hasComparableValues ? "pending" : passes ? "complies" : "does_not_comply";

  const complianceStatement =
    !hasComparableValues
      ? "Pending inputs"
      : passes
      ? "Air filter device face area complies"
      : "Air filter device face area does not comply";

  return {
    calculated_nominal_face_area_sq_in: calculatedNominalFaceAreaSqIn,
    required_minimum_face_area_sq_in: requiredMinimumFaceAreaSqIn,
    face_area_compliance: faceAreaCompliance,
    compliance_statement: complianceStatement,
    failures,
  };
}

export function ensureAirFilterDeviceCompletionFields(formData: FormData) {
  const values = parseAirFilterDeviceFormValues(formData);

  if (values.designAirflowCfm == null) {
    throw new Error("Enter design airflow before completing this test.");
  }

  if (values.nominalDepthInches == null) {
    throw new Error("Enter nominal depth before completing this test.");
  }

  if (values.nominalLengthInches == null) {
    throw new Error("Enter nominal length before completing this test.");
  }

  if (values.nominalWidthInches == null) {
    throw new Error("Enter nominal width before completing this test.");
  }
}

export function buildAirFilterDevicePayload(formData: FormData): AirFilterDevicePayload {
  const values = parseAirFilterDeviceFormValues(formData);
  const result = computeAirFilterDeviceResult(values);

  const computedPass =
    result.calculated_nominal_face_area_sq_in != null &&
    result.required_minimum_face_area_sq_in != null
      ? result.calculated_nominal_face_area_sq_in >= result.required_minimum_face_area_sq_in
      : null;

  const data = {
    filter_location_description: values.filterLocationDescription,
    rack_type: values.rackType,
    design_airflow_cfm: values.designAirflowCfm,
    nominal_depth_inches: values.nominalDepthInches,
    nominal_length_inches: values.nominalLengthInches,
    nominal_width_inches: values.nominalWidthInches,
    design_allowable_pressure_drop_iwc: values.designAllowablePressureDropIwc,
    notes: values.notes,
  };

  const computed = {
    calculated_nominal_face_area_sq_in: result.calculated_nominal_face_area_sq_in,
    required_minimum_face_area_sq_in: result.required_minimum_face_area_sq_in,
    face_area_compliance: result.face_area_compliance,
    compliance_statement: result.compliance_statement,
    failures: result.failures,
    status:
      result.calculated_nominal_face_area_sq_in == null ||
      result.required_minimum_face_area_sq_in == null
        ? "pending"
        : computedPass === true
        ? "pass"
        : "fail",
  };

  return { data, computed, computedPass };
}

export function formatAreaSquareInches(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}
