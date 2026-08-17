import Link from "next/link";
import { redirect } from "next/navigation";

import { isInternalAccessError, requireInternalRole } from "@/lib/auth/internal-user";
import { resolveInternalAccessErrorRedirectPath } from "@/lib/auth/internal-access-redirect";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/request-identity";
import { isSmsSelfServeEnabledForAccountOwner } from "@/lib/communications/sms-self-serve-gate";
import {
  describeProvisioningStep,
  nextProvisioningStep,
  type ProvisioningStep,
} from "@/lib/communications/sms-provisioning-orchestrator";
import {
  advanceSmsProvisioningFromForm,
  resendSmsProvisioningOtpFromForm,
  retrySmsProvisioningStepFromForm,
  startSmsProvisioningFromForm,
} from "@/lib/actions/sms-provisioning-actions";

type SearchParams = Promise<{ notice?: string }>;

const NOTICE: Record<string, { tone: "success" | "warn" | "error"; message: string }> = {
  details_saved: { tone: "success", message: "Business details saved. Review them, then submit." },
  step_advanced: { tone: "success", message: "Step complete." },
  submitted: { tone: "success", message: "Submitted to the carriers. We'll keep checking the status." },
  step_failed: { tone: "error", message: "That step did not complete. See the details below." },
  validation_blocked: {
    tone: "warn",
    message: "Some details did not pass validation. Fix the highlighted fields and try again — nothing was charged.",
  },
  waiting_on_review: {
    tone: "warn",
    message:
      "Nothing to do yet — Twilio is still reviewing the previous submission. We check the status every few minutes; come back and press Continue once it clears.",
  },
  step_in_progress: {
    tone: "warn",
    message: "This step is already running — likely a double-click. Give it a moment, then refresh.",
  },
  path_locked: {
    tone: "error",
    message:
      "The EIN choice can't change once your business profile has been submitted to Twilio — the registration continues on its original path. Contact support if the choice was wrong.",
  },
  ein_required: { tone: "error", message: "Enter your EIN, or choose the no-EIN path." },
  save_failed: { tone: "error", message: "We couldn't save those details. Please try again." },
  registration_missing: { tone: "error", message: "Start by entering your business details." },
  otp_sent: { tone: "success", message: "Verification code resent to the authorized representative's phone." },
  otp_failed: { tone: "error", message: "We couldn't resend the code. Try again shortly." },
  otp_unavailable: { tone: "warn", message: "There's no verification code to resend yet." },
};

const STEP_ORDER: ProvisioningStep[] = [
  "subaccount",
  "number",
  "messaging_service",
  "customer_profile",
  "trust_product",
  "brand",
  "campaign",
];

function bannerClass(tone: "success" | "warn" | "error") {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
}

const labelClass = "block text-xs font-semibold text-slate-900";
const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200";

async function requireAdminOrRedirect() {
  const supabase = await createClient();
  const user = await getRequestUser();
  if (!user) redirect("/login");
  try {
    const authz = await requireInternalRole("admin", { supabase, userId: user.id });
    return { supabase, internalUser: authz.internalUser };
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect(await resolveInternalAccessErrorRedirectPath({ supabase, user, fallbackPath: "/ops" }));
    }
    throw error;
  }
}

