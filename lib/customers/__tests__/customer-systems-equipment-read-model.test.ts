import { describe, expect, it } from "vitest";
import {
  loadCustomerSystemsEquipmentSummary,
  loadEquipmentReplacementHistory,
} from "@/lib/customers/customer-systems-equipment-read-model";

type TableData = Record<string, any[]>;

function makeSupabase(tables: TableData) {
  const calls: Array<{ table: string; filters: Array<[string, string, unknown]>; select: string | null }> = [];

  class Query {
    private rows: any[];
    private filters: Array<[string, string, unknown]> = [];
    private single = false;
    private maxRows: number | null = null;
    private selectColumns: string | null = null;

    constructor(private table: string) {
      this.rows = [...(tables[table] ?? [])];
    }

    select(columns: string) {
      this.selectColumns = columns;
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters.push(["eq", column, value]);
      this.rows = this.rows.filter((row) => row[column] === value);
      return this;
    }

    is(column: string, value: unknown) {
      this.filters.push(["is", column, value]);
      this.rows = this.rows.filter((row) => row[column] === value);
      return this;
    }

    in(column: string, values: unknown[]) {
      this.filters.push(["in", column, values]);
      const allowed = new Set(values);
      this.rows = this.rows.filter((row) => allowed.has(row[column]));
      return this;
    }

    order() {
      return this;
    }

    limit(count: number) {
      this.maxRows = count;
      return this;
    }

    maybeSingle() {
      this.single = true;
      return this;
    }

    then(resolve: (value: any) => void) {
      calls.push({ table: this.table, filters: this.filters, select: this.selectColumns });
      const rows = this.maxRows === null ? this.rows : this.rows.slice(0, this.maxRows);
      resolve({ data: this.single ? rows[0] ?? null : rows, error: null });
    }
  }

  return {
    calls,
    from(table: string) {
      return new Query(table);
    },
  };
}

