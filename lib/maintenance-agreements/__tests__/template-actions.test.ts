import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const resolveEntitlementMock = vi.fn();
const isMaintenanceAgreementsEnabledMock = vi.fn();
const redirectMock = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`);
});
const revalidatePathMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (to: string) => redirectMock(to),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePathMock(path),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  isInternalAccessError: (error: unknown) =>
    Boolean(error) && typeof error === "object" && (error as any).name === "InternalAccessError",
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) => resolveEntitlementMock(...args),
}));

vi.mock("@/lib/maintenance-agreements/agreement-exposure", () => ({
  isMaintenanceAgreementsEnabled: (...args: unknown[]) => isMaintenanceAgreementsEnabledMock(...args),
}));

function makeInternalAccessError(code: "AUTH_REQUIRED" | "INTERNAL_USER_REQUIRED") {
  const error = new Error(code);
  error.name = "InternalAccessError";
  (error as any).code = code;
  return error;
}

function makeSupabaseClient() {
  const insertCalls: unknown[] = [];
  const updateCalls: unknown[] = [];
  const templateRowsById: Record<string, any> = {
    "tpl-duplicate-source": {
      id: "tpl-duplicate-source",
      template_name: "Spring Plan",
      agreement_type: "maintenance",
      frequency: "quarterly",
      default_visit_scope_summary: "Seasonal tune-up",
      default_visit_scope_items: [{ title: "Inspect condenser", details: "Clean" }],
      internal_notes_default: "Source notes",
      locked_field_keys: ["agreement_name", "frequency"],
      lock_policy_version: 3,
    },
  };
  const templateNames = ["Spring Plan", "Spring Plan Copy"];

  const client = {
    from: vi.fn((table: string) => {
      if (table !== "maintenance_agreement_templates") {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        insert: vi.fn((payload: unknown) => {
          insertCalls.push(payload);
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: "tpl-1" }, error: null })),
            })),
          };
        }),
        update: vi.fn((payload: unknown) => {
          updateCalls.push(payload);

          const queryState = {
            id: "",
            owner: "",
            lifecycleNeq: "",
          };

          const select = vi.fn(() => ({
            maybeSingle: vi.fn(async () => {
              if (payload && typeof payload === "object" && "lifecycle_status" in (payload as any)) {
                if (queryState.id === "tpl-archive" && queryState.owner === "owner-1") {
                  return { data: { id: "tpl-archive" }, error: null };
                }
                if (queryState.id === "tpl-already-archived" && queryState.owner === "owner-1") {
                  return { data: null, error: null };
                }
                return { data: null, error: null };
              }

              if (queryState.id === "tpl-1" && queryState.owner === "owner-1") {
                return { data: { id: "tpl-1" }, error: null };
              }
              return { data: null, error: null };
            }),
          }));

          const neq = vi.fn((column: string, value: unknown) => {
            if (column === "lifecycle_status") {
              queryState.lifecycleNeq = String(value ?? "");
            }
            return { select };
          });

          const secondEq = vi.fn((column: string, value: unknown) => {
            if (column === "account_owner_user_id") {
              queryState.owner = String(value ?? "");
            }

            if (payload && typeof payload === "object" && "lifecycle_status" in (payload as any)) {
              return { neq };
            }

            return { select };
          });

          const firstEq = vi.fn((column: string, value: unknown) => {
            if (column === "id") {
              queryState.id = String(value ?? "");
            }
            return { eq: secondEq };
          });

          return { eq: firstEq };
        }),
        select: vi.fn((columns?: string) => {
          if ((columns ?? "").includes("template_name") && !(columns ?? "").includes("id")) {
            return {
              eq: vi.fn(() => ({
                limit: vi.fn(async () => ({
                  data: templateNames.map((template_name) => ({ template_name })),
                  error: null,
                })),
              })),
            };
          }

          return {
            eq: vi.fn((column: string, value: unknown) => {
              const id = column === "id" ? String(value ?? "") : "";
              return {
                eq: vi.fn((innerColumn: string, innerValue: unknown) => {
                  const owner = innerColumn === "account_owner_user_id" ? String(innerValue ?? "") : "";
                  return {
                    maybeSingle: vi.fn(async () => {
                      if (owner !== "owner-1") {
                        return { data: null, error: null };
                      }
                      if (templateRowsById[id]) {
                        return { data: templateRowsById[id], error: null };
                      }
                      if (id === "tpl-already-archived") {
                        return { data: { id: "tpl-already-archived" }, error: null };
                      }
                      return { data: null, error: null };
                    }),
                  };
                }),
              };
            }),
          };
        }),
      };
    }),
    _insertCalls: insertCalls,
    _updateCalls: updateCalls,
  };

  return client;
}

const {
  createMaintenanceAgreementTemplate,
  updateMaintenanceAgreementTemplate,
  archiveMaintenanceAgreementTemplate,
  duplicateMaintenanceAgreementTemplate,
  createServicePlanTemplateFromForm,
  updateServicePlanTemplateFromForm,
  archiveServicePlanTemplateFromForm,
  restoreServicePlanTemplateFromForm,
} = await import("@/lib/maintenance-agreements/template-actions");

function makeAdminClient() {
  const insertCalls: unknown[] = [];
  const updateCalls: unknown[] = [];
  const deleteCalls: unknown[] = [];

  const makeDeleteChain = (table: string) => {
    const chain: any = {
      eq: vi.fn((_col: string, _val: unknown) => {
        deleteCalls.push({ table });
        return chain;
      }),
    };
    return chain;
  };

  const client = {
    from: vi.fn((table: string) => ({
      insert: vi.fn((payload: unknown) => {
        insertCalls.push(payload);
        return {
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { id: "tpl-new" }, error: null })),
          })),
        };
      }),
      update: vi.fn((payload: unknown) => {
        updateCalls.push(payload);

        const eqChain = {
          eq: vi.fn(() => eqChain),
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => {
              const hasScope =
                (payload as any)?.updated_by_user_id === "user-1";
              return hasScope
                ? { data: { id: "tpl-1" }, error: null }
                : { data: null, error: null };
            }),
          })),
        };

        return { eq: vi.fn(() => eqChain) };
      }),
      delete: vi.fn(() => makeDeleteChain(table)),
    })),
    _insertCalls: insertCalls,
    _updateCalls: updateCalls,
    _deleteCalls: deleteCalls,
  };

  return client;
}

describe("maintenance agreement template actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    isMaintenanceAgreementsEnabledMock.mockReturnValue(true);
    requireInternalUserMock.mockResolvedValue({
      userId: "user-1",
      internalUser: {
        user_id: "user-1",
        role: "admin",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });
    resolveEntitlementMock.mockResolvedValue({ authorized: true, reason: "allowed_active" });
  });

  it("fails closed when feature flag is disabled", async () => {
    isMaintenanceAgreementsEnabledMock.mockReturnValue(false);

    const result = await createMaintenanceAgreementTemplate({
      templateName: "Spring Plan",
      agreementType: "maintenance",
      frequency: "quarterly",
    });

    expect(result).toEqual({
      success: false,
      error: "Maintenance Agreements are currently unavailable.",
    });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("requires active internal user", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockRejectedValue(makeInternalAccessError("INTERNAL_USER_REQUIRED"));

    const result = await createMaintenanceAgreementTemplate({
      templateName: "Spring Plan",
      agreementType: "maintenance",
      frequency: "quarterly",
    });

    expect(result).toEqual({
      success: false,
      error: "Active internal user required.",
    });
  });

  it("denies template create for non-admin non-owner internal roles", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockResolvedValue({
      userId: "office-1",
      internalUser: {
        user_id: "office-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    const result = await createMaintenanceAgreementTemplate({
      templateName: "Spring Plan",
      agreementType: "maintenance",
      frequency: "quarterly",
    });

    expect(result).toEqual({
      success: false,
      error: "Owner/admin internal role required for Service Plan template management.",
    });
    expect(supabase._insertCalls).toHaveLength(0);
  });

  it("denies template update for non-admin non-owner internal roles", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockResolvedValue({
      userId: "office-1",
      internalUser: {
        user_id: "office-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    const result = await updateMaintenanceAgreementTemplate({
      templateId: "tpl-1",
      templateName: "Updated Name",
      agreementType: "maintenance",
      frequency: "quarterly",
      defaultVisitScopeItemsJson: JSON.stringify([]),
      defaultVisitScopeSummary: "",
      internalNotesDefault: "",
    });

    expect(result).toEqual({
      success: false,
      error: "Owner/admin internal role required for Service Plan template management.",
    });
    expect(supabase._updateCalls).toHaveLength(0);
  });

  it("denies template duplicate for non-admin non-owner internal roles", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockResolvedValue({
      userId: "office-1",
      internalUser: {
        user_id: "office-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    const result = await duplicateMaintenanceAgreementTemplate({
      templateId: "tpl-duplicate-source",
    });

    expect(result).toEqual({
      success: false,
      error: "Owner/admin internal role required for Service Plan template management.",
    });
    expect(supabase._insertCalls).toHaveLength(0);
  });

  it("denies template archive for non-admin non-owner internal roles", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockResolvedValue({
      userId: "office-1",
      internalUser: {
        user_id: "office-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    const result = await archiveMaintenanceAgreementTemplate({ templateId: "tpl-archive" });

    expect(result).toEqual({
      success: false,
      error: "Owner/admin internal role required for Service Plan template management.",
    });
    expect(supabase._updateCalls).toHaveLength(0);
  });

  it("allows structural owner template management even when role is not admin", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockResolvedValue({
      userId: "owner-1",
      internalUser: {
        user_id: "owner-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    const result = await createMaintenanceAgreementTemplate({
      templateName: "Owner Plan",
      agreementType: "maintenance",
      frequency: "quarterly",
    });

    expect(result).toEqual({ success: true, templateId: "tpl-1" });
    expect(supabase._insertCalls).toHaveLength(1);
  });

  it("creates template with account-scoped owner and actor ids", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);

    const result = await createMaintenanceAgreementTemplate({
      templateName: "  Spring   Plan  ",
      agreementType: "service_plan",
      frequency: "annual",
      defaultVisitScopeSummary: "  Tune up  ",
      defaultVisitScopeItemsJson: JSON.stringify([
        {
          title: "  Inspect coil  ",
          details: "  Clean  ",
        },
      ]),
      internalNotesDefault: "  Office memo  ",
    });

    expect(result).toEqual({ success: true, templateId: "tpl-1" });
    expect(supabase._insertCalls).toHaveLength(1);
    expect(supabase._insertCalls[0]).toMatchObject({
      account_owner_user_id: "owner-1",
      created_by_user_id: "user-1",
      updated_by_user_id: "user-1",
      template_name: "Spring Plan",
      agreement_type: "service_plan",
      frequency: "annual",
      default_visit_scope_summary: "Tune up",
      internal_notes_default: "Office memo",
      lifecycle_status: "active",
      default_visit_scope_items: [
        {
          title: "Inspect coil",
          details: "Clean",
        },
      ],
    });
  });

  it("validates required template fields and enum values", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);

    const blankName = await createMaintenanceAgreementTemplate({
      templateName: "",
      agreementType: "maintenance",
      frequency: "quarterly",
    });
    expect(blankName).toEqual({ success: false, error: "Template name is required." });

    const invalidType = await createMaintenanceAgreementTemplate({
      templateName: "Plan",
      agreementType: "invalid",
      frequency: "quarterly",
    });
    expect(invalidType).toEqual({ success: false, error: "Agreement type is invalid." });

    const invalidFrequency = await createMaintenanceAgreementTemplate({
      templateName: "Plan",
      agreementType: "maintenance",
      frequency: "weekly",
    });
    expect(invalidFrequency).toEqual({ success: false, error: "Frequency is invalid." });
  });

  it("updates template in scoped account", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    const adminClient = makeAdminClient();
    createAdminClientMock.mockReturnValue(adminClient);

    const result = await updateMaintenanceAgreementTemplate({
      templateId: "tpl-1",
      templateName: "Updated Name",
      agreementType: "maintenance",
      frequency: "quarterly",
      defaultVisitScopeItemsJson: JSON.stringify([]),
      defaultVisitScopeSummary: "",
      internalNotesDefault: "",
    });

    expect(result).toEqual({ success: true, templateId: "tpl-1" });
    expect(supabase._updateCalls[0]).toMatchObject({
      template_name: "Updated Name",
      updated_by_user_id: "user-1",
      agreement_type: "maintenance",
      frequency: "quarterly",
    });
  });

  it("archives template by lifecycle_status update only", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);

    const archived = await archiveMaintenanceAgreementTemplate({ templateId: "tpl-archive" });
    expect(archived).toEqual({ success: true, templateId: "tpl-archive" });

    const alreadyArchived = await archiveMaintenanceAgreementTemplate({
      templateId: "tpl-already-archived",
    });
    expect(alreadyArchived).toEqual({ success: true, templateId: "tpl-already-archived" });

    expect(supabase._updateCalls).toContainEqual({
      lifecycle_status: "archived",
      updated_by_user_id: "user-1",
    });
  });

  it("duplicates template with copied lock metadata and collision-safe naming", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);

    const result = await duplicateMaintenanceAgreementTemplate({
      templateId: "tpl-duplicate-source",
    });

    expect(result).toEqual({ success: true, templateId: "tpl-1" });
    expect(supabase._insertCalls).toHaveLength(1);
    expect(supabase._insertCalls[0]).toMatchObject({
      account_owner_user_id: "owner-1",
      created_by_user_id: "user-1",
      updated_by_user_id: "user-1",
      template_name: "Spring Plan Copy 2",
      agreement_type: "maintenance",
      frequency: "quarterly",
      default_visit_scope_summary: "Seasonal tune-up",
      internal_notes_default: "Source notes",
      locked_field_keys: ["agreement_name", "frequency"],
      lock_policy_version: 3,
      lifecycle_status: "active",
    });
  });
});

describe("service plan template form actions", () => {
  let adminClient: ReturnType<typeof makeAdminClient>;

  beforeEach(() => {
    vi.clearAllMocks();

    isMaintenanceAgreementsEnabledMock.mockReturnValue(true);
    requireInternalUserMock.mockResolvedValue({
      userId: "user-1",
      internalUser: {
        user_id: "user-1",
        role: "admin",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    const authClient = makeSupabaseClient();
    createClientMock.mockResolvedValue(authClient);

    adminClient = makeAdminClient();
    createAdminClientMock.mockReturnValue(adminClient);
  });

  it("createServicePlanTemplateFromForm inserts with lifecycle_status active and redirects", async () => {
    const formData = new FormData();
    formData.set("template_name", "Spring AC Plan");
    formData.set("agreement_type", "maintenance");
    formData.set("frequency", "quarterly");
    formData.set("default_visit_scope_summary", "Seasonal tune-up");
    formData.set("default_visit_scope_items_json", JSON.stringify([{ title: "Inspect coil", details: "" }]));
    formData.set("internal_notes_default", "Office only");

    await expect(createServicePlanTemplateFromForm(formData)).rejects.toThrow("REDIRECT:");
    expect(redirectMock).toHaveBeenCalledWith(expect.stringContaining("notice=template_created"));
    expect(adminClient._insertCalls).toHaveLength(1);
    expect(adminClient._insertCalls[0]).toMatchObject({
      template_name: "Spring AC Plan",
      agreement_type: "maintenance",
      frequency: "quarterly",
      lifecycle_status: "active",
      created_by_user_id: "user-1",
      updated_by_user_id: "user-1",
      account_owner_user_id: "owner-1",
      default_visit_scope_summary: "Seasonal tune-up",
      default_visit_scope_items: [{ title: "Inspect coil", details: null }],
    });
  });

  it("createServicePlanTemplateFromForm persists default_visit_scope_items from work items json", async () => {
    const workItems = [
      { title: "Inspect coil", details: "Clean as needed", kind: "primary" },
      { title: "Replace filter", details: "", kind: "primary" },
    ];
    const formData = new FormData();
    formData.set("template_name", "AC Plan with Items");
    formData.set("agreement_type", "maintenance");
    formData.set("frequency", "annual");
    formData.set("default_visit_scope_items_json", JSON.stringify(workItems));

    await expect(createServicePlanTemplateFromForm(formData)).rejects.toThrow("REDIRECT:");
    expect(adminClient._insertCalls).toHaveLength(1);
    expect(adminClient._insertCalls[0]).toMatchObject({
      default_visit_scope_items: [
        { title: "Inspect coil", details: "Clean as needed" },
        { title: "Replace filter", details: null },
      ],
    });
  });

  it("createServicePlanTemplateFromForm rejects missing template_name", async () => {
    const formData = new FormData();
    formData.set("template_name", "");
    formData.set("agreement_type", "maintenance");
    formData.set("frequency", "quarterly");

    await expect(createServicePlanTemplateFromForm(formData)).rejects.toThrow("REDIRECT:");
    expect(redirectMock).toHaveBeenCalledWith(
      expect.stringContaining("Template%20name%20is%20required"),
    );
    expect(adminClient._insertCalls).toHaveLength(0);
  });

  it("createServicePlanTemplateFromForm rejects mismatched account scope when flag off", async () => {
    isMaintenanceAgreementsEnabledMock.mockReturnValue(false);

    const formData = new FormData();
    formData.set("template_name", "Plan");
    formData.set("agreement_type", "maintenance");
    formData.set("frequency", "quarterly");

    await expect(createServicePlanTemplateFromForm(formData)).rejects.toThrow("REDIRECT:");
    expect(redirectMock).toHaveBeenCalledWith(expect.stringContaining("error="));
    expect(adminClient._insertCalls).toHaveLength(0);
  });

  it("updateServicePlanTemplateFromForm updates allowed fields and redirects", async () => {
    const formData = new FormData();
    formData.set("template_id", "tpl-1");
    formData.set("template_name", "Updated Name");
    formData.set("default_visit_scope_summary", "Updated summary");
    formData.set("default_visit_scope_items_json", JSON.stringify([]));
    formData.set("internal_notes_default", "Updated notes");

    await expect(updateServicePlanTemplateFromForm(formData)).rejects.toThrow("REDIRECT:");
    expect(redirectMock).toHaveBeenCalledWith(expect.stringContaining("notice=template_updated"));
    expect(adminClient._updateCalls).toHaveLength(1);
    expect(adminClient._updateCalls[0]).toMatchObject({
      template_name: "Updated Name",
      updated_by_user_id: "user-1",
      default_visit_scope_summary: "Updated summary",
      default_visit_scope_items: [],
    });
    expect(adminClient._updateCalls[0]).not.toHaveProperty("frequency");
    expect(adminClient._updateCalls[0]).not.toHaveProperty("agreement_type");
  });

  it("updateServicePlanTemplateFromForm updates default_visit_scope_items correctly", async () => {
    const updatedItems = [
      { title: "Check refrigerant levels", details: "Log pressure readings", kind: "primary" },
    ];
    const formData = new FormData();
    formData.set("template_id", "tpl-1");
    formData.set("template_name", "Updated Template");
    formData.set("default_visit_scope_items_json", JSON.stringify(updatedItems));

    await expect(updateServicePlanTemplateFromForm(formData)).rejects.toThrow("REDIRECT:");
    expect(adminClient._updateCalls).toHaveLength(1);
    expect(adminClient._updateCalls[0]).toMatchObject({
      default_visit_scope_items: [{ title: "Check refrigerant levels", details: "Log pressure readings" }],
    });
  });

  it("updateServicePlanTemplateFromForm rejects attempt to change frequency with locked-field prefix", async () => {
    const formData = new FormData();
    formData.set("template_id", "tpl-1");
    formData.set("template_name", "Updated Name");
    formData.set("frequency", "annual");

    await expect(updateServicePlanTemplateFromForm(formData)).rejects.toThrow("REDIRECT:");
    expect(redirectMock).toHaveBeenCalledWith(
      expect.stringContaining("maintenance_agreement_locked_field_update_blocked"),
    );
    expect(adminClient._updateCalls).toHaveLength(0);
  });

  it("updateServicePlanTemplateFromForm rejects mismatched account scope", async () => {
    requireInternalUserMock.mockResolvedValue({
      userId: "other-user",
      internalUser: {
        user_id: "other-user",
        role: "office",
        is_active: true,
        account_owner_user_id: "other-owner",
      },
    });

    const formData = new FormData();
    formData.set("template_id", "tpl-1");
    formData.set("template_name", "Should Fail");

    await expect(updateServicePlanTemplateFromForm(formData)).rejects.toThrow("REDIRECT:");
    expect(redirectMock).toHaveBeenCalledWith(expect.stringContaining("error="));
    expect(adminClient._updateCalls).toHaveLength(0);
  });

  it("archiveServicePlanTemplateFromForm sets lifecycle_status archived", async () => {
    const formData = new FormData();
    formData.set("template_id", "tpl-1");

    await expect(archiveServicePlanTemplateFromForm(formData)).rejects.toThrow("REDIRECT:");
    expect(redirectMock).toHaveBeenCalledWith(expect.stringContaining("notice=template_archived"));
    expect(revalidatePathMock).toHaveBeenCalledWith("/ops/admin/service-plan-templates");
    expect(revalidatePathMock).toHaveBeenCalledWith("/service-plans");
    expect(adminClient._updateCalls).toHaveLength(1);
    expect(adminClient._updateCalls[0]).toMatchObject({ lifecycle_status: "archived" });
    expect(adminClient._updateCalls[0]).not.toHaveProperty("template_name");
  });

  it("restoreServicePlanTemplateFromForm sets lifecycle_status active", async () => {
    const formData = new FormData();
    formData.set("template_id", "tpl-1");

    await expect(restoreServicePlanTemplateFromForm(formData)).rejects.toThrow("REDIRECT:");
    expect(redirectMock).toHaveBeenCalledWith(expect.stringContaining("notice=template_restored"));
    expect(adminClient._updateCalls).toHaveLength(1);
    expect(adminClient._updateCalls[0]).toMatchObject({ lifecycle_status: "active" });
  });
});
