import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { InternalRole, InternalUserRow } from "@/lib/auth/internal-user";
import { listHelpGapReviewQueue } from "../help-gap-review-read-model";

const enabledEnv = {
  ENABLE_HELP_GAP_REVIEW_QUEUE: "true",
};

function makeInternalUser(overrides: Record<string, unknown> = {}) {
  const role = (overrides.role ?? "admin") as InternalRole;
  const userId = String(overrides.userId ?? "admin-1");
  const internalUser: InternalUserRow = {
    user_id: userId,
    role,
    is_active: overrides.is_active === undefined ? true : Boolean(overrides.is_active),
    account_owner_user_id: String(overrides.account_owner_user_id ?? "owner-1"),
    created_by: null,
  };

  return {
    userId,
    internalUser,
  };
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? "gap-1",
    created_at: overrides.created_at ?? "2026-06-21T12:00:00.000Z",
    event_type: overrides.event_type ?? "unknown_answer",
    help_gap_category: overrides.help_gap_category ?? "missing_help_article",
    review_status: overrides.review_status ?? "new",
    route_pathname: overrides.route_pathname ?? "/ops/admin",
    page_family: overrides.page_family ?? "launch_room",
    role_label: overrides.role_label ?? "Owner / Admin",
    role_category: overrides.role_category ?? "admin",
    product_mode: overrides.product_mode ?? "hvac_service",
    question_text_sanitized: overrides.question_text_sanitized ?? "Where do I close this out?",
    answer_key: overrides.answer_key ?? "fallback_unknown",
    feedback_value: overrides.feedback_value ?? null,
    setup_step_key: overrides.setup_step_key ?? null,
    training_mission_key: overrides.training_mission_key ?? null,
    linked_support_case_id: overrides.linked_support_case_id ?? null,
    can_view_financial_register: overrides.can_view_financial_register ?? true,
    can_collect_field_payment: overrides.can_collect_field_payment ?? false,
    account_owner_user_id: overrides.account_owner_user_id ?? "owner-1",
    internal_user_id: overrides.internal_user_id ?? "admin-1",
    raw_stripe_account_id: "acct_should_not_escape",
  };
}

function makeSupabase(rows: Array<Record<string, unknown>>) {
  const operations: Array<{ method: string; column?: string; value?: unknown; options?: unknown }> = [];
  let workingRows = [...rows];

  const query = {
    eq(column: string, value: unknown) {
      operations.push({ method: "eq", column, value });
      workingRows = workingRows.filter((row) => row[column] === value);
      return query;
    },
    gte(column: string, value: unknown) {
      operations.push({ method: "gte", column, value });
      workingRows = workingRows.filter((row) => String(row[column] ?? "") >= String(value));
      return query;
    },
    lte(column: string, value: unknown) {
      operations.push({ method: "lte", column, value });
      workingRows = workingRows.filter((row) => String(row[column] ?? "") <= String(value));
      return query;
    },
    order(column: string, options: unknown) {
      operations.push({ method: "order", column, options });
      workingRows = [...workingRows].sort((a, b) =>
        String(b[column] ?? "").localeCompare(String(a[column] ?? "")),
      );
      return query;
    },
    async limit(value: unknown) {
      operations.push({ method: "limit", value });
      return { data: workingRows.slice(0, Number(value)), error: null };
    },
  };

  const from = vi.fn((table: string) => ({
    select: vi.fn(() => query),
  }));

  return {
    supabase: { from },
    from,
    operations,
  };
}

