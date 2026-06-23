import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

import {
  archiveSystemFilter,
  createSystemFilter,
  listSystemFiltersBySystemIds,
  listSystemFiltersForCustomerSystems,
  normalizeSystemFilterCreateInput,
  updateSystemFilter,
} from "@/lib/customers/system-filters-read-model";

type TableData = Record<string, any[]>;

function makeSupabase(tables: TableData) {
  const calls: Array<{ table: string; op: string; value?: unknown; payload?: unknown }> = [];

  class Query {
    private rows: any[];
    private filters: Array<(row: any) => boolean> = [];
    private single = false;
    private payload: any = null;
    private mutation: "insert" | "update" | null = null;

    constructor(private table: string) {
      this.rows = tables[table] ?? [];
    }

    select(value: string) {
      calls.push({ table: this.table, op: "select", value });
      return this;
    }

    eq(column: string, value: unknown) {
      calls.push({ table: this.table, op: "eq", value: [column, value] });
      this.filters.push((row) => row[column] === value);
      return this;
    }

    in(column: string, values: unknown[]) {
      calls.push({ table: this.table, op: "in", value: [column, values] });
      const allowed = new Set(values);
      this.filters.push((row) => allowed.has(row[column]));
      return this;
    }

    is(column: string, value: unknown) {
      calls.push({ table: this.table, op: "is", value: [column, value] });
      this.filters.push((row) => row[column] === value);
      return this;
    }

    order(column: string) {
      calls.push({ table: this.table, op: "order", value: column });
      return this;
    }

    maybeSingle() {
      this.single = true;
      return this;
    }

    insert(payload: any) {
      calls.push({ table: this.table, op: "insert", payload });
      this.mutation = "insert";
      this.payload = payload;
      return this;
    }

    update(payload: any) {
      calls.push({ table: this.table, op: "update", payload });
      this.mutation = "update";
      this.payload = payload;
      return this;
    }

    delete() {
      calls.push({ table: this.table, op: "delete" });
      throw new Error("Hard delete should not be used by system filter helpers");
    }

    then(resolveThen: (value: any) => void) {
      if (this.mutation === "insert") {
        const inserted = {
          id: this.payload.id ?? `filter-${this.rows.length + 1}`,
          created_at: "2026-06-23T12:00:00Z",
          updated_at: "2026-06-23T12:00:00Z",
          archived_at: null,
          archived_by_user_id: null,
          ...this.payload,
        };
        this.rows.push(inserted);
        resolveThen({ data: this.single ? inserted : [inserted], error: null });
        return;
      }

      let data = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
      if (this.mutation === "update") {
        data = data.map((row) => {
          Object.assign(row, this.payload, { updated_at: "2026-06-23T13:00:00Z" });
          return row;
        });
      }
      resolveThen({ data: this.single ? data[0] ?? null : data, error: null });
    }
  }

  return {
    calls,
    tables,
    from(table: string) {
      calls.push({ table, op: "from" });
      return new Query(table);
    },
  };
}

function makeFilter(overrides: Partial<any> & { id: string; system_id: string }) {
  return {
    account_owner_user_id: "owner-1",
    label: null,
    length: 20,
    width: 25,
    height: 1,
    date_changed: "2026-06-01",
    notes: null,
    created_by_user_id: "user-1",
    updated_by_user_id: "user-1",
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    archived_at: null,
    archived_by_user_id: null,
    ...overrides,
  };
}

