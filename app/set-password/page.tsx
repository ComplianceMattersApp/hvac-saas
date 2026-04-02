"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ensureContractorMembershipFromInvite } from "@/lib/actions/contractor-acceptance-actions";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handoffRedirectAfterPasswordSet(
  supabase: ReturnType<typeof createClient>,
  target: "/portal" | "/ops"
) {
  // After updateUser(), session persistence can lag a moment. Wait briefly so
  // the destination SSR route sees the committed session on first load.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) break;
    await sleep(150);
  }

  window.location.replace(target);
}

export default function SetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function ensureSession() {
      // Invite session hand-off can arrive slightly after initial hydration.
      // Retry getUser briefly before deciding session is missing.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!isMounted) return;

        if (user) {
          setCheckingSession(false);
          return;
        }

        await sleep(250);
      }

      if (!isMounted) return;
      router.replace("/login");
    }

    void ensureSession();

    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!password || !confirmPassword) {
      setErrorMsg("Please enter and confirm your new password.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setLoading(false);
      setErrorMsg(updateError.message || "Failed to update password.");
      return;
    }

    setSuccessMsg("Password updated. Redirecting...");

    // Ensure contractor membership exists (creates it from pending invite if
    // needed) and determine whether to route to /portal or /ops.
    const { isContractor, error: membershipError } = await ensureContractorMembershipFromInvite();

    if (membershipError) {
      setLoading(false);
      setSuccessMsg(null);
      setErrorMsg(
        "Password updated, but we could not finish contractor access setup. Please try again in a moment or contact support.",
      );
      return;
    }

    const target = isContractor ? "/portal" : "/ops";
    await handoffRedirectAfterPasswordSet(supabase, target);
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-md text-sm text-gray-700 dark:text-gray-300">
          Validating invite session...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 shadow-md space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Set Your Password</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Create a password to finish setting up your Compliance Matters account.
          </p>
        </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">New Password</label>
          <input
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 transition-all"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Confirm New Password</label>
          <input
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 transition-all"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        {errorMsg ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">{errorMsg}</div>
        ) : null}
        {successMsg ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">{successMsg}</div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-gray-900 text-white px-4 py-2.5 text-sm font-medium hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? "Saving..." : "Save Password"}
        </button>
      </form>
      </div>
    </div>
  );
}
