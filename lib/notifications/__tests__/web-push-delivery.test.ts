import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Web Push Delivery Tests
 *
 * Purpose:
 * - Verify feature-gating (ENABLE_WEB_PUSH env variable)
 * - Verify supported notification types (internal_job_assigned, internal_note_tag)
 * - Verify subscription filtering (active, account-scoped, user-scoped)
 * - Verify safe payload construction (no sensitive data leaks)
 * - Verify error handling and recovery
 * - Verify failed/expired subscriptions are marked inactive
 * - Verify delivery attempts are audited
 */

const webPushSendNotificationMock = vi.fn();
const webPushSetVapidDetailsMock = vi.fn();
const createAdminClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

vi.mock("web-push", async () => {
  return {
    sendNotification: (...args: unknown[]) => webPushSendNotificationMock(...args),
    setVapidDetails: (...args: unknown[]) => webPushSetVapidDetailsMock(...args),
  };
});

describe("web-push-delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    createAdminClientMock.mockReset();

    // Reset environment variables to known state
    delete process.env.ENABLE_WEB_PUSH;
    delete process.env.WEB_PUSH_PRIVATE_KEY;
    delete process.env.WEB_PUSH_SUBJECT;
    delete process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;

    webPushSendNotificationMock.mockResolvedValue({
      statusCode: 201,
    });

    webPushSetVapidDetailsMock.mockImplementation(() => {});
  });

  describe("1. ENABLE_WEB_PUSH false/unset -> no web-push import/send attempted", () => {
    it("skips all processing when ENABLE_WEB_PUSH is not true", async () => {
      const { sendWebPushNotificationForInternalNotification } = await import(
        "@/lib/notifications/web-push-delivery"
      );

      const mockSupabase = {
        from: vi.fn(),
      };

      await sendWebPushNotificationForInternalNotification({
        supabase: mockSupabase,
        notificationId: "notif-1",
        accountOwnerUserId: "owner-1",
        recipientUserId: "user-1",
        notificationType: "internal_job_assigned",
        jobId: "job-1",
      });

      // Supabase should not be called at all
      expect(mockSupabase.from).not.toHaveBeenCalled();
      // web-push should not be imported
      expect(webPushSetVapidDetailsMock).not.toHaveBeenCalled();
      expect(webPushSendNotificationMock).not.toHaveBeenCalled();
    });

    it("skips processing when ENABLE_WEB_PUSH is explicitly false", async () => {
      process.env.ENABLE_WEB_PUSH = "false";

      const { sendWebPushNotificationForInternalNotification } = await import(
        "@/lib/notifications/web-push-delivery"
      );

      const mockSupabase = {
        from: vi.fn(),
      };

      await sendWebPushNotificationForInternalNotification({
        supabase: mockSupabase,
        notificationId: "notif-1",
        accountOwnerUserId: "owner-1",
        recipientUserId: "user-1",
        notificationType: "internal_job_assigned",
        jobId: "job-1",
      });

      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(webPushSetVapidDetailsMock).not.toHaveBeenCalled();
    });
  });

  describe("2. supported notification type + active subscription -> send attempted", () => {
    it("uses the privileged delivery client instead of the acting user's RLS client", async () => {
      process.env.ENABLE_WEB_PUSH = "true";
      process.env.WEB_PUSH_PRIVATE_KEY = "test-private-key";
      process.env.WEB_PUSH_SUBJECT = "test-subject";
      process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = "test-public-key";

      const { sendWebPushNotificationForInternalNotification } = await import(
        "@/lib/notifications/web-push-delivery"
      );

      const adminSupabase = makeMemorySupabase([
        {
          id: "sub-1",
          endpoint: "https://push.example/device-1",
          p256dh: "p256dh-1",
          auth: "auth-1",
        },
      ]);
      const actingUserSupabase = {
        from: vi.fn(() => {
          throw new Error("acting user client should not be used for delivery");
        }),
      };

      await sendWebPushNotificationForInternalNotification({
        supabase: actingUserSupabase,
        notificationId: "notif-2",
        accountOwnerUserId: "owner-1",
        recipientUserId: "user-1",
        notificationType: "internal_note_tag",
        jobId: "job-2",
      });

      expect(actingUserSupabase.from).not.toHaveBeenCalled();
      expect(webPushSendNotificationMock).toHaveBeenCalledTimes(1);
      expect(adminSupabase.getInsertedRows("notification_delivery_attempts")).toHaveLength(1);
    });

    it("sends to active subscription for internal_job_assigned type", async () => {
      process.env.ENABLE_WEB_PUSH = "true";
      process.env.WEB_PUSH_PRIVATE_KEY = "test-private-key";
      process.env.WEB_PUSH_SUBJECT = "test-subject";
      process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = "test-public-key";

      const { sendWebPushNotificationForInternalNotification } = await import(
        "@/lib/notifications/web-push-delivery"
      );

      const mockSupabase = makeMemorySupabase([
        {
          id: "sub-1",
          endpoint: "https://push.example/device-1",
          p256dh: "p256dh-1",
          auth: "auth-1",
        },
        {
          id: "sub-other-account",
          account_owner_user_id: "owner-2",
          endpoint: "https://push.example/device-2",
          p256dh: "p256dh-2",
          auth: "auth-2",
        },
        {
          id: "sub-other-user",
          user_id: "user-2",
          endpoint: "https://push.example/device-3",
          p256dh: "p256dh-3",
          auth: "auth-3",
        },
      ]);

      await sendWebPushNotificationForInternalNotification({
        supabase: mockSupabase,
        notificationId: "notif-1",
        accountOwnerUserId: "owner-1",
        recipientUserId: "user-1",
        notificationType: "internal_job_assigned",
        jobId: "job-1",
      });

      // Verify send was attempted
      expect(webPushSendNotificationMock).toHaveBeenCalledTimes(1);
      expect(webPushSendNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: "https://push.example/device-1",
          keys: {
            p256dh: "p256dh-1",
            auth: "auth-1",
          },
        }),
        expect.stringContaining("You were assigned to a job"),
      );

      // Verify delivery attempt was recorded as 'sent'
      const deliveryAttempts = mockSupabase.getInsertedRows("notification_delivery_attempts");
      expect(deliveryAttempts).toHaveLength(1);
      expect(deliveryAttempts[0]).toMatchObject({
        notification_id: "notif-1",
        channel: "web_push",
        status: "sent",
        push_subscription_id: "sub-1",
      });
    });

    it("sends to active subscription for internal_note_tag type", async () => {
      process.env.ENABLE_WEB_PUSH = "true";
      process.env.WEB_PUSH_PRIVATE_KEY = "test-private-key";
      process.env.WEB_PUSH_SUBJECT = "test-subject";
      process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = "test-public-key";

      const { sendWebPushNotificationForInternalNotification } = await import(
        "@/lib/notifications/web-push-delivery"
      );

      const mockSupabase = makeMemorySupabase([
        {
          id: "sub-2",
          endpoint: "https://push.example/device-2",
          p256dh: "p256dh-2",
          auth: "auth-2",
        },
      ]);

      await sendWebPushNotificationForInternalNotification({
        supabase: mockSupabase,
        notificationId: "notif-2",
        accountOwnerUserId: "owner-1",
        recipientUserId: "user-1",
        notificationType: "internal_note_tag",
        jobId: "job-2",
      });

      // Verify send was attempted
      expect(webPushSendNotificationMock).toHaveBeenCalledTimes(1);
      expect(webPushSendNotificationMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("You were mentioned in an internal note"),
      );
    });

    it("sends to multiple active subscriptions", async () => {
      process.env.ENABLE_WEB_PUSH = "true";
      process.env.WEB_PUSH_PRIVATE_KEY = "test-private-key";
      process.env.WEB_PUSH_SUBJECT = "test-subject";
      process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = "test-public-key";

      const { sendWebPushNotificationForInternalNotification } = await import(
        "@/lib/notifications/web-push-delivery"
      );

      const mockSupabase = makeMemorySupabase([
        {
          id: "sub-1",
          endpoint: "https://push.example/device-1",
          p256dh: "p256dh-1",
          auth: "auth-1",
        },
        {
          id: "sub-2",
          endpoint: "https://push.example/device-2",
          p256dh: "p256dh-2",
          auth: "auth-2",
        },
      ]);

      await sendWebPushNotificationForInternalNotification({
        supabase: mockSupabase,
        notificationId: "notif-1",
        accountOwnerUserId: "owner-1",
        recipientUserId: "user-1",
        notificationType: "internal_job_assigned",
        jobId: "job-1",
      });

      // Verify send was attempted for both subscriptions
      expect(webPushSendNotificationMock).toHaveBeenCalledTimes(2);

      // Verify both delivery attempts were recorded
      const deliveryAttempts = mockSupabase.getInsertedRows("notification_delivery_attempts");
      expect(deliveryAttempts).toHaveLength(2);
    });
  });

  describe("3. unsupported notification type -> no send", () => {
    it("skips send for unsupported notification type", async () => {
      process.env.ENABLE_WEB_PUSH = "true";
      process.env.WEB_PUSH_PRIVATE_KEY = "test-private-key";
      process.env.WEB_PUSH_SUBJECT = "test-subject";
      process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = "test-public-key";

      const { sendWebPushNotificationForInternalNotification } = await import(
        "@/lib/notifications/web-push-delivery"
      );

      const mockSupabase = makeMemorySupabase([
        {
          id: "sub-1",
          endpoint: "https://push.example/device-1",
          p256dh: "p256dh-1",
          auth: "auth-1",
        },
      ]);

      await sendWebPushNotificationForInternalNotification({
        supabase: mockSupabase,
        notificationId: "notif-unsupported",
        accountOwnerUserId: "owner-1",
        recipientUserId: "user-1",
        notificationType: "contractor_intake_proposal_submitted",
        jobId: "job-1",
      });

      // No send should be attempted
      expect(webPushSendNotificationMock).not.toHaveBeenCalled();

      // No delivery attempt should be recorded (unsupported type skips silently)
      const deliveryAttempts = mockSupabase.getInsertedRows("notification_delivery_attempts");
      expect(deliveryAttempts).toHaveLength(0);
    });
  });

  describe("4. no active subscriptions -> safe skip/no throw", () => {
    it("safely skips when no subscriptions exist", async () => {
      process.env.ENABLE_WEB_PUSH = "true";
      process.env.WEB_PUSH_PRIVATE_KEY = "test-private-key";
      process.env.WEB_PUSH_SUBJECT = "test-subject";
      process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = "test-public-key";

      const { sendWebPushNotificationForInternalNotification } = await import(
        "@/lib/notifications/web-push-delivery"
      );

      const mockSupabase = makeMemorySupabase([]);

      await expect(
        sendWebPushNotificationForInternalNotification({
          supabase: mockSupabase,
          notificationId: "notif-1",
          accountOwnerUserId: "owner-1",
          recipientUserId: "user-1",
          notificationType: "internal_job_assigned",
          jobId: "job-1",
        }),
      ).resolves.toBeUndefined(); // Should not throw

      // No send should be attempted
      expect(webPushSendNotificationMock).not.toHaveBeenCalled();

      // Delivery attempt should be recorded as 'skipped'
      const deliveryAttempts = mockSupabase.getInsertedRows("notification_delivery_attempts");
      expect(deliveryAttempts).toHaveLength(1);
      expect(deliveryAttempts[0]).toMatchObject({
        status: "skipped",
        error_code: "NO_ACTIVE_SUBSCRIPTIONS",
        push_subscription_id: null,
      });
    });

    it("safely skips when subscription query fails", async () => {
      process.env.ENABLE_WEB_PUSH = "true";
      process.env.WEB_PUSH_PRIVATE_KEY = "test-private-key";
      process.env.WEB_PUSH_SUBJECT = "test-subject";
      process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = "test-public-key";

      const { sendWebPushNotificationForInternalNotification } = await import(
        "@/lib/notifications/web-push-delivery"
      );

      const mockSupabase = makeMemorySupabase([], {
        fetchSubscriptionsError: "Database error",
      });
      const userSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn()
              .mockReturnValueOnce({
                eq: vi.fn()
                  .mockReturnValueOnce({
                    eq: vi.fn().mockReturnValue({
                      then: (onFulfill: Function) =>
                        onFulfill({
                          data: null,
                          error: { message: "Database error" },
                        }),
                    }),
                  }),
              })
              .mockReturnValueOnce({
                insert: vi.fn().mockReturnValue({
                  then: (onFulfill: Function) =>
                    onFulfill({
                      data: null,
                      error: null,
                    }),
                }),
              }),
          }),
        }),
      };

      await expect(
        sendWebPushNotificationForInternalNotification({
          supabase: userSupabase,
          notificationId: "notif-1",
          accountOwnerUserId: "owner-1",
          recipientUserId: "user-1",
          notificationType: "internal_job_assigned",
          jobId: "job-1",
        }),
      ).resolves.toBeUndefined(); // Should not throw

      // No send should be attempted
      expect(webPushSendNotificationMock).not.toHaveBeenCalled();
    });
  });

  describe("5. web-push send failure -> swallowed safely", () => {
    it("swallows web-push send errors and records as failed", async () => {
      process.env.ENABLE_WEB_PUSH = "true";
      process.env.WEB_PUSH_PRIVATE_KEY = "test-private-key";
      process.env.WEB_PUSH_SUBJECT = "test-subject";
      process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = "test-public-key";

      const { sendWebPushNotificationForInternalNotification } = await import(
        "@/lib/notifications/web-push-delivery"
      );

      const sendError = new Error("Network timeout");
      (sendError as any).statusCode = 500;
      webPushSendNotificationMock.mockRejectedValue(sendError);

      const mockSupabase = makeMemorySupabase([
        {
          id: "sub-1",
          endpoint: "https://push.example/device-1",
          p256dh: "p256dh-1",
          auth: "auth-1",
        },
      ]);

      await expect(
        sendWebPushNotificationForInternalNotification({
          supabase: mockSupabase,
          notificationId: "notif-1",
          accountOwnerUserId: "owner-1",
          recipientUserId: "user-1",
          notificationType: "internal_job_assigned",
          jobId: "job-1",
        }),
      ).resolves.toBeUndefined(); // Should not throw

      // Delivery attempt should be recorded as 'failed'
      const deliveryAttempts = mockSupabase.getInsertedRows("notification_delivery_attempts");
      expect(deliveryAttempts).toHaveLength(1);
      expect(deliveryAttempts[0]).toMatchObject({
        status: "failed",
        error_code: "PROVIDER_SEND_FAILED",
        push_subscription_id: "sub-1",
      });
    });

    it("swallows top-level exceptions", async () => {
      process.env.ENABLE_WEB_PUSH = "true";
      process.env.WEB_PUSH_PRIVATE_KEY = "test-private-key";
      process.env.WEB_PUSH_SUBJECT = "test-subject";
      process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = "test-public-key";

      const { sendWebPushNotificationForInternalNotification } = await import(
        "@/lib/notifications/web-push-delivery"
      );

      const mockSupabase = {
        from: vi.fn().mockImplementation(() => {
          throw new Error("Supabase client error");
        }),
      };
      createAdminClientMock.mockReturnValueOnce(mockSupabase);

      await expect(
        sendWebPushNotificationForInternalNotification({
          supabase: mockSupabase,
          notificationId: "notif-1",
          accountOwnerUserId: "owner-1",
          recipientUserId: "user-1",
          notificationType: "internal_job_assigned",
          jobId: "job-1",
        }),
      ).resolves.toBeUndefined(); // Should not throw
    });
  });

  describe("6. expired/gone endpoint -> subscription marked inactive", () => {
    it("marks subscription inactive on 410 Gone", async () => {
      process.env.ENABLE_WEB_PUSH = "true";
      process.env.WEB_PUSH_PRIVATE_KEY = "test-private-key";
      process.env.WEB_PUSH_SUBJECT = "test-subject";
      process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = "test-public-key";

      const { sendWebPushNotificationForInternalNotification } = await import(
        "@/lib/notifications/web-push-delivery"
      );

      const mockSupabase = makeMemorySupabase([
        {
          id: "sub-1",
          endpoint: "https://push.example/device-1",
          p256dh: "p256dh-1",
          auth: "auth-1",
        },
      ]);

      webPushSendNotificationMock.mockResolvedValue({
        statusCode: 410,
      });

      await sendWebPushNotificationForInternalNotification({
        supabase: mockSupabase,
        notificationId: "notif-1",
        accountOwnerUserId: "owner-1",
        recipientUserId: "user-1",
        notificationType: "internal_job_assigned",
        jobId: "job-1",
      });

      // Subscription should be marked inactive
      const updates = mockSupabase.getUpdatedRows("push_subscriptions");
      expect(updates).toHaveLength(1);
      expect(updates[0]).toMatchObject({
        id: "sub-1",
        is_active: false,
      });
    });

    it("marks subscription inactive on 404 Not Found", async () => {
      process.env.ENABLE_WEB_PUSH = "true";
      process.env.WEB_PUSH_PRIVATE_KEY = "test-private-key";
      process.env.WEB_PUSH_SUBJECT = "test-subject";
      process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = "test-public-key";

      const { sendWebPushNotificationForInternalNotification } = await import(
        "@/lib/notifications/web-push-delivery"
      );

      const mockSupabase = makeMemorySupabase([
        {
          id: "sub-1",
          endpoint: "https://push.example/device-1",
          p256dh: "p256dh-1",
          auth: "auth-1",
        },
      ]);

      webPushSendNotificationMock.mockResolvedValue({
        statusCode: 404,
      });

      await sendWebPushNotificationForInternalNotification({
        supabase: mockSupabase,
        notificationId: "notif-1",
        accountOwnerUserId: "owner-1",
        recipientUserId: "user-1",
        notificationType: "internal_job_assigned",
        jobId: "job-1",
      });

      // Subscription should be marked inactive
      const updates = mockSupabase.getUpdatedRows("push_subscriptions");
      expect(updates).toHaveLength(1);
      expect(updates[0]).toMatchObject({
        id: "sub-1",
        is_active: false,
      });
    });
  });

  describe("7. out-of-account subscription is not used", () => {
    it("fetches only subscriptions for the recipient within the account", async () => {
      process.env.ENABLE_WEB_PUSH = "true";
      process.env.WEB_PUSH_PRIVATE_KEY = "test-private-key";
      process.env.WEB_PUSH_SUBJECT = "test-subject";
      process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = "test-public-key";

      const { sendWebPushNotificationForInternalNotification } = await import(
        "@/lib/notifications/web-push-delivery"
      );

      const mockSupabase = makeMemorySupabase([
        {
          id: "sub-1",
          endpoint: "https://push.example/device-1",
          p256dh: "p256dh-1",
          auth: "auth-1",
        },
      ]);

      await sendWebPushNotificationForInternalNotification({
        supabase: mockSupabase,
        notificationId: "notif-1",
        accountOwnerUserId: "owner-1",
        recipientUserId: "user-1",
        notificationType: "internal_job_assigned",
        jobId: "job-1",
      });

      // Verify filters included account_owner_user_id AND user_id
      expect(webPushSendNotificationMock).toHaveBeenCalledTimes(1);
      const deliveryAttempts = mockSupabase.getInsertedRows("notification_delivery_attempts");
      expect(deliveryAttempts).toHaveLength(1);
      expect(deliveryAttempts[0]?.push_subscription_id).toBe("sub-1");
    });
  });

  describe("8. payload does not include internal note text, customer phone/email, full address, permit details, or private data", () => {
    it("payload for internal_job_assigned contains only safe data", async () => {
      process.env.ENABLE_WEB_PUSH = "true";
      process.env.WEB_PUSH_PRIVATE_KEY = "test-private-key";
      process.env.WEB_PUSH_SUBJECT = "test-subject";
      process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = "test-public-key";

      const { sendWebPushNotificationForInternalNotification } = await import(
        "@/lib/notifications/web-push-delivery"
      );

      const mockSupabase = makeMemorySupabase([
        {
          id: "sub-1",
          endpoint: "https://push.example/device-1",
          p256dh: "p256dh-1",
          auth: "auth-1",
        },
      ]);

      await sendWebPushNotificationForInternalNotification({
        supabase: mockSupabase,
        notificationId: "notif-1",
        accountOwnerUserId: "owner-1",
        recipientUserId: "user-1",
        notificationType: "internal_job_assigned",
        jobId: "job-1",
      });

      const payloadJson = webPushSendNotificationMock.mock.calls[0]?.[1];
      expect(payloadJson).toBeTruthy();

      const payload = JSON.parse(payloadJson);

      // Verify safe content
      expect(payload.title).toBe("You were assigned to a job");
      expect(payload.body).toBe("Open Compliance Matters to view details");
      expect(payload.url).toBe("/jobs/job-1?tab=ops");
      expect(payload.data?.url).toBe("/jobs/job-1?tab=ops");

      // Verify no sensitive data
      expect(JSON.stringify(payload)).not.toMatch(/phone|email|address|permit|permit_detail|customer_name|note|internal_note/i);
    });

    it("payload for internal_note_tag contains only safe data", async () => {
      process.env.ENABLE_WEB_PUSH = "true";
      process.env.WEB_PUSH_PRIVATE_KEY = "test-private-key";
      process.env.WEB_PUSH_SUBJECT = "test-subject";
      process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = "test-public-key";

      const { sendWebPushNotificationForInternalNotification } = await import(
        "@/lib/notifications/web-push-delivery"
      );

      const mockSupabase = makeMemorySupabase([
        {
          id: "sub-2",
          endpoint: "https://push.example/device-2",
          p256dh: "p256dh-2",
          auth: "auth-2",
        },
      ]);

      await sendWebPushNotificationForInternalNotification({
        supabase: mockSupabase,
        notificationId: "notif-2",
        accountOwnerUserId: "owner-1",
        recipientUserId: "user-1",
        notificationType: "internal_note_tag",
        jobId: "job-2",
      });

      const payloadJson = webPushSendNotificationMock.mock.calls[0]?.[1];
      expect(payloadJson).toBeTruthy();

      const payload = JSON.parse(payloadJson);

      // Verify safe content
      expect(payload.title).toBe("You were mentioned in an internal note");
      expect(payload.body).toBe("Open Compliance Matters to view details");

      // Verify no sensitive data
      expect(JSON.stringify(payload)).not.toMatch(/note_text|phone|email|address|permit|customer/i);
    });
  });
});

