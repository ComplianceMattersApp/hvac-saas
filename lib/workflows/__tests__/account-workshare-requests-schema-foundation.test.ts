import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260708100000_account_workshare_requests_foundation.sql",
);

describe("account workshare requests schema foundation", () => {
  it("defines sender-to-receiver ECC/HERS request bridge rows with safe snapshots", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.account_workshare_requests");
    expect(sql).toContain("connection_id");
    expect(sql).toContain("REFERENCES public.account_workshare_connections(id)");
    expect(sql).toContain("sender_account_id");
    expect(sql).toContain("receiver_account_id");
    expect(sql).toContain("source_job_id");
    expect(sql).toContain("receiving_job_id");
    expect(sql).toContain("receiving_job_id                uuid        NULL");
    expect(sql).toContain("request_type                    text        NOT NULL DEFAULT 'ecc_hers_testing'");
    expect(sql).toContain("status                          text        NOT NULL DEFAULT 'sent'");
    expect(sql).toContain("customer_name_snapshot");
    expect(sql).toContain("location_address_snapshot");
    expect(sql).toContain("source_job_title_snapshot");
    expect(sql).toContain("permit_number_snapshot");
    expect(sql).toContain("requested_scope_snapshot        jsonb");
    expect(sql).toContain("sender_notes_snapshot");
    expect(sql).toContain("created_by_user_id");
    expect(sql).toContain("sent_at");
    expect(sql).toContain("cancelled_at");
  });

  it("keeps P1-C directional and avoids portal authority dependency", () => {
    const sql = fs.readFileSync(migrationPath, "utf8").toLowerCase();

    expect(sql).not.toContain("least(");
    expect(sql).not.toContain("greatest(");
    expect(sql).not.toContain("contractor_users");
    expect(sql).not.toContain("contractor_invites");
    expect(sql).not.toContain("portal");
  });

  it("limits statuses and future receiver job projection for this phase", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).toContain("account_workshare_requests_status_valid_chk");
    expect(sql).toContain("CHECK (status IN ('sent', 'cancelled'))");
    expect(sql).toContain("account_workshare_requests_receiving_job_future_state_chk");
    expect(sql).toContain("CHECK (receiving_job_id IS NULL)");
  });

  it("scopes insert/update/read by internal sender and receiver account parties", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).toContain("ALTER TABLE public.account_workshare_requests ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("account_workshare_requests_select_party_scope");
    expect(sql).toContain("sender_account_id = public.current_internal_account_owner_id()");
    expect(sql).toContain("receiver_account_id = public.current_internal_account_owner_id()");
    expect(sql).toContain("account_workshare_requests_insert_sender_scope");
    expect(sql).toContain("connection.status = 'active'");
    expect(sql).toContain("connection.service_type = 'ecc_hers'");
    expect(sql).toContain("source_customer.owner_user_id = account_workshare_requests.sender_account_id");
    expect(sql).toContain("account_workshare_requests_update_sender_cancel_scope");
    expect(sql).toContain("assert_account_workshare_request_cancel_only");
    expect(sql).toContain("account_workshare_requests_cancel_only");
    expect(sql).toContain("NEW.requested_scope_snapshot IS NOT DISTINCT FROM OLD.requested_scope_snapshot");
    expect(sql).toContain("NEW.sender_notes_snapshot IS NOT DISTINCT FROM OLD.sender_notes_snapshot");
    expect(sql).not.toContain("accept");
    expect(sql).not.toContain("decline");
  });
});
