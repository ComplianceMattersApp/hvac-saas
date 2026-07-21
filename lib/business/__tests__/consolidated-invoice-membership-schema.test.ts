import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260720190000_consolidated_invoice_membership_foundation.sql"),
  "utf8",
).toLowerCase();

describe("consolidated invoice membership schema foundation", () => {
  it("adds durable ordered invoice membership without removing the anchor job", () => {
    expect(sql).toContain("create table if not exists public.internal_invoice_jobs");
    expect(sql).toContain("internal_invoice_id uuid not null references public.internal_invoices(id) on delete restrict");
    expect(sql).toContain("job_id uuid not null references public.jobs(id) on delete restrict");
    expect(sql).toContain("unique (internal_invoice_id, job_id)");
    expect(sql).toContain("unique (internal_invoice_id, inclusion_order)");
    expect(sql).not.toMatch(/alter table public\.internal_invoices\s+drop column(?: if exists)? job_id/);
  });

  it("backfills and automatically preserves single-job anchor membership", () => {
    expect(sql).toContain("create or replace function public.ensure_internal_invoice_anchor_membership()");
    expect(sql).toContain("create trigger trg_internal_invoices_ensure_anchor_membership");
    expect(sql).toContain("from public.internal_invoices invoice");
    expect(sql).toContain("on conflict (internal_invoice_id, job_id) do nothing");
  });

  it("enforces tenant scope and one active primary invoice across every member job", () => {
    expect(sql).toContain("internal_invoice_jobs account scope mismatch");
    expect(sql).toContain("supplemental invoice membership must remain on its anchor job");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("job already belongs to an active primary invoice");
    expect(sql).toContain("invoice.status <> 'void'");
    expect(sql).toContain("invoice.invoice_kind = 'primary'");
    expect(sql).toContain("create trigger trg_internal_invoices_assert_active_memberships");
  });

  it("protects historical membership and provides account-scoped rls", () => {
    expect(sql).toContain("invoice anchor membership cannot be deleted");
    expect(sql).toContain("issued or void invoice membership is immutable");
    expect(sql).toContain("issued or void invoice membership cannot be deleted");
    expect(sql).toContain("alter table public.internal_invoice_jobs enable row level security");
    expect(sql).toContain("internal_invoice_jobs_select_account_scope");
    expect(sql).toContain("internal_invoice_jobs_insert_account_scope");
    expect(sql).toContain("internal_invoice_jobs_update_account_scope");
    expect(sql).toContain("internal_invoice_jobs_delete_account_scope");
  });

  it("adds source-job provenance and requires every source job to be a member", () => {
    expect(sql).toContain("add column if not exists source_job_id uuid null references public.jobs(id) on delete restrict");
    expect(sql).toContain("set source_job_id = invoice.job_id");
    expect(sql).toContain("foreign key (invoice_id, source_job_id)");
    expect(sql).toContain("references public.internal_invoice_jobs (internal_invoice_id, job_id)");
    expect(sql).toContain("new.source_job_id := coalesce(new.source_job_id, v_anchor_job_id)");
    expect(sql).toContain("invoice line source job must belong to the invoice");
    expect(sql).toContain("create trigger trg_internal_invoice_line_items_assert_source_job");
  });

  it("does not mutate payment, qbo, issue, or delivery truth", () => {
    expect(sql).not.toMatch(/alter table public\.internal_invoice_payments/);
    expect(sql).not.toMatch(/alter table public\.internal_invoice_payment_allocations/);
    expect(sql).not.toMatch(/alter table public\.qbo_/);
    expect(sql).not.toMatch(/update public\.jobs/);
    expect(sql).not.toMatch(/update public\.internal_invoices/);
  });
});
