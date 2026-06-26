import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  resolve(__dirname, "../../..//supabase/migrations/20260626120000_customer_profile_equipment_inventory.sql"),
  "utf8",
);

const customerActionsSource = readFileSync(
  resolve(__dirname, "../../actions/customer-actions.ts"),
  "utf8",
);

const customerPageSource = readFileSync(
  resolve(__dirname, "../../../app/customers/[id]/page.tsx"),
  "utf8",
);

const jobInfoPageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/info/page.tsx"),
  "utf8",
);

const jobEquipmentCreateFormSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/EquipmentCreateForm.tsx"),
  "utf8",
);

describe("customer profile equipment hotfix", () => {
  it("adds additive profile-owned system schema and extends location-owned equipment", () => {
    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS public.customer_location_systems");
    expect(migrationSource).toContain("ALTER TABLE public.equipment");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS system_id uuid REFERENCES public.customer_location_systems(id) ON DELETE SET NULL");
    expect(migrationSource).toContain("validate_profile_owned_equipment_scope");
    expect(migrationSource).toContain("cls.location_id = NEW.location_id");
    expect(migrationSource).toContain("cls.owner_user_id = NEW.owner_user_id");
    expect(migrationSource).toContain("customer_location_systems_internal_all_account_scope");
    expect(migrationSource).toContain("equipment_profile_internal_all_account_scope");
    expect(migrationSource).not.toContain("ALTER TABLE public.job_systems");
    expect(migrationSource).not.toContain("ALTER TABLE public.job_equipment");
  });

  it("scopes customer profile system and equipment actions by account, customer, location, and system", () => {
    expect(customerActionsSource).toContain("addCustomerLocationSystemFromForm");
    expect(customerActionsSource).toContain("addCustomerLocationEquipmentFromForm");
    expect(customerActionsSource).toContain("requireInternalScopedCustomerLocationForMutation");
    expect(customerActionsSource).toContain('.eq("customer_id", scopedCustomer.customerId)');
    expect(customerActionsSource).toContain('.eq("owner_user_id", scopedCustomer.accountOwnerUserId)');
    expect(customerActionsSource).toContain('.eq("id", systemId)');
    expect(customerActionsSource).toContain('.eq("customer_id", scoped.customerId)');
    expect(customerActionsSource).toContain('.eq("location_id", scoped.locationId)');
    expect(customerActionsSource).toContain('.eq("owner_user_id", scoped.accountOwnerUserId)');
    expect(customerActionsSource).toContain('.from("equipment")');
    expect(customerActionsSource).toContain("system_id: systemId");
    expect(customerActionsSource).not.toContain('.from("jobs").insert');
    expect(customerActionsSource).not.toContain('.from("job_equipment").insert');
  });

  it("wires profile-owned CTAs without replacing the existing job equipment flow", () => {
    expect(customerPageSource).toContain("addCustomerLocationSystemFromForm");
    expect(customerPageSource).toContain("addCustomerLocationEquipmentFromForm");
    expect(customerPageSource).toContain("Saved property equipment");
    expect(customerPageSource).toContain("No systems or equipment saved for this property yet.");
    expect(customerPageSource).toContain('href={`/jobs/${equipment.sourceJob.id}/info?f=equipment`}');

    expect(jobEquipmentCreateFormSource).toContain("addJobEquipmentFromForm");
    expect(jobInfoPageSource).toContain("<EquipmentCreateForm");
    expect(jobInfoPageSource).toContain('focused === "equipment"');
  });
});
