"use client";

import { useState } from "react";
import { NotificationRowForUI } from "@/lib/actions/notification-read-actions";
import { NotificationList } from "./NotificationList";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

type NotificationListClientProps = {
  initialNotifications: NotificationRowForUI[];
  onMarkAsRead: (input: { notificationId: string }) => Promise<void>;
};

export function NotificationListClient({
  initialNotifications,
  onMarkAsRead,
}: NotificationListClientProps) {
  const [notifications, setNotifications] =
    useState<NotificationRowForUI[]>(initialNotifications);
  const [isLoading, setIsLoading] = useState(false);

  const handleMarkAsRead = async (notificationId: string) => {
    setIsLoading(true);
    try {
      await onMarkAsRead({ notificationId: notificationId });
      // Update local state
      setNotifications(prevNotifs =>
        prevNotifs.map(n =>
          n.id === notificationId
            ? { ...n, read_at: new Date().toISOString(), is_unread: false }
            : n
        )
      );
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-gray-400 mb-2 text-4xl">📭</div>
        <p className="text-gray-600 font-medium">No notifications</p>
        <p className="text-gray-500 text-sm mt-1">You're all caught up!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {notifications.map(notif => (
        <div
          key={notif.id}
          className={`p-4 rounded border transition ${
            notif.is_unread
              ? "bg-blue-50 border-blue-200 hover:bg-blue-100"
              : "bg-white border-gray-200 hover:bg-gray-50"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            {/* Left: notification info */}
            <div className="flex-1 min-w-0">
              {/* Header: subject + unread badge */}
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-900 truncate">
                  {notif.subject || notif.notification_type}
                </h3>
                {notif.is_unread && (
                  <span
                    className="inline-block w-2 h-2 bg-blue-600 rounded-full flex-shrink-0"
                    title="Unread"
                  />
                )}
              </div>

              {/* Body + timestamp */}
              <p className="text-gray-700 text-sm mb-2 line-clamp-2">
                {notif.body}
              </p>
              <p className="text-gray-500 text-xs">
                {formatDistanceToNow(new Date(notif.created_at), {
                  addSuffix: true,
                })}
              </p>
            </div>

            {/* Right: actions */}
            <div className="flex gap-2 flex-shrink-0">
              {/* Mark as read button */}
              {notif.is_unread && (
                <button
                  onClick={() => handleMarkAsRead(notif.id)}
                  disabled={isLoading}
                  className="px-3 py-1 text-xs font-medium text-gray-700 hover:text-gray-900 bg-gray-200 hover:bg-gray-300 rounded transition disabled:opacity-50"
                  title="Mark as read"
                >
                  ✓
                </button>
              )}

              {/* Navigate to job (if notification has job_id) */}
              {notif.job_id && (
                <Link
                  href={`/jobs/${notif.job_id}`}
                  className="px-3 py-1 text-xs font-medium text-blue-700 hover:text-blue-900 bg-blue-100 hover:bg-blue-200 rounded transition"
                  title="View job"
                >
                  Job
                </Link>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
