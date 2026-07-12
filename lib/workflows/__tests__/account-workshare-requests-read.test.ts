import { describe, expect, it } from "vitest";
import {
  listAccountWorkshareRequestsForSourceJob,
  listIncomingAccountWorkshareRequestsForReceiver,
  listSentAccountWorkshareRequestsForSender,
  type AccountWorkshareRequestRow,
} from "../account-workshare-requests-read";

function makeRequest(input: Partial<AccountWorkshareRequestRow> & { id: string }): AccountWorkshareRequestRow {
  const { id, ...rest } = input;

  return {
    id,
    connection_id: "00000000-0000-4000-8000-000000000011",
    sender_account_id: "00000000-0000-4000-8000-0000000000a1",
    receiver_account_id: "00000000-0000-4000-8000-0000000000b1",
    source_job_id: "00000000-0000-4000-8000-0000000000c1",
    receiving_job_id: null,
    request_type: "ecc_hers_testing",
    status: "sent",
    customer_name_snapshot: "Alice Customer",
    customer_contact_name_snapshot: "Alice Customer",
    customer_phone_snapshot: "555-0100",
    customer_email_snapshot: "alice@example.com",
    location_address_snapshot: "1 Main St, Los Angeles CA 90001",
    location_address_line1_snapshot: "1 Main St",
    location_address_line2_snapshot: null,
    location_city_snapshot: "Los Angeles",
    location_state_snapshot: "CA",
    location_zip_snapshot: "90001",
    source_job_title_snapshot: "Install",
    source_job_reference_snapshot: "J-100",
    source_job_type_snapshot: "ecc",
    source_job_description_snapshot: "Scope notes",
    permit_number_snapshot: "P-100",
    requested_scope_snapshot: { requested_scope_text: "HERS testing" },
    sender_notes_snapshot: "Gate code",
    preferred_date: null,
    preferred_window_snapshot: null,
    created_by_user_id: "00000000-0000-4000-8000-0000000000a2",
    sent_at: "2026-07-08T10:00:00.000Z",
    cancelled_at: null,
    declined_at: null,
    decided_by_user_id: null,
    decline_reason: null,
    accepted_at: null,
    outcome: null,
    outcome_recorded_at: null,
    created_at: "2026-07-08T10:00:00.000Z",
    updated_at: "2026-07-08T10:00:00.000Z",
    ...rest,
  };
}

