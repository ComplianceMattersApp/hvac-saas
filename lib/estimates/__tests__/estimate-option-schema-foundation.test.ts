import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260519110000_estimate_option_packages_foundation.sql",
);

const sql = readFileSync(migrationPath, "utf8");

describe("estimate option package schema foundation migration", () => {
  it("adds additive option package tables without altering current flat estimate_line_items", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.estimate_options");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.estimate_option_line_items");
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.estimate_line_items/i);
    expect(sql).not.toMatch(/DROP TABLE\s+(IF EXISTS\s+)?public\.estimate_line_items/i);
  });

  it("locks V1 option slots and editable-label posture", () => {
    expect(sql).toContain("slot_index            integer     NOT NULL");
    expect(sql).toContain("default_label_key     text        NULL");
    expect(sql).toContain("label                 text        NOT NULL");
    expect(sql).toContain("sort_order            integer     NOT NULL");
    expect(sql).toContain("UNIQUE (estimate_id, slot_index)");
    expect(sql).toContain("CHECK (slot_index BETWEEN 1 AND 3)");
    expect(sql).toContain("default_label_key IN ('good', 'better', 'best')");
  });

  it("stores per-option totals and option-line frozen snapshots", () => {
    expect(sql).toContain("subtotal_cents        integer     NOT NULL DEFAULT 0");
    expect(sql).toContain("total_cents           integer     NOT NULL DEFAULT 0");
    expect(sql).toContain("source_pricebook_item_id");
    expect(sql).toContain("item_name_snapshot");
    expect(sql).toContain("description_snapshot");
    expect(sql).toContain("item_type_snapshot");
    expect(sql).toContain("category_snapshot");
    expect(sql).toContain("unit_label_snapshot");
    expect(sql).toContain("quantity                     numeric(12,2)  NOT NULL");
    expect(sql).toContain("unit_price_cents             integer        NOT NULL");
    expect(sql).toContain("line_subtotal_cents          integer        NOT NULL");
  });

  it("enforces option-line estimate consistency with a composite foreign key", () => {
    expect(sql).toContain("UNIQUE (id, estimate_id)");
    expect(sql).toContain("FOREIGN KEY (estimate_option_id, estimate_id)");
    expect(sql).toContain("REFERENCES public.estimate_options (id, estimate_id)");
  });

  it("adds scoped indexes for option and option-line reads", () => {
    expect(sql).toContain("estimate_options_estimate_sort_idx");
    expect(sql).toContain("ON public.estimate_options (estimate_id, sort_order, created_at)");
    expect(sql).toContain("estimate_option_line_items_option_sort_idx");
    expect(sql).toContain("ON public.estimate_option_line_items (estimate_option_id, sort_order, created_at)");
    expect(sql).toContain("estimate_option_line_items_estimate_idx");
    expect(sql).toContain("estimate_option_line_items_source_pricebook_idx");
  });

  it("mirrors internal account-scoped RLS and does not add option delete policy", () => {
    expect(sql).toContain("ALTER TABLE public.estimate_options ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE public.estimate_option_line_items ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("CREATE POLICY estimate_options_select_account_scope");
    expect(sql).toContain("CREATE POLICY estimate_options_insert_account_scope");
    expect(sql).toContain("CREATE POLICY estimate_options_update_account_scope");
    expect(sql).not.toContain("CREATE POLICY estimate_options_delete_account_scope");
    expect(sql).toContain("CREATE POLICY estimate_option_line_items_select_account_scope");
    expect(sql).toContain("CREATE POLICY estimate_option_line_items_insert_account_scope");
    expect(sql).toContain("CREATE POLICY estimate_option_line_items_update_account_scope");
    expect(sql).toContain("CREATE POLICY estimate_option_line_items_delete_account_scope");
    expect(sql).toContain("actor.user_id = auth.uid()");
    expect(sql).toContain("actor.is_active = true");
    expect(sql).not.toMatch(/TO\s+anon/i);
  });
});
