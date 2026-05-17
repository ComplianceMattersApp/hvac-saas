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
import {
  deactivateBrowserPushSubscriptionAction,
  registerBrowserPushSubscriptionAction,
} from "@/lib/actions/push-subscription-actions";
import {
  listCurrentInternalUserPushSubscriptions,
  type PushSubscriptionSafeRow,
} from "@/lib/notifications/push-subscriptions";
import { resolveProductModeForAccountOwnerId, type ProductMode } from "@/lib/business/product-mode-defaults";
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
    if (rawCategory === "new_job_notifications" || rawCategory === "new_jobs") {
      return "new_job_notifications" as const;
    }
    return null;
  })();
  const onlyUnread = String(sp.state ?? "").trim().toLowerCase() === "unread";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  let internalUser;
  try {
    const result = await requireInternalUser({ supabase, userId: user.id });
    internalUser = result.internalUser;
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

  const productMode = await resolveProductModeForAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const notifications = await listInternalNotifications({
    limit: 100,
    onlyUnread,
  });
  let pushSubscriptions: PushSubscriptionSafeRow[] = [];
  try {
    pushSubscriptions = await listCurrentInternalUserPushSubscriptions({ supabase });
  } catch (error) {
    console.warn("[ops/notifications] push subscription hydration skipped", {
      code: String((error as { code?: unknown } | null)?.code ?? ""),
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return (
    <NotificationsPageClient
      initialNotifications={notifications}
      initialPushSubscriptions={pushSubscriptions}
      publicVapidKey={process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY ?? null}
      categoryKey={categoryKey}
      onlyUnread={onlyUnread}
      productMode={productMode}
      onMarkAsRead={markNotificationAsRead}
      onMarkAllAsRead={markAllNotificationsAsRead}
      onRegisterPushSubscription={registerBrowserPushSubscriptionAction}
      onDeactivatePushSubscription={deactivateBrowserPushSubscriptionAction}
    />
  );
}
