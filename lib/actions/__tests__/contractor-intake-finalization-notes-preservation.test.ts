import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const createJobMock = vi.fn();
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

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

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
  proposed_state: string | null;
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

type SubmissionComment = {
  id: string;
  submission_id: string;
  author_user_id: string;
  author_role: string;
  comment_text: string;
  created_at: string;
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
    proposed_state: "CA",
    proposed_zip: "91101",
    proposed_location_nickname: null,
    proposed_job_type: "ecc",
    proposed_project_type: "alteration",
    proposed_title: "Ready for testing",
    proposed_job_notes: "Original contractor submitted note",
    proposed_permit_number: null,
    proposed_jurisdiction: null,
    proposed_permit_date: null,
    review_status: "pending",
    ...overrides,
  };
}

function makeAdminClient(fixture: {
  submission: IntakeSubmissionRow;
  comments?: SubmissionComment[];
  existingNarrativeEvents?: Array<{ event_type: string; meta: Record<string, unknown> }>;
}) {
  const jobEventInsertPayloads: any[] = [];

  const admin = {
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
          is: vi.fn(async () => ({ error: null })),
        };

        return {
          update: vi.fn(() => updateQuery),
        };
      }

      if (table === "contractor_intake_submission_comments") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(async () => ({ data: fixture.comments ?? [], error: null })),
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
                limit: vi.fn(async () => ({ data: fixture.existingNarrativeEvents ?? [], error: null })),
              })),
            })),
          })),
          insert: vi.fn(async (payload: any) => {
            jobEventInsertPayloads.push(payload);
            return { error: null };
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { admin, jobEventInsertPayloads };
}

describe("contractor intake finalization notes preservation", () => {
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
      internalUser: { account_owner_user_id: "owner-1" },
    });

    createJobMock.mockResolvedValue({ id: "job-1" });
  });

  it("copies contractor follow-up comments and review note to job_events with proper visibility event types", async () => {
    const submission = buildSubmission();
    const comments: SubmissionComment[] = [
      {
        id: "comment-1",
        submission_id: submission.id,
        author_user_id: "contractor-user-1",
        author_role: "contractor",
        comment_text: "Please use the side gate.",
        created_at: "2026-04-29T08:30:00.000Z",
      },
      {
        id: "comment-2",
        submission_id: submission.id,
        author_user_id: "contractor-user-1",
        author_role: "contractor",
        comment_text: "Customer asked for PM arrival.",
        created_at: "2026-04-29T08:45:00.000Z",
      },
      {
        id: "comment-internal",
        submission_id: submission.id,
        author_user_id: "internal-user-1",
        author_role: "internal",
        comment_text: "Internal triage note.",
        created_at: "2026-04-29T09:00:00.000Z",
      },
    ];

    const fixture = makeAdminClient({ submission, comments });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { finalizeContractorIntakeSubmissionFromForm } = await import("@/lib/actions/contractor-intake-actions");

    const formData = new FormData();
    formData.set("submission_id", submission.id);
    formData.set("finalization_mode", "existing_existing");
    formData.set("existing_customer_id", "22222222-2222-4222-8222-222222222222");
    formData.set("existing_location_id", "33333333-3333-4333-8333-333333333333");
    formData.set("review_note", "Approved after address verification.");

    await expect(finalizeContractorIntakeSubmissionFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-1?banner=contractor_intake_finalized",
    );

    expect(createJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        job_notes: "Original contractor submitted note",
      }),
      expect.any(Object),
    );

    expect(fixture.jobEventInsertPayloads).toHaveLength(2);

    const finalizedEvent = fixture.jobEventInsertPayloads[0];
    expect(finalizedEvent?.event_type).toBe("contractor_intake_finalized");

    const narrativeEvents = fixture.jobEventInsertPayloads[1] as any[];
    expect(Array.isArray(narrativeEvents)).toBe(true);

    const contractorCommentEvents = narrativeEvents.filter((e) => e.event_type === "contractor_note" && e.meta?.source === "contractor_intake_submission_comment");
    expect(contractorCommentEvents).toHaveLength(2);
    expect(contractorCommentEvents.map((e) => e.meta?.contractor_intake_comment_id)).toEqual(["comment-1", "comment-2"]);

    const copiedSubmissionNote = narrativeEvents.find((e) => e.event_type === "contractor_note" && e.meta?.source === "contractor_intake_submission_note");
    expect(copiedSubmissionNote?.meta?.note).toBe("Original contractor submitted note");

    const copiedReviewNote = narrativeEvents.find((e) => e.event_type === "internal_note" && e.meta?.source === "contractor_intake_review_note");
    expect(copiedReviewNote?.meta?.note).toBe("Approved after address verification.");

    const leakedInternalComment = narrativeEvents.find((e) => e.meta?.contractor_intake_comment_id === "comment-internal");
    expect(leakedInternalComment).toBeUndefined();
  });

  it("skips duplicate copied narrative events when prior finalization narrative exists", async () => {
    const submission = buildSubmission();
    const comments: SubmissionComment[] = [
      {
        id: "comment-1",
        submission_id: submission.id,
        author_user_id: "contractor-user-1",
        author_role: "contractor",
        comment_text: "Please use the side gate.",
        created_at: "2026-04-29T08:30:00.000Z",
      },
    ];

    const fixture = makeAdminClient({
      submission,
      comments,
      existingNarrativeEvents: [
        {
          event_type: "contractor_note",
          meta: {
            source: "contractor_intake_submission_comment",
            contractor_intake_submission_id: submission.id,
            contractor_intake_comment_id: "comment-1",
          },
        },
        {
          event_type: "contractor_note",
          meta: {
            source: "contractor_intake_submission_note",
            contractor_intake_submission_id: submission.id,
          },
        },
        {
          event_type: "internal_note",
          meta: {
            source: "contractor_intake_review_note",
            contractor_intake_submission_id: submission.id,
          },
        },
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);

    const { finalizeContractorIntakeSubmissionFromForm } = await import("@/lib/actions/contractor-intake-actions");

    const formData = new FormData();
    formData.set("submission_id", submission.id);
    formData.set("finalization_mode", "existing_existing");
    formData.set("existing_customer_id", "22222222-2222-4222-8222-222222222222");
    formData.set("existing_location_id", "33333333-3333-4333-8333-333333333333");
    formData.set("review_note", "Approved after address verification.");

    await expect(finalizeContractorIntakeSubmissionFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-1?banner=contractor_intake_finalized",
    );

    // Only the canonical finalization event should be inserted.
    expect(fixture.jobEventInsertPayloads).toHaveLength(1);
    expect(fixture.jobEventInsertPayloads[0]?.event_type).toBe("contractor_intake_finalized");
  });
});