/**
 * Memory Supabase Helper
 * Provides a mock Supabase client with in-memory storage
 */
function makeMemorySupabase(
  initialSubscriptions: any[] = [],
  options: {
    fetchSubscriptionsError?: string;
    notifications?: Array<{
      id: string;
      job_id: string | null;
      recipient_ref: string | null;
      recipient_type: string | null;
      account_owner_user_id: string | null;
      notification_type: string | null;
    }>;
  } = {},
) {
  const insertedRows: Record<string, any[]> = {
    notification_delivery_attempts: [],
  };

  const subscriptions = initialSubscriptions.map((sub, idx) => ({
    id: sub.id,
    account_owner_user_id: sub.account_owner_user_id ?? "owner-1",
    user_id: sub.user_id ?? "user-1",
    endpoint: sub.endpoint,
    p256dh: sub.p256dh || null,
    auth: sub.auth || null,
    is_active: true,
  }));

  let updatedSubscriptions: any[] = [];

  const notifications =
    options.notifications ??
    [
      {
        id: "notif-1",
        job_id: "job-1",
        recipient_ref: "user-1",
        recipient_type: "internal",
        account_owner_user_id: "owner-1",
        notification_type: "internal_job_assigned",
      },
      {
        id: "notif-2",
        job_id: "job-2",
        recipient_ref: "user-1",
        recipient_type: "internal",
        account_owner_user_id: "owner-1",
        notification_type: "internal_note_tag",
      },
      {
        id: "notif-unsupported",
        job_id: "job-1",
        recipient_ref: "user-1",
        recipient_type: "internal",
        account_owner_user_id: "owner-1",
        notification_type: "contractor_intake_proposal_submitted",
      },
    ];

  const client = {
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: any) => ({
          maybeSingle: async () => {
            if (table === "notifications" && column === "id") {
              const notification = notifications.find((row) => row.id === value);
              return {
                data: notification ?? null,
                error: null,
              };
            }
            return { data: null, error: null };
          },
          eq: (column2: string, value2: any) => ({
            eq: (column3: string, value3: any) => ({
              then: (onFulfill: Function) => {
                if (
                  table === "push_subscriptions" &&
                  column === "account_owner_user_id" &&
                  column2 === "user_id" &&
                  column3 === "is_active"
                ) {
                  if (options.fetchSubscriptionsError) {
                    return onFulfill({
                      data: null,
                      error: { message: options.fetchSubscriptionsError },
                    });
                  }
                  const filtered = subscriptions.filter(
                    (s) =>
                      s.account_owner_user_id === value &&
                      s.user_id === value2 &&
                      s.is_active === value3,
                  );
                  return onFulfill({
                    data: filtered,
                    error: null,
                  });
                }
                return onFulfill({
                  data: null,
                  error: null,
                });
              },
            }),
          }),
        }),
      }),
      insert: (payload: any) => ({
        then: (onFulfill: Function) => {
          insertedRows.notification_delivery_attempts.push(payload);
          return onFulfill({
            data: null,
            error: null,
          });
        },
      }),
      update: (payload: any) => ({
        eq: (column: string, value: any) => ({
          eq: (column2: string, value2: any) => ({
            eq: (column3: string, value3: any) => ({
              then: (onFulfill: Function) => {
                if (
                  table === "push_subscriptions" &&
                  column === "id" &&
                  column2 === "account_owner_user_id" &&
                  column3 === "user_id"
                ) {
                  const subscription = subscriptions.find(
                    (s) =>
                      s.id === value &&
                      s.account_owner_user_id === value2 &&
                      s.user_id === value3,
                  );
                  if (subscription) {
                    Object.assign(subscription, payload);
                    updatedSubscriptions.push({ id: value, ...payload });
                  }
                }
                return onFulfill({
                  data: null,
                  error: null,
                });
              },
            }),
          }),
        }),
      }),
    }),

    getInsertedRows: (table: string) => insertedRows[table] || [],
    getUpdatedRows: (table: string) => updatedSubscriptions.filter((u) => true),
  };

  createAdminClientMock.mockReturnValue(client);
  return client;
}
