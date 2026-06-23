import { describe, expect, it } from "vitest";
import { loadCustomerSystemsEquipmentSummary } from "@/lib/customers/customer-systems-equipment-read-model";

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
});
