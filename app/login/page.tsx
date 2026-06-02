"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { createClient } from "../../lib/supabase/client";
import { resolveSafeAuthReturnPath } from "@/lib/auth/auth-return-path";

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
    return "/today";
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

async function waitForSessionCommit(supabase: ReturnType<typeof createClient>) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return false;
}

export default function LoginPage() {
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
  const nextPath = searchParams.get("next");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      const signedInSession = signInData?.session ?? null;
      if (signedInSession?.access_token && signedInSession?.refresh_token) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: signedInSession.access_token,
          refresh_token: signedInSession.refresh_token,
        });

        if (setSessionError) {
          setErrorMsg(setSessionError.message || "Session could not be persisted.");
          return;
        }
      }

      await waitForSessionCommit(supabase);

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

      const actorKind = destination === "/portal" ? "contractor" : "internal";
      const resumePath = resolveSafeAuthReturnPath({
        actorKind,
        candidateNext: nextPath,
        fallbackPath: destination,
      });

      window.location.href = resumePath;
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "We could not complete sign-in.");
    } finally {
      setLoading(false);
    }
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
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Run service work, ECC testing, scheduling, and follow-up from one organized place.
          </p>
        </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
          <input
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 transition-all"
            type="email"
            name="email"
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
            name="password"
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

      <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 via-white to-slate-50 p-4 shadow-sm dark:border-gray-800 dark:from-gray-950/70 dark:via-gray-950/55 dark:to-gray-900/30 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">New to Compliance Matters?</p>
            <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-400">
              Start a 14-day guided setup. No payment details needed.
            </p>
          </div>
          <span className="inline-flex h-fit items-center rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-600 shadow-sm dark:border-gray-700 dark:bg-gray-900/80 dark:text-gray-300">
            Guided trial
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            href="/signup/service"
            className="group flex min-h-28 flex-col justify-between rounded-2xl border border-indigo-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(238,242,255,0.98))] p-4 text-left shadow-[0_10px_24px_-20px_rgba(37,99,235,0.45)] transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-[0_14px_28px_-20px_rgba(37,99,235,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 dark:border-indigo-800/70 dark:bg-[linear-gradient(180deg,rgba(30,41,59,0.98),rgba(15,23,42,0.98))]"
          >
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-700 dark:text-indigo-300">
              HVAC Service
            </span>
            <span className="mt-2 text-base font-semibold text-gray-900 dark:text-white">Start HVAC Service Trial</span>
            <span className="mt-1 text-sm leading-5 text-gray-600 dark:text-gray-300">
              For service calls, dispatch, work orders, and follow-up.
            </span>
          </Link>

          <Link
            href="/signup/ecc"
            className="group flex min-h-28 flex-col justify-between rounded-2xl border border-emerald-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(236,253,245,0.98))] p-4 text-left shadow-[0_10px_24px_-20px_rgba(16,185,129,0.45)] transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-[0_14px_28px_-20px_rgba(16,185,129,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 dark:border-emerald-800/70 dark:bg-[linear-gradient(180deg,rgba(16,24,40,0.98),rgba(8,15,28,0.98))]"
          >
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
              ECC / Compliance Testing
            </span>
            <span className="mt-2 text-base font-semibold text-gray-900 dark:text-white">Start ECC / Compliance Testing Trial</span>
            <span className="mt-1 text-sm leading-5 text-gray-600 dark:text-gray-300">
              For ECC jobs, tests, corrections, and compliance closeout.
            </span>
          </Link>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] leading-5 text-gray-500 dark:text-gray-400 sm:grid-cols-2">
          <p>Choose the path that matches how your team works.</p>
          <p>Both start with a 14-day guided setup and no payment details.</p>
        </div>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Already invited by your company? Contact your administrator if you need access.
      </p>
      </div>
    </div>
  );
}

