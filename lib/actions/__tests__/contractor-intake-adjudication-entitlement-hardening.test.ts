import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const isInternalAccessErrorMock = vi.fn();
const createJobMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const revalidatePathMock = vi.fn();

const ALLOW_PATH_REACHED = "ALLOW_PATH_REACHED";

type TargetAction =
  | "finalizeContractorIntakeSubmissionFromForm"
  | "rejectContractorIntakeSubmissionFromForm"
  | "markContractorIntakeSubmissionAsDuplicateFromForm";

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
  isInternalAccessError: (...args: unknown[]) => isInternalAccessErrorMock(...args),
}));

vi.mock("@/lib/actions/job-actions", () => ({
  createJob: (...args: unknown[]) => createJobMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

function buildFinalizeFormData() {
  const formData = new FormData();
  formData.set("submission_id", "11111111-1111-4111-8111-111111111111");
  formData.set("finalization_mode", "existing_existing");
  formData.set("existing_customer_id", "22222222-2222-4222-8222-222222222222");
  formData.set("existing_location_id", "33333333-3333-4333-8333-333333333333");
  return formData;
}

function buildRejectFormData() {
  const formData = new FormData();
  formData.set("submission_id", "11111111-1111-4111-8111-111111111111");
  return formData;
}

function buildDuplicateFormData() {
  const formData = new FormData();
  formData.set("submission_id", "11111111-1111-4111-8111-111111111111");
  formData.set("duplicate_job_id", "44444444-4444-4444-8444-444444444444");
  return formData;
}

const targets: Array<{ name: TargetAction; buildFormData: () => FormData }> = [
  {
    name: "finalizeContractorIntakeSubmissionFromForm",
    buildFormData: buildFinalizeFormData,
  },
  {
    name: "rejectContractorIntakeSubmissionFromForm",
    buildFormData: buildRejectFormData,
  },
  {
    name: "markContractorIntakeSubmissionAsDuplicateFromForm",
    buildFormData: buildDuplicateFormData,
  },
];

function makeAllowAdminFixture() {
  const fromCalls: string[] = [];

  const admin = {
    from(table: string) {
      fromCalls.push(table);

      if (table === "contractor_intake_submissions") {
        const selectQuery: any = {
          eq: vi.fn((column: string) => {
            if (column === "id" || column === "account_owner_user_id") {
              return selectQuery;
            }
            return selectQuery;
          }),
          maybeSingle: vi.fn(async () => ({
            data: {
              id: "11111111-1111-4111-8111-111111111111",
              account_owner_user_id: "owner-1",
              submitted_by_user_id: "contractor-user-1",
              contractor_id: "contractor-1",
              proposed_customer_first_name: "Pat",
              proposed_customer_last_name: "Tester",
              proposed_customer_phone: "555-0101",
              proposed_customer_email: "pat@example.com",
              proposed_address_line1: "123 Main St",
              proposed_city: "Pasadena",
              proposed_state: "CA",
              proposed_zip: "91101",
              proposed_location_nickname: null,
              proposed_job_type: "ecc",
              proposed_project_type: "alteration",
              proposed_title: "Ready for testing",
              proposed_job_notes: "Ready for testing",
              proposed_permit_number: null,
              proposed_jurisdiction: null,
              proposed_permit_date: null,
              review_status: "pending",
            },
            error: null,
          })),
        };

        const updateQuery: any = {
          eq: vi.fn(() => updateQuery),
          then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
            return Promise.reject(new Error(ALLOW_PATH_REACHED)).then(onFulfilled, onRejected);
          },
        };

        return {
          select: vi.fn(() => selectQuery),
          update: vi.fn(() => updateQuery),
        };
      }

      throw new Error(ALLOW_PATH_REACHED);
    },
  };

  return { admin, fromCalls };
}

function makeBlockedAdminFixture() {
  const fromCalls: string[] = [];

  const admin = {
    from(table: string) {
      fromCalls.push(table);

      if (table === "contractor_intake_submissions") {
        const selectQuery: any = {
          eq: vi.fn((column: string) => {
            if (column === "id" || column === "account_owner_user_id") {
              return selectQuery;
            }
            return selectQuery;
          }),
          maybeSingle: vi.fn(async () => ({
            data: {
              id: "11111111-1111-4111-8111-111111111111",
              account_owner_user_id: "owner-1",
              submitted_by_user_id: "contractor-user-1",
              contractor_id: "contractor-1",
              proposed_customer_first_name: "Pat",
              proposed_customer_last_name: "Tester",
              proposed_customer_phone: "555-0101",
              proposed_customer_email: "pat@example.com",
              proposed_address_line1: "123 Main St",
              proposed_city: "Pasadena",
              proposed_state: "CA",
              proposed_zip: "91101",
              proposed_location_nickname: null,
              proposed_job_type: "ecc",
              proposed_project_type: "alteration",
              proposed_title: "Ready for testing",
              proposed_job_notes: "Ready for testing",
              proposed_permit_number: null,
              proposed_jurisdiction: null,
              proposed_permit_date: null,
              review_status: "pending",
            },
            error: null,
          })),
        };

        const updateQuery: any = {
          eq: vi.fn(() => updateQuery),
          then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
            return Promise.reject(new Error("UNEXPECTED_WRITE")).then(onFulfilled, onRejected);
          },
        };

        return {
          select: vi.fn(() => selectQuery),
          update: vi.fn(() => updateQuery),
        };
      }

      throw new Error(`UNEXPECTED_FROM:${table}`);
    },
  };

  return { admin, fromCalls };
}

async function invokeAction(actionName: TargetAction, formData: FormData) {
  const mod = await import("@/lib/actions/contractor-intake-actions");
  return (mod as Record<TargetAction, (fd: FormData) => Promise<unknown>>)[actionName](formData);
}

describe("contractor intake adjudication entitlement hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "internal-user-1" } },
          error: null,
        })),
      },
    });

    requireInternalRoleMock.mockResolvedValue({
      internalUser: {
        user_id: "internal-user-1",
        role: "admin",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    isInternalAccessErrorMock.mockImplementation((error: unknown) => {
      return String((error as Error)?.message ?? "").includes("Active internal user required.");
    });

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  for (const { name, buildFormData } of targets) {
    it(`${name}: allows active entitlement`, async () => {
      const fixture = makeAllowAdminFixture();
      createAdminClientMock.mockReturnValue(fixture.admin);

      await expect(invokeAction(name, buildFormData())).rejects.toThrow(ALLOW_PATH_REACHED);

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );
      expect(fixture.fromCalls.length).toBeGreaterThan(1);
    });

    it(`${name}: allows valid trial entitlement`, async () => {
      const fixture = makeAllowAdminFixture();
      createAdminClientMock.mockReturnValue(fixture.admin);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_trial",
      });

      await expect(invokeAction(name, buildFormData())).rejects.toThrow(ALLOW_PATH_REACHED);
      expect(fixture.fromCalls.length).toBeGreaterThan(1);
    });

    it(`${name}: allows internal comped entitlement`, async () => {
      const fixture = makeAllowAdminFixture();
      createAdminClientMock.mockReturnValue(fixture.admin);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_internal_comped",
      });

      await expect(invokeAction(name, buildFormData())).rejects.toThrow(ALLOW_PATH_REACHED);
      expect(fixture.fromCalls.length).toBeGreaterThan(1);
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
        const fixture = makeBlockedAdminFixture();
        createAdminClientMock.mockReturnValue(fixture.admin);
        resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
          authorized: false,
          reason,
        });

        await expect(invokeAction(name, buildFormData())).rejects.toThrow(
          `REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=${reason}`,
        );

        expect(fixture.fromCalls).toEqual(["contractor_intake_submissions"]);
        expect(createJobMock).not.toHaveBeenCalled();
        expect(revalidatePathMock).not.toHaveBeenCalled();
      });
    }
  }
});
