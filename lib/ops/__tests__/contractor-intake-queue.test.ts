import { describe, expect, it, vi } from "vitest";

import {
  buildContractorIntakeQueueCsv,
  countPendingContractorIntakeQueueRows,
  listPendingContractorIntakeQueueRows,
} from "@/lib/ops/contractor-intake-queue";

class QueryMock {
  calls: Array<{ method: string; args: unknown[] }> = [];
  constructor(private result: any) {}

  select(...args: unknown[]) {
    this.calls.push({ method: "select", args });
    return this;
  }

  eq(...args: unknown[]) {
    this.calls.push({ method: "eq", args });
    return this;
  }

  order(...args: unknown[]) {
    this.calls.push({ method: "order", args });
    return this;
  }

  limit(...args: unknown[]) {
    this.calls.push({ method: "limit", args });
    return this;
  }

  then(resolve: (value: any) => void) {
    resolve(this.result);
  }
}

function supabaseFor(result: any) {
  const query = new QueryMock(result);
  return {
    query,
    supabase: {
      from: vi.fn(() => query),
    },
  };
}

describe("contractor intake queue read model", () => {
  it("maps pending submission rows to queue rows", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T12:00:00.000Z"));
    const { supabase } = supabaseFor({
      data: [
        {
          id: "sub-1",
          contractor_id: "contractor-1",
          created_at: "2026-06-17T12:00:00.000Z",
          proposed_customer_first_name: "Ada",
          proposed_customer_last_name: "Lovelace",
          proposed_address_line1: "10 Main St",
          proposed_city: "Fresno",
          proposed_state: "CA",
          proposed_zip: "93721",
          proposed_job_type: "ecc",
          proposed_project_type: "alteration",
          proposed_title: "Duct test",
          proposed_job_notes: "Please review photos and schedule.",
          review_status: "pending",
          contractors: { name: "ABC Builders" },
        },
      ],
      error: null,
    });

    const rows = await listPendingContractorIntakeQueueRows({
      supabase,
      accountOwnerUserId: "owner-1",
    });

    expect(rows[0]).toMatchObject({
      id: "sub-1",
      contractorId: "contractor-1",
      contractorName: "ABC Builders",
      submittedAgeDays: 2,
      customerDisplay: "Ada Lovelace",
      addressDisplay: "10 Main St - Fresno, CA 93721",
      jobTypeLabel: "ECC",
      projectTypeLabel: "Alteration",
      proposedTitle: "Duct test",
      notesPreview: "Please review photos and schedule.",
      reviewStatus: "pending",
      detailHref: "/ops/admin/contractor-intake-submissions/sub-1",
    });
    vi.useRealTimers();
  });

  it("count uses review_status pending and optional contractor filter", async () => {
    const { supabase, query } = supabaseFor({ count: 3, error: null });

    await expect(countPendingContractorIntakeQueueRows({
      supabase,
      accountOwnerUserId: "owner-1",
      contractorId: "contractor-1",
    })).resolves.toBe(3);

    expect(query.calls).toEqual(expect.arrayContaining([
      { method: "eq", args: ["account_owner_user_id", "owner-1"] },
      { method: "eq", args: ["review_status", "pending"] },
      { method: "eq", args: ["contractor_id", "contractor-1"] },
    ]));
  });

  it("CSV escaping handles commas, quotes, and newlines", () => {
    const csv = buildContractorIntakeQueueCsv([
      {
        id: "sub,1",
        contractorId: "contractor-1",
        contractorName: 'ACME "Build"',
        submittedAt: "2026-06-19T10:00:00.000Z",
        submittedAtDisplay: "Jun 19, 2026, 10:00 AM",
        submittedAgeDays: 0,
        customerDisplay: "Ada\nLovelace",
        addressDisplay: "10 Main St, Fresno CA",
        jobTypeLabel: "ECC",
        projectTypeLabel: "Alteration",
        proposedTitle: "Duct test",
        notesPreview: "Line 1\r\nLine 2",
        reviewStatus: "pending",
        detailHref: "/ops/admin/contractor-intake-submissions/sub,1",
      },
    ]);

    expect(csv).toContain('"sub,1"');
    expect(csv).toContain('"ACME ""Build"""');
    expect(csv).toContain('"Ada\nLovelace"');
    expect(csv).toContain('"Line 1\r\nLine 2"');
  });

  it("detailHref points to the existing admin detail page", async () => {
    const { supabase } = supabaseFor({
      data: [{ id: "sub-2", created_at: "2026-06-19T10:00:00.000Z", review_status: "pending" }],
      error: null,
    });

    const rows = await listPendingContractorIntakeQueueRows({
      supabase,
      accountOwnerUserId: "owner-1",
    });

    expect(rows[0].detailHref).toBe("/ops/admin/contractor-intake-submissions/sub-2");
  });
});
