import { describe, expect, it, vi } from "vitest";

import { getSmsOnTheWayTemplateGovernanceForAccount } from "@/lib/communications/sms-template-governance-read";

type TemplateFixture = {
  id: string;
  account_owner_user_id: string;
  template_key: string;
  message_class: string;
  display_name: string;
  lifecycle_status: string;
  current_version_id: string | null;
  sandbox_version_id: string | null;
  created_at: string;
  updated_at: string;
};

type VersionFixture = {
  id: string;
  account_owner_user_id: string;
  sms_message_template_id: string;
  template_key: string;
  message_class: string;
  version_number: number;
  version_label: string | null;
  body_template: string;
  detected_tokens: string[];
  unknown_tokens: string[];
  token_policy_version: string;
  content_classification: string;
  version_status: string;
  internal_review_status: string;
  legal_review_status: string;
  provider_review_status: string;
  created_at: string;
  updated_at: string;
};

function makeTemplate(input: Partial<TemplateFixture> & { id: string }): TemplateFixture {
  const { id, ...rest } = input;
  return {
    id,
    account_owner_user_id: "owner-1",
    template_key: "on_the_way",
    message_class: "on_the_way",
    display_name: "On-The-Way Notification",
    lifecycle_status: "draft",
    current_version_id: null,
    sandbox_version_id: null,
    created_at: "2026-05-15T10:00:00Z",
    updated_at: "2026-05-15T10:00:00Z",
    ...rest,
  };
}

function makeVersion(input: Partial<VersionFixture> & { id: string }): VersionFixture {
  const { id, ...rest } = input;
  return {
    id,
    account_owner_user_id: "owner-1",
    sms_message_template_id: "template-1",
    template_key: "on_the_way",
    message_class: "on_the_way",
    version_number: 1,
    version_label: "v1",
    body_template:
      "Hi {{recipient_first_name}}, this is {{operator_or_tech_name}} with {{company_name}}. I am on the way to your service appointment. Reply STOP to opt out.",
    detected_tokens: ["recipient_first_name", "operator_or_tech_name", "company_name"],
    unknown_tokens: [],
    token_policy_version: "v1",
    content_classification: "operational",
    version_status: "draft",
    internal_review_status: "not_requested",
    legal_review_status: "not_requested",
    provider_review_status: "not_requested",
    created_at: "2026-05-15T10:00:00Z",
    updated_at: "2026-05-15T10:00:00Z",
    ...rest,
  };
}

