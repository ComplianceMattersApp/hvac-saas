import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const createJobMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  isInternalAccessError: () => false,
  requireInternalRole: (...args: unknown[]) => requireInternalRoleMock(...args),
}));

vi.mock("@/lib/actions/job-actions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/actions/job-actions")>("@/lib/actions/job-actions");
  return {
    ...actual,
    createJob: (...args: unknown[]) => createJobMock(...args),
  };
});

type IntakeSubmissionRow = {
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

function buildSubmission(overrides: Partial<IntakeSubmissionRow> = {}): IntakeSubmissionRow {
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

function makeAdminClient(fixture: {
  submission: IntakeSubmissionRow;
  customer?: Record<string, unknown>;
  location?: Record<string, unknown>;
}) {
  return {
    from(table: string) {
      if (table === "contractor_intake_submissions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: fixture.submission, error: null })),
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          })),
        };
      }

      if (table === "customers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: "22222222-2222-4222-8222-222222222222",
                  owner_user_id: "owner-1",
                  first_name: "Pat",
                  last_name: "Tester",
                  email: "pat@example.com",
                  phone: "555-0101",
                  ...fixture.customer,
                },
                error: null,
              })),
            })),
          })),
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
                  ...fixture.location,
                },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "job_events") {
        return {
          insert: vi.fn(async () => ({ error: null })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

describe("contractor-originated ECC title handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("direct contractor ECC create uses the structured ECC title instead of freeform contractor title", async () => {
    const { resolveCreateJobTitle } = await import("@/lib/actions/job-actions");

    expect(
      resolveCreateJobTitle({
        submittedTitle: "Ready for testing",
        isContractorUser: true,
        jobType: "ecc",
        projectType: "alteration",
      }),
    ).toBe("ECC Alteration Test");
  });

  it("contractor service title behavior stays unchanged", async () => {
    const { resolveCreateJobTitle } = await import("@/lib/actions/job-actions");

    expect(
      resolveCreateJobTitle({
        submittedTitle: "Check noisy condenser",
        isContractorUser: true,
        jobType: "service",
      }),
    ).toBe("Check noisy condenser");
  });

  it("proposal submission preserves contractor comments in proposed_job_notes", async () => {
    const { buildContractorProposalSubmissionFields } = await import("@/lib/actions/job-actions");

    expect(
      buildContractorProposalSubmissionFields({
        resolvedTitle: "ECC Alteration Test",
        jobNotesRaw: "Ready for testing",
      }),
    ).toEqual({
      proposed_title: "ECC Alteration Test",
      proposed_job_notes: "Ready for testing",
    });
  });

  it("proposal finalization ignores proposed ECC title and preserves canonical job notes", async () => {
    const submission = buildSubmission();

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "internal-user-1" } },
          error: null,
        })),
      },
    });
    requireInternalRoleMock.mockResolvedValue({
      internalUser: { account_owner_user_id: "owner-1" },
    });
    createAdminClientMock.mockReturnValue(makeAdminClient({ submission }));
    createJobMock.mockResolvedValue({ id: "job-1" });

    const { finalizeContractorIntakeSubmissionFromForm } = await import("@/lib/actions/contractor-intake-actions");

    const formData = new FormData();
    formData.set("submission_id", submission.id);
    formData.set("finalization_mode", "existing_existing");
    formData.set("existing_customer_id", "22222222-2222-4222-8222-222222222222");
    formData.set("existing_location_id", "33333333-3333-4333-8333-333333333333");

    await expect(finalizeContractorIntakeSubmissionFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-1?banner=contractor_intake_finalized",
    );

    expect(createJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "ECC Alteration Test",
        job_notes: "Ready for testing",
      }),
      expect.any(Object),
    );
  });
});