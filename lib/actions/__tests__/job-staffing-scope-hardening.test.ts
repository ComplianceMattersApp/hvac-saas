import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const revalidatePathMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  refresh: (...args: unknown[]) => refreshMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  requireInternalRole: vi.fn(),
}));

vi.mock("@/lib/auth/internal-job-scope", () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) =>
    loadScopedInternalJobForMutationMock(...args),
  loadScopedInternalServiceCaseForMutation: vi.fn(),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("@/lib/actions/job-evaluator", () => ({
  evaluateJobOpsStatus: vi.fn(async () => undefined),
  healStalePaperworkOpsStatus: vi.fn(async () => true),
}));

vi.mock("@/lib/actions/ecc-status", () => ({
  evaluateEccOpsStatus: vi.fn(async () => undefined),
}));

vi.mock("@/lib/actions/ops-status", () => ({
  forceSetOpsStatus: vi.fn(async () => undefined),
}));

vi.mock("@/lib/actions/job-ops-actions", () => ({
  releasePendingInfoAndRecompute: vi.fn(async () => null),
}));

vi.mock("@/lib/actions/job-event-meta", () => ({
  buildMovementEventMeta: vi.fn(() => ({})),
  buildStaffingSnapshotMeta: vi.fn(() => ({ source: "test" })),
}));

function buildAssignFormData(values?: Partial<Record<string, string>>) {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("user_id", "internal-user-2");
  formData.set("tab", "ops");
  if (values) {
    for (const [key, value] of Object.entries(values)) {
      if (value != null) formData.set(key, value);
    }
  }
  return formData;
}

function buildTeamAssignmentFormData(params?: {
  selectedUserIds?: string[];
  primaryUserId?: string;
  values?: Partial<Record<string, string>>;
}) {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("tab", "ops");
  for (const userId of params?.selectedUserIds ?? []) {
    formData.append("selected_user_ids", userId);
  }
  if (params?.primaryUserId) {
    formData.set("primary_user_id", params.primaryUserId);
  }
  for (const [key, value] of Object.entries(params?.values ?? {})) {
    if (value != null) formData.set(key, value);
  }
  return formData;
}

function makeDenySupabaseFixture() {
  const assignmentWrites: Array<{ method: string; payload?: Record<string, unknown> }> = [];
  const jobEventWrites: Array<Record<string, unknown>> = [];

  const supabase = {
    from(table: string) {
      if (table === "job_assignments") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          })),
          insert: vi.fn((payload: Record<string, unknown>) => {
            assignmentWrites.push({ method: "insert", payload });
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: null, error: null })),
              })),
            };
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            assignmentWrites.push({ method: "update", payload });
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(async () => ({ data: [], error: null })),
                  })),
                })),
              })),
            };
          }),
        };
      }

      if (table === "job_events") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            jobEventWrites.push(payload);
            return Promise.resolve({ error: null });
          }),
        };
      }

      if (table === "internal_users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      user_id: "internal-user-2",
                      is_active: true,
                      account_owner_user_id: "owner-1",
                    },
                    error: null,
                  })),
                })),
                maybeSingle: vi.fn(async () => ({
                  data: {
                    user_id: "internal-user-2",
                    is_active: true,
                    account_owner_user_id: "owner-1",
                  },
                  error: null,
                })),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { supabase, assignmentWrites, jobEventWrites };
}

