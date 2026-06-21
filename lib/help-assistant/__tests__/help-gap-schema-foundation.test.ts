import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260621100000_assistant_help_gap_events_foundation.sql",
);

const sql = readFileSync(migrationPath, "utf8");
const sqlWithoutComments = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

describe("assistant help-gap schema foundation migration", () => {
  it("creates an additive dormant help-gap event table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.assistant_help_gap_events");
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.support_cases\s+ADD COLUMN/i);
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.internal_users\s+ADD COLUMN/i);
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.jobs\s+ADD COLUMN/i);
  });

  it("includes the durable event fields from the local Help Gap contract", () => {
    expect(sql).toContain("account_owner_user_id uuid NOT NULL");
    expect(sql).toContain("internal_user_id uuid NULL");
    expect(sql).toContain("event_type text NOT NULL");
    expect(sql).toContain("assistant_mode text NOT NULL");
    expect(sql).toContain("help_gap_category text NOT NULL");
    expect(sql).toContain("route_pathname text NOT NULL");
    expect(sql).toContain("page_family text NOT NULL");
    expect(sql).toContain("role_category text NOT NULL");
    expect(sql).toContain("role_label text NOT NULL");
    expect(sql).toContain("product_mode text NOT NULL DEFAULT 'unknown'");
    expect(sql).toContain("can_view_financial_register boolean NOT NULL DEFAULT false");
    expect(sql).toContain("can_collect_field_payment boolean NOT NULL DEFAULT false");
    expect(sql).toContain("question_text_sanitized text NULL");
    expect(sql).toContain("question_summary text NULL");
    expect(sql).toContain("answer_key text NOT NULL");
    expect(sql).toContain("feedback_value text NULL");
    expect(sql).toContain("setup_step_key text NULL");
    expect(sql).toContain("training_mission_key text NULL");
    expect(sql).toContain("review_status text NOT NULL DEFAULT 'new'");
    expect(sql).toContain("reviewed_at timestamptz NULL");
    expect(sql).toContain("reviewed_by_user_id uuid NULL");
    expect(sql).toContain("linked_support_case_id uuid NULL");
  });

  it("constrains help-gap categories, event types, assistant modes, and review statuses", () => {
    expect(sql).toContain("assistant_help_gap_events_event_type_chk");
    expect(sql).toContain("'unknown_answer', 'not_helpful', 'still_need_help'");
    expect(sql).toContain("assistant_help_gap_events_assistant_mode_chk");
    expect(sql).toContain("'help_chat', 'setup_coach'");
    expect(sql).toContain("assistant_help_gap_events_help_gap_category_chk");
    expect(sql).toContain("'guidance_training'");
    expect(sql).toContain("'setup_data_issue'");
    expect(sql).toContain("'ux_confusion'");
    expect(sql).toContain("'possible_product_bug'");
    expect(sql).toContain("'future_feature_request'");
    expect(sql).toContain("'missing_help_article'");
    expect(sql).toContain("'unknown'");
    expect(sql).toContain("assistant_help_gap_events_review_status_chk");
    expect(sql).toContain("'new'");
    expect(sql).toContain("'linked_to_support_case'");
    expect(sql).toContain("'bug_candidate'");
  });

  it("locks short sanitized route, question, and key storage", () => {
    expect(sql).toContain("assistant_help_gap_events_route_pathname_chk");
    expect(sql).toContain("route_pathname LIKE '/%'");
    expect(sql).toContain("position('?' in route_pathname) = 0");
    expect(sql).toContain("position('#' in route_pathname) = 0");
    expect(sql).toContain("length(route_pathname) <= 160");
    expect(sql).toContain("length(question_text_sanitized) <= 240");
    expect(sql).toContain("length(question_summary) <= 240");
    expect(sql).toContain("length(btrim(answer_key)) > 0 AND length(answer_key) <= 80");
    expect(sql).toContain("setup_step_key IS NULL OR length(setup_step_key) <= 80");
    expect(sql).toContain("training_mission_key IS NULL OR length(training_mission_key) <= 80");
  });

  it("adds review and reporting indexes without adding runtime projections", () => {
    expect(sql).toContain("assistant_help_gap_events_account_created_idx");
    expect(sql).toContain("(account_owner_user_id, created_at DESC)");
    expect(sql).toContain("assistant_help_gap_events_account_review_status_created_idx");
    expect(sql).toContain("(account_owner_user_id, review_status, created_at DESC)");
    expect(sql).toContain("assistant_help_gap_events_account_category_created_idx");
    expect(sql).toContain("(account_owner_user_id, help_gap_category, created_at DESC)");
    expect(sql).toContain("assistant_help_gap_events_account_event_type_created_idx");
    expect(sql).toContain("(account_owner_user_id, event_type, created_at DESC)");
    expect(sql).toContain("assistant_help_gap_events_account_page_family_created_idx");
    expect(sql).toContain("assistant_help_gap_events_account_training_mission_created_idx");
  });

  it("enforces account-scoped RLS with no delete policy", () => {
    expect(sql).toContain("ALTER TABLE public.assistant_help_gap_events ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("CREATE POLICY assistant_help_gap_events_select_account_scope");
    expect(sql).toContain("CREATE POLICY assistant_help_gap_events_insert_account_scope");
    expect(sql).toContain("CREATE POLICY assistant_help_gap_events_update_admin_owner_review");
    expect(sql).not.toContain("CREATE POLICY assistant_help_gap_events_delete");
    expect(sql).toContain("public.current_internal_account_owner_id() IS NOT NULL");
    expect(sql).toContain("account_owner_user_id = public.current_internal_account_owner_id()");
    expect(sql).toContain("actor.user_id = auth.uid()");
    expect(sql).toContain("actor.is_active = true");
    expect(sql).toContain("(actor.role = 'admin' OR actor.user_id = assistant_help_gap_events.account_owner_user_id)");
    expect(sql).not.toMatch(/TO\s+anon/i);
  });

  it("keeps support-case linkage optional and does not create support behavior", () => {
    expect(sql).toContain("linked_support_case_id uuid NULL REFERENCES public.support_cases(id) ON DELETE SET NULL");
    expect(sql).toContain("assistant_help_gap_events_linked_support_case_status_chk");
    expect(sqlWithoutComments).not.toMatch(/INSERT\s+INTO\s+public\.support_cases/i);
    expect(sqlWithoutComments).not.toMatch(/INSERT\s+INTO\s+public\.support_case_notes/i);
    expect(sqlWithoutComments).not.toMatch(/support_access_sessions/i);
    expect(sqlWithoutComments).not.toMatch(/support_account_grants/i);
    expect(sqlWithoutComments).not.toMatch(/support_users/i);
    expect(sqlWithoutComments).not.toMatch(/ENABLE_SUPPORT_CONSOLE/i);
    expect(sqlWithoutComments).not.toMatch(/impersonat/i);
  });

  it("does not wire assistant runtime persistence or provider behavior", () => {
    expect(sqlWithoutComments).not.toMatch(/openai/i);
    expect(sqlWithoutComments).not.toMatch(/provider/i);
    expect(sqlWithoutComments).not.toMatch(/webhook/i);
    expect(sqlWithoutComments).not.toMatch(/job_events/i);
    expect(sqlWithoutComments).not.toMatch(/stripe/i);
    expect(sqlWithoutComments).not.toMatch(/qbo/i);
    expect(sqlWithoutComments).not.toMatch(/portal/i);
    expect(sqlWithoutComments).not.toMatch(/customer-facing/i);
  });
});
