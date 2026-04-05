import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import LogoutButton from "@/components/auth/LogoutButton";
import MobileShellMenu from "@/components/layout/MobileShellMenu";
import UserAccountMenu from "@/components/layout/UserAccountMenu";
import { getInternalUser } from "@/lib/auth/internal-user";
import { getInternalUnreadNotificationCount } from "@/lib/actions/notification-read-actions";
import { createClient } from "@/lib/supabase/server";
import { firstNameFromDisplayName, resolveHumanDisplayName } from "@/lib/utils/identity-display";

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
  const accountFirstName = firstNameFromDisplayName(accountDisplayName, "Account");
  const accountLabel = accountFirstName;
  const unreadNotificationBadgeLabel = unreadNotificationCount > 99 ? "99+" : String(unreadNotificationCount);
  const shellSecondaryLinkClass =
    "inline-flex items-center justify-center rounded-xl border border-slate-300/80 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-[0_10px_18px_-16px_rgba(15,23,42,0.32)] transition-all hover:-translate-y-px hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/70 active:translate-y-0";
  const shellUtilityLinkClass =
    "inline-flex items-center gap-1.5 rounded-xl border border-slate-300/80 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-[0_10px_18px_-16px_rgba(15,23,42,0.3)] transition-all hover:-translate-y-px hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/70 active:translate-y-0";
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
                <div className="mx-auto max-w-7xl">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-3">
                    <Link
                      href={homeHref}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300/80 bg-white shadow-[0_12px_22px_-18px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                    >
                      <Image src="/icon.png" alt="Compliance Matters logo" width={18} height={18} className="rounded-sm" />
                    </Link>
                    <Link
                      href={homeHref}
                      className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                    >
                      <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Compliance Matters</span>
                      <span className="block truncate text-sm font-semibold tracking-[-0.01em] text-slate-950 transition-colors hover:text-slate-700">Operations Software</span>
                    </Link>
                  </div>

                  <div className="flex items-center gap-2">
                    <MobileShellMenu
                      isInternalUser={isInternalUser}
                      isAdmin={isAdmin}
                      unreadNotificationCount={unreadNotificationCount}
                      unreadNotificationBadgeLabel={unreadNotificationBadgeLabel}
                    />
                  </div>
                </div>

                <div className="mt-3 hidden items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.98))] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] sm:flex">
                  <div className="flex flex-wrap items-center gap-1.5">
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
                  <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/88 px-1.5 py-1 shadow-[0_10px_18px_-18px_rgba(15,23,42,0.22)]">
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
                        href="/notes"
                        className={shellUtilityLinkClass}
                      >
                        Notes
                      </Link>
                    )}
                    <UserAccountMenu accountFirstName={accountFirstName} accountLabel={accountLabel} isAdmin={isAdmin} />
                  </div>
                </div>
                </div>
              </header>
            </>
          ) : null}

          {/* Main Content */}
          <main className="flex-1 p-6 pt-16 sm:pt-28 print:p-0">
            {children}
          </main>

        </div>
      </body>
    </html>
  );
}