function makeAllowSupabaseFixture(options?: { existingActiveAssignment?: boolean }) {
  const calls: Array<{ table: string; op: string; payload?: Record<string, unknown> }> = [];
  const notificationWrites: Array<Record<string, unknown>> = [];
  let activeAssignmentSelectCount = 0;
  const existingActiveAssignment = Boolean(options?.existingActiveAssignment);

  const makeEqChain = (result: { data: any; error: any }) => ({
    eq: vi.fn(() => makeEqChain(result)),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
    select: vi.fn(async () => ({ data: Array.isArray(result.data) ? result.data : [result.data], error: result.error })),
  });

  const supabase = {
    from(table: string) {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({
              data: [
                {
                  id: "internal-user-1",
                  full_name: "Alex Technician",
                  email: "alex@example.com",
                },
              ],
              error: null,
            })),
          })),
        };
      }

      if (table === "internal_users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() =>
              makeEqChain({
                data: {
                  user_id: "internal-user-2",
                  role: "tech",
                  is_active: true,
                  account_owner_user_id: "owner-1",
                },
                error: null,
              }),
            ),
          })),
        };
      }

      if (table === "job_assignments") {
        return {
          select: vi.fn((selection?: string) => {
            const normalizedSelection = String(selection ?? "");
            if (normalizedSelection.includes("assigned_by")) {
              activeAssignmentSelectCount += 1;
              const result =
                activeAssignmentSelectCount === 1 && !existingActiveAssignment
                  ? { data: null, error: null }
                  : {
                      data: {
                        id: "assignment-1",
                        job_id: "job-1",
                        user_id: "internal-user-2",
                        assigned_by: "internal-user-1",
                        is_active: true,
                        is_primary: false,
                        created_at: "2026-04-22T00:00:00.000Z",
                        removed_at: null,
                        removed_by: null,
                      },
                      error: null,
                    };

              return {
                eq: vi.fn(() => makeEqChain(result)),
              };
            }

            return {
              eq: vi.fn(() => makeEqChain({ data: { id: "assignment-1", is_primary: false }, error: null })),
            };
          }),
          insert: vi.fn((payload: Record<string, unknown>) => {
            calls.push({ table, op: "insert", payload });
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: "assignment-1",
                    job_id: "job-1",
                    user_id: String(payload.user_id ?? "internal-user-2"),
                    assigned_by: "internal-user-1",
                    is_active: true,
                    is_primary: false,
                    created_at: "2026-04-22T00:00:00.000Z",
                    removed_at: null,
                    removed_by: null,
                  },
                  error: null,
                })),
              })),
            };
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            calls.push({ table, op: "update", payload });
            return {
              eq: vi.fn(() =>
                makeEqChain({
                  data: [{ id: "assignment-1" }],
                  error: null,
                }),
              ),
            };
          }),
        };
      }

      if (table === "job_events") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            calls.push({ table, op: "insert", payload });
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "event-1" }, error: null })),
              })),
            };
          }),
        };
      }

      if (table === "notifications") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            notificationWrites.push(payload);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "notif-1" }, error: null })),
              })),
            };
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { supabase, calls, notificationWrites };
}

