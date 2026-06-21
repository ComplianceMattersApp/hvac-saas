import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InternalRole } from "@/lib/auth/internal-user";
import type { ProductMode } from "@/lib/business/product-mode-defaults";
import {
  persistHelpGapEvent,
  type PersistHelpGapEventInput,
} from "../help-gap-persistence";

const enabledEnv = {
  ENABLE_ASK_COMPLIANCE_MATTERS: "true",
  ENABLE_HELP_GAP_LOGGING: "yes",
};

const baseInput: PersistHelpGapEventInput = {
  eventType: "unknown_answer",
  assistantMode: "help_chat",
  helpGapCategory: "missing_help_article",
  routePathname: "/ops/admin",
  questionText: "  What does this screen do?  ",
  answerKey: "fallback_unknown",
  feedbackValue: null,
};

function makeInternalUser(overrides: Record<string, unknown> = {}) {
  const role = (overrides.role ?? "office") as InternalRole;
  const { role: _ignoredRole, ...rest } = overrides;
  return {
    userId: "user-1",
    internalUser: {
      user_id: "user-1",
      role,
      is_active: true,
      account_owner_user_id: "owner-1",
      created_by: null,
      ...rest,
    },
  };
}

function mockReadProductMode(mode: ProductMode | null) {
  return vi.fn(async () => mode);
}

function makeSupabase(options: { insertError?: unknown } = {}) {
  const calls: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const from = vi.fn((table: string) => ({
    insert: vi.fn(async (payload: Record<string, unknown>) => {
      calls.push({ table, payload });
      return { error: options.insertError ?? null };
    }),
  }));

  return { supabase: { from }, calls, from };
}

