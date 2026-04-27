import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import MobileShellMenu from "@/components/layout/MobileShellMenu";
import UserAccountMenu from "@/components/layout/UserAccountMenu";
import { getInternalUser } from "@/lib/auth/internal-user";
import { getInternalUnreadNotificationCount } from "@/lib/actions/notification-read-actions";
import { createClient } from "@/lib/supabase/server";
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
    default: "Compliance Matters",
    template: "%s | Compliance Matters",
  },
  description: "Compliance Matters ECC & Operations Software",
  manifest: "/manifest.webmanifest",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;

  let profileFullName: string | null = null;

  if (user?.id) {
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    profileFullName = profileRow?.full_name ? String(profileRow.full_name).trim() : null;
  }

  let homeHref = "/ops";
  let isContractor = false;
  let isInternalUser = false;
  let isAdmin = false;
  let unreadNotificationCount = 0;

  if (user) {
    const [{ data: cu }, internalUser] = await Promise.all([
      supabase
        .from("contractor_users")
        .select("contractor_id")
        .eq("user_id", user.id)
        .maybeSingle(),
      getInternalUser({ supabase, userId: user.id }),
    ]);

    if (cu?.contractor_id) {
      homeHref = "/portal";
      isContractor = true;
    } else if (internalUser?.is_active) {
      homeHref = "/ops";
      isInternalUser = true;
      isAdmin = internalUser.role === "admin";
      unreadNotificationCount = await getInternalUnreadNotificationCount();
    }
  }

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
  const shellSecondaryLinkClass =
    "inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/70";
  const shellUtilityLinkClass =
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/70";
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-100`}
      >
        <div className="min-h-screen flex flex-col">

          {user ? (
            <>
              {/* Top Bar */}
              <header className="fixed top-0 inset-x-0 z-50 border-b border-slate-300/80 bg-white/88 px-4 py-3 backdrop-blur-md shadow-[0_14px_28px_-24px_rgba(15,23,42,0.4)] sm:px-6 print:hidden">
                <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between gap-3 sm:gap-4">
                  {/* Brand — fixed left */}
                  <div className="shrink-0 flex items-center gap-3">
                    <Link
                      href={homeHref}
                      className="flex h-9 w-9 items-center justify-center rounded-lg transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                    >
                      <Image src="/icon.png" alt="Compliance Matters logo" width={30} height={30} className="rounded-md shadow-[0_12px_22px_-18px_rgba(15,23,42,0.45)]" />
                    </Link>
                    <Link
                      href={homeHref}
                      className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                    >
                      <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Compliance Matters</span>
                      <span className="block truncate text-sm font-semibold tracking-[-0.01em] text-slate-950 transition-colors hover:text-slate-700">Operations Software</span>
                    </Link>
                  </div>

                  <div className="hidden h-8 w-px shrink-0 bg-slate-200/90 lg:block" />

                  {/* Primary nav — expands between brand and utilities, aligned left */}
                  <div className="hidden flex-1 items-center justify-start gap-3 sm:flex">
                    <Link
                      href="/jobs/new"
                      className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_22px_-18px_rgba(37,99,235,0.58)] transition-all hover:-translate-y-px hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 active:translate-y-0"
                    >
                      + New Job
                    </Link>
                    {isInternalUser ? (
                      <Link
                        href="/calendar"
                        className={shellSecondaryLinkClass}
                      >
                        View Calendar
                      </Link>
                    ) : null}
                    <Link
                      href="/customers"
                      className={shellSecondaryLinkClass}
                    >
                      Search Customers
                    </Link>
                  </div>

                  {/* Utility links — fixed right */}
                  <div className="hidden shrink-0 items-center gap-2 sm:flex">
                    {isInternalUser && (
                      <Link
                        href="/ops/notifications"
                        className={shellUtilityLinkClass}
                      >
                        <span>Notifications</span>
                        {unreadNotificationCount > 0 ? (
                          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-1 text-[10px] font-semibold text-blue-700 shadow-[0_6px_12px_-10px_rgba(37,99,235,0.42)]">
                            {unreadNotificationBadgeLabel}
                          </span>
                        ) : null}
                      </Link>
                    )}
                    {isInternalUser && (
                      <Link
                        href="/ops/field"
                        className={shellUtilityLinkClass}
                      >
                        My Work
                      </Link>
                    )}
                    {isInternalUser && (
                      <Link
                        href="/reports"
                        className={shellUtilityLinkClass}
                      >
                        Reports
                      </Link>
                    )}
                    {isInternalUser && (
                      <Link
                        href="/notes"
                        className={shellUtilityLinkClass}
                      >
                        Notes
                      </Link>
                    )}
                    <div className="ml-1 border-l border-slate-200/80 pl-2">
                      <UserAccountMenu accountName={accountDisplayName} accountLabel={accountLabel} isAdmin={isAdmin} />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:hidden">
                    <MobileShellMenu
                      isInternalUser={isInternalUser}
                      isAdmin={isAdmin}
                      unreadNotificationCount={unreadNotificationCount}
                      unreadNotificationBadgeLabel={unreadNotificationBadgeLabel}
                    />
                  </div>
                </div>
              </header>
            </>
          ) : null}

          {/* Main Content */}
          <main className="flex-1 p-6 pt-16 sm:pt-20 print:p-0">
            {children}
          </main>

        </div>
      </body>
    </html>
  );
}
