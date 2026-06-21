import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { InternalRole, InternalUserRow } from "@/lib/auth/internal-user";
import { updateHelpGapReviewStatus } from "../help-gap-review-status";

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
    account_owner_user_id: overrides.account_owner_user_id ?? "owner-1",
    review_status: overrides.review_status ?? "new",
    reviewed_at: overrides.reviewed_at ?? null,
    reviewed_by_user_id: overrides.reviewed_by_user_id ?? null,
    question_text_sanitized: overrides.question_text_sanitized ?? "Where do I close this out?",
    linked_support_case_id: overrides.linked_support_case_id ?? null,
  };
}

function makeSupabase(rows: Array<Record<string, unknown>>, updateError: unknown = null) {
  const operations: Array<{ method: string; column?: string; value?: unknown }> = [];
  const updatePayloads: Array<Record<string, unknown>> = [];
  let workingRows = [...rows];

  const query = {
    eq(column: string, value: unknown) {
      operations.push({ method: "eq", column, value });
      workingRows = workingRows.filter((row) => row[column] === value);
      return query;
    },
    select(column: string) {
      operations.push({ method: "select", column });
      return query;
    },
    async maybeSingle() {
      operations.push({ method: "maybeSingle" });
      if (updateError) return { data: null, error: updateError };
      const row = workingRows[0] ?? null;
      if (row) Object.assign(row, updatePayloads[updatePayloads.length - 1]);
      return { data: row ? { id: row.id } : null, error: null };
    },
  };

  const from = vi.fn((table: string) => ({
    update: vi.fn((payload: Record<string, unknown>) => {
      operations.push({ method: "update" });
      updatePayloads.push(payload);
      return query;
    }),
  }));

  return {
    supabase: { from },
    from,
    rows,
    operations,
    updatePayloads,
  };
}

describe("help gap review status update", () => {
  it("fails closed when the review queue flag is off", async () => {
    const { supabase, from } = makeSupabase([makeRow()]);

    const result = await updateHelpGapReviewStatus(
      { eventId: "gap-1", reviewStatus: "reviewed" },
      {
        supabase,
        env: { ENABLE_HELP_GAP_REVIEW_QUEUE: "" },
        requireInternalUserFn: vi.fn(async () => makeInternalUser()),
      },
    );

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(from).not.toHaveBeenCalled();
  });

  it("blocks non-owner and non-admin internal users before updating", async () => {
    for (const role of ["billing", "office", "tech"] as const) {
      const { supabase, from } = makeSupabase([makeRow()]);

      const result = await updateHelpGapReviewStatus(
        { eventId: "gap-1", reviewStatus: "reviewed" },
        {
          supabase,
          env: enabledEnv,
          requireInternalUserFn: vi.fn(async () =>
            makeInternalUser({ role, userId: `${role}-1`, account_owner_user_id: "owner-1" }),
          ),
        },
      );

      expect(result).toEqual({ ok: false, reason: "unauthorized" });
      expect(from).not.toHaveBeenCalled();
    }
  });

  it("allows owner/admin reviewers to update same-account rows", async () => {
    const rows = [makeRow({ id: "gap-1", account_owner_user_id: "owner-1" })];
    const { supabase, operations, updatePayloads } = makeSupabase(rows);

    const result = await updateHelpGapReviewStatus(
      { eventId: "gap-1", reviewStatus: "bug_candidate" },
      {
        supabase,
        env: enabledEnv,
        requireInternalUserFn: vi.fn(async () =>
          makeInternalUser({ role: "admin", userId: "admin-1", account_owner_user_id: "owner-1" }),
        ),
        now: () => new Date("2026-06-21T18:30:00.000Z"),
      },
    );

    expect(result).toEqual({ ok: true });
    expect(operations).toEqual(
      expect.arrayContaining([
        { method: "eq", column: "id", value: "gap-1" },
        { method: "eq", column: "account_owner_user_id", value: "owner-1" },
      ]),
    );
    expect(updatePayloads).toEqual([
      {
        review_status: "bug_candidate",
        reviewed_at: "2026-06-21T18:30:00.000Z",
        reviewed_by_user_id: "admin-1",
      },
    ]);
    expect(Object.keys(updatePayloads[0]).sort()).toEqual([
      "review_status",
      "reviewed_at",
      "reviewed_by_user_id",
    ]);
    expect(rows[0]).toMatchObject({
      review_status: "bug_candidate",
      reviewed_at: "2026-06-21T18:30:00.000Z",
      reviewed_by_user_id: "admin-1",
      question_text_sanitized: "Where do I close this out?",
      linked_support_case_id: null,
    });
  });

  it("does not update cross-account rows", async () => {
    const rows = [makeRow({ id: "gap-1", account_owner_user_id: "owner-2" })];
    const { supabase, updatePayloads } = makeSupabase(rows);

    const result = await updateHelpGapReviewStatus(
      { eventId: "gap-1", reviewStatus: "reviewed" },
      {
        supabase,
        env: enabledEnv,
        requireInternalUserFn: vi.fn(async () => makeInternalUser({ account_owner_user_id: "owner-1" })),
      },
    );

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(updatePayloads).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      account_owner_user_id: "owner-2",
      review_status: "new",
      reviewed_at: null,
      reviewed_by_user_id: null,
    });
  });

  it("rejects invalid statuses including deferred support-case linking", async () => {
    for (const reviewStatus of ["new", "linked_to_support_case", " ", null]) {
      const { supabase, from } = makeSupabase([makeRow()]);

      const result = await updateHelpGapReviewStatus(
        { eventId: "gap-1", reviewStatus },
        {
          supabase,
          env: enabledEnv,
          requireInternalUserFn: vi.fn(async () => makeInternalUser()),
        },
      );

      expect(result).toEqual({ ok: false, reason: "invalid_status" });
      expect(from).not.toHaveBeenCalled();
    }
  });

  it("returns update_failed without leaking raw database errors", async () => {
    const { supabase } = makeSupabase([makeRow()], { message: "permission denied" });

    const result = await updateHelpGapReviewStatus(
      { eventId: "gap-1", reviewStatus: "dismissed" },
      {
        supabase,
        env: enabledEnv,
        requireInternalUserFn: vi.fn(async () => makeInternalUser()),
      },
    );

    expect(result).toEqual({ ok: false, reason: "update_failed" });
  });

  it("contains no support-case helper, service-role, provider, analytics, or payment path", () => {
    const source = readFileSync(resolve(__dirname, "../help-gap-review-status.ts"), "utf8");

    expect(source).toContain('from("assistant_help_gap_events")');
    expect(source).toContain(".update(");
    expect(source).not.toContain('from("support_cases")');
    expect(source).not.toContain('from("support_case_notes")');
    expect(source).not.toContain("support_access_sessions");
    expect(source).not.toContain("support_account_grants");
    expect(source).not.toContain("createAdminClient");
    expect(source).not.toContain("service_role");
    expect(source).not.toContain("OpenAI");
    expect(source).not.toContain("openai");
    expect(source).not.toContain("analytics");
    expect(source).not.toContain("stripe");
  });
});
