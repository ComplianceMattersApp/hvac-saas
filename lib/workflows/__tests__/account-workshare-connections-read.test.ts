import { describe, expect, it } from "vitest";
import {
  listRaterWorkshareConnectionsForSender,
  listSenderWorkshareConnectionsForReceiver,
} from "../account-workshare-connections-read";

type MockConnection = {
  id: string;
  sender_account_id: string | null;
  receiver_account_id: string;
  service_type: "ecc_hers";
  status: "pending" | "active" | "disabled" | "revoked";
  invite_email: string | null;
  invite_company_name: string | null;
  invite_token_hash: string | null;
  invited_by_user_id: string;
  accepted_by_user_id: string | null;
  disabled_by_user_id: string | null;
  revoked_by_user_id: string | null;
  created_at: string;
  accepted_at: string | null;
  disabled_at: string | null;
  revoked_at: string | null;
  updated_at: string;
};

function makeConnection(input: Partial<MockConnection> & { id: string }): MockConnection {
  return {
    sender_account_id: "00000000-0000-4000-8000-0000000000a1",
    receiver_account_id: "00000000-0000-4000-8000-0000000000b1",
    service_type: "ecc_hers",
    status: "pending",
    invite_email: null,
    invite_company_name: null,
    invite_token_hash: null,
    invited_by_user_id: "00000000-0000-4000-8000-0000000000b2",
    accepted_by_user_id: null,
    disabled_by_user_id: null,
    revoked_by_user_id: null,
    created_at: "2026-07-06T12:00:00.000Z",
    accepted_at: null,
    disabled_at: null,
    revoked_at: null,
    updated_at: "2026-07-06T12:00:00.000Z",
    ...input,
  };
}

function makeSupabase(rows: MockConnection[]) {
  return {
    from: (table: string) => {
      if (table !== "account_workshare_connections") {
        throw new Error(`Unexpected table ${table}`);
      }

      const state = {
        eq: [] as Array<[string, unknown]>,
        in: [] as Array<[string, unknown[]]>,
      };

      const applyFilters = () => rows.filter((row) => {
        for (const [column, value] of state.eq) {
          if ((row as any)[column] !== value) return false;
        }

        for (const [column, values] of state.in) {
          if (!values.includes((row as any)[column])) return false;
        }

        return true;
      });

      const builder: any = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          state.eq.push([column, value]);
          return builder;
        },
        in: (column: string, values: unknown[]) => {
          state.in.push([column, values]);
          return builder;
        },
        order: () => builder,
        then: (resolve: (value: { data: MockConnection[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve({ data: applyFilters(), error: null }).then(resolve, reject),
      };

      return builder;
    },
  };
}

describe("account workshare connections read model", () => {
  it("lists pending and active rater invites for the sender account", async () => {
    const supabase = makeSupabase([
      makeConnection({
        id: "00000000-0000-4000-8000-000000000011",
        sender_account_id: "00000000-0000-4000-8000-0000000000a1",
        status: "pending",
      }),
      makeConnection({
        id: "00000000-0000-4000-8000-000000000012",
        sender_account_id: "00000000-0000-4000-8000-0000000000a1",
        status: "active",
        accepted_by_user_id: "00000000-0000-4000-8000-0000000000a2",
        accepted_at: "2026-07-06T13:00:00.000Z",
      }),
      makeConnection({
        id: "00000000-0000-4000-8000-000000000013",
        sender_account_id: "00000000-0000-4000-8000-0000000000a1",
        status: "revoked",
        revoked_by_user_id: "00000000-0000-4000-8000-0000000000a2",
        revoked_at: "2026-07-06T14:00:00.000Z",
      }),
      makeConnection({
        id: "00000000-0000-4000-8000-000000000014",
        sender_account_id: "00000000-0000-4000-8000-0000000000c1",
        status: "pending",
      }),
    ]);

    const rows = await listRaterWorkshareConnectionsForSender(
      supabase as any,
      "00000000-0000-4000-8000-0000000000a1",
    );

    expect(rows.map((row) => row.id)).toEqual([
      "00000000-0000-4000-8000-000000000011",
      "00000000-0000-4000-8000-000000000012",
    ]);
  });

  it("lists pending and active contractor sender connections for the receiver account", async () => {
    const supabase = makeSupabase([
      makeConnection({
        id: "00000000-0000-4000-8000-000000000021",
        receiver_account_id: "00000000-0000-4000-8000-0000000000b1",
        status: "pending",
      }),
      makeConnection({
        id: "00000000-0000-4000-8000-000000000022",
        receiver_account_id: "00000000-0000-4000-8000-0000000000b1",
        status: "active",
        accepted_by_user_id: "00000000-0000-4000-8000-0000000000a2",
        accepted_at: "2026-07-06T13:00:00.000Z",
      }),
      makeConnection({
        id: "00000000-0000-4000-8000-000000000023",
        receiver_account_id: "00000000-0000-4000-8000-0000000000b1",
        status: "disabled",
        disabled_by_user_id: "00000000-0000-4000-8000-0000000000b2",
        disabled_at: "2026-07-06T14:00:00.000Z",
      }),
    ]);

    const rows = await listSenderWorkshareConnectionsForReceiver(
      supabase as any,
      "00000000-0000-4000-8000-0000000000b1",
    );

    expect(rows.map((row) => row.id)).toEqual([
      "00000000-0000-4000-8000-000000000021",
      "00000000-0000-4000-8000-000000000022",
    ]);
  });
});
