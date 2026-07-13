import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  isInternalAccessError: (error: unknown) =>
    Boolean(error)
    && typeof error === "object"
    && (error as any).name === "InternalAccessError",
}));

vi.mock("@/lib/auth/internal-job-scope", () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) => loadScopedInternalJobForMutationMock(...args),
}));

import {
  cancelAccountWorkshareRequest,
  createAccountWorkshareRequestFromJob,
  createAccountWorkshareRequestFromJobForm,
} from "../account-workshare-requests-actions";

const SENDER_ACCOUNT_ID = "00000000-0000-4000-8000-0000000000a1";
const SENDER_USER_ID = "00000000-0000-4000-8000-0000000000a2";
const RECEIVER_ACCOUNT_ID = "00000000-0000-4000-8000-0000000000b1";
const UNRELATED_ACCOUNT_ID = "00000000-0000-4000-8000-0000000000d1";
const SOURCE_JOB_ID = "00000000-0000-4000-8000-0000000000c1";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000011";
const REQUEST_ID = "00000000-0000-4000-8000-000000000099";

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

type MockRequest = {
  id: string;
  connection_id: string;
  sender_account_id: string;
  receiver_account_id: string;
  source_job_id: string;
  receiving_job_id: string | null;
  request_type: "ecc_hers_testing";
  status: "sent" | "cancelled";
  customer_name_snapshot: string | null;
  customer_contact_name_snapshot: string | null;
  customer_phone_snapshot: string | null;
  customer_email_snapshot: string | null;
  location_address_snapshot: string | null;
  location_address_line1_snapshot: string | null;
  location_address_line2_snapshot: string | null;
  location_city_snapshot: string | null;
  location_state_snapshot: string | null;
  location_zip_snapshot: string | null;
  source_job_title_snapshot: string | null;
  source_job_reference_snapshot: string | null;
  source_job_type_snapshot: string | null;
  source_job_description_snapshot: string | null;
  permit_number_snapshot: string | null;
  requested_scope_snapshot: Record<string, unknown>;
  sender_notes_snapshot: string | null;
  preferred_date: string | null;
  preferred_window_snapshot: string | null;
  created_by_user_id: string;
  sent_at: string;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

function makeConnection(input: Partial<MockConnection> = {}): MockConnection {
  return {
    id: CONNECTION_ID,
    sender_account_id: SENDER_ACCOUNT_ID,
    receiver_account_id: RECEIVER_ACCOUNT_ID,
    service_type: "ecc_hers",
    status: "active",
    invite_email: null,
    invite_company_name: "Rater Co",
    invite_token_hash: null,
    invited_by_user_id: "00000000-0000-4000-8000-0000000000b2",
    accepted_by_user_id: SENDER_USER_ID,
    disabled_by_user_id: null,
    revoked_by_user_id: null,
    created_at: "2026-07-08T09:00:00.000Z",
    accepted_at: "2026-07-08T09:05:00.000Z",
    disabled_at: null,
    revoked_at: null,
    updated_at: "2026-07-08T09:05:00.000Z",
    ...input,
  };
}

function makeRequest(input: Partial<MockRequest> = {}): MockRequest {
  return {
    id: REQUEST_ID,
    connection_id: CONNECTION_ID,
    sender_account_id: SENDER_ACCOUNT_ID,
    receiver_account_id: RECEIVER_ACCOUNT_ID,
    source_job_id: SOURCE_JOB_ID,
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
    created_by_user_id: SENDER_USER_ID,
    sent_at: "2026-07-08T10:00:00.000Z",
    cancelled_at: null,
    created_at: "2026-07-08T10:00:00.000Z",
    updated_at: "2026-07-08T10:00:00.000Z",
    ...input,
  };
}

function makeSourceJob() {
  return {
    id: SOURCE_JOB_ID,
    customer_id: "customer-1",
    title: "Heat pump install",
    job_type: "ecc",
    job_display_number: "J-100",
    job_address: "Fallback address",
    city: "Los Angeles",
    customer_first_name: "Alice",
    customer_last_name: "Customer",
    customer_phone: "555-0101",
    customer_email: "job@example.com",
    job_notes: "Install scope notes",
    permit_number: "PERMIT-100",
    visit_scope_summary: "HERS testing",
    visit_scope_items: [{ title: "Duct leakage", details: "Test ducts", kind: "primary" }],
    locations: {
      address_line1: "1 Main St",
      address_line2: "Suite 2",
      city: "Los Angeles",
      state: "CA",
      zip: "90001",
    },
  };
}

function makeAdminFixture(seed: {
  connections?: MockConnection[];
  requests?: MockRequest[];
  customers?: any[];
} = {}) {
  const connections = [...(seed.connections ?? [makeConnection()])];
  const requests = [...(seed.requests ?? [])];
  const customers = [...(seed.customers ?? [{
    id: "customer-1",
    owner_user_id: SENDER_ACCOUNT_ID,
    full_name: "Alice Customer",
    billing_name: null,
    first_name: "Alice",
    last_name: "Customer",
    phone: "555-0100",
    email: "alice@example.com",
  }])];
  const tableCalls: string[] = [];
  const insertCalls: Array<Record<string, unknown>> = [];
  const updateCalls: Array<Record<string, unknown>> = [];

  const queryRows = (table: string) => {
    if (table === "account_workshare_connections") return connections;
    if (table === "account_workshare_requests") return requests;
    if (table === "customers") return customers;
    throw new Error(`Unexpected table ${table}`);
  };

  const admin = {
    from: vi.fn((table: string) => {
      tableCalls.push(table);
      const state = {
        eq: [] as Array<[string, unknown]>,
      };
      const applyFilters = () => queryRows(table).filter((row: any) =>
        state.eq.every(([column, value]) => row?.[column] === value));

      const selectBuilder: any = {
        eq: vi.fn((column: string, value: unknown) => {
          state.eq.push([column, value]);
          return selectBuilder;
        }),
        maybeSingle: vi.fn(async () => ({ data: applyFilters()[0] ?? null, error: null })),
      };

      const updateBuilder = (updates: Record<string, unknown>) => {
        const updateState = {
          eq: [] as Array<[string, unknown]>,
        };
        const scopedRows = () => requests.filter((row: any) =>
          updateState.eq.every(([column, value]) => row?.[column] === value));
        const chain: any = {
          eq: vi.fn((column: string, value: unknown) => {
            updateState.eq.push([column, value]);
            return chain;
          }),
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => {
              const target = scopedRows()[0] ?? null;
              if (!target) return { data: null, error: null };
              const next = { ...target, ...updates };
              const index = requests.findIndex((row) => row.id === target.id);
              requests[index] = next;
              updateCalls.push(updates);
              return { data: next, error: null };
            }),
          })),
        };
        return chain;
      };

      return {
        select: vi.fn(() => selectBuilder),
        insert: vi.fn((payload: Record<string, unknown>) => {
          insertCalls.push(payload);
          const now = "2026-07-08T10:00:00.000Z";
          const row = makeRequest({
            ...payload,
            id: REQUEST_ID,
            created_at: now,
            updated_at: now,
          } as Partial<MockRequest>);
          requests.push(row);
          return {
            select: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: row, error: null })),
            })),
          };
        }),
        update: vi.fn((updates: Record<string, unknown>) => updateBuilder(updates)),
      };
    }),
  };

  return {
    admin,
    tableCalls,
    insertCalls,
    updateCalls,
    getRequests: () => [...requests],
  };
}