export default async function SmsProvisioningPage({ searchParams }: { searchParams?: SearchParams }) {
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const notice = NOTICE[String(sp.notice ?? "").trim()];

  const { internalUser } = await requireAdminOrRedirect();
  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();

  // Not entitled: no surface at all, so there is no path to a Twilio call.
  if (!isSmsSelfServeEnabledForAccountOwner(accountOwnerUserId)) {
    redirect("/ops/admin/communications");
  }

  const admin = createAdminClient();
  const { data: registration } = await admin
    .from("sms_provisioning_registrations")
    .select("*")
    .eq("account_owner_user_id", accountOwnerUserId)
    .is("completed_at", null)
    .maybeSingle();

  const currentStep = registration ? nextProvisioningStep(registration) : null;
  const lastError = (registration?.last_error ?? null) as
    | { step?: string; message?: string; fieldFailures?: Array<{ field: string; reason: string }> }
    | null;
  const submitted = Boolean(registration?.submitted_at);
  const soleProp = String(registration?.registration_path ?? "") === "a2p_sole_prop";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 text-gray-900 sm:p-6">
      <div className="rounded-[24px] border border-slate-200/80 bg-white/90 p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Communications</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-slate-950">Enable texting</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Carriers require every business that sends texts to register its own identity and get a
          phone number of its own. We&rsquo;ll handle the setup — you provide the business details
          they ask for.
        </p>
        <Link
          href="/ops/admin/communications"
          className="mt-3 inline-flex text-sm font-semibold text-blue-700 hover:underline"
        >
          &larr; Back to Communications
        </Link>
      </div>

      {notice ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${bannerClass(notice.tone)}`}>
          {notice.message}
        </div>
      ) : null}

      {/* Failure is a first-class state, not a dead end. */}
      {lastError ? (
        <section className="rounded-[24px] border border-red-200 bg-red-50/70 p-5">
          <h2 className="text-sm font-semibold text-red-950">This needs your attention</h2>
          <p className="mt-1 text-sm leading-6 text-red-900">
            {lastError.message ?? "The last step did not complete."}
          </p>

          {lastError.fieldFailures?.length ? (
            <ul className="mt-3 space-y-1 text-sm text-red-900">
              {lastError.fieldFailures.map((failure) => (
                <li key={failure.field}>
                  <span className="font-semibold">{failure.field}</span>: {failure.reason}
                </li>
              ))}
            </ul>
          ) : null}

          {/* The single most common brand rejection, and the least obvious. */}
          {lastError.step === "brand" ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-white/70 px-3 py-2 text-xs leading-5 text-red-900">
              If your EIN was issued in the last few months, the carriers&rsquo; databases may not
              have it yet — this can take 30 to 90 days from issue. If the EIN is older than that,
              check that the legal business name matches your IRS CP&nbsp;575 or 147c letter
              character for character.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <form action={retrySmsProvisioningStepFromForm}>
              <button
                type="submit"
                className="inline-flex min-h-10 items-center rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Retry this step
              </button>
            </form>
            <a
              href="#business-details"
              className="inline-flex min-h-10 items-center rounded-lg border border-red-300 bg-white px-3.5 py-2 text-sm font-semibold text-red-900 hover:bg-red-100"
            >
              Edit details
            </a>
          </div>
        </section>
      ) : null}

      {/* Per-step progress, in words a business owner can act on. */}
      {registration ? (
        <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Progress</h2>
          <ol className="mt-3 space-y-2">
            {STEP_ORDER.map((step) => {
              const position = STEP_ORDER.indexOf(step);
              const currentPosition = currentStep === "done" ? STEP_ORDER.length : STEP_ORDER.indexOf(currentStep as ProvisioningStep);
              const done = position < currentPosition;
              const active = step === currentStep;
              return (
                <li key={step} className="flex items-start gap-2 text-sm">
                  <span
                    className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                      done
                        ? "bg-emerald-100 text-emerald-800"
                        : active
                          ? "bg-blue-100 text-blue-800"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {done ? "✓" : position + 1}
                  </span>
                  <span className={done ? "text-slate-500" : active ? "font-medium text-slate-900" : "text-slate-500"}>
                    {describeProvisioningStep(step)}
                  </span>
                </li>
              );
            })}
          </ol>

          {submitted ? (
            <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
              Waiting on carrier review. The business registration is usually decided within
              minutes; the message-type registration can take up to about two weeks. You don&rsquo;t
              need to do anything — we check every few minutes and will update this page.
            </p>
          ) : (
            <form action={advanceSmsProvisioningFromForm} className="mt-4">
              <button
                type="submit"
                className="inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {currentStep === "subaccount" ? "Start setup" : "Continue setup"}
              </button>
            </form>
          )}

          {soleProp && registration.brand_registration_sid ? (
            <form action={resendSmsProvisioningOtpFromForm} className="mt-2">
              <button
                type="submit"
                className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
              >
                Resend verification code
              </button>
              <p className="mt-1 text-xs text-slate-500">
                Sole proprietors verify by text. If the code didn&rsquo;t arrive, resend it.
              </p>
            </form>
          ) : null}
        </section>
      ) : null}

      <section id="business-details" className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Business details</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          These go to the mobile carriers exactly as entered.
        </p>

        <form action={startSmsProvisioningFromForm} className="mt-4 space-y-4">
          <fieldset className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <legend className="px-1 text-xs font-semibold text-slate-900">Do you have an EIN?</legend>
            <label className="mt-1 flex items-start gap-2 text-sm text-slate-700">
              <input type="radio" name="has_ein" value="yes" defaultChecked={!soleProp} className="mt-1" />
              <span>
                <span className="font-medium text-slate-900">Yes</span> — my business is registered
                (LLC, corporation, partnership, or non-profit).
              </span>
            </label>
            <label className="mt-2 flex items-start gap-2 text-sm text-slate-700">
              <input type="radio" name="has_ein" value="no" defaultChecked={soleProp} className="mt-1" />
              <span>
                <span className="font-medium text-slate-900">No</span> — I&rsquo;m a sole proprietor
                with no EIN. Lower message limits apply, and we&rsquo;ll verify your phone by text.
              </span>
            </label>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              If your business is a registered LLC or corporation, you must choose Yes — the
              carriers reject registered businesses submitted as sole proprietors.
            </p>
          </fieldset>

          <div>
            <label className={labelClass} htmlFor="legal_business_name">
              Legal business name
            </label>
            <input
              id="legal_business_name"
              name="legal_business_name"
              defaultValue={registration?.legal_business_name ?? ""}
              className={inputClass}
              required
            />
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Enter this exactly as it appears on your IRS CP&nbsp;575 or 147c letter, including
              punctuation and suffixes like LLC or Inc. A mismatch here is the most common reason
              carriers reject a registration.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="ein">EIN</label>
              <input id="ein" name="ein" defaultValue={registration?.ein ?? ""} placeholder="12-3456789" className={inputClass} />
              <p className="mt-1 text-xs text-slate-500">Leave blank if you selected No above.</p>
            </div>
            <div>
              <label className={labelClass} htmlFor="business_type">Business type</label>
              <input id="business_type" name="business_type" defaultValue={registration?.business_type ?? ""} placeholder="Limited Liability Company" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="business_industry">Industry</label>
              <input id="business_industry" name="business_industry" defaultValue={registration?.business_industry ?? ""} placeholder="CONSTRUCTION" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="website_url">Website</label>
              <input id="website_url" name="website_url" defaultValue={registration?.website_url ?? ""} placeholder="https://" className={inputClass} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="address_line1">Business address</label>
              <input id="address_line1" name="address_line1" defaultValue={registration?.address_line1 ?? ""} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="city">City</label>
              <input id="city" name="city" defaultValue={registration?.city ?? ""} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="region">State</label>
              <input id="region" name="region" defaultValue={registration?.region ?? ""} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="postal_code">ZIP</label>
              <input id="postal_code" name="postal_code" defaultValue={registration?.postal_code ?? ""} className={inputClass} />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="text-xs font-semibold text-slate-900">Authorized representative</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              A real person the carriers can contact about this registration.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="rep_first_name">First name</label>
                <input id="rep_first_name" name="rep_first_name" defaultValue={registration?.rep_first_name ?? ""} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="rep_last_name">Last name</label>
                <input id="rep_last_name" name="rep_last_name" defaultValue={registration?.rep_last_name ?? ""} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="rep_email">Email</label>
                <input id="rep_email" name="rep_email" type="email" defaultValue={registration?.rep_email ?? ""} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="rep_phone">Mobile phone</label>
                <input id="rep_phone" name="rep_phone" defaultValue={registration?.rep_phone ?? ""} placeholder="+1 209 555 0100" className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="rep_title">Job title</label>
                <input id="rep_title" name="rep_title" defaultValue={registration?.rep_title ?? ""} placeholder="Owner" className={inputClass} />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex min-h-10 items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {registration ? "Save details" : "Save and continue"}
          </button>
        </form>
      </section>
    </div>
  );
}
