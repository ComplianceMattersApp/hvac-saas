"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { createClient } from "../../lib/supabase/client";

async function resolveLoginDestination(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data: contractorUser, error: contractorError } = await supabase
    .from("contractor_users")
    .select("contractor_id, contractors ( lifecycle_state )")
    .eq("user_id", userId)
    .maybeSingle();

  if (contractorError) throw contractorError;

  const contractorLifecycleState = String((contractorUser as any)?.contractors?.lifecycle_state ?? "active")
    .trim()
    .toLowerCase();

  if (contractorUser?.contractor_id && contractorLifecycleState === "active") {
    return "/portal";
  }

  const { data: internalUser, error: internalUserError } = await supabase
    .from("internal_users")
    .select("user_id, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (internalUserError) throw internalUserError;

  if (internalUser?.user_id && internalUser.is_active) {
    return "/ops";
  }

  return null;
}

function resolvePasswordResetRedirect() {
  const configuredAppUrl = String(process.env.NEXT_PUBLIC_APP_URL ?? "").trim();

  if (configuredAppUrl) {
    try {
      const parsed = new URL(configuredAppUrl);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return `${configuredAppUrl.replace(/\/$/, "")}/auth/callback`;
      }
    } catch {
      // Fall back to the active browser origin when the configured URL is invalid.
    }
  }

  return new URL("/auth/callback", window.location.origin).toString();
}

function createPasswordRecoveryClient() {
  return createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const archivedContractorNotice =
    String(searchParams.get("err") ?? "").trim().toLowerCase() === "contractor_archived"
      ? "Contractor portal access has been archived. Contact your administrator for reactivation."
      : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    let user = signInData?.user ?? null;

    if (!user) {
      const {
        data: userData,
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        setErrorMsg(userError.message || "Session could not be confirmed.");
        return;
      }

      user = userData?.user ?? null;
    }

    if (!user) {
      setErrorMsg("Session could not be confirmed.");
      return;
    }

    const destination = await resolveLoginDestination(supabase, user.id);

    if (!destination) {
      setErrorMsg("This account is not configured for portal or internal access.");
      return;
    }

    router.push(destination);
    router.refresh();
  }

  async function onForgotPassword() {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email) {
      setErrorMsg("Enter your email to reset your password.");
      return;
    }

    setResetLoading(true);

    const recoveryClient = createPasswordRecoveryClient();
    const { error } = await recoveryClient.auth.resetPasswordForEmail(email, {
      redirectTo: resolvePasswordResetRedirect(),
    });

    setResetLoading(false);

    if (error) {
      setErrorMsg(error.message || "We could not send a reset link.");
      return;
    }

    setSuccessMsg("If that account exists, we sent a password reset link.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 shadow-md space-y-6">
        <div className="space-y-1">
          <div className="flex justify-center mb-4">
            <img
              src="/cm-logo.png"
              alt="Compliance Matters"
              width={96}
              height={96}
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Log in</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Log into your Compliance Matters account.</p>
        </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
          <input
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 transition-all"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((current) => !current)}
              className="text-xs font-medium text-gray-600 underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-gray-300 dark:text-gray-300 dark:focus:ring-gray-600"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <input
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 transition-all"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onForgotPassword}
              disabled={loading || resetLoading}
              className="text-sm text-gray-600 underline-offset-4 hover:underline dark:text-gray-300 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {resetLoading ? "Sending reset link..." : "Forgot password?"}
            </button>
          </div>
        </div>

        {archivedContractorNotice ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">{archivedContractorNotice}</div>
        ) : null}
        {errorMsg ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">{errorMsg}</div>
        ) : null}
        {successMsg ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">{successMsg}</div>
        ) : null}

        <button
          type="submit"
          disabled={loading || resetLoading}
          className="w-full rounded-lg bg-gray-900 text-white px-4 py-2.5 text-sm font-medium hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        If you don&apos;t have an account, please contact your administrator.
      </p>
      </div>
    </div>
  );
}

