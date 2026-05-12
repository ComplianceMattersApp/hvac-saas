import { describe, expect, it } from "vitest";

import {
  buildFanWattDrawPayload,
  computeFanWattDrawResult,
  ensureFanWattDrawCompletionFields,
  formatFanEfficacy,
} from "@/lib/ecc/fan-watt-draw";

describe("fan watt draw / fan efficacy computation", () => {
  it("computes actual fan efficacy as watts divided by airflow and rounds for display", () => {
    const result = computeFanWattDrawResult({
      actualTestedWatts: 346,
      actualTestedAirflowCfm: 788,
      requiredFanEfficacyWPerCfm: 0.45,
      registersFullyOpenAttested: true,
      fanMaxSpeedAttested: true,
      photoTakenAttested: false,
      notes: null,
    });

    expect(result.actual_fan_efficacy_w_per_cfm).toBeCloseTo(346 / 788, 6);
    expect(formatFanEfficacy(result.actual_fan_efficacy_w_per_cfm)).toBe("0.44");
    expect(result.required_fan_efficacy_w_per_cfm).toBe(0.45);
    expect(result.compliance_statement).toBe("System fan efficacy complies");
    expect(result.failures).toHaveLength(0);
  });

  it("fails when actual fan efficacy exceeds the required target", () => {
    const result = computeFanWattDrawResult({
      actualTestedWatts: 400,
      actualTestedAirflowCfm: 788,
      requiredFanEfficacyWPerCfm: 0.45,
      registersFullyOpenAttested: true,
      fanMaxSpeedAttested: true,
      photoTakenAttested: false,
      notes: null,
    });

    expect(result.actual_fan_efficacy_w_per_cfm).toBeCloseTo(400 / 788, 6);
    expect(result.compliance_statement).toBe("System fan efficacy does not comply");
    expect(result.failures).toContain("Actual fan efficacy exceeds required target");
  });

  it("builds payloads that preserve raw inputs and mark partial drafts as incomplete", () => {
    const formData = new FormData();
    formData.set("actual_tested_watts", "346");
    formData.set("required_fan_efficacy_w_per_cfm", "0.45");
    formData.set("registers_fully_open_attested", "on");
    formData.set("notes", "Partial draft");

    const payload = buildFanWattDrawPayload(formData);

    expect(payload.data).toMatchObject({
      actual_tested_watts: 346,
      actual_tested_airflow_cfm: null,
      required_fan_efficacy_w_per_cfm: 0.45,
      registers_fully_open_attested: true,
      fan_max_speed_attested: false,
      photo_taken_attested: false,
      notes: "Partial draft",
    });
    expect(payload.computedPass).toBeNull();
    expect(payload.computed).toMatchObject({
      actual_fan_efficacy_w_per_cfm: null,
      required_fan_efficacy_w_per_cfm: 0.45,
      compliance_statement: "Pending inputs",
    });
  });

  it("requires watts, airflow, and required efficacy to complete", () => {
    const formData = new FormData();
    formData.set("actual_tested_watts", "346");
    formData.set("actual_tested_airflow_cfm", "788");

    expect(() => ensureFanWattDrawCompletionFields(formData)).toThrow(
      "Enter required fan efficacy before completing this test."
    );
  });
});
