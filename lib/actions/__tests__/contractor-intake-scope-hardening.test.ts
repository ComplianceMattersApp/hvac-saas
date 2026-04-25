import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const isInternalAccessErrorMock = vi.fn();
const createJobMock = vi.fn();

const ALLOW_PATH_REACHED = "ALLOW_PATH_REACHED";

type SubmissionRow = {
  id: string;
  account_owner_user_id: string;
  submitted_by_user_id: string;
  contractor_id: string;
  proposed_customer_first_name: string | null;
  proposed_customer_last_name: string | null;
  proposed_customer_phone: string | null;
  proposed_customer_email: string | null;
  proposed_address_line1: string | null;
  proposed_city: string | null;
  proposed_zip: string | null;
  proposed_location_nickname: string | null;
  proposed_job_type: string | null;
  proposed_project_type: string | null;
  proposed_title: string | null;
  proposed_job_notes: string | null;
  proposed_permit_number: string | null;
  proposed_jurisdiction: string | null;
  proposed_permit_date: string | null;
  review_status: string;
};

type WriteRecord = {
  table: "contractor_intake_submissions" | "customers" | "locations" | "jobs" | "job_events";
  method: "update" | "insert";
};

type FixtureOptions = {
  submissionOwnerUserId: string;
  throwOnSubmissionUpdate?: boolean;
};

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

vi.mock("@/lib/actions/job-actions", () => ({
  createJob: (...args: unknown[]) => createJobMock(...args),
}));

function buildSubmission(overrides: Partial<SubmissionRow> = {}): SubmissionRow {
  return {
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
    ...overrides,
  };
}

