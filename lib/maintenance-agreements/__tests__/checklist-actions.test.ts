import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const isMaintenanceAgreementsEnabledMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePathMock(path),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  isInternalAccessError: (error: unknown) =>
    Boolean(error) && typeof error === "object" && (error as any).name === "InternalAccessError",
}));

vi.mock("@/lib/maintenance-agreements/agreement-exposure", () => ({
  isMaintenanceAgreementsEnabled: (...args: unknown[]) => isMaintenanceAgreementsEnabledMock(...args),
}));

// ---- helpers ----

function makeChain(overrides: Record<string, any> = {}): any {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    single: vi.fn(async () => ({ data: null, error: null })),
    ...overrides,
  };
  return chain;
}

function makeAdminClient(opts: {
  agreementRow?: any;
  templateItems?: any[];
  insertError?: any;
  noAgreement?: boolean;
} = {}) {
  const insertCalls: unknown[] = [];
  const defaultAgreement = {
    id: "agr-1",
    account_owner_user_id: "owner-1",
    source_template_id: "tpl-1",
  };
  const defaultItems = [
    { id: "ci-1", item_label: "Check filter", sort_order: 0 },
    { id: "ci-2", item_label: "Clean coil", sort_order: 1 },
  ];

  const client = {
    from: vi.fn((table: string) => {
      if (table === "internal_users") {
        return makeChain({
          maybeSingle: vi.fn(async () => ({
            data: { account_owner_user_id: "owner-1", is_active: true },
            error: null,
          })),
        });
      }

      if (table === "maintenance_agreements") {
        const row = opts.noAgreement
          ? null
          : (opts.agreementRow !== undefined ? opts.agreementRow : defaultAgreement);
        return makeChain({
          maybeSingle: vi.fn(async () => ({ data: row, error: null })),
        });
      }

      if (table === "maintenance_agreement_template_checklist_items") {
        const items = opts.templateItems !== undefined ? opts.templateItems : defaultItems;
        return makeChain({
          limit: vi.fn(() => Promise.resolve({ data: items, error: null })),
        });
      }

      if (table === "job_checklist_item_completions") {
        return {
          insert: vi.fn((payload: unknown) => {
            insertCalls.push(payload);
            return { data: null, error: opts.insertError ?? null };
          }),
        };
      }

      return makeChain();
    }),
    _insertCalls: insertCalls,
  };

  return client;
}

function makeUserClient(opts: { updateError?: any } = {}) {
  const updateCalls: unknown[] = [];

  const buildEqChain = (depth = 0): any => {
    const chain: any = {
      eq: vi.fn(() => buildEqChain(depth + 1)),
    };
    if (depth >= 2) {
      // 3rd eq is the last — the await resolves from here
      chain.eq = vi.fn(() =>
        Promise.resolve({ error: opts.updateError ?? null }),
      );
    }
    return chain;
  };

  const client = {
    from: vi.fn((table: string) => {
      if (table === "job_checklist_item_completions") {
        return {
          update: vi.fn((payload: unknown) => {
            updateCalls.push(payload);
            // update().eq("id",...).eq("job_id",...).eq("account_owner_user_id",...)
            // The last .eq() is awaited directly.
            const eq3 = vi.fn(() => Promise.resolve({ error: opts.updateError ?? null }));
            const eq2 = vi.fn(() => ({ eq: eq3 }));
            const eq1 = vi.fn(() => ({ eq: eq2 }));
            return { eq: eq1 };
          }),
        };
      }
      return {
        select: vi.fn(() => makeChain()),
        update: vi.fn(() => makeChain()),
      };
    }),
    _updateCalls: updateCalls,
  };

  return client;
}

const { copyChecklistItemsToJob, updateJobChecklistItemCompletionFromForm } =
  await import("@/lib/maintenance-agreements/agreement-actions");

const { getMostRecentCountedVisitChecklistSummary } =
  await import("@/lib/maintenance-agreements/read-model");

// ---- copyChecklistItemsToJob ----

