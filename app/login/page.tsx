"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { createClient } from "../../lib/supabase/client";
import { resolveDualContextAccess } from "@/lib/auth/dual-context-access";
import { resolvePostLoginDestination } from "@/lib/auth/post-login-destination";
import { AuthCommandCenterLayout } from "@/components/auth/AuthCommandCenterLayout";

const TRIAL_LABEL_CLASSES = {
  terracotta: "text-[#c2622a]",
  stonePill: "rounded-full bg-stone-100 px-2 py-0.5 text-stone-700",
  emerald: "text-emerald-700",
} as const;

const TRIAL_PATHS = [
  {
    slug: "service",
    label: "Service",
    accent: "terracotta",
    cta: "Start Service Trial",
    description: "For HVAC service calls, dispatch, field invoicing, and job closeout.",
    href: "/signup/service",
  },
  {
    slug: "ecc",
    label: "ECC / Compliance",
    accent: "stonePill",
    cta: "Start ECC / Compliance Trial",
    description: "For ECC testing, corrections, contractor handoff, and cert closeout.",
    href: "/signup/ecc",
  },
  {
    slug: "cleaning",
    label: "Cleaning / Janitorial",
    accent: "emerald",
    cta: "Start Cleaning Trial",
    description: "For cleaning jobs, crews, checklists, and recurring service.",
    href: "/signup/cleaning",
  },
] as const;

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

      const access = await resolveDualContextAccess({ supabase, user });
      const destination = resolvePostLoginDestination({ access, nextPath });

      if (destination.kind === "no_access") {
        setErrorMsg(destination.message);
        return;
      }

      window.location.href = destination.path;
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
      eyebrow="Field service management"
      brandName="EveryStep FieldWorks"
      backingLine="by Compliance Matters"
      headline="Every job. Every step. Fully closed."
      brandLine="We missed the details too, so we built something that doesn't."
      subhead="The field service platform built for small HVAC and trades teams. Schedule, dispatch, invoice, and close out jobs — from the office or the driveway."
      highlights={[
        "Send professional invoices from the field in seconds",
        "Know exactly where every job stands, every day",
        "Close out jobs completely — nothing falls through",
        "Built for ECC, HVAC service, and cleaning operations",
      ]}
    >
      <div className="space-y-5">
        <div className="mb-6 px-4 text-center lg:hidden">
          <h1 className="mb-1 text-2xl font-bold text-[#0f1f35]">Every job. Every step. Fully closed.</h1>
          <p className="mb-2 text-sm italic text-stone-500">
            We missed the details too, so we built something that doesn&apos;t.
          </p>
          <p className="text-xs text-stone-400">Field service management for HVAC and trades.</p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-7 shadow-md sm:p-8">
          <div className="flex items-center gap-3">
            <img src="/cm-logo.png" alt="EveryStep FieldWorks" width={44} height={44} className="rounded-xl border border-stone-200 shadow-sm" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-[#0f1f35]">EveryStep FieldWorks</h1>
              <p className="mt-0.5 text-xs font-medium text-stone-500">by Compliance Matters</p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-stone-500">
            Welcome back. Your jobs, schedule, and field team are ready.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-stone-700">Email</label>
              <input
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-[#0f1f35] shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#c2622a]/40"
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
                <label className="text-sm font-medium text-stone-700">Password</label>
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((current) => !current)}
                  className="text-xs font-medium text-stone-500 underline-offset-4 hover:text-stone-700 hover:underline focus:outline-none focus:ring-2 focus:ring-[#c2622a]/40 rounded"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <input
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-[#0f1f35] shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#c2622a]/40"
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
                  className="text-sm text-[#c2622a] underline-offset-4 hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
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
              className="w-full rounded-xl bg-gradient-to-br from-[#c2622a] to-[#d97740] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_40px_-20px_rgba(194,98,42,0.7)] transition-all hover:brightness-105 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[#0f1f35]">New to EveryStep FieldWorks?</p>
              <p className="mt-1 text-xs leading-5 text-stone-500">Start a 30-day guided setup. No payment details needed.</p>
            </div>
            <span className="inline-flex h-fit items-center rounded-full bg-[#c2622a] px-3 py-1 text-xs font-medium text-white">
              Guided trial
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {TRIAL_PATHS.map((path) => (
              <Link
                key={path.slug}
                href={path.href}
                className="group flex min-h-24 flex-col justify-between rounded-xl border border-stone-200 bg-white p-4 text-left transition-all duration-150 hover:border-[#c2622a]/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2622a]/40"
              >
                <span className={`self-start text-[11px] font-semibold uppercase tracking-[0.14em] ${TRIAL_LABEL_CLASSES[path.accent]}`}>
                  {path.label}
                </span>
                <span className="mt-2 text-sm font-bold text-[#0f1f35]">{path.cta}</span>
                <span className="mt-1 text-sm leading-5 text-stone-500">{path.description}</span>
              </Link>
            ))}
          </div>

          <p className="mt-3 text-[11px] leading-5 text-stone-400">
            Trial paths start with a 30-day guided setup and no payment details.
          </p>
        </div>

        <p className="text-xs text-stone-400">
          Already invited by your company? Contact your administrator if you need access.
        </p>
      </div>
    </AuthCommandCenterLayout>
  );
}

