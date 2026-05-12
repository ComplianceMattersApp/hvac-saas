import { describe, expect, it } from "vitest";

import {
  buildAhriVerificationPayload,
  ensureAhriVerificationCompletionFields,
} from "@/lib/ecc/ahri-verification";

function baseFormData() {
  const formData = new FormData();
  formData.set("ahri_status", "verified_listed");
  formData.set("ahri_certificate_number", "CERT-123");
  formData.set("verified_by_name", "Office User");
  formData.set("verified_at", "2026-05-11");
  formData.set("verification_notes", "Checked against AHRI directory");
  formData.set("matched_equipment_summary", "Outdoor X + Coil Y + Furnace Z");
  formData.set("outdoor_model", "X100");
  formData.set("indoor_coil_model", "Y200");
  formData.set("furnace_or_air_handler_model", "Z300");
  return formData;
}

describe("ahri verification helper", () => {
  it("builds expected payload and neutral computed pass", () => {
    const payload = buildAhriVerificationPayload(baseFormData());

    expect(payload.data).toMatchObject({
      ahri_status: "verified_listed",
      ahri_certificate_number: "CERT-123",
      verified_by_name: "Office User",
      verified_at: "2026-05-11",
      verification_notes: "Checked against AHRI directory",
      matched_equipment_summary: "Outdoor X + Coil Y + Furnace Z",
      outdoor_model: "X100",
      indoor_coil_model: "Y200",
      furnace_or_air_handler_model: "Z300",
      mini_split_outdoor_model: null,
      mini_split_head_model: null,
    });

    expect(payload.computed.office_verification_status).toBe("verified_listed");
    expect(payload.computed.compliance_statement).toContain("verified/listed");
    expect(payload.computed.missing_equipment_model_fields).toContain("mini_split_outdoor_model");
    expect(payload.computedPass).toBeNull();
  });

  it("requires status on completion", () => {
    const formData = new FormData();
    expect(() => ensureAhriVerificationCompletionFields(formData)).toThrow(
      "Select AHRI verification status before completing this test.",
    );
  });

  it("requires certificate for verified/listed completion", () => {
    const formData = new FormData();
    formData.set("ahri_status", "verified_listed");

    expect(() => ensureAhriVerificationCompletionFields(formData)).toThrow(
      "Enter AHRI certificate/reference number before completing a verified/listed AHRI test.",
    );
  });

  it("allows completion for not_found without certificate", () => {
    const formData = new FormData();
    formData.set("ahri_status", "not_found");
    formData.set("verification_notes", "No listing found");

    expect(() => ensureAhriVerificationCompletionFields(formData)).not.toThrow();
  });
});
