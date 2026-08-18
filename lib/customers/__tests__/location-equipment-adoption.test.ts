import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  matchCanonicalUnit,
  snapshotCanonicalRole,
  snapshotModel,
  type CanonicalUnit,
  type JobEquipmentSnapshot,
} from "@/lib/customers/location-equipment-adoption";

const migrationSource = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/20260817190000_job_equipment_canonical_link.sql"),
  "utf8",
);

const adoptionModuleSource = readFileSync(
  resolve(__dirname, "../location-equipment-adoption.ts"),
  "utf8",
);

const jobEquipmentActionsSource = readFileSync(
  resolve(__dirname, "../../actions/job-equipment-actions.ts"),
  "utf8",
);

const jobActionsSource = readFileSync(
  resolve(__dirname, "../../actions/job-actions.ts"),
  "utf8",
);

const jobRetestActionsSource = readFileSync(
  resolve(__dirname, "../../actions/job-retest-actions.ts"),
  "utf8",
);

const jobV2PageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/v2/page.tsx"),
  "utf8",
);

const jobInfoPageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/info/page.tsx"),
  "utf8",
);

const equipmentCreateFormSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/EquipmentCreateForm.tsx"),
  "utf8",
);

const equipmentCreateFormFieldsSource = readFileSync(
  resolve(__dirname, "../../../components/jobs/EquipmentCreateFormFields.tsx"),
  "utf8",
);

const alertBannerSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/v2/_components/AlertBanner.tsx"),
  "utf8",
);

function unit(overrides: Partial<CanonicalUnit>): CanonicalUnit {
  return {
    id: "canon-1",
    location_id: "loc-1",
    system_id: "sys-1",
    equipment_type: "heat_pump",
    manufacturer: "Bosch",
    model: "BPBA-36RCB",
    serial: "SER-123",
    notes: null,
    tonnage: 3,
    refrigerant_type: "R-410A",
    heating_capacity_kbtu: null,
    heating_output_btu: null,
    heating_efficiency_percent: null,
    status: "active",
    ...overrides,
  };
}

function snapshot(overrides: Partial<JobEquipmentSnapshot>): JobEquipmentSnapshot {
  return {
    id: "snap-1",
    job_id: "job-1",
    system_id: "job-sys-1",
    system_location: "System 1",
    equipment_role: "heat_pump",
    component_type: null,
    manufacturer: "Bosch",
    model: "BPBA-36RCB",
    model_number: null,
    serial: "SER-123",
    notes: null,
    tonnage: 3,
    refrigerant_type: "R-410A",
    heating_capacity_kbtu: null,
    heating_output_btu: null,
    heating_efficiency_percent: null,
    ...overrides,
  };
}

describe("canonical unit identity matching", () => {
  it("matches by serial first, case- and whitespace-insensitively", () => {
    const result = matchCanonicalUnit(snapshot({ serial: "  ser-123 " }), [
      unit({ serial: "SER-123", manufacturer: "SomethingElse", model: "Other" }),
    ]);
    expect(result?.matchedBy).toBe("serial");
    expect(result?.unit.id).toBe("canon-1");
  });

  it("matches a retired unit by serial — a retired unit is still that physical unit", () => {
    const result = matchCanonicalUnit(snapshot({}), [unit({ status: "retired" })]);
    expect(result?.matchedBy).toBe("serial");
  });

  it("treats a non-matching serial as a distinct unit (no spec fallback)", () => {
    const result = matchCanonicalUnit(snapshot({ serial: "DIFFERENT" }), [unit({})]);
    expect(result).toBeNull();
  });

  it("falls back to role+manufacturer+model among ACTIVE units when the snapshot has no serial", () => {
    const retired = unit({ id: "old", status: "retired", serial: null });
    const active = unit({ id: "new", serial: null });
    const result = matchCanonicalUnit(snapshot({ serial: null }), [retired, active]);
    expect(result?.matchedBy).toBe("specs");
    expect(result?.unit.id).toBe("new");
  });

  it("refuses to match a snapshot with no serial, manufacturer, or model", () => {
    const result = matchCanonicalUnit(
      snapshot({ serial: null, manufacturer: null, model: null, model_number: null }),
      [unit({ serial: null, manufacturer: null, model: null })],
    );
    expect(result).toBeNull();
  });

  it("normalizes legacy intake component types to the canonical role for matching", () => {
    expect(snapshotCanonicalRole({ equipment_role: null, component_type: "heat_pump_outdoor" })).toBe("heat_pump");
    expect(snapshotCanonicalRole({ equipment_role: "package_heat_pump", component_type: null })).toBe(
      "heat_pump_pack_unit",
    );
  });

  it("falls back to model_number when the snapshot has no model", () => {
    expect(snapshotModel({ model: null, model_number: "ABC-99" })).toBe("ABC-99");
    expect(snapshotModel({ model: "XYZ", model_number: "ABC-99" })).toBe("XYZ");
  });
});

