import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalAttachmentJobForMutationMock = vi.fn();
const loadScopedInternalJobAttachmentForMutationMock = vi.fn();
const loadScopedInternalJobAttachmentsForMutationMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
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
}));

vi.mock("@/lib/auth/internal-attachment-scope", () => ({
  loadScopedInternalAttachmentJobForMutation: (...args: unknown[]) =>
    loadScopedInternalAttachmentJobForMutationMock(...args),
  loadScopedInternalJobAttachmentForMutation: (...args: unknown[]) =>
    loadScopedInternalJobAttachmentForMutationMock(...args),
  loadScopedInternalJobAttachmentsForMutation: (...args: unknown[]) =>
    loadScopedInternalJobAttachmentsForMutationMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("@/lib/actions/notification-actions", () => ({
  insertInternalNotificationForEvent: vi.fn(async () => undefined),
}));

type FixtureOptions = {
  attachments?: Array<Record<string, unknown>>;
};

function makeAttachmentMutationFixture(options: FixtureOptions = {}) {
  const writes: Array<{ table: string; op: string }> = [];
  const storageOps: Array<{ op: "createSignedUploadUrl" | "createSignedUrl" | "remove"; path: string }> = [];
  const deletedAttachmentIds: string[] = [];
  const attachmentRows = options.attachments ?? [
    {
      id: "attachment-1",
      entity_type: "job",
      entity_id: "job-1",
      bucket: "attachments",
      storage_path: "job/job-1/attachment-1-proof.pdf",
      file_name: "proof.pdf",
    },
  ];

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
    from: vi.fn((table: string) => {
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
          insert: vi.fn((values: Record<string, unknown>) => {
            writes.push({ table, op: "insert" });
            return Promise.resolve({ data: values, error: null });
          }),
          select: vi.fn(() => ({
            eq: vi.fn((column: string, value: unknown) => ({
              eq: vi.fn((nextColumn: string, nextValue: unknown) => ({
                in: vi.fn(async (_inColumn: string, ids: unknown[]) => {
                  const wantedIds = ids.map((entry) => String(entry ?? "").trim());
                  const rows = attachmentRows.filter((row) => {
                    return (
                      wantedIds.includes(String((row as any).id ?? "").trim()) &&
                      String((row as any)?.[column] ?? "") === String(value ?? "") &&
                      String((row as any)?.[nextColumn] ?? "") === String(nextValue ?? "")
                    );
                  });

                  return { data: rows, error: null };
                }),
              })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(async (_inColumn: string, ids: unknown[]) => {
                  writes.push({ table, op: "delete" });
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
          insert: vi.fn(async () => {
            writes.push({ table, op: "insert" });
            return { error: null };
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  const adminClient = {
    storage: {
      from(bucket: string) {
        if (bucket !== "attachments") {
          throw new Error(`Unexpected storage bucket ${bucket}`);
        }

        return {
          createSignedUploadUrl: vi.fn(async (path: string) => {
            storageOps.push({ op: "createSignedUploadUrl", path });
            return {
              data: {
                signedUrl: `https://signed-upload.example/${path}`,
                token: "upload-token-1",
              },
              error: null,
            };
          }),
          createSignedUrl: vi.fn(async (path: string) => {
            storageOps.push({ op: "createSignedUrl", path });
            return {
              data: {
                signedUrl: `https://signed-read.example/${path}`,
              },
              error: null,
            };
          }),
          remove: vi.fn(async (paths: string[]) => {
            for (const path of paths) {
              storageOps.push({ op: "remove", path });
            }
            return { data: null, error: null };
          }),
        };
      },
    },
  };

  return { supabase, adminClient, writes, storageOps, deletedAttachmentIds };
}

describe("attachment entitlement hardening", () => {
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

    loadScopedInternalAttachmentJobForMutationMock.mockResolvedValue({ id: "job-1" });
    loadScopedInternalJobAttachmentForMutationMock.mockResolvedValue({
      attachment: {
        id: "attachment-1",
        file_name: "proof.pdf",
      },
    });
    loadScopedInternalJobAttachmentsForMutationMock.mockResolvedValue({
      job: { id: "job-1" },
      attachments: [{ id: "attachment-1" }],
    });

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  describe("createJobAttachmentUploadToken", () => {
    it("allows active account upload-token generation", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);

      const { createJobAttachmentUploadToken } = await import("@/lib/actions/attachment-actions");

      const result = await createJobAttachmentUploadToken({
        jobId: "job-1",
        fileName: "proof.pdf",
        contentType: "application/pdf",
        fileSize: 123,
      });

      expect(result.attachmentId).toBeTruthy();
      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );
      expect(fixture.writes.some((w) => w.table === "attachments" && w.op === "insert")).toBe(true);
      expect(fixture.storageOps.some((op) => op.op === "createSignedUploadUrl")).toBe(true);
    });

    it("allows valid trial upload-token generation", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_trial",
      });

      const { createJobAttachmentUploadToken } = await import("@/lib/actions/attachment-actions");

      await createJobAttachmentUploadToken({
        jobId: "job-1",
        fileName: "proof.pdf",
        contentType: "application/pdf",
        fileSize: 123,
      });

      expect(fixture.writes.some((w) => w.table === "attachments" && w.op === "insert")).toBe(true);
      expect(fixture.storageOps.some((op) => op.op === "createSignedUploadUrl")).toBe(true);
    });

    it("blocks expired trial upload-token generation before writes", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_trial_expired",
      });

      const { createJobAttachmentUploadToken } = await import("@/lib/actions/attachment-actions");

      await expect(
        createJobAttachmentUploadToken({
          jobId: "job-1",
          fileName: "proof.pdf",
          contentType: "application/pdf",
          fileSize: 123,
        }),
      ).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
      );

      expect(fixture.writes).toHaveLength(0);
      expect(fixture.storageOps).toHaveLength(0);
    });

    it("blocks null-ended trial upload-token generation before writes", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_trial_missing_end",
      });

      const { createJobAttachmentUploadToken } = await import("@/lib/actions/attachment-actions");

      await expect(
        createJobAttachmentUploadToken({
          jobId: "job-1",
          fileName: "proof.pdf",
          contentType: "application/pdf",
          fileSize: 123,
        }),
      ).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
      );

      expect(fixture.writes).toHaveLength(0);
      expect(fixture.storageOps).toHaveLength(0);
    });

    it("allows internal comped upload-token generation", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_internal_comped",
      });

      const { createJobAttachmentUploadToken } = await import("@/lib/actions/attachment-actions");

      await createJobAttachmentUploadToken({
        jobId: "job-1",
        fileName: "proof.pdf",
        contentType: "application/pdf",
        fileSize: 123,
      });

      expect(fixture.writes.some((w) => w.table === "attachments" && w.op === "insert")).toBe(true);
      expect(fixture.storageOps.some((op) => op.op === "createSignedUploadUrl")).toBe(true);
    });

    it("blocks missing entitlement upload-token generation before writes", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_missing_entitlement",
      });

      const { createJobAttachmentUploadToken } = await import("@/lib/actions/attachment-actions");

      await expect(
        createJobAttachmentUploadToken({
          jobId: "job-1",
          fileName: "proof.pdf",
          contentType: "application/pdf",
          fileSize: 123,
        }),
      ).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
      );

      expect(fixture.writes).toHaveLength(0);
      expect(fixture.storageOps).toHaveLength(0);
    });
  });

  describe("finalizeInternalJobAttachmentUpload", () => {
    it("allows active account attachment finalization", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);

      const { finalizeInternalJobAttachmentUpload } = await import("@/lib/actions/attachment-actions");

      const result = await finalizeInternalJobAttachmentUpload({
        jobId: "job-1",
        attachmentIds: ["attachment-1"],
      });

      expect(result).toEqual({
        count: 1,
        attachmentIds: ["attachment-1"],
      });
      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );
      expect(fixture.writes.some((w) => w.table === "job_events" && w.op === "insert")).toBe(true);
      expect(fixture.storageOps.some((op) => op.op === "createSignedUrl")).toBe(true);
      expect(revalidatePathMock).toHaveBeenCalled();
    });

    it("allows valid trial attachment finalization", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_trial",
      });

      const { finalizeInternalJobAttachmentUpload } = await import("@/lib/actions/attachment-actions");

      await finalizeInternalJobAttachmentUpload({
        jobId: "job-1",
        attachmentIds: ["attachment-1"],
      });

      expect(fixture.writes.some((w) => w.table === "job_events" && w.op === "insert")).toBe(true);
      expect(fixture.storageOps.some((op) => op.op === "createSignedUrl")).toBe(true);
    });

    it("blocks expired trial finalization before writes", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_trial_expired",
      });

      const { finalizeInternalJobAttachmentUpload } = await import("@/lib/actions/attachment-actions");

      await expect(
        finalizeInternalJobAttachmentUpload({
          jobId: "job-1",
          attachmentIds: ["attachment-1"],
        }),
      ).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
      );

      expect(fixture.writes).toHaveLength(0);
      expect(fixture.storageOps).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("blocks null-ended trial finalization before writes", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_trial_missing_end",
      });

      const { finalizeInternalJobAttachmentUpload } = await import("@/lib/actions/attachment-actions");

      await expect(
        finalizeInternalJobAttachmentUpload({
          jobId: "job-1",
          attachmentIds: ["attachment-1"],
        }),
      ).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
      );

      expect(fixture.writes).toHaveLength(0);
      expect(fixture.storageOps).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("allows internal comped attachment finalization", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_internal_comped",
      });

      const { finalizeInternalJobAttachmentUpload } = await import("@/lib/actions/attachment-actions");

      await finalizeInternalJobAttachmentUpload({
        jobId: "job-1",
        attachmentIds: ["attachment-1"],
      });

      expect(fixture.writes.some((w) => w.table === "job_events" && w.op === "insert")).toBe(true);
      expect(fixture.storageOps.some((op) => op.op === "createSignedUrl")).toBe(true);
    });

    it("blocks missing entitlement finalization before writes", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_missing_entitlement",
      });

      const { finalizeInternalJobAttachmentUpload } = await import("@/lib/actions/attachment-actions");

      await expect(
        finalizeInternalJobAttachmentUpload({
          jobId: "job-1",
          attachmentIds: ["attachment-1"],
        }),
      ).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
      );

      expect(fixture.writes).toHaveLength(0);
      expect(fixture.storageOps).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });

  describe("discardInternalJobAttachmentUpload", () => {
    it("allows active account attachment discard", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);

      const { discardInternalJobAttachmentUpload } = await import("@/lib/actions/attachment-actions");

      await discardInternalJobAttachmentUpload({
        jobId: "job-1",
        attachmentId: "attachment-1",
      });

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );
      expect(fixture.deletedAttachmentIds).toEqual(["attachment-1"]);
      expect(fixture.storageOps.some((op) => op.op === "remove")).toBe(true);
    });

    it("allows valid trial attachment discard", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_trial",
      });

      const { discardInternalJobAttachmentUpload } = await import("@/lib/actions/attachment-actions");

      await discardInternalJobAttachmentUpload({
        jobId: "job-1",
        attachmentId: "attachment-1",
      });

      expect(fixture.deletedAttachmentIds).toEqual(["attachment-1"]);
      expect(fixture.storageOps.some((op) => op.op === "remove")).toBe(true);
    });

    it("blocks expired trial discard before writes", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_trial_expired",
      });

      const { discardInternalJobAttachmentUpload } = await import("@/lib/actions/attachment-actions");

      await expect(
        discardInternalJobAttachmentUpload({
          jobId: "job-1",
          attachmentId: "attachment-1",
        }),
      ).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
      );

      expect(fixture.deletedAttachmentIds).toHaveLength(0);
      expect(fixture.storageOps).toHaveLength(0);
    });

    it("blocks null-ended trial discard before writes", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_trial_missing_end",
      });

      const { discardInternalJobAttachmentUpload } = await import("@/lib/actions/attachment-actions");

      await expect(
        discardInternalJobAttachmentUpload({
          jobId: "job-1",
          attachmentId: "attachment-1",
        }),
      ).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
      );

      expect(fixture.deletedAttachmentIds).toHaveLength(0);
      expect(fixture.storageOps).toHaveLength(0);
    });

    it("allows internal comped attachment discard", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_internal_comped",
      });

      const { discardInternalJobAttachmentUpload } = await import("@/lib/actions/attachment-actions");

      await discardInternalJobAttachmentUpload({
        jobId: "job-1",
        attachmentId: "attachment-1",
      });

      expect(fixture.deletedAttachmentIds).toEqual(["attachment-1"]);
      expect(fixture.storageOps.some((op) => op.op === "remove")).toBe(true);
    });

    it("blocks missing entitlement discard before writes", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_missing_entitlement",
      });

      const { discardInternalJobAttachmentUpload } = await import("@/lib/actions/attachment-actions");

      await expect(
        discardInternalJobAttachmentUpload({
          jobId: "job-1",
          attachmentId: "attachment-1",
        }),
      ).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
      );

      expect(fixture.deletedAttachmentIds).toHaveLength(0);
      expect(fixture.storageOps).toHaveLength(0);
    });
  });

  describe("shareJobAttachmentToContractor", () => {
    it("allows active account attachment sharing", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);

      const { shareJobAttachmentToContractor } = await import("@/lib/actions/attachment-actions");

      await shareJobAttachmentToContractor({
        jobId: "job-1",
        attachmentId: "attachment-1",
      });

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );
      expect(fixture.writes.some((w) => w.table === "job_events" && w.op === "insert")).toBe(true);
      expect(revalidatePathMock).toHaveBeenCalledWith("/jobs/job-1");
      expect(revalidatePathMock).toHaveBeenCalledWith("/portal/jobs/job-1");
      expect(revalidatePathMock).toHaveBeenCalledWith("/portal");
    });

    it("allows valid trial attachment sharing", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_trial",
      });

      const { shareJobAttachmentToContractor } = await import("@/lib/actions/attachment-actions");

      await shareJobAttachmentToContractor({
        jobId: "job-1",
        attachmentId: "attachment-1",
      });

      expect(fixture.writes.some((w) => w.table === "job_events" && w.op === "insert")).toBe(true);
    });

    it("blocks expired trial sharing before writes", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_trial_expired",
      });

      const { shareJobAttachmentToContractor } = await import("@/lib/actions/attachment-actions");

      await expect(
        shareJobAttachmentToContractor({
          jobId: "job-1",
          attachmentId: "attachment-1",
        }),
      ).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
      );

      expect(fixture.writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("blocks null-ended trial sharing before writes", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_trial_missing_end",
      });

      const { shareJobAttachmentToContractor } = await import("@/lib/actions/attachment-actions");

      await expect(
        shareJobAttachmentToContractor({
          jobId: "job-1",
          attachmentId: "attachment-1",
        }),
      ).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
      );

      expect(fixture.writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("allows internal comped attachment sharing", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_internal_comped",
      });

      const { shareJobAttachmentToContractor } = await import("@/lib/actions/attachment-actions");

      await shareJobAttachmentToContractor({
        jobId: "job-1",
        attachmentId: "attachment-1",
      });

      expect(fixture.writes.some((w) => w.table === "job_events" && w.op === "insert")).toBe(true);
    });

    it("blocks missing entitlement sharing before writes", async () => {
      const fixture = makeAttachmentMutationFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue(fixture.adminClient);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_missing_entitlement",
      });

      const { shareJobAttachmentToContractor } = await import("@/lib/actions/attachment-actions");

      await expect(
        shareJobAttachmentToContractor({
          jobId: "job-1",
          attachmentId: "attachment-1",
        }),
      ).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
      );

      expect(fixture.writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });
});