describe("system filter read model foundation", () => {
  it("normalizes valid create input and rejects invalid dimensions or dates", () => {
    expect(
      normalizeSystemFilterCreateInput({
        systemId: "system-1",
        accountOwnerUserId: "owner-1",
        label: " Hall return ",
        length: "20",
        width: 25,
        height: "1",
        dateChanged: "2026-06-23",
        notes: "  changed at service  ",
        userId: "user-1",
      }),
    ).toMatchObject({
      system_id: "system-1",
      account_owner_user_id: "owner-1",
      label: "Hall return",
      length: 20,
      width: 25,
      height: 1,
      date_changed: "2026-06-23",
      notes: "changed at service",
    });

    expect(() =>
      normalizeSystemFilterCreateInput({
        systemId: "system-1",
        accountOwnerUserId: "owner-1",
        length: 0,
        width: 25,
        height: 1,
        dateChanged: "2026-06-23",
      }),
    ).toThrow("SYSTEM_FILTER_LENGTH_MUST_BE_POSITIVE");

    expect(() =>
      normalizeSystemFilterCreateInput({
        systemId: "system-1",
        accountOwnerUserId: "owner-1",
        length: 20,
        width: 25,
        height: 1,
        dateChanged: "2026-02-31",
      }),
    ).toThrow("SYSTEM_FILTER_DATE_CHANGED_INVALID");
  });

  it("lists multiple active filters for one system and omits archived records by default", async () => {
    const supabase = makeSupabase({
      job_system_filters: [
        makeFilter({ id: "filter-1", system_id: "system-1", label: "Hall return" }),
        makeFilter({ id: "filter-2", system_id: "system-1", label: "Ceiling return" }),
        makeFilter({ id: "filter-3", system_id: "system-1", archived_at: "2026-06-10T00:00:00Z" }),
        makeFilter({ id: "filter-4", system_id: "system-2", account_owner_user_id: "owner-2" }),
      ],
    });

    const rows = await listSystemFiltersBySystemIds({
      supabase,
      accountOwnerUserId: "owner-1",
      systemIds: ["system-1"],
    });

    expect(rows.map((row) => row.id)).toEqual(["filter-1", "filter-2"]);
    expect(supabase.calls).toContainEqual({ table: "job_system_filters", op: "eq", value: ["account_owner_user_id", "owner-1"] });
    expect(supabase.calls).toContainEqual({ table: "job_system_filters", op: "is", value: ["archived_at", null] });
  });

  it("lists filters for customer systems through same-account jobs", async () => {
    const supabase = makeSupabase({
      jobs: [
        { id: "job-1", account_owner_user_id: "owner-1", customer_id: "customer-1", deleted_at: null },
        { id: "job-2", account_owner_user_id: "owner-2", customer_id: "customer-1", deleted_at: null },
      ],
      job_systems: [
        { id: "system-1", job_id: "job-1" },
        { id: "system-2", job_id: "job-2" },
      ],
      job_system_filters: [
        makeFilter({ id: "filter-1", system_id: "system-1" }),
        makeFilter({ id: "filter-2", system_id: "system-2", account_owner_user_id: "owner-2" }),
      ],
    });

    const rows = await listSystemFiltersForCustomerSystems({
      supabase,
      accountOwnerUserId: "owner-1",
      customerId: "customer-1",
    });

    expect(rows.map((row) => row.id)).toEqual(["filter-1"]);
    expect(supabase.calls).toContainEqual({ table: "jobs", op: "eq", value: ["account_owner_user_id", "owner-1"] });
    expect(supabase.calls).toContainEqual({ table: "jobs", op: "eq", value: ["customer_id", "customer-1"] });
  });

  it("creates only after parent system is in the same account", async () => {
    const supabase = makeSupabase({
      job_systems: [
        {
          id: "system-1",
          job_id: "job-1",
          jobs: { id: "job-1", account_owner_user_id: "owner-1", customer_id: "customer-1", deleted_at: null },
        },
      ],
      job_system_filters: [],
    });

    const row = await createSystemFilter({
      supabase,
      input: {
        systemId: "system-1",
        accountOwnerUserId: "owner-1",
        label: "Attic unit",
        length: 16,
        width: 20,
        height: 1,
        dateChanged: "2026-06-23",
        userId: "user-1",
      },
    });

    expect(row).toMatchObject({ system_id: "system-1", account_owner_user_id: "owner-1", label: "Attic unit" });
    expect(supabase.tables.job_system_filters).toHaveLength(1);
  });

  it("blocks create before insert when parent system belongs to another account", async () => {
    const supabase = makeSupabase({
      job_systems: [
        {
          id: "system-1",
          job_id: "job-1",
          jobs: { id: "job-1", account_owner_user_id: "owner-2", customer_id: "customer-1", deleted_at: null },
        },
      ],
      job_system_filters: [],
    });

    await expect(
      createSystemFilter({
        supabase,
        input: {
          systemId: "system-1",
          accountOwnerUserId: "owner-1",
          length: 16,
          width: 20,
          height: 1,
          dateChanged: "2026-06-23",
        },
      }),
    ).rejects.toThrow("SYSTEM_FILTER_SYSTEM_SCOPE_DENIED");

    expect(supabase.calls.some((call) => call.table === "job_system_filters" && call.op === "insert")).toBe(false);
  });

  it("updates and archives by account without hard delete", async () => {
    const supabase = makeSupabase({
      job_system_filters: [makeFilter({ id: "filter-1", system_id: "system-1", label: "Old" })],
    });

    const updated = await updateSystemFilter({
      supabase,
      input: {
        filterId: "filter-1",
        accountOwnerUserId: "owner-1",
        label: "Bedroom hallway",
        length: 14,
        width: 20,
        height: 1,
        dateChanged: "2026-06-20",
        userId: "user-2",
      },
    });

    expect(updated).toMatchObject({ label: "Bedroom hallway", length: 14, updated_by_user_id: "user-2" });

    const archived = await archiveSystemFilter({
      supabase,
      filterId: "filter-1",
      accountOwnerUserId: "owner-1",
      userId: "user-2",
      archivedAt: "2026-06-23T00:00:00Z",
    });

    expect(archived.archived_at).toBe("2026-06-23T00:00:00Z");
    expect(supabase.calls.some((call) => call.op === "delete")).toBe(false);
  });
});

describe("job_system_filters migration contract", () => {
  const migrationSource = readFileSync(
    resolve(__dirname, "../../../supabase/migrations/20260623120000_job_system_filters_foundation_v1.sql"),
    "utf8",
  );

  it("creates additive system-level filter table without touching system or equipment columns", () => {
    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS public.job_system_filters");
    expect(migrationSource).toContain("system_id uuid NOT NULL REFERENCES public.job_systems(id)");
    expect(migrationSource).toContain("account_owner_user_id uuid NOT NULL");
    expect(migrationSource).toContain("date_changed date NOT NULL");
    expect(migrationSource).toContain("archived_at timestamptz NULL");
    expect(migrationSource).not.toContain("ALTER TABLE public.job_systems ADD COLUMN");
    expect(migrationSource).not.toContain("ALTER TABLE public.job_equipment ADD COLUMN");
  });

  it("enforces dimensions, same-account scope, RLS, and no delete policy", () => {
    expect(migrationSource).toContain("CHECK (length > 0)");
    expect(migrationSource).toContain("CHECK (width > 0)");
    expect(migrationSource).toContain("CHECK (height > 0)");
    expect(migrationSource).toContain("assert_job_system_filter_account_scope");
    expect(migrationSource).toContain("job_system_filters_internal_select_account_scope");
    expect(migrationSource).toContain("job_system_filters_internal_insert_account_scope");
    expect(migrationSource).toContain("job_system_filters_internal_update_account_scope");
    expect(migrationSource).not.toContain("FOR DELETE");
    expect(migrationSource).not.toContain("CREATE POLICY job_system_filters_internal_delete");
  });
});
