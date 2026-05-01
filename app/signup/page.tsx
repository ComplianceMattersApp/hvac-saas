"use client";

import { useActionState } from "react";
import { INITIAL_SELF_SERVE_ONBOARDING_STATE } from "@/lib/actions/self-serve-onboarding-state";
import {
  submitSelfServeOnboardingForm,
} from "@/lib/actions/self-serve-onboarding-actions";

export default function SignupPage() {
  const [state, action, isPending] = useActionState(
    submitSelfServeOnboardingForm,
    INITIAL_SELF_SERVE_ONBOARDING_STATE,
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-10 text-slate-100 sm:px-6 sm:py-14 lg:py-18">
      <div className="pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full bg-cyan-500/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" />

      <div className="relative mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
        <section className="rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 shadow-2xl shadow-black/25 backdrop-blur sm:p-8 lg:p-10">
          <div className="mb-4 flex items-center gap-3">
            <img
              src="/cm-logo.png"
              alt="Compliance Matters logo"
              width={40}
              height={40}
              className="h-10 w-10 rounded-lg border border-slate-700/80 bg-slate-950/70 p-1"
            />
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-slate-300 uppercase">Compliance Matters</p>
              <p className="text-xs text-slate-400">Operations onboarding</p>
            </div>
          </div>

          <p className="inline-flex rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1 text-xs font-medium tracking-[0.14em] text-cyan-200 uppercase">
            Compliance Matters Onboarding
          </p>

          <h1 className="mt-5 font-serif text-3xl leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
            Create Your Company Account
          </h1>

          <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-200 sm:text-base">
            Set up the workspace your team will use to manage jobs, scheduling, compliance work, and service follow-up in one place.
          </p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-200 sm:text-base">
            We&apos;ll send a secure setup link so you can finish creating your account.
          </p>

          <div className="mt-7 grid gap-3 text-sm text-slate-200 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-3">
              Track jobs and follow-up
            </div>
            <div className="rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-3">
              Coordinate scheduling
            </div>
            <div className="rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-3">
              Keep compliance work organized
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
            No payment details are needed to get started. You can review account and billing options after setup.
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-white p-6 text-slate-900 shadow-2xl shadow-black/30 sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Create your account</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Share a few details below. We&apos;ll email you a secure link to finish setting up your company workspace.
          </p>

          <form action={action} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-slate-700">
                Owner email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              {state.fieldErrors?.email ? (
                <p className="text-xs text-red-700">{state.fieldErrors.email}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="owner_display_name" className="text-sm font-medium text-slate-700">
                Owner display name
              </label>
              <input
                id="owner_display_name"
                name="owner_display_name"
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              {state.fieldErrors?.ownerDisplayName ? (
                <p className="text-xs text-red-700">{state.fieldErrors.ownerDisplayName}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="business_display_name" className="text-sm font-medium text-slate-700">
                Business display name
              </label>
              <input
                id="business_display_name"
                name="business_display_name"
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              {state.fieldErrors?.businessDisplayName ? (
                <p className="text-xs text-red-700">{state.fieldErrors.businessDisplayName}</p>
              ) : null}
            </div>

            {state.message ? (
              <div
                className={
                  state.status === "error"
                    ? "rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                    : state.status === "invalid"
                      ? "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                      : "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
                }
              >
                {state.message}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Submitting..." : "Send setup link"}
            </button>
          </form>

          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            You will not need payment details for this step. After setup, you can review account options from your workspace.
          </p>
        </section>
      </div>
    </div>
  );
}
