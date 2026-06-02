"use client";

import { BellRing, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { NotificationRowForUI } from "@/lib/actions/notification-read-actions";
import type {
  DeactivateBrowserPushSubscriptionResult,
  RegisterBrowserPushSubscriptionResult,
} from "@/lib/actions/push-subscription-actions";
import type { PushSubscriptionSafeRow } from "@/lib/notifications/push-subscriptions";
import type { ProductMode } from "@/lib/business/product-mode-defaults";
import { matchesInternalNotificationFilter } from "@/lib/notifications/internal-awareness";
import { DeviceNotificationsCard } from "./DeviceNotificationsCard";
import { NotificationListClient } from "./NotificationListClient";

type NotificationCategoryKey = "contractor_updates" | "new_job_notifications";

type NotificationsPageClientProps = {
  initialNotifications: NotificationRowForUI[];
  initialPushSubscriptions: PushSubscriptionSafeRow[];
  publicVapidKey: string | null;
  categoryKey: NotificationCategoryKey | null;
  onlyUnread: boolean;
  productMode: ProductMode;
  onMarkAsRead: (input: { notificationId: string }) => Promise<void>;
  onMarkAllAsRead: () => Promise<void>;
  onRegisterPushSubscription: (input: {
    subscription: unknown;
    userAgent?: string | null;
    deviceLabel?: string | null;
    permissionState?: string | null;
  }) => Promise<RegisterBrowserPushSubscriptionResult>;
  onDeactivatePushSubscription: (input: { endpoint?: string | null }) => Promise<DeactivateBrowserPushSubscriptionResult>;
};

function buildNotificationsHref(params: {
  category?: NotificationCategoryKey | null;
  state?: "unread" | null;
}) {
  const searchParams = new URLSearchParams();

  if (params.category) {
    searchParams.set("category", params.category);
  }

  if (params.state) {
    searchParams.set("state", params.state);
  }

  const query = searchParams.toString();
  return query ? `/ops/notifications?${query}` : "/ops/notifications";
}

export function NotificationsPageClient({
  initialNotifications,
  initialPushSubscriptions,
  publicVapidKey,
  categoryKey,
  onlyUnread,
  productMode,
  onMarkAsRead,
  onMarkAllAsRead,
  onRegisterPushSubscription,
  onDeactivatePushSubscription,
}: NotificationsPageClientProps) {
  const isHvacServiceMode = productMode === "hvac_service";
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationRowForUI[]>(initialNotifications);
  const [pendingReadId, setPendingReadId] = useState<string | null>(null);
  const [isMarkAllPending, setIsMarkAllPending] = useState(false);

  useEffect(() => {
    setNotifications(initialNotifications);
    setPendingReadId(null);
    setIsMarkAllPending(false);
  }, [initialNotifications]);

  const visibleNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      if (onlyUnread && !notification.is_unread) {
        return false;
      }

      if (!categoryKey) {
        return true;
      }

      const type = String(notification.notification_type ?? "").trim().toLowerCase();

      if (categoryKey === "contractor_updates") {
        return matchesInternalNotificationFilter(type, "contractor_updates");
      }

      return matchesInternalNotificationFilter(type, "new_job_notifications");
    });
  }, [categoryKey, notifications, onlyUnread]);

  const unreadCount = useMemo(
    () => visibleNotifications.filter((notification) => notification.is_unread).length,
    [visibleNotifications],
  );

  const countSummary = useMemo(() => {
    if (onlyUnread) {
      return "Showing unread notifications.";
    }

    if (categoryKey) {
      return "Showing filtered notifications.";
    }

    return "Showing recent notifications.";
  }, [categoryKey, onlyUnread]);

  const handleMarkAsRead = async (notificationId: string) => {
    setPendingReadId(notificationId);

    try {
      await onMarkAsRead({ notificationId });
      setNotifications((currentNotifications) => {
        if (onlyUnread) {
          return currentNotifications.filter((notification) => notification.id !== notificationId);
        }

        return currentNotifications.map((notification) =>
          notification.id === notificationId
            ? {
                ...notification,
                read_at: new Date().toISOString(),
                is_unread: false,
              }
            : notification,
        );
      });
      router.refresh();
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    } finally {
      setPendingReadId(null);
    }
  };

  const handleMarkAllAsRead = async () => {
    setIsMarkAllPending(true);

    try {
      await onMarkAllAsRead();
      setNotifications((currentNotifications) => {
        if (onlyUnread) {
          return [];
        }

        return currentNotifications.map((notification) => ({
          ...notification,
          read_at: notification.read_at ?? new Date().toISOString(),
          is_unread: false,
        }));
      });
      router.refresh();
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
    } finally {
      setIsMarkAllPending(false);
    }
  };

  const filterLinkClass = (active: boolean, tone: "slate" | "blue" | "emerald" = "slate") => {
    const activeClass =
      tone === "blue"
        ? "border-blue-700 bg-blue-700 text-white shadow-sm hover:bg-blue-600"
        : tone === "emerald"
        ? "border-emerald-700 bg-emerald-700 text-white shadow-sm hover:bg-emerald-600"
        : "border-slate-900 bg-slate-900 text-white shadow-sm hover:bg-slate-800";

    return `inline-flex min-h-10 items-center justify-center rounded-full border px-3.5 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-slate-300 ${
      active ? activeClass : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
    }`;
  };

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-4 text-slate-900 sm:px-6 sm:py-5">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.36)] sm:p-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="min-w-0">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700">
                  <BellRing className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Notification Center</p>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                    {isHvacServiceMode ? "My Alerts" : "Notifications"}
                  </h1>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                    {isHvacServiceMode
                      ? "Assignment and internal note mention alerts for your active work."
                      : "Operational awareness for contractor updates, job alerts, and internal workflow signals."}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Alerts are for awareness. Action ownership stays in the Ops queues and job records.
                  </p>
                </div>
              </div>
            </div>

            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                disabled={isMarkAllPending}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                <CheckCheck className="h-4 w-4" aria-hidden="true" />
                {isMarkAllPending ? "Marking all..." : "Mark all as read"}
              </button>
            ) : null}
          </div>

          <div className="mt-5">
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-blue-800">Unread</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{unreadCount}</p>
              <p className="mt-1 text-xs text-blue-800">Notifications that still need review.</p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3">
            <div className="flex flex-wrap gap-2">
              <Link href={buildNotificationsHref({})} className={filterLinkClass(!categoryKey)}>
                All
              </Link>
              {!isHvacServiceMode ? (
                <Link
                  href={buildNotificationsHref({ category: "contractor_updates", state: onlyUnread ? "unread" : null })}
                  className={filterLinkClass(categoryKey === "contractor_updates", "blue")}
                >
                  Contractor updates
                </Link>
              ) : null}
              <Link
                href={buildNotificationsHref({ category: "new_job_notifications", state: onlyUnread ? "unread" : null })}
                className={filterLinkClass(categoryKey === "new_job_notifications", "blue")}
              >
                {isHvacServiceMode ? "Team alerts" : "New job notifications"}
              </Link>
              <Link
                href={buildNotificationsHref({ category: categoryKey, state: onlyUnread ? null : "unread" })}
                className={filterLinkClass(onlyUnread, "emerald")}
                aria-pressed={onlyUnread}
              >
                Unread only
              </Link>
            </div>
            <p className="mt-3 text-xs text-slate-500">{countSummary}</p>
          </div>
        </section>

        <DeviceNotificationsCard
          initialSubscriptions={initialPushSubscriptions}
          publicVapidKey={publicVapidKey}
          onRegister={onRegisterPushSubscription}
          onDeactivate={onDeactivatePushSubscription}
        />
        <NotificationListClient
          notifications={visibleNotifications}
          pendingReadId={pendingReadId}
          onMarkAsRead={handleMarkAsRead}
        />
      </div>
    </div>
  );
}
