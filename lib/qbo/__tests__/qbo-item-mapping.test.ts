import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it, vi } from "vitest";

import {
  encodeQboItemSelection,
  isMissingQboItemMappingColumnError,
  parseQboItemSelection,
  readAccountDefaultQboItem,
  readPricebookQboItemMappings,
} from "@/lib/qbo/qbo-item-mapping";

/** Minimal supabase double: one table, one canned result, recorded filters. */
function makeSupabase(result: { data?: any; error?: any }) {
  const calls: any = { table: "", inValues: null as string[] | null, selected: "" };
  const builder: any = {
    from(table: string) {
      calls.table = table;
      return builder;
    },
    select(columns: string) {
      calls.selected = columns;
      return builder;
    },
    eq() { return builder; },
    in(_column: string, values: string[]) {
      calls.inValues = values;
      return builder;
    },
    async maybeSingle() {
      return { data: result.data ?? null, error: result.error ?? null };
    },
    then(resolveFn: (value: any) => void) {
      resolveFn({ data: result.data ?? null, error: result.error ?? null });
    },
  };
  return { supabase: builder, calls };
}

describe("readAccountDefaultQboItem", () => {
  it("returns the account default when one is configured", async () => {
    const { supabase, calls } = makeSupabase({
      data: { default_qbo_item_id: "77", default_qbo_item_name: "Field Services" },
    });
    await expect(readAccountDefaultQboItem({ supabase, accountOwnerUserId: "acc" })).resolves.toEqual({
      qboItemId: "77",
      qboItemName: "Field Services",
    });
    // Read through its own narrow select, never the shared connection select.
    expect(calls.selected).toBe("default_qbo_item_id, default_qbo_item_name");
  });

  it("returns null when no default is set", async () => {
    const { supabase } = makeSupabase({ data: { default_qbo_item_id: null, default_qbo_item_name: null } });
    await expect(readAccountDefaultQboItem({ supabase, accountOwnerUserId: "acc" })).resolves.toBeNull();
  });

  it("degrades to null when the columns are not deployed yet", async () => {
    const { supabase } = makeSupabase({
      error: { code: "42703", message: 'column qbo_connections.default_qbo_item_id does not exist' },
    });
    await expect(readAccountDefaultQboItem({ supabase, accountOwnerUserId: "acc" })).resolves.toBeNull();
  });

  it("does not query without an account scope", async () => {
    const supabase = { from: vi.fn() };
    await expect(readAccountDefaultQboItem({ supabase, accountOwnerUserId: "  " })).resolves.toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("readPricebookQboItemMappings", () => {
  it("resolves every mapped id in one batched query", async () => {
    const { supabase, calls } = makeSupabase({
      data: [
        { id: "pb-1", item_name: "Duct Cleaning", qbo_item_id: "41", qbo_item_name: "Duct Cleaning (QBO)" },
        { id: "pb-2", item_name: "Filter", qbo_item_id: null, qbo_item_name: null },
      ],
    });

    const mappings = await readPricebookQboItemMappings({
      supabase,
      accountOwnerUserId: "acc",
      pricebookItemIds: ["pb-1", "pb-2", "pb-1"],
    });

    expect(mappings.get("pb-1")).toEqual({
      qboItemId: "41",
      qboItemName: "Duct Cleaning (QBO)",
      pricebookItemName: "Duct Cleaning",
    });
    expect(mappings.has("pb-2")).toBe(false);
    expect(calls.inValues).toEqual(["pb-1", "pb-2"]);
  });

  it("degrades to no mappings when the columns are not deployed yet", async () => {
    const { supabase } = makeSupabase({
      error: { code: "42703", message: 'column pricebook_items.qbo_item_id does not exist' },
    });
    const mappings = await readPricebookQboItemMappings({
      supabase,
      accountOwnerUserId: "acc",
      pricebookItemIds: ["pb-1"],
    });
    expect(mappings.size).toBe(0);
  });

  it("skips the query entirely when no line carries a pricebook id", async () => {
    const supabase = { from: vi.fn() };
    const mappings = await readPricebookQboItemMappings({
      supabase,
      accountOwnerUserId: "acc",
      pricebookItemIds: [],
    });
    expect(mappings.size).toBe(0);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("QBO item form selection", () => {
  it("round-trips an id and its display name", () => {
    expect(parseQboItemSelection(encodeQboItemSelection({ id: "41", name: "Duct Cleaning" }))).toEqual({
      qboItemId: "41",
      qboItemName: "Duct Cleaning",
    });
  });

  it("keeps separators inside a QuickBooks item name", () => {
    expect(parseQboItemSelection(encodeQboItemSelection({ id: "9", name: "HVAC | Repair" }))).toEqual({
      qboItemId: "9",
      qboItemName: "HVAC | Repair",
    });
  });

  it("treats an empty selection as clearing the mapping", () => {
    expect(parseQboItemSelection("")).toBeNull();
    expect(parseQboItemSelection(null)).toBeNull();
    expect(parseQboItemSelection("|Just a name")).toBeNull();
  });
});

describe("missing-column detection", () => {
  it("recognizes the not-deployed-yet failures", () => {
    expect(isMissingQboItemMappingColumnError({ code: "42703", message: "column pricebook_items.qbo_item_id does not exist" })).toBe(true);
    expect(isMissingQboItemMappingColumnError({ message: 'column "default_qbo_item_id" does not exist' })).toBe(true);
  });

  it("does not swallow unrelated failures", () => {
    expect(isMissingQboItemMappingColumnError({ code: "42703", message: "column pricebook_items.widget does not exist" })).toBe(false);
    expect(isMissingQboItemMappingColumnError(new Error("permission denied"))).toBe(false);
  });
});

describe("the bare 'Services' item lookup is gone", () => {
  it("no QBO source file queries Item by the unnamespaced name", () => {
    const sources = [
      "lib/qbo/qbo-api-client.ts",
      "lib/qbo/qbo-sync.ts",
      "lib/qbo/qbo-payment-sync.ts",
      "lib/qbo/qbo-item-mapping.ts",
    ].map((path) => readFileSync(resolve(process.cwd(), path), "utf8"));

    for (const source of sources) {
      expect(source).not.toContain("from Item where Name = 'Services'");
      expect(source).not.toContain('Name: "Services"');
    }
    expect(sources[0]).toContain("from Item where Name = '${escapeQboQueryValue(EVERYSTEP_FALLBACK_QBO_ITEM_NAME)}'");
  });
});
