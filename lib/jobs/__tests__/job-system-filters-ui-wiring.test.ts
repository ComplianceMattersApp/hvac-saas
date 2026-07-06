import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const jobInfoPageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/info/page.tsx"),
  "utf8",
);

const systemFiltersCardSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/SystemFiltersCard.tsx"),
  "utf8",
);

const systemFilterInventoryCardSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/SystemFilterInventoryCard.tsx"),
  "utf8",
);

const equipmentDisplaySource = readFileSync(
  resolve(__dirname, "../../utils/equipment-display.ts"),
  "utf8",
);

const equipmentEditCardSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/EquipmentEditCard.tsx"),
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

const systemLocationPickerSource = readFileSync(
  resolve(__dirname, "../../../components/jobs/SystemLocationPicker.tsx"),
  "utf8",
);

const jobActionsSource = readFileSync(
  resolve(__dirname, "../../actions/job-actions.ts"),
  "utf8",
);

describe("job equipment system filter management wiring", () => {
  it("loads active filters for visible job systems in the equipment workspace", () => {
    expect(jobInfoPageSource).toContain("listSystemFiltersBySystemIds");
    expect(jobInfoPageSource).toContain("accountOwnerUserId: internalAccess.internalUser.account_owner_user_id");
    expect(jobInfoPageSource).toContain("filtersBySystemId");
    expect(jobInfoPageSource).toContain("<SystemFilterInventoryCard");
    expect(jobInfoPageSource).toContain('focused === "equipment"');
  });

  it("renders filters as unified inventory cards with system equipment", () => {
    expect(jobInfoPageSource).toContain("System Inventory");
    expect(jobInfoPageSource).toContain("Equipment and filters are organized under each system.");
    expect(jobInfoPageSource).toContain("systemEquipment.length");
    expect(jobInfoPageSource).toContain("<EquipmentEditCard");
    expect(jobInfoPageSource).toContain("<SystemFilterInventoryCard");
    expect(jobInfoPageSource).toContain("Inventory");
    expect(jobInfoPageSource).not.toContain("<SystemFiltersCard");
    expect(jobInfoPageSource).not.toContain("Current Equipment");
  });

  it("removes the standalone system filter block and add button from the workspace", () => {
    expect(jobInfoPageSource).not.toContain('import SystemFiltersCard from "../_components/SystemFiltersCard"');
    expect(jobInfoPageSource).not.toContain("<SystemFiltersCard");
    expect(systemFiltersCardSource).toContain("System Filters");
    expect(systemFiltersCardSource).toContain("Add Filter to System");
  });

  it("renders filter inventory cards with edit and archive controls routed to filter actions", () => {
    expect(systemFilterInventoryCardSource).toContain("Filter");
    expect(systemFilterInventoryCardSource).toContain("filterDimensions(filter)");
    expect(systemFilterInventoryCardSource).toContain("Changed:");
    expect(systemFilterInventoryCardSource).toContain("filter.notes");
    expect(systemFilterInventoryCardSource).toContain("Edit Filter");
    expect(systemFilterInventoryCardSource).toContain("Remove");
    expect(systemFilterInventoryCardSource).toContain("updateSystemFilterFromForm");
    expect(systemFilterInventoryCardSource).toContain("archiveSystemFilterFromForm");
    expect(systemFilterInventoryCardSource).not.toContain("addSystemFilterFromForm");
    expect(systemFilterInventoryCardSource).toContain('name="date_changed"');
  });

  it("does not offer filter as a normal standalone equipment role and preserves legacy rows", () => {
    expect(equipmentDisplaySource).toContain("EQUIPMENT_ROLE_OPTIONS");
    expect(equipmentDisplaySource).not.toContain('value: "filter"');
    expect(equipmentDisplaySource).not.toContain("label: \"Filter\"");
    expect(equipmentEditCardSource).toContain("isLegacyFilterEquipment");
    expect(equipmentEditCardSource).toContain("Legacy filter equipment record. Add new filters from Add Equipment or Filter.");
    expect(equipmentEditCardSource).toContain("equipmentRoleOptionsForValue");
  });

  it("offers Filter in the add selector and routes it to system filter creation", () => {
    expect(equipmentCreateFormFieldsSource).toContain("Add Equipment or Filter");
    expect(equipmentCreateFormFieldsSource).toContain('FILTER_ROLE_VALUE = "__system_filter__";');
    expect(equipmentCreateFormFieldsSource).toContain('<option value={FILTER_ROLE_VALUE}>Filter</option>');
    expect(equipmentCreateFormSource).toContain("role === FILTER_ROLE_VALUE ? addSystemFilterFromForm : addJobEquipmentFromForm");
    expect(equipmentCreateFormFieldsSource).toContain("Filter Details");
    expect(equipmentCreateFormFieldsSource).toContain("Filter location");
    expect(equipmentCreateFormFieldsSource).toContain("Date changed");
    expect(equipmentCreateFormFieldsSource).toContain('name="height"');
    expect(equipmentCreateFormFieldsSource).toContain('{addingFilter ? "Add Filter" : "Add Equipment"}');
    expect(equipmentCreateFormFieldsSource).not.toContain('value: "filter"');
  });

  it("preserves normal equipment create routing and submits selected system context", () => {
    expect(equipmentCreateFormSource).toContain("addJobEquipmentFromForm");
    expect(equipmentCreateFormSource).toContain("<EquipmentCreateFormFields");
    expect(equipmentCreateFormFieldsSource).toContain("Enter Details");
    expect(equipmentCreateFormFieldsSource).toContain('name="manufacturer"');
    expect(equipmentCreateFormFieldsSource).toContain('name="serial"');
    expect(equipmentDisplaySource).toContain('value: "gas_pack_unit", label: "Gas Pack Unit"');
    expect(equipmentDisplaySource).toContain('value: "heat_pump_pack_unit", label: "Heat Pump Pack Unit"');
    expect(equipmentDisplaySource).not.toContain('value: "package_unit", label: "Pack Unit"');
    expect(systemLocationPickerSource).toContain('name="system_id"');
    expect(systemLocationPickerSource).toContain('name="system_location"');
    expect(jobActionsSource).toContain('formData.get("system_location") || formData.get("system_location_choice")');
  });

  it("keeps filter mutations server-side and uses archive instead of hard delete", () => {
    expect(jobActionsSource).toContain("createSystemFilter");
    expect(jobActionsSource).toContain("updateSystemFilter");
    expect(jobActionsSource).toContain("archiveSystemFilter");
    expect(jobActionsSource).toContain("addSystemFilterFromForm");
    expect(jobActionsSource).toContain("updateSystemFilterFromForm");
    expect(jobActionsSource).toContain("archiveSystemFilterFromForm");

    const filterActionsSlice =
      jobActionsSource.match(/export async function addSystemFilterFromForm[\s\S]*?export async function saveEccTestOverrideFromForm/)?.[0] ??
      "";

    expect(filterActionsSlice).toContain("requireInternalEquipmentMutationAccess");
    expect(filterActionsSlice).toContain("requireOperationalScopedJobMutationAccessOrRedirect");
    expect(filterActionsSlice).toContain("createSystemFilter");
    expect(filterActionsSlice).toContain(".from(\"job_systems\")");
    expect(filterActionsSlice).toContain("redirect(`/jobs/${jobId}/info?f=equipment`)");
    expect(filterActionsSlice).not.toContain(".from(\"job_equipment\").insert");
    expect(filterActionsSlice).not.toContain(".delete()");
    expect(filterActionsSlice).not.toContain("maintenance_agreements");
    expect(filterActionsSlice).not.toContain("next_due_date");
    expect(filterActionsSlice).not.toContain("invoice");
    expect(filterActionsSlice).not.toContain("payment");
  });

  it("keeps normal equipment edit and delete routed to equipment actions", () => {
    expect(equipmentEditCardSource).toContain("updateJobEquipmentFromForm");
    expect(equipmentEditCardSource).toContain("deleteJobEquipmentFromForm");
    expect(equipmentEditCardSource).toContain('name="equipment_id"');
    expect(equipmentEditCardSource).toContain("Save Changes");
    expect(equipmentEditCardSource).toContain("Delete");
  });
});