function setActor(accountOwnerUserId = SENDER_ACCOUNT_ID) {
  createClientMock.mockResolvedValue({});
  requireInternalUserMock.mockResolvedValue({
    userId: SENDER_USER_ID,
    internalUser: {
      user_id: SENDER_USER_ID,
      role: "admin",
      is_active: true,
      account_owner_user_id: accountOwnerUserId,
      created_by: null,
    },
  });
}

describe("account workshare requests actions", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    createAdminClientMock.mockReset();
    requireInternalUserMock.mockReset();
    loadScopedInternalJobForMutationMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("sender can create request through active ECC/HERS connection with safe snapshots only", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor();
    loadScopedInternalJobForMutationMock.mockResolvedValue(makeSourceJob());

    const result = await createAccountWorkshareRequestFromJob({
      connectionId: CONNECTION_ID,
      sourceJobId: SOURCE_JOB_ID,
      requestedScope: "HERS testing requested",
      senderNotes: "Use side gate",
      preferredDate: "2026-07-15",
      preferredWindow: "Morning",
      receiverAccountId: "spoofed-receiver",
    } as any);

    expect(result.success).toBe(true);
    expect(fixture.insertCalls).toHaveLength(1);
    expect(fixture.insertCalls[0]).toMatchObject({
      connection_id: CONNECTION_ID,
      sender_account_id: SENDER_ACCOUNT_ID,
      receiver_account_id: RECEIVER_ACCOUNT_ID,
      source_job_id: SOURCE_JOB_ID,
      receiving_job_id: null,
      request_type: "ecc_hers_testing",
      status: "sent",
      customer_name_snapshot: "Alice Customer",
      location_city_snapshot: "Los Angeles",
      source_job_title_snapshot: "Heat pump install",
      permit_number_snapshot: "PERMIT-100",
      sender_notes_snapshot: "Use side gate",
      preferred_date: "2026-07-15",
      preferred_window_snapshot: "Morning",
      created_by_user_id: SENDER_USER_ID,
    });
    expect(fixture.insertCalls[0]?.requested_scope_snapshot).toMatchObject({
      requested_scope_text: "HERS testing requested",
      source_visit_scope_summary: "HERS testing",
    });
    expect(new Set(fixture.tableCalls)).toEqual(new Set([
      "account_workshare_connections",
      "customers",
      "job_systems",
      "job_equipment",
      "account_workshare_requests",
    ]));
    expect(fixture.tableCalls.join(" ")).not.toContain("jobs");
    expect(fixture.tableCalls.join(" ")).not.toContain("ecc_test_runs");
    expect(fixture.tableCalls.join(" ")).not.toContain("contractor_users");
    expect(fixture.tableCalls.join(" ")).not.toContain("contractors");
  });

  it("pending, disabled, and revoked connections cannot create requests", async () => {
    for (const status of ["pending", "disabled", "revoked"] as const) {
      const fixture = makeAdminFixture({ connections: [makeConnection({ status })] });
      createAdminClientMock.mockReturnValue(fixture.admin);
      setActor();
      loadScopedInternalJobForMutationMock.mockResolvedValue(makeSourceJob());

      await expect(createAccountWorkshareRequestFromJob({
        connectionId: CONNECTION_ID,
        sourceJobId: SOURCE_JOB_ID,
      })).resolves.toMatchObject({
        success: false,
        error: "Only active ECC/HERS rater connections can receive requests.",
      });
      expect(fixture.insertCalls).toHaveLength(0);
    }
  });

  it("source job must belong to sender account before request insert", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor();
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const result = await createAccountWorkshareRequestFromJob({
      connectionId: CONNECTION_ID,
      sourceJobId: SOURCE_JOB_ID,
    });

    expect(result).toMatchObject({
      success: false,
      error: "Source job must belong to the current account.",
    });
    expect(fixture.insertCalls).toHaveLength(0);
  });

  it("unrelated account cannot create through another account connection", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor(UNRELATED_ACCOUNT_ID);
    loadScopedInternalJobForMutationMock.mockResolvedValue(makeSourceJob());

    const result = await createAccountWorkshareRequestFromJob({
      connectionId: CONNECTION_ID,
      sourceJobId: SOURCE_JOB_ID,
    });

    expect(result).toMatchObject({
      success: false,
      error: "Current account must be the sender account for this connection.",
    });
    expect(fixture.insertCalls).toHaveLength(0);
  });

  it("sender can cancel sent request", async () => {
    const fixture = makeAdminFixture({ requests: [makeRequest()] });
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor();

    const result = await cancelAccountWorkshareRequest({ requestId: REQUEST_ID });

    expect(result.success).toBe(true);
    expect(result.success ? result.request.status : null).toBe("cancelled");
    expect(fixture.updateCalls[0]).toMatchObject({ status: "cancelled" });
    expect(fixture.updateCalls[0]?.cancelled_at).toEqual(expect.any(String));
  });

  it("unrelated account and receiver cannot cancel sender request in P1-C", async () => {
    for (const accountOwnerUserId of [UNRELATED_ACCOUNT_ID, RECEIVER_ACCOUNT_ID]) {
      const fixture = makeAdminFixture({ requests: [makeRequest()] });
      createAdminClientMock.mockReturnValue(fixture.admin);
      setActor(accountOwnerUserId);

      await expect(cancelAccountWorkshareRequest({ requestId: REQUEST_ID })).resolves.toMatchObject({
        success: false,
        error: "Only the sender account can cancel this request.",
      });
      expect(fixture.updateCalls).toHaveLength(0);
    }
  });

  it("form wrapper redirects back to source job success notice", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor();
    loadScopedInternalJobForMutationMock.mockResolvedValue(makeSourceJob());

    const formData = new FormData();
    formData.set("connection_id", CONNECTION_ID);
    formData.set("source_job_id", SOURCE_JOB_ID);
    formData.set("requested_scope", "HERS testing");

    await expect(createAccountWorkshareRequestFromJobForm(formData)).rejects.toThrow(
      `REDIRECT:/jobs/${SOURCE_JOB_ID}?notice=workshare_request_sent#account-workshare-requests`,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(`/jobs/${SOURCE_JOB_ID}`);
  });

  it("source guard: actions do not create receiver jobs, ECC test runs, portal users, or contractor records", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(
      path.join(process.cwd(), "lib", "workflows", "account-workshare-requests-actions.ts"),
      "utf8",
    );

    expect(source).not.toContain(".from(\"jobs\").insert");
    expect(source).not.toContain("ecc_test_runs");
    expect(source).not.toContain("contractor_users");
    expect(source).not.toContain("contractor_invites");
    expect(source).not.toContain(".from(\"contractors\")");
    expect(source).not.toContain("/portal");
  });
});
