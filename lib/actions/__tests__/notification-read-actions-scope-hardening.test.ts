import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

type NotificationRow = {
  id: string;
  account_owner_user_id: string;
  recipient_type: string;
  read_at: string | null;
  notification_type: string;
  created_at: string;
  payload: Record<string, unknown>;
  status: string;
  job_id: string | null;
  channel: string;
  subject: string | null;
  body: string | null;
};

function makeScopedSupabaseFixture(rows: NotificationRow[]) {
  const writeCalls: Array<{ table: string; method: "update"; scopedOwner: string | null }> = [];

  const state = {
    notifications: rows.map((row) => ({ ...row })),
  };

  function buildSelectQuery(table: string) {
    const filters: Array<{ kind: "eq" | "is" | "in"; column: string; value: unknown }> = [];
    let limitCount: number | null = null;

    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ kind: "eq", column, value });
        return query;
      }),
      is: vi.fn((column: string, value: unknown) => {
        filters.push({ kind: "is", column, value });
        return query;
      }),
      in: vi.fn((column: string, value: unknown) => {
        filters.push({ kind: "in", column, value });
        return query;
      }),
      order: vi.fn(() => query),
      limit: vi.fn(async (count: number) => {
        limitCount = count;
        return resolve();
      }),
      maybeSingle: vi.fn(async () => {
        const { data, error } = resolve();
        if (error) return { data: null, error };
        return { data: Array.isArray(data) ? data[0] ?? null : data, error: null };
      }),
      then: (onFulfilled: (value: { data: any; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(resolve()).then(onFulfilled, onRejected),
    };

    const resolve = () => {
      if (table !== "notifications") {
        throw new Error(`Unexpected table for select: ${table}`);
      }

      let nextRows = [...state.notifications];

      for (const filter of filters) {
        if (filter.kind === "eq") {
          nextRows = nextRows.filter((row: any) => row?.[filter.column] === filter.value);
        } else if (filter.kind === "is") {
          nextRows = nextRows.filter((row: any) => (row?.[filter.column] ?? null) === filter.value);
        } else if (filter.kind === "in") {
          const values = Array.isArray(filter.value) ? filter.value : [];
          nextRows = nextRows.filter((row: any) => values.includes(row?.[filter.column]));
        }
      }

      nextRows.sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));

      if (typeof limitCount === "number") {
        nextRows = nextRows.slice(0, limitCount);
      }

      return { data: nextRows, error: null };
    };

    return query;
  }

  function buildUpdateQuery(table: string) {
    const filters: Array<{ kind: "eq" | "is"; column: string; value: unknown }> = [];
    let patch: Record<string, unknown> = {};

    const query: any = {
      update: vi.fn((nextPatch: Record<string, unknown>) => {
        patch = nextPatch;
        return query;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ kind: "eq", column, value });
        return query;
      }),
      is: vi.fn(async (column: string, value: unknown) => {
        filters.push({ kind: "is", column, value });
        return resolve();
      }),
      then: (onFulfilled: (value: { data: null; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(resolve()).then(onFulfilled, onRejected),
    };

    const resolve = () => {
      if (table !== "notifications") {
        throw new Error(`Unexpected table for update: ${table}`);
      }

      let matched = 0;

      state.notifications = state.notifications.map((row) => {
        const include = filters.every((filter) => {
          if (filter.kind === "eq") return (row as any)?.[filter.column] === filter.value;
          return ((row as any)?.[filter.column] ?? null) === filter.value;
        });

        if (!include) return row;

        matched += 1;
        return {
          ...row,
          ...patch,
        } as NotificationRow;
      });

      const scopedOwnerFilter = filters.find((filter) => filter.kind === "eq" && filter.column === "account_owner_user_id");
      writeCalls.push({
        table,
        method: "update",
        scopedOwner: scopedOwnerFilter ? String(scopedOwnerFilter.value ?? "") : null,
      });

      return { data: null, error: null, matched };
    };

    return query;
  }

  const supabase = {
    from(table: string) {
      return {
        select: vi.fn(() => buildSelectQuery(table)),
        update: vi.fn((patch: Record<string, unknown>) => {
          const query = buildUpdateQuery(table);
          return query.update(patch);
        }),
      };
    },
  };

  return { supabase, state, writeCalls };
}

