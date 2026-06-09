"use client";

import { useActionState } from "react";
import { INITIAL_SELF_SERVE_ONBOARDING_STATE } from "@/lib/actions/self-serve-onboarding-state";
import { submitSelfServeOnboardingForm } from "@/lib/actions/self-serve-onboarding-actions";
import { AuthCommandCenterLayout } from "@/components/auth/AuthCommandCenterLayout";

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
        copy: "Track calls, work orders, and next steps in one place.",
      },
      {
        title: "Keep office and field aligned",
        copy: "Give dispatch and techs a shared view of what needs attention.",
      },
      {
        title: "Follow up without losing track",
        copy: "Keep notes, invoice status, and follow-up easy to find.",
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
        title: "Track ECC jobs to closeout",
        copy: "Keep job status, tests, corrections, and closeout connected.",
      },
      {
        title: "Coordinate testing work",
        copy: "Help raters, office staff, and contractors stay clear on open work.",
      },
      {
        title: "Keep compliance details clear",
        copy: "Organize pass/fail status, correction notes, and closeout steps.",
      },
    ],
    trialGoal:
      "Your first 14 days: enter a few real ECC jobs, walk through test tracking, and confirm whether the flow fits how your team handles closeout.",
    formIntro:
      "Tell us who should own the account. We'll email a secure setup link so you can finish creating your ECC / Compliance Testing trial.",
  },
};

const SIGNUP_FIELD_CLASS =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-all placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:ring-offset-2 focus:ring-offset-white [&:-webkit-autofill]:[box-shadow:inset_0_0_0_1000px_#ffffff] [&:-webkit-autofill]:[-webkit-text-fill-color:#0f172a] [&:-webkit-autofill]:[caret-color:#0f172a]";

export function SignupContent({ productIntent = "generic" }: SignupContentProps) {
  const copy = SIGNUP_COPY[productIntent] ?? SIGNUP_COPY.generic;
  const previewItems = PRODUCT_PREVIEW_ITEMS[productIntent] ?? PRODUCT_PREVIEW_ITEMS.generic;
  const previewHeading =
    productIntent === "service"
      ? "Service preview"
      : productIntent === "ecc"
        ? "ECC preview"
        : "Success Guide preview";
  const [state, action, isPending] = useActionState(
    submitSelfServeOnboardingForm,
    INITIAL_SELF_SERVE_ONBOARDING_STATE,
  );

  return (
    <AuthCommandCenterLayout
      eyebrow={copy.eyebrow}
      headline={copy.title}
      subhead={copy.intro}
      highlights={copy.cards.map((card) => card.title)}
    >
      <div className="space-y-5">
        <div className="rounded-[28px] border border-white/10 bg-white p-7 shadow-[0_50px_100px_-30px_rgba(2,6,23,0.7)] sm:p-8">
          <div className="flex items-center gap-3">
            <img
              src="/cm-logo.png"
              alt="Compliance Matters logo"
              width={40}
              height={40}
              className="h-10 w-10 rounded-xl border border-slate-200 shadow-sm"
            />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Compliance Matters</p>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">Create your account</h2>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">{copy.formIntro}</p>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 shadow-sm">
            <div className="font-semibold text-slate-900">What happens next</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                "Enter your email",
                "Get your setup link",
                "Try real jobs for 14 days",
              ].map((step, index) => (
                <div key={step} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 text-[11px] text-white">
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
                className={SIGNUP_FIELD_CLASS}
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
                className={SIGNUP_FIELD_CLASS}
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
                className={SIGNUP_FIELD_CLASS}
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
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_40px_-16px_rgba(37,99,235,0.65)] transition-all hover:from-blue-500 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Submitting..." : "Send setup link"}
            </button>
          </form>

          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            You will not need payment details for this step. After setup, you can review account options in your account.
          </p>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-200">{previewHeading}</p>
            {productIntent !== "generic" ? <span className="text-[11px] text-slate-400">Success Guide</span> : null}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 text-sm leading-5 text-slate-200 sm:grid-cols-2">
            {previewItems.map((item) => (
              <div key={item} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                {item}
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs leading-5 text-slate-300">
              {copy.trialGoal}
            </p>
            <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs leading-5 text-slate-300">
              No payment details are needed to get started. You can review billing options after setup.
            </p>
          </div>
        </div>
      </div>
    </AuthCommandCenterLayout>
  );
}
