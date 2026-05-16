import { beforeEach, describe, expect, it, vi } from "vitest";

const requireInternalUserMock = vi.fn();

vi.mock("@/lib/auth/internal-user", () => {
  class InternalAccessError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = "InternalAccessError";
      this.code = code;
    }
  }

  return {
    InternalAccessError,
    isInternalAccessError: (error: unknown) =>
      error instanceof InternalAccessError ||
      (error instanceof Error && error.name === "InternalAccessError"),
    requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    throw new Error("test must pass an explicit supabase client");
  }),
}));

type PushSubscriptionFixtureRow = {
  id: string;
  account_owner_user_id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  device_label: string | null;
  permission_state: string;
  is_active: boolean;
  last_seen_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_failure_code: string | null;
  created_at: string;
  updated_at: string;
};

function makeRow(overrides: Partial<PushSubscriptionFixtureRow>): PushSubscriptionFixtureRow {
  return {
    id: "sub-1",
    account_owner_user_id: "owner-1",
    user_id: "user-1",
    endpoint: "https://push.example/device-1",
    p256dh: "p256dh-1",
    auth: "auth-1",
    user_agent: null,
    device_label: null,
    permission_state: "granted",
    is_active: true,
    last_seen_at: null,
    last_success_at: null,
    last_failure_at: null,
    last_failure_code: null,
    created_at: "2026-05-15T10:00:00.000Z",
    updated_at: "2026-05-15T10:00:00.000Z",
    ...overrides,
  };
}

function makeInternalContext(userId = "user-1", accountOwnerUserId = "owner-1") {
  return {
    userId,
    internalUser: {
      user_id: userId,
      role: "tech",
      is_active: true,
      account_owner_user_id: accountOwnerUserId,
      created_by: null,
    },
  };
}

class MemorySupabase {
  rows: PushSubscriptionFixtureRow[];
  calls: Array<{ table: string; op: string }> = [];
  nextId = 1;

  constructor(rows: PushSubscriptionFixtureRow[] = []) {
    this.rows = rows;
  }

  from(table: string) {
    return new QueryBuilder(this, table);
  }
}

class QueryBuilder {
  private filters: Array<{ column: string; value: unknown }> = [];
  private limitCount: number | null = null;
  private selectColumns = "*";
  private operation: "select" | "insert" | "update" = "select";
  private insertPayload: Record<string, unknown> | null = null;
  private updatePayload: Record<string, unknown> | null = null;
  private singleResult = false;

  constructor(
    private readonly client: MemorySupabase,
    private readonly table: string,
  ) {}

