import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const revalidatePathMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  refresh: (...args: unknown[]) => refreshMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  requireInternalRole: (...args: unknown[]) => requireInternalRoleMock(...args),
  isInternalAccessError: vi.fn(() => false),
}));

vi.mock("@/lib/auth/internal-job-scope", () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) =>
    loadScopedInternalJobForMutationMock(...args),
  loadScopedInternalServiceCaseForMutation: vi.fn(),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("@/lib/actions/job-evaluator", () => ({
  evaluateJobOpsStatus: vi.fn(async () => undefined),
  healStalePaperworkOpsStatus: vi.fn(async () => true),
}));

vi.mock("@/lib/actions/ecc-status", () => ({
  evaluateEccOpsStatus: vi.fn(async () => undefined),
}));

vi.mock("@/lib/actions/ops-status", () => ({
  forceSetOpsStatus: vi.fn(async () => undefined),
}));

vi.mock("@/lib/actions/job-ops-actions", () => ({
  releasePendingInfoAndRecompute: vi.fn(async () => null),
}));

vi.mock("@/lib/actions/job-event-meta", () => ({
  buildMovementEventMeta: vi.fn(() => ({})),
  buildStaffingSnapshotMeta: vi.fn(() => ({})),
}));

vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

type TargetAction =
  | "createNextServiceVisitFromForm"
  | "createRetestJobFromForm"
  | "archiveJobFromForm"
  | "cancelJobFromForm";

function buildCreateNextServiceVisitFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("next_visit_reason", "Return for compressor diagnosis");
  formData.set("tab", "ops");
  formData.set("return_to", "/jobs/job-1?tab=ops");
  return formData;
}

function buildCreateRetestFormData() {
  const formData = new FormData();
  formData.set("parent_job_id", "job-1");
  return formData;
}

function buildArchiveFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  return formData;
}

function buildCancelFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  return formData;
}

const targets: Array<{ name: TargetAction; buildFormData: () => FormData }> = [
  {
    name: "createNextServiceVisitFromForm",
    buildFormData: buildCreateNextServiceVisitFormData,
  },
  {
    name: "createRetestJobFromForm",
    buildFormData: buildCreateRetestFormData,
  },
  {
    name: "archiveJobFromForm",
    buildFormData: buildArchiveFormData,
  },
  {
    name: "cancelJobFromForm",
    buildFormData: buildCancelFormData,
  },
];

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

async function invokeAction(actionName: TargetAction, formData: FormData) {
  const mod = await import("@/lib/actions/job-actions");
  return (mod as Record<TargetAction, (fd: FormData) => Promise<unknown>>)[actionName](formData);
}

describe("job-detail operational entitlement hardening", () => {
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

    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-user-1",
      internalUser: {
        user_id: "admin-user-1",
        role: "admin",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  for (const { name, buildFormData } of targets) {
    it(`${name}: allows active entitlement`, async () => {
      const { supabase, fromCalls } = makeAllowSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);

      await expect(invokeAction(name, buildFormData())).rejects.toThrow("ALLOW_PATH_REACHED");

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );
      expect(fromCalls.length).toBeGreaterThan(0);
    });

    it(`${name}: allows valid trial entitlement`, async () => {
      const { supabase, fromCalls } = makeAllowSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
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
