import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ACTIVE_PERMIT_REQUEST_STATUSES } from "../permit-request-contracts";
import {
  isPermitRequestSchemaUnavailableError,
  listActivePermitRequestQueueRows,
  listActivePermitRequestQueueRowsIfAvailable,
} from "../permit-requests-read-model";

const ORIGINAL_ALLOWLIST = process.env.ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS;

type Row = {
  id: string;
  account_owner_user_id: string;
  contractor_id: string;
  job_id: string | null;
  service_case_id: string | null;
  contractor_intake_submission_id: string | null;
  status: string | null;
  hold_reason: "additional_information_needed" | null;
  post_permit_route: string | null;
  permit_number: string | null;
  jurisdiction: string | null;
  permit_date: string | null;
  contractor_note: string | null;
  request_label: string | null;
  customer_first_name_snapshot: string | null;
  customer_last_name_snapshot: string | null;
  service_address_text_snapshot: string | null;
  address_line1_snapshot: string | null;
  address_line2_snapshot: string | null;
  city_snapshot: string | null;
  state_snapshot: string | null;
  zip_snapshot: string | null;
  internal_intake_note: string | null;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  on_hold_at: string | null;
  completed_at: string | null;
  contractors?: { name: string | null } | null;
  jobs?: {
    id: string;
    title: string | null;
    customer_first_name: string | null;
    customer_last_name: string | null;
    job_address: string | null;
    city: string | null;
  } | null;
};

function makeRow(overrides: Partial<Row>): Row {
  return {
    id: "permit-1",
    account_owner_user_id: "owner-1",
    contractor_id: "contractor-1",
    job_id: null,
    service_case_id: null,
    contractor_intake_submission_id: null,
    status: "permit_request",
    hold_reason: null,
    post_permit_route: null,
    permit_number: null,
    jurisdiction: null,
    permit_date: null,
    contractor_note: null,
    request_label: null,
    customer_first_name_snapshot: null,
    customer_last_name_snapshot: null,
    service_address_text_snapshot: null,
    address_line1_snapshot: null,
    address_line2_snapshot: null,
    city_snapshot: null,
    state_snapshot: null,
    zip_snapshot: null,
    internal_intake_note: null,
    created_at: "2026-06-10T00:00:00.000Z",
    updated_at: "2026-06-10T00:00:00.000Z",
    accepted_at: null,
    on_hold_at: null,
    completed_at: null,
    contractors: { name: "Delta Permits" },
    jobs: null,
    ...overrides,
  };
}

function makeSupabase(rows: Row[], options?: { error?: unknown }) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let resultRows = rows.slice();

  const query = {
    select(columns: string) {
      calls.push({ method: "select", args: [columns] });
      return query;
    },
    eq(column: string, value: string) {
      calls.push({ method: "eq", args: [column, value] });
      resultRows = resultRows.filter((row) => row[column as keyof Row] === value);
      return query;
    },
    in(column: string, values: readonly string[]) {
      calls.push({ method: "in", args: [column, values] });
      resultRows = resultRows.filter((row) => values.includes(String(row[column as keyof Row])));
      return query;
    },
    order(column: string, orderOptions?: { ascending?: boolean }) {
      calls.push({ method: "order", args: [column, orderOptions] });
      resultRows = resultRows
        .slice()
        .sort((a, b) => String(a[column as keyof Row]).localeCompare(String(b[column as keyof Row])));
      if (orderOptions?.ascending === false) {
        resultRows.reverse();
      }
      return query;
    },
    async limit(count: number) {
      calls.push({ method: "limit", args: [count] });
      return {
        data: options?.error ? null : resultRows.slice(0, count),
        error: options?.error ?? null,
      };
    },
  };

  return {
    calls,
    client: {
      from(table: string) {
        calls.push({ method: "from", args: [table] });
        return query;
      },
    },
  };
}

