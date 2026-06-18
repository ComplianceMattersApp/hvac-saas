import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const revalidatePathMock = vi.fn();
const ORIGINAL_PERMIT_ALLOWLIST = process.env.ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS;

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

type FixtureOptions = {
  internalUser?: boolean;
  contractorOwnerId?: string;
  schemaUnavailable?: boolean;
  permitRequestOwnerId?: string;
  permitRequestStatus?: string;
  permitRequestAcceptedByUserId?: string | null;
  permitRequestAcceptedAt?: string | null;
  permitRequestFields?: Record<string, unknown>;
  customerOwnerId?: string;
  locationOwnerId?: string;
  locationCustomerId?: string;
  jobRow?: Record<string, unknown> | null;
};

function makeSchemaUnavailableError() {
  return {
    code: "PGRST205",
    message: "Could not find the table 'public.permit_requests' in the schema cache",
  };
}

function buildFixture(options?: FixtureOptions) {
  const calls = {
    permitRequestInsertPayloads: [] as Array<Record<string, unknown>>,
    permitRequestUpdatePayloads: [] as Array<Record<string, unknown>>,
    permitEventInsertPayloads: [] as Array<Record<string, unknown>>,
    customerInsertPayloads: [] as Array<Record<string, unknown>>,
    locationInsertPayloads: [] as Array<Record<string, unknown>>,
    serviceCaseInsertPayloads: [] as Array<Record<string, unknown>>,
    jobInsertPayloads: [] as Array<Record<string, unknown>>,
    jobUpdatePayloads: [] as Array<Record<string, unknown>>,
    jobEventInsertPayloads: [] as Array<Record<string, unknown>>,
    jobReads: 0,
    jobMutations: 0,
    jobEventMutations: 0,
  };

  const baseClient = {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: options?.internalUser === false ? "contractor-user-1" : "internal-user-1",
          },
        },
        error: null,
      })),
    },
    from(table: string) {
      if (table === "internal_users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: options?.internalUser === false
                  ? null
                  : {
                      user_id: "internal-user-1",
                      role: "office",
                      is_active: true,
                      account_owner_user_id: "owner-1",
                      created_by: null,
                    },
                error: null,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected base table: ${table}`);
    },
  };

  const adminClient = {
    from(table: string) {
      if (table === "permit_requests") {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          limit: vi.fn(async () => ({
            data: options?.schemaUnavailable ? null : [],
            error: options?.schemaUnavailable ? makeSchemaUnavailableError() : null,
          })),
          maybeSingle: vi.fn(async () => ({
            data: options?.schemaUnavailable
              ? null
              : {
                  id: "permit-1",
                  account_owner_user_id: options?.permitRequestOwnerId ?? "owner-1",
                  contractor_id: "ctr-1",
                  status: options?.permitRequestStatus ?? "permit_request",
                  accepted_by_user_id: options?.permitRequestAcceptedByUserId ?? null,
                  accepted_at: options?.permitRequestAcceptedAt ?? null,
                  request_label: "Old label",
                  customer_first_name_snapshot: "Old",
                  customer_last_name_snapshot: "Customer",
                  service_address_text_snapshot: "Old address",
                  jurisdiction: "Old jurisdiction",
                  internal_intake_note: "Old internal note",
                  contractor_note: "Old contractor note",
                  permit_number: null,
                  permit_date: null,
                  job_id: "job-1",
                  service_case_id: "case-1",
                  ...(options?.permitRequestFields ?? {}),
                },
            error: options?.schemaUnavailable ? makeSchemaUnavailableError() : null,
          })),
          insert: vi.fn((payload: Record<string, unknown>) => {
            calls.permitRequestInsertPayloads.push(payload);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "permit-1" }, error: null })),
              })),
            };
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            calls.permitRequestUpdatePayloads.push(payload);
            return chain;
          }),
        };
        return chain;
      }

      if (table === "contractors") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: "ctr-1",
                  owner_user_id: options?.contractorOwnerId ?? "owner-1",
                  name: "Delta HVAC",
                },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "permit_request_events") {
        return {
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            calls.permitEventInsertPayloads.push(payload);
            return { data: payload, error: null };
          }),
        };
      }

      if (table === "jobs") {
        calls.jobMutations += 1;
        const defaultJob = {
          id: "job-1",
          customer_id: "customer-1",
          service_case_id: "case-1",
          status: "open",
          ops_status: "pending_info",
          scheduled_date: null,
          window_start: null,
          window_end: null,
          field_complete: false,
          deleted_at: null,
          permit_number: null,
          jurisdiction: null,
          permit_date: null,
          pending_info_reason: "Permit Needed",
          on_hold_reason: null,
        };
        const jobRow = options?.jobRow === null
          ? null
          : {
              ...defaultJob,
              ...(options?.jobRow ?? {}),
            };
        const chain: any = {
          select: vi.fn(() => {
            calls.jobReads += 1;
            return chain;
          }),
          insert: vi.fn((payload: Record<string, unknown>) => {
            calls.jobInsertPayloads.push(payload);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: "created-job-1",
                    customer_id: payload.customer_id,
                    location_id: payload.location_id,
                    service_case_id: null,
                    parent_job_id: null,
                    title: payload.title,
                    job_notes: payload.job_notes,
                    job_display_number: "J-100",
                  },
                  error: null,
                })),
              })),
            };
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            calls.jobUpdatePayloads.push(payload);
            return chain;
          }),
          eq: vi.fn(() => chain),
          is: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => ({ data: jobRow, error: null })),
        };
        return chain;
      }

      if (table === "customers") {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => ({
            data: options?.customerOwnerId === "owner-2"
              ? null
              : {
                  id: "customer-1",
                  owner_user_id: options?.customerOwnerId ?? "owner-1",
                  first_name: "Existing",
                  last_name: "Customer",
                  full_name: "Existing Customer",
                  email: "existing@example.com",
                  phone: "555-1111",
                },
            error: null,
          })),
          insert: vi.fn((payload: Record<string, unknown>) => {
            calls.customerInsertPayloads.push(payload);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: "created-customer-1",
                    ...payload,
                  },
                  error: null,
                })),
              })),
            };
          }),
        };
        return chain;
      }

      if (table === "locations") {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => ({
            data: options?.locationOwnerId === "owner-2"
              ? null
              : {
                  id: "location-1",
                  customer_id: options?.locationCustomerId ?? "customer-1",
                  owner_user_id: options?.locationOwnerId ?? "owner-1",
                  address_line1: "100 Main St",
                  address_line2: null,
                  city: "Fresno",
                  state: "CA",
                  zip: "93720",
                  postal_code: "93720",
                  nickname: "Main",
                },
            error: null,
          })),
          insert: vi.fn((payload: Record<string, unknown>) => {
            calls.locationInsertPayloads.push(payload);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: "created-location-1",
                    ...payload,
                  },
                  error: null,
                })),
              })),
            };
          }),
        };
        return chain;
      }

      if (table === "service_cases") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            calls.serviceCaseInsertPayloads.push(payload);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { id: "created-case-1" },
                  error: null,
                })),
              })),
            };
          }),
        };
      }

      if (table === "job_events") {
        calls.jobEventMutations += 1;
        return {
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            calls.jobEventInsertPayloads.push(payload);
            return { data: payload, error: null };
          }),
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    },
  };

  return {
    baseClient,
    adminClient,
    calls,
  };
}

describe("internal manual permit request actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS = "owner-1";
  });

  afterEach(() => {
    if (typeof ORIGINAL_PERMIT_ALLOWLIST === "string") {
      process.env.ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS = ORIGINAL_PERMIT_ALLOWLIST;
    } else {
      delete process.env.ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS;
    }
  });

  it("allows an internal user to create a manual request assigned to an account contractor", async () => {
    const fixture = buildFixture();
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { createInternalManualPermitRequest } = await import("@/lib/actions/internal-permit-request-actions");

    const result = await createInternalManualPermitRequest({
      contractorId: "ctr-1",
      requestLabel: "Texted signed contract",
      intakeNote: "Customer sent permit packet by text.",
      customerFirstName: "Ada",
      customerLastName: "Lovelace",
      serviceAddressText: "10 Main St",
      jurisdiction: "Fresno",
    });

    expect(result).toEqual({ permitRequestId: "permit-1" });
    expect(fixture.calls.permitRequestInsertPayloads).toEqual([
      {
        account_owner_user_id: "owner-1",
        contractor_id: "ctr-1",
        status: "permit_request",
        request_label: "Texted signed contract",
        customer_first_name_snapshot: "Ada",
        customer_last_name_snapshot: "Lovelace",
        service_address_text_snapshot: "10 Main St",
        internal_intake_note: [
          "Request: Texted signed contract",
          "Note: Customer sent permit packet by text.",
          "Customer: Ada Lovelace",
          "Service address: 10 Main St",
        ].join("\n"),
        jurisdiction: "Fresno",
        submitted_by_user_id: "internal-user-1",
      },
    ]);
    expect(fixture.calls.permitRequestInsertPayloads[0]).not.toHaveProperty("accepted_by_user_id");
    expect(fixture.calls.permitRequestInsertPayloads[0]).not.toHaveProperty("completed_by_user_id");
    expect(fixture.calls.permitRequestInsertPayloads[0]).not.toHaveProperty("completed_at");
    expect(fixture.calls.permitRequestInsertPayloads[0]).not.toHaveProperty("post_permit_route");
    expect(fixture.calls.permitRequestInsertPayloads[0]).not.toHaveProperty("job_id");
    expect(fixture.calls.permitRequestInsertPayloads[0]).not.toHaveProperty("ops_status");
  });

  it("records a permit_request_received event with internal_manual source metadata", async () => {
    const fixture = buildFixture();
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { createInternalManualPermitRequest } = await import("@/lib/actions/internal-permit-request-actions");

    await createInternalManualPermitRequest({
      contractorId: "ctr-1",
      intakeNote: "Office received photo.",
    });

    expect(fixture.calls.permitEventInsertPayloads).toEqual([
      expect.objectContaining({
        account_owner_user_id: "owner-1",
        permit_request_id: "permit-1",
        event_type: "permit_request_received",
        actor_user_id: "internal-user-1",
        to_status: "permit_request",
        meta: expect.objectContaining({
          source: "internal_manual",
          contractor_id: "ctr-1",
          contractor_name: "Delta HVAC",
          note_snippet: "Office received photo.",
        }),
      }),
    ]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/ops");
  });

  it("rejects contractor assignments outside the internal account scope", async () => {
    const fixture = buildFixture({ contractorOwnerId: "owner-2" });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { createInternalManualPermitRequest } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      createInternalManualPermitRequest({
        contractorId: "ctr-1",
        requestLabel: "Phone request",
      }),
    ).rejects.toThrow("Contractor not found in your account.");
    expect(fixture.calls.permitRequestInsertPayloads).toHaveLength(0);
    expect(fixture.calls.permitEventInsertPayloads).toHaveLength(0);
  });

  it("requires an active internal user", async () => {
    const fixture = buildFixture({ internalUser: false });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { createInternalManualPermitRequest } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      createInternalManualPermitRequest({
        contractorId: "ctr-1",
        requestLabel: "Contractor should not create internally",
      }),
    ).rejects.toThrow("Active internal user required.");
    expect(fixture.calls.permitRequestInsertPayloads).toHaveLength(0);
  });

  it("fails closed when permit request schema is unavailable", async () => {
    const fixture = buildFixture({ schemaUnavailable: true });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { createInternalManualPermitRequest } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      createInternalManualPermitRequest({
        contractorId: "ctr-1",
        requestLabel: "Email request",
      }),
    ).rejects.toThrow("Permit requests are temporarily unavailable.");
    expect(fixture.calls.permitRequestInsertPayloads).toHaveLength(0);
    expect(fixture.calls.permitEventInsertPayloads).toHaveLength(0);
  });

  it("fails closed when permit workflow is disabled for the account owner", async () => {
    const fixture = buildFixture();
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);
    delete process.env.ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS;

    const { createInternalManualPermitRequest } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      createInternalManualPermitRequest({
        contractorId: "ctr-1",
        requestLabel: "Email request",
      }),
    ).rejects.toThrow("Permit workflow is unavailable for this account.");
    expect(fixture.calls.permitRequestInsertPayloads).toHaveLength(0);
    expect(fixture.calls.permitEventInsertPayloads).toHaveLength(0);
  });

  it("does not mutate jobs, job_events, or lifecycle state", async () => {
    const fixture = buildFixture();
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { createInternalManualPermitRequest } = await import("@/lib/actions/internal-permit-request-actions");

    await createInternalManualPermitRequest({
      contractorId: "ctr-1",
      requestLabel: "Manual intake",
    });

    expect(fixture.calls.jobMutations).toBe(0);
    expect(fixture.calls.jobEventMutations).toBe(0);
    expect(fixture.calls.permitRequestInsertPayloads[0]).not.toHaveProperty("ops_status");
  });

  it("accepts a new permit request into active processing", async () => {
    const fixture = buildFixture({ permitRequestStatus: "permit_request" });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { acceptInternalPermitRequest } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(acceptInternalPermitRequest({ permitRequestId: "permit-1" })).resolves.toMatchObject({
      permitRequestId: "permit-1",
      status: "accepted_in_process",
    });

    expect(fixture.calls.permitRequestUpdatePayloads).toEqual([
      expect.objectContaining({
        status: "accepted_in_process",
        accepted_by_user_id: "internal-user-1",
        hold_reason: null,
        on_hold_at: null,
      }),
    ]);
    expect(fixture.calls.permitRequestUpdatePayloads[0].accepted_at).toEqual(expect.any(String));
    expect(fixture.calls.permitEventInsertPayloads).toEqual([
      expect.objectContaining({
        event_type: "permit_request_accepted",
        from_status: "permit_request",
        to_status: "accepted_in_process",
        meta: expect.objectContaining({
          source: "internal_ops",
          from_status: "permit_request",
          to_status: "accepted_in_process",
        }),
      }),
    ]);
  });

  it.each(["permit_request", "accepted_in_process"])(
    "puts %s permit requests on hold for additional information",
    async (status) => {
      const fixture = buildFixture({ permitRequestStatus: status });
      createClientMock.mockResolvedValue(fixture.baseClient);
      createAdminClientMock.mockReturnValue(fixture.adminClient);

      const { holdInternalPermitRequest } = await import("@/lib/actions/internal-permit-request-actions");

      await expect(holdInternalPermitRequest({ permitRequestId: "permit-1" })).resolves.toMatchObject({
        permitRequestId: "permit-1",
        status: "on_hold_additional_info_needed",
      });

      expect(fixture.calls.permitRequestUpdatePayloads).toEqual([
        expect.objectContaining({
          status: "on_hold_additional_info_needed",
          hold_reason: "additional_information_needed",
        }),
      ]);
      expect(fixture.calls.permitRequestUpdatePayloads[0].on_hold_at).toEqual(expect.any(String));
      expect(fixture.calls.permitEventInsertPayloads).toEqual([
        expect.objectContaining({
          event_type: "permit_request_on_hold",
          from_status: status,
          to_status: "on_hold_additional_info_needed",
          meta: expect.objectContaining({
            source: "internal_ops",
            hold_reason: "additional_information_needed",
            from_status: status,
            to_status: "on_hold_additional_info_needed",
          }),
        }),
      ]);
    },
  );

  it("resumes an on-hold permit request back to active processing", async () => {
    const fixture = buildFixture({
      permitRequestStatus: "on_hold_additional_info_needed",
      permitRequestAcceptedByUserId: "original-user",
      permitRequestAcceptedAt: "2026-06-01T12:00:00.000Z",
    });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { resumeInternalPermitRequest } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(resumeInternalPermitRequest({ permitRequestId: "permit-1" })).resolves.toMatchObject({
      permitRequestId: "permit-1",
      status: "accepted_in_process",
    });

    expect(fixture.calls.permitRequestUpdatePayloads).toEqual([
      {
        status: "accepted_in_process",
        accepted_by_user_id: "original-user",
        accepted_at: "2026-06-01T12:00:00.000Z",
        hold_reason: null,
        on_hold_at: null,
      },
    ]);
    expect(fixture.calls.permitEventInsertPayloads).toEqual([
      expect.objectContaining({
        event_type: "permit_request_accepted",
        from_status: "on_hold_additional_info_needed",
        to_status: "accepted_in_process",
        meta: expect.objectContaining({
          source: "internal_ops",
          transition: "resume_from_hold",
        }),
      }),
    ]);
  });

  it("rejects active-state actions for contractors and out-of-account permit requests", async () => {
    const contractorFixture = buildFixture({ internalUser: false });
    createClientMock.mockResolvedValue(contractorFixture.baseClient);
    createAdminClientMock.mockReturnValue(contractorFixture.adminClient);

    const { acceptInternalPermitRequest } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(acceptInternalPermitRequest({ permitRequestId: "permit-1" })).rejects.toThrow(
      "Active internal user required.",
    );
    expect(contractorFixture.calls.permitRequestUpdatePayloads).toHaveLength(0);

    vi.resetModules();
    const outOfAccountFixture = buildFixture({ permitRequestOwnerId: "owner-2" });
    createClientMock.mockResolvedValue(outOfAccountFixture.baseClient);
    createAdminClientMock.mockReturnValue(outOfAccountFixture.adminClient);

    const { holdInternalPermitRequest } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(holdInternalPermitRequest({ permitRequestId: "permit-1" })).rejects.toThrow(
      "Permit request not found in your account.",
    );
    expect(outOfAccountFixture.calls.permitRequestUpdatePayloads).toHaveLength(0);
  });

  it("fails closed for active-state actions when schema is unavailable", async () => {
    const fixture = buildFixture({ schemaUnavailable: true });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { resumeInternalPermitRequest } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(resumeInternalPermitRequest({ permitRequestId: "permit-1" })).rejects.toThrow(
      "Permit requests are temporarily unavailable.",
    );
    expect(fixture.calls.permitRequestUpdatePayloads).toHaveLength(0);
    expect(fixture.calls.permitEventInsertPayloads).toHaveLength(0);
  });

  it("fails closed for active-state actions when permit workflow is disabled", async () => {
    const fixture = buildFixture({ permitRequestStatus: "accepted_in_process" });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);
    delete process.env.ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS;

    const { markInternalPermitCreated } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      markInternalPermitCreated({
        permitRequestId: "permit-1",
        postPermitRoute: "ready_for_testing",
        permitNumber: "P-999",
      }),
    ).rejects.toThrow("Permit workflow is unavailable for this account.");
    expect(fixture.calls.permitRequestUpdatePayloads).toHaveLength(0);
    expect(fixture.calls.permitEventInsertPayloads).toHaveLength(0);
    expect(fixture.calls.jobUpdatePayloads).toHaveLength(0);
  });

  it("active-state actions do not mutate jobs, job_events, or ops_status", async () => {
    const fixture = buildFixture({ permitRequestStatus: "accepted_in_process" });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { holdInternalPermitRequest } = await import("@/lib/actions/internal-permit-request-actions");

    await holdInternalPermitRequest({ permitRequestId: "permit-1" });

    expect(fixture.calls.jobMutations).toBe(0);
    expect(fixture.calls.jobEventMutations).toBe(0);
    expect(fixture.calls.permitRequestUpdatePayloads[0]).not.toHaveProperty("ops_status");
  });

  it("updates internal permit intake details without changing active status", async () => {
    const fixture = buildFixture({
      permitRequestStatus: "accepted_in_process",
      permitRequestFields: {
        request_label: "Old label",
        permit_number: null,
      },
    });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { updateInternalPermitRequestIntake } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      updateInternalPermitRequestIntake({
        permitRequestId: "permit-1",
        requestLabel: "Reviewed signed contract",
        customerFirstName: "Ada",
        customerLastName: "Lovelace",
        serviceAddressText: "10 Main St",
        jurisdiction: "Fresno",
        internalIntakeNote: "Need to verify parcel number.",
        contractorNote: "Contractor uploaded contract photo.",
        permitNumber: "P-123",
        permitDate: "2026-06-16",
      }),
    ).resolves.toMatchObject({
      permitRequestId: "permit-1",
      status: "accepted_in_process",
      changedFields: expect.arrayContaining(["request_label", "permit_number"]),
    });

    expect(fixture.calls.permitRequestUpdatePayloads).toEqual([
      {
        request_label: "Reviewed signed contract",
        customer_first_name_snapshot: "Ada",
        customer_last_name_snapshot: "Lovelace",
        service_address_text_snapshot: "10 Main St",
        jurisdiction: "Fresno",
        internal_intake_note: "Need to verify parcel number.",
        contractor_note: "Contractor uploaded contract photo.",
        permit_number: "P-123",
        permit_date: "2026-06-16",
      },
    ]);
    expect(fixture.calls.permitRequestUpdatePayloads[0]).not.toHaveProperty("status");
    expect(fixture.calls.permitEventInsertPayloads).toEqual([
      expect.objectContaining({
        event_type: "permit_request_intake_updated",
        from_status: "accepted_in_process",
        to_status: "accepted_in_process",
        meta: expect.objectContaining({
          source: "internal_ops",
          changed_fields: expect.arrayContaining(["request_label", "permit_number"]),
        }),
      }),
    ]);
  });

  it("rejects intake updates for contractors, out-of-account requests, and unavailable schema", async () => {
    const contractorFixture = buildFixture({ internalUser: false });
    createClientMock.mockResolvedValue(contractorFixture.baseClient);
    createAdminClientMock.mockReturnValue(contractorFixture.adminClient);

    const { updateInternalPermitRequestIntake } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      updateInternalPermitRequestIntake({ permitRequestId: "permit-1", requestLabel: "Nope" }),
    ).rejects.toThrow("Active internal user required.");
    expect(contractorFixture.calls.permitRequestUpdatePayloads).toHaveLength(0);

    vi.resetModules();
    const outOfAccountFixture = buildFixture({ permitRequestOwnerId: "owner-2" });
    createClientMock.mockResolvedValue(outOfAccountFixture.baseClient);
    createAdminClientMock.mockReturnValue(outOfAccountFixture.adminClient);

    const { updateInternalPermitRequestIntake: updateOutOfAccount } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      updateOutOfAccount({ permitRequestId: "permit-1", requestLabel: "Nope" }),
    ).rejects.toThrow("Permit request not found in your account.");
    expect(outOfAccountFixture.calls.permitRequestUpdatePayloads).toHaveLength(0);

    vi.resetModules();
    const schemaFixture = buildFixture({ schemaUnavailable: true });
    createClientMock.mockResolvedValue(schemaFixture.baseClient);
    createAdminClientMock.mockReturnValue(schemaFixture.adminClient);

    const { updateInternalPermitRequestIntake: updateSchemaUnavailable } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      updateSchemaUnavailable({ permitRequestId: "permit-1", requestLabel: "Nope" }),
    ).rejects.toThrow("Permit requests are temporarily unavailable.");
    expect(schemaFixture.calls.permitRequestUpdatePayloads).toHaveLength(0);
  });

  it("marks an active permit created and routes a safe unscheduled job to scheduling", async () => {
    const fixture = buildFixture({
      permitRequestStatus: "accepted_in_process",
      permitRequestFields: {
        job_id: "job-1",
        service_case_id: "case-1",
      },
      jobRow: {
        ops_status: "pending_info",
        pending_info_reason: "Permit Needed",
      },
    });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { markInternalPermitCreated } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      markInternalPermitCreated({
        permitRequestId: "permit-1",
        postPermitRoute: "ready_for_testing",
        permitNumber: "P-123",
        jurisdiction: "Fresno",
        permitDate: "2026-06-16",
      }),
    ).resolves.toMatchObject({
      permitRequestId: "permit-1",
      status: "permit_created",
      postPermitRoute: "ready_for_testing",
      jobId: "job-1",
      jobOpsStatusBefore: "pending_info",
      jobOpsStatusAfter: "need_to_schedule",
    });

    expect(fixture.calls.permitRequestUpdatePayloads).toEqual([
      expect.objectContaining({
        status: "permit_created",
        post_permit_route: "ready_for_testing",
        permit_number: "P-123",
        jurisdiction: "Fresno",
        permit_date: "2026-06-16",
        completed_by_user_id: "internal-user-1",
      }),
    ]);
    expect(fixture.calls.permitRequestUpdatePayloads[0].completed_at).toEqual(expect.any(String));
    expect(fixture.calls.jobUpdatePayloads).toEqual([
      {
        permit_number: "P-123",
        jurisdiction: "Fresno",
        permit_date: "2026-06-16",
        ops_status: "need_to_schedule",
        pending_info_reason: null,
      },
    ]);
    expect(fixture.calls.permitEventInsertPayloads).toEqual([
      expect.objectContaining({
        event_type: "permit_created",
        from_status: "accepted_in_process",
        to_status: "permit_created",
        post_permit_route: "ready_for_testing",
        job_id: "job-1",
        service_case_id: "case-1",
        meta: expect.objectContaining({
          source: "internal_ops",
          permit_request_id: "permit-1",
          job_ops_status_before: "pending_info",
          job_ops_status_after: "need_to_schedule",
        }),
      }),
      expect.objectContaining({
        event_type: "permit_ready_for_testing",
        post_permit_route: "ready_for_testing",
      }),
    ]);
    expect(fixture.calls.jobEventInsertPayloads).toEqual([
      expect.objectContaining({
        job_id: "job-1",
        event_type: "permit_created",
        user_id: "internal-user-1",
        meta: expect.objectContaining({
          event_family: "permit_workflow",
          permit_request_id: "permit-1",
          post_permit_route: "ready_for_testing",
          permit_number: "P-123",
          job_ops_status_before: "pending_info",
          job_ops_status_after: "need_to_schedule",
          timeline_v: 1,
        }),
      }),
    ]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/ops");
    expect(revalidatePathMock).toHaveBeenCalledWith("/jobs/job-1");
  });

  it("marks permit created without altering an already scheduled ready-for-testing job schedule", async () => {
    const fixture = buildFixture({
      permitRequestStatus: "accepted_in_process",
      jobRow: {
        ops_status: "scheduled",
        scheduled_date: "2026-06-20",
        window_start: "08:00",
        window_end: "10:00",
        pending_info_reason: null,
      },
    });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { markInternalPermitCreated } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      markInternalPermitCreated({
        permitRequestId: "permit-1",
        postPermitRoute: "ready_for_testing",
        permitNumber: "P-124",
      }),
    ).resolves.toMatchObject({
      jobOpsStatusBefore: "scheduled",
      jobOpsStatusAfter: "scheduled",
    });

    expect(fixture.calls.jobUpdatePayloads).toEqual([
      {
        permit_number: "P-124",
        jurisdiction: null,
        permit_date: null,
      },
    ]);
    expect(fixture.calls.jobUpdatePayloads[0]).not.toHaveProperty("scheduled_date");
    expect(fixture.calls.jobUpdatePayloads[0]).not.toHaveProperty("window_start");
    expect(fixture.calls.jobUpdatePayloads[0]).not.toHaveProperty("window_end");
  });

  it("clears a scheduled job's permit-specific blocker without changing schedule fields", async () => {
    const fixture = buildFixture({
      permitRequestStatus: "accepted_in_process",
      jobRow: {
        ops_status: "pending_info",
        pending_info_reason: "Permit Needed",
        scheduled_date: "2026-06-20",
        window_start: "08:00",
        window_end: "10:00",
      },
    });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { markInternalPermitCreated } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      markInternalPermitCreated({
        permitRequestId: "permit-1",
        postPermitRoute: "ready_for_testing",
        permitNumber: "P-124B",
      }),
    ).resolves.toMatchObject({
      jobOpsStatusBefore: "pending_info",
      jobOpsStatusAfter: "scheduled",
    });

    expect(fixture.calls.jobUpdatePayloads).toEqual([
      {
        permit_number: "P-124B",
        jurisdiction: null,
        permit_date: null,
        ops_status: "scheduled",
        pending_info_reason: null,
      },
    ]);
    expect(fixture.calls.jobUpdatePayloads[0]).not.toHaveProperty("scheduled_date");
    expect(fixture.calls.jobUpdatePayloads[0]).not.toHaveProperty("window_start");
    expect(fixture.calls.jobUpdatePayloads[0]).not.toHaveProperty("window_end");
  });

  it("marks permit created and routes an unscheduled pending-install job to on hold", async () => {
    const fixture = buildFixture({
      permitRequestStatus: "on_hold_additional_info_needed",
      jobRow: {
        ops_status: "need_to_schedule",
        pending_info_reason: null,
      },
    });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { markInternalPermitCreated } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      markInternalPermitCreated({
        permitRequestId: "permit-1",
        postPermitRoute: "pending_install",
        permitNumber: "P-125",
      }),
    ).resolves.toMatchObject({
      status: "permit_created",
      postPermitRoute: "pending_install",
      jobOpsStatusAfter: "on_hold",
    });

    expect(fixture.calls.jobUpdatePayloads).toEqual([
      {
        permit_number: "P-125",
        jurisdiction: null,
        permit_date: null,
        ops_status: "on_hold",
        on_hold_reason: "Pending Install",
        pending_info_reason: null,
      },
    ]);
    expect(fixture.calls.permitEventInsertPayloads.map((event) => event.event_type)).toEqual([
      "permit_created",
      "permit_pending_install",
    ]);
  });

  it("rejects pending install for an already scheduled job without mutation", async () => {
    const fixture = buildFixture({
      permitRequestStatus: "accepted_in_process",
      jobRow: {
        ops_status: "scheduled",
        scheduled_date: "2026-06-20",
      },
    });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { markInternalPermitCreated } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      markInternalPermitCreated({
        permitRequestId: "permit-1",
        postPermitRoute: "pending_install",
        permitNumber: "P-126",
      }),
    ).rejects.toThrow("Pending install cannot be selected for an already scheduled job.");
    expect(fixture.calls.permitRequestUpdatePayloads).toHaveLength(0);
    expect(fixture.calls.jobUpdatePayloads).toHaveLength(0);
    expect(fixture.calls.permitEventInsertPayloads).toHaveLength(0);
  });

  it("rejects mark-created without a linked job or permit number", async () => {
    const noJobFixture = buildFixture({
      permitRequestFields: {
        job_id: null,
      },
    });
    createClientMock.mockResolvedValue(noJobFixture.baseClient);
    createAdminClientMock.mockReturnValue(noJobFixture.adminClient);

    const { markInternalPermitCreated } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      markInternalPermitCreated({
        permitRequestId: "permit-1",
        postPermitRoute: "ready_for_testing",
        permitNumber: "P-127",
      }),
    ).rejects.toThrow("Link a job before marking the permit created.");
    expect(noJobFixture.calls.permitRequestUpdatePayloads).toHaveLength(0);
    expect(noJobFixture.calls.jobUpdatePayloads).toHaveLength(0);

    vi.resetModules();
    const noPermitNumberFixture = buildFixture();
    createClientMock.mockResolvedValue(noPermitNumberFixture.baseClient);
    createAdminClientMock.mockReturnValue(noPermitNumberFixture.adminClient);

    const { markInternalPermitCreated: markWithoutPermitNumber } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      markWithoutPermitNumber({
        permitRequestId: "permit-1",
        postPermitRoute: "ready_for_testing",
        permitNumber: "",
      }),
    ).rejects.toThrow("Permit number is required.");
    expect(noPermitNumberFixture.calls.jobUpdatePayloads).toHaveLength(0);
  });

  it("rejects terminal permit requests and out-of-account linked jobs", async () => {
    const terminalFixture = buildFixture({ permitRequestStatus: "permit_created" });
    createClientMock.mockResolvedValue(terminalFixture.baseClient);
    createAdminClientMock.mockReturnValue(terminalFixture.adminClient);

    const { markInternalPermitCreated } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      markInternalPermitCreated({
        permitRequestId: "permit-1",
        postPermitRoute: "ready_for_testing",
        permitNumber: "P-128",
      }),
    ).rejects.toThrow("Permit request is not active.");
    expect(terminalFixture.calls.permitRequestUpdatePayloads).toHaveLength(0);

    vi.resetModules();
    const outOfAccountJobFixture = buildFixture({ customerOwnerId: "owner-2" });
    createClientMock.mockResolvedValue(outOfAccountJobFixture.baseClient);
    createAdminClientMock.mockReturnValue(outOfAccountJobFixture.adminClient);

    const { markInternalPermitCreated: markOutOfAccountJob } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      markOutOfAccountJob({
        permitRequestId: "permit-1",
        postPermitRoute: "ready_for_testing",
        permitNumber: "P-129",
      }),
    ).rejects.toThrow("Linked job not found in your account.");
    expect(outOfAccountJobFixture.calls.permitRequestUpdatePayloads).toHaveLength(0);
    expect(outOfAccountJobFixture.calls.jobUpdatePayloads).toHaveLength(0);
  });

  it("rejects contractors, protected job states, and unrelated blockers without mutation", async () => {
    const contractorFixture = buildFixture({ internalUser: false });
    createClientMock.mockResolvedValue(contractorFixture.baseClient);
    createAdminClientMock.mockReturnValue(contractorFixture.adminClient);

    const { markInternalPermitCreated } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      markInternalPermitCreated({
        permitRequestId: "permit-1",
        postPermitRoute: "ready_for_testing",
        permitNumber: "P-130",
      }),
    ).rejects.toThrow("Active internal user required.");
    expect(contractorFixture.calls.permitRequestUpdatePayloads).toHaveLength(0);

    vi.resetModules();
    const protectedFixture = buildFixture({
      jobRow: {
        ops_status: "failed",
      },
    });
    createClientMock.mockResolvedValue(protectedFixture.baseClient);
    createAdminClientMock.mockReturnValue(protectedFixture.adminClient);

    const { markInternalPermitCreated: markProtected } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      markProtected({
        permitRequestId: "permit-1",
        postPermitRoute: "ready_for_testing",
        permitNumber: "P-131",
      }),
    ).rejects.toThrow("Linked job has a protected operational state.");
    expect(protectedFixture.calls.permitRequestUpdatePayloads).toHaveLength(0);
    expect(protectedFixture.calls.jobUpdatePayloads).toHaveLength(0);

    vi.resetModules();
    const unrelatedBlockerFixture = buildFixture({
      jobRow: {
        ops_status: "pending_info",
        pending_info_reason: "Customer approval needed",
      },
    });
    createClientMock.mockResolvedValue(unrelatedBlockerFixture.baseClient);
    createAdminClientMock.mockReturnValue(unrelatedBlockerFixture.adminClient);

    const { markInternalPermitCreated: markUnrelatedBlocker } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      markUnrelatedBlocker({
        permitRequestId: "permit-1",
        postPermitRoute: "ready_for_testing",
        permitNumber: "P-132",
      }),
    ).rejects.toThrow("Linked job has an unrelated pending information blocker.");
    expect(unrelatedBlockerFixture.calls.permitRequestUpdatePayloads).toHaveLength(0);
    expect(unrelatedBlockerFixture.calls.jobUpdatePayloads).toHaveLength(0);
  });

  it("creates a root job from an unlinked permit request and marks it ready for testing", async () => {
    const fixture = buildFixture({
      permitRequestStatus: "accepted_in_process",
      permitRequestFields: {
        job_id: null,
        service_case_id: null,
        request_label: "Permit for gas package unit",
        internal_intake_note: "Owner called in permit details.",
        contractor_note: "Contract PDF uploaded.",
      },
    });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { createJobFromPermitRequestAndMarkCreated } = await import("@/lib/actions/internal-permit-request-actions");

    const result = await createJobFromPermitRequestAndMarkCreated({
      permitRequestId: "permit-1",
      postPermitRoute: "ready_for_testing",
      permitNumber: "P-200",
      jurisdiction: "Fresno",
      permitDate: "2026-06-16",
      customerLocationMode: "new_new",
      customerFirstName: "Maya",
      customerLastName: "Lopez",
      customerEmail: "maya@example.com",
      customerPhone: "555-1212",
      addressLine1: "200 Permit Way",
      city: "Fresno",
      state: "CA",
      zip: "93720",
    });

    expect(result).toEqual({
      permitRequestId: "permit-1",
      status: "permit_created",
      postPermitRoute: "ready_for_testing",
      jobId: "created-job-1",
      serviceCaseId: "created-case-1",
      jobOpsStatusAfter: "need_to_schedule",
      customerLocationMode: "new_new",
    });
    expect(fixture.calls.customerInsertPayloads).toEqual([
      expect.objectContaining({
        first_name: "Maya",
        last_name: "Lopez",
        full_name: "Maya Lopez",
        owner_user_id: "owner-1",
      }),
    ]);
    expect(fixture.calls.locationInsertPayloads).toEqual([
      expect.objectContaining({
        customer_id: "created-customer-1",
        address_line1: "200 Permit Way",
        city: "Fresno",
        state: "CA",
        zip: "93720",
        postal_code: "93720",
        owner_user_id: "owner-1",
      }),
    ]);
    expect(fixture.calls.jobInsertPayloads).toEqual([
      expect.objectContaining({
        job_type: "ecc",
        project_type: "alteration",
        title: "Permit for gas package unit",
        status: "open",
        lifecycle_state: "active",
        customer_id: "created-customer-1",
        location_id: "created-location-1",
        contractor_id: "ctr-1",
        ops_status: "need_to_schedule",
        permit_number: "P-200",
        jurisdiction: "Fresno",
        permit_date: "2026-06-16",
      }),
    ]);
    expect(fixture.calls.jobInsertPayloads[0]).toMatchObject({
      scheduled_date: null,
      window_start: null,
      window_end: null,
      on_hold_reason: null,
    });
    expect(fixture.calls.serviceCaseInsertPayloads).toEqual([
      expect.objectContaining({
        customer_id: "created-customer-1",
        location_id: "created-location-1",
        case_kind: "reactive",
        status: "open",
      }),
    ]);
    expect(fixture.calls.jobUpdatePayloads).toEqual([{ service_case_id: "created-case-1" }]);
    expect(fixture.calls.permitRequestUpdatePayloads).toEqual([
      expect.objectContaining({
        job_id: "created-job-1",
        service_case_id: "created-case-1",
        status: "permit_created",
        post_permit_route: "ready_for_testing",
        permit_number: "P-200",
        jurisdiction: "Fresno",
        permit_date: "2026-06-16",
        completed_by_user_id: "internal-user-1",
      }),
    ]);
    expect(fixture.calls.permitEventInsertPayloads).toEqual([
      expect.objectContaining({
        event_type: "permit_created",
        job_id: "created-job-1",
        service_case_id: "created-case-1",
        post_permit_route: "ready_for_testing",
        meta: expect.objectContaining({
          created_job_id: "created-job-1",
          customer_location_mode: "new_new",
          source_action: "create_job_from_permit_request_and_mark_created",
        }),
      }),
      expect.objectContaining({
        event_type: "permit_ready_for_testing",
        job_id: "created-job-1",
      }),
    ]);
    expect(fixture.calls.jobEventInsertPayloads).toEqual([
      expect.objectContaining({
        job_id: "created-job-1",
        event_type: "permit_created",
        meta: expect.objectContaining({
          permit_request_id: "permit-1",
          post_permit_route: "ready_for_testing",
          created_job_id: "created-job-1",
          customer_location_mode: "new_new",
          job_ops_status_before: null,
          job_ops_status_after: "need_to_schedule",
        }),
      }),
    ]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/ops");
    expect(revalidatePathMock).toHaveBeenCalledWith("/jobs/created-job-1");
  });

  it("creates a pending-install job from existing customer/location without scheduling mutation", async () => {
    const fixture = buildFixture({
      permitRequestStatus: "on_hold_additional_info_needed",
      permitRequestFields: {
        job_id: null,
        service_case_id: null,
      },
    });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { createJobFromPermitRequestAndMarkCreated } = await import("@/lib/actions/internal-permit-request-actions");

    await createJobFromPermitRequestAndMarkCreated({
      permitRequestId: "permit-1",
      postPermitRoute: "pending_install",
      permitNumber: "P-201",
      customerLocationMode: "existing_existing",
      existingCustomerId: "customer-1",
      existingLocationId: "location-1",
    });

    expect(fixture.calls.customerInsertPayloads).toHaveLength(0);
    expect(fixture.calls.locationInsertPayloads).toHaveLength(0);
    expect(fixture.calls.jobInsertPayloads).toEqual([
      expect.objectContaining({
        customer_id: "customer-1",
        location_id: "location-1",
        ops_status: "on_hold",
        on_hold_reason: "Pending Install",
        pending_info_reason: null,
        scheduled_date: null,
        window_start: null,
        window_end: null,
      }),
    ]);
    expect(fixture.calls.permitEventInsertPayloads[1]).toEqual(
      expect.objectContaining({
        event_type: "permit_pending_install",
        post_permit_route: "pending_install",
      }),
    );
    expect(fixture.calls.jobEventInsertPayloads[0].meta).toEqual(
      expect.objectContaining({
        post_permit_route: "pending_install",
        job_ops_status_after: "on_hold",
      }),
    );
  });

  it("creates a new location for an existing customer before marking permit created", async () => {
    const fixture = buildFixture({
      permitRequestStatus: "accepted_in_process",
      permitRequestFields: {
        job_id: null,
        service_case_id: null,
      },
    });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { createJobFromPermitRequestAndMarkCreated } = await import("@/lib/actions/internal-permit-request-actions");

    await createJobFromPermitRequestAndMarkCreated({
      permitRequestId: "permit-1",
      postPermitRoute: "ready_for_testing",
      permitNumber: "P-202",
      customerLocationMode: "existing_new",
      existingCustomerId: "customer-1",
      addressLine1: "300 New Address",
      city: "Fresno",
      zip: "93721",
    });

    expect(fixture.calls.customerInsertPayloads).toHaveLength(0);
    expect(fixture.calls.locationInsertPayloads).toEqual([
      expect.objectContaining({
        customer_id: "customer-1",
        address_line1: "300 New Address",
        city: "Fresno",
        state: "CA",
        zip: "93721",
      }),
    ]);
    expect(fixture.calls.jobInsertPayloads[0]).toEqual(
      expect.objectContaining({
        customer_id: "customer-1",
        location_id: "created-location-1",
      }),
    );
  });

  it("rejects already-linked permit requests without creating another job", async () => {
    const fixture = buildFixture({ permitRequestStatus: "accepted_in_process" });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { createJobFromPermitRequestAndMarkCreated } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      createJobFromPermitRequestAndMarkCreated({
        permitRequestId: "permit-1",
        postPermitRoute: "ready_for_testing",
        permitNumber: "P-203",
        customerLocationMode: "existing_existing",
        existingCustomerId: "customer-1",
        existingLocationId: "location-1",
      }),
    ).rejects.toThrow("This permit request is already linked to a job.");

    expect(fixture.calls.customerInsertPayloads).toHaveLength(0);
    expect(fixture.calls.locationInsertPayloads).toHaveLength(0);
    expect(fixture.calls.serviceCaseInsertPayloads).toHaveLength(0);
    expect(fixture.calls.jobInsertPayloads).toHaveLength(0);
    expect(fixture.calls.permitRequestUpdatePayloads).toHaveLength(0);
  });

  it("fails closed for create-job-and-mark-created when permit workflow is disabled", async () => {
    const fixture = buildFixture({
      permitRequestStatus: "accepted_in_process",
      permitRequestFields: {
        job_id: null,
        service_case_id: null,
      },
    });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);
    delete process.env.ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS;

    const { createJobFromPermitRequestAndMarkCreated } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      createJobFromPermitRequestAndMarkCreated({
        permitRequestId: "permit-1",
        postPermitRoute: "ready_for_testing",
        permitNumber: "P-203",
        customerLocationMode: "existing_existing",
        existingCustomerId: "customer-1",
        existingLocationId: "location-1",
      }),
    ).rejects.toThrow("Permit workflow is unavailable for this account.");

    expect(fixture.calls.customerInsertPayloads).toHaveLength(0);
    expect(fixture.calls.locationInsertPayloads).toHaveLength(0);
    expect(fixture.calls.serviceCaseInsertPayloads).toHaveLength(0);
    expect(fixture.calls.jobInsertPayloads).toHaveLength(0);
    expect(fixture.calls.permitRequestUpdatePayloads).toHaveLength(0);
  });

  it("rejects missing structured address before creating a job", async () => {
    const fixture = buildFixture({
      permitRequestStatus: "accepted_in_process",
      permitRequestFields: {
        job_id: null,
        service_case_id: null,
      },
    });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { createJobFromPermitRequestAndMarkCreated } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      createJobFromPermitRequestAndMarkCreated({
        permitRequestId: "permit-1",
        postPermitRoute: "ready_for_testing",
        permitNumber: "P-204",
        customerLocationMode: "new_new",
        customerFirstName: "Maya",
        customerLastName: "Lopez",
        city: "Fresno",
        zip: "93720",
      }),
    ).rejects.toThrow("Service address, city, and zip are required to create a job.");

    expect(fixture.calls.customerInsertPayloads).toHaveLength(0);
    expect(fixture.calls.locationInsertPayloads).toHaveLength(0);
    expect(fixture.calls.serviceCaseInsertPayloads).toHaveLength(0);
    expect(fixture.calls.jobInsertPayloads).toHaveLength(0);
    expect(fixture.calls.permitRequestUpdatePayloads).toHaveLength(0);
  });

  it("rejects a selected location outside the selected customer before creating a job", async () => {
    const fixture = buildFixture({
      permitRequestStatus: "accepted_in_process",
      locationCustomerId: "customer-2",
      permitRequestFields: {
        job_id: null,
        service_case_id: null,
      },
    });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { createJobFromPermitRequestAndMarkCreated } = await import("@/lib/actions/internal-permit-request-actions");

    await expect(
      createJobFromPermitRequestAndMarkCreated({
        permitRequestId: "permit-1",
        postPermitRoute: "ready_for_testing",
        permitNumber: "P-205",
        customerLocationMode: "existing_existing",
        existingCustomerId: "customer-1",
        existingLocationId: "location-1",
      }),
    ).rejects.toThrow("Location does not belong to the selected customer.");

    expect(fixture.calls.serviceCaseInsertPayloads).toHaveLength(0);
    expect(fixture.calls.jobInsertPayloads).toHaveLength(0);
    expect(fixture.calls.permitRequestUpdatePayloads).toHaveLength(0);
  });
});
