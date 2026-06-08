"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { createClient } from "../../lib/supabase/client";
import { resolveSafeAuthReturnPath } from "@/lib/auth/auth-return-path";
import { AuthCommandCenterLayout } from "@/components/auth/AuthCommandCenterLayout";

async function resolveLoginDestination(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data: internalUser, error: internalUserError } = await supabase
    .from("internal_users")
    .select("user_id, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (internalUserError) throw internalUserError;

  if (internalUser?.user_id && internalUser.is_active) {
    return "/today";
  }

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
    <AuthCommandCenterLayout
      eyebrow="Field Operations Desk"
      headline="Run your day, from dispatch to closeout."
      subhead="Compliance Matters brings service calls, dispatch, ECC testing, closeout, and follow-up into a single, organized view — built for teams that live in the field."
      highlights={[
        "Schedule and dispatch from one queue",
        "Track jobs from first call to closeout",
        "Keep field notes and tests connected",
        "See invoices and payments at a glance",
      ]}
    >
      <div className="space-y-5">
        <div className="rounded-[28px] border border-white/10 bg-white p-7 shadow-[0_50px_100px_-30px_rgba(2,6,23,0.7)] sm:p-8">
          <div className="flex items-center gap-3">
            <img src="/cm-logo.png" alt="Compliance Matters" width={44} height={44} className="rounded-xl border border-slate-200 shadow-sm" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Compliance Matters</p>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">Log in</h1>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            Run service work, ECC testing, scheduling, and follow-up from one organized place.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Email</label>
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/70"
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
                <label className="text-sm font-medium text-slate-700">Password</label>
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((current) => !current)}
                  className="text-xs font-medium text-slate-500 underline-offset-4 hover:text-slate-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500/40 rounded"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/70"
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
                  className="text-sm text-slate-500 underline-offset-4 hover:text-slate-700 hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {resetLoading ? "Sending reset link..." : "Forgot password?"}
                </button>
              </div>
            </div>

            {archivedContractorNotice ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{archivedContractorNotice}</div>
            ) : null}
            {errorMsg ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMsg}</div>
            ) : null}
            {successMsg ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMsg}</div>
            ) : null}

            <button
              type="submit"
              disabled={loading || resetLoading}
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_40px_-16px_rgba(37,99,235,0.65)] transition-all hover:from-blue-500 hover:to-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white">New to Compliance Matters?</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">Start a 14-day guided setup. No payment details needed.</p>
            </div>
            <span className="inline-flex h-fit items-center rounded-full border border-blue-400/25 bg-blue-400/10 px-2.5 py-1 text-[11px] font-semibold text-blue-200">
              Guided trial
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              href="/signup/service"
              className="group flex min-h-24 flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-left shadow-sm transition-[transform,border-color,background-color] hover:-translate-y-0.5 hover:border-blue-400/30 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-300">HVAC Service</span>
              <span className="mt-2 text-sm font-semibold text-white">Start HVAC Service Trial</span>
              <span className="mt-1 text-xs leading-5 text-slate-400">For service calls, dispatch, work orders, and follow-up.</span>
            </Link>

            <Link
              href="/signup/ecc"
              className="group flex min-h-24 flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-left shadow-sm transition-[transform,border-color,background-color] hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-300">ECC / Compliance</span>
              <span className="mt-2 text-sm font-semibold text-white">Start ECC / Compliance Trial</span>
              <span className="mt-1 text-xs leading-5 text-slate-400">For ECC jobs, tests, corrections, and closeout.</span>
            </Link>
          </div>

          <p className="mt-3 text-[11px] leading-5 text-slate-500">
            Both paths start with a 14-day guided setup and no payment details.
          </p>
        </div>

        <p className="text-xs text-slate-500">
          Already invited by your company? Contact your administrator if you need access.
        </p>
      </div>
    </AuthCommandCenterLayout>
  );
}

