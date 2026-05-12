import { describe, expect, it } from "vitest";

import {
  buildAirFilterDevicePayload,
  computeAirFilterDeviceResult,
  ensureAirFilterDeviceCompletionFields,
  formatAreaSquareInches,
} from "@/lib/ecc/air-filter-device";

describe("air filter device verification", () => {
  it("computes calculated and required face area from entered values", () => {
    const result = computeAirFilterDeviceResult({
      filterLocationDescription: "Return grille",
      rackType: "Media cabinet",
      designAirflowCfm: 1200,
      nominalDepthInches: 2,
      nominalLengthInches: 20,
      nominalWidthInches: 25,
      designAllowablePressureDropIwc: 0.3,
      notes: null,
    });

    expect(result.calculated_nominal_face_area_sq_in).toBe(500);
    expect(result.required_minimum_face_area_sq_in).toBeCloseTo((1200 / 150) * 144, 6);
    expect(result.face_area_compliance).toBe("does_not_comply");
    expect(result.compliance_statement).toBe("Air filter device face area does not comply");
    expect(formatAreaSquareInches(result.required_minimum_face_area_sq_in)).toBe("1152.00");
  });

  it("passes when calculated face area meets or exceeds required minimum", () => {
    const result = computeAirFilterDeviceResult({
      filterLocationDescription: "Return grille",
      rackType: "Media cabinet",
      designAirflowCfm: 600,
      nominalDepthInches: 2,
      nominalLengthInches: 30,
      nominalWidthInches: 20,
      designAllowablePressureDropIwc: 0.2,
      notes: null,
    });

    expect(result.calculated_nominal_face_area_sq_in).toBe(600);
    expect(result.required_minimum_face_area_sq_in).toBeCloseTo((600 / 150) * 144, 6);
    expect(result.face_area_compliance).toBe("complies");
    expect(result.compliance_statement).toBe("Air filter device face area complies");
  });

  it("builds payloads with draft-friendly null computed pass when required values are incomplete", () => {
    const formData = new FormData();
    formData.set("filter_location_description", "Closet return");
    formData.set("rack_type", "Standard");
    formData.set("design_airflow_cfm", "900");
    formData.set("nominal_length_inches", "20");

    const payload = buildAirFilterDevicePayload(formData);

    expect(payload.data).toMatchObject({
      filter_location_description: "Closet return",
      rack_type: "Standard",
      design_airflow_cfm: 900,
      nominal_depth_inches: null,
      nominal_length_inches: 20,
      nominal_width_inches: null,
      design_allowable_pressure_drop_iwc: null,
      notes: null,
    });
    expect(payload.computedPass).toBeNull();
    expect(payload.computed).toMatchObject({
      face_area_compliance: "pending",
      compliance_statement: "Pending inputs",
    });
  });

  it("requires airflow, depth, length, and width to complete", () => {
    const formData = new FormData();
    formData.set("design_airflow_cfm", "900");
    formData.set("nominal_depth_inches", "2");
    formData.set("nominal_length_inches", "20");

    expect(() => ensureAirFilterDeviceCompletionFields(formData)).toThrow(
      "Enter nominal width before completing this test.",
    );
  });
});
