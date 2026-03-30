"use client";

import { useState } from "react";
import { NotificationRowForUI } from "@/lib/actions/notification-read-actions";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

type NotificationListClientProps = {
  initialNotifications: NotificationRowForUI[];
  onMarkAsRead: (input: { notificationId: string }) => Promise<void>;
};

function notificationTypeLabel(value?: string | null) {
  const key = String(value ?? "").trim().toLowerCase();
  const labels: Record<string, string> = {
    contractor_report_sent: "Contractor Report Sent",
    retest_ready_requested: "Retest Ready Requested",
    contractor_note: "Contractor Note",
    contractor_schedule_updated: "Contractor Schedule Updated",
    contractor_report_email: "Contractor Report Email",
    customer_job_scheduled_email: "Customer Scheduled Email",
    contractor_job_scheduled_email: "Contractor Scheduled Email",
    internal_contractor_job_intake_email: "Internal Intake Email",
  };

  return labels[key] ?? "Notification";
}

export function NotificationListClient({
  initialNotifications,
  onMarkAsRead,
}: NotificationListClientProps) {
  const [notifications, setNotifications] =
    useState<NotificationRowForUI[]>(initialNotifications);
  const [pendingReadId, setPendingReadId] = useState<string | null>(null);

  const handleMarkAsRead = async (notificationId: string) => {
    setPendingReadId(notificationId);
    try {
      await onMarkAsRead({ notificationId: notificationId });
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
      setPendingReadId(null);
    }
  };

  if (notifications.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
        <p className="text-base font-semibold text-slate-800">No notifications</p>
        <p className="mt-1 text-sm text-slate-500">You are all caught up right now.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {notifications.map(notif => (
        <div
          key={notif.id}
          className={`relative overflow-hidden rounded-lg border bg-white p-4 transition ${
            notif.is_unread ? "border-blue-200 shadow-sm" : "border-slate-200"
          }`}
        >
          {notif.is_unread && (
            <div className="absolute left-0 top-0 h-full w-1 bg-blue-500" aria-hidden="true" />
          )}

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-slate-900 md:text-base">
                  {notif.subject || notif.notification_type}
                </h3>
                {notif.is_unread && (
                  <span
                    className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700"
                    title="Unread"
                  >
                    Unread
                  </span>
                )}
              </div>

              <p className="mb-2 line-clamp-2 text-sm text-slate-700">
                {notif.body || "No additional details."}
              </p>

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium uppercase tracking-wide text-slate-600">
                  {notificationTypeLabel(notif.notification_type)}
                </span>
                <span>
                  {formatDistanceToNow(new Date(notif.created_at), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center gap-2">
              {notif.is_unread && (
                <button
                  onClick={() => handleMarkAsRead(notif.id)}
                  disabled={pendingReadId === notif.id}
                  className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
                  title="Mark as read"
                >
                  {pendingReadId === notif.id ? "Saving..." : "Mark read"}
                </button>
              )}

              {notif.job_id && (
                <Link
                  href={`/jobs/${notif.job_id}`}
                  className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  title="View job"
                >
                  View job
                </Link>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
