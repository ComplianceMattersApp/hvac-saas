import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Image from "next/image";
import { Bell } from "lucide-react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import MobileShellMenu from "@/components/layout/MobileShellMenu";
import BrowserPushSubscriptionAutoReconciler from "@/components/layout/BrowserPushSubscriptionAutoReconciler";
import HeaderCustomerSearch from "@/components/layout/HeaderCustomerSearch";
import PwaUpdateNotice from "@/components/layout/PwaUpdateNotice";
import ShellCreateMenu, { type ShellCreateItem } from "@/components/layout/ShellCreateMenu";
import ShellMoreMenu, { type ShellMoreItem } from "@/components/layout/ShellMoreMenu";
import ShellNavLink from "@/components/layout/ShellNavLink";
import ShellOpsMenu from "@/components/layout/ShellOpsMenu";
import UserAccountMenu from "@/components/layout/UserAccountMenu";
import { getInternalUnreadNotificationBadgeCount } from "@/lib/actions/notification-read-actions";
import { resolveDualContextAccess } from "@/lib/auth/dual-context-access";
import { resolveProductModeForAccountOwnerId, type ProductMode } from "@/lib/business/product-mode-defaults";
import { isEstimatesEnabled } from "@/lib/estimates/estimate-exposure";
import { isMaintenanceAgreementsEnabled } from "@/lib/maintenance-agreements/agreement-exposure";
import { isPermitWorkflowEnabledForAccountOwner } from "@/lib/permits/permit-workflow-gate";
import { shouldShowPortalMenuItem } from "@/lib/portal/partner-work-access";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { resolveHumanDisplayName } from "@/lib/utils/identity-display";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "EveryStep FieldWorks",
    template: "%s | EveryStep FieldWorks",
  },
  applicationName: "EveryStep FieldWorks",
  description: "EveryStep FieldWorks by Compliance Matters keeps field work, office follow-through, billing, and job history in one place.",
  openGraph: {
    title: "EveryStep FieldWorks",
    description: "Every job. Every step. Fully closed.",
    siteName: "EveryStep FieldWorks",
  },
  twitter: {
    card: "summary",
    title: "EveryStep FieldWorks",
    description: "Every job. Every step. Fully closed.",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "EveryStep FieldWorks",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f1f35",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const access = await resolveDualContextAccess({
    supabase,
    getPortalAdmin: createAdminClient,
  });
  const user = access.user;

  let profileFullName: string | null = null;

  if (user?.id) {
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    profileFullName = profileRow?.full_name ? String(profileRow.full_name).trim() : null;
  }

  let homeHref = "/today";
  let isInternalUser = false;
  let isAdmin = false;
  const estimatesEnabled = isEstimatesEnabled();
  const servicePlansEnabled = isMaintenanceAgreementsEnabled();
  let unreadNotificationCount = 0;
  let productMode: ProductMode = "hybrid";
  const hasExistingPortalAccess = access.hasExistingPortalAccess;
  let permitWorkflowEnabled = false;

  if (access.preferredLandingContext === "portal") {
    homeHref = "/portal";
  } else if (access.hasActiveAppAccess && access.internalUser) {
    homeHref = "/today";
    isInternalUser = true;
    isAdmin = access.internalUser.role === "admin";
    const accountOwnerUserId = String(access.internalUser.accountOwnerUserId ?? "").trim();
    unreadNotificationCount = await getInternalUnreadNotificationBadgeCount({
      supabase,
      accountOwnerUserId,
    });

    permitWorkflowEnabled = isPermitWorkflowEnabledForAccountOwner(accountOwnerUserId);

    productMode = await resolveProductModeForAccountOwnerId({
      supabase,
      accountOwnerUserId,
    });
  }

  const showPortalMenuItem = shouldShowPortalMenuItem({
    hasActiveAppAccess: access.hasActiveAppAccess,
    hasExistingPortalAccess,
  });

  const primaryJobCtaLabel = productMode === "hvac_service" ? "+ New Work Order" : "+ New Job";
  const createMenuItems: ShellCreateItem[] = [];

  if (isInternalUser) {
    createMenuItems.push({
      label: productMode === "hvac_service" ? "New Work Order" : "New Job",
      href: "/jobs/new",
      description: "Start a new job or service visit.",
    });

    if (permitWorkflowEnabled) {
      createMenuItems.push({
        label: "Permit Request",
        href: "/ops?bucket=permits&create=permit_request#permit-request-create",
        description: "Create an internal permit request and return to the permit queue.",
      });
    }
  }

  if (isInternalUser) {
    createMenuItems.push({
      label: "New Customer",
      href: "/customers/new",
      description: "Create a standalone customer record.",
    });
  }

  if (isInternalUser && estimatesEnabled) {
    createMenuItems.push({
      label: "New Estimate",
      href: "/estimates/new",
      description: "Create an active estimate or proposal draft.",
    });
  }

  if (isInternalUser && servicePlansEnabled) {
    createMenuItems.push({
      label: "New Service Plan",
      href: "/service-plans",
      description: "Open Service Plans; plan creation stays customer-scoped.",
    });
  }

  const moreMenuItems: ShellMoreItem[] = [];

  if (isInternalUser) {
    moreMenuItems.push({
      label: "Customers",
      href: "/customers",
    });
  }

  if (isInternalUser && servicePlansEnabled) {
    moreMenuItems.push({
      label: "Service Plans",
      href: "/service-plans",
    });
  }

  if (isInternalUser && estimatesEnabled) {
    moreMenuItems.push({
      label: "Estimates",
      href: "/estimates",
    });
  }

  if (isInternalUser) {
    moreMenuItems.push({
      label: "Reports",
      href: "/reports",
    });

    moreMenuItems.push({
      label: "Time Clock",
      href: "/time-clock",
    });

    moreMenuItems.push({
      label: "Notes",
      href: "/notes",
    });
  }

  const showOperationalNotificationAwareness = !isInternalUser || productMode !== "hvac_service";

  const userMetadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const accountDisplayName = resolveHumanDisplayName({
    profileFullName,
    metadataName: userMetadata.name,
    metadataFullName: userMetadata.full_name,
    metadataFirstName: userMetadata.first_name,
    metadataLastName: userMetadata.last_name,
    metadataGivenName: userMetadata.given_name,
    email: user?.email,
    fallback: "Account",
  });
  const accountLabel = accountDisplayName;
  const unreadNotificationBadgeLabel = unreadNotificationCount > 99 ? "99+" : String(unreadNotificationCount);
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-100`}
      >
        <div className="min-h-screen flex flex-col">

          {user ? (
            <>
              {isInternalUser && user.id && access.internalUser ? (
                <BrowserPushSubscriptionAutoReconciler
                  userId={user.id}
                  accountOwnerUserId={String(access.internalUser.accountOwnerUserId ?? "")}
                />
              ) : null}

              {/* Top Bar */}
              <header className="fixed top-0 inset-x-0 z-50 border-b border-slate-300/80 bg-white/92 px-3 py-2.5 backdrop-blur-md shadow-[0_14px_28px_-24px_rgba(15,23,42,0.4)] sm:px-5 print:hidden">
                <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between gap-3 sm:gap-4">
                  {/* Brand — fixed left */}
                  <div className="shrink-0 flex items-center gap-3">
                    <Link
                      href={homeHref}
                      className="flex h-9 w-9 items-center justify-center rounded-lg transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                    >
                      <Image src="/icon.png" alt="EveryStep FieldWorks logo" width={30} height={30} className="rounded-md shadow-[0_12px_22px_-18px_rgba(15,23,42,0.45)]" />
                    </Link>
                    <Link
                      href={homeHref}
                      className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                    >
                      <span className="block truncate text-sm font-semibold tracking-[-0.01em] text-slate-950 transition-colors hover:text-slate-700">EveryStep FieldWorks</span>
                      <span className="block truncate text-[10px] font-medium text-slate-500">by Compliance Matters</span>
                    </Link>
                  </div>

                  <div className="hidden h-8 w-px shrink-0 bg-slate-200/90 lg:block" />

                  {/* Primary nav — expands between brand and utilities, aligned left */}
                  <div className="hidden min-w-0 flex-1 items-center justify-start gap-3 lg:flex">
                    {isInternalUser ? <ShellCreateMenu items={createMenuItems} /> : null}
                    {isInternalUser ? (
                      <div className="w-[min(24rem,34vw)] min-w-60 max-w-md">
                        <HeaderCustomerSearch />
                      </div>
                    ) : null}
                    <nav aria-label="Primary navigation" className="flex min-w-0 shrink-0 items-center rounded-xl border border-slate-200/90 bg-slate-50/70 p-1 shadow-inner shadow-white">
                      {isInternalUser ? (
                        <ShellNavLink href="/today" exact>Today</ShellNavLink>
                      ) : null}
                      {isInternalUser ? (
                        <ShellOpsMenu />
                      ) : null}
                      {isInternalUser ? (
                        <ShellNavLink href="/calendar">Calendar</ShellNavLink>
                      ) : null}
                      {isInternalUser ? (
                        <ShellNavLink href="/ops/field" exact>
                          My Work
                        </ShellNavLink>
                      ) : null}
                      {showPortalMenuItem ? (
                        <ShellNavLink href="/portal">Compliance Matters Portal</ShellNavLink>
                      ) : null}
                      <ShellMoreMenu items={moreMenuItems} />
                    </nav>
                  </div>

                  {/* Utility links — fixed right */}
                  <div className="hidden shrink-0 items-center gap-2 sm:flex">
                    {isInternalUser && showOperationalNotificationAwareness && (
                      <ShellNavLink href="/ops/notifications" className="relative w-10 px-0" aria-label="Notifications">
                        <Bell className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">Notifications</span>
                        {unreadNotificationCount > 0 ? (
                          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-1 text-[10px] font-semibold text-blue-700 shadow-[0_6px_12px_-10px_rgba(37,99,235,0.42)]">
                            {unreadNotificationBadgeLabel}
                          </span>
                        ) : null}
                      </ShellNavLink>
                    )}
                    <div className="ml-1 border-l border-slate-200/80 pl-2">
                      <UserAccountMenu
                        accountName={accountDisplayName}
                        accountLabel={accountLabel}
                        isAdmin={isAdmin}
                        isInternalUser={isInternalUser}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 lg:hidden">
                    {isInternalUser ? (
                      <Link
                        href="/ops/notifications"
                        aria-label="Notifications"
                        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300/80 bg-white text-slate-700 shadow-[0_10px_18px_-16px_rgba(15,23,42,0.3)] transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                      >
                        <Bell className="h-4 w-4" aria-hidden="true" />
                        {unreadNotificationCount > 0 ? (
                          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-1 text-[10px] font-semibold text-blue-700 shadow-[0_6px_12px_-10px_rgba(37,99,235,0.42)]">
                            {unreadNotificationBadgeLabel}
                          </span>
                        ) : null}
                      </Link>
                    ) : null}
                    <MobileShellMenu
                      isInternalUser={isInternalUser}
                      isAdmin={isAdmin}
                      isEstimatesEnabled={estimatesEnabled}
                      showPermitRequestCreateItem={permitWorkflowEnabled}
                      showOperationalNotificationAwareness={showOperationalNotificationAwareness}
                      hasPortalAccess={showPortalMenuItem}
                      unreadNotificationCount={unreadNotificationCount}
                      unreadNotificationBadgeLabel={unreadNotificationBadgeLabel}
                      primaryJobCtaLabel={primaryJobCtaLabel}
                      servicePlansEnabled={servicePlansEnabled}
                    />
                  </div>
                </div>
              </header>
            </>
          ) : null}

          <PwaUpdateNotice />

          {/* Main Content */}
          <main className="flex-1 p-6 pt-16 sm:pt-20 print:p-0">
            {children}
          </main>

        </div>
      </body>
    </html>
  );
}
