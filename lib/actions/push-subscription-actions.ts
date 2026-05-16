"use server";

import { revalidatePath } from "next/cache";
import {
  deactivateCurrentInternalUserPushSubscription,
  registerCurrentInternalUserPushSubscription,
  type PushSubscriptionSafeRow,
} from "@/lib/notifications/push-subscriptions";

type BrowserPushSubscriptionInput = {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  } | null;
};

export type RegisterBrowserPushSubscriptionResult =
  | { status: "registered" | "updated"; subscription: PushSubscriptionSafeRow }
  | { status: "not_internal" | "invalid_input" | "failed"; subscription: null };

export type DeactivateBrowserPushSubscriptionResult = {
  deactivated: boolean;
  count: number;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function browserPushInputFromUnknown(value: unknown): BrowserPushSubscriptionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const input = value as Record<string, unknown>;
  const keys =
    input.keys && typeof input.keys === "object" && !Array.isArray(input.keys)
      ? (input.keys as Record<string, unknown>)
      : null;

  return {
    endpoint: input.endpoint,
    keys: keys
      ? {
          p256dh: keys.p256dh,
          auth: keys.auth,
        }
      : null,
  };
}

export async function registerBrowserPushSubscriptionAction(input: {
  subscription?: unknown;
  userAgent?: unknown;
  deviceLabel?: unknown;
  permissionState?: unknown;
}): Promise<RegisterBrowserPushSubscriptionResult> {
  const subscription = browserPushInputFromUnknown(input.subscription);
  const endpoint = cleanText(subscription.endpoint);
  const p256dh = cleanText(subscription.keys?.p256dh);
  const auth = cleanText(subscription.keys?.auth);

  if (!endpoint || !p256dh || !auth) {
    return { status: "invalid_input", subscription: null };
  }

  try {
    const result = await registerCurrentInternalUserPushSubscription({
      endpoint,
      p256dh,
      auth,
      userAgent: cleanText(input.userAgent) || null,
      deviceLabel: cleanText(input.deviceLabel) || null,
      permissionState: cleanText(input.permissionState) || "granted",
    });

    if (result.subscription) {
      revalidatePath("/ops/notifications");
    }

    return result;
  } catch {
    return { status: "failed", subscription: null };
  }
}

export async function deactivateBrowserPushSubscriptionAction(input: {
  endpoint?: unknown;
}): Promise<DeactivateBrowserPushSubscriptionResult> {
  const endpoint = cleanText(input.endpoint);
  if (!endpoint) return { deactivated: false, count: 0 };

  try {
    const result = await deactivateCurrentInternalUserPushSubscription({ endpoint });
    if (result.deactivated) {
      revalidatePath("/ops/notifications");
    }
    return result;
  } catch {
    return { deactivated: false, count: 0 };
  }
}
