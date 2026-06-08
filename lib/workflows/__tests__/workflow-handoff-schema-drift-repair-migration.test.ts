import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repairMigrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260608200000_repair_workflow_handoff_schema_drift.sql",
);

const workflowPresetFoundationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260530180000_workflow_presets_slice_b_foundation.sql",
);

const authorizedRecipientsFoundationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260531123000_authorized_handoff_recipients_foundation.sql",
);

const handoffRequestsFoundationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260531194500_workflow_handoff_requests_foundation.sql",
);

const handoffConnectionsFoundationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260531213000_account_handoff_connections_foundation.sql",
);

const handoffGrantsFoundationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260531223000_workflow_handoff_request_grants_foundation.sql",
);

const repairSql = readFileSync(repairMigrationPath, "utf8");
const workflowPresetSql = readFileSync(workflowPresetFoundationPath, "utf8");
const authorizedRecipientsSql = readFileSync(authorizedRecipientsFoundationPath, "utf8");
const handoffRequestsSql = readFileSync(handoffRequestsFoundationPath, "utf8");
const handoffConnectionsSql = readFileSync(handoffConnectionsFoundationPath, "utf8");
const handoffGrantsSql = readFileSync(handoffGrantsFoundationPath, "utf8");

describe("workflow/handoff schema drift repair migration", () => {
  it("restores only workflow/handoff schema without operational or billing mutations", () => {
    const requiredTables = [
      "public.workflow_preset_templates",
      "public.workflow_instances",
      "public.workflow_instance_milestones",
      "public.workflow_instance_job_links",
      "public.authorized_handoff_recipients",
      "public.workflow_handoff_requests",
      "public.account_handoff_connections",
      "public.workflow_handoff_request_grants",
    ];

    for (const table of requiredTables) {
      expect(repairSql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }

    expect(repairSql).not.toMatch(/INSERT\s+INTO\s+public\./i);
    expect(repairSql).not.toMatch(/UPDATE\s+public\./i);
    expect(repairSql).not.toMatch(/DELETE\s+FROM\s+public\./i);
    expect(repairSql).not.toMatch(/ALTER TABLE\s+public\.internal_invoice/i);
    expect(repairSql).not.toMatch(/ALTER TABLE\s+public\.job_events/i);
    expect(repairSql).not.toMatch(/ALTER TABLE\s+public\.service_cases/i);
    expect(repairSql).not.toMatch(/ALTER TABLE\s+public\.jobs/i);
    expect(repairSql).not.toMatch(/stripe|checkout_session|payment_intent|payment_method/i);
  });

  it("keeps the workflow preset, instance, milestone, and job-link contract aligned", () => {
    const requiredTokens = [
      "CREATE TABLE IF NOT EXISTS public.workflow_preset_templates",
      "CREATE TABLE IF NOT EXISTS public.workflow_instances",
      "CREATE TABLE IF NOT EXISTS public.workflow_instance_milestones",
      "CREATE TABLE IF NOT EXISTS public.workflow_instance_job_links",
      "workflow_preset_templates_owner_lifecycle_name_idx",
      "workflow_instances_owner_service_case_status_idx",
      "workflow_instances_owner_created_desc_idx",
      "workflow_instance_milestones_owner_instance_sort_idx",
      "workflow_instance_job_links_owner_instance_idx",
      "workflow_instance_job_links_owner_milestone_idx",
      "workflow_instance_job_links_owner_job_idx",
      "CREATE OR REPLACE FUNCTION public.assert_workflow_instance_scope()",
      "CREATE OR REPLACE FUNCTION public.assert_workflow_instance_milestone_scope()",
      "CREATE OR REPLACE FUNCTION public.assert_workflow_instance_job_link_scope()",
      "ALTER TABLE public.workflow_preset_templates ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE public.workflow_instances ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE public.workflow_instance_milestones ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE public.workflow_instance_job_links ENABLE ROW LEVEL SECURITY",
    ];

    for (const token of requiredTokens) {
      expect(workflowPresetSql).toContain(token);
      expect(repairSql).toContain(token);
    }
  });

  it("keeps authorized recipient and handoff request schema aligned", () => {
    const requiredTokens = [
      "CREATE TABLE IF NOT EXISTS public.authorized_handoff_recipients",
      "authorized_handoff_recipients_one_default_per_kind_uidx",
      "authorized_handoff_recipients_select_account_scope",
      "authorized_handoff_recipients_insert_admin_only",
      "authorized_handoff_recipients_update_admin_only",
      "CREATE TABLE IF NOT EXISTS public.workflow_handoff_requests",
      "workflow_handoff_requests_open_recipient_uidx",
      "CREATE OR REPLACE FUNCTION public.assert_workflow_handoff_request_scope()",
      "workflow_handoff_requests_select_account_scope",
      "workflow_handoff_requests_insert_account_scope",
    ];

    for (const token of requiredTokens.slice(0, 5)) {
      expect(authorizedRecipientsSql).toContain(token);
      expect(repairSql).toContain(token);
    }

    for (const token of requiredTokens.slice(5)) {
      expect(handoffRequestsSql).toContain(token);
      expect(repairSql).toContain(token);
    }
  });

  it("keeps account connection and request grant schema aligned", () => {
    const requiredTokens = [
      "CREATE TABLE IF NOT EXISTS public.account_handoff_connections",
      "account_handoff_connections_live_pair_uidx",
      "account_handoff_connections_select_account_scope",
      "account_handoff_connections_insert_requesting_admin_owner_scope",
      "account_handoff_connections_update_relevant_admin_owner_scope",
      "CREATE TABLE IF NOT EXISTS public.workflow_handoff_request_grants",
      "workflow_handoff_request_grants_active_request_recipient_uidx",
      "CREATE OR REPLACE FUNCTION public.assert_workflow_handoff_request_grant_scope()",
      "workflow_handoff_request_grants_select_installer_account_scope",
      "workflow_handoff_request_grants_select_recipient_account_scope",
      "workflow_handoff_request_grants_insert_installer_admin_owner_scope",
      "workflow_handoff_request_grants_update_revoke_installer_admin_owner_scope",
    ];

    for (const token of requiredTokens.slice(0, 5)) {
      expect(handoffConnectionsSql).toContain(token);
      expect(repairSql).toContain(token);
    }

    for (const token of requiredTokens.slice(5)) {
      expect(handoffGrantsSql).toContain(token);
      expect(repairSql).toContain(token);
    }
  });

  it("does not create delete policies for the workflow/handoff family", () => {
    expect(repairSql).not.toMatch(/CREATE POLICY\s+\S+\s+ON\s+public\.\S+\s+FOR DELETE/i);
  });
});
