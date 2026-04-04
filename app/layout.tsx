import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import LogoutButton from "@/components/auth/LogoutButton";
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

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-100`}
      >
        <div className="min-h-screen flex flex-col">

          {user ? (
            <>
              {/* Top Bar */}
              <header className="fixed top-0 inset-x-0 z-50 border-b bg-white px-4 py-3 sm:px-6 print:hidden">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-2.5">
                    <Link
                      href={homeHref}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                    >
                      <Image src="/icon.png" alt="Compliance Matters logo" width={18} height={18} className="rounded-sm" />
                    </Link>
                    <Link
                      href={homeHref}
                      className="truncate text-sm font-semibold text-slate-900 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                    >
                      Compliance Matters
                    </Link>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Mobile-only action menu */}
                    <details className="relative shrink-0 sm:hidden">
                      <summary className="list-none rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
                        ⋮ Menu
                      </summary>
                      <div className="absolute right-12 z-50 mt-2 w-48 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                        <Link
                          href="/jobs/new"
                          className="block rounded-md px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50"
                        >
                          + New Job
                        </Link>
                        {isInternalUser ? (
                          <Link
                            href="/calendar"
                            className="block rounded-md px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            View Calendar
                          </Link>
                        ) : null}
                        <Link
                          href="/customers"
                          className="block rounded-md px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                        >
                          Search Customers
                        </Link>
                        {isInternalUser && (
                          <Link
                            href="/ops/notifications"
                            className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            <span>Notifications</span>
                            {unreadNotificationCount > 0 ? (
                              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-1.5 text-[11px] font-semibold text-blue-700">
                                  {unreadNotificationBadgeLabel}
                              </span>
                            ) : null}
                          </Link>
                        )}
                        {isInternalUser && (
                          <Link
                            href="/ops/field"
                            className="block rounded-md px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            My Work
                          </Link>
                        )}
                        {isAdmin && (
                          <Link
                            href="/ops/admin"
                            className="block rounded-md px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            Admin
                          </Link>
                        )}
                        {isInternalUser && (
                          <Link
                            href="/notes"
                            className="block rounded-md px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            Notes
                          </Link>
                        )}
                        <div className="my-1 border-t border-slate-100" />
                        <Link
                          href="/account"
                          className="block rounded-md px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                        >
                          Profile
                        </Link>
                        <LogoutButton className="w-full rounded-md px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900" />
                      </div>
                    </details>
                  </div>
                </div>

                <div className="mt-3 hidden items-center justify-between gap-4 sm:flex">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href="/jobs/new"
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 sm:px-4 sm:py-2 sm:text-sm"
                    >
                      + New Job
                    </Link>
                    {isInternalUser ? (
                      <Link
                        href="/calendar"
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 sm:px-4 sm:py-2 sm:text-sm"
                      >
                        View Calendar
                      </Link>
                    ) : null}
                    <Link
                      href="/customers"
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 sm:px-4 sm:py-2 sm:text-sm"
                    >
                      Search Customers
                    </Link>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-l border-slate-200 pl-4">
                    {isInternalUser && (
                      <Link
                        href="/ops/notifications"
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                      >
                        <span>Notifications</span>
                        {unreadNotificationCount > 0 ? (
                          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-1 text-[10px] font-semibold text-blue-700">
                            {unreadNotificationBadgeLabel}
                          </span>
                        ) : null}
                      </Link>
                    )}
                    {isInternalUser && (
                      <Link
                        href="/ops/field"
                        className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                      >
                        My Work
                      </Link>
                    )}
                    {isInternalUser && (
                      <Link
                        href="/notes"
                        className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                      >
                        Notes
                      </Link>
                    )}
                    <UserAccountMenu accountFirstName={accountFirstName} accountLabel={accountLabel} isAdmin={isAdmin} />
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
