"use client";

import { useEffect } from "react";
import { registerBrowserPushSubscriptionAction } from "@/lib/actions/push-subscription-actions";
import { reconcileBrowserPushSubscription } from "@/lib/notifications/browser-push-auto-reconcile";
import { getOrRegisterServiceWorkerRegistration } from "@/lib/pwa/service-worker";

type BrowserPushSubscriptionAutoReconcilerProps = {
  userId: string;
  accountOwnerUserId: string;
};

function supportsBrowserPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function resolveExistingPushRegistration() {
  if (!supportsBrowserPush()) return null;

  return getOrRegisterServiceWorkerRegistration();
}

export default function BrowserPushSubscriptionAutoReconciler({
  userId,
  accountOwnerUserId,
}: BrowserPushSubscriptionAutoReconcilerProps) {
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!supportsBrowserPush()) return;
      if (Notification.permission !== "granted") return;

      try {
        const result = await reconcileBrowserPushSubscription({
          userId,
          accountOwnerUserId,
          permission: Notification.permission,
          getRegistration: resolveExistingPushRegistration,
          onRegister: registerBrowserPushSubscriptionAction,
          storage: window.sessionStorage,
        });

        if (cancelled) return;

        if (result.status === "failed") {
          console.warn("[push-auto-reconcile] registration replay failed", result);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("[push-auto-reconcile] reconciliation skipped", {
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [accountOwnerUserId, userId]);

  return null;
}
