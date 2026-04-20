import { redirect } from "next/navigation";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";
import {
  listInternalNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "@/lib/actions/notification-read-actions";
import { NotificationsPageClient } from "./_components/NotificationsPageClient";

export const metadata = {
  title: "Notifications",
  description: "View and manage notifications",
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    view?: string;
    category?: string;
    state?: string;
  }>;
}) {
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const categoryKey = (() => {
    const rawCategory = String(sp.category ?? sp.view ?? "").trim().toLowerCase();
    if (rawCategory === "contractor_updates") return "contractor_updates" as const;
    if (rawCategory === "new_job_notifications") return "new_job_notifications" as const;
    return null;
  })();
  const onlyUnread = String(sp.state ?? "").trim().toLowerCase() === "unread";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  try {
    await requireInternalUser({ supabase, userId: user.id });
  } catch (error) {
    if (isInternalAccessError(error)) {
      const { data: cu, error: cuErr } = await supabase
        .from("contractor_users")
        .select("contractor_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cuErr) throw cuErr;
      if (cu?.contractor_id) redirect("/portal");
      redirect("/login");
    }
    throw error;
  }

  const notifications = await listInternalNotifications({
    limit: 100,
    onlyUnread,
  });

  return (
    <NotificationsPageClient
      initialNotifications={notifications}
      categoryKey={categoryKey}
      onlyUnread={onlyUnread}
      onMarkAsRead={markNotificationAsRead}
      onMarkAllAsRead={markAllNotificationsAsRead}
    />
  );
}
