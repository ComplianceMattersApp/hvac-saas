"use client";

import { useActionState } from "react";
import { INITIAL_SELF_SERVE_ONBOARDING_STATE } from "@/lib/actions/self-serve-onboarding-state";
import { submitSelfServeOnboardingForm } from "@/lib/actions/self-serve-onboarding-actions";
import { AuthCommandCenterLayout } from "@/components/auth/AuthCommandCenterLayout";

export type SignupProductIntent = "generic" | "service" | "ecc" | "cleaning";

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
  cleaning: [
    "One-off cleaning scheduled",
    "Crew notes captured",
    "Checklist planned",
    "Follow-up tracked",
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
    eyebrow: "Guided setup",
    title: "Every job. Every step. Fully closed.",
    intro:
      "Set up the daily field work, office follow-through, billing, and job history your team already handles in one place.",
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
    trialGoal: "Your first 30 days: try a few real jobs and see how the routine feels for your team.",
    formIntro:
      "Tell us who should own the account. We'll email a secure setup link so you can finish creating your trial.",
  },
  service: {
    eyebrow: "Service Trial",
    title: "Start Your Service Trial",
    intro:
      "Set up the daily work your team already handles: customers, service calls, dispatch, field notes, invoices, and follow-up.",
    details: "We'll send a secure setup link so you can finish creating your Service trial.",
    cards: [
      {
        title: "Keep service calls organized",
        copy: "Track calls, work orders, and next steps in one place.",
      },
      {
        title: "Keep office and field aligned",
        copy: "Give dispatch and field users a shared view of what needs attention.",
      },
      {
        title: "Follow up without losing track",
        copy: "Keep notes, invoice status, and follow-up easy to find.",
      },
    ],
    trialGoal:
      "Your first 30 days: enter a few real customers and service jobs, try the dispatch flow, and see whether it helps your office and field team stay on the same page.",
    formIntro:
      "Tell us who should own the account. We'll email a secure setup link so you can finish creating your Service trial.",
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
      "Your first 30 days: enter a few real ECC jobs, walk through test tracking, and confirm whether the flow fits how your team handles closeout.",
    formIntro:
      "Tell us who should own the account. We'll email a secure setup link so you can finish creating your ECC / Compliance Testing trial.",
  },
  cleaning: {
    eyebrow: "Cleaning / Janitorial Trial",
    title: "Start Your Cleaning / Janitorial Trial",
    intro:
      "Manage one-off cleaning jobs today while preparing for recurring services, crews, checklists, allotted hours, and follow-up.",
    details: "We'll send a secure setup link so you can finish creating your Cleaning / Janitorial trial.",
    cards: [
      {
        title: "Track one-off cleaning jobs",
        copy: "Schedule work, capture notes, and keep follow-up clear.",
      },
      {
        title: "Prepare for crews and recurring service",
        copy: "Start with simple jobs now and grow into repeat service routines.",
      },
      {
        title: "Keep checklist work visible",
        copy: "Organize task expectations and office follow-up without losing context.",
      },
    ],
    trialGoal:
      "Your first 30 days: enter a few real cleaning jobs, schedule the team, and confirm the workflow before expanding into recurring services, crews, and checklists.",
    formIntro:
      "Tell us who should own the account. We'll email a secure setup link so you can finish creating your Cleaning / Janitorial trial.",
  },
};

const SIGNUP_FIELD_CLASS =
  "w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-[#0f1f35] shadow-sm transition-all placeholder:text-stone-400 focus:border-[#c2622a] focus:outline-none focus:ring-2 focus:ring-[#c2622a]/40 focus:ring-offset-2 focus:ring-offset-white [&:-webkit-autofill]:[box-shadow:inset_0_0_0_1000px_#ffffff] [&:-webkit-autofill]:[-webkit-text-fill-color:#0f1f35] [&:-webkit-autofill]:[caret-color:#0f1f35]";

export function SignupContent({ productIntent = "generic" }: SignupContentProps) {
  const copy = SIGNUP_COPY[productIntent] ?? SIGNUP_COPY.generic;
  const previewItems = PRODUCT_PREVIEW_ITEMS[productIntent] ?? PRODUCT_PREVIEW_ITEMS.generic;
  const previewHeading =
    productIntent === "service"
      ? "Service preview"
      : productIntent === "ecc"
        ? "ECC preview"
        : productIntent === "cleaning"
          ? "Cleaning preview"
          : "Success Guide preview";
  const [state, action, isPending] = useActionState(
    submitSelfServeOnboardingForm,
    INITIAL_SELF_SERVE_ONBOARDING_STATE,
  );

  return (
    <AuthCommandCenterLayout
      eyebrow={copy.eyebrow}
      brandName="EveryStep FieldWorks"
      backingLine="by Compliance Matters"
      headline={copy.title}
      subhead={copy.intro}
      highlights={copy.cards.map((card) => card.title)}
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-stone-200 bg-white p-7 shadow-md sm:p-8">
          <div className="flex items-center gap-3">
            <img
              src="/cm-logo.png"
              alt="EveryStep FieldWorks logo"
              width={44}
              height={44}
              className="rounded-xl border border-stone-200 shadow-sm"
            />
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-[#0f1f35]">EveryStep FieldWorks</h2>
              <p className="mt-0.5 text-xs font-medium text-stone-500">by Compliance Matters</p>
            </div>
          </div>
          <div className="mt-4 text-sm font-semibold text-[#0f1f35]">Create your account</div>
          <p className="mt-3 text-sm leading-relaxed text-stone-500">{copy.formIntro}</p>

          <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700 shadow-sm">
            <div className="font-semibold text-[#0f1f35]">What happens next</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                "Enter your email",
                "Get your setup link",
                "Try real jobs for 30 days",
              ].map((step, index) => (
                <div key={step} className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 shadow-sm">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-[#c2622a] to-[#d97740] text-[11px] text-white">
                      {index + 1}
                    </span>
                    Step {index + 1}
                  </div>
                  <div className="mt-1.5 text-sm font-medium text-[#0f1f35]">{step}</div>
                </div>
              ))}
            </div>
          </div>

          <form action={action} className="mt-6 space-y-4">
            {productIntent !== "generic" ? (
              <input type="hidden" name="product_signup_intent" value={productIntent} />
            ) : null}

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-stone-700">
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
              <label htmlFor="owner_display_name" className="text-sm font-medium text-stone-700">
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
              <label htmlFor="business_display_name" className="text-sm font-medium text-stone-700">
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
              className="w-full rounded-xl bg-gradient-to-br from-[#c2622a] to-[#d97740] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_40px_-20px_rgba(194,98,42,0.7)] transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Submitting..." : "Send setup link"}
            </button>
          </form>

          <p className="mt-4 text-xs leading-relaxed text-stone-500">
            You will not need payment details for this step. After setup, you can review account options in your account.
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#c2622a]">{previewHeading}</p>
            {productIntent !== "generic" ? <span className="text-[11px] text-stone-400">Success Guide</span> : null}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 text-sm leading-5 text-[#0f1f35] sm:grid-cols-2">
            {previewItems.map((item) => (
              <div key={item} className="rounded-lg border border-stone-200 bg-white px-3 py-2">
                {item}
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <p className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-xs leading-5 text-stone-600">
              {copy.trialGoal}
            </p>
            <p className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-xs leading-5 text-stone-600">
              No payment details are needed to get started. You can review billing options after setup.
            </p>
          </div>
        </div>
      </div>
    </AuthCommandCenterLayout>
  );
}
