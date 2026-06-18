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
  schemaUnavailable?: boolean;
  attachmentInsertError?: Error | null;
  signedUrlError?: Error | null;
};

function makeChain<T>(value: Promise<T>) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    limit: vi.fn(() => value),
    maybeSingle: vi.fn(() => value),
    single: vi.fn(() => value),
    insert: vi.fn(() => chain),
  };
  return chain;
}

function buildFixture(options?: FixtureOptions) {
  const calls = {
    permitRequestInsertPayloads: [] as Array<Record<string, unknown>>,
    permitEventInsertPayloads: [] as Array<Record<string, unknown>>,
    attachmentInsertPayloads: [] as Array<Array<Record<string, unknown>>>,
    storageRemoveCalls: [] as Array<string[]>,
    signedUrlCalls: [] as string[],
    jobEventMutations: 0,
    jobMutations: 0,
  };

  const baseClient = {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: "contractor-user-1",
            email: "contractor@example.com",
          },
        },
        error: null,
      })),
    },
    from(table: string) {
      if (table === "contractor_users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  contractor_id: "ctr-1",
                  contractors: {
                    id: "ctr-1",
                    name: "Delta HVAC",
                    lifecycle_state: "active",
                    owner_user_id: "owner-1",
                  },
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
        if (options?.schemaUnavailable) {
          return makeChain(Promise.resolve({
            data: null,
            error: {
              code: "PGRST205",
              message: "Could not find the table 'public.permit_requests' in the schema cache",
            },
          }));
        }

        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          limit: vi.fn(async () => ({ data: [], error: null })),
          insert: vi.fn((payload: Record<string, unknown>) => {
            calls.permitRequestInsertPayloads.push(payload);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "permit-1" }, error: null })),
              })),
            };
          }),
        };
        return chain;
      }

      if (table === "contractors") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { owner_user_id: "owner-1" },
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

      if (table === "attachments") {
        return {
          insert: vi.fn(async (payload: Array<Record<string, unknown>>) => {
            calls.attachmentInsertPayloads.push(payload);
            return {
              data: options?.attachmentInsertError ? null : payload,
              error: options?.attachmentInsertError ?? null,
            };
          }),
        };
      }

      if (table === "jobs") {
        calls.jobMutations += 1;
      }

      if (table === "job_events") {
        calls.jobEventMutations += 1;
      }

      throw new Error(`Unexpected admin table: ${table}`);
    },
    storage: {
      from: vi.fn(() => ({
        createSignedUploadUrl: vi.fn(async (path: string) => ({
          data: {
            token: "signed-token",
            path,
          },
          error: null,
        })),
        createSignedUrl: vi.fn(async (path: string) => {
          calls.signedUrlCalls.push(path);
          return {
            data: options?.signedUrlError ? null : { signedUrl: `https://example.test/${path}` },
            error: options?.signedUrlError ?? null,
          };
        }),
        remove: vi.fn(async (paths: string[]) => {
          calls.storageRemoveCalls.push(paths);
          return { data: null, error: null };
        }),
      })),
    },
  };

  return {
    baseClient,
    adminClient,
    calls,
  };
}

const uploadDraft = {
  attachmentId: "att-1",
  path: "permit-requests/staged/ctr-1/att-1-contract.pdf",
  fileName: "contract.pdf",
  contentType: "application/pdf",
  fileSize: 4096,
};

