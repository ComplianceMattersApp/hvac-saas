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