describe("copyChecklistItemsToJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMaintenanceAgreementsEnabledMock.mockReturnValue(true);
  });

  it("returns false when feature flag is disabled", async () => {
    isMaintenanceAgreementsEnabledMock.mockReturnValue(false);
    const result = await copyChecklistItemsToJob({
      agreementId: "agr-1",
      jobId: "job-1",
      createdByUserId: "user-1",
    });
    expect(result).toBe(false);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("returns false when params are missing", async () => {
    const r1 = await copyChecklistItemsToJob({ agreementId: "", jobId: "job-1", createdByUserId: "user-1" });
    expect(r1).toBe(false);
    const r2 = await copyChecklistItemsToJob({ agreementId: "agr-1", jobId: "", createdByUserId: "user-1" });
    expect(r2).toBe(false);
    const r3 = await copyChecklistItemsToJob({ agreementId: "agr-1", jobId: "job-1", createdByUserId: "" });
    expect(r3).toBe(false);
  });

  it("copies template items to job on success", async () => {
    const admin = makeAdminClient({
      templateItems: [
        { id: "ci-1", item_label: "Check filter", sort_order: 0 },
        { id: "ci-2", item_label: "Clean coil", sort_order: 1 },
      ],
    });
    createAdminClientMock.mockReturnValue(admin);

    const result = await copyChecklistItemsToJob({
      agreementId: "agr-1",
      jobId: "job-1",
      createdByUserId: "user-1",
      accountOwnerUserId: "owner-1",
    });

    expect(result).toBe(true);
    expect(admin._insertCalls).toHaveLength(1);
    expect(admin._insertCalls[0]).toMatchObject([
      {
        job_id: "job-1",
        source_item_id: "ci-1",
        item_label: "Check filter",
        sort_order: 0,
        is_completed: false,
        account_owner_user_id: "owner-1",
      },
      {
        job_id: "job-1",
        source_item_id: "ci-2",
        item_label: "Clean coil",
        sort_order: 1,
        is_completed: false,
      },
    ]);
  });

  it("returns true (non-blocking) when there is no source_template_id on the agreement", async () => {
    const admin = makeAdminClient({
      agreementRow: { id: "agr-1", account_owner_user_id: "owner-1", source_template_id: null },
    });
    createAdminClientMock.mockReturnValue(admin);

    const result = await copyChecklistItemsToJob({
      agreementId: "agr-1",
      jobId: "job-1",
      createdByUserId: "user-1",
      accountOwnerUserId: "owner-1",
    });

    expect(result).toBe(true);
    expect(admin._insertCalls).toHaveLength(0);
  });

  it("returns true (non-blocking) when template has no checklist items", async () => {
    const admin = makeAdminClient({ templateItems: [] });
    createAdminClientMock.mockReturnValue(admin);

    const result = await copyChecklistItemsToJob({
      agreementId: "agr-1",
      jobId: "job-1",
      createdByUserId: "user-1",
      accountOwnerUserId: "owner-1",
    });

    expect(result).toBe(true);
    expect(admin._insertCalls).toHaveLength(0);
  });

  it("returns false but does not throw when insert fails", async () => {
    const admin = makeAdminClient({ insertError: { code: "23503", message: "FK violation" } });
    createAdminClientMock.mockReturnValue(admin);

    const result = await copyChecklistItemsToJob({
      agreementId: "agr-1",
      jobId: "job-1",
      createdByUserId: "user-1",
      accountOwnerUserId: "owner-1",
    });

    expect(result).toBe(false);
  });

  it("returns false (non-blocking) when agreement is not in scope", async () => {
    const admin = makeAdminClient({ noAgreement: true });
    createAdminClientMock.mockReturnValue(admin);

    const result = await copyChecklistItemsToJob({
      agreementId: "agr-not-found",
      jobId: "job-1",
      createdByUserId: "user-1",
      accountOwnerUserId: "owner-1",
    });

    expect(result).toBe(false);
  });
});

// ---- updateJobChecklistItemCompletionFromForm ----

describe("updateJobChecklistItemCompletionFromForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMaintenanceAgreementsEnabledMock.mockReturnValue(true);
    requireInternalUserMock.mockResolvedValue({
      internalUser: {
        user_id: "user-1",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });
  });

  it("returns error when feature flag is disabled", async () => {
    isMaintenanceAgreementsEnabledMock.mockReturnValue(false);
    const fd = new FormData();
    fd.set("item_id", "ci-1");
    fd.set("job_id", "job-1");
    fd.set("is_completed", "true");

    const result = await updateJobChecklistItemCompletionFromForm(fd);
    expect(result).toMatchObject({ success: false });
  });

  it("marks item completed with completed_by_user_id and completed_at", async () => {
    const userClient = makeUserClient();
    createClientMock.mockResolvedValue(userClient);

    const fd = new FormData();
    fd.set("item_id", "ci-1");
    fd.set("job_id", "job-1");
    fd.set("is_completed", "true");

    const result = await updateJobChecklistItemCompletionFromForm(fd);
    expect(result).toEqual({ success: true });
    expect(userClient._updateCalls[0]).toMatchObject({
      is_completed: true,
      completed_by_user_id: "user-1",
    });
    expect((userClient._updateCalls[0] as any).completed_at).toBeTruthy();
    expect((userClient._updateCalls[0] as any).completed_at).not.toBeNull();
  });

  it("marks item incomplete and clears completion fields while preserving notes", async () => {
    const userClient = makeUserClient();
    createClientMock.mockResolvedValue(userClient);

    const fd = new FormData();
    fd.set("item_id", "ci-1");
    fd.set("job_id", "job-1");
    fd.set("is_completed", "false");
    fd.set("notes", "My existing note");

    const result = await updateJobChecklistItemCompletionFromForm(fd);
    expect(result).toEqual({ success: true });
    expect(userClient._updateCalls[0]).toMatchObject({
      is_completed: false,
      completed_by_user_id: null,
      completed_at: null,
      notes: "My existing note",
    });
  });

  it("returns error when item_id or job_id is missing", async () => {
    const userClient = makeUserClient();
    createClientMock.mockResolvedValue(userClient);

    const fd1 = new FormData();
    fd1.set("job_id", "job-1");
    fd1.set("is_completed", "true");
    const r1 = await updateJobChecklistItemCompletionFromForm(fd1);
    expect(r1).toMatchObject({ success: false });

    const fd2 = new FormData();
    fd2.set("item_id", "ci-1");
    fd2.set("is_completed", "true");
    const r2 = await updateJobChecklistItemCompletionFromForm(fd2);
    expect(r2).toMatchObject({ success: false });
  });

  it("revalidates the job path on success", async () => {
    const userClient = makeUserClient();
    createClientMock.mockResolvedValue(userClient);

    const fd = new FormData();
    fd.set("item_id", "ci-1");
    fd.set("job_id", "job-42");
    fd.set("is_completed", "true");

    await updateJobChecklistItemCompletionFromForm(fd);
    expect(revalidatePathMock).toHaveBeenCalledWith("/jobs/job-42");
  });
});

// ---- getMostRecentCountedVisitChecklistSummary ----

describe("getMostRecentCountedVisitChecklistSummary", () => {
  function makeReadClient(opts: {
    visitRow?: any;
    noVisit?: boolean;
    checklistRows?: any[];
  } = {}) {
    const visitData = opts.noVisit ? null : (opts.visitRow ?? { job_id: "job-1" });
    const checklistData = opts.checklistRows ?? [
      { is_completed: true },
      { is_completed: false },
      { is_completed: true },
    ];
    return {
      from: vi.fn((table: string) => {
        if (table === "maintenance_agreement_visits") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({
                        maybeSingle: vi.fn(async () => ({
                          data: visitData,
                          error: null,
                        })),
                      })),
                    })),
                  })),
                })),
              })),
            })),
          };
        }

        if (table === "job_checklist_item_completions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({
                  data: checklistData,
                  error: null,
                })),
              })),
            })),
          };
        }

        return makeChain();
      }),
    };
  }

  it("returns correct counts from the most recently counted job", async () => {
    const supabase = makeReadClient({
      checklistRows: [
        { is_completed: true },
        { is_completed: false },
        { is_completed: true },
      ],
    });

    const result = await getMostRecentCountedVisitChecklistSummary({
      supabase,
      accountOwnerUserId: "owner-1",
      agreementId: "agr-1",
    });

    expect(result).toEqual({ total_items: 3, completed_items: 2 });
  });

  it("returns null when there is no counted visit", async () => {
    const supabase = makeReadClient({ noVisit: true });

    const result = await getMostRecentCountedVisitChecklistSummary({
      supabase,
      accountOwnerUserId: "owner-1",
      agreementId: "agr-1",
    });

    expect(result).toBeNull();
  });

  it("returns null when the most recently counted job has no checklist items", async () => {
    const supabase = makeReadClient({ checklistRows: [] });

    const result = await getMostRecentCountedVisitChecklistSummary({
      supabase,
      accountOwnerUserId: "owner-1",
      agreementId: "agr-1",
    });

    expect(result).toBeNull();
  });

  it("returns null when accountOwnerUserId or agreementId is missing", async () => {
    const supabase = makeReadClient();

    const r1 = await getMostRecentCountedVisitChecklistSummary({
      supabase,
      accountOwnerUserId: null,
      agreementId: "agr-1",
    });
    expect(r1).toBeNull();

    const r2 = await getMostRecentCountedVisitChecklistSummary({
      supabase,
      accountOwnerUserId: "owner-1",
      agreementId: null,
    });
    expect(r2).toBeNull();
  });
});