describe("job_equipment ↔ canonical equipment bridge wiring", () => {
  it("adds the canonical link column additively, with SET NULL protecting snapshots", () => {
    expect(migrationSource).toContain("ALTER TABLE public.job_equipment");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS canonical_equipment_id uuid");
    expect(migrationSource).toContain("REFERENCES public.equipment(id) ON DELETE SET NULL");
    expect(migrationSource).not.toContain("DROP");
    expect(migrationSource).not.toContain("ALTER TABLE public.equipment\n");
  });

  it("adopts with 'job' provenance and never rewrites snapshot spec fields", () => {
    expect(adoptionModuleSource).toContain("install_source: \"job\"");
    expect(adoptionModuleSource).toContain("source_job_id: jobId");
    // The only job_equipment write in the module is the canonical link —
    // snapshots stay immutable.
    const snapshotUpdates = adoptionModuleSource.match(/from\("job_equipment"\)\s*\n?\s*\.update\(([^)]*)\)/g) ?? [];
    expect(snapshotUpdates.length).toBe(1);
    expect(snapshotUpdates[0]).toContain("canonical_equipment_id");
  });

  it("degrades gracefully before the migration is applied (probe, no hard dependency)", () => {
    expect(adoptionModuleSource).toContain("jobEquipmentCanonicalLinkAvailable");
    expect(adoptionModuleSource).toContain("linkAvailable");
  });

  it("hooks canonical adoption into every job_equipment capture path", () => {
    // Job detail add + edit
    expect(jobEquipmentActionsSource).toContain("adoptJobEquipmentIntoLocationInventory");
    expect(jobEquipmentActionsSource).toContain("await adoptIntoLocationInventoryBestEffort({ jobId })");
    expect(jobEquipmentActionsSource).toContain("propagateSnapshotIds: [equipmentId]");
    // Intake
    expect(jobActionsSource).toContain("adoptJobEquipmentIntoLocationInventory({ admin: createAdminClient(), jobId })");
    // Retest copy
    expect(jobRetestActionsSource).toContain("adoptJobEquipmentIntoLocationInventory");
  });

  it("adoption failures are best-effort and never break the capture write", () => {
    expect(jobEquipmentActionsSource).toContain("console.error(\"location equipment adoption failed:\", e)");
    expect(jobActionsSource).toContain("location equipment adoption failed (intake)");
    expect(jobRetestActionsSource).toContain("location equipment adoption failed (retest copy)");
  });

  it("seeding requires an empty job snapshot and records a job event", () => {
    expect(adoptionModuleSource).toContain("job_already_has_equipment");
    expect(jobEquipmentActionsSource).toContain("export async function seedJobEquipmentFromLocationFromForm");
    expect(jobEquipmentActionsSource).toContain("requireInternalEquipmentMutationAccess({ supabase, jobId })");
    expect(jobEquipmentActionsSource).toContain("requireOperationalScopedJobMutationAccessOrRedirect");
    expect(jobEquipmentActionsSource).toContain("equipment_seeded_from_location");
  });

  it("replace-from-job is explicit, never inferred: defaults to 'additional equipment'", () => {
    // A same-role capture can legitimately be a second system's first entry
    // (out-of-scope system captured later), so replacement must be an explicit
    // tech choice with the no-replace option as the default.
    expect(equipmentCreateFormSource).toContain("No — adding additional equipment");
    expect(equipmentCreateFormSource).toContain('name="replaces_canonical_equipment_id"');
    expect(equipmentCreateFormSource).toContain('name="retire_reason"');
    // Retire reason only appears (and is required) once a replace target is chosen.
    expect(equipmentCreateFormSource).toContain("replaceTargetId ? (");
    // The chooser hides while adding a filter.
    expect(equipmentCreateFormFieldsSource).toContain("{!addingFilter ? replaceSection : null}");
  });

  it("replace-from-job runs the same atomic retire+install RPC with job provenance", () => {
    expect(jobEquipmentActionsSource).toContain('formData.get("replaces_canonical_equipment_id")');
    expect(jobEquipmentActionsSource).toContain('["failure", "warranty", "upgrade"].includes(retireReason)');
    expect(jobEquipmentActionsSource).toContain("assertNoClientSuppliedOwnerId(formData)");
    expect(jobEquipmentActionsSource).toContain("requireScopedEquipmentForMutation({");
    expect(jobEquipmentActionsSource).toContain('admin.rpc("replace_customer_location_equipment"');
    expect(jobEquipmentActionsSource).toContain('p_install_source: "job"');
    expect(jobEquipmentActionsSource).toContain("p_source_job_id: jobId");
    // The replacement stays in the old unit's canonical system.
    expect(jobEquipmentActionsSource).toContain("p_system_id: oldSystemRow?.system_id");
    // The new snapshot row links to the freshly installed canonical unit.
    expect(jobEquipmentActionsSource).toContain("canonical_equipment_id: canonicalEquipmentIdForSnapshot");
    expect(jobEquipmentActionsSource).toContain("equipment_replaced");
  });

  it("job info page offers on-file units as replace targets, best-effort", () => {
    expect(jobInfoPageSource).toContain("loadLocationEquipmentOnFile");
    expect(jobInfoPageSource).toContain("unitsOnFile={unitsOnFile}");
    expect(jobInfoPageSource).toContain("location_id");
  });

  it("offers 'use equipment on file' on the v2 job page only when the job snapshot is empty", () => {
    expect(jobV2PageSource).toContain("loadLocationEquipmentOnFile");
    expect(jobV2PageSource).toContain("baseEquipmentRows.length === 0 && job.location_id");
    expect(jobV2PageSource).toContain("loadLocationEquipmentOnFile failed on job v2 page:");
    expect(jobV2PageSource).toContain("return [] as LocationUnitOnFile[];");
    expect(jobV2PageSource).toContain("seedJobEquipmentFromLocationFromForm");
    expect(jobV2PageSource).toContain("equipmentOnFileForLocation.length > 0");
    expect(jobV2PageSource).toContain("Use equipment on file");
    expect(alertBannerSource).toContain("equipment_on_file_applied");
    expect(alertBannerSource).toContain("equipment_on_file_already_captured");
    expect(alertBannerSource).toContain("equipment_on_file_unavailable");
  });
});