  select(columns = "*") {
    this.selectColumns = columns;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  order(_column: string, _opts?: Record<string, unknown>) {
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  insert(payload: Record<string, unknown>) {
    this.operation = "insert";
    this.insertPayload = payload;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.operation = "update";
    this.updatePayload = payload;
    return this;
  }

  single() {
    this.singleResult = true;
    return this.execute();
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private matches(row: PushSubscriptionFixtureRow) {
    return this.filters.every((filter) => (row as any)[filter.column] === filter.value);
  }

  private project(row: PushSubscriptionFixtureRow) {
    if (this.selectColumns === "*" || !this.selectColumns.trim()) return { ...row };
    const out: Record<string, unknown> = {};
    for (const rawColumn of this.selectColumns.split(",")) {
      const column = rawColumn.trim();
      if (!column) continue;
      out[column] = (row as any)[column];
    }
    return out;
  }

  private async execute() {
    if (this.table !== "push_subscriptions") {
      return { data: null, error: new Error(`unexpected table ${this.table}`) };
    }

    if (this.operation === "insert") {
      this.client.calls.push({ table: this.table, op: "insert" });
      const now = "2026-05-15T12:00:00.000Z";
      const row = makeRow({
        id: `sub-${++this.client.nextId}`,
        created_at: now,
        updated_at: now,
        ...(this.insertPayload ?? {}),
      });
      this.client.rows.push(row);
      const projected = this.project(row);
      return { data: this.singleResult ? projected : [projected], error: null };
    }

    if (this.operation === "update") {
      this.client.calls.push({ table: this.table, op: "update" });
      const matched = this.client.rows.filter((row) => this.matches(row));
      for (const row of matched) {
        Object.assign(row, this.updatePayload ?? {}, {
          updated_at: "2026-05-15T12:30:00.000Z",
        });
      }
      const projected = matched.map((row) => this.project(row));
      return { data: this.singleResult ? projected[0] ?? null : projected, error: null };
    }

    this.client.calls.push({ table: this.table, op: "select" });
    let rows = this.client.rows.filter((row) => this.matches(row));
    if (this.limitCount != null) rows = rows.slice(0, this.limitCount);
    const projected = rows.map((row) => this.project(row));
    return { data: this.singleResult ? projected[0] ?? null : projected, error: null };
  }
}

describe("push subscription helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    requireInternalUserMock.mockResolvedValue(makeInternalContext());
  });

  it("allows an active internal user to register their own subscription", async () => {
    const supabase = new MemorySupabase();
    const { registerCurrentInternalUserPushSubscription } = await import("@/lib/notifications/push-subscriptions");

    const result = await registerCurrentInternalUserPushSubscription(
      {
        endpoint: "https://push.example/device-1",
        p256dh: "secret-p256dh",
        auth: "secret-auth",
        userAgent: "Chrome",
        deviceLabel: "Field phone",
      },
      { supabase },
    );

    expect(result.status).toBe("registered");
    expect(result.subscription?.account_owner_user_id).toBe("owner-1");
    expect(result.subscription?.user_id).toBe("user-1");
    expect(supabase.rows).toHaveLength(1);
    expect(supabase.rows[0]).toEqual(
      expect.objectContaining({
        account_owner_user_id: "owner-1",
        user_id: "user-1",
        endpoint: "https://push.example/device-1",
        p256dh: "secret-p256dh",
        auth: "secret-auth",
        is_active: true,
      }),
    );
  });

  it("updates an existing active row for repeated same endpoint registration", async () => {
    const supabase = new MemorySupabase([
      makeRow({
        id: "existing-sub",
        endpoint: "https://push.example/device-1",
        p256dh: "old-key",
        auth: "old-auth",
      }),
    ]);
    const { registerCurrentInternalUserPushSubscription } = await import("@/lib/notifications/push-subscriptions");

    const result = await registerCurrentInternalUserPushSubscription(
      {
        endpoint: "https://push.example/device-1",
        p256dh: "new-key",
        auth: "new-auth",
      },
      { supabase },
    );

    expect(result.status).toBe("updated");
    expect(supabase.rows).toHaveLength(1);
    expect(supabase.rows[0]).toEqual(
      expect.objectContaining({
        id: "existing-sub",
        p256dh: "new-key",
        auth: "new-auth",
        is_active: true,
      }),
    );
  });

  it("lists only the current user's active subscriptions", async () => {
    const supabase = new MemorySupabase([
      makeRow({ id: "own-active", user_id: "user-1", account_owner_user_id: "owner-1", is_active: true }),
      makeRow({ id: "own-inactive", user_id: "user-1", account_owner_user_id: "owner-1", is_active: false }),
      makeRow({ id: "other-user", user_id: "user-2", account_owner_user_id: "owner-1", is_active: true }),
      makeRow({ id: "other-account", user_id: "user-1", account_owner_user_id: "owner-2", is_active: true }),
    ]);
    const { listCurrentInternalUserPushSubscriptions } = await import("@/lib/notifications/push-subscriptions");

    const rows = await listCurrentInternalUserPushSubscriptions({ supabase });

    expect(rows.map((row) => row.id)).toEqual(["own-active"]);
  });

  it("does not let a user deactivate another user's subscription", async () => {
    const supabase = new MemorySupabase([
      makeRow({ id: "other-user", user_id: "user-2", account_owner_user_id: "owner-1", endpoint: "https://push.example/other" }),
    ]);
    const { deactivateCurrentInternalUserPushSubscription } = await import("@/lib/notifications/push-subscriptions");

    const result = await deactivateCurrentInternalUserPushSubscription(
      { endpoint: "https://push.example/other" },
      { supabase },
    );

    expect(result).toEqual({ deactivated: false, count: 0 });
    expect(supabase.rows[0]?.is_active).toBe(true);
  });

  it("blocks out-of-account subscription access with safe-empty results", async () => {
    requireInternalUserMock.mockResolvedValue(makeInternalContext("user-1", "owner-1"));
    const supabase = new MemorySupabase([
      makeRow({ id: "out-of-account", user_id: "user-1", account_owner_user_id: "owner-2" }),
    ]);
    const { listCurrentInternalUserPushSubscriptions } = await import("@/lib/notifications/push-subscriptions");

    await expect(listCurrentInternalUserPushSubscriptions({ supabase })).resolves.toEqual([]);
  });

  it("deactivates only the current user's matching active subscription", async () => {
    const supabase = new MemorySupabase([
      makeRow({ id: "own-target", user_id: "user-1", account_owner_user_id: "owner-1", endpoint: "https://push.example/own" }),
      makeRow({ id: "other-target", user_id: "user-2", account_owner_user_id: "owner-1", endpoint: "https://push.example/own" }),
    ]);
    const { deactivateCurrentInternalUserPushSubscription } = await import("@/lib/notifications/push-subscriptions");

    const result = await deactivateCurrentInternalUserPushSubscription(
      { endpoint: "https://push.example/own" },
      { supabase },
    );

    expect(result).toEqual({ deactivated: true, count: 1 });
    expect(supabase.rows.find((row) => row.id === "own-target")?.is_active).toBe(false);
    expect(supabase.rows.find((row) => row.id === "other-target")?.is_active).toBe(true);
  });

  it("returns safe-empty/safe failure when auth or internal context is missing", async () => {
    const { InternalAccessError } = await import("@/lib/auth/internal-user");
    requireInternalUserMock.mockRejectedValue(new InternalAccessError("AUTH_REQUIRED", "Authentication required."));
    const supabase = new MemorySupabase();
    const {
      listCurrentInternalUserPushSubscriptions,
      registerCurrentInternalUserPushSubscription,
      deactivateCurrentInternalUserPushSubscription,
    } = await import("@/lib/notifications/push-subscriptions");

    await expect(listCurrentInternalUserPushSubscriptions({ supabase })).resolves.toEqual([]);
    await expect(
      registerCurrentInternalUserPushSubscription(
        { endpoint: "https://push.example/device", p256dh: "k", auth: "a" },
        { supabase },
      ),
    ).resolves.toEqual({ status: "not_internal", subscription: null });
    await expect(
      deactivateCurrentInternalUserPushSubscription({ endpoint: "https://push.example/device" }, { supabase }),
    ).resolves.toEqual({ deactivated: false, count: 0 });
    expect(supabase.calls).toHaveLength(0);
  });

  it("does not imply push sending is enabled", async () => {
    const supabase = new MemorySupabase();
    const { registerCurrentInternalUserPushSubscription } = await import("@/lib/notifications/push-subscriptions");

    await registerCurrentInternalUserPushSubscription(
      { endpoint: "https://push.example/device", p256dh: "k", auth: "a" },
      { supabase },
    );

    expect(supabase.calls.map((call) => call.table)).toEqual([
      "push_subscriptions",
      "push_subscriptions",
    ]);
    expect(supabase.calls.some((call) => call.table === "notifications")).toBe(false);
  });
});
