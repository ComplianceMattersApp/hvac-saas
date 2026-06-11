import Link from "next/link";
import { redirect } from "next/navigation";
import { AppAccessCtaCard } from "@/components/AppAccessCtaCard";
import { resolveDualContextAccess } from "@/lib/auth/dual-context-access";
import {
  loadAppAccessCtaEntitlementSnapshot,
  resolveAppAccessCta,
} from "@/lib/business/app-access-cta";
import { getPlatformBillingAvailability } from "@/lib/business/platform-billing-stripe";
import { createClient } from "@/lib/supabase/server";

export default async function AccessInactivePage() {
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

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-16">
      <div className="mx-auto max-w-xl space-y-4">
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
        <AppAccessCtaCard cta={appAccessCta} />
      </div>
    </main>
  );
}