describe("help gap persistence helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails closed when the help-gap logging flag is off", async () => {
    const { supabase, from } = makeSupabase();
    const result = await persistHelpGapEvent(baseInput, {
      supabase,
      env: { ENABLE_ASK_COMPLIANCE_MATTERS: "true", ENABLE_HELP_GAP_LOGGING: "" },
      requireInternalUserFn: vi.fn(async () => makeInternalUser()),
    });

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(from).not.toHaveBeenCalled();
  });

  it("also fails closed when the assistant visibility flag is off", async () => {
    const { supabase, from } = makeSupabase();
    const result = await persistHelpGapEvent(baseInput, {
      supabase,
      env: { ENABLE_ASK_COMPLIANCE_MATTERS: "", ENABLE_HELP_GAP_LOGGING: "true" },
      requireInternalUserFn: vi.fn(async () => makeInternalUser()),
    });

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated or non-internal callers before insert", async () => {
    const { supabase, from } = makeSupabase();
    const result = await persistHelpGapEvent(baseInput, {
      supabase,
      env: enabledEnv,
      requireInternalUserFn: vi.fn(async () => {
        throw new Error("Authentication required.");
      }),
    });

    expect(result).toEqual({ ok: false, reason: "unauthorized" });
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects unsupported routes without inserting", async () => {
    const { supabase, from } = makeSupabase();
    const result = await persistHelpGapEvent(
      { ...baseInput, routePathname: "/jobs/secret-job-id?token=abc#frag" },
      {
        supabase,
        env: enabledEnv,
        requireInternalUserFn: vi.fn(async () => makeInternalUser()),
      },
    );

    expect(result).toEqual({ ok: false, reason: "unsupported_route" });
    expect(from).not.toHaveBeenCalled();
  });

  it("accepts /ops/admin after server-side route and question sanitization", async () => {
    const { supabase, calls } = makeSupabase();
    const result = await persistHelpGapEvent(
      {
        ...baseInput,
        routePathname: "/ops/admin?token=secret#frag",
        questionText: "  what\n\nnow\t?  ",
      },
      {
        supabase,
        env: enabledEnv,
        requireInternalUserFn: vi.fn(async () => makeInternalUser()),
        readProductModeFn: mockReadProductMode("hvac_service"),
      },
    );

    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.table).toBe("assistant_help_gap_events");
    expect(calls[0]?.payload).toMatchObject({
      account_owner_user_id: "owner-1",
      internal_user_id: "user-1",
      route_pathname: "/ops/admin",
      page_family: "launch_room",
      question_text_sanitized: "what now ?",
      product_mode: "hvac_service",
      role_category: "office",
      role_label: "Dispatcher / Office",
      can_view_financial_register: false,
      can_collect_field_payment: false,
      review_status: "new",
    });
    expect(JSON.stringify(calls[0]?.payload)).not.toContain("secret");
    expect(JSON.stringify(calls[0]?.payload)).not.toContain("#frag");
  });

  it("accepts /training and caps overlong question text", async () => {
    const { supabase, calls } = makeSupabase();
    const result = await persistHelpGapEvent(
      {
        ...baseInput,
        eventType: "still_need_help",
        helpGapCategory: "ux_confusion",
        assistantMode: "setup_coach",
        routePathname: "/training/deep/path?token=secret#frag",
        questionText: "a".repeat(500),
        feedbackValue: "still_need_help",
        setupStepKey: "Accept Online Invoice Payments",
        trainingMissionKey: "Run Your First Job",
      },
      {
        supabase,
        env: enabledEnv,
        requireInternalUserFn: vi.fn(async () => makeInternalUser({ role: "billing" })),
        readProductModeFn: mockReadProductMode("ecc_hers"),
      },
    );

    expect(result).toEqual({ ok: true });
    expect(calls[0]?.payload).toMatchObject({
      route_pathname: "/training",
      page_family: "training_room",
      question_text_sanitized: "a".repeat(240),
      feedback_value: "still_need_help",
      setup_step_key: "accept_online_invoice_payments",
      training_mission_key: "run_your_first_job",
      role_category: "billing",
      can_view_financial_register: true,
      can_collect_field_payment: true,
    });
  });

  it("rejects invalid event type, category, and feedback combinations", async () => {
    const { supabase, from } = makeSupabase();
    const requireInternalUserFn = vi.fn(async () => makeInternalUser());

    await expect(
      persistHelpGapEvent(
        { ...baseInput, eventType: "helpful" },
        { supabase, env: enabledEnv, requireInternalUserFn },
      ),
    ).resolves.toEqual({ ok: false, reason: "invalid_input" });

    await expect(
      persistHelpGapEvent(
        { ...baseInput, helpGapCategory: "raw_transcript" },
        { supabase, env: enabledEnv, requireInternalUserFn },
      ),
    ).resolves.toEqual({ ok: false, reason: "invalid_input" });

    await expect(
      persistHelpGapEvent(
        { ...baseInput, eventType: "not_helpful", feedbackValue: "still_need_help" },
        { supabase, env: enabledEnv, requireInternalUserFn },
      ),
    ).resolves.toEqual({ ok: false, reason: "invalid_input" });

    expect(from).not.toHaveBeenCalled();
  });

  it("returns a safe insert_failed result without exposing database details", async () => {
    const { supabase } = makeSupabase({ insertError: { message: "permission denied for table" } });
    const result = await persistHelpGapEvent(baseInput, {
      supabase,
      env: enabledEnv,
      requireInternalUserFn: vi.fn(async () => makeInternalUser()),
    });

    expect(result).toEqual({ ok: false, reason: "insert_failed" });
  });

  it("keeps the helper and action free of support-case, provider, analytics, and service-role paths", () => {
    const helperSource = readFileSync(resolve(__dirname, "../help-gap-persistence.ts"), "utf8");
    const actionSource = readFileSync(resolve(__dirname, "../../actions/help-gap-actions.ts"), "utf8");
    const launcherSource = readFileSync(
      resolve(__dirname, "../../../components/help-assistant/AskComplianceMattersLauncher.tsx"),
      "utf8",
    );

    expect(helperSource).toContain('from("assistant_help_gap_events")');
    expect(helperSource).not.toContain('from("support_cases")');
    expect(helperSource).not.toContain('from("support_case_notes")');
    expect(helperSource).not.toContain("createAdminClient");
    expect(helperSource).not.toContain("service_role");
    expect(helperSource).not.toContain("OpenAI");
    expect(helperSource).not.toContain("openai");
    expect(helperSource).not.toContain("analytics");
    expect(actionSource).not.toContain("createAdminClient");
    expect(actionSource).not.toContain("support_cases");
    expect(launcherSource).toContain("persistHelpGapEventFromAssistantAction");
    expect(launcherSource).not.toContain("localStorage");
    expect(launcherSource).not.toContain("sessionStorage");
    expect(launcherSource).not.toContain("support_cases");
    expect(launcherSource).not.toContain("support_case_notes");
  });
});
