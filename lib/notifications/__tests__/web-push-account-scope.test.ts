import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Account-scoped web push: arrivals that belong to the whole office rather than
 * one assignee (permit requests) fan out to every active admin/office user's
 * enrolled devices, without a job_id.
 */

const webPushSendNotificationMock = vi.fn();
const webPushSetVapidDetailsMock = vi.fn();
const createAdminClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

vi.mock("web-push", async () => ({
  sendNotification: (...args: unknown[]) => webPushSendNotificationMock(...args),
  setVapidDetails: (...args: unknown[]) => webPushSetVapidDetailsMock(...args),
}));

type MockOptions = {
  notificationType?: string;
  jobId?: string | null;
  recipientRef?: string | null;
  internalUsers?: Array<{ user_id: string }>;
  subscriptions?: Array<{ id: string; user_id: string; endpoint: string }>;
};

function makeAdmin(options?: MockOptions) {
  const captured = {
    attempts: [] as Array<Record<string, unknown>>,
    subscriptionUpdates: [] as Array<{ patch: Record<string, unknown>; id: unknown }>,
    internalUserFilters: [] as Array<[string, unknown]>,
  };

  const subscriptions = options?.subscriptions ?? [
    { id: "sub-a", user_id: "admin-1", endpoint: "https://push.example/a" },
    { id: "sub-b", user_id: "admin-2", endpoint: "https://push.example/b" },
  ];

  const notificationRow = {
    id: "notif-permit-1",
    job_id: options?.jobId ?? null,
    recipient_ref: options?.recipientRef ?? null,
    recipient_type: "internal",
    account_owner_user_id: "owner-1",
    notification_type: options?.notificationType ?? "permit_request_received",
  };

  const admin: any = {
    from(table: string) {
      if (table === "notifications") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: notificationRow, error: null }),
            }),
          }),
        };
      }

      if (table === "internal_users") {
        const chain: any = {
          select: () => chain,
          eq: (column: string, value: unknown) => {
            captured.internalUserFilters.push([column, value]);
            return chain;
          },
          in: async (column: string, value: unknown) => {
            captured.internalUserFilters.push([column, value]);
            return {
              data: options?.internalUsers ?? [{ user_id: "admin-1" }, { user_id: "admin-2" }],
              error: null,
            };
          },
        };
        return chain;
      }

      if (table === "push_subscriptions") {
        return {
          select: () => ({
            eq: (_c1: string, _v1: unknown) => ({
              eq: (_c2: string, userId: string) => ({
                eq: async () => ({
                  data: subscriptions.filter((sub) => sub.user_id === userId),
                  error: null,
                }),
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: async (_column: string, id: unknown) => {
              captured.subscriptionUpdates.push({ patch, id });
              return { data: null, error: null };
            },
          }),
        };
      }

      if (table === "notification_delivery_attempts") {
        return {
          insert: async (row: Record<string, unknown>) => {
            captured.attempts.push(row);
            return { data: null, error: null };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { admin, captured };
}

function enablePush() {
  process.env.ENABLE_WEB_PUSH = "true";
  process.env.WEB_PUSH_PRIVATE_KEY = "test-private-key";
  process.env.WEB_PUSH_SUBJECT = "mailto:ops@example.com";
  process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = "test-public-key";
}

describe("account-scoped web push", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.ENABLE_WEB_PUSH;
    delete process.env.WEB_PUSH_PRIVATE_KEY;
    delete process.env.WEB_PUSH_SUBJECT;
    delete process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
    webPushSendNotificationMock.mockResolvedValue({ statusCode: 201 });
    webPushSetVapidDetailsMock.mockImplementation(() => {});
  });

  it("fans a permit request out to every active admin/office device", async () => {
    enablePush();
    const { admin, captured } = makeAdmin();
    createAdminClientMock.mockReturnValue(admin);

    const { sendWebPushNotificationForInternalNotification } = await import(
      "@/lib/notifications/web-push-delivery"
    );

    await sendWebPushNotificationForInternalNotification({
      supabase: admin,
      notificationId: "notif-permit-1",
      accountOwnerUserId: "owner-1",
      recipientUserId: "",
      notificationType: "permit_request_received",
    });

    expect(webPushSendNotificationMock).toHaveBeenCalledTimes(2);
    expect(captured.attempts).toHaveLength(2);
    expect(captured.attempts.map((row) => row.recipient_user_id)).toEqual(["admin-1", "admin-2"]);
    expect(captured.internalUserFilters).toContainEqual(["is_active", true]);
    expect(captured.internalUserFilters).toContainEqual(["role", ["admin", "office"]]);
  });

  it("deep links to the permit queue and leaks no request detail", async () => {
    enablePush();
    const { admin } = makeAdmin({ subscriptions: [{ id: "sub-a", user_id: "admin-1", endpoint: "https://push.example/a" }] });
    createAdminClientMock.mockReturnValue(admin);

    const { sendWebPushNotificationForInternalNotification } = await import(
      "@/lib/notifications/web-push-delivery"
    );

    await sendWebPushNotificationForInternalNotification({
      supabase: admin,
      notificationId: "notif-permit-1",
      accountOwnerUserId: "owner-1",
      recipientUserId: "",
      notificationType: "permit_request_received",
    });

    const payload = JSON.parse(webPushSendNotificationMock.mock.calls[0][1] as string);
    expect(payload.title).toBe("New permit request");
    expect(payload.url).toBe("/ops?bucket=permits#ops-workspace");

    const serialized = JSON.stringify(payload).toLowerCase();
    for (const leak of ["jaswinder", "dela vina", "@", "contractor_note", "pr-"]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("does not require a job id for account-scoped types", async () => {
    enablePush();
    const { admin } = makeAdmin({ jobId: null });
    createAdminClientMock.mockReturnValue(admin);

    const { sendWebPushNotificationForInternalNotification } = await import(
      "@/lib/notifications/web-push-delivery"
    );

    await sendWebPushNotificationForInternalNotification({
      supabase: admin,
      notificationId: "notif-permit-1",
      accountOwnerUserId: "owner-1",
      recipientUserId: "",
      notificationType: "permit_request_received",
    });

    expect(webPushSendNotificationMock).toHaveBeenCalled();
  });

  it("still refuses to push a job-scoped type without a job", async () => {
    enablePush();
    const { admin } = makeAdmin({ notificationType: "internal_job_assigned", jobId: null, recipientRef: "admin-1" });
    createAdminClientMock.mockReturnValue(admin);

    const { sendWebPushNotificationForInternalNotification } = await import(
      "@/lib/notifications/web-push-delivery"
    );

    await sendWebPushNotificationForInternalNotification({
      supabase: admin,
      notificationId: "notif-permit-1",
      accountOwnerUserId: "owner-1",
      recipientUserId: "admin-1",
      notificationType: "internal_job_assigned",
    });

    expect(webPushSendNotificationMock).not.toHaveBeenCalled();
  });

  it("skips notification types not in the push registry", async () => {
    enablePush();
    const { admin } = makeAdmin({ notificationType: "contractor_intake_proposal_submitted" });
    createAdminClientMock.mockReturnValue(admin);

    const { sendWebPushNotificationForInternalNotification } = await import(
      "@/lib/notifications/web-push-delivery"
    );

    await sendWebPushNotificationForInternalNotification({
      supabase: admin,
      notificationId: "notif-permit-1",
      accountOwnerUserId: "owner-1",
      recipientUserId: "",
      notificationType: "contractor_intake_proposal_submitted",
    });

    expect(webPushSendNotificationMock).not.toHaveBeenCalled();
  });

  it("records per-device delivery health so operators can see reach", async () => {
    enablePush();
    const { admin, captured } = makeAdmin({
      subscriptions: [{ id: "sub-a", user_id: "admin-1", endpoint: "https://push.example/a" }],
      internalUsers: [{ user_id: "admin-1" }],
    });
    createAdminClientMock.mockReturnValue(admin);

    const { sendWebPushNotificationForInternalNotification } = await import(
      "@/lib/notifications/web-push-delivery"
    );

    await sendWebPushNotificationForInternalNotification({
      supabase: admin,
      notificationId: "notif-permit-1",
      accountOwnerUserId: "owner-1",
      recipientUserId: "",
      notificationType: "permit_request_received",
    });

    expect(captured.subscriptionUpdates).toHaveLength(1);
    expect(captured.subscriptionUpdates[0].id).toBe("sub-a");
    expect(captured.subscriptionUpdates[0].patch).toHaveProperty("last_success_at");
  });

  it("records a failure code when the provider rejects the send", async () => {
    enablePush();
    webPushSendNotificationMock.mockRejectedValue(
      Object.assign(new Error("boom"), { statusCode: 500 }),
    );
    const { admin, captured } = makeAdmin({
      subscriptions: [{ id: "sub-a", user_id: "admin-1", endpoint: "https://push.example/a" }],
      internalUsers: [{ user_id: "admin-1" }],
    });
    createAdminClientMock.mockReturnValue(admin);

    const { sendWebPushNotificationForInternalNotification } = await import(
      "@/lib/notifications/web-push-delivery"
    );

    await sendWebPushNotificationForInternalNotification({
      supabase: admin,
      notificationId: "notif-permit-1",
      accountOwnerUserId: "owner-1",
      recipientUserId: "",
      notificationType: "permit_request_received",
    });

    expect(captured.subscriptionUpdates[0].patch).toMatchObject({
      last_failure_code: "PROVIDER_SEND_FAILED",
    });
    expect(captured.attempts[0]).toMatchObject({ status: "failed" });
  });

  it("stays inert when the feature gate is off", async () => {
    const { admin } = makeAdmin();
    createAdminClientMock.mockReturnValue(admin);

    const { sendWebPushNotificationForInternalNotification } = await import(
      "@/lib/notifications/web-push-delivery"
    );

    await sendWebPushNotificationForInternalNotification({
      supabase: admin,
      notificationId: "notif-permit-1",
      accountOwnerUserId: "owner-1",
      recipientUserId: "",
      notificationType: "permit_request_received",
    });

    expect(webPushSendNotificationMock).not.toHaveBeenCalled();
  });
});
