import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const insertInternalNotificationForEventMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("@/lib/actions/notification-actions", () => ({
  insertInternalNotificationForEvent: (...args: unknown[]) =>
    insertInternalNotificationForEventMock(...args),
}));

function makeAdminClientFixture(fixture: {
  job: Record<string, unknown> | null;
  customerInScope: boolean;
  attachments?: Array<Record<string, unknown>>;
}) {
  const createSignedUploadUrlMock = vi.fn(async (path: string) => ({
    data: {
      signedUrl: `https://signed-upload.example/${path}`,
      token: "upload-token-1",
    },
    error: null,
  }));
  const createSignedUrlMock = vi.fn(async (path: string) => ({
    data: {
      signedUrl: `https://signed-read.example/${path}`,
    },
    error: null,
  }));
  const removeMock = vi.fn(async () => ({ data: null, error: null }));

  return {
    storage: {
      from(bucket: string) {
        if (bucket !== "attachments") throw new Error(`Unexpected storage bucket: ${bucket}`);
        return {
          createSignedUploadUrl: createSignedUploadUrlMock,
          createSignedUrl: createSignedUrlMock,
          remove: removeMock,
        };
      },
    },
    from(table: string) {
      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: fixture.job,
                  error: null,
                })),
              })),
            })),
          })),
        };
      }

      if (table === "customers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: fixture.customerInScope
                    ? { id: String((fixture.job as any)?.customer_id ?? "cust-1") }
                    : null,
                  error: null,
                })),
              })),
            })),
          })),
        };
      }

      if (table === "attachments") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string, value: unknown) => ({
              eq: vi.fn((nextColumn: string, nextValue: unknown) => ({
                in: vi.fn(async (_inColumn: string, ids: unknown[]) => {
                  const attachmentIds = ids.map((entry) => String(entry ?? "").trim());
                  const rows = (fixture.attachments ?? []).filter((attachment) => {
                    return (
                      String((attachment as any)?.id ?? "").trim() !== "" &&
                      attachmentIds.includes(String((attachment as any)?.id ?? "").trim()) &&
                      String((attachment as any)?.entity_type ?? "") === String(value ?? "") &&
                      String((attachment as any)?.entity_id ?? "") === String(nextValue ?? "")
                    );
                  });

                  return { data: rows, error: null };
                }),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    },
  };
}

function makeSessionClientFixture(fixture: {
  attachments?: Array<Record<string, unknown>>;
}) {
  const insertedAttachments: Array<Record<string, unknown>> = [];
  const deletedAttachmentIds: string[] = [];
  const insertedJobEvents: Array<Record<string, unknown>> = [];

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: "internal-user-1",
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
                data: null,
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "attachments") {
        return {
          insert(values: Record<string, unknown>) {
            insertedAttachments.push(values);
            return Promise.resolve({ error: null });
          },
          select: vi.fn(() => ({
            eq: vi.fn((column: string, value: unknown) => ({
              eq: vi.fn((nextColumn: string, nextValue: unknown) => ({
                in: vi.fn(async (_inColumn: string, ids: unknown[]) => {
                  const attachmentIds = ids.map((entry) => String(entry ?? "").trim());
                  const rows = (fixture.attachments ?? []).filter((attachment) => {
                    return (
                      attachmentIds.includes(String((attachment as any)?.id ?? "").trim()) &&
                      String((attachment as any)?.[column] ?? "") === String(value ?? "") &&
                      String((attachment as any)?.[nextColumn] ?? "") === String(nextValue ?? "")
                    );
                  });

                  return { data: rows, error: null };
                }),
              })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn((_column: string, _value: unknown) => ({
              eq: vi.fn((_nextColumn: string, _nextValue: unknown) => ({
                in: vi.fn(async (_inColumn: string, ids: unknown[]) => {
                  deletedAttachmentIds.push(...ids.map((entry) => String(entry ?? "").trim()));
                  return { error: null };
                }),
              })),
            })),
          })),
        };
      }

      if (table === "job_events") {
        return {
          insert(values: Record<string, unknown>) {
            insertedJobEvents.push(values);
            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`Unexpected session table: ${table}`);
    },
  };

  return {
    supabase,
    insertedAttachments,
    deletedAttachmentIds,
    insertedJobEvents,
  };
}

describe("internal attachment same-account hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    requireInternalUserMock.mockResolvedValue({
      userId: "internal-user-1",
      internalUser: {
        user_id: "internal-user-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
    insertInternalNotificationForEventMock.mockResolvedValue(undefined);
  });

  it("allows same-account internal upload-token issuance", async () => {
    const { supabase, insertedAttachments } = makeSessionClientFixture({});
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(
      makeAdminClientFixture({
        job: { id: "job-1", customer_id: "cust-1" },
        customerInScope: true,
      }),
    );

    const { createJobAttachmentUploadToken } = await import("@/lib/actions/attachment-actions");

    const result = await createJobAttachmentUploadToken({
      jobId: "job-1",
      fileName: "scope-proof.pdf",
      contentType: "application/pdf",
      fileSize: 123,
    });

    expect(result.attachmentId).toBeTruthy();
    expect(result.bucket).toBe("attachments");
    expect(result.path).toContain("job/job-1/");
    expect(insertedAttachments).toHaveLength(1);
    expect(insertedAttachments[0]).toMatchObject({
      entity_type: "job",
      entity_id: "job-1",
      bucket: "attachments",
      file_name: "scope-proof.pdf",
    });
  });

  it("denies cross-account internal upload-token issuance before insert", async () => {
    const { supabase, insertedAttachments } = makeSessionClientFixture({});
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(
      makeAdminClientFixture({
        job: { id: "job-2", customer_id: "cust-2" },
        customerInScope: false,
      }),
    );

    const { createJobAttachmentUploadToken } = await import("@/lib/actions/attachment-actions");

    await expect(
      createJobAttachmentUploadToken({
        jobId: "job-2",
        fileName: "scope-proof.pdf",
        contentType: "application/pdf",
        fileSize: 123,
      }),
    ).rejects.toThrow("Not authorized to upload attachment for this job");

    expect(insertedAttachments).toHaveLength(0);
  });

  it("allows same-account internal finalize upload", async () => {
    const attachments = [
      {
        id: "attachment-1",
        entity_type: "job",
        entity_id: "job-3",
        bucket: "attachments",
        storage_path: "job/job-3/attachment-1-proof.pdf",
        file_name: "proof.pdf",
      },
    ];
    const { supabase, insertedJobEvents } = makeSessionClientFixture({ attachments });
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(
      makeAdminClientFixture({
        job: { id: "job-3", customer_id: "cust-3" },
        customerInScope: true,
        attachments,
      }),
    );

    const { finalizeInternalJobAttachmentUpload } = await import("@/lib/actions/attachment-actions");

    const result = await finalizeInternalJobAttachmentUpload({
      jobId: "job-3",
      attachmentIds: ["attachment-1"],
    });

    expect(result).toEqual({
      count: 1,
      attachmentIds: ["attachment-1"],
    });
    expect(insertedJobEvents).toHaveLength(1);
    expect(insertedJobEvents[0]).toMatchObject({
      job_id: "job-3",
      event_type: "attachment_added",
      user_id: "internal-user-1",
    });
  });

  it("denies cross-account internal finalize upload before event write", async () => {
    const attachments = [
      {
        id: "attachment-2",
        entity_type: "job",
        entity_id: "job-4",
        bucket: "attachments",
        storage_path: "job/job-4/attachment-2-proof.pdf",
        file_name: "proof.pdf",
      },
    ];
    const { supabase, insertedJobEvents } = makeSessionClientFixture({ attachments });
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(
      makeAdminClientFixture({
        job: { id: "job-4", customer_id: "cust-4" },
        customerInScope: false,
        attachments,
      }),
    );

    const { finalizeInternalJobAttachmentUpload } = await import("@/lib/actions/attachment-actions");

    await expect(
      finalizeInternalJobAttachmentUpload({
        jobId: "job-4",
        attachmentIds: ["attachment-2"],
      }),
    ).rejects.toThrow("Not authorized to finalize attachments for this job");

    expect(insertedJobEvents).toHaveLength(0);
  });

  it("allows same-account internal discard upload", async () => {
    const attachments = [
      {
        id: "attachment-3",
        entity_type: "job",
        entity_id: "job-5",
        bucket: "attachments",
        storage_path: "job/job-5/attachment-3-proof.pdf",
        file_name: "proof.pdf",
      },
    ];
    const { supabase, deletedAttachmentIds } = makeSessionClientFixture({ attachments });
    const adminClient = makeAdminClientFixture({
      job: { id: "job-5", customer_id: "cust-5" },
      customerInScope: true,
      attachments,
    });
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(adminClient);

    const { discardInternalJobAttachmentUpload } = await import("@/lib/actions/attachment-actions");

    await discardInternalJobAttachmentUpload({
      jobId: "job-5",
      attachmentId: "attachment-3",
    });

    expect(deletedAttachmentIds).toEqual(["attachment-3"]);
  });

  it("denies cross-account internal discard upload before delete", async () => {
    const attachments = [
      {
        id: "attachment-4",
        entity_type: "job",
        entity_id: "job-6",
        bucket: "attachments",
        storage_path: "job/job-6/attachment-4-proof.pdf",
        file_name: "proof.pdf",
      },
    ];
    const { supabase, deletedAttachmentIds } = makeSessionClientFixture({ attachments });
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(
      makeAdminClientFixture({
        job: { id: "job-6", customer_id: "cust-6" },
        customerInScope: false,
        attachments,
      }),
    );

    const { discardInternalJobAttachmentUpload } = await import("@/lib/actions/attachment-actions");

    await expect(
      discardInternalJobAttachmentUpload({
        jobId: "job-6",
        attachmentId: "attachment-4",
      }),
    ).rejects.toThrow("Not authorized to discard attachment for this job");

    expect(deletedAttachmentIds).toHaveLength(0);
  });

  it("allows same-account internal share-to-contractor", async () => {
    const attachments = [
      {
        id: "attachment-5",
        entity_type: "job",
        entity_id: "job-7",
        bucket: "attachments",
        storage_path: "job/job-7/attachment-5-proof.pdf",
        file_name: "proof.pdf",
      },
    ];
    const { supabase, insertedJobEvents } = makeSessionClientFixture({ attachments });
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(
      makeAdminClientFixture({
        job: { id: "job-7", customer_id: "cust-7" },
        customerInScope: true,
        attachments,
      }),
    );

    const { shareJobAttachmentToContractor } = await import("@/lib/actions/attachment-actions");

    await shareJobAttachmentToContractor({
      jobId: "job-7",
      attachmentId: "attachment-5",
    });

    expect(insertedJobEvents).toHaveLength(1);
    expect(insertedJobEvents[0]).toMatchObject({
      job_id: "job-7",
      event_type: "public_note",
      user_id: "internal-user-1",
      meta: {
        note: "Shared file: proof.pdf",
        attachment_ids: ["attachment-5"],
        file_names: ["proof.pdf"],
        source: "internal_share",
      },
    });
  });

  it("denies cross-account internal share-to-contractor before public note write", async () => {
    const attachments = [
      {
        id: "attachment-6",
        entity_type: "job",
        entity_id: "job-8",
        bucket: "attachments",
        storage_path: "job/job-8/attachment-6-proof.pdf",
        file_name: "proof.pdf",
      },
    ];
    const { supabase, insertedJobEvents } = makeSessionClientFixture({ attachments });
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(
      makeAdminClientFixture({
        job: { id: "job-8", customer_id: "cust-8" },
        customerInScope: false,
        attachments,
      }),
    );

    const { shareJobAttachmentToContractor } = await import("@/lib/actions/attachment-actions");

    await expect(
      shareJobAttachmentToContractor({
        jobId: "job-8",
        attachmentId: "attachment-6",
      }),
    ).rejects.toThrow("Not authorized to share attachment for this job");

    expect(insertedJobEvents).toHaveLength(0);
  });
});