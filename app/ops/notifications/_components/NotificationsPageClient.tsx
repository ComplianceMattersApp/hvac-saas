"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { NotificationRowForUI } from "@/lib/actions/notification-read-actions";
import { matchesInternalNotificationFilter } from "@/lib/notifications/internal-awareness";
import { NotificationListClient } from "./NotificationListClient";

type NotificationCategoryKey = "contractor_updates" | "new_job_notifications";

type NotificationsPageClientProps = {
  initialNotifications: NotificationRowForUI[];
  categoryKey: NotificationCategoryKey | null;
  onlyUnread: boolean;
  onMarkAsRead: (input: { notificationId: string }) => Promise<void>;
  onMarkAllAsRead: () => Promise<void>;
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
  categoryKey,
  onlyUnread,
  onMarkAsRead,
  onMarkAllAsRead,
}: NotificationsPageClientProps) {
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

  const viewSummary = useMemo(() => {
    if (categoryKey === "contractor_updates") {
      return onlyUnread ? "Unread contractor updates" : "Contractor updates";
    }

    if (categoryKey === "new_job_notifications") {
      return onlyUnread ? "Unread new job notifications" : "New job notifications";
    }

    return onlyUnread ? "Unread notifications" : "All notifications";
  }, [categoryKey, onlyUnread]);

  const countSummary = useMemo(() => {
    if (onlyUnread) {
      return `${unreadCount} unread`;
    }

    return `${visibleNotifications.length} total · ${unreadCount} unread`;
  }, [onlyUnread, unreadCount, visibleNotifications.length]);

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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-5 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Notifications
              </h1>
              <p className="text-sm text-slate-600">
                Internal event visibility for ops workflow.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={buildNotificationsHref({})}
                className={`inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-slate-300 ${!categoryKey ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}
              >
                All notifications
              </Link>
              <Link
                href={buildNotificationsHref({ category: "contractor_updates", state: onlyUnread ? "unread" : null })}
                className={`inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-slate-300 ${categoryKey === "contractor_updates" ? "border-blue-700 bg-blue-700 text-white hover:bg-blue-600" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}
              >
                Contractor updates
              </Link>
              <Link
                href={buildNotificationsHref({ category: "new_job_notifications", state: onlyUnread ? "unread" : null })}
                className={`inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-slate-300 ${categoryKey === "new_job_notifications" ? "border-blue-700 bg-blue-700 text-white hover:bg-blue-600" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}
              >
                New job notifications
              </Link>
              <Link
                href={buildNotificationsHref({ category: categoryKey, state: onlyUnread ? null : "unread" })}
                className={`inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-slate-300 ${onlyUnread ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-600" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}
                aria-pressed={onlyUnread}
              >
                Unread only
              </Link>
            </div>

            <div className="space-y-1 text-sm text-slate-600">
              <p>{viewSummary}</p>
              <p>{countSummary}</p>
            </div>
          </div>

          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={handleMarkAllAsRead}
              disabled={isMarkAllPending}
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isMarkAllPending ? "Marking all..." : "Mark all as read"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-7">
        <NotificationListClient
          notifications={visibleNotifications}
          pendingReadId={pendingReadId}
          onMarkAsRead={handleMarkAsRead}
        />
      </div>
    </div>
  );
}