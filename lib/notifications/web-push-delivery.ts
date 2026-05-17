/**
 * Web Push Delivery Helper
 * 
 * Purpose:
 * - Send feature-gated web push notifications to enrolled devices
 * - Triggered after in-app notifications are created
 * - Non-blocking; failures swallowed safely
 * - Tracks delivery attempts for audit
 * 
 * Feature gate:
 * - ENABLE_WEB_PUSH env must be explicitly 'true' (default is off)
 * 
 * Scope:
 * - Server-only; never expose to client
 * - Only for recipient-scoped notifications: internal_job_assigned, internal_note_tag
 * - No offline caching
 * - No SMS/email/Twilio
 * - No sensitive data in payloads (no note text, addresses, customer details)
 */

type NotificationDeliveryAttemptInput = {
  supabase: any;
  notificationId: string;
  accountOwnerUserId: string;
  recipientUserId: string;
  notificationType: string;
  jobId?: string | null;
};

type WebPushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

const ENABLE_WEB_PUSH = process.env.ENABLE_WEB_PUSH === "true";
const WEB_PUSH_PRIVATE_KEY = process.env.WEB_PUSH_PRIVATE_KEY;
const WEB_PUSH_SUBJECT = process.env.WEB_PUSH_SUBJECT;

/**
 * Record a delivery attempt in the audit table
 * Safe to call; failures are logged but not thrown
 */
