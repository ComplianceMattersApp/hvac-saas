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

import { createAdminClient } from "@/lib/supabase/server";

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

type PushNotificationContext = {
  notificationId: string;
  accountOwnerUserId: string;
  recipientUserId: string;
  notificationType: "internal_job_assigned" | "internal_note_tag";
  jobId: string;
};

type PushSubscriptionRow = {
  id: string;
  account_owner_user_id?: string | null;
  user_id?: string | null;
  endpoint: string;
  p256dh?: string | null;
  auth?: string | null;
};

const SUPPORTED_PUSH_NOTIFICATION_TYPES = ["internal_job_assigned", "internal_note_tag"] as const;
const SUPPORTED_INTERNAL_RECIPIENT_TYPES = ["internal", "internal_user"] as const;

function isWebPushEnabled(): boolean {
  return process.env.ENABLE_WEB_PUSH === "true";
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function isSupportedPushNotificationType(value: unknown): value is PushNotificationContext["notificationType"] {
  return SUPPORTED_PUSH_NOTIFICATION_TYPES.includes(
    normalizeText(value).toLowerCase() as PushNotificationContext["notificationType"],
  );
}

function isSupportedInternalRecipientType(value: unknown): boolean {
  return SUPPORTED_INTERNAL_RECIPIENT_TYPES.includes(
    normalizeText(value).toLowerCase() as (typeof SUPPORTED_INTERNAL_RECIPIENT_TYPES)[number],
  );
}

async function resolvePushNotificationContext(params: {
  admin: any;
  input: NotificationDeliveryAttemptInput;
}): Promise<PushNotificationContext | null> {
  const notificationId = normalizeText(params.input.notificationId);
  if (!notificationId) return null;

  const { data, error } = await params.admin
    .from("notifications")
    .select("id, job_id, recipient_ref, recipient_type, account_owner_user_id, notification_type")
    .eq("id", notificationId)
    .maybeSingle();

  if (error) {
    console.warn("[web-push] Failed to resolve notification context", {
      marker: "web_push_notification_context_resolve_failed",
      notificationId,
      error: error.message,
    });
    return null;
  }

  const notificationType = normalizeText(data?.notification_type).toLowerCase();
  if (!isSupportedPushNotificationType(notificationType)) {
    console.info("[web-push] unsupported notification type skipped", {
      marker: "web_push_unsupported_notification_type_skipped",
      notificationId,
      notificationType: notificationType || normalizeText(params.input.notificationType),
    });
    return null;
  }

  const recipientType = normalizeText(data?.recipient_type).toLowerCase();
  const recipientUserId = normalizeText(data?.recipient_ref);
  const accountOwnerUserId = normalizeText(data?.account_owner_user_id);
  const jobId = normalizeText(data?.job_id);

  if (
    !isSupportedInternalRecipientType(recipientType) ||
    !recipientUserId ||
    !accountOwnerUserId ||
    !jobId
  ) {
    console.warn("[web-push] Invalid notification context for push", {
      marker: "web_push_notification_context_invalid",
      notificationId,
      notificationType,
      recipientType,
      hasRecipientRef: Boolean(recipientUserId),
      hasAccountOwnerUserId: Boolean(accountOwnerUserId),
      hasJobId: Boolean(jobId),
    });
    return null;
  }

  return {
    notificationId,
    accountOwnerUserId,
    recipientUserId,
    notificationType,
    jobId,
  };
}

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
      body: "Open EveryStep FieldWorks to view details",
      data: {
        url: jobId ? `/jobs/${jobId}?tab=ops` : "/ops",
      },
    };
  }

  if (notificationType === "internal_note_tag") {
    return {
      title: "You were mentioned in an internal note",
      body: "Open EveryStep FieldWorks to view details",
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

    const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
    const subject = process.env.WEB_PUSH_SUBJECT;
    const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY ?? "";

    if (!privateKey || !subject) {
      return {
        sent: false,
        error: "Missing VAPID credentials",
      };
    }

    // Configure VAPID keys (public key can be omitted here as it's already configured)
    webpush.setVapidDetails(subject, publicKey, privateKey);

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
      url: params.payload.data?.url,
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
  subscription: PushSubscriptionRow;
  accountOwnerUserId: string;
  recipientUserId: string;
  statusCode?: number;
}): Promise<void> {
  const statusCode = params.statusCode;

  // 410 Gone or 404 Not Found indicate expired subscription
  if (statusCode === 410 || statusCode === 404) {
    try {
      const { error } = await params.supabase
        .from("push_subscriptions")
        .update({ is_active: false })
        .eq("id", params.subscription.id)
        .eq("account_owner_user_id", params.accountOwnerUserId)
        .eq("user_id", params.recipientUserId);

      if (error) {
        console.warn("[web-push] Failed to mark subscription inactive", {
          subscriptionId: params.subscription.id,
          error: error.message,
        });
      }
    } catch (error) {
      console.warn("[web-push] Exception marking subscription inactive", {
        subscriptionId: params.subscription.id,
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
  console.info("[web-push] helper started", {
    marker: "web_push_helper_started",
    notificationId: input.notificationId,
  });

  const enabled = isWebPushEnabled();
  console.info("[web-push] delivery gate evaluated", {
    marker: "web_push_delivery_gate_evaluated",
    notificationId: input.notificationId,
    notificationType: input.notificationType,
    recipientUserId: input.recipientUserId,
    enabled,
    hasPrivateKey: Boolean(process.env.WEB_PUSH_PRIVATE_KEY),
    hasSubject: Boolean(process.env.WEB_PUSH_SUBJECT),
    hasPublicKey: Boolean(process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY),
  });

  // Feature gate: off by default
  if (!enabled) {
    return;
  }

  try {
    const admin = createAdminClient();
    const context = await resolvePushNotificationContext({ admin, input });
    if (!context) return;

    // Only send for supported notification types
    const payload = buildSafePayload({
      notificationType: context.notificationType,
      jobId: context.jobId,
    });

    if (!payload) return;

    // Fetch active subscriptions for recipient
    const { data: subscriptions, error: fetchError } = await admin
      .from("push_subscriptions")
      .select("id, account_owner_user_id, user_id, endpoint, p256dh, auth")
      .eq("account_owner_user_id", context.accountOwnerUserId)
      .eq("user_id", context.recipientUserId)
      .eq("is_active", true);

    if (fetchError) {
      console.warn("[web-push] Failed to fetch subscriptions", {
        recipientUserId: context.recipientUserId,
        error: fetchError.message,
      });

      await recordDeliveryAttempt({
        supabase: admin,
        notificationId: context.notificationId,
        accountOwnerUserId: context.accountOwnerUserId,
        recipientUserId: context.recipientUserId,
        channel: "web_push",
        status: "skipped",
        errorCode: "FETCH_SUBSCRIPTIONS_FAILED",
        errorDetail: fetchError.message,
      });

      return;
    }

    console.info("[web-push] active subscriptions fetched", {
      marker: "web_push_active_subscriptions_fetched",
      notificationId: context.notificationId,
      notificationType: context.notificationType,
      recipientUserId: context.recipientUserId,
      activeSubscriptionCount: subscriptions?.length ?? 0,
    });

    if (!subscriptions || subscriptions.length === 0) {
      // No active subscriptions; this is normal and expected
      await recordDeliveryAttempt({
        supabase: admin,
        notificationId: context.notificationId,
        accountOwnerUserId: context.accountOwnerUserId,
        recipientUserId: context.recipientUserId,
        channel: "web_push",
        status: "skipped",
        errorCode: "NO_ACTIVE_SUBSCRIPTIONS",
      });

      return;
    }

    // Send to all active subscriptions for this user
    for (const subscription of subscriptions as PushSubscriptionRow[]) {
      const result = await sendToSubscription({
        subscription,
        payload,
      });

      console.info("[web-push] provider send completed", {
        marker: "web_push_provider_send_completed",
        notificationId: context.notificationId,
        notificationType: context.notificationType,
        sent: result.sent,
        providerStatusCode: result.statusCode ?? null,
        errorCode: result.error ? "PROVIDER_SEND_FAILED" : null,
      });

      if (result.statusCode === 410 || result.statusCode === 404) {
        await markSubscriptionInactiveIfExpired({
          supabase: admin,
          subscription,
          accountOwnerUserId: context.accountOwnerUserId,
          recipientUserId: context.recipientUserId,
          statusCode: result.statusCode,
        });
      }

      await recordDeliveryAttempt({
        supabase: admin,
        notificationId: context.notificationId,
        accountOwnerUserId: context.accountOwnerUserId,
        recipientUserId: context.recipientUserId,
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
    const maybeRecord = error as Record<string, unknown>;
    console.warn("[web-push] Unexpected error in push delivery", {
      marker: "web_push_helper_failed_before_attempt",
      notificationId: input.notificationId,
      recipientUserId: input.recipientUserId,
      error_code: typeof maybeRecord?.code === "string" ? maybeRecord.code : null,
      error_message: error instanceof Error ? error.message : String(error),
    });
  }
}
