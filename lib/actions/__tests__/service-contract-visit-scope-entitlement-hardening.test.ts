import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const loadScopedInternalServiceCaseForMutationMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const revalidatePathMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  refresh: (...args: unknown[]) => refreshMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  requireInternalRole: vi.fn(),
}));

vi.mock("@/lib/auth/internal-job-scope", () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) =>
    loadScopedInternalJobForMutationMock(...args),
  loadScopedInternalServiceCaseForMutation: (...args: unknown[]) =>
    loadScopedInternalServiceCaseForMutationMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

function makeAllowSupabaseFixture() {
  const fromCalls: string[] = [];

  const supabase = {
    from(table: string) {
      fromCalls.push(table);
      throw new Error("ALLOW_PATH_REACHED");
    },
  };

  return { supabase, fromCalls };
}

function makeBlockedSupabaseFixture() {
  const fromCalls: string[] = [];

  const supabase = {
    from(table: string) {
      fromCalls.push(table);
      throw new Error(`UNEXPECTED_FROM:${table}`);
    },
  };

  return { supabase, fromCalls };
}

type TargetAction =
  | "updateJobServiceContractFromForm"
  | "updateJobVisitScopeFromForm"
  | "promoteCompanionScopeToServiceJobFromForm";

function buildServiceContractFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("tab", "info");
  formData.set("service_visit_type", "maintenance");
  formData.set("service_visit_reason", "New reason");
  formData.set("service_visit_outcome", "resolved");
  formData.set("service_case_kind", "maintenance");
  return formData;
}

function buildVisitScopeFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("tab", "info");
  formData.set("visit_scope_summary", "New scoped summary");
  formData.set("visit_scope_items_json", "[]");
  return formData;
}

function buildPromoteCompanionFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("item_index", "0");
  formData.set("tab", "info");
  formData.set("return_to", "/jobs/job-1?tab=info");
  return formData;
}

function configureScopedReadsForAction(actionName: TargetAction) {
  if (actionName === "updateJobServiceContractFromForm") {
    loadScopedInternalJobForMutationMock.mockResolvedValue({
      id: "job-1",
      customer_id: "cust-1",
      service_case_id: "case-1",
      job_type: "service",
      service_visit_type: "diagnostic",
      service_visit_reason: "Old reason",
      service_visit_outcome: "follow_up_required",
      title: "Service Visit",
      job_notes: "Old notes",
    });

    loadScopedInternalServiceCaseForMutationMock.mockResolvedValue({
      id: "case-1",
      customer_id: "cust-1",
      case_kind: "reactive",
    });

    return;
  }

  if (actionName === "updateJobVisitScopeFromForm") {
    loadScopedInternalJobForMutationMock.mockResolvedValue({
      id: "job-1",
      job_type: "service",
      visit_scope_summary: "Old summary",
      visit_scope_items: [],
    });

    loadScopedInternalServiceCaseForMutationMock.mockResolvedValue(null);
    return;
  }

  loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
  loadScopedInternalServiceCaseForMutationMock.mockResolvedValue(null);
}

const targets: Array<{ name: TargetAction; buildFormData: () => FormData }> = [
  {
    name: "updateJobServiceContractFromForm",
    buildFormData: buildServiceContractFormData,
  },
  {
    name: "updateJobVisitScopeFromForm",
    buildFormData: buildVisitScopeFormData,
  },
  {
    name: "promoteCompanionScopeToServiceJobFromForm",
    buildFormData: buildPromoteCompanionFormData,
  },
];

async function invokeAction(actionName: TargetAction, formData: FormData) {
  const mod = await import("@/lib/actions/job-actions");
  return (mod as Record<TargetAction, (fd: FormData) => Promise<unknown>>)[actionName](formData);
}

describe("service contract / visit scope entitlement hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      userId: "internal-user-1",
      internalUser: {
        user_id: "internal-user-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  for (const { name, buildFormData } of targets) {
    it(`${name}: allows active entitlement`, async () => {
      const { supabase, fromCalls } = makeAllowSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      configureScopedReadsForAction(name);

      await expect(invokeAction(name, buildFormData())).rejects.toThrow("ALLOW_PATH_REACHED");

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );
      expect(fromCalls.length).toBeGreaterThan(0);
    });

    it(`${name}: allows valid trial entitlement`, async () => {
      const { supabase, fromCalls } = makeAllowSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      configureScopedReadsForAction(name);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_trial",
      });

      await expect(invokeAction(name, buildFormData())).rejects.toThrow("ALLOW_PATH_REACHED");

      expect(fromCalls.length).toBeGreaterThan(0);
    });

    it(`${name}: allows internal comped entitlement`, async () => {
      const { supabase, fromCalls } = makeAllowSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      configureScopedReadsForAction(name);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_internal_comped",
      });

      await expect(invokeAction(name, buildFormData())).rejects.toThrow("ALLOW_PATH_REACHED");

      expect(fromCalls.length).toBeGreaterThan(0);
    });
  }

  const blockedReasons = [
    "blocked_trial_expired",
    "blocked_trial_missing_end",
    "blocked_missing_entitlement",
  ] as const;

  for (const reason of blockedReasons) {
    for (const { name, buildFormData } of targets) {
      it(`${name}: blocks ${reason} before writes and side effects`, async () => {
        const { supabase, fromCalls } = makeBlockedSupabaseFixture();
        createClientMock.mockResolvedValue(supabase);
        configureScopedReadsForAction(name);
        resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
          authorized: false,
          reason,
        });

        await expect(invokeAction(name, buildFormData())).rejects.toThrow(
          `REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=${reason}`,
        );

        expect(fromCalls).toHaveLength(0);
        expect(revalidatePathMock).not.toHaveBeenCalled();
        expect(refreshMock).not.toHaveBeenCalled();
      });
    }
  }
});