describe("loadCustomerSystemsEquipmentSummary", () => {
  it("groups equipment by service location and system", async () => {
    const supabase = makeSupabase({
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      locations: [
        { id: "loc-1", customer_id: "cust-1", nickname: "Main House", address_line1: "1 Oak", city: "Fresno", state: "CA" },
        { id: "loc-2", customer_id: "cust-1", nickname: "Shop", address_line1: "2 Pine", city: "Clovis", state: "CA" },
      ],
      jobs: [
        { id: "job-1", customer_id: "cust-1", location_id: "loc-1", title: "ECC Test", job_type: "ecc", deleted_at: null, created_at: "2026-01-02" },
        { id: "job-2", customer_id: "cust-1", location_id: "loc-2", title: "Service Visit", job_type: "service", deleted_at: null, created_at: "2026-02-02" },
      ],
      job_systems: [
        { id: "sys-1", job_id: "job-1", name: "Upstairs" },
        { id: "sys-2", job_id: "job-2", name: "Roof Pack" },
      ],
      job_system_filters: [
        {
          id: "filter-1",
          system_id: "sys-1",
          account_owner_user_id: "owner-1",
          label: "Hall return",
          length: 20,
          width: 25,
          height: 1,
          date_changed: "2026-06-23",
          notes: "MERV 11",
          archived_at: null,
        },
        {
          id: "filter-archived",
          system_id: "sys-1",
          account_owner_user_id: "owner-1",
          label: "Old return",
          length: 16,
          width: 20,
          height: 1,
          date_changed: "2026-01-01",
          archived_at: "2026-06-01T00:00:00Z",
        },
      ],
      job_equipment: [
        { id: "eq-1", job_id: "job-1", system_id: "sys-1", equipment_role: "condenser", manufacturer: "Carrier", model: "CX", serial: "A1" },
        { id: "eq-2", job_id: "job-2", system_id: "sys-2", equipment_role: "package_unit", manufacturer: "Trane", model: "TZ", serial: "B2" },
      ],
    });

    const summary = await loadCustomerSystemsEquipmentSummary({
      supabase,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
    });

    expect(summary.totalSystemCount).toBe(2);
    expect(summary.totalEquipmentCount).toBe(2);
    expect(summary.locations.map((location) => location.label)).toEqual(["Main House", "Shop"]);
    expect(summary.locations[0].systems[0].name).toBe("Upstairs");
    expect(summary.locations[0].systems[0].filters).toEqual([
      {
        id: "filter-1",
        label: "Hall return",
        length: 20,
        width: 25,
        height: 1,
        dateChanged: "2026-06-23",
        notes: "MERV 11",
      },
    ]);
    expect(summary.locations[0].systems[0].equipment[0]).toMatchObject({
      manufacturer: "Carrier",
      sourceJob: { id: "job-1", jobType: "ecc" },
    });
    expect(summary.locations[1].systems[0].equipment[0]).toMatchObject({
      manufacturer: "Trane",
      sourceJob: { id: "job-2", jobType: "service" },
    });
  });

  it("returns empty when no systems or equipment exist", async () => {
    const supabase = makeSupabase({
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      locations: [],
      jobs: [],
      job_systems: [],
      job_equipment: [],
    });

    await expect(
      loadCustomerSystemsEquipmentSummary({
        supabase,
        accountOwnerUserId: "owner-1",
        customerId: "cust-1",
      }),
    ).resolves.toEqual({
      locations: [],
      totalSystemCount: 0,
      totalEquipmentCount: 0,
    });
  });

  it("returns profile-owned systems and equipment for a no-job customer", async () => {
    const supabase = makeSupabase({
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      locations: [
        { id: "loc-1", customer_id: "cust-1", nickname: "Main House", address_line1: "1 Oak", city: "Fresno", state: "CA" },
      ],
      jobs: [],
      customer_location_systems: [
        {
          id: "profile-sys-1",
          owner_user_id: "owner-1",
          customer_id: "cust-1",
          location_id: "loc-1",
          name: "Downstairs",
          archived_at: null,
        },
      ],
      equipment: [
        {
          id: "profile-eq-1",
          owner_user_id: "owner-1",
          location_id: "loc-1",
          system_id: "profile-sys-1",
          equipment_type: "furnace",
          manufacturer: "Bryant",
          model: "B80",
          serial: "S123",
          status: "active",
          install_source: "standalone",
          updated_at: "2026-06-26T12:00:00Z",
        },
      ],
      job_systems: [],
      job_equipment: [],
    });

    const summary = await loadCustomerSystemsEquipmentSummary({
      supabase,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
    });

    expect(summary.totalSystemCount).toBe(1);
    expect(summary.totalEquipmentCount).toBe(1);
    expect(summary.locations[0].systems[0]).toMatchObject({
      id: "profile:profile-sys-1",
      name: "Downstairs",
      sourceJob: null,
    });
    expect(summary.locations[0].systems[0].equipment[0]).toMatchObject({
      id: "profile-eq-1",
      jobId: null,
      sourceType: "profile",
      equipmentRole: "furnace",
      manufacturer: "Bryant",
      sourceJob: null,
    });
    expect(supabase.calls.map((call) => call.table)).toContain("customer_location_systems");
    expect(supabase.calls.map((call) => call.table)).toContain("equipment");
  });

  it("uses the same-account customer boundary before reading job equipment", async () => {
    const supabase = makeSupabase({
      customers: [{ id: "cust-1", owner_user_id: "owner-2" }],
      locations: [{ id: "loc-1", customer_id: "cust-1" }],
      jobs: [{ id: "job-1", customer_id: "cust-1", deleted_at: null }],
      job_systems: [{ id: "sys-1", job_id: "job-1", name: "System" }],
      job_equipment: [{ id: "eq-1", job_id: "job-1", system_id: "sys-1" }],
    });

    const summary = await loadCustomerSystemsEquipmentSummary({
      supabase,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
    });

    expect(summary.locations).toEqual([]);
    expect(supabase.calls.map((call) => call.table)).toEqual(["customers"]);
    expect(supabase.calls[0].filters).toContainEqual(["eq", "owner_user_id", "owner-1"]);
  });

  it("surfaces the immediate retired predecessor on an active component, one hop only", async () => {
    const supabase = makeSupabase({
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      locations: [{ id: "loc-1", customer_id: "cust-1", nickname: "Main House" }],
      jobs: [],
      customer_location_systems: [
        { id: "sys-1", owner_user_id: "owner-1", customer_id: "cust-1", location_id: "loc-1", name: "Upstairs", archived_at: null },
      ],
      job_systems: [],
      job_equipment: [],
      equipment: [
        {
          id: "eq-active",
          owner_user_id: "owner-1",
          location_id: "loc-1",
          system_id: "sys-1",
          equipment_type: "furnace",
          manufacturer: "Carrier",
          status: "active",
          install_source: "contractor",
        },
        {
          id: "eq-retired-1",
          owner_user_id: "owner-1",
          location_id: "loc-1",
          system_id: "sys-1",
          equipment_type: "furnace",
          manufacturer: "Old Furnace Co",
          status: "retired",
          retired_at: "2026-05-01T00:00:00Z",
          retire_reason: "failure",
          replaced_by_equipment_id: "eq-active",
        },
      ],
    });

    const summary = await loadCustomerSystemsEquipmentSummary({
      supabase,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
    });

    // Only the active unit appears in the system's equipment list.
    expect(summary.locations[0].systems[0].equipment).toHaveLength(1);
    expect(summary.locations[0].systems[0].equipment[0]).toMatchObject({
      id: "eq-active",
      status: "active",
      installSource: "contractor",
      priorUnit: {
        id: "eq-retired-1",
        manufacturer: "Old Furnace Co",
        retireReason: "failure",
        hasDeeperHistory: false,
      },
    });
  });

  it("flags hasDeeperHistory when the immediate predecessor itself has an earlier one", async () => {
    const supabase = makeSupabase({
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      locations: [{ id: "loc-1", customer_id: "cust-1" }],
      jobs: [],
      customer_location_systems: [
        { id: "sys-1", owner_user_id: "owner-1", customer_id: "cust-1", location_id: "loc-1", name: "System 1", archived_at: null },
      ],
      job_systems: [],
      job_equipment: [],
      equipment: [
        { id: "eq-active", owner_user_id: "owner-1", location_id: "loc-1", system_id: "sys-1", equipment_type: "furnace", status: "active" },
        {
          id: "eq-retired-1",
          owner_user_id: "owner-1",
          location_id: "loc-1",
          system_id: "sys-1",
          equipment_type: "furnace",
          status: "retired",
          replaced_by_equipment_id: "eq-active",
        },
        {
          id: "eq-retired-2",
          owner_user_id: "owner-1",
          location_id: "loc-1",
          system_id: "sys-1",
          equipment_type: "furnace",
          status: "retired",
          replaced_by_equipment_id: "eq-retired-1",
        },
      ],
    });

    const summary = await loadCustomerSystemsEquipmentSummary({
      supabase,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
    });

    expect(summary.locations[0].systems[0].equipment[0].priorUnit).toMatchObject({
      id: "eq-retired-1",
      hasDeeperHistory: true,
    });
  });

  it("shows a system as empty when its only unit was retired with no replacement", async () => {
    const supabase = makeSupabase({
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      locations: [{ id: "loc-1", customer_id: "cust-1" }],
      jobs: [],
      customer_location_systems: [
        { id: "sys-1", owner_user_id: "owner-1", customer_id: "cust-1", location_id: "loc-1", name: "System 1", archived_at: null },
      ],
      job_systems: [],
      job_equipment: [],
      equipment: [
        {
          id: "eq-retired",
          owner_user_id: "owner-1",
          location_id: "loc-1",
          system_id: "sys-1",
          equipment_type: "furnace",
          status: "retired",
          replaced_by_equipment_id: null,
        },
      ],
    });

    const summary = await loadCustomerSystemsEquipmentSummary({
      supabase,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
    });

    expect(summary.locations[0].systems[0].equipment).toEqual([]);
    expect(summary.totalEquipmentCount).toBe(0);
  });
});

