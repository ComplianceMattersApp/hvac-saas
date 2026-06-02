"use client";

import { useActionState } from "react";
import { INITIAL_SELF_SERVE_ONBOARDING_STATE } from "@/lib/actions/self-serve-onboarding-state";
import { submitSelfServeOnboardingForm } from "@/lib/actions/self-serve-onboarding-actions";

export type SignupProductIntent = "generic" | "service" | "ecc";

type SignupContentProps = {
  productIntent?: SignupProductIntent;
};

type SignupBenefitCard = {
  title: string;
  copy: string;
};

const PRODUCT_PREVIEW_ITEMS: Record<SignupProductIntent, string[]> = {
  generic: [
    "Start here",
    "Create first job",
    "Use Today/Ops each morning",
  ],
  service: [
    "Maple Street Install",
    "Tech notes added",
    "Permit pending",
    "Invoice ready",
  ],
  ecc: [
    "Duct test scheduled",
    "Correction needed",
    "Test result tracked",
    "Closeout pending",
  ],
};

const SIGNUP_COPY: Record<
  SignupProductIntent,
  {
    eyebrow: string;
    title: string;
    intro: string;
    details: string;
    cards: SignupBenefitCard[];
    trialGoal: string;
    formIntro: string;
  }
> = {
  generic: {
    eyebrow: "Compliance Matters Onboarding",
    title: "Create Your Company Account",
    intro:
      "Set up the daily work your team already handles in one place.",
    details: "We'll send a secure setup link so you can finish creating your account.",
    cards: [
      {
        title: "Track jobs and follow-up",
        copy: "See what needs attention now and what should be checked later.",
      },
      {
        title: "Coordinate scheduling",
        copy: "Give the office and field team one place to stay aligned.",
      },
      {
        title: "Keep work organized",
        copy: "Keep job notes, status, and next steps easier to find.",
      },
    ],
    trialGoal: "Your first 14 days: try a few real jobs and see how the routine feels for your team.",
    formIntro:
      "Tell us who should own the account. We'll email a secure setup link so you can finish creating your trial.",
  },
  service: {
    eyebrow: "HVAC Service Trial",
    title: "Start Your HVAC Service Trial",
    intro:
      "Set up the daily work your team already handles: customers, service calls, dispatch, field notes, invoices, and follow-up.",
    details: "We'll send a secure setup link so you can finish creating your HVAC Service trial.",
    cards: [
      {
        title: "Keep service calls organized",
        copy: "Track customers, work orders, job status, and next steps.",
      },
      {
        title: "Help dispatch and field staff stay aligned",
        copy: "Give the office and technicians a shared place to see what needs attention.",
      },
      {
        title: "Follow up without losing the thread",
        copy: "Keep invoice status, job notes, and customer follow-up easier to find.",
      },
    ],
    trialGoal:
      "Your first 14 days: enter a few real customers and service jobs, try the dispatch flow, and see whether it helps your office and field team stay on the same page.",
    formIntro:
      "Tell us who should own the account. We'll email a secure setup link so you can finish creating your HVAC Service trial.",
  },
  ecc: {
    eyebrow: "ECC / Compliance Testing Trial",
    title: "Start Your ECC / Compliance Testing Trial",
    intro:
      "Keep ECC jobs, test scheduling, pass/fail results, corrections, contractors, and closeout details in one place.",
    details: "We'll send a secure setup link so you can finish creating your ECC / Compliance Testing trial.",
    cards: [
      {
        title: "Track ECC jobs from start to closeout",
        copy: "See job status, tests, corrections, and closeout work together.",
      },
      {
        title: "Coordinate testing work",
        copy: "Help raters, office staff, and contractors stay clear on what is open.",
      },
      {
        title: "Keep compliance details easier to prove",
        copy: "Organize pass/fail status, correction notes, and closeout steps.",
      },
    ],
    trialGoal:
      "Your first 14 days: enter a few real ECC jobs, walk through test tracking, and confirm whether the flow fits how your team handles closeout.",
    formIntro:
      "Tell us who should own the account. We'll email a secure setup link so you can finish creating your ECC / Compliance Testing trial.",
  },
};

export function SignupContent({ productIntent = "generic" }: SignupContentProps) {
  const copy = SIGNUP_COPY[productIntent] ?? SIGNUP_COPY.generic;
  const previewItems = PRODUCT_PREVIEW_ITEMS[productIntent] ?? PRODUCT_PREVIEW_ITEMS.generic;
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
            {copy.eyebrow}
          </p>

          <h1 className="mt-5 font-serif text-3xl leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
            {copy.title}
          </h1>

          <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-200 sm:text-base">
            {copy.intro}
          </p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-200 sm:text-base">
            {copy.details}
          </p>

          <div className="mt-5 rounded-2xl border border-slate-700/70 bg-slate-900/70 px-4 py-3 text-sm leading-6 text-slate-200">
            {copy.trialGoal}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 text-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">Preview</p>
              {productIntent !== "generic" ? (
                <span className="text-[11px] text-slate-400">Start here</span>
              ) : null}
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 text-sm leading-5 sm:grid-cols-2">
              {previewItems.map((item) => (
                <div key={item} className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2">
                  {item}
                </div>
              ))}
            </div>
            {productIntent !== "generic" ? (
              <p className="mt-2 text-xs leading-5 text-slate-400">Use Today/Ops each morning</p>
            ) : null}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {copy.cards.map((card) => (
              <div key={card.title} className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 text-slate-200 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.6)]">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">Benefit</div>
                <div className="mt-2 text-base font-semibold text-white">{card.title}</div>
                <p className="mt-2 text-sm leading-6 text-slate-200">{card.copy}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
            No payment details are needed to get started. You can review account and billing options after setup.
          </div>

          <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
            Setup is owner-led, so you can ask practical questions about how your company actually works.
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-white p-6 text-slate-900 shadow-2xl shadow-black/30 sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Create your account</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{copy.formIntro}</p>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 shadow-sm">
            <div className="font-semibold text-slate-900">What happens next</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                "Enter your email",
                "Get your setup link",
                "Try real jobs for 14 days",
              ].map((step, index) => (
                <div key={step} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] text-white">
                      {index + 1}
                    </span>
                    Step {index + 1}
                  </div>
                  <div className="mt-1.5 text-sm font-medium text-slate-900">{step}</div>
                </div>
              ))}
            </div>
          </div>

          <form action={action} className="mt-6 space-y-4">
            {productIntent !== "generic" ? (
              <input type="hidden" name="product_signup_intent" value={productIntent} />
            ) : null}

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
            You will not need payment details for this step. After setup, you can review account options in your account.
          </p>
        </section>
      </div>
    </div>
  );
}