describe("permit request active queue read model", () => {
  beforeEach(() => {
    process.env.ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS = "owner-1";
  });

  afterEach(() => {
    if (typeof ORIGINAL_ALLOWLIST === "string") {
      process.env.ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS = ORIGINAL_ALLOWLIST;
    } else {
      delete process.env.ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS;
    }
  });

  it("loads only active permit request statuses for the account", async () => {
    const fixture = makeSupabase([
      makeRow({ id: "oldest", status: "accepted_in_process", created_at: "2026-06-01T00:00:00.000Z" }),
      makeRow({ id: "terminal", status: "permit_created", created_at: "2026-06-02T00:00:00.000Z" }),
      makeRow({ id: "other-owner", account_owner_user_id: "owner-2" }),
      makeRow({
        id: "hold",
        status: "on_hold_additional_info_needed",
        hold_reason: "additional_information_needed",
        contractors: { name: "  " },
      }),
      makeRow({ id: "request", status: "permit_request", contractors: { name: "Alpha HVAC" } }),
      makeRow({
        id: "linked-job",
        status: "permit_request",
        request_label: "Signed contract permit",
        customer_first_name_snapshot: "Grace",
        customer_last_name_snapshot: "Hopper",
        service_address_text_snapshot: "20 Snapshot Ave",
        address_line1_snapshot: "20 Snapshot Ave",
        address_line2_snapshot: "Unit 4",
        city_snapshot: "Fresno",
        state_snapshot: "CA",
        zip_snapshot: "93720",
        internal_intake_note: "Reviewed text message request.",
        contractor_note: "Uploaded contract and title 24.",
        jobs: {
          id: "job-1",
          title: "ECC permit job",
          customer_first_name: "ADA",
          customer_last_name: "LOVELACE",
          job_address: "10 Main St",
          city: "Fresno",
        },
      }),
    ]);

    const rows = await listActivePermitRequestQueueRows({
      supabase: fixture.client as never,
      accountOwnerUserId: "owner-1",
      now: new Date("2026-06-16T00:00:00.000Z"),
    });

    expect(rows.map((row) => row.id)).toEqual(["oldest", "hold", "request", "linked-job"]);
    expect(rows.map((row) => row.status)).toEqual([
      "accepted_in_process",
      "on_hold_additional_info_needed",
      "permit_request",
      "permit_request",
    ]);
    expect(rows[0]).toMatchObject({
      id: "oldest",
      contractorName: "Delta Permits",
      internalStatusLabel: "Accepted / In Process",
      contractorStatusLabel: "In Progress",
      submittedAgeDays: 15,
    });
    expect(rows[1].contractorName).toBeNull();
    expect(rows[3]).toMatchObject({
      contractorNote: "Uploaded contract and title 24.",
      requestLabel: "Signed contract permit",
      customerFirstNameSnapshot: "Grace",
      customerLastNameSnapshot: "Hopper",
      serviceAddressTextSnapshot: "20 Snapshot Ave",
      addressLine1Snapshot: "20 Snapshot Ave",
      addressLine2Snapshot: "Unit 4",
      citySnapshot: "Fresno",
      stateSnapshot: "CA",
      zipSnapshot: "93720",
      internalIntakeNote: "Reviewed text message request.",
      jobContext: {
        id: "job-1",
        title: "ECC permit job",
        customerName: "ADA LOVELACE",
        location: "10 Main St, Fresno",
      },
    });
  });

  it("queries with the active queue contract, optional contractor scope, and oldest submitted first", async () => {
    const fixture = makeSupabase([makeRow({})]);

    await listActivePermitRequestQueueRows({
      supabase: fixture.client as never,
      accountOwnerUserId: "owner-1",
      contractorId: "contractor-1",
      limit: 25,
    });

    expect(fixture.calls).toEqual(
      expect.arrayContaining([
        { method: "from", args: ["permit_requests"] },
        { method: "eq", args: ["account_owner_user_id", "owner-1"] },
        { method: "eq", args: ["contractor_id", "contractor-1"] },
        { method: "in", args: ["status", ACTIVE_PERMIT_REQUEST_STATUSES] },
        { method: "order", args: ["created_at", { ascending: true }] },
        { method: "limit", args: [25] },
      ]),
    );
  });

  it("throws a stable read-model error when Supabase fails", async () => {
    const fixture = makeSupabase([], { error: { message: "database unavailable" } });

    await expect(
      listActivePermitRequestQueueRows({
        supabase: fixture.client as never,
        accountOwnerUserId: "owner-1",
      }),
    ).rejects.toThrow("Failed to load active permit requests.");
  });

  it("fails closed when permit request schema is unavailable", async () => {
    const fixture = makeSupabase([], {
      error: {
        code: "PGRST205",
        message: "Could not find the table 'public.permit_requests' in the schema cache",
      },
    });

    await expect(
      listActivePermitRequestQueueRowsIfAvailable({
        supabase: fixture.client as never,
        accountOwnerUserId: "owner-1",
      }),
    ).resolves.toEqual({ schemaAvailable: false, rows: [] });
  });

  it("fails closed when permit workflow allowlist is disabled", async () => {
    const fixture = makeSupabase([makeRow({})]);
    delete process.env.ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS;

    await expect(
      listActivePermitRequestQueueRowsIfAvailable({
        supabase: fixture.client as never,
        accountOwnerUserId: "owner-1",
      }),
    ).resolves.toEqual({ schemaAvailable: false, rows: [] });

    expect(fixture.calls).not.toEqual(expect.arrayContaining([{ method: "from", args: ["permit_requests"] }]));
  });

  it("identifies common missing-table errors for schema readiness guard", () => {
    expect(isPermitRequestSchemaUnavailableError({ code: "42P01" })).toBe(true);
    expect(
      isPermitRequestSchemaUnavailableError({
        message: 'relation "public.permit_requests" does not exist',
      }),
    ).toBe(true);
    expect(isPermitRequestSchemaUnavailableError({ code: "23505" })).toBe(false);
  });
});
