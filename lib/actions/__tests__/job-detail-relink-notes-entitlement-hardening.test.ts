import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const loadScopedActiveInternalContractorForMutationMock = vi.fn();
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
  loadScopedInternalServiceCaseForMutation: vi.fn(),
}));

vi.mock("@/lib/auth/internal-contractor-scope", () => ({
  loadScopedInternalContractorForMutation: vi.fn(),
  loadScopedActiveInternalContractorForMutation: (...args: unknown[]) =>
    loadScopedActiveInternalContractorForMutationMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

type TargetAction =
  | "updateJobContractorFromForm"
  | "updateJobCustomerFromForm"
  | "addPublicNoteFromForm"
  | "addInternalNoteFromForm";

function buildUpdateJobContractorFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("tab", "info");
  formData.set("contractor_id", "contractor-2");
  return formData;
}

function buildUpdateJobCustomerFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("customer_first_name", "Taylor");
  formData.set("customer_last_name", "Bennett");
  formData.set("customer_email", "taylor@example.com");
  formData.set("customer_phone", "555-0100");
  formData.set("job_notes", "Updated scoped notes");
  return formData;
}

function buildAddPublicNoteFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("note", "Customer confirmed site access.");
  formData.set("tab", "ops");
  return formData;
}

function buildAddInternalNoteFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("note", "Internal follow-up logged.");
  formData.set("tab", "ops");
  formData.set("context", "contractor_report_review");
  formData.set("anchor_event_id", "event-1");
  formData.set("anchor_event_type", "report_review_requested");
  return formData;
}

const targets: Array<{ name: TargetAction; buildFormData: () => FormData }> = [
  {
    name: "updateJobContractorFromForm",
    buildFormData: buildUpdateJobContractorFormData,
  },
  {
    name: "updateJobCustomerFromForm",
    buildFormData: buildUpdateJobCustomerFormData,
  },
  {
    name: "addPublicNoteFromForm",
    buildFormData: buildAddPublicNoteFormData,
  },
  {
    name: "addInternalNoteFromForm",
    buildFormData: buildAddInternalNoteFormData,
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

describe("job-detail relink + notes entitlement hardening", () => {
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

    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    loadScopedActiveInternalContractorForMutationMock.mockResolvedValue({ id: "contractor-2" });

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
