import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const createJobMock = vi.fn();
const ensureActiveAssignmentAndNotifyMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
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
  isInternalAccessError: (error: unknown) =>
    String((error as Error)?.message ?? "").includes("Active internal user required."),
  requireInternalRole: (...args: unknown[]) => requireInternalRoleMock(...args),
}));

vi.mock("@/lib/actions/job-actions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/actions/job-actions")>("@/lib/actions/job-actions");
  return {
    ...actual,
    createJob: (...args: unknown[]) => createJobMock(...args),
    ensureActiveAssignmentAndNotify: (...args: unknown[]) => ensureActiveAssignmentAndNotifyMock(...args),
  };
});

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

type CandidateRow = {
  id: string;
  account_owner_user_id: string;
  contractor_intake_submission_id: string;
  proposed_role: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  preferred_contact_method: string | null;
  proposed_link_target: string;
  source_type: string | null;
  status: string;
};

function baseSubmission() {
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
}

function makeAdminClientFixture(params?: {
  candidates?: CandidateRow[];
  existingContacts?: Array<Record<string, unknown>>;
  proposalOwner?: string;
}) {
  const submission = {
    ...baseSubmission(),
    account_owner_user_id: params?.proposalOwner ?? "owner-1",
  };

  const candidates = params?.candidates ?? [];
  const existingContacts = params?.existingContacts ?? [];

  const insertedContactRecipients: Array<Record<string, unknown>> = [];
  const fromCalls: string[] = [];

  const admin = {
    from(table: string) {
      fromCalls.push(table);

      if (table === "contractor_intake_submissions") {
        return {
          select: vi.fn(() => {
            let idFilter = "";
            let ownerFilter = "";
            const query: any = {
              eq: vi.fn((column: string, value: unknown) => {
                if (column === "id") idFilter = String(value ?? "").trim();
                if (column === "account_owner_user_id") ownerFilter = String(value ?? "").trim();
                return query;
              }),
              maybeSingle: vi.fn(async () => ({
                data: idFilter === submission.id && ownerFilter === submission.account_owner_user_id ? submission : null,
                error: null,
              })),
            };
            return query;
          }),
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
                  state: "CA",
                },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "notifications") {
        const updateQuery: any = {
          eq: vi.fn(() => updateQuery),
          contains: vi.fn(() => updateQuery),
          in: vi.fn(() => updateQuery),
          is: vi.fn(async () => ({ error: null })),
        };

        return {
          update: vi.fn(() => updateQuery),
        };
      }

      if (table === "contractor_intake_contact_candidates") {
        return {
          select: vi.fn(() => {
            let ownerFilter = "";
            let submissionFilter = "";
            let statusFilter = "";
            const query: any = {
              eq: vi.fn((column: string, value: unknown) => {
                if (column === "account_owner_user_id") ownerFilter = String(value ?? "").trim();
                if (column === "contractor_intake_submission_id") submissionFilter = String(value ?? "").trim();
                if (column === "status") statusFilter = String(value ?? "").trim();
                return query;
              }),
              order: vi.fn(() => query),
              limit: vi.fn(async () => ({
                data: candidates.filter(
                  (row) =>
                    String(row.account_owner_user_id) === ownerFilter &&
                    String(row.contractor_intake_submission_id) === submissionFilter &&
                    String(row.status) === statusFilter,
                ),
                error: null,
              })),
            };
            return query;
          }),
        };
      }

      if (table === "contact_recipients") {
        return {
          select: vi.fn(() => {
            const filters: Record<string, string> = {};
            const query: any = {
              eq: vi.fn((column: string, value: unknown) => {
                filters[column] = String(value ?? "").trim();
                return query;
              }),
              limit: vi.fn(async () => ({
                data: existingContacts.filter((row) => {
                  return (
                    String(row.account_owner_user_id ?? "") === String(filters.account_owner_user_id ?? "") &&
                    String(row.linked_entity_type ?? "") === String(filters.linked_entity_type ?? "") &&
                    String(row.linked_entity_id ?? "") === String(filters.linked_entity_id ?? "") &&
                    String(row.recipient_role ?? "") === String(filters.recipient_role ?? "") &&
                    String(row.status ?? "") === String(filters.status ?? "")
                  );
                }),
                error: null,
              })),
            };
            return query;
          }),
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            insertedContactRecipients.push(payload);
            return { error: null };
          }),
        };
      }

      if (table === "contractor_intake_submission_comments") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          })),
        };
      }

      if (table === "job_events") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              contains: vi.fn(() => ({
                limit: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          })),
          insert: vi.fn(async () => ({ error: null })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return {
    admin,
    insertedContactRecipients,
    fromCalls,
    submission,
  };
}

