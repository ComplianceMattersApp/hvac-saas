import { describe, expect, it } from "vitest";

import {
  buildQiiEnv22InsulationPayload,
  ensureQiiEnv22InsulationCompletionFields,
} from "@/lib/ecc/qii-env22-insulation";

function buildFormData() {
  const formData = new FormData();
  formData.set("qii_project_basis_note", "ENV-22 check for attic and walls");
  formData.set("verified_by_name", "Inspector Jane");
  formData.set("verified_at", "2026-03-12");
  formData.set("overall_qii_status", "partial");
  formData.set("general_notes", "Follow-up needed in attic area");

  formData.append("insulation_location[]", "Attic");
  formData.append("insulation_type[]", "Loose Fill");
  formData.append("insulation_brand[]", "Brand A");
  formData.append("required_r_value[]", "38");
  formData.append("installed_r_value[]", "30");
  formData.append("required_depth[]", "12");
  formData.append("observed_depth[]", "10");
  formData.append("depth_unit[]", "in");
  formData.append("manufacturer_label_provided[]", "yes");
  formData.append("loose_fill_coverage_chart_confirmed[]", "yes");
  formData.append("loose_fill_density_verified[]", "no");
  formData.append("loose_fill_depth_locations_checked[]", "4");
  formData.append("loose_fill_attic_rulers_installed[]", "no");
  formData.append("verification_status[]", "needs_correction");
  formData.append("correction_notes[]", "Increase insulation depth in two bays");
  formData.append("entry_notes[]", "Photo evidence attached");

  return formData;
}

describe("qii env-22 insulation payload", () => {
  it("builds top-level and row-level payload fields", () => {
    const payload = buildQiiEnv22InsulationPayload(buildFormData());

    expect(payload.data).toMatchObject({
      qii_project_basis_note: "ENV-22 check for attic and walls",
      verified_by_name: "Inspector Jane",
      verified_at: "2026-03-12",
      overall_qii_status: "partial",
      general_notes: "Follow-up needed in attic area",
    });

    expect(payload.data.insulation_entries).toHaveLength(1);
    expect(payload.data.insulation_entries[0]).toMatchObject({
      insulation_location: "Attic",
      insulation_type: "Loose Fill",
      verification_status: "needs_correction",
      correction_notes: "Increase insulation depth in two bays",
    });

    expect(payload.computed.failed_locations).toEqual(["Attic"]);
    expect(payload.computed.entry_count).toBe(1);
    expect(payload.computed.compliance_statement).toContain("require correction");
    expect(payload.computedPass).toBeNull();
  });

  it("requires correction notes for failed rows during completion", () => {
    const formData = buildFormData();
    formData.set("correction_notes[]", "");

    expect(() => ensureQiiEnv22InsulationCompletionFields(formData)).toThrow(
      "Enter correction notes for row 1 when status is fail or needs correction.",
    );
  });

  it("rejects overall pass when any row is not pass or not applicable", () => {
    const formData = buildFormData();
    formData.set("overall_qii_status", "pass");

    expect(() => ensureQiiEnv22InsulationCompletionFields(formData)).toThrow(
      "Overall QII status cannot be pass while any row is marked fail or needs correction.",
    );
  });
});
