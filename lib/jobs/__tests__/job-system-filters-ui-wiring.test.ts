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

const equipmentDisplaySource = readFileSync(
  resolve(__dirname, "../../utils/equipment-display.ts"),
  "utf8",
);

const equipmentEditCardSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/EquipmentEditCard.tsx"),
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
    expect(jobInfoPageSource).toContain("<SystemFiltersCard");
    expect(jobInfoPageSource).toContain('focused === "equipment"');
  });

  it("renders filters inside each system inventory block with system equipment", () => {
    expect(jobInfoPageSource).toContain("System Inventory");
    expect(jobInfoPageSource).toContain("Equipment and filters are organized under each system.");
    expect(jobInfoPageSource).toContain("systemEquipment.length");
    expect(jobInfoPageSource).toContain("<EquipmentEditCard");
    expect(jobInfoPageSource).toContain("<SystemFiltersCard");
    expect(jobInfoPageSource.indexOf("<EquipmentEditCard")).toBeLessThan(jobInfoPageSource.indexOf("<SystemFiltersCard"));
    expect(jobInfoPageSource).not.toContain("Current Equipment");
  });

  it("renders compact add, edit, and archive controls per system", () => {
    expect(systemFiltersCardSource).toContain("System Filters");
    expect(systemFiltersCardSource).toContain("No filters recorded for this system yet.");
    expect(systemFiltersCardSource).toContain("Add Filter to System");
    expect(systemFiltersCardSource).toContain("Filter location");
    expect(systemFiltersCardSource).toContain("Dimensions");
    expect(systemFiltersCardSource).toContain("Edit");
    expect(systemFiltersCardSource).toContain("Remove");
    expect(systemFiltersCardSource).toContain("addSystemFilterFromForm");
    expect(systemFiltersCardSource).toContain("updateSystemFilterFromForm");
    expect(systemFiltersCardSource).toContain("archiveSystemFilterFromForm");
    expect(systemFiltersCardSource).toContain('name="date_changed"');
  });

  it("does not offer filter as a normal standalone equipment role and preserves legacy rows", () => {
    expect(equipmentDisplaySource).toContain("EQUIPMENT_ROLE_OPTIONS");
    expect(equipmentDisplaySource).not.toContain('value: "filter"');
    expect(equipmentDisplaySource).not.toContain("label: \"Filter\"");
    expect(equipmentEditCardSource).toContain("isLegacyFilterEquipment");
    expect(equipmentEditCardSource).toContain("Legacy filter equipment record. Add new filters in System Filters.");
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
    expect(filterActionsSlice).toContain("redirect(`/jobs/${jobId}/info?f=equipment`)");
    expect(filterActionsSlice).not.toContain(".delete()");
    expect(filterActionsSlice).not.toContain("maintenance_agreements");
    expect(filterActionsSlice).not.toContain("next_due_date");
    expect(filterActionsSlice).not.toContain("invoice");
    expect(filterActionsSlice).not.toContain("payment");
  });
});