describe("default system labels (§8.6)", () => {
  it("gives a raw/blank job-sourced system name a 'System N' default, sharing numbering with profile systems", async () => {
    const supabase = makeSupabase({
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      locations: [{ id: "loc-1", customer_id: "cust-1", nickname: "Main House" }],
      jobs: [{ id: "job-1", customer_id: "cust-1", location_id: "loc-1", title: "Service Visit", job_type: "service", deleted_at: null }],
      job_systems: [{ id: "sys-unnamed", job_id: "job-1", name: "" }],
      job_equipment: [{ id: "eq-1", job_id: "job-1", system_id: "sys-unnamed", equipment_role: "furnace" }],
      customer_location_systems: [
        { id: "profile-sys-1", owner_user_id: "owner-1", customer_id: "cust-1", location_id: "loc-1", name: "System 1", archived_at: null },
      ],
      equipment: [
        { id: "profile-eq-1", owner_user_id: "owner-1", location_id: "loc-1", system_id: "profile-sys-1", equipment_type: "furnace", status: "active" },
      ],
    });

    const summary = await loadCustomerSystemsEquipmentSummary({
      supabase,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
    });

    const names = summary.locations[0].systems.map((system) => system.name).sort();
    // "System 1" is taken by the real profile system — the blank job-sourced
    // system must not collide with it.
    expect(names).toEqual(["System 1", "System 2"]);
  });

  it("leaves a real job_systems name untouched", async () => {
    const supabase = makeSupabase({
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      locations: [{ id: "loc-1", customer_id: "cust-1" }],
      jobs: [{ id: "job-1", customer_id: "cust-1", location_id: "loc-1", title: "Service Visit", deleted_at: null }],
      job_systems: [{ id: "sys-1", job_id: "job-1", name: "Upstairs" }],
      job_equipment: [{ id: "eq-1", job_id: "job-1", system_id: "sys-1", equipment_role: "furnace" }],
    });

    const summary = await loadCustomerSystemsEquipmentSummary({
      supabase,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
    });

    expect(summary.locations[0].systems[0].name).toBe("Upstairs");
  });
});

