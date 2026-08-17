import { beforeEach, describe, expect, it, vi } from "vitest";

import { JOB_ATTACHMENT_MAX_FILE_SIZE_BYTES } from "@/lib/attachments/attachment-upload-policy";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: vi.fn(async () => ({
    internalUser: { account_owner_user_id: "owner-1" },
  })),
}));

vi.mock("@/lib/auth/internal-attachment-scope", () => ({
  loadScopedInternalAttachmentJobForMutation: vi.fn(async () => ({ id: "job-1" })),
  loadScopedInternalJobAttachmentForMutation: vi.fn(async () => ({
    job: { id: "job-1" },
    attachment: { id: "attachment-1", file_name: "proof.pdf" },
  })),
  loadScopedInternalJobAttachmentsForMutation: vi.fn(async () => ({
    job: { id: "job-1" },
    attachments: [{ id: "attachment-1", file_name: "proof.pdf" }],
  })),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: vi.fn(async () => ({
    authorized: true,
    reason: "allowed_active",
  })),
}));

vi.mock("@/lib/actions/notification-actions", () => ({
  insertInternalNotificationForEvent: vi.fn(async () => undefined),
}));

vi.mock("@/lib/notifications/contractor-shared-job-update", () => ({
  notifyContractorOfSharedJobUpdate: vi.fn(async () => undefined),
}));

type StoredObject = { size: number; mimetype: string };

function makeFixture(options: {
  existingAttachmentCount?: number;
  attachmentRows?: Array<Record<string, unknown>>;
  storedObjects?: Record<string, StoredObject>;
} = {}) {
  const insertedAttachments: Array<Record<string, unknown>> = [];
  const updatedAttachments: Array<Record<string, unknown>> = [];
  const deletedAttachmentIds: string[] = [];
  const removedStoragePaths: string[] = [];
  const signedUploadPaths: string[] = [];
  const attachmentRows = options.attachmentRows ?? [];

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "internal-user-1" } }, error: null })),
    },
    from(table: string) {
      if (table === "contractor_users") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        };
      }

      if (table === "attachments") {
        return {
          insert: (values: Record<string, unknown>) => {
            insertedAttachments.push(values);
            return Promise.resolve({ error: null });
          },
          update: (values: Record<string, unknown>) => ({
            eq: () => ({ eq: () => ({
              // Metadata reconcile: .eq("id", ...)
              eq: async () => {
                updatedAttachments.push(values);
                return { error: null };
              },
              // Finalize stamp: .in("id", ids).is("finalized_at", null)
              in: () => ({ is: async () => {
                updatedAttachments.push(values);
                return { error: null };
              } }),
            }) }),
          }),
          select: (_columns?: string, selectOptions?: { head?: boolean }) => ({
            eq: () => ({
              eq: () => {
                const result = Promise.resolve({
                  data: selectOptions?.head ? null : attachmentRows,
                  count: options.existingAttachmentCount ?? 0,
                  error: null,
                });

                return Object.assign(result, {
                  in: async (_column: string, ids: unknown[]) => ({
                    data: attachmentRows.filter((row) =>
                      ids.map(String).includes(String(row.id ?? "")),
                    ),
                    error: null,
                  }),
                });
              },
            }),
          }),
          delete: () => ({
            eq: () => ({ eq: () => ({ in: async (_column: string, ids: unknown[]) => {
              deletedAttachmentIds.push(...ids.map(String));
              return { error: null };
            } }) }),
          }),
        };
      }

      if (table === "job_events") {
        return { insert: () => Promise.resolve({ error: null }) };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  const adminClient = {
    storage: {
      from: () => ({
        createSignedUploadUrl: async (path: string) => {
          signedUploadPaths.push(path);
          return { data: { signedUrl: `https://upload.example/${path}`, token: "tok" }, error: null };
        },
        list: async (prefix: string, listOptions?: { search?: string }) => {
          const name = String(listOptions?.search ?? "");
          const stored = options.storedObjects?.[`${prefix}/${name}`];
          if (!stored) return { data: [], error: null };
          return { data: [{ name, metadata: stored }], error: null };
        },
        remove: async (paths: string[]) => {
          removedStoragePaths.push(...paths);
          return { data: null, error: null };
        },
      }),
    },
  };

  createClientMock.mockResolvedValue(supabase);
  createAdminClientMock.mockReturnValue(adminClient);

  return {
    insertedAttachments,
    updatedAttachments,
    deletedAttachmentIds,
    removedStoragePaths,
    signedUploadPaths,
  };
}