function buildAdminFixture(options: FixtureOptions) {
  const writes: WriteRecord[] = [];

  const submission = buildSubmission({
    account_owner_user_id: options.submissionOwnerUserId,
  });

  function buildSubmissionSelectQuery() {
    let scopedSubmissionId = "";
    let scopedOwnerId = "";

    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        if (column === "id") scopedSubmissionId = String(value ?? "").trim();
        if (column === "account_owner_user_id") scopedOwnerId = String(value ?? "").trim();
        return query;
      }),
      maybeSingle: vi.fn(async () => {
        if (
          scopedSubmissionId === submission.id &&
          scopedOwnerId === submission.account_owner_user_id &&
          submission.review_status.toLowerCase() === "pending"
        ) {
          return { data: submission, error: null };
        }

        return { data: null, error: null };
      }),
    };

    return query;
  }

  function buildSubmissionUpdateQuery() {
    const updateQuery: any = {
      update: vi.fn(() => {
        writes.push({ table: "contractor_intake_submissions", method: "update" });
        return updateQuery;
      }),
      eq: vi.fn(() => updateQuery),
      then: (onFulfilled: (value: { error: null }) => unknown, onRejected?: (reason: unknown) => unknown) => {
        if (options.throwOnSubmissionUpdate) {
          return Promise.reject(new Error(ALLOW_PATH_REACHED)).then(onFulfilled, onRejected);
        }
        return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
      },
    };

    return updateQuery;
  }

  const admin = {
    from(table: string) {
      if (table === "contractor_intake_submissions") {
        return {
          ...buildSubmissionSelectQuery(),
          ...buildSubmissionUpdateQuery(),
        };
      }

      if (table === "customers") {
        const scopedCustomerQuery: any = {
          eq: vi.fn(() => scopedCustomerQuery),
          maybeSingle: vi.fn(async () => ({
            data: {
              id: "22222222-2222-4222-8222-222222222222",
              owner_user_id: "owner-1",
              first_name: "Pat",
              last_name: "Tester",
              email: "pat@example.com",
              phone: "555-0101",
            },
            error: null,
          })),
        };

        return {
          select: vi.fn(() => scopedCustomerQuery),
          insert: vi.fn(() => {
            writes.push({ table: "customers", method: "insert" });
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "customer-1" }, error: null })),
              })),
            };
          }),
        };
      }

      if (table === "locations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: "33333333-3333-4333-8333-333333333333",
                  owner_user_id: "owner-1",
                  customer_id: "22222222-2222-4222-8222-222222222222",
                  address_line1: "123 Main St",
                  city: "Pasadena",
                },
                error: null,
              })),
            })),
          })),
          insert: vi.fn(() => {
            writes.push({ table: "locations", method: "insert" });
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "location-1" }, error: null })),
              })),
            };
          }),
        };
      }

      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: "job-1", customer_id: "22222222-2222-4222-8222-222222222222" },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "job_events") {
        return {
          insert: vi.fn(async () => {
            writes.push({ table: "job_events", method: "insert" });
            return { error: null };
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { admin, writes, submission };
}

function buildFinalizeFormData(submissionId: string) {
  const formData = new FormData();
  formData.set("submission_id", submissionId);
  formData.set("finalization_mode", "existing_existing");
  formData.set("existing_customer_id", "22222222-2222-4222-8222-222222222222");
  formData.set("existing_location_id", "33333333-3333-4333-8333-333333333333");
  return formData;
}

function buildRejectFormData(submissionId: string) {
  const formData = new FormData();
  formData.set("submission_id", submissionId);
  return formData;
}

function buildDuplicateFormData(submissionId: string) {
  const formData = new FormData();
  formData.set("submission_id", submissionId);
  formData.set("duplicate_job_id", "44444444-4444-4444-8444-444444444444");
  return formData;
}

type TestCase = {
  entrypoint: string;
  invoke: (submissionId: string) => Promise<unknown>;
  expectedAllowError: string;
};

function assertNoDeniedWrites(writes: WriteRecord[]) {
  const protectedTables: Array<WriteRecord["table"]> = [
    "contractor_intake_submissions",
    "customers",
    "locations",
    "jobs",
    "job_events",
  ];

  expect(writes.filter((write) => protectedTables.includes(write.table))).toHaveLength(0);
}

describe("contractor intake adjudication same-account hardening", () => {
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

    createJobMock.mockResolvedValue({ id: "job-1" });
  });

  const testCases: TestCase[] = [
    {
      entrypoint: "finalizeContractorIntakeSubmissionFromForm",
      invoke: async (submissionId: string) => {
        const { finalizeContractorIntakeSubmissionFromForm } = await import("@/lib/actions/contractor-intake-actions");
        return finalizeContractorIntakeSubmissionFromForm(buildFinalizeFormData(submissionId));
      },
      expectedAllowError: ALLOW_PATH_REACHED,
    },
    {
      entrypoint: "rejectContractorIntakeSubmissionFromForm",
      invoke: async (submissionId: string) => {
        const { rejectContractorIntakeSubmissionFromForm } = await import("@/lib/actions/contractor-intake-actions");
        return rejectContractorIntakeSubmissionFromForm(buildRejectFormData(submissionId));
      },
      expectedAllowError: ALLOW_PATH_REACHED,
    },
    {
      entrypoint: "markContractorIntakeSubmissionAsDuplicateFromForm",
      invoke: async (submissionId: string) => {
        const { markContractorIntakeSubmissionAsDuplicateFromForm } = await import("@/lib/actions/contractor-intake-actions");
        return markContractorIntakeSubmissionAsDuplicateFromForm(buildDuplicateFormData(submissionId));
      },
      expectedAllowError: ALLOW_PATH_REACHED,
    },
  ];

  for (const testCase of testCases) {
    it(`allows same-account internal ${testCase.entrypoint} past adjudication preflight`, async () => {
      const fixture = buildAdminFixture({
        submissionOwnerUserId: "owner-1",
        throwOnSubmissionUpdate: testCase.entrypoint !== "finalizeContractorIntakeSubmissionFromForm",
      });
      createAdminClientMock.mockReturnValue(fixture.admin);

      if (testCase.entrypoint === "finalizeContractorIntakeSubmissionFromForm") {
        createJobMock.mockRejectedValueOnce(new Error(ALLOW_PATH_REACHED));
      }

      await expect(testCase.invoke(fixture.submission.id)).rejects.toThrow(testCase.expectedAllowError);
    });

    it(`denies cross-account internal ${testCase.entrypoint} before adjudication writes`, async () => {
      const fixture = buildAdminFixture({
        submissionOwnerUserId: "owner-2",
      });
      createAdminClientMock.mockReturnValue(fixture.admin);

      await expect(testCase.invoke(fixture.submission.id)).rejects.toThrow("Intake submission not found");

      assertNoDeniedWrites(fixture.writes);
      expect(createJobMock).not.toHaveBeenCalled();
    });

    it(`denies non-internal ${testCase.entrypoint} before adjudication writes`, async () => {
      const fixture = buildAdminFixture({
        submissionOwnerUserId: "owner-1",
      });
      createAdminClientMock.mockReturnValue(fixture.admin);
      requireInternalRoleMock.mockRejectedValueOnce(new Error("Active internal user required."));

      await expect(testCase.invoke(fixture.submission.id)).rejects.toThrow("REDIRECT:/ops");

      assertNoDeniedWrites(fixture.writes);
      expect(createJobMock).not.toHaveBeenCalled();
    });
  }
});
