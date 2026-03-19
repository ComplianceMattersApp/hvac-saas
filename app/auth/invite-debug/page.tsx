"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type DebugState = {
  userId: string | null;
  userEmail: string | null;
  hasSession: boolean;
  sessionUserId: string | null;
  authCheckComplete: boolean;
};

export default function InviteDebugPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [debugState, setDebugState] = useState<DebugState>({
    userId: null,
    userEmail: null,
    hasSession: false,
    sessionUserId: null,
    authCheckComplete: false,
  });

  useEffect(() => {
    let isMounted = true;

    async function loadAuthState() {
      const [userResult, sessionResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.getSession(),
      ]);

      if (!isMounted) return;

      const user = userResult.data.user;
      const session = sessionResult.data.session;

      setDebugState({
        userId: user?.id ?? null,
        userEmail: user?.email ?? null,
        hasSession: Boolean(session),
        sessionUserId: session?.user?.id ?? null,
        authCheckComplete: true,
      });
    }

    void loadAuthState();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  const nextTarget = String(searchParams.get("next") ?? "/set-password?mode=invite").trim();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 text-gray-900">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
            Invite Debug
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Invite Onboarding Debug Surface
          </h1>
          <p className="text-sm text-slate-600">
            Temporary instrumentation page for tracing callback hand-off and auth state.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">Route State</h2>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-gray-500">Current pathname</dt>
            <dd className="mt-1 break-all text-gray-900">{pathname}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Middleware allowed route through</dt>
            <dd className="mt-1 text-gray-900">Yes, this page rendered.</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Callback reached</dt>
            <dd className="mt-1 text-gray-900">
              {String(searchParams.get("callback") ?? "0") === "1" ? "Yes" : "Unknown"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Auth completion method</dt>
            <dd className="mt-1 text-gray-900">{searchParams.get("method") ?? "unknown"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium text-gray-500">Intended next target</dt>
            <dd className="mt-1 break-all text-gray-900">{nextTarget}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">Supabase Auth State</h2>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-gray-500">Auth check complete</dt>
            <dd className="mt-1 text-gray-900">{debugState.authCheckComplete ? "Yes" : "Checking..."}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">getSession() returned session</dt>
            <dd className="mt-1 text-gray-900">{debugState.hasSession ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">getSession() user id</dt>
            <dd className="mt-1 break-all text-gray-900">{debugState.sessionUserId ?? "None"}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">getUser() returned user</dt>
            <dd className="mt-1 text-gray-900">{debugState.userId ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">getUser() user id</dt>
            <dd className="mt-1 break-all text-gray-900">{debugState.userId ?? "None"}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">getUser() email</dt>
            <dd className="mt-1 break-all text-gray-900">{debugState.userEmail ?? "None"}</dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={nextTarget}
          className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Continue to Set Password
        </Link>
        <Link
          href="/login"
          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
        >
          Go to Login
        </Link>
      </div>
    </div>
  );
}