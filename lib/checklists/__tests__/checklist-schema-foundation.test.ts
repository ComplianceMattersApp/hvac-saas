import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260619120000_checklist_foundation_v1b.sql",
);

const sql = readFileSync(MIGRATION_PATH, "utf8");
const lowerSql = sql.toLowerCase();

describe("checklist foundation schema migration", () => {
  it("adds the five dormant checklist foundation tables", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.checklist_templates");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.checklist_template_sections");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.checklist_template_items");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.job_checklist_runs");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.job_checklist_item_results");
  });

  it("defines required template, section, item, run, and result columns", () => {
    expect(sql).toContain("account_owner_user_id uuid NOT NULL REFERENCES auth.users(id)");
    expect(sql).toContain("template_name text NOT NULL");
    expect(sql).toContain("product_mode text NULL");
    expect(sql).toContain("is_active boolean NOT NULL DEFAULT true");
    expect(sql).toContain("template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE");
    expect(sql).toContain("section_label text NOT NULL");
    expect(sql).toContain("section_id uuid NULL REFERENCES public.checklist_template_sections(id) ON DELETE SET NULL");
    expect(sql).toContain("item_label text NOT NULL");
    expect(sql).toContain("response_type text NOT NULL DEFAULT 'checkbox'");
    expect(sql).toContain("job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE");
    expect(sql).toContain("template_name_snapshot text NOT NULL");
    expect(sql).toContain("status text NOT NULL DEFAULT 'not_started'");
    expect(sql).toContain("run_id uuid NOT NULL REFERENCES public.job_checklist_runs(id) ON DELETE CASCADE");
    expect(sql).toContain("template_item_id uuid NULL REFERENCES public.checklist_template_items(id) ON DELETE SET NULL");
    expect(sql).toContain("item_label_snapshot text NOT NULL");
    expect(sql).toContain("response_type_snapshot text NOT NULL");
    expect(sql).toContain("issue_found boolean NOT NULL DEFAULT false");
    expect(sql).toContain("not_applicable boolean NOT NULL DEFAULT false");
  });

  it("locks allowed product modes, run statuses, response types, and result values", () => {
    expect(sql).toContain("checklist_templates_product_mode_valid_chk");
    expect(sql).toContain("'cleaning_services'");
    expect(sql).toContain("'hybrid'");
    expect(sql).toContain("'hvac_service'");
    expect(sql).toContain("'ecc_hers'");
    expect(sql).toContain("job_checklist_runs_status_valid_chk");
    expect(sql).toContain("status IN ('not_started', 'in_progress', 'completed', 'issue_found')");
    expect(sql).toContain("checklist_template_items_response_type_valid_chk");
    expect(sql).toContain("job_checklist_item_results_response_type_valid_chk");
    expect(sql).toContain("'checkbox'");
    expect(sql).toContain("'yes_no'");
    expect(sql).toContain("'pass_fail'");
    expect(sql).toContain("'note_required'");
    expect(sql).toContain("'photo_required_placeholder'");
    expect(sql).toContain("result_value IN ('done', 'yes', 'no', 'pass', 'fail', 'issue')");
    expect(sql).toContain("job_checklist_item_results_issue_not_applicable_exclusive_chk");
  });

  it("adds practical indexes including one active run per job and one result per run/template item", () => {
    expect(sql).toContain("checklist_templates_owner_active_sort_idx");
    expect(sql).toContain("checklist_template_sections_template_sort_idx");
    expect(sql).toContain("checklist_template_items_template_section_sort_idx");
    expect(sql).toContain("job_checklist_runs_owner_job_idx");
    expect(sql).toContain("job_checklist_runs_owner_status_idx");
    expect(sql).toContain("job_checklist_item_results_run_idx");
    expect(sql).toContain("job_checklist_item_results_owner_issue_idx");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS job_checklist_runs_one_active_per_job_idx");
    expect(sql).toContain("WHERE archived_at IS NULL");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS job_checklist_item_results_one_template_item_per_run_idx");
    expect(sql).toContain("WHERE template_item_id IS NOT NULL");
  });

  it("adds same-account assertion functions and triggers for linked records", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.assert_checklist_template_section_account_scope()");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.assert_checklist_template_item_account_scope()");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.assert_job_checklist_run_account_scope()");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.assert_job_checklist_item_result_account_scope()");
    expect(sql).toContain("checklist template section account scope mismatch");
    expect(sql).toContain("checklist template item section account/template scope mismatch");
    expect(sql).toContain("job checklist run account_owner_user_id must match jobs.account_owner_user_id");
    expect(sql).toContain("job checklist item result template item account scope mismatch");
    expect(sql).toContain("CREATE TRIGGER checklist_template_sections_assert_account_scope");
    expect(sql).toContain("CREATE TRIGGER checklist_template_items_assert_account_scope");
    expect(sql).toContain("CREATE TRIGGER job_checklist_runs_assert_account_scope");
    expect(sql).toContain("CREATE TRIGGER job_checklist_item_results_assert_account_scope");
  });

  it("enables RLS with scoped select, insert, and update policies and no delete policies", () => {
    for (const table of [
      "checklist_templates",
      "checklist_template_sections",
      "checklist_template_items",
      "job_checklist_runs",
      "job_checklist_item_results",
    ]) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`CREATE POLICY ${table}_select_account_scope`);
      expect(sql).toContain(`CREATE POLICY ${table}_insert_account_scope`);
      expect(sql).toContain(`CREATE POLICY ${table}_update_account_scope`);
      expect(sql).not.toContain(`CREATE POLICY ${table}_delete`);
    }

    expect(sql).toContain("public.current_internal_account_owner_id() IS NOT NULL");
    expect(lowerSql).not.toContain("for delete");
    expect(lowerSql).not.toContain("contractor_users");
  });

  it("keeps checklist foundation away from forbidden runtime side-effect tables", () => {
    expect(lowerSql).not.toContain("alter table public.jobs");
    expect(lowerSql).not.toContain("alter table public.pricebook_items");
    expect(lowerSql).not.toContain("alter table public.internal_invoices");
    expect(lowerSql).not.toContain("alter table public.internal_invoice_line_items");
    expect(lowerSql).not.toContain("alter table public.internal_invoice_payments");
    expect(lowerSql).not.toContain("alter table public.maintenance_agreements");
    expect(lowerSql).not.toContain("alter table public.maintenance_agreement_visits");
    expect(lowerSql).not.toContain("alter table public.job_events");
    expect(lowerSql).not.toContain("insert into public.pricebook_items");
    expect(lowerSql).not.toContain("insert into public.job_events");
    expect(lowerSql).not.toContain("insert into public.job_checklist");
    expect(lowerSql).not.toContain("storage.");
  });
});
