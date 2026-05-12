import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const isInternalAccessErrorMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const createJobMock = vi.fn();
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
  isInternalAccessError: (...args: unknown[]) => isInternalAccessErrorMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("@/lib/actions/job-actions", () => ({
  createJob: (...args: unknown[]) => createJobMock(...args),
}));

function buildRejectFormData() {
  const formData = new FormData();
  formData.set("submission_id", "11111111-1111-4111-8111-111111111111");
  formData.set("review_note", "Declined test proposal");
  return formData;
}

function buildThenable<T extends Record<string, unknown>>(result: T) {
  const chain: any = {
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    contains: vi.fn(() => chain),
    is: vi.fn(() => chain),
    then: (onFulfilled: (value: T) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };

  return chain;
}

function makeAdminFixture(params: {
  reviewStatus: "pending" | "rejected" | "finalized";
  submissionUpdateError?: { message: string } | null;
}) {
  const writes: Array<{ table: string; payload: Record<string, unknown> | null }> = [];

  const submissionRow = {
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
    proposed_title: "Test Proposal",
    proposed_job_notes: "notes",
    proposed_permit_number: null,
    proposed_jurisdiction: null,
    proposed_permit_date: null,
    review_status: params.reviewStatus,
    finalized_job_id: null,
  };

  const admin = {
    from(table: string) {
      if (table === "contractor_intake_submissions") {
        return {
          select: vi.fn(() => {
            const selectQuery: any = {
              eq: vi.fn(() => selectQuery),
              maybeSingle: vi.fn(async () => ({
                data: submissionRow,
                error: null,
              })),
            };
            return selectQuery;
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            writes.push({ table, payload });
            return buildThenable({ error: params.submissionUpdateError ?? null });
          }),
        };
      }

      if (table === "notifications") {
        return {
          update: vi.fn((payload: Record<string, unknown>) => {
            writes.push({ table, payload });
            return buildThenable({ error: null });
          }),
        };
      }

      throw new Error(`UNEXPECTED_TABLE:${table}`);
    },
  };

  return { admin, writes };
}

describe("contractor intake reject crash guard", () => {
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

    isInternalAccessErrorMock.mockImplementation((error: unknown) =>
      String((error as Error)?.message ?? "").includes("Active internal user required."),
    );

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  it("rejects a pending proposal and does not create a job", async () => {
    const fixture = makeAdminFixture({ reviewStatus: "pending" });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { rejectContractorIntakeSubmissionFromForm } = await import(
      "@/lib/actions/contractor-intake-actions"
    );

    await expect(rejectContractorIntakeSubmissionFromForm(buildRejectFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/contractor-intake-submissions/11111111-1111-4111-8111-111111111111?notice=rejected",
    );

    expect(createJobMock).not.toHaveBeenCalled();
    expect(
      fixture.writes.some(
        (write) =>
          write.table === "contractor_intake_submissions" &&
          write.payload?.review_status === "rejected" &&
          write.payload?.review_note === "Declined test proposal",
      ),
    ).toBe(true);
  });

  it("treats already-reviewed proposals as non-crashing idempotent reject", async () => {
    const fixture = makeAdminFixture({ reviewStatus: "rejected" });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { rejectContractorIntakeSubmissionFromForm } = await import(
      "@/lib/actions/contractor-intake-actions"
    );

    await expect(rejectContractorIntakeSubmissionFromForm(buildRejectFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/contractor-intake-submissions/11111111-1111-4111-8111-111111111111?notice=already_reviewed",
    );

    expect(createJobMock).not.toHaveBeenCalled();
    expect(fixture.writes).toHaveLength(0);
  });

  it("handles nullable finalized_job_id on reject without creating a job", async () => {
    const fixture = makeAdminFixture({ reviewStatus: "pending" });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { rejectContractorIntakeSubmissionFromForm } = await import(
      "@/lib/actions/contractor-intake-actions"
    );

    await expect(rejectContractorIntakeSubmissionFromForm(buildRejectFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/contractor-intake-submissions/11111111-1111-4111-8111-111111111111?notice=rejected",
    );

    expect(createJobMock).not.toHaveBeenCalled();
  });
});
