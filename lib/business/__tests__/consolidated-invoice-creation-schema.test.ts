import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260720200000_create_consolidated_invoice_draft_rpc.sql"),
  "utf8",
).toLowerCase();

describe("atomic consolidated invoice creation schema", () => {
  it("adds account-scoped request idempotency", () => {
    expect(sql).toContain("add column if not exists consolidated_request_key text null");
    expect(sql).toContain("internal_invoices_owner_consolidated_request_unique_idx");
    expect(sql).toContain("where consolidated_request_key is not null");
    expect(sql).toContain("and consolidated_request_key = p_request_key");
    expect(sql).toContain("request key was already used for a different job selection");
  });

  it("keeps the entire creation path in one database function", () => {
    expect(sql).toContain("create or replace function public.create_consolidated_invoice_draft_v1");
    expect(sql).toContain("insert into public.internal_invoices");
    expect(sql).toContain("insert into public.internal_invoice_jobs");
    expect(sql).toContain("insert into public.internal_invoice_line_items");
    expect(sql).toContain("insert into public.job_events");
    expect(sql).toContain("returns uuid");
  });

  it("revalidates authority, job readiness, account, contractor, and active invoice conflicts", () => {
    expect(sql).toContain("invoice lifecycle authority required");
    expect(sql).toContain("all selected jobs must belong to the authenticated account");
    expect(sql).toContain("selected job is not eligible for consolidated internal invoicing");
    expect(sql).toContain("all selected jobs must use the same contractor");
    expect(sql).toContain("selected job already belongs to an active primary invoice");
  });

  it("locks jobs and rejects partial or invalid composition", () => {
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("for update");
    expect(sql).toContain("consolidated invoice membership contains duplicate jobs");
    expect(sql).toContain("every invoice line source job must be selected");
    expect(sql).toContain("every selected job must contribute invoice lines");
    expect(sql).toContain("invoice line ordering must be contiguous and deterministic");
    expect(sql).toContain("consolidated invoice total must be positive");
  });

  it("has no issue, send, payment, job-closeout, or qbo mutation", () => {
    expect(sql).not.toMatch(/update\s+public\.jobs/);
    expect(sql).not.toMatch(/insert into\s+public\.internal_invoice_payments/);
    expect(sql).not.toMatch(/insert into\s+public\.notifications/);
    expect(sql).not.toMatch(/qbo_sync_status\s*=/);
    expect(sql).not.toMatch(/status\s*=\s*'issued'/);
  });
});
