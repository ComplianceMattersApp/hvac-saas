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
  const unreadCount = notifications.filter(n => n.is_unread).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Notifications
              </h1>
              {unreadCount > 0 && (
                <p className="text-sm text-gray-600 mt-1">
                  {unreadCount} unread
                </p>
              )}
            </div>

            {/* Mark all as read button */}
            {unreadCount > 0 && (
              <form action={markAllNotificationsAsRead}>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition"
                >
                  Mark all as read
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <NotificationListClient
          initialNotifications={notifications}
          onMarkAsRead={markNotificationAsRead}
        />
      </div>
    </div>
  );
}
