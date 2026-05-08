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

type SubmissionRow = {
  id: string;
  review_status: string;
  contractor_id?: string | null;
  proposed_customer_first_name?: string | null;
  proposed_customer_last_name?: string | null;
  proposed_address_line1?: string | null;
  proposed_city?: string | null;
  proposed_zip?: string | null;
  proposed_location_nickname?: string | null;
  proposed_job_type?: string | null;
  proposed_project_type?: string | null;
  proposed_job_notes?: string | null;
  proposed_permit_number?: string | null;
  proposed_jurisdiction?: string | null;
  proposed_permit_date?: string | null;
};

function makeSupabase(fixture: {
  notifications: NotificationRow[];
  submissions: SubmissionRow[];
  contractors?: Array<{ id: string; name: string }>;
  jobs?: Array<{ id: string; title: string | null; customer_first_name: string | null; customer_last_name: string | null; city: string | null; contractor_id: string | null }>;
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

        if (table === "jobs") {
          let rows = [...(fixture.jobs ?? [])];

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
            payload: {
              contractor_intake_submission_id: "proposal-1",
              contractor_id: "contractor-1",
            },
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
        submissions: [
          {
            id: "proposal-1",
            review_status: "pending",
            proposed_customer_first_name: "Maya",
            proposed_customer_last_name: "Lopez",
            proposed_address_line1: "100 Main St",
            proposed_city: "Pasadena",
            proposed_zip: "91101",
            proposed_location_nickname: "Front Unit",
            proposed_job_type: "ecc",
            proposed_project_type: "alteration",
            proposed_job_notes: "Needs airflow and leakage verification.",
            proposed_permit_number: "P-100",
          },
        ],
        contractors: [{ id: "contractor-1", name: "Rapid Comfort" }],
      }),
    );

    const {
      listInternalNotifications,
      getInternalUnreadNotificationCount,
      getInternalUnreadNotificationBadgeCount,
    } = await import("@/lib/actions/notification-read-actions");

    const notifications = await listInternalNotifications({
      limit: 20,
      onlyUnread: true,
      filterKey: "new_job_notifications",
    });
    const unreadCount = await getInternalUnreadNotificationCount();
    const unreadBadgeCount = await getInternalUnreadNotificationBadgeCount();

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.notification_type).toBe("contractor_intake_proposal_submitted");
    expect(notifications[0]?.is_unread).toBe(true);
    expect(notifications[0]?.proposal_enrichment?.contractor_name).toBe("Rapid Comfort");
    expect(notifications[0]?.proposal_enrichment?.customer_name).toBe("Maya Lopez");
    expect(notifications[0]?.proposal_enrichment?.address_summary).toContain("100 Main St");
    expect(notifications[0]?.proposal_enrichment?.job_type_label).toBe("ECC");
    expect(unreadCount).toBe(1);
    expect(unreadBadgeCount).toBe(1);
  });

  it("uses submission contractor_id for proposal enrichment when payload contractor_id is missing", async () => {
    createClientMock.mockResolvedValue(
      makeSupabase({
        notifications: [
          {
            id: "notif-proposal-fallback-contractor",
            account_owner_user_id: "owner-1",
            job_id: null,
            recipient_type: "internal",
            channel: "in_app",
            notification_type: "contractor_intake_proposal_submitted",
            subject: "New Contractor Intake Proposal",
            body: "A contractor submitted an intake proposal pending internal finalization.",
            payload: {
              contractor_intake_submission_id: "proposal-fallback-contractor",
            },
            status: "queued",
            read_at: null,
            created_at: "2026-04-20T13:00:00.000Z",
          },
        ],
        submissions: [
          {
            id: "proposal-fallback-contractor",
            review_status: "pending",
            contractor_id: "contractor-2",
            proposed_customer_first_name: "Rosa",
            proposed_customer_last_name: "Diaz",
          },
        ],
        contractors: [{ id: "contractor-2", name: "Summit Mechanical" }],
      }),
    );

    const { listInternalNotifications } = await import("@/lib/actions/notification-read-actions");
    const notifications = await listInternalNotifications({
      limit: 20,
      onlyUnread: true,
      filterKey: "new_job_notifications",
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.proposal_enrichment?.contractor_name).toBe("Summit Mechanical");
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

    const {
      listInternalNotifications,
      getInternalUnreadNotificationCount,
      getInternalUnreadNotificationBadgeCount,
    } = await import("@/lib/actions/notification-read-actions");

    const notifications = await listInternalNotifications({
      limit: 20,
      onlyUnread: true,
      filterKey: "new_job_notifications",
    });
    const unreadCount = await getInternalUnreadNotificationCount();
    const unreadBadgeCount = await getInternalUnreadNotificationBadgeCount();

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.id).toBe("notif-proposal-rls");
    expect(notifications[0]?.notification_type).toBe("contractor_intake_proposal_submitted");
    expect(notifications[0]?.is_unread).toBe(true);
    expect(unreadCount).toBe(1);
    expect(unreadBadgeCount).toBe(1);
  });

  it("excludes a proposal notification from the unread count once its read_at is set", async () => {
    // Simulates the state after finalizeContractorIntakeSubmissionFromForm has written read_at.
    createClientMock.mockResolvedValue(
      makeSupabase({
        notifications: [
          {
            id: "notif-finalized",
            account_owner_user_id: "owner-1",
            job_id: null,
            recipient_type: "internal",
            channel: "in_app",
            notification_type: "contractor_intake_proposal_submitted",
            subject: "Proposal Finalized",
            body: null,
            payload: { contractor_intake_submission_id: "proposal-finalized" },
            status: "queued",
            read_at: "2026-04-22T09:00:00.000Z",
            created_at: "2026-04-22T08:00:00.000Z",
          },
        ],
        submissions: [{ id: "proposal-finalized", review_status: "finalized" }],
      }),
    );

    const { getInternalUnreadNotificationCount } = await import("@/lib/actions/notification-read-actions");
    const unreadCount = await getInternalUnreadNotificationCount();

    expect(unreadCount).toBe(0);
  });

  it("attaches job_enrichment to contractor update notifications", async () => {
    createClientMock.mockResolvedValue(
      makeSupabase({
        notifications: [
          {
            id: "notif-contractor-note",
            account_owner_user_id: "owner-1",
            job_id: "job-abc",
            recipient_type: "internal",
            channel: "in_app",
            notification_type: "contractor_note",
            subject: "Contractor note",
            body: "Technician left a note on the job.",
            payload: {},
            status: "queued",
            read_at: null,
            created_at: "2026-04-22T10:00:00.000Z",
          },
        ],
        submissions: [],
        jobs: [
          {
            id: "job-abc",
            title: "HVAC System Inspection",
            customer_first_name: "Linda",
            customer_last_name: "Garza",
            city: "Pasadena",
            contractor_id: "contractor-x",
          },
        ],
        contractors: [{ id: "contractor-x", name: "Cool Air Services" }],
      }),
    );

    const { listInternalNotifications } = await import("@/lib/actions/notification-read-actions");
    const notifications = await listInternalNotifications({
      limit: 20,
      onlyUnread: true,
      filterKey: "contractor_updates",
    });

    expect(notifications).toHaveLength(1);
    const notif = notifications[0]!;
    expect(notif.notification_type).toBe("contractor_note");
    expect(notif.job_enrichment).not.toBeNull();
    expect(notif.job_enrichment?.job_title).toBe("HVAC System Inspection");
    expect(notif.job_enrichment?.customer_name).toBe("Linda Garza");
    expect(notif.job_enrichment?.city).toBe("Pasadena");
    expect(notif.job_enrichment?.contractor_name).toBe("Cool Air Services");
  });

  it("attaches job_enrichment when job_id is provided in JSON payload", async () => {
    createClientMock.mockResolvedValue(
      makeSupabase({
        notifications: [
          {
            id: "notif-contractor-note-json",
            account_owner_user_id: "owner-1",
            job_id: null,
            recipient_type: "internal",
            channel: "in_app",
            notification_type: "contractor_note",
            subject: "Contractor note",
            body: "Technician left a note on the job.",
            payload: JSON.stringify({ job_id: "job-json" }) as unknown as Record<string, unknown>,
            status: "queued",
            read_at: null,
            created_at: "2026-04-22T10:30:00.000Z",
          },
        ],
        submissions: [],
        jobs: [
          {
            id: "job-json",
            title: "Duct Sealing Follow-up",
            customer_first_name: "Andre",
            customer_last_name: "Miles",
            city: "Monrovia",
            contractor_id: "contractor-y",
          },
        ],
        contractors: [{ id: "contractor-y", name: "Citywide Heating" }],
      }),
    );

    const { listInternalNotifications } = await import("@/lib/actions/notification-read-actions");
    const notifications = await listInternalNotifications({
      limit: 20,
      onlyUnread: true,
      filterKey: "contractor_updates",
    });

    expect(notifications).toHaveLength(1);
    const notif = notifications[0]!;
    expect(notif.notification_type).toBe("contractor_note");
    expect(notif.job_enrichment?.job_title).toBe("Duct Sealing Follow-up");
    expect(notif.job_enrichment?.customer_name).toBe("Andre Miles");
    expect(notif.job_enrichment?.city).toBe("Monrovia");
    expect(notif.job_enrichment?.contractor_name).toBe("Citywide Heating");
  });

  it("excludes contractor_report_sent from feed and unread awareness counts", async () => {
    createClientMock.mockResolvedValue(
      makeSupabase({
        notifications: [
          {
            id: "notif-report-sent",
            account_owner_user_id: "owner-1",
            job_id: "job-1",
            recipient_type: "internal",
            channel: "in_app",
            notification_type: "contractor_report_sent",
            subject: "Contractor report sent",
            body: "A contractor report was sent.",
            payload: { event_type: "contractor_report_sent" },
            status: "queued",
            read_at: null,
            created_at: "2026-04-23T10:00:00.000Z",
          },
          {
            id: "notif-note",
            account_owner_user_id: "owner-1",
            job_id: "job-1",
            recipient_type: "internal",
            channel: "in_app",
            notification_type: "contractor_note",
            subject: "Contractor note",
            body: "A contractor note was added.",
            payload: {},
            status: "queued",
            read_at: null,
            created_at: "2026-04-23T09:00:00.000Z",
          },
        ],
        submissions: [],
      }),
    );

    const {
      listInternalNotifications,
      getInternalUnreadNotificationCount,
      getInternalUnreadNotificationBadgeCount,
    } = await import("@/lib/actions/notification-read-actions");

    const notifications = await listInternalNotifications({
      limit: 20,
      onlyUnread: true,
    });
    const unreadCount = await getInternalUnreadNotificationCount();
    const unreadBadgeCount = await getInternalUnreadNotificationBadgeCount();

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.notification_type).toBe("contractor_note");
    expect(unreadCount).toBe(1);
    expect(unreadBadgeCount).toBe(1);
  });
});