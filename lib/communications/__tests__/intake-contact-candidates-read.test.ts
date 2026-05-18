import { describe, expect, it, vi } from "vitest";

import {
  listIntakeContactCandidatesForSubmission,
  normalizeIntakeContactCandidateRow,
} from "@/lib/communications/intake-contact-candidates-read";

type CandidateFixture = {
  id: string;
  account_owner_user_id: string;
  contractor_intake_submission_id: string;
  proposed_role: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  preferred_contact_method: string;
  proposed_link_target: string;
  source_role: string;
  source_type: string;
  status: string;
  notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

function makeCandidate(input: Partial<CandidateFixture> & { id: string }): CandidateFixture {
  const { id, ...rest } = input;
  return {
    id,
    account_owner_user_id: "owner-1",
    contractor_intake_submission_id: "submission-1",
    proposed_role: "responsible_party",
    display_name: `Candidate ${id}`,
    phone: "+15551234567",
    email: "candidate@example.com",
    preferred_contact_method: "phone",
    proposed_link_target: "customer",
    source_role: "contractor",
    source_type: "intake_submission",
    status: "proposed",
    notes: null,
    created_by_user_id: "internal-1",
    created_at: "2026-05-18T10:00:00Z",
    updated_at: "2026-05-18T10:00:00Z",
    ...rest,
  };
}

function makeSupabase(rows: CandidateFixture[], options?: { queryError?: unknown }) {
  const queryError = options?.queryError ?? null;

  return {
    from(table: string) {
      let ownerFilter = "";
      let submissionFilter = "";

      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          if (column === "account_owner_user_id") ownerFilter = String(value ?? "").trim();
          if (column === "contractor_intake_submission_id") submissionFilter = String(value ?? "").trim();
          return query;
        }),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        then: (onFulfilled: (value: any) => unknown, onRejected?: (reason: unknown) => unknown) => {
          if (queryError) {
            return Promise.resolve({ data: null, error: queryError }).then(onFulfilled, onRejected);
          }

          const data = rows.filter(
            (row) =>
              String(row.account_owner_user_id) === ownerFilter &&
              String(row.contractor_intake_submission_id) === submissionFilter,
          );

          return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
        },
      };

      if (table !== "contractor_intake_contact_candidates") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return query;
    },
  };
}

describe("intake contact candidates read model", () => {
  it("normalizes candidate row fields", () => {
    const normalized = normalizeIntakeContactCandidateRow({
      id: " candidate-1 ",
      account_owner_user_id: " owner-1 ",
      contractor_intake_submission_id: " submission-1 ",
      proposed_role: " responsible_party ",
      display_name: "  Alex Rivera ",
      phone: " +15551234567 ",
      email: " alex@example.com ",
      preferred_contact_method: " phone ",
      proposed_link_target: " customer ",
      source_role: " contractor ",
      source_type: " intake_submission ",
      status: " proposed ",
      notes: " note ",
      created_by_user_id: " internal-1 ",
      created_at: " 2026-05-18T10:00:00Z ",
      updated_at: " 2026-05-18T11:00:00Z ",
    });

    expect(normalized).toEqual({
      id: "candidate-1",
      account_owner_user_id: "owner-1",
      contractor_intake_submission_id: "submission-1",
      proposed_role: "responsible_party",
      display_name: "Alex Rivera",
      phone: "+15551234567",
      email: "alex@example.com",
      preferred_contact_method: "phone",
      proposed_link_target: "customer",
      source_role: "contractor",
      source_type: "intake_submission",
      status: "proposed",
      notes: "note",
      created_by_user_id: "internal-1",
      created_at: "2026-05-18T10:00:00Z",
      updated_at: "2026-05-18T11:00:00Z",
    });
  });

  it("returns safe empty when account or submission scope missing", async () => {
    const supabase = makeSupabase([makeCandidate({ id: "candidate-1" })]);

    const rows = await listIntakeContactCandidatesForSubmission({
      supabase: supabase as any,
      accountOwnerUserId: "",
      contractorIntakeSubmissionId: "submission-1",
    });

    expect(rows).toEqual([]);
  });

  it("returns safe empty when candidates table is missing", async () => {
    const supabase = makeSupabase([], {
      queryError: {
        code: "42P01",
        message: 'relation "public.contractor_intake_contact_candidates" does not exist',
      },
    });

    const rows = await listIntakeContactCandidatesForSubmission({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      contractorIntakeSubmissionId: "submission-1",
    });

    expect(rows).toEqual([]);
  });

  it("throws for non-missing-table errors", async () => {
    const queryError = {
      code: "42501",
      message: "permission denied for table contractor_intake_contact_candidates",
    };

    const supabase = makeSupabase([], { queryError });

    await expect(
      listIntakeContactCandidatesForSubmission({
        supabase: supabase as any,
        accountOwnerUserId: "owner-1",
        contractorIntakeSubmissionId: "submission-1",
      }),
    ).rejects.toBe(queryError);
  });

  it("lists only same-account submission candidates", async () => {
    const supabase = makeSupabase([
      makeCandidate({ id: "candidate-1", account_owner_user_id: "owner-1", contractor_intake_submission_id: "submission-1" }),
      makeCandidate({ id: "candidate-2", account_owner_user_id: "owner-2", contractor_intake_submission_id: "submission-1" }),
      makeCandidate({ id: "candidate-3", account_owner_user_id: "owner-1", contractor_intake_submission_id: "submission-2" }),
    ]);

    const rows = await listIntakeContactCandidatesForSubmission({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      contractorIntakeSubmissionId: "submission-1",
    });

    expect(rows.map((row) => row.id)).toEqual(["candidate-1"]);
  });
});