describe("help gap review read model", () => {
  it("fails closed when the review queue flag is off", async () => {
    const { supabase, from } = makeSupabase([makeRow()]);
    const result = await listHelpGapReviewQueue({}, {
      supabase,
      env: { ENABLE_HELP_GAP_REVIEW_QUEUE: "" },
      requireInternalUserFn: vi.fn(async () => makeInternalUser()),
    });

    expect(result).toMatchObject({
      enabled: false,
      authorized: false,
      reason: "disabled",
      items: [],
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("blocks non-owner and non-admin internal users", async () => {
    for (const role of ["billing", "office", "tech"] as const) {
      const { supabase, from } = makeSupabase([makeRow()]);
      const result = await listHelpGapReviewQueue({}, {
        supabase,
        env: enabledEnv,
        requireInternalUserFn: vi.fn(async () => makeInternalUser({ role, userId: `${role}-1` })),
      });

      expect(result).toMatchObject({
        enabled: true,
        authorized: false,
        reason: "unauthorized",
        items: [],
      });
      expect(from).not.toHaveBeenCalled();
    }
  });

  it("authorizes structural owner and admin reviewers", async () => {
    const ownerSupabase = makeSupabase([makeRow({ id: "owner-gap" })]);
    const ownerResult = await listHelpGapReviewQueue({}, {
      supabase: ownerSupabase.supabase,
      env: enabledEnv,
      requireInternalUserFn: vi.fn(async () =>
        makeInternalUser({ role: "office", userId: "owner-1", account_owner_user_id: "owner-1" }),
      ),
    });

    expect(ownerResult.authorized).toBe(true);
    expect(ownerResult.items).toHaveLength(1);

    const adminSupabase = makeSupabase([makeRow({ id: "admin-gap" })]);
    const adminResult = await listHelpGapReviewQueue({}, {
      supabase: adminSupabase.supabase,
      env: enabledEnv,
      requireInternalUserFn: vi.fn(async () =>
        makeInternalUser({ role: "admin", userId: "admin-1", account_owner_user_id: "owner-1" }),
      ),
    });

    expect(adminResult.authorized).toBe(true);
    expect(adminResult.items).toHaveLength(1);
  });

  it("returns only account-scoped safe rows newest first", async () => {
    const { supabase, operations } = makeSupabase([
      makeRow({
        id: "older",
        created_at: "2026-06-20T12:00:00.000Z",
        account_owner_user_id: "owner-1",
      }),
      makeRow({
        id: "other-account",
        created_at: "2026-06-22T12:00:00.000Z",
        account_owner_user_id: "owner-2",
      }),
      makeRow({
        id: "newer",
        created_at: "2026-06-21T12:00:00.000Z",
        account_owner_user_id: "owner-1",
        linked_support_case_id: "case-dormant-reference",
      }),
    ]);

    const result = await listHelpGapReviewQueue({}, {
      supabase,
      env: enabledEnv,
      requireInternalUserFn: vi.fn(async () => makeInternalUser()),
    });

    expect(operations).toContainEqual({
      method: "eq",
      column: "account_owner_user_id",
      value: "owner-1",
    });
    expect(result.items.map((item) => item.id)).toEqual(["newer", "older"]);
    expect(result.items[0]).toMatchObject({
      id: "newer",
      pagePath: "/ops/admin",
      fallbackKey: "fallback_unknown",
      linkedSupportCaseId: "case-dormant-reference",
      capabilitySnapshot: {
        canViewFinancialRegister: true,
        canCollectFieldPayment: false,
      },
    });
    expect(JSON.stringify(result.items)).not.toContain("owner-1");
    expect(JSON.stringify(result.items)).not.toContain("admin-1");
    expect(JSON.stringify(result.items)).not.toContain("acct_should_not_escape");
  });

  it("applies supported filters and ignores unsupported filter values", async () => {
    const { supabase, operations } = makeSupabase([
      makeRow({
        id: "match",
        review_status: "new",
        help_gap_category: "ux_confusion",
        event_type: "still_need_help",
        page_family: "training_room",
        role_category: "office",
        product_mode: "ecc_hers",
        created_at: "2026-06-21T12:00:00.000Z",
      }),
      makeRow({
        id: "miss",
        review_status: "dismissed",
        help_gap_category: "missing_help_article",
        event_type: "unknown_answer",
        page_family: "launch_room",
        role_category: "admin",
        product_mode: "hvac_service",
        created_at: "2026-06-19T12:00:00.000Z",
      }),
    ]);

    const result = await listHelpGapReviewQueue(
      {
        reviewStatus: "new",
        category: "ux_confusion",
        eventType: "still_need_help",
        pageFamily: "training_room",
        roleCategory: "office",
        productMode: "ecc_hers",
        recentDays: 7,
        limit: 10,
        // Unsupported values should not create query filters.
        dateTo: "not-a-date",
      },
      {
        supabase,
        env: enabledEnv,
        requireInternalUserFn: vi.fn(async () => makeInternalUser()),
        now: () => new Date("2026-06-22T12:00:00.000Z"),
      },
    );

    expect(result.items.map((item) => item.id)).toEqual(["match"]);
    expect(operations).toEqual(
      expect.arrayContaining([
        { method: "eq", column: "review_status", value: "new" },
        { method: "eq", column: "help_gap_category", value: "ux_confusion" },
        { method: "eq", column: "event_type", value: "still_need_help" },
        { method: "eq", column: "page_family", value: "training_room" },
        { method: "eq", column: "role_category", value: "office" },
        { method: "eq", column: "product_mode", value: "ecc_hers" },
        { method: "gte", column: "created_at", value: "2026-06-15T12:00:00.000Z" },
        { method: "limit", value: 10 },
      ]),
    );
    expect(operations).not.toContainEqual({ method: "lte", column: "created_at", value: "not-a-date" });
  });

  it("builds summary counts from returned sanitized rows", async () => {
    const { supabase } = makeSupabase([
      makeRow({
        id: "unknown",
        event_type: "unknown_answer",
        help_gap_category: "missing_help_article",
        page_family: "launch_room",
        role_category: "admin",
        review_status: "new",
      }),
      makeRow({
        id: "not-helpful",
        event_type: "not_helpful",
        feedback_value: "not_helpful",
        help_gap_category: "ux_confusion",
        page_family: "training_room",
        role_category: "office",
        review_status: "reviewed",
        training_mission_key: "run_your_first_job",
      }),
      makeRow({
        id: "still",
        event_type: "still_need_help",
        feedback_value: "still_need_help",
        help_gap_category: "ux_confusion",
        page_family: "training_room",
        role_category: "office",
        review_status: "new",
        setup_step_key: "accept_online_invoice_payments",
      }),
    ]);

    const result = await listHelpGapReviewQueue({}, {
      supabase,
      env: enabledEnv,
      requireInternalUserFn: vi.fn(async () => makeInternalUser()),
    });

    expect(result.summary).toMatchObject({
      totalNew: 2,
      unknownAnswers: 1,
      notHelpful: 1,
      stillNeedHelp: 1,
      byCategory: {
        missing_help_article: 1,
        ux_confusion: 2,
      },
      byPageFamily: {
        launch_room: 1,
        training_room: 2,
      },
      byRoleCategory: {
        admin: 1,
        office: 2,
      },
      byEventType: {
        unknown_answer: 1,
        not_helpful: 1,
        still_need_help: 1,
      },
      byReviewStatus: {
        new: 2,
        reviewed: 1,
      },
      byTrainingMission: {
        run_your_first_job: 1,
      },
      bySetupStep: {
        accept_online_invoice_payments: 1,
      },
    });
  });

  it("contains no mutation, support-case, support-console, service-role, provider, or analytics path", () => {
    const source = readFileSync(resolve(__dirname, "../help-gap-review-read-model.ts"), "utf8");

    expect(source).toContain('from("assistant_help_gap_events")');
    expect(source).toContain(".select(");
    expect(source).not.toContain(".insert(");
    expect(source).not.toContain(".update(");
    expect(source).not.toContain(".upsert(");
    expect(source).not.toContain(".delete(");
    expect(source).not.toContain('from("support_cases")');
    expect(source).not.toContain('from("support_case_notes")');
    expect(source).not.toContain("support_access_sessions");
    expect(source).not.toContain("support_account_grants");
    expect(source).not.toContain("createAdminClient");
    expect(source).not.toContain("service_role");
    expect(source).not.toContain("OpenAI");
    expect(source).not.toContain("openai");
    expect(source).not.toContain("analytics");
  });
});
