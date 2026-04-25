import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

type AdminCall = {
  table: "contractor_intake_submissions" | "attachments" | "contractor_intake_submission_comments";
  method: "select" | "count" | "insert";
};

type SubmissionRow = {
  id: string;
  contractor_id: string;
  review_status: string;
  created_at: string;
  proposed_customer_first_name: string | null;
  proposed_customer_last_name: string | null;
  proposed_customer_phone: string | null;
  proposed_customer_email: string | null;
  proposed_address_line1: string | null;
  proposed_city: string | null;
  proposed_zip: string | null;
  proposed_job_type: string | null;
  proposed_project_type: string | null;
  proposed_title: string | null;
  proposed_job_notes: string | null;
  proposed_permit_number: string | null;
  proposed_jurisdiction: string | null;
  proposed_permit_date: string | null;
};

const sameContractorContext = {
  contractorId: "contractor-1",
  contractorName: "Alpha Heating",
  userId: "contractor-user-1",
};

function buildSubmission(overrides: Partial<SubmissionRow> = {}): SubmissionRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    contractor_id: "contractor-1",
    review_status: "pending",
    created_at: "2026-04-24T10:00:00.000Z",
    proposed_customer_first_name: "Pat",
    proposed_customer_last_name: "Tester",
    proposed_customer_phone: "555-0101",
    proposed_customer_email: "pat@example.com",
    proposed_address_line1: "123 Main St",
    proposed_city: "Pasadena",
    proposed_zip: "91101",
    proposed_job_type: "service",
    proposed_project_type: "repair",
    proposed_title: "Airflow issue",
    proposed_job_notes: "Needs follow-up",
    proposed_permit_number: null,
    proposed_jurisdiction: null,
    proposed_permit_date: null,
    ...overrides,
  };
}

function makeContractorPortalSupabaseFixture(options?: {
  userId?: string;
  contractorId?: string | null;
  contractorName?: string | null;
}) {
  const userId = options?.userId ?? "contractor-user-1";
  const contractorId = options?.contractorId === undefined ? "contractor-1" : options.contractorId;
  const contractorName =
    options?.contractorName === undefined ? "Alpha Heating" : options.contractorName;

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: userId ? { id: userId } : null },
        error: null,
      })),
    },
    from(table: string) {
      if (table !== "contractor_users") {
        throw new Error(`Unexpected table ${table}`);
      }

      const query: any = {
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({
          data: contractorId
            ? {
                contractor_id: contractorId,
                contractors: contractorName ? { id: contractorId, name: contractorName } : null,
              }
            : null,
          error: null,
        })),
      };

      return {
        select: vi.fn(() => query),
      };
    },
  };
}

