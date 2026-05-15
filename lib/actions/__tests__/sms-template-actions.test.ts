import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks — declared before any imports so vi.mock hoisting works.
// ---------------------------------------------------------------------------

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalRole: (...args: unknown[]) => requireInternalRoleMock(...args),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import {
  isVersionMutable,
  resolveNextVersionNumber,
  createOnTheWayTemplateDraftFromDefaultFromForm,
  saveOnTheWayTemplateDraftFromForm,
  submitOnTheWayTemplateVersionForReviewFromForm,
  approveOnTheWayTemplateVersionForSandboxFromForm,
  rejectOnTheWayTemplateVersionFromForm,
} from "@/lib/actions/sms-template-actions";

// ---------------------------------------------------------------------------
// Pure helper tests — no async, no mocks needed
// ---------------------------------------------------------------------------

describe("resolveNextVersionNumber", () => {
  it("returns 1 when no versions exist", () => {
    expect(resolveNextVersionNumber(null)).toBe(1);
  });

  it("returns max version_number + 1 from the latest row", () => {
    expect(resolveNextVersionNumber({ version_number: 3, version_status: "active" })).toBe(4);
    expect(resolveNextVersionNumber({ version_number: 1, version_status: "draft" })).toBe(2);
  });
});

describe("isVersionMutable", () => {
  it("returns true for draft", () => {
    expect(isVersionMutable("draft")).toBe(true);
  });

  it("returns false for all immutable statuses", () => {
    const immutable = [
      "pending_review",
      "approved_for_sandbox",
      "approved_for_activation",
      "active",
      "rejected",
      "superseded",
      "retired",
    ];
    for (const status of immutable) {
      expect(isVersionMutable(status)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Admin mock factory
// ---------------------------------------------------------------------------

type TemplateRow = { id: string; account_owner_user_id: string };
type VersionRow = {
  id: string;
  account_owner_user_id: string;
  sms_message_template_id: string;
  version_number: number;
  version_status: string;
};

function buildAdminMock(options: {
  existingTemplate?: TemplateRow | null;
  latestVersion?: VersionRow | null;
  insertTemplateError?: boolean;
  insertVersionError?: boolean;
  updateVersionError?: boolean;
}) {
  const templateInserts: unknown[] = [];
  const versionInserts: unknown[] = [];
  const versionUpdates: unknown[] = [];

  const admin = {
    from(table: string) {
      if (table === "sms_message_templates") {
        // insert() must be synchronous and return the query for .select().single() chaining
        const query: any = {
          select: vi.fn(() => query),
          insert: vi.fn((payload: unknown) => {
            templateInserts.push(payload);
            return query;
          }),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => {
            if (options.existingTemplate !== undefined) {
              return { data: options.existingTemplate, error: null };
            }
            return { data: null, error: null };
          }),
          single: vi.fn(async () => {
            if (options.insertTemplateError) return { data: null, error: new Error("insert_error") };
            return { data: { id: "new-template-id" }, error: null };
          }),
        };
        return query;
      }

      if (table === "sms_message_template_versions") {
        let updatePayload: unknown = null;
        let versionFilters: Array<[string, unknown]> = [];

        const query: any = {
          select: vi.fn(() => query),
          insert: vi.fn(async (payload: unknown) => {
            versionInserts.push(payload);
            if (options.insertVersionError) return { error: new Error("version_insert_error") };
            return { error: null };
          }),
          update: vi.fn((payload: unknown) => {
            updatePayload = payload;
            return query;
          }),
          eq: vi.fn((col: string, val: unknown) => {
            versionFilters.push([col, val]);
            return query;
          }),
          order: vi.fn(() => query),
          limit: vi.fn(() => query),
          maybeSingle: vi.fn(async () => {
            if (options.latestVersion !== undefined) {
              return { data: options.latestVersion, error: null };
            }
            return { data: null, error: null };
          }),
          then: (resolve: (v: { error: unknown }) => void) => {
            if (options.updateVersionError) {
              resolve({ error: new Error("version_update_error") });
            } else {
              versionUpdates.push(updatePayload);
              resolve({ error: null });
            }
          },
        };
        return query;
      }

      throw new Error(`Unexpected table in test mock: ${table}`);
    },
  };

  return { admin, templateInserts, versionInserts, versionUpdates };
}

// ---------------------------------------------------------------------------
// createOnTheWayTemplateDraftFromDefaultFromForm
// ---------------------------------------------------------------------------

describe("createOnTheWayTemplateDraftFromDefaultFromForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockResolvedValue({});
  });

  it("redirects to admin_required when caller is not an admin", async () => {
    requireInternalRoleMock.mockRejectedValue(new Error("INTERNAL_ROLE_REQUIRED"));

    await expect(
      createOnTheWayTemplateDraftFromDefaultFromForm(new FormData()),
    ).rejects.toThrow(/REDIRECT:.*admin_required/);
  });

  it("creates parent template container and new draft version when none exist", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const { admin, templateInserts, versionInserts } = buildAdminMock({
      existingTemplate: null,
      latestVersion: null,
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      createOnTheWayTemplateDraftFromDefaultFromForm(new FormData()),
    ).rejects.toThrow(/REDIRECT:.*draft_created/);

    expect(templateInserts).toHaveLength(1);
    expect(versionInserts).toHaveLength(1);

    const version = versionInserts[0] as any;
    expect(version.version_number).toBe(1);
    expect(version.version_status).toBe("draft");
    expect(version.internal_review_status).toBe("not_requested");
    expect(version.legal_review_status).toBe("not_requested");
    expect(version.provider_review_status).toBe("not_requested");
    expect(version.current_version_id).toBeUndefined();
    expect(version.sandbox_version_id).toBeUndefined();
  });

  it("reuses existing mutable draft instead of creating a duplicate", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const { admin, versionInserts } = buildAdminMock({
      existingTemplate: { id: "template-1", account_owner_user_id: "owner-1" },
      latestVersion: {
        id: "version-1",
        account_owner_user_id: "owner-1",
        sms_message_template_id: "template-1",
        version_number: 1,
        version_status: "draft",
      },
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      createOnTheWayTemplateDraftFromDefaultFromForm(new FormData()),
    ).rejects.toThrow(/REDIRECT:.*draft_available/);

    // Must NOT have created a new version
    expect(versionInserts).toHaveLength(0);
  });

  it("creates next version when latest version is not mutable", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const { admin, versionInserts } = buildAdminMock({
      existingTemplate: { id: "template-1", account_owner_user_id: "owner-1" },
      latestVersion: {
        id: "version-2",
        account_owner_user_id: "owner-1",
        sms_message_template_id: "template-1",
        version_number: 2,
        version_status: "approved_for_sandbox",
      },
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      createOnTheWayTemplateDraftFromDefaultFromForm(new FormData()),
    ).rejects.toThrow(/REDIRECT:.*draft_created/);

    expect(versionInserts).toHaveLength(1);
    expect((versionInserts[0] as any).version_number).toBe(3);
    expect((versionInserts[0] as any).version_status).toBe("draft");
  });

  it("revalidates /ops/admin/communications on success", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const { admin } = buildAdminMock({ existingTemplate: null, latestVersion: null });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      createOnTheWayTemplateDraftFromDefaultFromForm(new FormData()),
    ).rejects.toThrow(/REDIRECT:/);

    expect(revalidatePathMock).toHaveBeenCalledWith("/ops/admin/communications");
  });

  it("scopes all reads/writes by account_owner_user_id from auth context", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-99", role: "admin" },
    });

    const { admin, templateInserts, versionInserts } = buildAdminMock({
      existingTemplate: null,
      latestVersion: null,
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      createOnTheWayTemplateDraftFromDefaultFromForm(new FormData()),
    ).rejects.toThrow(/REDIRECT:/);

    expect((templateInserts[0] as any).account_owner_user_id).toBe("owner-99");
    expect((versionInserts[0] as any).account_owner_user_id).toBe("owner-99");
  });

  it("never sets current_version_id or sandbox_version_id", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const { admin, templateInserts, versionInserts } = buildAdminMock({
      existingTemplate: null,
      latestVersion: null,
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      createOnTheWayTemplateDraftFromDefaultFromForm(new FormData()),
    ).rejects.toThrow(/REDIRECT:/);

    const templatePayload = templateInserts[0] as any;
    expect(templatePayload.current_version_id).toBeUndefined();
    expect(templatePayload.sandbox_version_id).toBeUndefined();

    const versionPayload = versionInserts[0] as any;
    expect(versionPayload.current_version_id).toBeUndefined();
    expect(versionPayload.sandbox_version_id).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// saveOnTheWayTemplateDraftFromForm
// ---------------------------------------------------------------------------

describe("saveOnTheWayTemplateDraftFromForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockResolvedValue({});
  });

  function makeFormData(body: string) {
    const fd = new FormData();
    fd.set("body_template", body);
    return fd;
  }

  const VALID_BODY =
    "Hi {{recipient_first_name}}, this is {{operator_or_tech_name}} with {{company_name}}. I am on the way to your service appointment. Reply STOP to opt out.";

  it("redirects to admin_required when caller is not admin", async () => {
    requireInternalRoleMock.mockRejectedValue(new Error("INTERNAL_ROLE_REQUIRED"));

    await expect(
      saveOnTheWayTemplateDraftFromForm(makeFormData(VALID_BODY)),
    ).rejects.toThrow(/REDIRECT:.*admin_required/);
  });

  it("redirects to body_blank when body is empty", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const { admin } = buildAdminMock({});
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      saveOnTheWayTemplateDraftFromForm(makeFormData("   ")),
    ).rejects.toThrow(/REDIRECT:.*body_blank/);
  });

  it("updates the existing mutable draft in place", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const versionUpdates: unknown[] = [];
    const admin = {
      from(table: string) {
        if (table === "sms_message_templates") {
          const q: any = {
            select: vi.fn(() => q),
            insert: vi.fn((payload: unknown) => q),
            eq: vi.fn(() => q),
            maybeSingle: vi.fn(async () => ({
              data: { id: "t1", account_owner_user_id: "owner-1" },
              error: null,
            })),
            single: vi.fn(async () => ({ data: { id: "t1" }, error: null })),
          };
          return q;
        }
        if (table === "sms_message_template_versions") {
          let updatePayload: unknown = null;
          const q: any = {
            select: vi.fn(() => q),
            insert: vi.fn(async () => ({ error: null })),
            update: vi.fn((p: unknown) => { updatePayload = p; return q; }),
            eq: vi.fn(() => q),
            order: vi.fn(() => q),
            limit: vi.fn(() => q),
            maybeSingle: vi.fn(async () => ({
              data: { id: "v1", version_number: 1, version_status: "draft" },
              error: null,
            })),
            then: (resolve: (v: { error: unknown }) => void) => {
              versionUpdates.push(updatePayload);
              resolve({ error: null });
            },
          };
          return q;
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      saveOnTheWayTemplateDraftFromForm(makeFormData(VALID_BODY)),
    ).rejects.toThrow(/REDIRECT:.*draft_saved/);

    expect(versionUpdates).toHaveLength(1);
    const update = versionUpdates[0] as any;
    expect(update.version_status).toBe("draft");
    expect(update.current_version_id).toBeUndefined();
    expect(update.sandbox_version_id).toBeUndefined();
    expect(update.body_template).toContain("{{recipient_first_name}}");
  });

  it("does not mutate approved/active version; creates new draft instead", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const versionInserts: unknown[] = [];
    const admin = {
      from(table: string) {
        if (table === "sms_message_templates") {
          const q: any = {
            select: vi.fn(() => q),
            insert: vi.fn((payload: unknown) => q),
            eq: vi.fn(() => q),
            maybeSingle: vi.fn(async () => ({
              data: { id: "t1", account_owner_user_id: "owner-1" },
              error: null,
            })),
            single: vi.fn(async () => ({ data: { id: "t1" }, error: null })),
          };
          return q;
        }
        if (table === "sms_message_template_versions") {
          const q: any = {
            select: vi.fn(() => q),
            insert: vi.fn(async (p: unknown) => { versionInserts.push(p); return { error: null }; }),
            update: vi.fn(() => q),
            eq: vi.fn(() => q),
            order: vi.fn(() => q),
            limit: vi.fn(() => q),
            maybeSingle: vi.fn(async () => ({
              data: { id: "v2", version_number: 2, version_status: "active" },
              error: null,
            })),
          };
          return q;
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      saveOnTheWayTemplateDraftFromForm(makeFormData(VALID_BODY)),
    ).rejects.toThrow(/REDIRECT:.*draft_created/);

    expect(versionInserts).toHaveLength(1);
    const inserted = versionInserts[0] as any;
    expect(inserted.version_number).toBe(3);
    expect(inserted.version_status).toBe("draft");
  });

  it("persists validation metadata on save", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const versionUpdates: unknown[] = [];
    const admin = {
      from(table: string) {
        if (table === "sms_message_templates") {
          const q: any = {
            select: vi.fn(() => q), insert: vi.fn((payload: unknown) => q),
            eq: vi.fn(() => q), maybeSingle: vi.fn(async () => ({ data: { id: "t1" }, error: null })),
            single: vi.fn(async () => ({ data: { id: "t1" }, error: null })),
          };
          return q;
        }
        if (table === "sms_message_template_versions") {
          let updatePayload: unknown = null;
          const q: any = {
            select: vi.fn(() => q), insert: vi.fn(async () => ({ error: null })),
            update: vi.fn((p: unknown) => { updatePayload = p; return q; }),
            eq: vi.fn(() => q), order: vi.fn(() => q), limit: vi.fn(() => q),
            maybeSingle: vi.fn(async () => ({
              data: { id: "v1", version_number: 1, version_status: "draft" },
              error: null,
            })),
            then: (resolve: (v: { error: unknown }) => void) => {
              versionUpdates.push(updatePayload);
              resolve({ error: null });
            },
          };
          return q;
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      saveOnTheWayTemplateDraftFromForm(makeFormData(VALID_BODY)),
    ).rejects.toThrow(/REDIRECT:/);

    const update = versionUpdates[0] as any;
    expect(update.body_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(Array.isArray(update.detected_tokens)).toBe(true);
    expect(Array.isArray(update.unknown_tokens)).toBe(true);
    expect(update.token_policy_version).toBe("v1");
    expect(update.content_classification).toBe("operational");
  });

  it("returns draft_validation_warning when body has warnings", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const versionUpdates: unknown[] = [];
    const admin = {
      from(table: string) {
        if (table === "sms_message_templates") {
          const q: any = {
            select: vi.fn(() => q), insert: vi.fn((payload: unknown) => q),
            eq: vi.fn(() => q), maybeSingle: vi.fn(async () => ({ data: { id: "t1" }, error: null })),
            single: vi.fn(async () => ({ data: { id: "t1" }, error: null })),
          };
          return q;
        }
        if (table === "sms_message_template_versions") {
          let updatePayload: unknown = null;
          const q: any = {
            select: vi.fn(() => q), insert: vi.fn(async () => ({ error: null })),
            update: vi.fn((p: unknown) => { updatePayload = p; return q; }),
            eq: vi.fn(() => q), order: vi.fn(() => q), limit: vi.fn(() => q),
            maybeSingle: vi.fn(async () => ({
              data: { id: "v1", version_number: 1, version_status: "draft" },
              error: null,
            })),
            then: (resolve: (v: { error: unknown }) => void) => {
              versionUpdates.push(updatePayload);
              resolve({ error: null });
            },
          };
          return q;
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };
    createAdminClientMock.mockReturnValue(admin);

    // Body without STOP language — triggers a warning but is non-blank so can be saved
    const bodyWithoutStop = "Hi {{recipient_first_name}}, this is {{company_name}}.";

    await expect(
      saveOnTheWayTemplateDraftFromForm(makeFormData(bodyWithoutStop)),
    ).rejects.toThrow(/REDIRECT:.*draft_validation_warning/);
  });

  it("never sets current_version_id or sandbox_version_id on update", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const versionUpdates: unknown[] = [];
    const admin = {
      from(table: string) {
        if (table === "sms_message_templates") {
          const q: any = {
            select: vi.fn(() => q), insert: vi.fn((payload: unknown) => q),
            eq: vi.fn(() => q), maybeSingle: vi.fn(async () => ({ data: { id: "t1" }, error: null })),
            single: vi.fn(async () => ({ data: { id: "t1" }, error: null })),
          };
          return q;
        }
        if (table === "sms_message_template_versions") {
          let updatePayload: unknown = null;
          const q: any = {
            select: vi.fn(() => q), insert: vi.fn(async () => ({ error: null })),
            update: vi.fn((p: unknown) => { updatePayload = p; return q; }),
            eq: vi.fn(() => q), order: vi.fn(() => q), limit: vi.fn(() => q),
            maybeSingle: vi.fn(async () => ({
              data: { id: "v1", version_number: 1, version_status: "draft" },
              error: null,
            })),
            then: (resolve: (v: { error: unknown }) => void) => {
              versionUpdates.push(updatePayload);
              resolve({ error: null });
            },
          };
          return q;
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      saveOnTheWayTemplateDraftFromForm(makeFormData(VALID_BODY)),
    ).rejects.toThrow(/REDIRECT:/);

    const update = versionUpdates[0] as any;
    expect(update.current_version_id).toBeUndefined();
    expect(update.sandbox_version_id).toBeUndefined();
  });

  it("scopes account_owner_user_id from auth context, not from form input", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-from-auth", role: "admin" },
    });

    const versionInserts: unknown[] = [];
    const admin = {
      from(table: string) {
        if (table === "sms_message_templates") {
          const q: any = {
            select: vi.fn(() => q), insert: vi.fn((payload: unknown) => q),
            eq: vi.fn(() => q), maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            single: vi.fn(async () => ({ data: { id: "t1" }, error: null })),
          };
          return q;
        }
        if (table === "sms_message_template_versions") {
          const q: any = {
            select: vi.fn(() => q), insert: vi.fn(async (p: unknown) => { versionInserts.push(p); return { error: null }; }),
            update: vi.fn(() => q), eq: vi.fn(() => q), order: vi.fn(() => q), limit: vi.fn(() => q),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          };
          return q;
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };
    createAdminClientMock.mockReturnValue(admin);

    // Attempt to pass a different account owner via form
    const fd = new FormData();
    fd.set("body_template", VALID_BODY);
    fd.set("account_owner_user_id", "attacker-owner"); // must be ignored

    await expect(
      saveOnTheWayTemplateDraftFromForm(fd),
    ).rejects.toThrow(/REDIRECT:/);

    const inserted = versionInserts[0] as any;
    expect(inserted.account_owner_user_id).toBe("owner-from-auth");
    expect(inserted.account_owner_user_id).not.toBe("attacker-owner");
  });

  it("revalidates /ops/admin/communications on success", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const versionUpdates: unknown[] = [];
    const admin = {
      from(table: string) {
        if (table === "sms_message_templates") {
          const q: any = {
            select: vi.fn(() => q), insert: vi.fn((payload: unknown) => q),
            eq: vi.fn(() => q), maybeSingle: vi.fn(async () => ({ data: { id: "t1" }, error: null })),
            single: vi.fn(async () => ({ data: { id: "t1" }, error: null })),
          };
          return q;
        }
        if (table === "sms_message_template_versions") {
          let updatePayload: unknown = null;
          const q: any = {
            select: vi.fn(() => q), insert: vi.fn(async () => ({ error: null })),
            update: vi.fn((p: unknown) => { updatePayload = p; return q; }),
            eq: vi.fn(() => q), order: vi.fn(() => q), limit: vi.fn(() => q),
            maybeSingle: vi.fn(async () => ({
              data: { id: "v1", version_number: 1, version_status: "draft" },
              error: null,
            })),
            then: (resolve: (v: { error: unknown }) => void) => {
              versionUpdates.push(updatePayload);
              resolve({ error: null });
            },
          };
          return q;
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      saveOnTheWayTemplateDraftFromForm(makeFormData(VALID_BODY)),
    ).rejects.toThrow(/REDIRECT:/);

    expect(revalidatePathMock).toHaveBeenCalledWith("/ops/admin/communications");
  });
});

// ---------------------------------------------------------------------------
// F4D-D review actions
// ---------------------------------------------------------------------------

describe("F4D-D review actions", () => {
  const VALID_REVIEW_BODY =
    "Hi {{recipient_first_name}}, this is {{operator_or_tech_name}} with {{company_name}}. I am on the way to {{appointment_or_job_context}}. Reply STOP to opt out.";

  type VersionReadRow = {
    id: string;
    sms_message_template_id: string;
    body_template: string;
    version_number: number;
    version_status: string;
    internal_review_status?: string;
  };

  function buildReviewAdminMock(options: {
    targetVersion?: VersionReadRow | null;
    latestVersion?: { id: string; version_number: number; version_status: string } | null;
    versionReadError?: boolean;
    latestReadError?: boolean;
    versionUpdateError?: boolean;
    templateUpdateError?: boolean;
  }) {
    const tableCalls: string[] = [];
    const versionReads: Array<Array<[string, unknown]>> = [];
    const latestReads: Array<Array<[string, unknown]>> = [];
    const versionUpdates: Array<{ payload: any; filters: Array<[string, unknown]> }> = [];
    const templateUpdates: Array<{ payload: any; filters: Array<[string, unknown]> }> = [];

    const admin = {
      from(table: string) {
        tableCalls.push(table);

        if (table === "sms_message_template_versions") {
          let filters: Array<[string, unknown]> = [];
          let isLatestLookup = false;
          let updatePayload: unknown = null;

          const q: any = {
            select: vi.fn(() => q),
            update: vi.fn((payload: unknown) => {
              updatePayload = payload;
              return q;
            }),
            eq: vi.fn((col: string, val: unknown) => {
              filters.push([col, val]);
              return q;
            }),
            order: vi.fn(() => {
              isLatestLookup = true;
              return q;
            }),
            limit: vi.fn(() => {
              isLatestLookup = true;
              return q;
            }),
            maybeSingle: vi.fn(async () => {
              if (isLatestLookup) {
                latestReads.push([...filters]);
                if (options.latestReadError) return { data: null, error: new Error("latest_read_error") };
                return { data: options.latestVersion ?? null, error: null };
              }

              versionReads.push([...filters]);
              if (options.versionReadError) return { data: null, error: new Error("version_read_error") };
              return { data: options.targetVersion ?? null, error: null };
            }),
            then: (resolve: (v: { error: unknown }) => void) => {
              versionUpdates.push({ payload: updatePayload, filters: [...filters] });
              if (options.versionUpdateError) {
                resolve({ error: new Error("version_update_error") });
              } else {
                resolve({ error: null });
              }
            },
          };

          return q;
        }

        if (table === "sms_message_templates") {
          let filters: Array<[string, unknown]> = [];
          let updatePayload: unknown = null;

          const q: any = {
            update: vi.fn((payload: unknown) => {
              updatePayload = payload;
              return q;
            }),
            eq: vi.fn((col: string, val: unknown) => {
              filters.push([col, val]);
              return q;
            }),
            then: (resolve: (v: { error: unknown }) => void) => {
              templateUpdates.push({ payload: updatePayload, filters: [...filters] });
              if (options.templateUpdateError) {
                resolve({ error: new Error("template_update_error") });
              } else {
                resolve({ error: null });
              }
            },
          };

          return q;
        }

        throw new Error(`Unexpected table in review mock: ${table}`);
      },
    };

    return {
      admin,
      tableCalls,
      versionReads,
      latestReads,
      versionUpdates,
      templateUpdates,
    };
  }

  function formWithVersionId(versionId = "v1") {
    const fd = new FormData();
    fd.set("version_id", versionId);
    return fd;
  }

  function rejectForm(versionId: string, reason: string) {
    const fd = new FormData();
    fd.set("version_id", versionId);
    fd.set("rejected_reason", reason);
    return fd;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockResolvedValue({});
  });

  it("non-admin blocked for submit", async () => {
    requireInternalRoleMock.mockRejectedValue(new Error("INTERNAL_ROLE_REQUIRED"));

    await expect(
      submitOnTheWayTemplateVersionForReviewFromForm(formWithVersionId()),
    ).rejects.toThrow(/REDIRECT:.*admin_required/);
  });

  it("non-admin blocked for approve sandbox", async () => {
    requireInternalRoleMock.mockRejectedValue(new Error("INTERNAL_ROLE_REQUIRED"));

    await expect(
      approveOnTheWayTemplateVersionForSandboxFromForm(formWithVersionId()),
    ).rejects.toThrow(/REDIRECT:.*admin_required/);
  });

  it("non-admin blocked for reject", async () => {
    requireInternalRoleMock.mockRejectedValue(new Error("INTERNAL_ROLE_REQUIRED"));

    await expect(
      rejectOnTheWayTemplateVersionFromForm(rejectForm("v1", "Needs revision")),
    ).rejects.toThrow(/REDIRECT:.*admin_required/);
  });

  it("submit draft for review succeeds", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const { admin, versionUpdates, templateUpdates } = buildReviewAdminMock({
      targetVersion: {
        id: "v1",
        sms_message_template_id: "t1",
        body_template: VALID_REVIEW_BODY,
        version_number: 1,
        version_status: "draft",
        internal_review_status: "not_requested",
      },
      latestVersion: { id: "v1", version_number: 1, version_status: "draft" },
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      submitOnTheWayTemplateVersionForReviewFromForm(formWithVersionId("v1")),
    ).rejects.toThrow(/REDIRECT:.*template_submitted_for_review/);

    expect(versionUpdates).toHaveLength(1);
    expect(templateUpdates).toHaveLength(0);
    expect(versionUpdates[0].payload.version_status).toBe("pending_review");
    expect(versionUpdates[0].payload.internal_review_status).toBe("pending");
  });

  it("submit non-draft blocked", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const { admin } = buildReviewAdminMock({
      targetVersion: {
        id: "v1",
        sms_message_template_id: "t1",
        body_template: VALID_REVIEW_BODY,
        version_number: 1,
        version_status: "pending_review",
        internal_review_status: "pending",
      },
      latestVersion: { id: "v1", version_number: 1, version_status: "pending_review" },
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      submitOnTheWayTemplateVersionForReviewFromForm(formWithVersionId("v1")),
    ).rejects.toThrow(/REDIRECT:.*template_review_invalid_status/);
  });

  it("submit invalid body blocked", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const { admin } = buildReviewAdminMock({
      targetVersion: {
        id: "v1",
        sms_message_template_id: "t1",
        body_template: "Hi {{recipient_first_name}}, this is {{company_name}}.",
        version_number: 1,
        version_status: "draft",
        internal_review_status: "not_requested",
      },
      latestVersion: { id: "v1", version_number: 1, version_status: "draft" },
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      submitOnTheWayTemplateVersionForReviewFromForm(formWithVersionId("v1")),
    ).rejects.toThrow(/REDIRECT:.*template_review_validation_failed/);
  });

  it("submit stale/non-latest draft blocked", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const { admin } = buildReviewAdminMock({
      targetVersion: {
        id: "v1",
        sms_message_template_id: "t1",
        body_template: VALID_REVIEW_BODY,
        version_number: 1,
        version_status: "draft",
        internal_review_status: "not_requested",
      },
      latestVersion: { id: "v2", version_number: 2, version_status: "draft" },
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      submitOnTheWayTemplateVersionForReviewFromForm(formWithVersionId("v1")),
    ).rejects.toThrow(/REDIRECT:.*template_review_stale_version/);
  });

  it("approve pending review for sandbox succeeds", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const { admin, versionUpdates, templateUpdates } = buildReviewAdminMock({
      targetVersion: {
        id: "v2",
        sms_message_template_id: "t1",
        body_template: VALID_REVIEW_BODY,
        version_number: 2,
        version_status: "pending_review",
        internal_review_status: "pending",
      },
      latestVersion: { id: "v2", version_number: 2, version_status: "pending_review" },
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      approveOnTheWayTemplateVersionForSandboxFromForm(formWithVersionId("v2")),
    ).rejects.toThrow(/REDIRECT:.*template_approved_for_sandbox/);

    expect(versionUpdates).toHaveLength(1);
    expect(templateUpdates).toHaveLength(1);
    expect(versionUpdates[0].payload.version_status).toBe("approved_for_sandbox");
    expect(versionUpdates[0].payload.internal_review_status).toBe("approved");
    expect(versionUpdates[0].payload.approved_by_user_id).toBe("admin-1");
    expect(typeof versionUpdates[0].payload.approved_at).toBe("string");
  });

  it("approve from draft blocked", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const { admin } = buildReviewAdminMock({
      targetVersion: {
        id: "v2",
        sms_message_template_id: "t1",
        body_template: VALID_REVIEW_BODY,
        version_number: 2,
        version_status: "draft",
        internal_review_status: "not_requested",
      },
      latestVersion: { id: "v2", version_number: 2, version_status: "draft" },
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      approveOnTheWayTemplateVersionForSandboxFromForm(formWithVersionId("v2")),
    ).rejects.toThrow(/REDIRECT:.*template_review_invalid_status/);
  });

  it("approve invalid body blocked", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const { admin } = buildReviewAdminMock({
      targetVersion: {
        id: "v2",
        sms_message_template_id: "t1",
        body_template: "Hi {{recipient_first_name}}, this is {{company_name}}.",
        version_number: 2,
        version_status: "pending_review",
        internal_review_status: "pending",
      },
      latestVersion: { id: "v2", version_number: 2, version_status: "pending_review" },
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      approveOnTheWayTemplateVersionForSandboxFromForm(formWithVersionId("v2")),
    ).rejects.toThrow(/REDIRECT:.*template_review_validation_failed/);
  });

  it("approve does not set current_version_id", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const { admin, versionUpdates, templateUpdates } = buildReviewAdminMock({
      targetVersion: {
        id: "v3",
        sms_message_template_id: "t1",
        body_template: VALID_REVIEW_BODY,
        version_number: 3,
        version_status: "pending_review",
        internal_review_status: "pending",
      },
      latestVersion: { id: "v3", version_number: 3, version_status: "pending_review" },
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      approveOnTheWayTemplateVersionForSandboxFromForm(formWithVersionId("v3")),
    ).rejects.toThrow(/REDIRECT:.*template_approved_for_sandbox/);

    expect(versionUpdates[0].payload.current_version_id).toBeUndefined();
    expect(templateUpdates[0].payload.current_version_id).toBeUndefined();
  });

  it("approve sets only sandbox_version_id on parent", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const { admin, templateUpdates } = buildReviewAdminMock({
      targetVersion: {
        id: "v4",
        sms_message_template_id: "t1",
        body_template: VALID_REVIEW_BODY,
        version_number: 4,
        version_status: "pending_review",
        internal_review_status: "pending",
      },
      latestVersion: { id: "v4", version_number: 4, version_status: "pending_review" },
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      approveOnTheWayTemplateVersionForSandboxFromForm(formWithVersionId("v4")),
    ).rejects.toThrow(/REDIRECT:.*template_approved_for_sandbox/);

    expect(templateUpdates).toHaveLength(1);
    expect(templateUpdates[0].payload.sandbox_version_id).toBe("v4");
    expect(templateUpdates[0].payload.lifecycle_status).toBeUndefined();
  });

  it("approve stale/non-latest pending version blocked", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const { admin } = buildReviewAdminMock({
      targetVersion: {
        id: "v2",
        sms_message_template_id: "t1",
        body_template: VALID_REVIEW_BODY,
        version_number: 2,
        version_status: "pending_review",
        internal_review_status: "pending",
      },
      latestVersion: { id: "v3", version_number: 3, version_status: "pending_review" },
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      approveOnTheWayTemplateVersionForSandboxFromForm(formWithVersionId("v2")),
    ).rejects.toThrow(/REDIRECT:.*template_review_stale_version/);
  });

  it("reject pending review succeeds with reason", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const { admin, versionUpdates, templateUpdates } = buildReviewAdminMock({
      targetVersion: {
        id: "v5",
        sms_message_template_id: "t1",
        body_template: VALID_REVIEW_BODY,
        version_number: 5,
        version_status: "pending_review",
        internal_review_status: "pending",
      },
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      rejectOnTheWayTemplateVersionFromForm(rejectForm("v5", " Needs token cleanup. ")),
    ).rejects.toThrow(/REDIRECT:.*template_rejected/);

    expect(versionUpdates).toHaveLength(1);
    expect(templateUpdates).toHaveLength(0);
    expect(versionUpdates[0].payload.version_status).toBe("rejected");
    expect(versionUpdates[0].payload.internal_review_status).toBe("rejected");
    expect(versionUpdates[0].payload.rejected_reason).toBe("Needs token cleanup.");
  });

  it("reject blank reason blocked", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const { admin } = buildReviewAdminMock({
      targetVersion: {
        id: "v5",
        sms_message_template_id: "t1",
        body_template: VALID_REVIEW_BODY,
        version_number: 5,
        version_status: "pending_review",
        internal_review_status: "pending",
      },
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      rejectOnTheWayTemplateVersionFromForm(rejectForm("v5", "   ")),
    ).rejects.toThrow(/REDIRECT:.*template_reject_reason_required/);
  });

  it("reject approved/sandbox/current-ish version blocked", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const blockedStatuses = [
      "approved_for_sandbox",
      "active",
      "superseded",
      "retired",
      "approved_for_activation",
    ];

    for (const status of blockedStatuses) {
      const { admin } = buildReviewAdminMock({
        targetVersion: {
          id: "v6",
          sms_message_template_id: "t1",
          body_template: VALID_REVIEW_BODY,
          version_number: 6,
          version_status: status,
          internal_review_status: "approved",
        },
      });
      createAdminClientMock.mockReturnValue(admin);

      await expect(
        rejectOnTheWayTemplateVersionFromForm(rejectForm("v6", "Not allowed")),
      ).rejects.toThrow(/REDIRECT:.*template_review_invalid_status/);
    }
  });

  it("reject reason bounded to 500 chars", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const { admin, versionUpdates } = buildReviewAdminMock({
      targetVersion: {
        id: "v7",
        sms_message_template_id: "t1",
        body_template: VALID_REVIEW_BODY,
        version_number: 7,
        version_status: "pending_review",
        internal_review_status: "pending",
      },
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      rejectOnTheWayTemplateVersionFromForm(rejectForm("v7", "a".repeat(600))),
    ).rejects.toThrow(/REDIRECT:.*template_rejected/);

    expect(versionUpdates[0].payload.rejected_reason).toHaveLength(500);
  });

  it("all actions scope lookups and writes by account_owner_user_id", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-88",
      internalUser: { account_owner_user_id: "owner-88", role: "admin" },
    });

    const submitMock = buildReviewAdminMock({
      targetVersion: {
        id: "vs",
        sms_message_template_id: "ts",
        body_template: VALID_REVIEW_BODY,
        version_number: 1,
        version_status: "draft",
        internal_review_status: "not_requested",
      },
      latestVersion: { id: "vs", version_number: 1, version_status: "draft" },
    });
    createAdminClientMock.mockReturnValue(submitMock.admin);
    await expect(
      submitOnTheWayTemplateVersionForReviewFromForm(formWithVersionId("vs")),
    ).rejects.toThrow(/REDIRECT:.*template_submitted_for_review/);

    expect(submitMock.versionReads[0]).toContainEqual(["account_owner_user_id", "owner-88"]);
    expect(submitMock.versionUpdates[0].filters).toContainEqual(["account_owner_user_id", "owner-88"]);

    const approveMock = buildReviewAdminMock({
      targetVersion: {
        id: "va",
        sms_message_template_id: "ta",
        body_template: VALID_REVIEW_BODY,
        version_number: 2,
        version_status: "pending_review",
        internal_review_status: "pending",
      },
      latestVersion: { id: "va", version_number: 2, version_status: "pending_review" },
    });
    createAdminClientMock.mockReturnValue(approveMock.admin);
    await expect(
      approveOnTheWayTemplateVersionForSandboxFromForm(formWithVersionId("va")),
    ).rejects.toThrow(/REDIRECT:.*template_approved_for_sandbox/);

    expect(approveMock.versionReads[0]).toContainEqual(["account_owner_user_id", "owner-88"]);
    expect(approveMock.versionUpdates[0].filters).toContainEqual(["account_owner_user_id", "owner-88"]);
    expect(approveMock.templateUpdates[0].filters).toContainEqual(["account_owner_user_id", "owner-88"]);

    const rejectMock = buildReviewAdminMock({
      targetVersion: {
        id: "vr",
        sms_message_template_id: "tr",
        body_template: VALID_REVIEW_BODY,
        version_number: 3,
        version_status: "pending_review",
        internal_review_status: "pending",
      },
    });
    createAdminClientMock.mockReturnValue(rejectMock.admin);
    await expect(
      rejectOnTheWayTemplateVersionFromForm(rejectForm("vr", "Needs legal review later")),
    ).rejects.toThrow(/REDIRECT:.*template_rejected/);

    expect(rejectMock.versionReads[0]).toContainEqual(["account_owner_user_id", "owner-88"]);
    expect(rejectMock.versionUpdates[0].filters).toContainEqual(["account_owner_user_id", "owner-88"]);
  });

  it("all successful actions call revalidatePath('/ops/admin/communications')", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    createAdminClientMock.mockReturnValue(
      buildReviewAdminMock({
        targetVersion: {
          id: "v10",
          sms_message_template_id: "t1",
          body_template: VALID_REVIEW_BODY,
          version_number: 10,
          version_status: "draft",
          internal_review_status: "not_requested",
        },
        latestVersion: { id: "v10", version_number: 10, version_status: "draft" },
      }).admin,
    );
    await expect(
      submitOnTheWayTemplateVersionForReviewFromForm(formWithVersionId("v10")),
    ).rejects.toThrow(/REDIRECT:.*template_submitted_for_review/);

    createAdminClientMock.mockReturnValue(
      buildReviewAdminMock({
        targetVersion: {
          id: "v11",
          sms_message_template_id: "t1",
          body_template: VALID_REVIEW_BODY,
          version_number: 11,
          version_status: "pending_review",
          internal_review_status: "pending",
        },
        latestVersion: { id: "v11", version_number: 11, version_status: "pending_review" },
      }).admin,
    );
    await expect(
      approveOnTheWayTemplateVersionForSandboxFromForm(formWithVersionId("v11")),
    ).rejects.toThrow(/REDIRECT:.*template_approved_for_sandbox/);

    createAdminClientMock.mockReturnValue(
      buildReviewAdminMock({
        targetVersion: {
          id: "v12",
          sms_message_template_id: "t1",
          body_template: VALID_REVIEW_BODY,
          version_number: 12,
          version_status: "pending_review",
          internal_review_status: "pending",
        },
      }).admin,
    );
    await expect(
      rejectOnTheWayTemplateVersionFromForm(rejectForm("v12", "needs corrections")),
    ).rejects.toThrow(/REDIRECT:.*template_rejected/);

    expect(revalidatePathMock).toHaveBeenCalledWith("/ops/admin/communications");
  });

  it("no provider/send/webhook calls exist in review actions", async () => {
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { account_owner_user_id: "owner-1", role: "admin" },
    });

    const submitMock = buildReviewAdminMock({
      targetVersion: {
        id: "vx",
        sms_message_template_id: "tx",
        body_template: VALID_REVIEW_BODY,
        version_number: 1,
        version_status: "draft",
        internal_review_status: "not_requested",
      },
      latestVersion: { id: "vx", version_number: 1, version_status: "draft" },
    });
    createAdminClientMock.mockReturnValue(submitMock.admin);
    await expect(
      submitOnTheWayTemplateVersionForReviewFromForm(formWithVersionId("vx")),
    ).rejects.toThrow(/REDIRECT:.*template_submitted_for_review/);

    const approveMock = buildReviewAdminMock({
      targetVersion: {
        id: "vy",
        sms_message_template_id: "ty",
        body_template: VALID_REVIEW_BODY,
        version_number: 2,
        version_status: "pending_review",
        internal_review_status: "pending",
      },
      latestVersion: { id: "vy", version_number: 2, version_status: "pending_review" },
    });
    createAdminClientMock.mockReturnValue(approveMock.admin);
    await expect(
      approveOnTheWayTemplateVersionForSandboxFromForm(formWithVersionId("vy")),
    ).rejects.toThrow(/REDIRECT:.*template_approved_for_sandbox/);

    const rejectMock = buildReviewAdminMock({
      targetVersion: {
        id: "vz",
        sms_message_template_id: "tz",
        body_template: VALID_REVIEW_BODY,
        version_number: 3,
        version_status: "pending_review",
        internal_review_status: "pending",
      },
    });
    createAdminClientMock.mockReturnValue(rejectMock.admin);
    await expect(
      rejectOnTheWayTemplateVersionFromForm(rejectForm("vz", "bad content")),
    ).rejects.toThrow(/REDIRECT:.*template_rejected/);

    expect(submitMock.tableCalls.every((name) => name.startsWith("sms_message_template"))).toBe(true);
    expect(approveMock.tableCalls.every((name) => name.startsWith("sms_message_template"))).toBe(true);
    expect(rejectMock.tableCalls.every((name) => name.startsWith("sms_message_template"))).toBe(true);
  });
});