function makeTeamAssignmentFixture(options?: {
  assignments?: PrimaryAssignmentRow[];
  assignableUserIds?: string[];
  failInsertUserIds?: string[];
  failUpdatePayload?: Record<string, unknown>;
}) {
  const assignments = (options?.assignments ?? []).map((row) => ({ ...row }));
  const assignableUserIds = new Set(
    options?.assignableUserIds ?? [
      "internal-user-1",
      "internal-user-2",
      "internal-user-3",
      "internal-user-4",
    ],
  );
  const writes: Array<{ table: string; op: string; payload?: Record<string, unknown> }> = [];
  const notifications: Array<Record<string, unknown>> = [];
  const operations: string[] = [];
  const failInsertUserIds = new Set(options?.failInsertUserIds ?? []);
  const failUpdatePayload = options?.failUpdatePayload ?? null;

  function matches(row: Record<string, unknown>, filters: Array<[string, unknown]>) {
    return filters.every(([key, value]) => row[key] === value);
  }

  function selectableAssignments(filters: Array<[string, unknown]>) {
    return assignments.filter((row) => matches(row, filters));
  }

  function makeQuery(table: string, op: "select" | "update" | "insert", payload?: Record<string, unknown>) {
    const filters: Array<[string, unknown]> = [];
    const query = {
      eq(key: string, value: unknown) {
        filters.push([key, value]);
        return query;
      },
      async maybeSingle() {
        if (table === "job_assignments") {
          return { data: selectableAssignments(filters)[0] ?? null, error: null };
        }
        if (table === "internal_users") {
          const userId = String(filters.find(([key]) => key === "user_id")?.[1] ?? "");
          return {
            data: assignableUserIds.has(userId)
              ? {
                  user_id: userId,
                  role: "tech",
                  is_active: true,
                  account_owner_user_id: "owner-1",
                }
              : null,
            error: null,
          };
        }
        return { data: null, error: null };
      },
      async single() {
        if (table === "job_assignments" && op === "insert" && payload) {
          const userId = String(payload.user_id);
          if (failInsertUserIds.has(userId)) {
            return {
              data: null,
              error: {
                code: "42501",
                message: "new row violates row-level security policy for table \"job_assignments\"",
              },
            };
          }
          const row: PrimaryAssignmentRow = {
            id: `assignment-${userId}`,
            job_id: String(payload.job_id),
            user_id: userId,
            is_active: Boolean(payload.is_active),
            is_primary: Boolean(payload.is_primary),
          };
          assignments.push(row);
          return { data: row, error: null };
        }
        if (table === "job_events") return { data: { id: "event-1" }, error: null };
        if (table === "notifications") return { data: { id: "notification-1" }, error: null };
        return { data: null, error: null };
      },
      select() {
        return query;
      },
      then(
        onFulfilled: (value: { data?: unknown; error: unknown }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        if (table === "job_assignments" && op === "select") {
          return Promise.resolve({ data: selectableAssignments(filters), error: null }).then(
            onFulfilled,
            onRejected,
          );
        }

        if (table === "job_assignments" && op === "update" && payload) {
          if (
            failUpdatePayload &&
            Object.entries(failUpdatePayload).every(([key, value]) => payload[key] === value)
          ) {
            writes.push({ table, op, payload });
            operations.push(`${table}:${op}`);
            return Promise.resolve({
              data: null,
              error: {
                code: "42501",
                message: "new row violates row-level security policy for table \"job_assignments\"",
              },
            }).then(onFulfilled, onRejected);
          }
          writes.push({ table, op, payload });
          operations.push(`${table}:${op}`);
          const changedRows = selectableAssignments(filters);
          for (const row of changedRows) {
            Object.assign(row, payload);
          }
          return Promise.resolve({
            data: changedRows.map((row) => ({ id: row.id })),
            error: null,
          }).then(onFulfilled, onRejected);
        }

        return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
      },
    };
    return query;
  }

  const supabase = {
    from(table: string) {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async (column: string, ids: string[]) => ({
              data: (ids ?? []).map((id) => ({
                id,
                full_name: id === "internal-user-1" ? "Alex Office" : null,
                email: `${id}@example.com`,
              })),
              error: null,
            })),
          })),
        };
      }

      if (table === "job_assignments" || table === "internal_users") {
        return {
          select: vi.fn(() => makeQuery(table, "select")),
          update: vi.fn((payload: Record<string, unknown>) => makeQuery(table, "update", payload)),
          insert: vi.fn((payload: Record<string, unknown>) => {
            if (table === "job_assignments") {
              const duplicateActive = assignments.some(
                (row) =>
                  row.job_id === payload.job_id &&
                  row.user_id === payload.user_id &&
                  row.is_active === true,
              );
              if (duplicateActive) {
                throw new Error("duplicate active assignment insert attempted");
              }
            }
            writes.push({ table, op: "insert", payload });
            operations.push(`${table}:insert`);
            return makeQuery(table, "insert", payload);
          }),
        };
      }

      if (table === "job_events") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            writes.push({ table, op: "insert", payload });
            operations.push(`${table}:insert`);
            return makeQuery(table, "insert", payload);
          }),
        };
      }

      if (table === "notifications") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            notifications.push(payload);
            operations.push(`${table}:insert`);
            return makeQuery(table, "insert", payload);
          }),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { supabase, assignments, writes, notifications, operations };
}

type PrimaryAssignmentRow = {
  id: string;
  job_id: string;
  user_id: string;
  is_active: boolean;
  is_primary: boolean;
};