describe("contractor permit request actions", () => {
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

  it("issues signed upload tokens with permit request staged paths", async () => {
    const fixture = buildFixture();
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { createContractorPermitRequestUploadToken } = await import("@/lib/actions/permit-request-actions");

    const token = await createContractorPermitRequestUploadToken({
      fileName: "contract.pdf",
      contentType: "application/pdf",
      fileSize: 4096,
    });

    expect(token.token).toBe("signed-token");
    expect(token.path).toContain("permit-requests/staged/ctr-1/");
    expect(token.fileName).toBe("contract.pdf");
  });

  it("requires at least one attachment", async () => {
    const fixture = buildFixture();
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { finalizeContractorPermitRequest } = await import("@/lib/actions/permit-request-actions");

    await expect(finalizeContractorPermitRequest({ uploads: [], note: "Please review" })).rejects.toThrow(
      "Select at least one file to upload.",
    );
  });

  it("creates initial permit request, event, and permit_request attachments", async () => {
    const fixture = buildFixture();
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { finalizeContractorPermitRequest } = await import("@/lib/actions/permit-request-actions");

    const result = await finalizeContractorPermitRequest({
      uploads: [uploadDraft],
      note: "Customer signed the contract.",
      accepted_by_user_id: "internal-user-1",
      post_permit_route: "ready_for_testing",
      permit_number: "SHOULD-NOT-SAVE",
    } as never);

    expect(result).toMatchObject({ permitRequestId: "permit-1", count: 1 });
    expect(fixture.calls.permitRequestInsertPayloads).toEqual([
      {
        account_owner_user_id: "owner-1",
        contractor_id: "ctr-1",
        status: "permit_request",
        contractor_note: "Customer signed the contract.",
        submitted_by_user_id: "contractor-user-1",
      },
    ]);
    expect(fixture.calls.permitRequestInsertPayloads[0]).not.toHaveProperty("accepted_by_user_id");
    expect(fixture.calls.permitRequestInsertPayloads[0]).not.toHaveProperty("completed_by_user_id");
    expect(fixture.calls.permitRequestInsertPayloads[0]).not.toHaveProperty("post_permit_route");
    expect(fixture.calls.permitRequestInsertPayloads[0]).not.toHaveProperty("permit_number");
    expect(fixture.calls.permitRequestInsertPayloads[0]).not.toHaveProperty("jurisdiction");
    expect(fixture.calls.permitRequestInsertPayloads[0]).not.toHaveProperty("permit_date");

    expect(fixture.calls.permitEventInsertPayloads).toEqual([
      expect.objectContaining({
        account_owner_user_id: "owner-1",
        permit_request_id: "permit-1",
        event_type: "permit_request_received",
        actor_user_id: "contractor-user-1",
        to_status: "permit_request",
        meta: {
          source: "contractor_portal",
          attachment_count: 1,
        },
      }),
    ]);
    expect(fixture.calls.attachmentInsertPayloads[0]).toEqual([
      expect.objectContaining({
        id: "att-1",
        entity_type: "permit_request",
        entity_id: "permit-1",
        bucket: "attachments",
        storage_path: "permit-requests/staged/ctr-1/att-1-contract.pdf",
      }),
    ]);
    expect(fixture.calls.jobMutations).toBe(0);
    expect(fixture.calls.jobEventMutations).toBe(0);
  });

  it("fails closed when permit request schema is unavailable", async () => {
    const fixture = buildFixture({ schemaUnavailable: true });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const {
      createContractorPermitRequestUploadToken,
      getContractorPermitRequestSurfaceAvailability,
    } = await import("@/lib/actions/permit-request-actions");

    await expect(getContractorPermitRequestSurfaceAvailability()).resolves.toEqual({
      schemaAvailable: false,
    });
    await expect(
      createContractorPermitRequestUploadToken({
        fileName: "contract.pdf",
        contentType: "application/pdf",
        fileSize: 4096,
      }),
    ).rejects.toThrow("Permit requests are temporarily unavailable.");
  });

  it("attempts storage cleanup when attachment rows cannot be finalized", async () => {
    const fixture = buildFixture({
      attachmentInsertError: new Error("attachment insert failed"),
    });
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { finalizeContractorPermitRequest } = await import("@/lib/actions/permit-request-actions");

    await expect(
      finalizeContractorPermitRequest({
        uploads: [uploadDraft],
        note: null,
      }),
    ).rejects.toThrow("Permit request submitted, but files could not be attached.");

    expect(fixture.calls.permitRequestInsertPayloads).toHaveLength(1);
    expect(fixture.calls.permitEventInsertPayloads).toHaveLength(1);
    expect(fixture.calls.storageRemoveCalls).toEqual([
      ["permit-requests/staged/ctr-1/att-1-contract.pdf"],
    ]);
  });

  it("rejects finalize when account owner is not allowlisted", async () => {
    const fixture = buildFixture();
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);
    delete process.env.ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS;

    const { finalizeContractorPermitRequest } = await import("@/lib/actions/permit-request-actions");

    await expect(
      finalizeContractorPermitRequest({
        uploads: [uploadDraft],
        note: "Contractor permit upload smoke test.",
      }),
    ).rejects.toThrow("Permit workflow is unavailable for this account.");
  });
});