describe("loadEquipmentReplacementHistory", () => {
  it("walks the replacement chain backward, stopping when there is no earlier predecessor", async () => {
    const supabase = makeSupabase({
      jobs: [{ id: "job-1", job_display_number: 42, title: "Furnace swap", job_type: "service" }],
      equipment: [
        {
          id: "eq-retired-1",
          owner_user_id: "owner-1",
          replaced_by_equipment_id: "eq-active",
          manufacturer: "Old Co",
          status: "retired",
          retired_at: "2026-05-01T00:00:00Z",
          retire_reason: "failure",
          install_source: "job",
          source_job_id: "job-1",
        },
        {
          id: "eq-retired-2",
          owner_user_id: "owner-1",
          replaced_by_equipment_id: "eq-retired-1",
          manufacturer: "Older Co",
          status: "retired",
          retired_at: "2020-01-01T00:00:00Z",
          retire_reason: "upgrade",
          install_source: "standalone",
        },
      ],
    });

    const history = await loadEquipmentReplacementHistory({
      supabase,
      accountOwnerUserId: "owner-1",
      equipmentId: "eq-active",
    });

    expect(history.map((unit) => unit.id)).toEqual(["eq-retired-1", "eq-retired-2"]);
    expect(history[0].sourceJob).toMatchObject({ id: "job-1", title: "Furnace swap" });
    expect(history[1].sourceJob).toBeNull();
  });

  it("returns an empty list when the unit was the original install", async () => {
    const supabase = makeSupabase({ equipment: [] });

    const history = await loadEquipmentReplacementHistory({
      supabase,
      accountOwnerUserId: "owner-1",
      equipmentId: "eq-active",
    });

    expect(history).toEqual([]);
  });
});
