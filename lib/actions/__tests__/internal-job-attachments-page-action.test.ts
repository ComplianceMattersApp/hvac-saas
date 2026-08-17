import { beforeEach, describe, expect, it, vi } from "vitest";

import { JOB_ATTACHMENT_PAGE_SIZE } from "@/lib/attachments/job-attachment-pagination";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalAttachmentJobForMutationMock = vi.fn();
const signAttachmentRowsMock = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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
  loadScopedInternalJobAttachmentForMutation: vi.fn(),
  loadScopedInternalJobAttachmentsForMutation: vi.fn(),
}));

vi.mock("@/lib/attachments/signed-attachment-urls", () => ({
  signAttachmentRows: (...args: unknown[]) => signAttachmentRowsMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: vi.fn(async () => ({ authorized: true })),
}));

vi.mock("@/lib/actions/notification-actions", () => ({
  insertInternalNotificationForEvent: vi.fn(async () => undefined),
}));

vi.mock("@/lib/notifications/contractor-shared-job-update", () => ({
  notifyContractorOfSharedJobUpdate: vi.fn(async () => undefined),
}));

/** Captures the range() bounds and filters the action applies. */
function makeSupabase(rows: Array<Record<string, unknown>>) {
  const calls = {
    range: null as { from: number; to: number } | null,
    filteredFinalized: false,
    orderedColumns: [] as string[],
  };

  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    not: (column: string, operator: string, value: unknown) => {
      if (column === "finalized_at" && operator === "is" && value === null) {
        calls.filteredFinalized = true;
      }
      return builder;
    },
    order: (column: string) => {
      calls.orderedColumns.push(column);
      return builder;
    },
    range: async (from: number, to: number) => {
      calls.range = { from, to };
      return { data: rows, error: null };
    },
  };

  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: "internal-1" } }, error: null }) },
    from: () => builder,
  };

  return { supabase, calls };
}

async function importAction() {
  return (await import("@/lib/actions/attachment-actions")).loadInternalJobAttachmentsPage;
}

describe("loadInternalJobAttachmentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    requireInternalUserMock.mockResolvedValue({
      internalUser: { account_owner_user_id: "account-1" },
    });
    loadScopedInternalAttachmentJobForMutationMock.mockResolvedValue({ id: "job-1" });
    createAdminClientMock.mockReturnValue({});
    signAttachmentRowsMock.mockImplementation(async ({ rows }: { rows: unknown[] }) => rows);
  });

  it("scopes the job to the caller's account before reading any rows", async () => {
    const { supabase } = makeSupabase([]);
    createClientMock.mockResolvedValue(supabase);

    const loadInternalJobAttachmentsPage = await importAction();
    await loadInternalJobAttachmentsPage({ jobId: "job-1" });

    expect(loadScopedInternalAttachmentJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "account-1", jobId: "job-1" }),
    );
  });

  it("refuses a job outside the caller's account without signing anything", async () => {
    const { supabase } = makeSupabase([]);
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalAttachmentJobForMutationMock.mockResolvedValue(null);

    const loadInternalJobAttachmentsPage = await importAction();

    await expect(
      loadInternalJobAttachmentsPage({ jobId: "someone-elses-job" }),
    ).rejects.toThrow(/Not authorized/);

    expect(signAttachmentRowsMock).not.toHaveBeenCalled();
  });

  it("rejects a missing job id before touching auth", async () => {
    const loadInternalJobAttachmentsPage = await importAction();

    await expect(loadInternalJobAttachmentsPage({ jobId: "  " })).rejects.toThrow(/Missing jobId/);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("excludes staged rows so an in-flight upload never pages in", async () => {
    const { supabase, calls } = makeSupabase([]);
    createClientMock.mockResolvedValue(supabase);

    const loadInternalJobAttachmentsPage = await importAction();
    await loadInternalJobAttachmentsPage({ jobId: "job-1" });

    expect(calls.filteredFinalized).toBe(true);
  });

  it("orders by created_at with an id tiebreaker so pages stay stable", async () => {
    const { supabase, calls } = makeSupabase([]);
    createClientMock.mockResolvedValue(supabase);

    const loadInternalJobAttachmentsPage = await importAction();
    await loadInternalJobAttachmentsPage({ jobId: "job-1" });

    expect(calls.orderedColumns).toEqual(["created_at", "id"]);
  });

  it("defaults to the first page", async () => {
    const { supabase, calls } = makeSupabase([]);
    createClientMock.mockResolvedValue(supabase);

    const loadInternalJobAttachmentsPage = await importAction();
    await loadInternalJobAttachmentsPage({ jobId: "job-1" });

    expect(calls.range).toEqual({ from: 0, to: JOB_ATTACHMENT_PAGE_SIZE - 1 });
  });

  it("reads the requested window on a later page", async () => {
    const { supabase, calls } = makeSupabase([]);
    createClientMock.mockResolvedValue(supabase);

    const loadInternalJobAttachmentsPage = await importAction();
    await loadInternalJobAttachmentsPage({ jobId: "job-1", offset: 24, limit: 24 });

    expect(calls.range).toEqual({ from: 24, to: 47 });
  });

  it("clamps a hostile page size rather than reading the table", async () => {
    const { supabase, calls } = makeSupabase([]);
    createClientMock.mockResolvedValue(supabase);

    const loadInternalJobAttachmentsPage = await importAction();
    const result = await loadInternalJobAttachmentsPage({
      jobId: "job-1",
      offset: -10,
      limit: 100_000,
    });

    expect(calls.range?.from).toBe(0);
    expect(result.limit).toBeLessThanOrEqual(100);
  });

  it("returns the signed rows for the page", async () => {
    const { supabase } = makeSupabase([
      { id: "a1", bucket: "attachments", storage_path: "job/job-1/a1.jpg" },
    ]);
    createClientMock.mockResolvedValue(supabase);
    signAttachmentRowsMock.mockResolvedValue([
      { id: "a1", signedUrl: "https://signed.example/a1.jpg" },
    ]);

    const loadInternalJobAttachmentsPage = await importAction();
    const result = await loadInternalJobAttachmentsPage({ jobId: "job-1", offset: 0 });

    expect(result.items).toEqual([{ id: "a1", signedUrl: "https://signed.example/a1.jpg" }]);
    expect(result.offset).toBe(0);
  });
});