function makeSupabase(fixtures?: {
  templates?: TemplateFixture[];
  versions?: VersionFixture[];
}) {
  const templates = fixtures?.templates ?? [];
  const versions = fixtures?.versions ?? [];
  const calls: Array<{ table: string; op: string; column?: string; value?: unknown }> = [];

  const supabase = {
    from(table: string) {
      calls.push({ table, op: "from" });

      const eqFilters: Array<[string, unknown]> = [];
      const orderFilters: Array<[string, boolean]> = [];
      let limitValue: number | null = null;

      const getRows = () => {
        const source =
          table === "sms_message_templates"
            ? templates
            : table === "sms_message_template_versions"
              ? versions
              : [];

        let data: any[] = [...source];
        for (const [column, value] of eqFilters) {
          data = data.filter((row) => row?.[column] === value);
        }
        for (const [column, ascending] of orderFilters) {
          data.sort((left, right) => {
            const leftValue = left?.[column];
            const rightValue = right?.[column];
            if (leftValue === rightValue) return 0;
            if (leftValue === undefined || leftValue === null) return 1;
            if (rightValue === undefined || rightValue === null) return -1;
            if (typeof leftValue === "number" && typeof rightValue === "number") {
              return ascending ? leftValue - rightValue : rightValue - leftValue;
            }
            const comparison = String(leftValue).localeCompare(String(rightValue));
            return ascending ? comparison : comparison * -1;
          });
        }
        if (limitValue !== null) {
          data = data.slice(0, limitValue);
        }
        return { data, error: null };
      };

      const query: any = {
        select: vi.fn(() => {
          calls.push({ table, op: "select" });
          return query;
        }),
        eq: vi.fn((column: string, value: unknown) => {
          calls.push({ table, op: "eq", column, value });
          eqFilters.push([column, value]);
          return query;
        }),
        order: vi.fn((column: string, options?: { ascending?: boolean }) => {
          calls.push({ table, op: "order", column, value: options?.ascending ?? true });
          orderFilters.push([column, options?.ascending ?? true]);
          return query;
        }),
        limit: vi.fn((value: number) => {
          calls.push({ table, op: "limit", value });
          limitValue = value;
          return query;
        }),
        then: (
          onFulfilled: (value: { data: any[]; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(getRows()).then(onFulfilled, onRejected),
      };

      return query;
    },
  };

  return { supabase, calls };
}

describe("sms template governance read helper", () => {
  it("returns safe empty when accountOwnerUserId is missing and does not query", async () => {
    const { supabase, calls } = makeSupabase();

    const result = await getSmsOnTheWayTemplateGovernanceForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "",
    });

    expect(result.template.hasTemplate).toBe(false);
    expect(result.status.smsEnabled).toBe(false);
    expect(result.status.liveSendsEnabled).toBe(false);
    expect(result).not.toHaveProperty("accountOwnerUserId");
    expect(calls.some((call) => call.op === "from")).toBe(false);
  });

  it("returns not configured when no template rows exist", async () => {
    const { supabase } = makeSupabase();

    const result = await getSmsOnTheWayTemplateGovernanceForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.template.hasTemplate).toBe(false);
    expect(result.template.lifecycleLabel).toBe("Not configured");
    expect(result.currentVersion.exists).toBe(false);
    expect(result.status.smsEnabled).toBe(false);
    expect(result.status.liveSendsEnabled).toBe(false);
  });

  it("returns template container status when template exists without versions", async () => {
    const { supabase } = makeSupabase({
      templates: [makeTemplate({ id: "template-1", lifecycle_status: "active" })],
      versions: [],
    });

    const result = await getSmsOnTheWayTemplateGovernanceForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.template.hasTemplate).toBe(true);
    expect(result.template.lifecycleStatus).toBe("active");
    expect(result.template.lifecycleLabel).toBe("Active template container");
    expect(result.currentVersion.exists).toBe(false);
  });

  it("resolves current version using current_version_id pointer", async () => {
    const { supabase } = makeSupabase({
      templates: [makeTemplate({ id: "template-1", current_version_id: "version-2" })],
      versions: [
        makeVersion({ id: "version-1", version_number: 1 }),
        makeVersion({ id: "version-2", version_number: 2, version_label: "v2" }),
      ],
    });

    const result = await getSmsOnTheWayTemplateGovernanceForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.template.hasCurrentVersion).toBe(true);
    expect(result.currentVersion.exists).toBe(true);
    expect(result.currentVersion.versionId).toBe("version-2");
    expect(result.currentVersion.versionNumber).toBe(2);
    expect(result.currentVersion.versionLabel).toBe("v2");
  });

  it("resolves sandbox version using sandbox_version_id pointer", async () => {
    const { supabase } = makeSupabase({
      templates: [makeTemplate({ id: "template-1", sandbox_version_id: "version-3" })],
      versions: [
        makeVersion({ id: "version-2", version_number: 2 }),
        makeVersion({ id: "version-3", version_number: 3, version_label: "sandbox-v3" }),
      ],
    });

    const result = await getSmsOnTheWayTemplateGovernanceForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.template.hasSandboxVersion).toBe(true);
    expect(result.sandboxVersion.exists).toBe(true);
    expect(result.sandboxVersion.versionId).toBe("version-3");
    expect(result.sandboxVersion.versionNumber).toBe(3);
    expect(result.sandboxVersion.versionLabel).toBe("sandbox-v3");
  });

  it("returns latest version summary without treating it as current when no pointer exists", async () => {
    const { supabase } = makeSupabase({
      templates: [makeTemplate({ id: "template-1", current_version_id: null })],
      versions: [
        makeVersion({ id: "version-1", version_number: 1 }),
        makeVersion({ id: "version-4", version_number: 4, version_label: "v4" }),
      ],
    });

    const result = await getSmsOnTheWayTemplateGovernanceForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.currentVersion.exists).toBe(false);
    expect(result.latestVersion.exists).toBe(true);
    expect(result.latestVersion.versionId).toBe("version-4");
    expect(result.latestVersion.versionNumber).toBe(4);
    expect(result.latestVersion.isCurrentPointer).toBe(false);
    expect(result.latestVersion.helperText).toContain("is informational only");
  });

  it("exposes latest draft admin readiness without exposing account scope", async () => {
    const { supabase } = makeSupabase({
      templates: [makeTemplate({ id: "template-1" })],
      versions: [makeVersion({ id: "version-1", version_status: "draft" })],
    });

    const result = await getSmsOnTheWayTemplateGovernanceForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result).not.toHaveProperty("accountOwnerUserId");
    expect(result.latestVersion.versionId).toBe("version-1");
    expect(result.latestVersion.canSaveDraft).toBe(true);
    expect(result.latestVersion.canMarkReadyForSandbox).toBe(true);
    expect(result.latestVersion.markReadyBlockingReasons).toEqual([]);
    expect(result.latestVersion.stopLanguagePresent).toBe(true);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("account_owner_user_id");
    expect(serialized).not.toContain("owner-1");
  });

  it("renders allowed tokens into sample preview using only sample data", async () => {
    const { supabase } = makeSupabase({
      templates: [makeTemplate({ id: "template-1", current_version_id: "version-1" })],
      versions: [
        makeVersion({
          id: "version-1",
          body_template:
            "Hi {{recipient_first_name}}, this is {{operator_or_tech_name}} with {{company_name}} about {{appointment_or_job_context}}. Reply STOP to opt out.",
          version_status: "pending_review",
        }),
      ],
    });

    const result = await getSmsOnTheWayTemplateGovernanceForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.currentVersion.samplePreview).toContain("Taylor");
    expect(result.currentVersion.samplePreview).toContain("Alex");
    expect(result.currentVersion.samplePreview).toContain("Your company");
    expect(result.currentVersion.samplePreview).toContain("your service appointment");
  });

  it("detects unknown tokens and blocks approval readiness", async () => {
    const { supabase } = makeSupabase({
      templates: [makeTemplate({ id: "template-1", current_version_id: "version-1" })],
      versions: [
        makeVersion({
          id: "version-1",
          body_template:
            "Hi {{recipient_first_name}}, use {{unsafe_customer_note}}. Reply STOP to opt out.",
          detected_tokens: ["recipient_first_name"],
          unknown_tokens: [],
          version_status: "approved_for_activation",
          internal_review_status: "approved",
          legal_review_status: "approved",
          provider_review_status: "approved",
        }),
      ],
    });

    const result = await getSmsOnTheWayTemplateGovernanceForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.currentVersion.hasUnknownTokens).toBe(true);
    expect(result.currentVersion.unknownTokens).toContain("unsafe_customer_note");
    expect(result.currentVersion.approvalReady).toBe(false);
    expect(result.currentVersion.approvalReadyLabel).toContain("unknown tokens");
  });

  it("blocks latest draft sandbox readiness when unknown tokens are present", async () => {
    const { supabase } = makeSupabase({
      templates: [makeTemplate({ id: "template-1" })],
      versions: [
        makeVersion({
          id: "version-1",
          body_template: "Hi {{recipient_first_name}}, use {{unsafe_customer_note}}. Reply STOP to opt out.",
          detected_tokens: ["recipient_first_name"],
          unknown_tokens: [],
          version_status: "draft",
        }),
      ],
    });

    const result = await getSmsOnTheWayTemplateGovernanceForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.latestVersion.canSaveDraft).toBe(true);
    expect(result.latestVersion.canMarkReadyForSandbox).toBe(false);
    expect(result.latestVersion.markReadyBlockingReasons).toContain("unknown_tokens");
    expect(result.latestVersion.markReadyWarnings).toContain("unknown_tokens_present");
  });

  it("blocks approval readiness when STOP language is missing", async () => {
    const { supabase } = makeSupabase({
      templates: [makeTemplate({ id: "template-1", current_version_id: "version-1" })],
      versions: [
        makeVersion({
          id: "version-1",
          body_template:
            "Hi {{recipient_first_name}}, this is {{operator_or_tech_name}} with {{company_name}}.",
          version_status: "approved_for_activation",
          internal_review_status: "approved",
          legal_review_status: "approved",
          provider_review_status: "approved",
        }),
      ],
    });

    const result = await getSmsOnTheWayTemplateGovernanceForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.currentVersion.approvalReady).toBe(false);
    expect(result.currentVersion.approvalReadyLabel).toContain("STOP language missing");
    expect(result.compliance.stopLanguagePresent).toBe(false);
  });

  it("blocks latest draft sandbox readiness when STOP language is missing", async () => {
    const { supabase } = makeSupabase({
      templates: [makeTemplate({ id: "template-1" })],
      versions: [
        makeVersion({
          id: "version-1",
          body_template:
            "Hi {{recipient_first_name}}, this is {{operator_or_tech_name}} with {{company_name}}.",
          version_status: "draft",
        }),
      ],
    });

    const result = await getSmsOnTheWayTemplateGovernanceForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.latestVersion.canMarkReadyForSandbox).toBe(false);
    expect(result.latestVersion.markReadyBlockingReasons).toContain("stop_language_missing");
    expect(result.latestVersion.markReadyWarnings).toContain("stop_language_missing");
  });

  it("blocks latest draft sandbox readiness when prohibited wording is present", async () => {
    const { supabase } = makeSupabase({
      templates: [makeTemplate({ id: "template-1" })],
      versions: [
        makeVersion({
          id: "version-1",
          body_template:
            "Hi {{recipient_first_name}}, this is {{operator_or_tech_name}} with {{company_name}}. Ask about our discount. Reply STOP to opt out.",
          version_status: "draft",
        }),
      ],
    });

    const result = await getSmsOnTheWayTemplateGovernanceForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.latestVersion.canMarkReadyForSandbox).toBe(false);
    expect(result.latestVersion.prohibitedContentHits).toContain("discount");
    expect(result.latestVersion.markReadyBlockingReasons).toContain("prohibited_content");
  });

  it("does not make approved sandbox versions draft-editable", async () => {
    const { supabase } = makeSupabase({
      templates: [makeTemplate({ id: "template-1", sandbox_version_id: "version-1" })],
      versions: [
        makeVersion({
          id: "version-1",
          version_status: "approved_for_sandbox",
          internal_review_status: "approved",
        }),
      ],
    });

    const result = await getSmsOnTheWayTemplateGovernanceForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.latestVersion.versionStatus).toBe("approved_for_sandbox");
    expect(result.latestVersion.canSaveDraft).toBe(false);
    expect(result.latestVersion.canMarkReadyForSandbox).toBe(false);
  });

  it("keeps historical current and sandbox versions action-ineligible when they are not latest", async () => {
    const { supabase } = makeSupabase({
      templates: [
        makeTemplate({
          id: "template-1",
          current_version_id: "version-1",
          sandbox_version_id: "version-2",
        }),
      ],
      versions: [
        makeVersion({ id: "version-1", version_number: 1, version_status: "draft" }),
        makeVersion({ id: "version-2", version_number: 2, version_status: "pending_review" }),
        makeVersion({ id: "version-3", version_number: 3, version_status: "draft" }),
      ],
    });

    const result = await getSmsOnTheWayTemplateGovernanceForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.latestVersion.versionId).toBe("version-3");
    expect(result.latestVersion.canSaveDraft).toBe(true);
    expect(result.latestVersion.canMarkReadyForSandbox).toBe(true);
    expect(result.currentVersion.versionId).toBe("version-1");
    expect(result.currentVersion.canSaveDraft).toBe(false);
    expect(result.currentVersion.canMarkReadyForSandbox).toBe(false);
    expect(result.sandboxVersion.versionId).toBe("version-2");
    expect(result.sandboxVersion.canSaveDraft).toBe(false);
    expect(result.sandboxVersion.canMarkReadyForSandbox).toBe(false);
  });

  it("keeps SMS disabled even when version status and reviews are approved", async () => {
    const { supabase } = makeSupabase({
      templates: [makeTemplate({ id: "template-1", lifecycle_status: "active", current_version_id: "version-1" })],
      versions: [
        makeVersion({
          id: "version-1",
          version_status: "active",
          internal_review_status: "approved",
          legal_review_status: "approved",
          provider_review_status: "approved",
        }),
      ],
    });

    const result = await getSmsOnTheWayTemplateGovernanceForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result).not.toHaveProperty("canSend");
    expect(result.status.smsEnabled).toBe(false);
    expect(result.status.liveSendsEnabled).toBe(false);
    expect(result.status.statusLabel).toBe("SMS is not enabled");
  });

  it("returns body_template as governed wording only and not as send readiness instruction", async () => {
    const bodyTemplate =
      "Hi {{recipient_first_name}}, this is {{operator_or_tech_name}} with {{company_name}}. Reply STOP to opt out.";

    const { supabase } = makeSupabase({
      templates: [makeTemplate({ id: "template-1", current_version_id: "version-1" })],
      versions: [makeVersion({ id: "version-1", body_template: bodyTemplate })],
    });

    const result = await getSmsOnTheWayTemplateGovernanceForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.currentVersion.bodyTemplate).toBe(bodyTemplate);
    expect(result.status.liveSendsEnabled).toBe(false);
    expect(result.currentVersion.approvalReadyLabel).not.toContain("send enabled");
  });

  it("reads only template governance tables", async () => {
    const { supabase, calls } = makeSupabase({
      templates: [makeTemplate({ id: "template-1" })],
      versions: [makeVersion({ id: "version-1" })],
    });

    await getSmsOnTheWayTemplateGovernanceForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    const fromTables = calls.filter((call) => call.op === "from").map((call) => call.table);
    expect(fromTables).toEqual(["sms_message_templates", "sms_message_template_versions"]);
    expect(fromTables.includes("jobs")).toBe(false);
    expect(fromTables.includes("customers")).toBe(false);
    expect(fromTables.includes("locations")).toBe(false);
    expect(fromTables.includes("contact_recipients")).toBe(false);
    expect(fromTables.includes("sms_message_intents")).toBe(false);
    expect(fromTables.includes("sms_provider_deliveries")).toBe(false);
  });

  it("applies account scope filters to template and version queries", async () => {
    const { supabase, calls } = makeSupabase({
      templates: [
        makeTemplate({ id: "template-1", account_owner_user_id: "owner-1" }),
        makeTemplate({ id: "template-2", account_owner_user_id: "owner-2" }),
      ],
      versions: [
        makeVersion({ id: "version-1", account_owner_user_id: "owner-1", sms_message_template_id: "template-1" }),
        makeVersion({ id: "version-2", account_owner_user_id: "owner-2", sms_message_template_id: "template-2" }),
      ],
    });

    const result = await getSmsOnTheWayTemplateGovernanceForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.template.hasTemplate).toBe(true);
    expect(
      calls.some(
        (call) =>
          call.table === "sms_message_templates" &&
          call.op === "eq" &&
          call.column === "account_owner_user_id" &&
          call.value === "owner-1",
      ),
    ).toBe(true);
    expect(
      calls.some(
        (call) =>
          call.table === "sms_message_template_versions" &&
          call.op === "eq" &&
          call.column === "account_owner_user_id" &&
          call.value === "owner-1",
      ),
    ).toBe(true);
  });

  it("calculates segment estimate for short and long rendered sample previews", async () => {
    const longBodyTemplate =
      "Hi {{recipient_first_name}}, this is {{operator_or_tech_name}} with {{company_name}}. " +
      "I am on the way to your service appointment and will share updates shortly if timing changes. " +
      "Please keep your phone nearby and reply STOP to opt out.";

    const { supabase: shortSupabase } = makeSupabase({
      templates: [makeTemplate({ id: "template-1", current_version_id: "version-short" })],
      versions: [
        makeVersion({
          id: "version-short",
          body_template: "Hi {{recipient_first_name}}, this is {{company_name}}. Reply STOP to opt out.",
        }),
      ],
    });

    const shortResult = await getSmsOnTheWayTemplateGovernanceForAccount({
      supabase: shortSupabase as any,
      accountOwnerUserId: "owner-1",
    });

    const { supabase: longSupabase } = makeSupabase({
      templates: [makeTemplate({ id: "template-1", current_version_id: "version-long" })],
      versions: [makeVersion({ id: "version-long", body_template: longBodyTemplate })],
    });

    const longResult = await getSmsOnTheWayTemplateGovernanceForAccount({
      supabase: longSupabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(shortResult.currentVersion.estimatedSegments).toBe(1);
    expect(longResult.currentVersion.characterCount).toBeGreaterThan(160);
    expect(longResult.currentVersion.estimatedSegments).toBe(Math.ceil(longResult.currentVersion.characterCount / 153));
  });

  it("does not return provider refs, secret-like fields, phone, customer, or job data", async () => {
    const { supabase } = makeSupabase({
      templates: [makeTemplate({ id: "template-1", current_version_id: "version-1" })],
      versions: [makeVersion({ id: "version-1" })],
    });

    const result = await getSmsOnTheWayTemplateGovernanceForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("canSend");
    expect(serialized).not.toContain("provider_account_ref");
    expect(serialized).not.toContain("provider_sender_ref");
    expect(serialized).not.toContain("phone_e164");
    expect(serialized).not.toContain("customer");
    expect(serialized).not.toContain("job_id");
    expect(serialized).not.toContain("account_owner_user_id");
    expect(serialized).not.toContain("owner-1");
    expect(serialized).not.toContain("auth_token");
    expect(serialized).not.toContain("api_key");
  });
});
