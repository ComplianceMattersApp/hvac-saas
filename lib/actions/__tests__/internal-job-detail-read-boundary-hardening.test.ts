import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const isInternalAccessErrorMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  isInternalAccessError: (...args: unknown[]) => isInternalAccessErrorMock(...args),
}));

vi.mock("@/lib/auth/internal-job-scope", () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) =>
    loadScopedInternalJobForMutationMock(...args),
}));

describe("internal job-detail read boundary hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    isInternalAccessErrorMock.mockReturnValue(false);
  });

  it("allows same-account internal read preflight", async () => {
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { loadScopedInternalJobDetailReadBoundary } = await import(
      "@/lib/actions/internal-job-detail-read-boundary"
    );

    const scoped = await loadScopedInternalJobDetailReadBoundary({
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
    });

    expect(scoped).toMatchObject({ id: "job-1" });
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountOwnerUserId: "owner-1",
        jobId: "job-1",
        select: "id",
      }),
    );
  });

  it("denies cross-account internal read before assembly", async () => {
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { loadScopedInternalJobDetailReadBoundary } = await import(
      "@/lib/actions/internal-job-detail-read-boundary"
    );

    const scoped = await loadScopedInternalJobDetailReadBoundary({
      accountOwnerUserId: "owner-2",
      jobId: "job-1",
    });

    expect(scoped).toBeNull();
  });

  it("preserves non-internal contractor redirect classification", async () => {
    requireInternalUserMock.mockRejectedValue(new Error("not-internal"));
    isInternalAccessErrorMock.mockReturnValue(true);

    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { contractor_id: "contractor-1" },
              error: null,
            })),
          })),
        })),
      })),
    };

    const { resolveJobDetailActor } = await import(
      "@/lib/actions/internal-job-detail-read-boundary"
    );

    const result = await resolveJobDetailActor({
      supabase,
      userId: "user-1",
    });

    expect(result).toEqual({ kind: "contractor" });
  });

  it("preserves non-internal login classification for non-contractor", async () => {
    requireInternalUserMock.mockRejectedValue(new Error("not-internal"));
    isInternalAccessErrorMock.mockReturnValue(true);

    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: null,
              error: null,
            })),
          })),
        })),
      })),
    };

    const { resolveJobDetailActor } = await import(
      "@/lib/actions/internal-job-detail-read-boundary"
    );

    const result = await resolveJobDetailActor({
      supabase,
      userId: "user-2",
    });

    expect(result).toEqual({ kind: "unauthorized" });
  });

  it("allows same-account signed URL generation after signing preflight", async () => {
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const createSignedUrlMock = vi.fn(async () => ({
      data: { signedUrl: "https://signed.example/file-1" },
      error: null,
    }));

    const admin = {
      storage: {
        from: vi.fn(() => ({
          createSignedUrl: createSignedUrlMock,
        })),
      },
    };

    const { signScopedInternalJobDetailAttachments } = await import(
      "@/lib/actions/internal-job-detail-read-boundary"
    );

    const result = await signScopedInternalJobDetailAttachments({
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      attachmentRows: [
        {
          id: "attachment-1",
          bucket: "attachments",
          storage_path: "job/job-1/attachment-1.pdf",
          content_type: "application/pdf",
        },
      ],
      admin,
    });

    expect(result.authorized).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].signedUrl).toBe("https://signed.example/file-1");
    expect(createSignedUrlMock).toHaveBeenCalledTimes(1);
  });

  it("denies cross-account before signed URL generation and does not sign", async () => {
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const createSignedUrlMock = vi.fn(async () => ({
      data: { signedUrl: "https://signed.example/file-2" },
      error: null,
    }));

    const admin = {
      storage: {
        from: vi.fn(() => ({
          createSignedUrl: createSignedUrlMock,
        })),
      },
    };

    const { signScopedInternalJobDetailAttachments } = await import(
      "@/lib/actions/internal-job-detail-read-boundary"
    );

    const result = await signScopedInternalJobDetailAttachments({
      accountOwnerUserId: "owner-2",
      jobId: "job-1",
      attachmentRows: [
        {
          id: "attachment-2",
          bucket: "attachments",
          storage_path: "job/job-1/attachment-2.pdf",
          content_type: "application/pdf",
        },
      ],
      admin,
    });

    expect(result).toEqual({ authorized: false, items: [] });
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it("scopes contractor enumeration by account owner", async () => {
    const eqMock = vi.fn();
    const orderMock = vi.fn(async () => ({ data: [{ id: "contractor-1" }], error: null }));

    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn(() => {
        eqMock();
        return query;
      }),
      order: orderMock,
    };

    const supabase = {
      from: vi.fn(() => query),
    };

    const { listScopedContractorsForJobDetail } = await import(
      "@/lib/actions/internal-job-detail-read-boundary"
    );

    const rows = await listScopedContractorsForJobDetail({
      supabase,
      accountOwnerUserId: "owner-1",
    });

    expect(rows).toEqual([{ id: "contractor-1" }]);
    expect(query.eq).toHaveBeenCalledWith("owner_user_id", "owner-1");
    expect(eqMock).toHaveBeenCalledTimes(1);
    expect(orderMock).toHaveBeenCalledWith("name", { ascending: true });
  });
});