function makeSupabase(rows: AccountWorkshareRequestRow[]) {
  return {
    from: (table: string) => {
      if (table !== "account_workshare_requests") {
        throw new Error(`Unexpected table ${table}`);
      }

      const state = {
        eq: [] as Array<[string, unknown]>,
        order: [] as Array<[string, boolean]>,
        limit: null as number | null,
      };

      const applyFilters = () => {
        let filtered = rows.filter((row) =>
          state.eq.every(([column, value]) => (row as any)[column] === value));
        for (const [column, ascending] of [...state.order].reverse()) {
          filtered = [...filtered].sort((a, b) => {
            const av = String((a as any)[column] ?? "");
            const bv = String((b as any)[column] ?? "");
            if (av === bv) return 0;
            return (av < bv ? -1 : 1) * (ascending ? 1 : -1);
          });
        }
        if (state.limit !== null) filtered = filtered.slice(0, state.limit);
        return filtered;
      };

      const builder: any = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          state.eq.push([column, value]);
          return builder;
        },
        order: (column: string, opts?: { ascending?: boolean }) => {
          state.order.push([column, opts?.ascending !== false]);
          return builder;
        },
        limit: (value: number) => {
          state.limit = value;
          return builder;
        },
        then: (resolve: (value: { data: AccountWorkshareRequestRow[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve({ data: applyFilters(), error: null }).then(resolve, reject),
      };

      return builder;
    },
  };
}

describe("account workshare requests read helpers", () => {
  it("sender can list sent requests", async () => {
    const supabase = makeSupabase([
      makeRequest({ id: "request-1" }),
      makeRequest({ id: "request-2", sender_account_id: "other-sender" }),
    ]);

    await expect(listSentAccountWorkshareRequestsForSender(supabase as any, "00000000-0000-4000-8000-0000000000a1"))
      .resolves.toEqual([expect.objectContaining({ id: "request-1" })]);
  });

  it("sender can list requests for a source job", async () => {
    const supabase = makeSupabase([
      makeRequest({ id: "request-1", source_job_id: "job-1" }),
      makeRequest({ id: "request-2", source_job_id: "job-2" }),
      makeRequest({ id: "request-3", sender_account_id: "other-sender", source_job_id: "job-1" }),
    ]);

    const rows = await listAccountWorkshareRequestsForSourceJob(
      supabase as any,
      "00000000-0000-4000-8000-0000000000a1",
      "job-1",
    );

    expect(rows.map((row) => row.id)).toEqual(["request-1"]);
  });

  it("receiver can list incoming requests read-only", async () => {
    const supabase = makeSupabase([
      makeRequest({ id: "request-1", receiver_account_id: "receiver-1" }),
      makeRequest({ id: "request-2", receiver_account_id: "receiver-2" }),
    ]);

    const rows = await listIncomingAccountWorkshareRequestsForReceiver(supabase as any, "receiver-1");

    expect(rows.map((row) => row.id)).toEqual(["request-1"]);
  });

  it("receiver incoming excludes cancelled requests", async () => {
    const supabase = makeSupabase([
      makeRequest({ id: "request-sent", receiver_account_id: "receiver-1", status: "sent" }),
      makeRequest({
        id: "request-cancelled",
        receiver_account_id: "receiver-1",
        status: "cancelled",
        cancelled_at: "2026-07-08T12:00:00.000Z",
      }),
    ]);

    const rows = await listIncomingAccountWorkshareRequestsForReceiver(supabase as any, "receiver-1");

    expect(rows.map((row) => row.id)).toEqual(["request-sent"]);
  });

  it("receiver incoming returns newest created_at first", async () => {
    const supabase = makeSupabase([
      makeRequest({ id: "request-old", receiver_account_id: "receiver-1", created_at: "2026-07-01T10:00:00.000Z" }),
      makeRequest({ id: "request-new", receiver_account_id: "receiver-1", created_at: "2026-07-09T10:00:00.000Z" }),
      makeRequest({ id: "request-mid", receiver_account_id: "receiver-1", created_at: "2026-07-05T10:00:00.000Z" }),
    ]);

    const rows = await listIncomingAccountWorkshareRequestsForReceiver(supabase as any, "receiver-1");

    expect(rows.map((row) => row.id)).toEqual(["request-new", "request-mid", "request-old"]);
  });

  it("receiver incoming is account-isolated across accounts", async () => {
    const supabase = makeSupabase([
      makeRequest({ id: "for-a", receiver_account_id: "account-a" }),
      makeRequest({ id: "for-b", receiver_account_id: "account-b" }),
    ]);

    await expect(listIncomingAccountWorkshareRequestsForReceiver(supabase as any, "account-a"))
      .resolves.toEqual([expect.objectContaining({ id: "for-a" })]);
    await expect(listIncomingAccountWorkshareRequestsForReceiver(supabase as any, "account-b"))
      .resolves.toEqual([expect.objectContaining({ id: "for-b" })]);
  });

  it("receiver incoming returns empty when nothing is addressed to the account", async () => {
    const supabase = makeSupabase([
      makeRequest({ id: "request-1", receiver_account_id: "receiver-1" }),
    ]);

    await expect(listIncomingAccountWorkshareRequestsForReceiver(supabase as any, "receiver-empty"))
      .resolves.toEqual([]);
  });

  it("unrelated or blank account scope sees none", async () => {
    const supabase = makeSupabase([makeRequest({ id: "request-1" })]);

    await expect(listSentAccountWorkshareRequestsForSender(supabase as any, "")).resolves.toEqual([]);
    await expect(listAccountWorkshareRequestsForSourceJob(supabase as any, "other", "missing")).resolves.toEqual([]);
    await expect(listIncomingAccountWorkshareRequestsForReceiver(supabase as any, "other")).resolves.toEqual([]);
  });
});
