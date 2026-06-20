"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isSessionInvalidError } from "@/lib/auth/session-error";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const sessionInvalid = isSessionInvalidError(error);

  useEffect(() => {
    if (!sessionInvalid) return;

    const next = pathname || "/";
    window.location.href = `/login?next=${encodeURIComponent(next)}`;
  }, [sessionInvalid, pathname]);

  if (sessionInvalid) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-slate-700 shadow-[0_14px_34px_-30px_rgba(15,23,42,0.22)]">
          <h2 className="text-lg font-semibold text-slate-900">Your session has expired.</h2>
          <p className="mt-2 text-sm">Redirecting you to log in again...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900 shadow-[0_14px_34px_-30px_rgba(15,23,42,0.22)]">
        <h2 className="text-lg font-semibold">Something went wrong.</h2>
        <p className="mt-2 text-sm">
          We hit an unexpected error loading this page. Please try again, or head back home if it keeps happening.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium hover:bg-amber-100"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium hover:bg-amber-100"
          >
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