async function recordDeliveryAttempt(params: {
  supabase: any;
  notificationId: string;
  accountOwnerUserId: string;
  recipientUserId: string;
  pushSubscriptionId?: string | null;
  channel: string;
  status: "skipped" | "sent" | "failed";
  providerStatusCode?: number | null;
  errorCode?: string | null;
  errorDetail?: string | null;
}): Promise<void> {
  try {
    const { error } = await params.supabase.from("notification_delivery_attempts").insert({
      notification_id: params.notificationId,
      account_owner_user_id: params.accountOwnerUserId,
      recipient_user_id: params.recipientUserId,
      push_subscription_id: params.pushSubscriptionId || null,
      channel: params.channel,
      status: params.status,
      provider_status_code: params.providerStatusCode || null,
      error_code: params.errorCode || null,
      error_detail: params.errorDetail || null,
    });

    if (error) {
      console.warn("[web-push] Failed to record delivery attempt", {
        notificationId: params.notificationId,
        recipientUserId: params.recipientUserId,
        error: error.message,
      });
    }
  } catch (error) {
    console.warn("[web-push] Exception recording delivery attempt", {
      notificationId: params.notificationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Build safe web push payload based on notification type
 * Never includes sensitive data (note body, addresses, phone, customer details)
 */
function buildSafePayload(params: {
  notificationType: string;
  jobId?: string | null;
}): WebPushPayload | null {
  const jobId = String(params.jobId ?? "").trim();
  const notificationType = String(params.notificationType ?? "").trim().toLowerCase();

  if (notificationType === "internal_job_assigned") {
    return {
      title: "You were assigned to a job",
      body: "Open Compliance Matters to view details",
      data: {
        url: jobId ? `/jobs/${jobId}?tab=ops` : "/ops",
      },
    };
  }

  if (notificationType === "internal_note_tag") {
    return {
      title: "You were mentioned in an internal note",
      body: "Open Compliance Matters to view details",
      data: {
        url: jobId ? `/jobs/${jobId}?tab=ops#internal-notes` : "/ops",
      },
    };
  }

  // Unsupported notification type for push
  return null;
}

/**
 * Send push notification to a single subscription
 * Returns true if sent, false if failed or skipped
 */
async function sendToSubscription(params: {
  subscription: {
    id: string;
    endpoint: string;
    p256dh?: string | null;
    auth?: string | null;
  };
  payload: WebPushPayload;
}): Promise<{ sent: boolean; statusCode?: number; error?: string }> {
  try {
    // Dynamically import web-push only if needed
    const webpush = await import("web-push");

    if (!WEB_PUSH_PRIVATE_KEY || !WEB_PUSH_SUBJECT) {
      return {
        sent: false,
        error: "Missing VAPID credentials",
      };
    }

    // Configure VAPID keys (public key can be omitted here as it's already configured)
    webpush.setVapidDetails(WEB_PUSH_SUBJECT, process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY ?? "", WEB_PUSH_PRIVATE_KEY);

    const pushSubscription = {
      endpoint: params.subscription.endpoint,
      keys: {
        p256dh: params.subscription.p256dh || "",
        auth: params.subscription.auth || "",
      },
    };

    const payload = JSON.stringify({
      title: params.payload.title,
      body: params.payload.body,
      data: params.payload.data,
    });

    const result = await webpush.sendNotification(pushSubscription, payload);

    return {
      sent: true,
      statusCode: result.statusCode,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const statusCode = (error as any)?.statusCode;

    return {
      sent: false,
      statusCode,
      error: errorMsg,
    };
  }
}

/**
 * Check if subscription endpoint is expired/gone and mark inactive if so
 */
async function markSubscriptionInactiveIfExpired(params: {
  supabase: any;
  subscriptionId: string;
  statusCode?: number;
}): Promise<void> {
  const statusCode = params.statusCode;

  // 410 Gone or 404 Not Found indicate expired subscription
  if (statusCode === 410 || statusCode === 404) {
    try {
      const { error } = await params.supabase
        .from("push_subscriptions")
        .update({ is_active: false })
        .eq("id", params.subscriptionId);

      if (error) {
        console.warn("[web-push] Failed to mark subscription inactive", {
          subscriptionId: params.subscriptionId,
          error: error.message,
        });
      }
    } catch (error) {
      console.warn("[web-push] Exception marking subscription inactive", {
        subscriptionId: params.subscriptionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Main entry point: Send web push notification after in-app notification created
 * This is called after insertTargetedInternalNotification succeeds
 * 
 * Feature-gated: Does nothing if ENABLE_WEB_PUSH is not true
 * Non-blocking: Failures are logged and swallowed; never throws
 * Safe for side-effect: Delivery failures don't affect job assignment or note save
 */
export async function sendWebPushNotificationForInternalNotification(
  input: NotificationDeliveryAttemptInput,
): Promise<void> {
  // Feature gate: off by default
  if (!ENABLE_WEB_PUSH) {
    return;
  }

  try {
    // Only send for supported notification types
    const payload = buildSafePayload({
      notificationType: input.notificationType,
      jobId: input.jobId,
    });

    if (!payload) {
      // Unsupported type; skip without recording attempt
      return;
    }

    // Fetch active subscriptions for recipient
    const { data: subscriptions, error: fetchError } = await input.supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("account_owner_user_id", input.accountOwnerUserId)
      .eq("user_id", input.recipientUserId)
      .eq("is_active", true);

    if (fetchError) {
      console.warn("[web-push] Failed to fetch subscriptions", {
        recipientUserId: input.recipientUserId,
        error: fetchError.message,
      });

      await recordDeliveryAttempt({
        supabase: input.supabase,
        notificationId: input.notificationId,
        accountOwnerUserId: input.accountOwnerUserId,
        recipientUserId: input.recipientUserId,
        channel: "web_push",
        status: "skipped",
        errorCode: "FETCH_SUBSCRIPTIONS_FAILED",
        errorDetail: fetchError.message,
      });

      return;
    }

    if (!subscriptions || subscriptions.length === 0) {
      // No active subscriptions; this is normal and expected
      await recordDeliveryAttempt({
        supabase: input.supabase,
        notificationId: input.notificationId,
        accountOwnerUserId: input.accountOwnerUserId,
        recipientUserId: input.recipientUserId,
        channel: "web_push",
        status: "skipped",
        errorCode: "NO_ACTIVE_SUBSCRIPTIONS",
      });

      return;
    }

    // Send to all active subscriptions for this user
    for (const subscription of subscriptions) {
      const result = await sendToSubscription({
        subscription,
        payload,
      });

      if (result.statusCode === 410 || result.statusCode === 404) {
        await markSubscriptionInactiveIfExpired({
          supabase: input.supabase,
          subscriptionId: subscription.id,
          statusCode: result.statusCode,
        });
      }

      await recordDeliveryAttempt({
        supabase: input.supabase,
        notificationId: input.notificationId,
        accountOwnerUserId: input.accountOwnerUserId,
        recipientUserId: input.recipientUserId,
        pushSubscriptionId: subscription.id,
        channel: "web_push",
        status: result.sent ? "sent" : "failed",
        providerStatusCode: result.statusCode || null,
        errorCode: result.error ? "PROVIDER_SEND_FAILED" : null,
        errorDetail: result.error || null,
      });
    }
  } catch (error) {
    // Top-level catch: swallow all exceptions; log for debugging
    console.warn("[web-push] Unexpected error in push delivery", {
      notificationId: input.notificationId,
      recipientUserId: input.recipientUserId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
