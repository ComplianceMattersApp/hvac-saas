import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const resolveEntitlementMock = vi.fn();
const isMaintenanceAgreementsEnabledMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
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
        select: vi.fn(() => ({
          eq: vi.fn((column: string, value: unknown) => {
            const id = column === "id" ? String(value ?? "") : "";
            return {
              eq: vi.fn((innerColumn: string, innerValue: unknown) => {
                const owner = innerColumn === "account_owner_user_id" ? String(innerValue ?? "") : "";
                return {
                  maybeSingle: vi.fn(async () => {
                    if (id === "tpl-already-archived" && owner === "owner-1") {
                      return { data: { id: "tpl-already-archived" }, error: null };
                    }
                    return { data: null, error: null };
                  }),
                };
              }),
            };
          }),
        })),
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
} = await import("@/lib/maintenance-agreements/template-actions");

describe("maintenance agreement template actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    isMaintenanceAgreementsEnabledMock.mockReturnValue(true);
    requireInternalUserMock.mockResolvedValue({
      userId: "user-1",
      internalUser: {
        user_id: "user-1",
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
});
