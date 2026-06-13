import Link from "next/link";
import { refreshPlatformSubscriptionStatusFromForm } from "@/lib/actions/platform-billing-actions";
import { redirect } from "next/navigation";
import { AppAccessCtaCard } from "@/components/AppAccessCtaCard";
import { resolveDualContextAccess } from "@/lib/auth/dual-context-access";
import {
  loadAppAccessCtaEntitlementSnapshot,
  resolveAppAccessCta,
} from "@/lib/business/app-access-cta";
import { getPlatformBillingAvailability } from "@/lib/business/platform-billing-stripe";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<{ notice?: string }>;

const NOTICE_TEXT: Record<string, { tone: "success" | "warn" | "error"; message: string }> = {
  platform_subscription_refresh_missing_subscription: {
    tone: "warn",
    message: "No platform subscription is linked to this account yet.",
  },
  platform_subscription_refresh_missing_entitlement: {
    tone: "warn",
    message: "No platform entitlement record was found for this account.",
  },
  platform_subscription_refresh_missing_account_owner_user_id: {
    tone: "error",
    message: "We could not identify the account to refresh.",
  },
  platform_subscription_refresh_failed: {
    tone: "error",
    message: "We could not refresh subscription status from Stripe. Please try again.",
  },
  platform_subscription_refresh_incomplete: {
    tone: "warn",
    message: "Stripe still reports this subscription as incomplete.",
  },
  platform_subscription_refresh_incomplete_expired: {
    tone: "warn",
    message: "Stripe reports this subscription as incomplete and expired.",
  },
  platform_subscription_refresh_past_due: {
    tone: "warn",
    message: "Stripe reports this subscription as past due.",
  },
  platform_subscription_refresh_unpaid: {
    tone: "warn",
    message: "Stripe reports this subscription as unpaid.",
  },
  platform_subscription_refresh_canceled: {
    tone: "warn",
    message: "Stripe reports this subscription as canceled.",
  },
  platform_subscription_refresh_paused: {
    tone: "warn",
    message: "Stripe reports this subscription as paused.",
  },
  platform_subscription_refresh_synced_inactive: {
    tone: "warn",
    message: "Subscription status was refreshed, but app access is still inactive.",
  },
};

function noticeClass(tone: "success" | "warn" | "error") {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

export default async function AccessInactivePage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const notice = NOTICE_TEXT[String(sp.notice ?? "").trim().toLowerCase()];
  const supabase = await createClient();
  const access = await resolveDualContextAccess({ supabase });

  if (!access.user) redirect("/login");
  if (access.hasActiveAppAccess) redirect("/today");
  if (access.hasPortalAccess) redirect("/portal");

  const appAccessCtaEntitlement = await loadAppAccessCtaEntitlementSnapshot({
    supabase,
    accountOwnerUserId: access.internalUser?.accountOwnerUserId ?? null,
  });
  const appAccessCta = resolveAppAccessCta({
    access,
    entitlement: appAccessCtaEntitlement,
    billingAvailability: getPlatformBillingAvailability(),
  });
  const canRefreshPlatformSubscription =
    access.internalUser?.isActive === true &&
    access.internalUser.role === "admin" &&
    Boolean(appAccessCtaEntitlement?.billingSubscriptionLinked);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-16">
      <div className="mx-auto max-w-xl space-y-4">
        {notice ? (
          <div className={`rounded-xl border px-4 py-3 text-sm ${noticeClass(notice.tone)}`}>
            {notice.message}
          </div>
        ) : null}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            App access inactive
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-950">
            Your app access is inactive.
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Your full app workspace is not currently active. Contact your account
            administrator or renew app access to continue using operations tools.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to login
            </Link>
          </div>
        </div>
        {canRefreshPlatformSubscription ? (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-950">
                  Billing status may still be syncing
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  If Stripe shows an active Compliance Matters subscription, refresh subscription status from Stripe before starting a new checkout.
                </p>
              </div>
              <form action={refreshPlatformSubscriptionStatusFromForm} className="shrink-0">
                <button
                  type="submit"
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
                >
                  Refresh subscription status
                </button>
              </form>
            </div>
          </section>
        ) : null}
        <AppAccessCtaCard cta={appAccessCta} />
      </div>
    </main>
  );
}
