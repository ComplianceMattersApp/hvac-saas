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

    const {
      loadScopedInternalJobDetailReadBoundary,
      loadScopedInternalJobDetailReadBoundaryOutcome,
    } = await import(
      "@/lib/actions/internal-job-detail-read-boundary"
    );

    const scoped = await loadScopedInternalJobDetailReadBoundary({
      accountOwnerUserId: "owner-1",
      jobId: "123e4567-e89b-42d3-a456-426614174000",
    });
    const outcome = await loadScopedInternalJobDetailReadBoundaryOutcome({
      accountOwnerUserId: "owner-1",
      jobId: "123e4567-e89b-42d3-a456-426614174000",
    });

    expect(scoped).toMatchObject({ id: "job-1" });
    expect(outcome).toEqual({ status: "ok", job: { id: "job-1" } });
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountOwnerUserId: "owner-1",
        jobId: "123e4567-e89b-42d3-a456-426614174000",
        select: "id",
      }),
    );
  });

  it("denies cross-account internal read before assembly", async () => {
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "jobs") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      id: "123e4567-e89b-42d3-a456-426614174001",
                      customer_id: "223e4567-e89b-42d3-a456-426614174001",
                    },
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
                maybeSingle: vi.fn(async () => ({
                  data: {
                    id: "223e4567-e89b-42d3-a456-426614174001",
                    owner_user_id: "owner-other",
                  },
                  error: null,
                })),
              })),
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        };
      }),
    };

    const {
      loadScopedInternalJobDetailReadBoundary,
      loadScopedInternalJobDetailReadBoundaryOutcome,
    } = await import(
      "@/lib/actions/internal-job-detail-read-boundary"
    );

    const scoped = await loadScopedInternalJobDetailReadBoundary({
      accountOwnerUserId: "owner-2",
      jobId: "123e4567-e89b-42d3-a456-426614174001",
      admin,
    });
    const outcome = await loadScopedInternalJobDetailReadBoundaryOutcome({
      accountOwnerUserId: "owner-2",
      jobId: "123e4567-e89b-42d3-a456-426614174001",
      admin,
    });

    expect(scoped).toBeNull();
    expect(outcome).toEqual({ status: "forbidden" });
  });

  it("returns not_found when scoped job does not exist", async () => {
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "jobs") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        };
      }),
    };

    const { loadScopedInternalJobDetailReadBoundaryOutcome } = await import(
      "@/lib/actions/internal-job-detail-read-boundary"
    );

    const outcome = await loadScopedInternalJobDetailReadBoundaryOutcome({
      accountOwnerUserId: "owner-2",
      jobId: "123e4567-e89b-42d3-a456-426614174021",
      admin,
    });

    expect(outcome).toEqual({ status: "not_found" });
  });

  it("short-circuits malformed UUID before scoped lookup", async () => {
    const {
      loadScopedInternalJobDetailReadBoundary,
      loadScopedInternalJobDetailReadBoundaryOutcome,
    } = await import("@/lib/actions/internal-job-detail-read-boundary");

    const scoped = await loadScopedInternalJobDetailReadBoundary({
      accountOwnerUserId: "owner-2",
      jobId: "not-a-uuid",
    });
    const outcome = await loadScopedInternalJobDetailReadBoundaryOutcome({
      accountOwnerUserId: "owner-2",
      jobId: "not-a-uuid",
    });

    expect(scoped).toBeNull();
    expect(outcome).toEqual({ status: "invalid_job_id" });
    expect(loadScopedInternalJobForMutationMock).not.toHaveBeenCalled();
  });

  it("normalizes object-shaped scoped query errors", async () => {
    loadScopedInternalJobForMutationMock.mockRejectedValue({
      code: "22P02",
      message: "invalid input syntax for type uuid",
      details: "bad uuid literal",
      hint: null,
    });

    const {
      loadScopedInternalJobDetailReadBoundary,
      loadScopedInternalJobDetailReadBoundaryOutcome,
    } = await import("@/lib/actions/internal-job-detail-read-boundary");

    const outcome = await loadScopedInternalJobDetailReadBoundaryOutcome({
      accountOwnerUserId: "owner-2",
      jobId: "123e4567-e89b-42d3-a456-426614174009",
    });

    expect(outcome).toEqual({
      status: "query_error",
      error: {
        code: "22P02",
        message: "invalid input syntax for type uuid",
        details: "bad uuid literal",
        hint: null,
      },
    });

    await expect(
      loadScopedInternalJobDetailReadBoundary({
        accountOwnerUserId: "owner-2",
        jobId: "123e4567-e89b-42d3-a456-426614174009",
      }),
    ).rejects.toMatchObject({
      message: "invalid input syntax for type uuid",
      code: "22P02",
      details: "bad uuid literal",
    });
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

  it("prefers internal actor classification for dual-role users", async () => {
    requireInternalUserMock.mockResolvedValue({
      userId: "user-dual",
      internalUser: {
        user_id: "user-dual",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

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
      userId: "user-dual",
    });

    expect(result).toEqual({
      kind: "internal",
      internalUser: {
        user_id: "user-dual",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });
    expect(supabase.from).not.toHaveBeenCalled();
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

  it("keeps cross-account denial for dual-role internal users", async () => {
    requireInternalUserMock.mockResolvedValue({
      userId: "user-dual-cross",
      internalUser: {
        user_id: "user-dual-cross",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-2",
      },
    });

    const actorSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { contractor_id: "contractor-2" },
              error: null,
            })),
          })),
        })),
      })),
    };

    const admin = {
      from: vi.fn((table: string) => {
        if (table === "jobs") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      id: "123e4567-e89b-42d3-a456-426614174081",
                      customer_id: "223e4567-e89b-42d3-a456-426614174081",
                    },
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
                maybeSingle: vi.fn(async () => ({
                  data: {
                    id: "223e4567-e89b-42d3-a456-426614174081",
                    owner_user_id: "owner-other",
                  },
                  error: null,
                })),
              })),
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        };
      }),
    };

    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const {
      resolveJobDetailActor,
      loadScopedInternalJobDetailReadBoundaryOutcome,
    } = await import("@/lib/actions/internal-job-detail-read-boundary");

    const actor = await resolveJobDetailActor({
      supabase: actorSupabase,
      userId: "user-dual-cross",
    });
    expect(actor.kind).toBe("internal");

    const outcome = await loadScopedInternalJobDetailReadBoundaryOutcome({
      accountOwnerUserId: "owner-2",
      jobId: "123e4567-e89b-42d3-a456-426614174081",
      admin,
    });

    expect(outcome).toEqual({ status: "forbidden" });
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
    expect(query.eq).toHaveBeenCalledWith("lifecycle_state", "active");
    expect(eqMock).toHaveBeenCalledTimes(2);
    expect(orderMock).toHaveBeenCalledWith("name", { ascending: true });
  });
});