function buildSeedRows(): NotificationRow[] {
  return [
    {
      id: "notif-owner-1-unread",
      account_owner_user_id: "owner-1",
      recipient_type: "internal",
      read_at: null,
      notification_type: "contractor_note",
      created_at: "2026-04-24T10:00:00.000Z",
      payload: {},
      status: "queued",
      job_id: "job-1",
      channel: "in_app",
      subject: null,
      body: null,
    },
    {
      id: "notif-owner-1-read",
      account_owner_user_id: "owner-1",
      recipient_type: "internal",
      read_at: "2026-04-24T08:00:00.000Z",
      notification_type: "contractor_note",
      created_at: "2026-04-24T08:00:00.000Z",
      payload: {},
      status: "sent",
      job_id: "job-1",
      channel: "in_app",
      subject: null,
      body: null,
    },
    {
      id: "notif-owner-2-unread",
      account_owner_user_id: "owner-2",
      recipient_type: "internal",
      read_at: null,
      notification_type: "contractor_note",
      created_at: "2026-04-24T09:00:00.000Z",
      payload: {},
      status: "queued",
      job_id: "job-2",
      channel: "in_app",
      subject: null,
      body: null,
    },
  ];
}

describe("notification read-state same-account hardening", () => {
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
  });

  it("allows same-account internal listInternalNotifications and excludes cross-account rows", async () => {
    const fixture = makeScopedSupabaseFixture(buildSeedRows());
    createClientMock.mockResolvedValue(fixture.supabase);

    const { listInternalNotifications } = await import("@/lib/actions/notification-read-actions");

    const rows = await listInternalNotifications({ onlyUnread: true, limit: 20 });
    expect(rows.map((row) => row.id)).toEqual(["notif-owner-1-unread"]);
  });

  it("allows same-account internal getInternalUnreadNotificationCount in scoped owner only", async () => {
    const fixture = makeScopedSupabaseFixture(buildSeedRows());
    createClientMock.mockResolvedValue(fixture.supabase);

    const { getInternalUnreadNotificationCount } = await import("@/lib/actions/notification-read-actions");

    const count = await getInternalUnreadNotificationCount();
    expect(count).toBe(1);
  });

  it("allows same-account internal markNotificationAsRead for scoped notification", async () => {
    const fixture = makeScopedSupabaseFixture(buildSeedRows());
    createClientMock.mockResolvedValue(fixture.supabase);

    const { markNotificationAsRead } = await import("@/lib/actions/notification-read-actions");

    await markNotificationAsRead({ notificationId: "notif-owner-1-unread" });

    expect(
      fixture.state.notifications.find((row) => row.id === "notif-owner-1-unread")?.read_at
    ).not.toBeNull();
    expect(fixture.writeCalls).toHaveLength(1);
    expect(fixture.writeCalls[0]?.scopedOwner).toBe("owner-1");
  });

  it("denies cross-account internal markNotificationAsRead before notifications write", async () => {
    const fixture = makeScopedSupabaseFixture(buildSeedRows());
    createClientMock.mockResolvedValue(fixture.supabase);

    const { markNotificationAsRead } = await import("@/lib/actions/notification-read-actions");

    await expect(markNotificationAsRead({ notificationId: "notif-owner-2-unread" })).rejects.toThrow(
      "NOT_AUTHORIZED"
    );

    expect(fixture.writeCalls).toHaveLength(0);
    expect(
      fixture.state.notifications.find((row) => row.id === "notif-owner-2-unread")?.read_at
    ).toBeNull();
  });

  it("allows same-account internal markAllNotificationsAsRead without mutating cross-account notifications", async () => {
    const fixture = makeScopedSupabaseFixture(buildSeedRows());
    createClientMock.mockResolvedValue(fixture.supabase);

    const { markAllNotificationsAsRead } = await import("@/lib/actions/notification-read-actions");

    await markAllNotificationsAsRead();

    expect(
      fixture.state.notifications.find((row) => row.id === "notif-owner-1-unread")?.read_at
    ).not.toBeNull();
    expect(
      fixture.state.notifications.find((row) => row.id === "notif-owner-2-unread")?.read_at
    ).toBeNull();
    expect(fixture.writeCalls).toHaveLength(1);
    expect(fixture.writeCalls[0]?.scopedOwner).toBe("owner-1");
  });

  it("denies non-internal access before scoped list/count/read-state mutation flows", async () => {
    const fixture = makeScopedSupabaseFixture(buildSeedRows());
    createClientMock.mockResolvedValue(fixture.supabase);
    requireInternalUserMock.mockRejectedValue(new Error("Active internal user required."));

    const {
      listInternalNotifications,
      markNotificationAsRead,
      markAllNotificationsAsRead,
      getInternalUnreadNotificationCount,
    } = await import("@/lib/actions/notification-read-actions");

    await expect(listInternalNotifications()).rejects.toThrow("Active internal user required.");
    await expect(getInternalUnreadNotificationCount()).rejects.toThrow("Active internal user required.");
    await expect(markNotificationAsRead({ notificationId: "notif-owner-1-unread" })).rejects.toThrow(
      "Active internal user required."
    );
    await expect(markAllNotificationsAsRead()).rejects.toThrow("Active internal user required.");

    expect(fixture.writeCalls).toHaveLength(0);
  });
});