describe("job attachment upload policy enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createJobAttachmentUploadToken", () => {
    it("refuses a disallowed type before writing a row or minting a token", async () => {
      const fixture = makeFixture();
      const { createJobAttachmentUploadToken } = await import("@/lib/actions/attachment-actions");

      await expect(
        createJobAttachmentUploadToken({
          jobId: "job-1",
          fileName: "payload.html",
          contentType: "text/html",
          fileSize: 512,
        }),
      ).rejects.toThrow(/not supported/i);

      expect(fixture.insertedAttachments).toHaveLength(0);
      expect(fixture.signedUploadPaths).toHaveLength(0);
    });

    it("refuses a file over the size limit", async () => {
      const fixture = makeFixture();
      const { createJobAttachmentUploadToken } = await import("@/lib/actions/attachment-actions");

      await expect(
        createJobAttachmentUploadToken({
          jobId: "job-1",
          fileName: "huge.jpg",
          contentType: "image/jpeg",
          fileSize: JOB_ATTACHMENT_MAX_FILE_SIZE_BYTES + 1,
        }),
      ).rejects.toThrow(/size limit/i);

      expect(fixture.insertedAttachments).toHaveLength(0);
      expect(fixture.signedUploadPaths).toHaveLength(0);
    });

    it("refuses once the job is at its attachment cap", async () => {
      const fixture = makeFixture({ existingAttachmentCount: 200 });
      const { createJobAttachmentUploadToken } = await import("@/lib/actions/attachment-actions");

      await expect(
        createJobAttachmentUploadToken({
          jobId: "job-1",
          fileName: "gauge.jpg",
          contentType: "image/jpeg",
          fileSize: 1024,
        }),
      ).rejects.toThrow(/up to 200 attachments/i);

      expect(fixture.insertedAttachments).toHaveLength(0);
    });

    it("stores the normalized type and a sanitized path for a valid photo", async () => {
      const fixture = makeFixture();
      const { createJobAttachmentUploadToken } = await import("@/lib/actions/attachment-actions");

      const token = await createJobAttachmentUploadToken({
        jobId: "job-1",
        fileName: "Return air/before.JPG",
        contentType: "IMAGE/JPEG; charset=binary",
        fileSize: 2_000_000,
      });

      expect(fixture.insertedAttachments).toHaveLength(1);
      expect(fixture.insertedAttachments[0]).toMatchObject({
        file_name: "Return air_before.JPG",
        content_type: "image/jpeg",
        file_size: 2_000_000,
      });
      expect(token.contentType).toBe("image/jpeg");
      expect(String(token.path)).toMatch(/^job\/job-1\//);
      expect(String(token.path)).not.toContain("Return air/before");
    });

    it("recovers the content type when the browser could not identify a HEIC photo", async () => {
      const fixture = makeFixture();
      const { createJobAttachmentUploadToken } = await import("@/lib/actions/attachment-actions");

      const token = await createJobAttachmentUploadToken({
        jobId: "job-1",
        fileName: "IMG_0001.heic",
        contentType: "",
        fileSize: 3_000_000,
      });

      expect(token.contentType).toBe("image/heic");
      expect(fixture.insertedAttachments[0]).toMatchObject({ content_type: "image/heic" });
    });

    it("stages the row unfinalized so an abandoned upload never reaches a read surface", async () => {
      const fixture = makeFixture();
      const { createJobAttachmentUploadToken } = await import("@/lib/actions/attachment-actions");

      await createJobAttachmentUploadToken({
        jobId: "job-1",
        fileName: "gauge.jpg",
        contentType: "image/jpeg",
        fileSize: 1024,
      });

      expect(fixture.insertedAttachments[0]).toMatchObject({ finalized_at: null });
    });

    it("records the uploading user so evidence has provenance", async () => {
      const fixture = makeFixture();
      const { createJobAttachmentUploadToken } = await import("@/lib/actions/attachment-actions");

      await createJobAttachmentUploadToken({
        jobId: "job-1",
        fileName: "gauge.jpg",
        contentType: "image/jpeg",
        fileSize: 1024,
      });

      expect(String(fixture.insertedAttachments[0].created_by_user_id ?? "")).toBeTruthy();
    });
  });

  describe("finalizeInternalJobAttachmentUpload", () => {
    const attachmentRow = {
      id: "attachment-1",
      entity_type: "job",
      entity_id: "job-1",
      bucket: "attachments",
      storage_path: "job/job-1/attachment-1-gauge.jpg",
      file_name: "gauge.jpg",
      content_type: "image/jpeg",
      file_size: 1024,
    };

    it("reconciles the row against the size the object really has", async () => {
      const fixture = makeFixture({
        attachmentRows: [attachmentRow],
        storedObjects: {
          "job/job-1/attachment-1-gauge.jpg": { size: 4_000_000, mimetype: "image/jpeg" },
        },
      });

      const { finalizeInternalJobAttachmentUpload } = await import(
        "@/lib/actions/attachment-actions"
      );

      const result = await finalizeInternalJobAttachmentUpload({
        jobId: "job-1",
        attachmentIds: ["attachment-1"],
      });

      expect(result).toEqual({ count: 1, attachmentIds: ["attachment-1"] });
      // The client claimed 1024 bytes; storage says 4 MB, and the row now agrees.
      expect(fixture.updatedAttachments).toContainEqual({ file_size: 4_000_000 });
      expect(fixture.deletedAttachmentIds).toHaveLength(0);
    });

    it("promotes the staged row once its object is confirmed", async () => {
      const fixture = makeFixture({
        attachmentRows: [attachmentRow],
        storedObjects: {
          "job/job-1/attachment-1-gauge.jpg": { size: 1024, mimetype: "image/jpeg" },
        },
      });

      const { finalizeInternalJobAttachmentUpload } = await import(
        "@/lib/actions/attachment-actions"
      );

      await finalizeInternalJobAttachmentUpload({
        jobId: "job-1",
        attachmentIds: ["attachment-1"],
      });

      const stamp = fixture.updatedAttachments.find((values) => "finalized_at" in values);
      expect(stamp).toBeDefined();
      expect(typeof stamp?.finalized_at).toBe("string");
    });

    it("leaves nothing finalized when the object never arrived", async () => {
      const fixture = makeFixture({
        attachmentRows: [attachmentRow],
        storedObjects: {},
      });

      const { finalizeInternalJobAttachmentUpload } = await import(
        "@/lib/actions/attachment-actions"
      );

      await expect(
        finalizeInternalJobAttachmentUpload({ jobId: "job-1", attachmentIds: ["attachment-1"] }),
      ).rejects.toThrow();

      expect(fixture.updatedAttachments.some((values) => "finalized_at" in values)).toBe(false);
      expect(fixture.deletedAttachmentIds).toContain("attachment-1");
    });

    it("deletes an upload that overshot the size limit despite a truthful-looking token", async () => {
      const fixture = makeFixture({
        attachmentRows: [attachmentRow],
        storedObjects: {
          "job/job-1/attachment-1-gauge.jpg": {
            size: JOB_ATTACHMENT_MAX_FILE_SIZE_BYTES + 1,
            mimetype: "image/jpeg",
          },
        },
      });

      const { finalizeInternalJobAttachmentUpload } = await import(
        "@/lib/actions/attachment-actions"
      );

      await expect(
        finalizeInternalJobAttachmentUpload({ jobId: "job-1", attachmentIds: ["attachment-1"] }),
      ).rejects.toThrow(/could not be finalized/i);

      expect(fixture.deletedAttachmentIds).toEqual(["attachment-1"]);
      expect(fixture.removedStoragePaths).toEqual(["job/job-1/attachment-1-gauge.jpg"]);
    });

    it("deletes a row whose object never arrived in storage", async () => {
      const fixture = makeFixture({ attachmentRows: [attachmentRow], storedObjects: {} });

      const { finalizeInternalJobAttachmentUpload } = await import(
        "@/lib/actions/attachment-actions"
      );

      await expect(
        finalizeInternalJobAttachmentUpload({ jobId: "job-1", attachmentIds: ["attachment-1"] }),
      ).rejects.toThrow(/could not be finalized/i);

      expect(fixture.deletedAttachmentIds).toEqual(["attachment-1"]);
    });
  });
});
