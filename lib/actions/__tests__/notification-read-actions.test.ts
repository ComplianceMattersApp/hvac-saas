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
  job_id: string | null;
  recipient_type: string;
  channel: string;
  notification_type: string;
  subject: string | null;
  body: string | null;
  payload: Record<string, unknown>;
  status: string;
  read_at: string | null;
  created_at: string;
};

function makeSupabase(fixture: {
  notifications: NotificationRow[];
  submissions: Array<{ id: string; review_status: string }>;
  contractors?: Array<{ id: string; name: string }>;
}) {
  return {
    from(table: string) {
      const filters: Array<{ kind: "eq" | "is" | "in"; column: string; value: unknown }> = [];

      const resolve = () => {
        if (table === "notifications") {
          let rows = [...fixture.notifications];

          for (const filter of filters) {
            if (filter.kind === "eq") {
              rows = rows.filter((row: any) => row?.[filter.column] === filter.value);
            } else if (filter.kind === "is") {
              rows = rows.filter((row: any) => (row?.[filter.column] ?? null) === filter.value);
            } else if (filter.kind === "in") {
              const values = Array.isArray(filter.value) ? filter.value : [];
              rows = rows.filter((row: any) => values.includes(row?.[filter.column]));
            }
          }

          rows.sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
          return { data: rows, error: null };
        }

        if (table === "contractor_intake_submissions") {
          let rows = [...fixture.submissions];

          for (const filter of filters) {
            if (filter.kind === "in") {
              const values = Array.isArray(filter.value) ? filter.value : [];
              rows = rows.filter((row: any) => values.includes(row?.[filter.column]));
            }
          }

          return { data: rows, error: null };
        }

        if (table === "contractors") {
          let rows = [...(fixture.contractors ?? [])];

          for (const filter of filters) {
            if (filter.kind === "in") {
              const values = Array.isArray(filter.value) ? filter.value : [];
              rows = rows.filter((row: any) => values.includes(row?.[filter.column]));
            }
          }

          return { data: rows, error: null };
        }

        throw new Error(`Unexpected table: ${table}`);
      };

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
        limit: vi.fn(async () => resolve()),
        then: (onFulfilled: (value: { data: any; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) =>
          Promise.resolve(resolve()).then(onFulfilled, onRejected),
      };

      return query;
    },
  };
}

describe("internal notification readers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    requireInternalUserMock.mockResolvedValue({
      userId: "internal-1",
      internalUser: {
        user_id: "internal-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });
  });

  it("keeps proposal notifications visible to internal readers", async () => {
    createClientMock.mockResolvedValue(
      makeSupabase({
        notifications: [
          {
            id: "notif-proposal",
            account_owner_user_id: "owner-1",
            job_id: null,
            recipient_type: "internal",
            channel: "in_app",
            notification_type: "contractor_intake_proposal_submitted",
            subject: "New Contractor Intake Proposal",
            body: "A contractor submitted an intake proposal pending internal finalization.",
            payload: { contractor_intake_submission_id: "proposal-1" },
            status: "queued",
            read_at: null,
            created_at: "2026-04-20T12:00:00.000Z",
          },
          {
            id: "notif-email",
            account_owner_user_id: "owner-1",
            job_id: null,
            recipient_type: "internal",
            channel: "email",
            notification_type: "internal_contractor_intake_proposal_email",
            subject: "New Contractor Intake Proposal",
            body: "Internal ops/admin alert for contractor-submitted intake proposal.",
            payload: { contractor_intake_submission_id: "proposal-1" },
            status: "sent",
            read_at: null,
            created_at: "2026-04-20T11:59:00.000Z",
          },
        ],
        submissions: [{ id: "proposal-1", review_status: "pending" }],
      }),
    );

    const { listInternalNotifications, getInternalUnreadNotificationCount } = await import("@/lib/actions/notification-read-actions");

    const notifications = await listInternalNotifications({
      limit: 20,
      onlyUnread: true,
      filterKey: "new_job_notifications",
    });
    const unreadCount = await getInternalUnreadNotificationCount();

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.notification_type).toBe("contractor_intake_proposal_submitted");
    expect(notifications[0]?.is_unread).toBe(true);
    expect(unreadCount).toBe(1);
  });

  it("does not drop proposal notifications when proposal status rows are not visible", async () => {
    createClientMock.mockResolvedValue(
      makeSupabase({
        notifications: [
          {
            id: "notif-proposal-rls",
            account_owner_user_id: "owner-1",
            job_id: null,
            recipient_type: "internal",
            channel: "in_app",
            notification_type: "contractor_intake_proposal_submitted",
            subject: "New Contractor Intake Proposal",
            body: "A contractor submitted an intake proposal pending internal finalization.",
            payload: { contractor_intake_submission_id: "proposal-rls-hidden" },
            status: "queued",
            read_at: null,
            created_at: "2026-04-21T12:00:00.000Z",
          },
        ],
        // Simulates sessions where proposal rows are not readable via RLS.
        submissions: [],
      }),
    );

    const { listInternalNotifications, getInternalUnreadNotificationCount } = await import("@/lib/actions/notification-read-actions");

    const notifications = await listInternalNotifications({
      limit: 20,
      onlyUnread: true,
      filterKey: "new_job_notifications",
    });
    const unreadCount = await getInternalUnreadNotificationCount();

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.id).toBe("notif-proposal-rls");
    expect(notifications[0]?.notification_type).toBe("contractor_intake_proposal_submitted");
    expect(notifications[0]?.is_unread).toBe(true);
    expect(unreadCount).toBe(1);
  });
});