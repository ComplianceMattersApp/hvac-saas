import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import LogoutButton from "@/components/auth/LogoutButton";
import { getInternalUser } from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";

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

  let homeHref = "/ops";
  let isContractor = false;

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
    }
  }

  const userMetadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const preferredName = [
    userMetadata.first_name,
    userMetadata.given_name,
    userMetadata.name,
    userMetadata.full_name,
  ]
    .map((v) => String(v ?? "").trim())
    .find(Boolean);
  const accountFirstName = preferredName ? preferredName.split(/\s+/)[0] : "";
  const accountLabel = accountFirstName || "Account";

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
                        <Link
                          href="/calendar"
                          className="block rounded-md px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                        >
                          View Calendar
                        </Link>
                        <Link
                          href="/customers"
                          className="block rounded-md px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                        >
                          Search Customers
                        </Link>
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

                    {/* Desktop-only account dropdown */}
                    <details className="relative shrink-0 hidden sm:block">
                      <summary className="list-none rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 sm:px-4 sm:py-2 sm:text-sm">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-slate-300 bg-slate-50 px-1 text-[10px] font-semibold text-slate-700">
                            {accountFirstName ? accountFirstName.slice(0, 1).toUpperCase() : "A"}
                          </span>
                          {accountLabel}
                        </span>
                      </summary>

                      <div className="absolute right-0 z-50 mt-2 min-w-44 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                        <Link
                          href="/account"
                          className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                        >
                          Profile
                        </Link>
                        <div className="my-1 border-t border-slate-100" />
                        <LogoutButton className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900" />
                      </div>
                    </details>
                  </div>
                </div>

                <div className="mt-3 hidden flex-wrap items-center gap-2 sm:flex">
                    <Link
                      href="/jobs/new"
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 sm:px-4 sm:py-2 sm:text-sm"
                    >
                      + New Job
                    </Link>
                    <Link
                      href="/calendar"
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 sm:px-4 sm:py-2 sm:text-sm"
                    >
                      View Calendar
                    </Link>
                    <Link
                      href="/customers"
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 sm:px-4 sm:py-2 sm:text-sm"
                    >
                      Search Customers
                    </Link>
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
