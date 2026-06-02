import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const notificationsPageClientSource = readFileSync(
  resolve(__dirname, "../../../app/ops/notifications/_components/NotificationsPageClient.tsx"),
  "utf-8",
);

const notificationListClientSource = readFileSync(
  resolve(__dirname, "../../../app/ops/notifications/_components/NotificationListClient.tsx"),
  "utf-8",
);

describe("notifications page cleanup wiring", () => {
  it("does not render the Visible summary card", () => {
    expect(notificationsPageClientSource).not.toContain("Visible");
    expect(notificationsPageClientSource).not.toContain("visibleNotifications.length} total");
  });

  it("does not render duplicate View summary card", () => {
    expect(notificationsPageClientSource).not.toContain("<p className=\"text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600\">View</p>");
    expect(notificationsPageClientSource).not.toContain("All notifications");
  });

  it("keeps unread-focused summary card and helper text", () => {
    expect(notificationsPageClientSource).toContain("Unread");
    expect(notificationsPageClientSource).toContain("{unreadCount}");
    expect(notificationsPageClientSource).toContain("Notifications that still need review.");
  });

  it("keeps filter chips including unread-only", () => {
    expect(notificationsPageClientSource).toContain("buildNotificationsHref({})");
    expect(notificationsPageClientSource).toContain("Contractor updates");
    expect(notificationsPageClientSource).toContain("New job notifications");
    expect(notificationsPageClientSource).toContain("Unread only");
  });

  it("keeps filtered/recent context text instead of lifetime totals", () => {
    expect(notificationsPageClientSource).toContain("Showing recent notifications.");
    expect(notificationsPageClientSource).toContain("Showing filtered notifications.");
    expect(notificationsPageClientSource).toContain("Showing unread notifications.");
    expect(notificationsPageClientSource).not.toContain("total ·");
  });

  it("keeps notification rows and unread mark-read behavior", () => {
    expect(notificationListClientSource).toContain("notifications.length === 0");
    expect(notificationListClientSource).toContain("notif.is_unread");
    expect(notificationListClientSource).toContain("Mark read");
    expect(notificationListClientSource).toContain("onMarkAsRead");
  });
});
