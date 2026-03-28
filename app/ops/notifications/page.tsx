import { redirect } from "next/navigation";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";
import {
  listInternalNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "@/lib/actions/notification-read-actions";
import { NotificationListClient } from "./_components/NotificationListClient";

export const metadata = {
  title: "Notifications",
  description: "View and manage notifications",
};

export default async function NotificationsPage() {
  try {
    await requireInternalUser();
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect("/login");
    }
    throw error;
  }

  const notifications = await listInternalNotifications({ limit: 100 });
  const totalCount = notifications.length;
  const unreadCount = notifications.filter(n => n.is_unread).length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white/95 backdrop-blur border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Notifications
              </h1>
              <p className="text-sm text-slate-600">
                Internal event visibility for ops workflow.
              </p>
              <div className="flex items-center gap-2 text-xs">
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                  {totalCount} total
                </span>
                <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 font-medium text-blue-700">
                  {unreadCount} unread
                </span>
              </div>
            </div>

            {/* Mark all as read button */}
            {unreadCount > 0 && (
              <form action={markAllNotificationsAsRead}>
                <button
                  type="submit"
                  className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  Mark all as read
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-7">
        <NotificationListClient
          initialNotifications={notifications}
          onMarkAsRead={markNotificationAsRead}
        />
      </div>
    </div>
  );
}
