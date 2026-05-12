import { describe, expect, it } from "vitest";

import {
  buildLocalMechanicalExhaustPayload,
  ensureLocalMechanicalExhaustCompletionFields,
} from "@/lib/ecc/local-mechanical-exhaust";

function buildFormData() {
  const formData = new FormData();
  formData.set("building_type", "Single Family");
  formData.set("total_kitchen_floor_area", "150");
  formData.set("kitchen_average_ceiling_height", "9");
  formData.set("kitchen_type", "Non-Enclosed");
  formData.set("system_name", "Kitchen Hood A");
  formData.set("manufacturer_name", "ExhaustCo");
  formData.set("system_type", "Range Hood");
  formData.set("hvi_aham_model_number", "HX-1200");
  formData.set("hvi_aham_rated_airflow_cfm", "300");
  formData.set("hvi_aham_sound_rating", "2.5 sones");
  formData.set("minimum_airflow_cfm", "250");
  formData.set("operation_schedule", "Intermittent");
  formData.set("notes", "Office documented");
  return formData;
}

describe("local mechanical exhaust payload", () => {
  it("builds structured data and optional airflow statement", () => {
    const payload = buildLocalMechanicalExhaustPayload(buildFormData());

    expect(payload.data).toMatchObject({
      building_type: "Single Family",
      total_kitchen_floor_area: 150,
      kitchen_average_ceiling_height: 9,
      kitchen_type: "Non-Enclosed",
      system_name: "Kitchen Hood A",
      manufacturer_name: "ExhaustCo",
      system_type: "Range Hood",
      hvi_aham_model_number: "HX-1200",
      hvi_aham_rated_airflow_cfm: 300,
      minimum_airflow_cfm: 250,
      operation_schedule: "Intermittent",
      notes: "Office documented",
    });
    expect(payload.computed.airflow_compliance_statement).toBe(
      "Rated airflow meets or exceeds minimum airflow.",
    );
    expect(payload.computedPass).toBeNull();
  });

  it("records failure marker when rated airflow is below minimum", () => {
    const formData = buildFormData();
    formData.set("hvi_aham_rated_airflow_cfm", "180");
    formData.set("minimum_airflow_cfm", "250");

    const payload = buildLocalMechanicalExhaustPayload(formData);

    expect(payload.computed.airflow_compliance_statement).toBe(
      "Rated airflow is below the documented minimum airflow.",
    );
    expect(payload.computed.failures).toContain("rated_airflow_below_minimum");
    expect(payload.computedPass).toBeNull();
  });

  it("enforces required fields on completion", () => {
    const formData = new FormData();

    expect(() => ensureLocalMechanicalExhaustCompletionFields(formData)).toThrow(
      "Enter system name or location before completing this test.",
    );

    formData.set("system_name", "Kitchen Hood A");
    expect(() => ensureLocalMechanicalExhaustCompletionFields(formData)).toThrow(
      "Enter manufacturer name before completing this test.",
    );
  });
});