function buildFinalizeFormData(submissionId: string) {
  const formData = new FormData();
  formData.set("submission_id", submissionId);
  formData.set("finalization_mode", "existing_existing");
  formData.set("existing_customer_id", "22222222-2222-4222-8222-222222222222");
  formData.set("existing_location_id", "33333333-3333-4333-8333-333333333333");
  return formData;
}

describe("contractor intake approved candidate promotion on finalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });

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
        account_owner_user_id: "owner-1",
      },
    });

    createJobMock.mockResolvedValue({ id: "job-1" });
    ensureActiveAssignmentAndNotifyMock.mockResolvedValue({
      assignmentCreated: false,
      notificationCreated: false,
      notificationId: null,
    });
  });

  it("promotes approved customer-linked candidate to customer contact recipient", async () => {
    const fixture = makeAdminClientFixture({
      candidates: [
        {
          id: "cand-1",
          account_owner_user_id: "owner-1",
          contractor_intake_submission_id: "11111111-1111-4111-8111-111111111111",
          proposed_role: "responsible_party",
          display_name: "Casey Rivera",
          phone: "555-111-2222",
          email: null,
          preferred_contact_method: "phone",
          proposed_link_target: "customer",
          source_type: "internal_review",
          status: "approved_for_promotion",
        },
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);

    const { finalizeContractorIntakeSubmissionFromForm } = await import("@/lib/actions/contractor-intake-actions");

    await expect(finalizeContractorIntakeSubmissionFromForm(buildFinalizeFormData(fixture.submission.id))).rejects.toThrow(
      "REDIRECT:/jobs/job-1?banner=contractor_intake_finalized",
    );

    expect(fixture.insertedContactRecipients).toHaveLength(1);
    expect(fixture.insertedContactRecipients[0]).toEqual(
      expect.objectContaining({
        linked_entity_type: "customer",
        linked_entity_id: "22222222-2222-4222-8222-222222222222",
        recipient_role: "responsible_party",
        status: "active",
      }),
    );
  });

  it("promotes approved job-linked candidate to job contact recipient", async () => {
    const fixture = makeAdminClientFixture({
      candidates: [
        {
          id: "cand-2",
          account_owner_user_id: "owner-1",
          contractor_intake_submission_id: "11111111-1111-4111-8111-111111111111",
          proposed_role: "site_access_contact",
          display_name: "Gate Contact",
          phone: "+15559998888",
          email: null,
          preferred_contact_method: "phone",
          proposed_link_target: "job",
          source_type: "internal_review",
          status: "approved_for_promotion",
        },
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);

    const { finalizeContractorIntakeSubmissionFromForm } = await import("@/lib/actions/contractor-intake-actions");

    await expect(finalizeContractorIntakeSubmissionFromForm(buildFinalizeFormData(fixture.submission.id))).rejects.toThrow(
      "REDIRECT:/jobs/job-1?banner=contractor_intake_finalized",
    );

    expect(fixture.insertedContactRecipients).toHaveLength(1);
    expect(fixture.insertedContactRecipients[0]).toEqual(
      expect.objectContaining({
        linked_entity_type: "job",
        linked_entity_id: "job-1",
        recipient_role: "site_access_contact",
        status: "active",
      }),
    );
  });

  it("does not promote proposed or skipped candidates", async () => {
    const fixture = makeAdminClientFixture({
      candidates: [
        {
          id: "cand-proposed",
          account_owner_user_id: "owner-1",
          contractor_intake_submission_id: "11111111-1111-4111-8111-111111111111",
          proposed_role: "responsible_party",
          display_name: "Proposed Candidate",
          phone: "5551230000",
          email: null,
          preferred_contact_method: "phone",
          proposed_link_target: "customer",
          source_type: "internal_review",
          status: "proposed",
        },
        {
          id: "cand-skipped",
          account_owner_user_id: "owner-1",
          contractor_intake_submission_id: "11111111-1111-4111-8111-111111111111",
          proposed_role: "responsible_party",
          display_name: "Skipped Candidate",
          phone: "5551230001",
          email: null,
          preferred_contact_method: "phone",
          proposed_link_target: "customer",
          source_type: "internal_review",
          status: "skipped",
        },
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);

    const { finalizeContractorIntakeSubmissionFromForm } = await import("@/lib/actions/contractor-intake-actions");

    await expect(finalizeContractorIntakeSubmissionFromForm(buildFinalizeFormData(fixture.submission.id))).rejects.toThrow(
      "REDIRECT:/jobs/job-1?banner=contractor_intake_finalized",
    );

    expect(fixture.insertedContactRecipients).toHaveLength(0);
  });

  it("does not promote undecided target in v1", async () => {
    const fixture = makeAdminClientFixture({
      candidates: [
        {
          id: "cand-undecided",
          account_owner_user_id: "owner-1",
          contractor_intake_submission_id: "11111111-1111-4111-8111-111111111111",
          proposed_role: "responsible_party",
          display_name: "Undecided Candidate",
          phone: "5551234444",
          email: null,
          preferred_contact_method: "phone",
          proposed_link_target: "undecided",
          source_type: "internal_review",
          status: "approved_for_promotion",
        },
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);

    const { finalizeContractorIntakeSubmissionFromForm } = await import("@/lib/actions/contractor-intake-actions");

    await expect(finalizeContractorIntakeSubmissionFromForm(buildFinalizeFormData(fixture.submission.id))).rejects.toThrow(
      "REDIRECT:/jobs/job-1?banner=contractor_intake_finalized",
    );

    expect(fixture.insertedContactRecipients).toHaveLength(0);
  });

  it("does not insert duplicate active contact twice on retry-like data", async () => {
    const fixture = makeAdminClientFixture({
      candidates: [
        {
          id: "cand-dup",
          account_owner_user_id: "owner-1",
          contractor_intake_submission_id: "11111111-1111-4111-8111-111111111111",
          proposed_role: "responsible_party",
          display_name: "Casey Rivera",
          phone: "+15551112222",
          email: null,
          preferred_contact_method: "phone",
          proposed_link_target: "customer",
          source_type: "internal_review",
          status: "approved_for_promotion",
        },
      ],
      existingContacts: [
        {
          id: "existing-1",
          account_owner_user_id: "owner-1",
          linked_entity_type: "customer",
          linked_entity_id: "22222222-2222-4222-8222-222222222222",
          recipient_role: "responsible_party",
          status: "active",
          phone_e164: "+15551112222",
          email: null,
          display_name: "Casey Rivera",
        },
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);

    const { finalizeContractorIntakeSubmissionFromForm } = await import("@/lib/actions/contractor-intake-actions");

    await expect(finalizeContractorIntakeSubmissionFromForm(buildFinalizeFormData(fixture.submission.id))).rejects.toThrow(
      "REDIRECT:/jobs/job-1?banner=contractor_intake_finalized",
    );

    expect(fixture.insertedContactRecipients).toHaveLength(0);
  });

  it("ignores out-of-account candidates by scoped read", async () => {
    const fixture = makeAdminClientFixture({
      candidates: [
        {
          id: "cand-out",
          account_owner_user_id: "owner-2",
          contractor_intake_submission_id: "11111111-1111-4111-8111-111111111111",
          proposed_role: "responsible_party",
          display_name: "Other Owner",
          phone: "+15558889999",
          email: null,
          preferred_contact_method: "phone",
          proposed_link_target: "customer",
          source_type: "internal_review",
          status: "approved_for_promotion",
        },
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);

    const { finalizeContractorIntakeSubmissionFromForm } = await import("@/lib/actions/contractor-intake-actions");

    await expect(finalizeContractorIntakeSubmissionFromForm(buildFinalizeFormData(fixture.submission.id))).rejects.toThrow(
      "REDIRECT:/jobs/job-1?banner=contractor_intake_finalized",
    );

    expect(fixture.insertedContactRecipients).toHaveLength(0);
  });

  it("non-internal actor cannot trigger promotion", async () => {
    const fixture = makeAdminClientFixture({
      candidates: [
        {
          id: "cand-1",
          account_owner_user_id: "owner-1",
          contractor_intake_submission_id: "11111111-1111-4111-8111-111111111111",
          proposed_role: "responsible_party",
          display_name: "Casey Rivera",
          phone: "555-111-2222",
          email: null,
          preferred_contact_method: "phone",
          proposed_link_target: "customer",
          source_type: "internal_review",
          status: "approved_for_promotion",
        },
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    requireInternalRoleMock.mockRejectedValueOnce(new Error("Active internal user required."));

    const { finalizeContractorIntakeSubmissionFromForm } = await import("@/lib/actions/contractor-intake-actions");

    await expect(finalizeContractorIntakeSubmissionFromForm(buildFinalizeFormData(fixture.submission.id))).rejects.toThrow(
      "REDIRECT:/ops",
    );

    expect(fixture.insertedContactRecipients).toHaveLength(0);
  });

  it("finalization failure does not promote candidates", async () => {
    const fixture = makeAdminClientFixture({
      candidates: [
        {
          id: "cand-1",
          account_owner_user_id: "owner-1",
          contractor_intake_submission_id: "11111111-1111-4111-8111-111111111111",
          proposed_role: "responsible_party",
          display_name: "Casey Rivera",
          phone: "555-111-2222",
          email: null,
          preferred_contact_method: "phone",
          proposed_link_target: "customer",
          source_type: "internal_review",
          status: "approved_for_promotion",
        },
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    createJobMock.mockRejectedValueOnce(new Error("JOB_CREATE_FAILED"));

    const { finalizeContractorIntakeSubmissionFromForm } = await import("@/lib/actions/contractor-intake-actions");

    await expect(finalizeContractorIntakeSubmissionFromForm(buildFinalizeFormData(fixture.submission.id))).rejects.toThrow(
      "JOB_CREATE_FAILED",
    );

    expect(fixture.insertedContactRecipients).toHaveLength(0);
  });

  it("promotion path has no SMS/email send side effects", async () => {
    const fixture = makeAdminClientFixture({
      candidates: [
        {
          id: "cand-1",
          account_owner_user_id: "owner-1",
          contractor_intake_submission_id: "11111111-1111-4111-8111-111111111111",
          proposed_role: "responsible_party",
          display_name: "Casey Rivera",
          phone: "555-111-2222",
          email: null,
          preferred_contact_method: "phone",
          proposed_link_target: "customer",
          source_type: "internal_review",
          status: "approved_for_promotion",
        },
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);

    const { finalizeContractorIntakeSubmissionFromForm } = await import("@/lib/actions/contractor-intake-actions");

    await expect(finalizeContractorIntakeSubmissionFromForm(buildFinalizeFormData(fixture.submission.id))).rejects.toThrow(
      "REDIRECT:/jobs/job-1?banner=contractor_intake_finalized",
    );

    expect(ensureActiveAssignmentAndNotifyMock).not.toHaveBeenCalled();
    expect(fixture.fromCalls.includes("contact_recipients")).toBe(true);
    // Durable write happens, but no messaging side effects are invoked here.
  });
});