function makePrimaryMutationFixture(options?: {
  assignments?: PrimaryAssignmentRow[];
  assignableUserIds?: string[];
}) {
  const assignments = (options?.assignments ?? [
    {
      id: "assignment-primary",
      job_id: "job-1",
      user_id: "internal-user-1",
      is_active: true,
      is_primary: true,
    },
    {
      id: "assignment-target",
      job_id: "job-1",
      user_id: "internal-user-2",
      is_active: true,
      is_primary: false,
    },
  ]).map((row) => ({ ...row }));
  const assignableUserIds = new Set(options?.assignableUserIds ?? ["internal-user-1", "internal-user-2"]);
  const writes: Array<{ table: string; op: string; payload?: Record<string, unknown> }> = [];

  function matches(row: Record<string, unknown>, filters: Array<[string, unknown]>) {
    return filters.every(([key, value]) => row[key] === value);
  }

  function makeQuery(table: string, op: "select" | "update" | "insert", payload?: Record<string, unknown>) {
    const filters: Array<[string, unknown]> = [];
    const query = {
      eq(key: string, value: unknown) {
        filters.push([key, value]);
        return query;
      },
      async maybeSingle() {
        if (table === "job_assignments") {
          return { data: assignments.find((row) => matches(row, filters)) ?? null, error: null };
        }
        if (table === "internal_users") {
          const userId = String(filters.find(([key]) => key === "user_id")?.[1] ?? "");
          return {
            data: assignableUserIds.has(userId)
              ? {
                  user_id: userId,
                  role: "tech",
                  is_active: true,
                  account_owner_user_id: "owner-1",
                }
              : null,
            error: null,
          };
        }
        return { data: null, error: null };
      },
      async single() {
        if (table === "job_events") return { data: { id: "event-1" }, error: null };
        return { data: null, error: null };
      },
      select() {
        return query;
      },
      then(onFulfilled: (value: { error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
        if (op === "update" && table === "job_assignments" && payload) {
          writes.push({ table, op, payload });
          for (const row of assignments) {
            if (matches(row, filters)) {
              Object.assign(row, payload);
            }
          }
        }
        return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
      },
    };
    return query;
  }

  const supabase = {
    from(table: string) {
      if (table === "job_assignments" || table === "internal_users") {
        return {
          select: vi.fn(() => makeQuery(table, "select")),
          update: vi.fn((payload: Record<string, unknown>) => makeQuery(table, "update", payload)),
          insert: vi.fn((payload: Record<string, unknown>) => {
            writes.push({ table, op: "insert", payload });
            return makeQuery(table, "insert", payload);
          }),
        };
      }

      if (table === "job_events") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            writes.push({ table, op: "insert", payload });
            return makeQuery(table, "insert", payload);
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { supabase, assignments, writes };
}

describe("internal staffing same-account hardening", () => {
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
  });

  it("denies cross-account internal assignJobAssigneeFromForm before assignment or staffing event writes", async () => {
    const { supabase, assignmentWrites, jobEventWrites } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { assignJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

    await expect(assignJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(assignmentWrites).toHaveLength(0);
    expect(jobEventWrites).toHaveLength(0);
  });

  it("denies cross-account internal setPrimaryJobAssigneeFromForm before assignment or staffing event writes", async () => {
    const { supabase, assignmentWrites, jobEventWrites } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { setPrimaryJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      setPrimaryJobAssigneeFromForm(buildAssignFormData()),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?notice=not_authorized");

    expect(assignmentWrites).toHaveLength(0);
    expect(jobEventWrites).toHaveLength(0);
  });

  it("denies cross-account internal removeJobAssigneeFromForm before assignment or staffing event writes", async () => {
    const { supabase, assignmentWrites, jobEventWrites } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { removeJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

    await expect(removeJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(assignmentWrites).toHaveLength(0);
    expect(jobEventWrites).toHaveLength(0);
  });

  it("denies cross-account internal updateJobTeamAssignmentsFromForm before assignment or staffing event writes", async () => {
    const { supabase, assignmentWrites, jobEventWrites } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { updateJobTeamAssignmentsFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      updateJobTeamAssignmentsFromForm(
        buildTeamAssignmentFormData({ selectedUserIds: ["internal-user-2", "internal-user-3"] }),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?notice=not_authorized");

    expect(assignmentWrites).toHaveLength(0);
    expect(jobEventWrites).toHaveLength(0);
  });

  it("allows same-account internal assignJobAssigneeFromForm and scopes assignable teammate validation", async () => {
    const { supabase, calls, notificationWrites } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { assignJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

    await expect(assignJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?tab=ops&banner=assignment_added",
    );

    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(calls.some((call) => call.table === "job_assignments" && call.op === "insert")).toBe(true);
    expect(calls.some((call) => call.table === "job_events" && call.op === "insert")).toBe(true);
    expect(notificationWrites).toHaveLength(1);
    expect(notificationWrites[0]).toEqual(
      expect.objectContaining({
        job_id: "job-1",
        account_owner_user_id: "owner-1",
        recipient_type: "internal",
        recipient_ref: "internal-user-2",
        channel: "in_app",
        notification_type: "internal_job_assigned",
      }),
    );
  });

  it("does not create duplicate assignment notifications when the assignee is already active", async () => {
    const { supabase, calls, notificationWrites } = makeAllowSupabaseFixture({
      existingActiveAssignment: true,
    });
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { assignJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

    await expect(assignJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?tab=ops&banner=assignment_added",
    );

    expect(calls.some((call) => call.table === "job_assignments" && call.op === "insert")).toBe(false);
    expect(notificationWrites).toHaveLength(0);
  });

  it("allows same-account internal setPrimaryJobAssigneeFromForm past scoped job preflight", async () => {
    const { supabase, calls, notificationWrites } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { setPrimaryJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

    await expect(setPrimaryJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?tab=ops&banner=assignment_primary_set",
    );

    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(
      calls.filter((call) => call.table === "job_assignments" && call.op === "update").length,
    ).toBeGreaterThan(0);
    expect(calls.some((call) => call.table === "job_events" && call.op === "insert")).toBe(true);
    expect(notificationWrites).toHaveLength(0);
  });

  it("multi-select adds multiple users in one submit and sets a primary", async () => {
    const fixture = makeTeamAssignmentFixture({
      assignments: [],
      assignableUserIds: ["internal-user-2", "internal-user-3"],
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { updateJobTeamAssignmentsFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      updateJobTeamAssignmentsFromForm(
        buildTeamAssignmentFormData({
          selectedUserIds: ["internal-user-2", "internal-user-3"],
          primaryUserId: "internal-user-3",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?tab=ops&banner=assignment_team_updated");

    expect(fixture.assignments.filter((row) => row.is_active)).toHaveLength(2);
    expect(fixture.assignments.find((row) => row.user_id === "internal-user-3")?.is_primary).toBe(true);
    expect(fixture.assignments.find((row) => row.user_id === "internal-user-2")?.is_primary).toBe(false);
    expect(
      fixture.writes.filter((call) => call.table === "job_assignments" && call.op === "insert"),
    ).toHaveLength(2);
    expect(
      fixture.writes.filter((call) => call.table === "job_events" && call.op === "insert").length,
    ).toBeGreaterThanOrEqual(2);
    expect(fixture.notifications).toHaveLength(2);
    const firstNotificationIndex = fixture.operations.findIndex((op) => op === "notifications:insert");
    const lastAssignmentWriteIndex = fixture.operations.reduce(
      (last, op, index) => (op.startsWith("job_assignments:") ? index : last),
      -1,
    );
    expect(firstNotificationIndex).toBeGreaterThan(lastAssignmentWriteIndex);
  });

  it("bulk assign one valid same-account user succeeds without throwing globally", async () => {
    const fixture = makeTeamAssignmentFixture({
      assignments: [],
      assignableUserIds: ["internal-user-2"],
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { updateJobTeamAssignmentsFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      updateJobTeamAssignmentsFromForm(
        buildTeamAssignmentFormData({
          selectedUserIds: ["internal-user-2"],
          primaryUserId: "internal-user-2",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?tab=ops&banner=assignment_team_updated");

    expect(fixture.assignments.find((row) => row.user_id === "internal-user-2")?.is_active).toBe(true);
    expect(fixture.assignments.find((row) => row.user_id === "internal-user-2")?.is_primary).toBe(true);
    expect(fixture.notifications).toHaveLength(1);
  });

  it("does not create duplicate active rows when existing assignees remain selected", async () => {
    const fixture = makeTeamAssignmentFixture({
      assignments: [
        {
          id: "assignment-existing",
          job_id: "job-1",
          user_id: "internal-user-2",
          is_active: true,
          is_primary: true,
        },
      ],
      assignableUserIds: ["internal-user-2"],
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { updateJobTeamAssignmentsFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      updateJobTeamAssignmentsFromForm(
        buildTeamAssignmentFormData({ selectedUserIds: ["internal-user-2"] }),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?tab=ops&banner=assignment_team_unchanged");

    expect(fixture.assignments.filter((row) => row.user_id === "internal-user-2" && row.is_active)).toHaveLength(1);
    expect(fixture.writes.some((call) => call.table === "job_assignments" && call.op === "insert")).toBe(false);
    expect(fixture.notifications).toHaveLength(0);
  });

  it("does not duplicate the actor assignment when the current user is already assigned and selected", async () => {
    const fixture = makeTeamAssignmentFixture({
      assignments: [
        {
          id: "assignment-actor",
          job_id: "job-1",
          user_id: "internal-user-1",
          is_active: true,
          is_primary: true,
        },
      ],
      assignableUserIds: ["internal-user-1", "internal-user-2"],
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { updateJobTeamAssignmentsFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      updateJobTeamAssignmentsFromForm(
        buildTeamAssignmentFormData({
          selectedUserIds: ["internal-user-1", "internal-user-2"],
          primaryUserId: "internal-user-1",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?tab=ops&banner=assignment_team_updated");

    expect(fixture.assignments.filter((row) => row.user_id === "internal-user-1" && row.is_active)).toHaveLength(1);
    expect(
      fixture.writes.filter(
        (call) =>
          call.table === "job_assignments" &&
          call.op === "insert" &&
          call.payload?.user_id === "internal-user-1",
      ),
    ).toHaveLength(0);
  });

  it("returns a safe banner when a bulk assignment insert hits an RLS-style failure", async () => {
    const fixture = makeTeamAssignmentFixture({
      assignments: [],
      assignableUserIds: ["internal-user-2", "internal-user-3"],
      failInsertUserIds: ["internal-user-3"],
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { updateJobTeamAssignmentsFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      updateJobTeamAssignmentsFromForm(
        buildTeamAssignmentFormData({
          selectedUserIds: ["internal-user-2", "internal-user-3"],
          primaryUserId: "internal-user-2",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?tab=ops&banner=assignment_team_update_failed");

    expect(fixture.assignments.find((row) => row.user_id === "internal-user-2")?.is_active).toBe(true);
    expect(fixture.assignments.find((row) => row.user_id === "internal-user-3")).toBeUndefined();
    expect(fixture.notifications).toHaveLength(0);
    expect(fixture.operations).not.toContain("notifications:insert");
  });

  it("returns a safe banner when primary promotion hits an RLS-style update failure without notifying", async () => {
    const fixture = makeTeamAssignmentFixture({
      assignments: [],
      assignableUserIds: ["internal-user-2"],
      failUpdatePayload: { is_primary: true },
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { updateJobTeamAssignmentsFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      updateJobTeamAssignmentsFromForm(
        buildTeamAssignmentFormData({
          selectedUserIds: ["internal-user-2"],
          primaryUserId: "internal-user-2",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?tab=ops&banner=assignment_team_update_failed");

    expect(fixture.assignments.find((row) => row.user_id === "internal-user-2")?.is_active).toBe(true);
    expect(fixture.notifications).toHaveLength(0);
    expect(fixture.operations).not.toContain("notifications:insert");
  });

  it("removing an assignee through Change Team deactivates only that assignment", async () => {
    const fixture = makeTeamAssignmentFixture({
      assignments: [
        {
          id: "assignment-keep",
          job_id: "job-1",
          user_id: "internal-user-2",
          is_active: true,
          is_primary: true,
        },
        {
          id: "assignment-remove",
          job_id: "job-1",
          user_id: "internal-user-3",
          is_active: true,
          is_primary: false,
        },
      ],
      assignableUserIds: ["internal-user-2"],
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { updateJobTeamAssignmentsFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      updateJobTeamAssignmentsFromForm(
        buildTeamAssignmentFormData({ selectedUserIds: ["internal-user-2"] }),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?tab=ops&banner=assignment_team_updated");

    expect(fixture.assignments.find((row) => row.user_id === "internal-user-2")?.is_active).toBe(true);
    expect(fixture.assignments.find((row) => row.user_id === "internal-user-3")?.is_active).toBe(false);
  });

  it("preserves the existing primary when that assignee remains selected", async () => {
    const fixture = makeTeamAssignmentFixture({
      assignments: [
        {
          id: "assignment-primary",
          job_id: "job-1",
          user_id: "internal-user-2",
          is_active: true,
          is_primary: true,
        },
        {
          id: "assignment-other",
          job_id: "job-1",
          user_id: "internal-user-3",
          is_active: true,
          is_primary: false,
        },
      ],
      assignableUserIds: ["internal-user-2", "internal-user-3"],
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { updateJobTeamAssignmentsFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      updateJobTeamAssignmentsFromForm(
        buildTeamAssignmentFormData({
          selectedUserIds: ["internal-user-2", "internal-user-3"],
          primaryUserId: "internal-user-3",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?tab=ops&banner=assignment_team_unchanged");

    expect(fixture.assignments.find((row) => row.user_id === "internal-user-2")?.is_primary).toBe(true);
    expect(fixture.assignments.find((row) => row.user_id === "internal-user-3")?.is_primary).toBe(false);
  });

  it("removing the primary assigns a new selected valid primary", async () => {
    const fixture = makeTeamAssignmentFixture({
      assignments: [
        {
          id: "assignment-primary",
          job_id: "job-1",
          user_id: "internal-user-2",
          is_active: true,
          is_primary: true,
        },
        {
          id: "assignment-next",
          job_id: "job-1",
          user_id: "internal-user-3",
          is_active: true,
          is_primary: false,
        },
      ],
      assignableUserIds: ["internal-user-3"],
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { updateJobTeamAssignmentsFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      updateJobTeamAssignmentsFromForm(
        buildTeamAssignmentFormData({
          selectedUserIds: ["internal-user-3"],
          primaryUserId: "internal-user-3",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?tab=ops&banner=assignment_team_updated");

    expect(fixture.assignments.find((row) => row.user_id === "internal-user-2")?.is_active).toBe(false);
    expect(fixture.assignments.find((row) => row.user_id === "internal-user-3")?.is_primary).toBe(true);
  });

  it("rejects inactive or ineligible team selections before assignment writes", async () => {
    const fixture = makeTeamAssignmentFixture({
      assignments: [
        {
          id: "assignment-existing",
          job_id: "job-1",
          user_id: "internal-user-2",
          is_active: true,
          is_primary: true,
        },
      ],
      assignableUserIds: ["internal-user-2"],
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { updateJobTeamAssignmentsFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      updateJobTeamAssignmentsFromForm(
        buildTeamAssignmentFormData({
          selectedUserIds: ["internal-user-2", "inactive-user"],
          primaryUserId: "inactive-user",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?tab=ops&banner=assignment_team_target_invalid");

    expect(fixture.assignments.find((row) => row.user_id === "internal-user-2")?.is_primary).toBe(true);
    expect(fixture.writes.filter((call) => call.table === "job_assignments")).toHaveLength(0);
  });

  it("makes an existing assigned user primary and clears the previous primary", async () => {
    const fixture = makePrimaryMutationFixture();
    createClientMock.mockResolvedValue(fixture.supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { setPrimaryJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

    await expect(setPrimaryJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?tab=ops&banner=assignment_primary_set",
    );

    expect(fixture.assignments.find((row) => row.id === "assignment-primary")?.is_primary).toBe(false);
    expect(fixture.assignments.find((row) => row.id === "assignment-target")?.is_primary).toBe(true);
    expect(fixture.writes.some((call) => call.table === "job_assignments" && call.op === "insert")).toBe(false);
    expect(fixture.writes.some((call) => call.table === "job_events" && call.op === "insert")).toBe(true);
  });

  it("returns a safe failure when an unassigned user is made primary and does not write", async () => {
    const fixture = makePrimaryMutationFixture({
      assignments: [
        {
          id: "assignment-primary",
          job_id: "job-1",
          user_id: "internal-user-1",
          is_active: true,
          is_primary: true,
        },
      ],
      assignableUserIds: ["internal-user-1", "internal-user-2"],
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { setPrimaryJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

    await expect(setPrimaryJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?tab=ops&banner=assignment_primary_target_invalid",
    );

    expect(fixture.assignments[0].is_primary).toBe(true);
    expect(fixture.writes).toEqual([]);
  });

  it("denies cross-account target users without assignment or event writes", async () => {
    const fixture = makePrimaryMutationFixture({
      assignments: [
        {
          id: "assignment-cross-account",
          job_id: "job-1",
          user_id: "internal-user-2",
          is_active: true,
          is_primary: false,
        },
      ],
      assignableUserIds: ["internal-user-1"],
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { setPrimaryJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

    await expect(setPrimaryJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?tab=ops&banner=assignment_primary_target_invalid",
    );

    expect(fixture.assignments[0].is_primary).toBe(false);
    expect(fixture.writes).toEqual([]);
  });

  it("allows same-account internal removeJobAssigneeFromForm past scoped job preflight", async () => {
    const { supabase, calls, notificationWrites } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { removeJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

    await expect(removeJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?tab=ops&banner=assignment_removed",
    );

    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(
      calls.filter((call) => call.table === "job_assignments" && call.op === "update").length,
    ).toBeGreaterThan(0);
    expect(calls.some((call) => call.table === "job_events" && call.op === "insert")).toBe(true);
    expect(notificationWrites).toHaveLength(0);
  });
});
