import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { nextDefaultSystemLabel } from "@/lib/customers/system-label";

const migrationSource = readFileSync(
  resolve(__dirname, "../../..//supabase/migrations/20260626120000_customer_profile_equipment_inventory.sql"),
  "utf8",
);

const lifecycleMigrationSource = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/20260705120000_equipment_lifecycle_columns.sql"),
  "utf8",
);

const replaceFunctionMigrationSource = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/20260705130000_equipment_replace_function.sql"),
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

const profileEquipmentCreateFormSource = readFileSync(
  resolve(__dirname, "../../../app/customers/[id]/_components/ProfileEquipmentCreateForm.tsx"),
  "utf8",
);

const equipmentCreateFormFieldsSource = readFileSync(
  resolve(__dirname, "../../../components/jobs/EquipmentCreateFormFields.tsx"),
  "utf8",
);

const equipmentDisplaySource = readFileSync(
  resolve(__dirname, "../../utils/equipment-display.ts"),
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

const equipmentComponentCardSource = readFileSync(
  resolve(__dirname, "../../../app/customers/[id]/_components/EquipmentComponentCard.tsx"),
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
    expect(customerPageSource).toContain("ProfileEquipmentCreateForm");
    expect(profileEquipmentCreateFormSource).toContain("addCustomerLocationEquipmentFromForm");
    expect(profileEquipmentCreateFormSource).toContain("EquipmentCreateFormFields");
    expect(profileEquipmentCreateFormSource).toContain('name="customer_id"');
    expect(profileEquipmentCreateFormSource).toContain('name="location_id"');
    expect(profileEquipmentCreateFormSource).toContain('name="system_id"');
    expect(profileEquipmentCreateFormSource).toContain("includeFilterOption={false}");
    expect(equipmentCreateFormFieldsSource).toContain("System Item Type");
    expect(equipmentCreateFormFieldsSource).toContain("Product Details");
    expect(equipmentCreateFormFieldsSource).toContain('name="equipment_role"');
    expect(equipmentCreateFormFieldsSource).toContain('name="manufacturer"');
    expect(equipmentCreateFormFieldsSource).toContain('name="serial"');
    expect(equipmentCreateFormFieldsSource).toContain("EQUIPMENT_ROLE_OPTIONS.map");
    expect(equipmentDisplaySource).toContain('value: "gas_pack_unit", label: "Gas Pack Unit"');
    expect(equipmentDisplaySource).toContain('value: "heat_pump_pack_unit", label: "Heat Pump Pack Unit"');
    expect(equipmentDisplaySource).not.toContain('value: "package_unit", label: "Pack Unit"');
    expect(customerPageSource).toContain("Saved property equipment");
    expect(customerPageSource).toContain("No systems or equipment saved for this property yet.");

    expect(jobEquipmentCreateFormSource).toContain("addJobEquipmentFromForm");
    expect(jobEquipmentCreateFormSource).toContain("EquipmentCreateFormFields");
    expect(jobInfoPageSource).toContain("<EquipmentCreateForm");
    expect(jobInfoPageSource).toContain('focused === "equipment"');
  });

  // Kept independent of the "wires profile-owned CTAs..." test above (which has
  // a pre-existing, unrelated failing assertion on "Product Details" that would
  // otherwise mask these — vitest stops at the first failed expect() in an it()).
  it("collapses the View/Manage/Open Job triad into EquipmentComponentCard's Open Job + overflow", () => {
    // §8a: legacy job_equipment rows' "Manage" still resolves to the job's
    // equipment info tab, just no longer as a standalone top-level link in
    // page.tsx — it's passed down as jobManageHref and surfaced via the overflow.
    expect(customerPageSource).toContain(
      'jobManageHref={equipment.sourceJob ? `/jobs/${equipment.sourceJob.id}/info?f=equipment` : null}',
    );
    // §8.6 hoisted Open Job to the system header — per-component jobHref only
    // fires when the component's source job differs from the system's.
    expect(customerPageSource).toContain(
      'jobHref={!sameJobAsSystem && equipment.sourceJob ? `/jobs/${equipment.sourceJob.id}` : null}',
    );
    expect(customerPageSource).not.toContain("View Equipment");
    expect(equipmentComponentCardSource).toContain("jobManageHref");
    expect(equipmentComponentCardSource).toContain("OverflowMenu");
  });

  it("adds equipment lifecycle columns additively and documents the delete/pin risks", () => {
    expect(lifecycleMigrationSource).toContain("ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'");
    expect(lifecycleMigrationSource).toContain("ADD COLUMN IF NOT EXISTS retired_at timestamp with time zone");
    expect(lifecycleMigrationSource).toContain("ADD COLUMN IF NOT EXISTS retire_reason text");
    expect(lifecycleMigrationSource).toContain("ADD COLUMN IF NOT EXISTS replaced_by_equipment_id uuid");
    expect(lifecycleMigrationSource).toContain("ADD COLUMN IF NOT EXISTS install_source text NOT NULL DEFAULT 'standalone'");
    expect(lifecycleMigrationSource).toContain("ADD COLUMN IF NOT EXISTS source_job_id uuid");
    expect(lifecycleMigrationSource).toContain("equipment_source_job_consistency_chk");
    expect(lifecycleMigrationSource).toContain("CHECK ((install_source = 'job') = (source_job_id IS NOT NULL))");
    // Delete-guard risk called out on the self-FK, per the locked plan.
    expect(lifecycleMigrationSource).toContain("forbid hard-deleting any row that another row''s replaced_by_equipment_id");
    // ecc_test_runs.equipment_id must stay pinned to the tested unit, never follow replaced_by.
    expect(lifecycleMigrationSource).toContain("COMMENT ON COLUMN public.ecc_test_runs.equipment_id");
    expect(lifecycleMigrationSource).toContain("never reassigned to follow equipment.replaced_by_equipment_id");
    // RLS no longer hard-requires system_id — standalone equipment must stay internally readable.
    expect(lifecycleMigrationSource).not.toContain("system_id IS NOT NULL\n  AND public.current_internal_account_owner_id()");
    expect(lifecycleMigrationSource).toContain("equipment.system_id IS NULL");
  });

  it("replaces equipment atomically via a single DB function, not two separate client-side writes", () => {
    expect(replaceFunctionMigrationSource).toContain("CREATE OR REPLACE FUNCTION public.replace_customer_location_equipment");
    expect(replaceFunctionMigrationSource).toContain("INSERT INTO public.equipment");
    expect(replaceFunctionMigrationSource).toContain("RETURNING * INTO v_new");
    expect(replaceFunctionMigrationSource).toContain("SET status = 'retired'");
    expect(replaceFunctionMigrationSource).toContain("replaced_by_equipment_id = v_new.id");
    expect(replaceFunctionMigrationSource).toContain("FOR UPDATE");
    expect(replaceFunctionMigrationSource).toContain("REVOKE EXECUTE ON FUNCTION public.replace_customer_location_equipment");

    // The action must call the atomic function, never inline a separate
    // insert+update pair for replace (which would reopen the two-write race).
    expect(customerActionsSource).toContain('scoped.admin.rpc("replace_customer_location_equipment"');
    expect(customerActionsSource).toContain("export async function replaceCustomerLocationEquipmentFromForm");
  });

  it("never lets p_owner_user_id/old-equipment scope come from client input", () => {
    // App layer: reject a request that itself supplies an owner id, and
    // confirm the equipment id is actually within the scoped location before
    // ever calling the RPC (which only re-checks owner, not location).
    expect(customerActionsSource).toContain("assertNoClientSuppliedOwnerId(formData)");
    expect(customerActionsSource).toContain("requireScopedEquipmentForMutation({");
    expect(customerActionsSource).toContain("p_owner_user_id: scoped.accountOwnerUserId");
    expect(customerActionsSource).not.toContain('p_owner_user_id: formData.get("owner_user_id")');
    expect(customerActionsSource).not.toContain('p_owner_user_id: readTrimmed(formData, "owner_user_id")');

    // DB layer: same invariant re-checked as defense in depth.
    expect(replaceFunctionMigrationSource).toContain("v_old.location_id <> p_location_id");
    expect(replaceFunctionMigrationSource).toContain("owner_user_id = p_owner_user_id");
  });

  it("wires the missing edit/archive/retire actions and writes install_source/source_job_id/spec fields on create", () => {
    expect(customerActionsSource).toContain("export async function updateCustomerLocationSystemFromForm");
    expect(customerActionsSource).toContain("export async function archiveCustomerLocationSystemFromForm");
    expect(customerActionsSource).toContain("export async function updateCustomerLocationEquipmentFromForm");
    expect(customerActionsSource).toContain("export async function retireCustomerLocationEquipmentFromForm");
    expect(customerActionsSource).toContain("install_source: installSource");
    expect(customerActionsSource).toContain("source_job_id: sourceJobId");
    expect(customerActionsSource).toContain("heating_capacity_kbtu: eqFields.heating_capacity_kbtu");
    expect(customerActionsSource).toContain('import { nextDefaultSystemLabel } from "@/lib/customers/system-label"');
  });

  it("defaults a blank system name to the next free 'System N' label, renameable afterward", async () => {
    const admin = {
      from(table: string) {
        expect(table).toBe("customer_location_systems");
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          is() {
            return Promise.resolve({
              data: [{ name: "System 1" }, { name: "Upstairs" }, { name: "System 3" }],
              error: null,
            });
          },
        };
      },
    };

    const label = await nextDefaultSystemLabel({ admin, locationId: "loc-1" });
    // "System 1" and "System 3" are taken; "System 2" is the next free slot,
    // even though a differently-named ("Upstairs") system also exists.
    expect(label).toBe("System 2");
  });

  it("returns 'System 1' for a location with no systems yet", async () => {
    const admin = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          is() {
            return Promise.resolve({ data: [], error: null });
          },
        };
      },
    };

    const label = await nextDefaultSystemLabel({ admin, locationId: "loc-2" });
    expect(label).toBe("System 1");
  });
});
