import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const isInternalAccessErrorMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const createJobMock = vi.fn();
const ensureActiveAssignmentAndNotifyMock = vi.fn();
const markInternalNewWorkNotificationsResolvedMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
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
  ensureActiveAssignmentAndNotify: (...args: unknown[]) => ensureActiveAssignmentAndNotifyMock(...args),
}));

vi.mock("@/lib/actions/notification-actions", () => ({
  markInternalNewWorkNotificationsResolved: (...args: unknown[]) =>
    markInternalNewWorkNotificationsResolvedMock(...args),
}));

function buildFormData(input: { submissionId: string; candidateId: string }) {
  const formData = new FormData();
  formData.set("submission_id", input.submissionId);
  formData.set("candidate_id", input.candidateId);
  return formData;
}

function makeAdminFixture(params?: {
  submissionOwnerUserId?: string;
  candidateOwnerUserId?: string;
  candidateStatus?: string;
}) {
  const submissionOwner = params?.submissionOwnerUserId ?? "owner-1";
  const candidateOwner = params?.candidateOwnerUserId ?? submissionOwner;
  const candidateStatus = params?.candidateStatus ?? "proposed";

  const writes: Array<{ table: string; method: string; payload?: Record<string, unknown> }> = [];
  const fromCalls: string[] = [];

  const submissionRow = {
    id: "11111111-1111-4111-8111-111111111111",
    account_owner_user_id: submissionOwner,
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
    proposed_title: "Proposal",
    proposed_job_notes: "note",
    proposed_permit_number: null,
    proposed_jurisdiction: null,
    proposed_permit_date: null,
    review_status: "pending",
  };

  const candidateRow = {
    id: "22222222-2222-4222-8222-222222222222",
    account_owner_user_id: candidateOwner,
    contractor_intake_submission_id: submissionRow.id,
    status: candidateStatus,
  };

  const admin = {
    from(table: string) {
      fromCalls.push(table);
      if (table === "contractor_intake_submissions") {
        return {
          select: vi.fn(() => {
            const query: any = {
              eq: vi.fn(() => query),
              maybeSingle: vi.fn(async () => ({ data: submissionRow, error: null })),
            };
            return query;
          }),
        };
      }

      if (table === "contractor_intake_contact_candidates") {
        return {
          select: vi.fn(() => {
            const query: any = {
              eq: vi.fn(() => query),
              maybeSingle: vi.fn(async () => ({
                data:
                  candidateOwner === submissionOwner
                    ? candidateRow
                    : null,
                error: null,
              })),
            };
            return query;
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            writes.push({ table, method: "update", payload });
            const query: any = {
              eq: vi.fn(() => query),
              then: (onFulfilled: (value: any) => unknown, onRejected?: (reason: unknown) => unknown) =>
                Promise.resolve({ error: null }).then(onFulfilled, onRejected),
            };
            return query;
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { admin, writes, fromCalls, submissionRow, candidateRow };
}

describe("contractor intake contact candidate controls", () => {
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

  it("internal user can approve same-account candidate", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { approveContractorIntakeContactCandidateFromForm } = await import(
      "@/lib/actions/contractor-intake-actions"
    );

    await expect(
      approveContractorIntakeContactCandidateFromForm(
        buildFormData({
          submissionId: fixture.submissionRow.id,
          candidateId: fixture.candidateRow.id,
        }),
      ),
    ).rejects.toThrow(
      `REDIRECT:/ops/admin/contractor-intake-submissions/${fixture.submissionRow.id}?notice=candidate_approved`,
    );

    expect(
      fixture.writes.some(
        (write) =>
          write.table === "contractor_intake_contact_candidates" &&
          write.method === "update" &&
          write.payload?.status === "approved_for_promotion",
      ),
    ).toBe(true);
  });

  it("internal user can skip same-account candidate", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { skipContractorIntakeContactCandidateFromForm } = await import(
      "@/lib/actions/contractor-intake-actions"
    );

    await expect(
      skipContractorIntakeContactCandidateFromForm(
        buildFormData({
          submissionId: fixture.submissionRow.id,
          candidateId: fixture.candidateRow.id,
        }),
      ),
    ).rejects.toThrow(
      `REDIRECT:/ops/admin/contractor-intake-submissions/${fixture.submissionRow.id}?notice=candidate_skipped`,
    );

    expect(
      fixture.writes.some(
        (write) =>
          write.table === "contractor_intake_contact_candidates" &&
          write.method === "update" &&
          write.payload?.status === "skipped",
      ),
    ).toBe(true);
  });

  it("rejects out-of-account candidate update", async () => {
    const fixture = makeAdminFixture({
      submissionOwnerUserId: "owner-1",
      candidateOwnerUserId: "owner-2",
    });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { approveContractorIntakeContactCandidateFromForm } = await import(
      "@/lib/actions/contractor-intake-actions"
    );

    await expect(
      approveContractorIntakeContactCandidateFromForm(
        buildFormData({
          submissionId: fixture.submissionRow.id,
          candidateId: fixture.candidateRow.id,
        }),
      ),
    ).rejects.toThrow("Candidate not found in account scope");

    expect(fixture.writes).toHaveLength(0);
  });

  it("contractor or portal actor cannot approve or skip", async () => {
    requireInternalRoleMock.mockRejectedValueOnce(new Error("Active internal user required."));

    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { approveContractorIntakeContactCandidateFromForm } = await import(
      "@/lib/actions/contractor-intake-actions"
    );

    await expect(
      approveContractorIntakeContactCandidateFromForm(
        buildFormData({
          submissionId: fixture.submissionRow.id,
          candidateId: fixture.candidateRow.id,
        }),
      ),
    ).rejects.toThrow("REDIRECT:/ops");
  });

  it("does not write to contact_recipients or trigger messaging side effects", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { approveContractorIntakeContactCandidateFromForm } = await import(
      "@/lib/actions/contractor-intake-actions"
    );

    await expect(
      approveContractorIntakeContactCandidateFromForm(
        buildFormData({
          submissionId: fixture.submissionRow.id,
          candidateId: fixture.candidateRow.id,
        }),
      ),
    ).rejects.toThrow(
      `REDIRECT:/ops/admin/contractor-intake-submissions/${fixture.submissionRow.id}?notice=candidate_approved`,
    );

    expect(createJobMock).not.toHaveBeenCalled();
    expect(ensureActiveAssignmentAndNotifyMock).not.toHaveBeenCalled();
    expect(markInternalNewWorkNotificationsResolvedMock).not.toHaveBeenCalled();
    expect(fixture.fromCalls.includes("contact_recipients")).toBe(false);
  });
});
