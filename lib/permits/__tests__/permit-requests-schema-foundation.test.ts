import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260616143000_permit_requests_foundation.sql",
);

const OPS_QUEUE_CONTRACT_PATH = resolve(process.cwd(), "lib/ops/queue-status-contracts.ts");

function migrationSql() {
  return readFileSync(MIGRATION_PATH, "utf8");
}

describe("permit requests schema foundation", () => {
  it("adds dormant permit request and permit event tables", () => {
    const sql = migrationSql();

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.permit_requests");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.permit_request_events");
    expect(sql).toContain("contractor_id uuid NOT NULL REFERENCES public.contractors(id)");
    expect(sql).toContain("job_id uuid NULL REFERENCES public.jobs(id)");
    expect(sql).toContain("service_case_id uuid NULL REFERENCES public.service_cases(id)");
    expect(sql).toContain(
      "contractor_intake_submission_id uuid NULL REFERENCES public.contractor_intake_submissions(id)",
    );
  });

  it("constrains permit statuses, active queue states, hold reason, and post-permit routes", () => {
    const sql = migrationSql();

    expect(sql).toContain("'permit_request'");
    expect(sql).toContain("'accepted_in_process'");
    expect(sql).toContain("'on_hold_additional_info_needed'");
    expect(sql).toContain("'permit_created'");
    expect(sql).toContain("'additional_information_needed'");
    expect(sql).toContain("'ready_for_testing'");
    expect(sql).toContain("'pending_install'");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS permit_requests_active_queue_idx");
    expect(sql).toContain("WHERE status IN (\n    'permit_request',\n    'accepted_in_process',\n    'on_hold_additional_info_needed'\n  )");
  });

  it("defines durable permit lifecycle event types without writing job_events yet", () => {
    const sql = migrationSql();

    expect(sql).toContain("'permit_request_received'");
    expect(sql).toContain("'permit_request_accepted'");
    expect(sql).toContain("'permit_request_on_hold'");
    expect(sql).toContain("'permit_created'");
    expect(sql).toContain("'permit_ready_for_testing'");
    expect(sql).toContain("'permit_pending_install'");
    expect(sql.toLowerCase()).not.toContain("insert into public.job_events");
  });

  it("adds account-scope assertions and scoped select policies only", () => {
    const sql = migrationSql();

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.assert_permit_request_account_scope()");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.assert_permit_request_event_account_scope()");
    expect(sql).toContain("public.job_matches_account_owner(");
    expect(sql).toContain("public.service_case_matches_account_owner(");
    expect(sql).toContain("permit_requests_internal_select_account_scope");
    expect(sql).toContain("permit_requests_contractor_select_own");
    expect(sql).toContain("permit_request_events_internal_select_account_scope");
    expect(sql).toContain("permit_request_events_contractor_select_own");
    expect(sql.toLowerCase()).not.toContain("for delete");
  });

  it("keeps Slice 2 away from Ops UI, jobs, ECC, invoices, and payments", () => {
    const sql = migrationSql().toLowerCase();

    expect(sql).not.toContain("alter table public.jobs");
    expect(sql).not.toContain("ops_status");
    expect(sql).not.toContain("ecc_test_runs");
    expect(sql).not.toContain("internal_invoices");
    expect(sql).not.toContain("internal_invoice_payments");
    expect(sql).not.toContain("stripe");
  });

  it("does not alter existing waiting/exception Ops queue status contracts", () => {
    const opsQueueContract = readFileSync(OPS_QUEUE_CONTRACT_PATH, "utf8");

    expect(opsQueueContract).toContain("WAITING_QUEUE_STATUSES");
    expect(opsQueueContract).toContain("EXCEPTION_QUEUE_STATUSES");
    expect(opsQueueContract).not.toContain("permit_request");
    expect(opsQueueContract).not.toContain("accepted_in_process");
    expect(opsQueueContract).not.toContain("on_hold_additional_info_needed");
  });
});