function makeAdminFixture() {
  const adminCalls: AdminCall[] = [];
  const insertedComments: Array<Record<string, unknown>> = [];

  const sameContractorSubmission = buildSubmission();
  const foreignContractorSubmission = buildSubmission({
    id: "22222222-2222-4222-8222-222222222222",
    contractor_id: "contractor-2",
    proposed_title: "Foreign proposal",
  });

  const addendumRows = [
    {
      id: "comment-1",
      comment_text: "Added filter size",
      created_at: "2026-04-24T11:00:00.000Z",
    },
  ];

  const submissionRows = [sameContractorSubmission, foreignContractorSubmission];

  const admin = {
    from(table: string) {
      if (table === "contractor_intake_submissions") {
        let filters: Record<string, string> = {};

        const query: any = {
          eq: vi.fn((column: string, value: unknown) => {
            filters = { ...filters, [column]: String(value ?? "").trim() };
            return query;
          }),
          order: vi.fn(() => query),
          limit: vi.fn(() => query),
          maybeSingle: vi.fn(async () => {
            adminCalls.push({ table: "contractor_intake_submissions", method: "select" });
            const row =
              submissionRows.find(
                (submission) =>
                  submission.id === filters.id &&
                  submission.contractor_id === filters.contractor_id &&
                  (!filters.review_status || submission.review_status === filters.review_status),
              ) ?? null;
            return { data: row, error: null };
          }),
          then: (onFulfilled: (value: { data: SubmissionRow[]; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) => {
            adminCalls.push({ table: "contractor_intake_submissions", method: "select" });
            const data = submissionRows.filter(
              (submission) =>
                submission.contractor_id === filters.contractor_id &&
                (!filters.review_status || submission.review_status === filters.review_status),
            );
            return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
          },
        };

        return {
          select: vi.fn(() => query),
        };
      }

      if (table === "attachments") {
        let entityId = "";
        const query: any = {
          eq: vi.fn((column: string, value: unknown) => {
            if (column === "entity_id") entityId = String(value ?? "").trim();
            return query;
          }),
          then: (onFulfilled: (value: { count: number; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) => {
            adminCalls.push({ table: "attachments", method: "count" });
            const count = entityId === sameContractorSubmission.id ? 2 : 0;
            return Promise.resolve({ count, error: null }).then(onFulfilled, onRejected);
          },
        };

        return {
          select: vi.fn(() => query),
        };
      }

      if (table === "contractor_intake_submission_comments") {
        let filters: Record<string, string> = {};
        const selectQuery: any = {
          eq: vi.fn((column: string, value: unknown) => {
            filters = { ...filters, [column]: String(value ?? "").trim() };
            return selectQuery;
          }),
          order: vi.fn(() => selectQuery),
          limit: vi.fn(() => selectQuery),
          then: (onFulfilled: (value: { data: typeof addendumRows; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) => {
            adminCalls.push({ table: "contractor_intake_submission_comments", method: "select" });
            const data = filters.submission_id === sameContractorSubmission.id ? addendumRows : [];
            return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
          },
        };

        return {
          select: vi.fn(() => selectQuery),
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            adminCalls.push({ table: "contractor_intake_submission_comments", method: "insert" });
            insertedComments.push(payload);
            return { error: null };
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return {
    admin,
    adminCalls,
    insertedComments,
    sameContractorSubmission,
    foreignContractorSubmission,
  };
}

describe("contractor portal intake proposal scope hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("allows same-contractor pending proposal list reads", async () => {
    const fixture = makeAdminFixture();

    const { listPendingContractorIntakeProposalsForContractor } = await import(
      "@/lib/portal/intake-proposal-read-model"
    );

    const proposals = await listPendingContractorIntakeProposalsForContractor({
      contractorId: sameContractorContext.contractorId,
      context: sameContractorContext,
      admin: fixture.admin,
    });

    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.id).toBe(fixture.sameContractorSubmission.id);
    expect(fixture.adminCalls).toEqual([
      { table: "contractor_intake_submissions", method: "select" },
    ]);
  });

  it("denies mismatched contractor list reads before elevated proposal access", async () => {
    const fixture = makeAdminFixture();

    const { listPendingContractorIntakeProposalsForContractor } = await import(
      "@/lib/portal/intake-proposal-read-model"
    );

    await expect(
      listPendingContractorIntakeProposalsForContractor({
        contractorId: "contractor-2",
        context: sameContractorContext,
        admin: fixture.admin,
      }),
    ).rejects.toThrow("NOT_AUTHORIZED");

    expect(fixture.adminCalls).toHaveLength(0);
  });

  it("denies non-contractor list reads before elevated proposal access", async () => {
    const supabase = makeContractorPortalSupabaseFixture({ contractorId: null, contractorName: null });

    const { listPendingContractorIntakeProposalsForContractor } = await import(
      "@/lib/portal/intake-proposal-read-model"
    );

    await expect(
      listPendingContractorIntakeProposalsForContractor({
        supabase,
      }),
    ).rejects.toThrow("NOT_CONTRACTOR");

    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("allows same-contractor proposal detail reads and contractor addendum reads", async () => {
    const fixture = makeAdminFixture();

    const { getContractorIntakeProposalPortalDetail } = await import(
      "@/lib/portal/intake-proposal-read-model"
    );

    const detail = await getContractorIntakeProposalPortalDetail({
      context: sameContractorContext,
      submissionId: fixture.sameContractorSubmission.id,
      admin: fixture.admin,
    });

    expect(detail?.submission?.id).toBe(fixture.sameContractorSubmission.id);
    expect(detail?.proposalAttachmentCount).toBe(2);
    expect(detail?.addendumRows).toHaveLength(1);
    expect(fixture.adminCalls).toEqual([
      { table: "contractor_intake_submissions", method: "select" },
      { table: "attachments", method: "count" },
      { table: "contractor_intake_submission_comments", method: "select" },
    ]);
  });

  it("keeps denied out-of-scope detail reads from loading attachments or comments", async () => {
    const fixture = makeAdminFixture();

    const { getContractorIntakeProposalPortalDetail } = await import(
      "@/lib/portal/intake-proposal-read-model"
    );

    const detail = await getContractorIntakeProposalPortalDetail({
      context: sameContractorContext,
      submissionId: fixture.foreignContractorSubmission.id,
      admin: fixture.admin,
    });

    expect(detail).toBeNull();
    expect(fixture.adminCalls).toEqual([
      { table: "contractor_intake_submissions", method: "select" },
    ]);
  });

  it("allows same-contractor proposal comments after scoped proposal preflight", async () => {
    const fixture = makeAdminFixture();

    const { appendContractorIntakeProposalPortalComment } = await import(
      "@/lib/portal/intake-proposal-read-model"
    );

    await appendContractorIntakeProposalPortalComment({
      context: sameContractorContext,
      submissionId: fixture.sameContractorSubmission.id,
      commentText: " Added supply register note ",
      admin: fixture.admin,
    });

    expect(fixture.adminCalls).toEqual([
      { table: "contractor_intake_submissions", method: "select" },
      { table: "contractor_intake_submission_comments", method: "insert" },
    ]);
    expect(fixture.insertedComments).toEqual([
      {
        submission_id: fixture.sameContractorSubmission.id,
        author_user_id: sameContractorContext.userId,
        author_role: "contractor",
        comment_text: "Added supply register note",
      },
    ]);
  });

  it("denies out-of-scope proposal comments before comment insert", async () => {
    const fixture = makeAdminFixture();

    const { appendContractorIntakeProposalPortalComment } = await import(
      "@/lib/portal/intake-proposal-read-model"
    );

    await expect(
      appendContractorIntakeProposalPortalComment({
        context: sameContractorContext,
        submissionId: fixture.foreignContractorSubmission.id,
        commentText: "Need update",
        admin: fixture.admin,
      }),
    ).rejects.toThrow("NOT_FOUND");

    expect(fixture.adminCalls).toEqual([
      { table: "contractor_intake_submissions", method: "select" },
    ]);
    expect(fixture.insertedComments).toHaveLength(0);
  });
});