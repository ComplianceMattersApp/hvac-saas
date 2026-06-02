import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  refreshTenantStripeConnectReadinessFromForm,
  saveInvoiceModeFromForm,
  saveInternalBusinessProfileFromForm,
  startTenantStripeConnectOnboardingFromForm,
} from "@/lib/actions/internal-business-profile-actions";
import {
  archiveAuthorizedEccRaterFromForm,
  createConnectedAccountAuthorizedEccRaterFromForm,
  createAuthorizedEccRaterFromForm,
  setAuthorizedEccRaterDefaultFromForm,
} from "@/lib/actions/authorized-handoff-recipient-actions";
import {
  approveAccountHandoffConnectionFromForm,
  declineAccountHandoffConnectionFromForm,
  requestAccountHandoffConnectionFromForm,
  revokeAccountHandoffConnectionFromForm,
} from "@/lib/workflows/account-handoff-connections-actions";
import { resolveAccountReadiness } from "@/lib/business/account-readiness";
import {
  DEFAULT_BILLING_MODE,
  getInternalBusinessProfileByAccountOwnerId,
  resolveInternalBusinessProfileLogoUrl,
} from "@/lib/business/internal-business-profile";
import { resolveAccountEntitlement, type AccountEntitlementContext } from "@/lib/business/platform-entitlement";
import {
  formatSeatAuditSeatLimitLabel,
  resolvePlatformSeatAuditPreviewCounts,
} from "@/lib/business/platform-seat-audit-preview";
import { getPlatformBillingAvailability } from "@/lib/business/platform-billing-stripe";
import {
  isInternalAccessError,
  requireInternalRole,
} from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";
import { resolveTenantStripeConnectReadiness } from "@/lib/business/tenant-stripe-connect-readiness";
import {
  resolveActiveAuthorizedHandoffRecipientSelection,
  type AuthorizedHandoffRecipientRow,
} from "@/lib/workflows/authorized-handoff-recipients-read";
import {
  listActiveRecipientConnectionsForAccount,
  listAccountHandoffConnectionsForAccount,
  type AccountHandoffConnectionRow,
} from "@/lib/workflows/account-handoff-connections-read";

type SearchParams = Promise<{ notice?: string }>;

const NOTICE_TEXT: Record<string, { tone: "success" | "warn" | "error"; message: string }> = {
  saved: { tone: "success", message: "Your company details have been saved." },
  display_name_required: { tone: "error", message: "Enter your company name before saving." },
  invalid_support_email: { tone: "error", message: "Enter a valid support email, or leave it blank." },
  invalid_logo_file: { tone: "error", message: "Upload an image file for your logo." },
  logo_too_large: { tone: "error", message: "Logo files must be 5 MB or smaller." },
  save_failed: { tone: "error", message: "We couldn't save your company details. Please try again." },
  invoice_settings_saved: { tone: "success", message: "Invoice settings were saved." },
  stripe_connect_status_refreshed: { tone: "success", message: "Stripe payment readiness was refreshed." },
  stripe_connect_onboarding_returned: {
    tone: "warn",
    message: "Returned from Stripe setup. Refresh Stripe status to see current readiness.",
  },
  stripe_connect_onboarding_refresh: {
    tone: "warn",
    message: "Stripe setup was not completed. Continue setup when ready.",
  },
  stripe_connect_onboarding_failed: {
    tone: "error",
    message: "We couldn't start Stripe setup. Please try again.",
  },
  stripe_connect_status_refresh_failed: {
    tone: "warn",
    message: "We couldn't refresh the latest Stripe status just now. The last saved setup state is shown below.",
  },
  stripe_connect_status_refresh_failed_ready: {
    tone: "warn",
    message: "Stripe is connected. We couldn't refresh the latest status just now.",
  },
  stripe_connect_status_refresh_failed_unready: {
    tone: "warn",
    message: "We couldn't refresh the latest Stripe status just now. The last saved setup state is shown below.",
  },
  authorized_ecc_rater_saved: {
    tone: "success",
    message: "Authorized ECC rater saved.",
  },
  authorized_ecc_rater_display_name_required: {
    tone: "error",
    message: "Display name is required for an authorized ECC rater.",
  },
  authorized_ecc_rater_save_failed: {
    tone: "error",
    message: "Could not save authorized ECC rater. Please try again.",
  },
  authorized_ecc_rater_default_saved: {
    tone: "success",
    message: "Default authorized ECC rater updated.",
  },
  authorized_ecc_rater_default_failed: {
    tone: "error",
    message: "Could not set default authorized ECC rater.",
  },
  authorized_ecc_rater_archived: {
    tone: "success",
    message: "Authorized ECC rater archived.",
  },
  authorized_ecc_rater_archive_failed: {
    tone: "error",
    message: "Could not archive authorized ECC rater.",
  },
  connected_rater_added: {
    tone: "success",
    message: "Connected account rater added.",
  },
  connected_rater_exists: {
    tone: "warn",
    message: "Connected account rater is already configured.",
  },
  connected_rater_error: {
    tone: "error",
    message: "Could not add connected account rater.",
  },
  connection_requested: {
    tone: "success",
    message: "Connected handoff account request submitted.",
  },
  connection_approved: {
    tone: "success",
    message: "Connected handoff account request approved.",
  },
  connection_declined: {
    tone: "warn",
    message: "Connected handoff account request declined.",
  },
  connection_revoked: {
    tone: "warn",
    message: "Connected handoff account connection revoked.",
  },
  connection_error: {
    tone: "error",
    message: "Could not update connected handoff account settings. Please try again.",
  },
};

function bannerClass(tone: "success" | "warn" | "error") {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
}

async function requireAdminOrRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  try {
    const authz = await requireInternalRole("admin", { supabase, userId: user.id });
    return { supabase, userId: user.id, internalUser: authz.internalUser };
  } catch (error) {
    if (isInternalAccessError(error)) {
      const { data: cu, error: cuErr } = await supabase
        .from("contractor_users")
        .select("contractor_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cuErr) throw cuErr;
      if (cu?.contractor_id) redirect("/portal");
      redirect("/ops");
    }

    throw error;
  }
}

export default async function AdminCompanyProfilePage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const notice = NOTICE_TEXT[String(sp.notice ?? "").trim().toLowerCase()];

  const { supabase, internalUser } = await requireAdminOrRedirect();
  const [
    profile,
    entitlement,
    seatAuditPreview,
    authorizedEccSelection,
    accountHandoffConnections,
    activeConnectedRecipientConnections,
  ] = await Promise.all([
    getInternalBusinessProfileByAccountOwnerId({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
    }),
    resolveAccountEntitlement(internalUser.account_owner_user_id, supabase),
    resolvePlatformSeatAuditPreviewCounts({
      accountOwnerUserId: internalUser.account_owner_user_id,
      supabase,
    }),
    resolveActiveAuthorizedHandoffRecipientSelection({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      handoffKind: "ecc",
    }),
    listAccountHandoffConnectionsForAccount(
      supabase,
      internalUser.account_owner_user_id,
      {
        handoffKind: "ecc",
        limit: 200,
      },
    ),
    listActiveRecipientConnectionsForAccount(
      supabase,
      internalUser.account_owner_user_id,
      "ecc",
    ),
  ]);

  const tenantStripeReadiness = await resolveTenantStripeConnectReadiness(
    internalUser.account_owner_user_id,
    supabase,
  );
  const readiness = await resolveAccountReadiness(internalUser.account_owner_user_id, supabase);
  const incompleteRequiredItems = readiness.items.filter((item) => item.status === "incomplete");
  const currentLogoUrl = await resolveInternalBusinessProfileLogoUrl({
    logoUrl: profile?.logo_url ?? null,
  });
  const companyName = String(profile?.display_name ?? "").trim() || "Your Company";
  const supportEmail = String(profile?.support_email ?? "").trim();
  const supportPhone = String(profile?.support_phone ?? "").trim();
  const billingMode = profile?.billing_mode ?? DEFAULT_BILLING_MODE;
  const companyInitial = companyName.charAt(0).toUpperCase() || "C";
  const platformBillingAvailability = getPlatformBillingAvailability();
  const authorizedEccRecipients = authorizedEccSelection.recipients;
  const pendingOutgoingConnections = accountHandoffConnections.filter((connection) =>
    connection.connection_status === "pending"
    && connection.requesting_account_owner_user_id === internalUser.account_owner_user_id,
  );
  const pendingIncomingConnections = accountHandoffConnections.filter((connection) =>
    connection.connection_status === "pending"
    && connection.recipient_account_owner_user_id === internalUser.account_owner_user_id,
  );
  const activeConnections = accountHandoffConnections.filter((connection) =>
    connection.connection_status === "active",
  );
  const historicalConnections = accountHandoffConnections.filter((connection) =>
    connection.connection_status === "declined" || connection.connection_status === "revoked",
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 text-gray-900 sm:p-6">
      <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98)_55%,rgba(236,253,245,0.72))] p-6 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.28)]">
        <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-36 w-36 rounded-full bg-emerald-100/70 blur-3xl" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Admin Center</p>
            <h1 className="text-[2rem] font-semibold tracking-[-0.03em] text-slate-950">Company Profile</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Keep your company name, support details, and logo polished anywhere your team expects to see them.
            </p>
            <div className="inline-flex items-center rounded-full border border-white/80 bg-white/85 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
              Shown in internal views, emails, and support touchpoints
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/ops/admin"
              className="inline-flex items-center rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px]"
            >
              Admin Center
            </Link>
          </div>
        </div>
      </div>

      {notice ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${bannerClass(notice.tone)}`}>
          {notice.message}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold text-slate-900">14-day trial: Day 1 essentials</div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            {readiness.completedRequiredCount} of {readiness.totalRequiredCount} required complete
          </div>
        </div>
        <div className="mt-1 text-sm leading-6 text-slate-600">
          Start with these areas first. Then run one real job end to end.
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Link href="#company-details" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:border-slate-300 hover:bg-slate-50">
            Confirm company details
          </Link>
          <Link href="/ops/admin/internal-users" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:border-slate-300 hover:bg-slate-50">
            Invite your team
          </Link>
          <Link href="#account-billing" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:border-slate-300 hover:bg-slate-50">
            Review trial dates and account billing
          </Link>
          <Link href="#invoice-settings" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:border-slate-300 hover:bg-slate-50">
            Pick your invoice mode
          </Link>
        </div>

        <div className="mt-2 text-xs leading-5 text-slate-500">
          Next: create your first customer, create your first job, schedule/assign it, capture field notes on the job page, then close out and invoice. Authorized ECC raters and connected handoff accounts can wait unless you need them now.
        </div>

        {readiness.isOperationallyReady ? (
          <div className="mt-2 font-medium text-emerald-700">Ready for operations</div>
        ) : (
          <div className="mt-2 space-y-1">
            <div className="font-medium text-amber-700">Needs setup</div>
            {incompleteRequiredItems.map((item) => (
              <div key={item.key} className="flex flex-wrap items-center gap-2 text-slate-700">
                <span>Needs setup confirmation: {item.label}</span>
                {item.href ? (
                  <Link href={item.href} className="text-xs font-semibold text-slate-900 underline-offset-2 hover:underline">
                    Open
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700 shadow-sm">
        <div className="font-semibold text-slate-900">Success Guide</div>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Start with one real job. You can come back to the rest later.
        </p>

        <ol className="mt-3 space-y-1.5 pl-5 text-sm leading-6 text-slate-700">
          <li>Confirm company details</li>
          <li>Invite your team</li>
          <li>Create your first customer</li>
          <li>Create your first job</li>
          <li>Schedule and assign the job</li>
          <li>Have the tech add notes from the field</li>
          <li>Close out the work and handle the invoice</li>
          <li>Use Today/Ops each morning</li>
        </ol>

        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
          <Link href="/customers/new" className="rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-slate-800 hover:bg-slate-100">
            Create first customer
          </Link>
          <Link href="/jobs/new" className="rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-slate-800 hover:bg-slate-100">
            Create first job
          </Link>
          <Link href="/today" className="rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-slate-800 hover:bg-slate-100">
            Open Today/Ops
          </Link>
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs leading-5 text-slate-600">
          <div className="font-semibold text-slate-800">This can wait</div>
          <div className="mt-1">
            Advanced reports, service plans unless you use them now, payment automation, contractor collaboration, and deep settings.
          </div>
        </div>

        <div className="mt-3 text-xs leading-5 text-slate-600">
          {entitlement.entitlementStatus === "trial"
            ? "Use your 14-day trial to prove the daily routine."
            : "Use this guide to train your team or tighten your daily routine."}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_18px_38px_-30px_rgba(15,23,42,0.24)]">
          <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-4">
            <div className="text-sm font-semibold text-slate-950">Brand preview</div>
            <div className="mt-1 text-sm text-slate-600">A quick look at how your company appears today.</div>
          </div>
          <div className="space-y-4 p-5">
            <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,1))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/80 bg-white shadow-[0_12px_24px_-18px_rgba(15,23,42,0.25)]">
                  {currentLogoUrl ? (
                    <img src={currentLogoUrl} alt={`${companyName} logo`} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,rgba(15,23,42,0.06),rgba(15,23,42,0.12))] text-2xl font-semibold text-slate-600">
                      {companyInitial}
                    </div>
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Company</div>
                  <div className="break-words text-xl font-semibold tracking-[-0.02em] text-slate-950">{companyName}</div>
                </div>
              </div>

                {supportEmail || supportPhone ? (
                  <div className="space-y-0.5 border-t border-slate-200/80 pt-3 text-sm leading-6 text-slate-600">
                    {supportEmail ? <div>{supportEmail}</div> : null}
                    {supportPhone ? <div>{supportPhone}</div> : null}
                  </div>
                ) : (
                  <div className="border-t border-slate-200/80 pt-3 text-sm leading-6 text-slate-600">
                    Add support contact details so your team can find the right info faster.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-3 text-sm leading-6 text-slate-600">
              {currentLogoUrl
                ? "Upload a new logo anytime to refresh how your company appears in the app."
                : "Upload a logo to give your workspace a more polished, familiar look."}
            </div>
          </div>
        </div>

        <div id="company-details" className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] scroll-mt-24">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Company details</h2>
            <p className="text-sm leading-6 text-slate-600">
              Keep your company name, support email, phone number, and logo current.
            </p>
          </div>

          <form action={saveInternalBusinessProfileFromForm} className="mt-6 space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-slate-950">Logo</div>
                  <div className="text-sm leading-6 text-slate-600">
                    Upload a clear logo for a more polished experience across the app.
                  </div>
                </div>

                {currentLogoUrl ? (
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" name="remove_logo" value="1" className="h-4 w-4 rounded border-slate-300 text-slate-900" />
                    Remove logo
                  </label>
                ) : null}
              </div>

              <div className="mt-4">
                <input
                  id="logo_file"
                  name="logo_file"
                  type="file"
                  accept="image/*"
                  className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
                />
                <p className="mt-2 text-xs text-slate-500">PNG, JPG, SVG, or WebP. Up to 5 MB.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="display_name" className="text-sm font-medium text-slate-700">
                  Company name
                </label>
                <input
                  id="display_name"
                  name="display_name"
                  defaultValue={profile?.display_name ?? ""}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  placeholder="Compliance Matters"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="support_email" className="text-sm font-medium text-slate-700">
                  Support email
                </label>
                <input
                  id="support_email"
                  name="support_email"
                  type="email"
                  defaultValue={profile?.support_email ?? ""}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  placeholder="support@company.com"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="support_phone" className="text-sm font-medium text-slate-700">
                  Support phone
                </label>
                <input
                  id="support_phone"
                  name="support_phone"
                  defaultValue={profile?.support_phone ?? ""}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  placeholder="(209) 555-1234"
                />
              </div>
            </div>

            <div className="flex items-center justify-end">
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-4.5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_30px_-22px_rgba(15,23,42,0.45)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_22px_34px_-22px_rgba(15,23,42,0.5)] active:translate-y-[0.5px]"
              >
                Save company profile
              </button>
            </div>
          </form>
        </div>
      </div>

      <PlatformAccountSection
        entitlement={entitlement}
        availability={platformBillingAvailability}
        seatAuditPreview={seatAuditPreview}
      />

      <div id="invoice-settings" className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] scroll-mt-24">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Invoice Settings</h2>
          <p className="text-sm leading-6 text-slate-600">
            Choose how your company handles invoices inside Compliance Matters.
          </p>
        </div>

        <form action={saveInvoiceModeFromForm} className="mt-6 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="space-y-1.5">
              <label htmlFor="billing_mode" className="text-sm font-medium text-slate-700">
                Invoice mode
              </label>
              <select
                id="billing_mode"
                name="billing_mode"
                defaultValue={billingMode}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                <option value="external_billing">External billing — lightweight tracking only</option>
                <option value="internal_invoicing">Internal invoicing — create, issue &amp; send invoices</option>
              </select>
            </div>

            <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              <p>
                <span className="font-medium text-slate-800">External billing</span> — use one-click
                &ldquo;Mark invoice sent&rdquo; and &ldquo;Mark complete&rdquo; actions on each job.
                No invoice document is created; this is lightweight close-out tracking only.
              </p>
              <p>
                <span className="font-medium text-slate-800">Internal invoicing</span> — create a full invoice
                directly from the job, add line items from your pricebook, issue it, send it to the customer,
                and optionally record payment received. Use this mode if your company handles billing directly.
              </p>
            </div>

            {billingMode === "external_billing" ? (
              <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2 text-sm leading-6 text-blue-900">
                <span className="font-semibold">HVAC Service company invoicing your own customers?</span>{" "}
                Switch to <span className="font-semibold">Internal invoicing</span> to access the full invoice
                creation and send workflow on each job.
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm leading-6 text-emerald-900">
                Internal invoicing is active. Your team can create, issue, and send invoices from each job.
              </div>
            )}
          </div>

          <div className="flex items-center justify-end">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-4.5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_30px_-22px_rgba(15,23,42,0.45)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_22px_34px_-22px_rgba(15,23,42,0.5)] active:translate-y-[0.5px]"
            >
              Save invoice settings
            </button>
          </div>
        </form>
      </div>

      <div id="authorized-ecc-raters" className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] scroll-mt-24">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Authorized ECC Raters</h2>
          <p className="text-sm leading-6 text-slate-600">
            Set up who can receive ECC handoffs from workflow guidance. If one active rater exists, future workflow handoff can default to that rater. If multiple exist, the user will choose from a dropdown.
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm leading-6 text-slate-700">
          {authorizedEccSelection.mode === "none" ? (
            <span>Workflow handoff will show setup required.</span>
          ) : authorizedEccSelection.mode === "single" ? (
            <span>Workflow handoff will default to this rater.</span>
          ) : (
            <span>Workflow handoff will ask the user to choose a rater.</span>
          )}
        </div>

        <div className="mt-5 space-y-3">
          {authorizedEccRecipients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
              No authorized ECC raters are set up yet.
            </div>
          ) : (
            authorizedEccRecipients.map((recipient) => {
              const details = [
                recipient.external_company_name,
                recipient.external_contact_name,
                recipient.external_email,
                recipient.external_phone,
              ].filter(Boolean);

              return (
                <div key={recipient.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{recipient.display_name}</div>
                      <div className="mt-1 text-xs text-slate-600">{formatAuthorizedRecipientTypeLabel(recipient)}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {recipient.is_default ? (
                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                          Default
                        </span>
                      ) : null}
                      <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                        {recipient.handoff_kind.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {details.length > 0 ? (
                    <div className="mt-2 text-sm text-slate-700">{details.join(" • ")}</div>
                  ) : null}

                  {recipient.notes ? (
                    <div className="mt-2 text-sm text-slate-600">Notes: {recipient.notes}</div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {!recipient.is_default ? (
                      <form action={setAuthorizedEccRaterDefaultFromForm}>
                        <input type="hidden" name="recipient_id" value={recipient.id} />
                        <button
                          type="submit"
                          className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50"
                        >
                          Set as default
                        </button>
                      </form>
                    ) : null}

                    <form action={archiveAuthorizedEccRaterFromForm}>
                      <input type="hidden" name="recipient_id" value={recipient.id} />
                      <button
                        type="submit"
                        className="inline-flex min-h-9 items-center rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                      >
                        Archive
                      </button>
                    </form>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form action={createAuthorizedEccRaterFromForm} className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">Add authorized rater</div>
          <input type="hidden" name="handoff_kind" value="ecc" />
          <input type="hidden" name="recipient_type" value="external_manual" />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="authorized-rater-display-name" className="text-sm font-medium text-slate-700">
                Display name
              </label>
              <input
                id="authorized-rater-display-name"
                name="display_name"
                required
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                placeholder="Central Valley HERS Rater"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="authorized-rater-company" className="text-sm font-medium text-slate-700">
                Company (optional)
              </label>
              <input
                id="authorized-rater-company"
                name="external_company_name"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                placeholder="External Rating Co"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="authorized-rater-contact" className="text-sm font-medium text-slate-700">
                Contact name (optional)
              </label>
              <input
                id="authorized-rater-contact"
                name="external_contact_name"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                placeholder="Jane Rater"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="authorized-rater-email" className="text-sm font-medium text-slate-700">
                Email (optional)
              </label>
              <input
                id="authorized-rater-email"
                name="external_email"
                type="email"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                placeholder="rater@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="authorized-rater-phone" className="text-sm font-medium text-slate-700">
                Phone (optional)
              </label>
              <input
                id="authorized-rater-phone"
                name="external_phone"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                placeholder="(209) 555-0202"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="authorized-rater-notes" className="text-sm font-medium text-slate-700">
                Notes (optional)
              </label>
              <textarea
                id="authorized-rater-notes"
                name="notes"
                rows={2}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                placeholder="Use for workflow ECC handoff and completion coordination"
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="is_default" value="1" className="h-4 w-4 rounded border-slate-300 text-slate-900" />
            Set as default ECC rater
          </label>

          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-2 text-xs leading-5 text-slate-600">
            External/manual raters are fully supported. Connected-account raters are supported through Connected Handoff Accounts.
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex min-h-10 items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-[background-color,box-shadow,transform] hover:bg-slate-800"
            >
              Add authorized rater
            </button>
          </div>
        </form>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">Connected account raters</div>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Active connected accounts can be added as authorized ECC rater routing options. This still does not share jobs, customers, service cases, or payment data.
          </p>

          {activeConnectedRecipientConnections.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-3 py-2 text-sm text-slate-600">
              No active connected handoff accounts yet. <a href="#account-handoff-connections" className="font-semibold text-slate-900 underline-offset-2 hover:underline">Open Connected Handoff Accounts setup</a>.
            </div>
          ) : activeConnectedRecipientConnections.length === 1 ? (
            <form action={createConnectedAccountAuthorizedEccRaterFromForm} className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
              <input type="hidden" name="connection_id" value={activeConnectedRecipientConnections[0].id} />
              <div className="text-sm text-slate-700">
                Add connected account {activeConnectedRecipientConnections[0].recipient_account_owner_user_id.slice(0, 8)} as an authorized ECC rater.
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="is_default" value="1" className="h-4 w-4 rounded border-slate-300 text-slate-900" />
                Set as default ECC rater
              </label>
              <button
                type="submit"
                className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50"
              >
                Add connected account rater
              </button>
            </form>
          ) : (
            <form action={createConnectedAccountAuthorizedEccRaterFromForm} className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
              <div className="space-y-1.5">
                <label htmlFor="connected-rater-connection-id" className="text-sm font-medium text-slate-700">
                  Select active connected account
                </label>
                <select
                  id="connected-rater-connection-id"
                  name="connection_id"
                  required
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                >
                  {activeConnectedRecipientConnections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.recipient_account_owner_user_id}
                    </option>
                  ))}
                </select>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="is_default" value="1" className="h-4 w-4 rounded border-slate-300 text-slate-900" />
                Set as default ECC rater
              </label>
              <button
                type="submit"
                className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50"
              >
                Add connected account rater
              </button>
            </form>
          )}
        </div>
      </div>

      <div id="account-handoff-connections" className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] scroll-mt-24">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Connected Handoff Accounts</h2>
          <p className="text-sm leading-6 text-slate-600">
            Set up trusted company-to-company handoff connections. This only controls whether another account can be approved for future workflow handoffs. It does not share jobs, customers, service cases, or payment data.
          </p>
        </div>

        <form action={requestAccountHandoffConnectionFromForm} className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">Request connection</div>
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-2 text-xs leading-5 text-slate-600">
            Enter the account owner user id for the company you want to connect with. Company lookup/search can come later.
          </div>
          <input type="hidden" name="handoff_kind" value="ecc" />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="connection-recipient-account-owner-id" className="text-sm font-medium text-slate-700">
                Recipient account owner user id
              </label>
              <input
                id="connection-recipient-account-owner-id"
                name="recipient_account_owner_user_id"
                required
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                placeholder="00000000-0000-4000-8000-000000000000"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="connection-request-note" className="text-sm font-medium text-slate-700">
                Note (optional)
              </label>
              <textarea
                id="connection-request-note"
                name="connection_note"
                rows={2}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                placeholder="Requesting trusted handoff connection for ECC workflows"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex min-h-10 items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-[background-color,box-shadow,transform] hover:bg-slate-800"
            >
              Request connection
            </button>
          </div>
        </form>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <ConnectionListSection
            title="Pending outgoing"
            emptyMessage="No pending outgoing connection requests."
            rows={pendingOutgoingConnections}
            currentAccountOwnerUserId={internalUser.account_owner_user_id}
          />

          <ConnectionListSection
            title="Pending incoming"
            emptyMessage="No pending incoming connection requests."
            rows={pendingIncomingConnections}
            currentAccountOwnerUserId={internalUser.account_owner_user_id}
            actionSlot={(connection) => (
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={approveAccountHandoffConnectionFromForm} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="connection_id" value={connection.id} />
                  <input
                    name="connection_note"
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                    placeholder="Optional note"
                  />
                  <button
                    type="submit"
                    className="inline-flex min-h-9 items-center rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
                  >
                    Approve
                  </button>
                </form>

                <form action={declineAccountHandoffConnectionFromForm} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="connection_id" value={connection.id} />
                  <input
                    name="connection_note"
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                    placeholder="Optional note"
                  />
                  <button
                    type="submit"
                    className="inline-flex min-h-9 items-center rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                  >
                    Decline
                  </button>
                </form>
              </div>
            )}
          />

          <ConnectionListSection
            title="Active"
            emptyMessage="No active connected handoff accounts."
            rows={activeConnections}
            currentAccountOwnerUserId={internalUser.account_owner_user_id}
            actionSlot={(connection) => (
              <form action={revokeAccountHandoffConnectionFromForm} className="mt-3 flex flex-wrap items-center gap-2">
                <input type="hidden" name="connection_id" value={connection.id} />
                <input
                  name="connection_note"
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                  placeholder="Optional note"
                />
                <button
                  type="submit"
                  className="inline-flex min-h-9 items-center rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                >
                  Revoke
                </button>
              </form>
            )}
          />

          <ConnectionListSection
            title="Declined / Revoked"
            emptyMessage="No declined or revoked connections."
            rows={historicalConnections}
            currentAccountOwnerUserId={internalUser.account_owner_user_id}
          />
        </div>
      </div>

      <TenantStripePaymentsSection readiness={tenantStripeReadiness} />
    </div>
  );
}

function formatConnectionTimestamp(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return date.toLocaleString();
}

function resolveOtherAccountOwnerUserId(connection: AccountHandoffConnectionRow, currentAccountOwnerUserId: string) {
  if (connection.requesting_account_owner_user_id === currentAccountOwnerUserId) {
    return connection.recipient_account_owner_user_id;
  }

  return connection.requesting_account_owner_user_id;
}

function formatConnectionStatus(value: AccountHandoffConnectionRow["connection_status"]) {
  if (value === "pending") return "Pending";
  if (value === "active") return "Active";
  if (value === "declined") return "Declined";
  return "Revoked";
}

function connectionStatusBadgeClass(value: AccountHandoffConnectionRow["connection_status"]) {
  if (value === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (value === "pending") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-slate-300 bg-slate-100 text-slate-700";
}

function ConnectionListSection(props: {
  title: string;
  emptyMessage: string;
  rows: AccountHandoffConnectionRow[];
  currentAccountOwnerUserId: string;
  actionSlot?: (connection: AccountHandoffConnectionRow) => ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="text-sm font-semibold text-slate-900">{props.title}</div>
      <div className="mt-3 space-y-3">
        {props.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-600">
            {props.emptyMessage}
          </div>
        ) : (
          props.rows.map((connection) => {
            const requestedAt = formatConnectionTimestamp(connection.requested_at);
            const approvedAt = formatConnectionTimestamp(connection.approved_at);
            const declinedAt = formatConnectionTimestamp(connection.declined_at);
            const revokedAt = formatConnectionTimestamp(connection.revoked_at);

            return (
              <div key={connection.id} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{resolveOtherAccountOwnerUserId(connection, props.currentAccountOwnerUserId)}</div>
                    <div className="mt-1 text-xs text-slate-600">Other account owner user id</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${connectionStatusBadgeClass(connection.connection_status)}`}>
                      {formatConnectionStatus(connection.connection_status)}
                    </span>
                    <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {connection.handoff_kind.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="mt-2 space-y-1 text-xs text-slate-600">
                  {requestedAt ? <div>Requested: {requestedAt}</div> : null}
                  {approvedAt ? <div>Approved: {approvedAt}</div> : null}
                  {declinedAt ? <div>Declined: {declinedAt}</div> : null}
                  {revokedAt ? <div>Revoked: {revokedAt}</div> : null}
                </div>

                {connection.connection_note ? (
                  <div className="mt-2 text-sm text-slate-700">Note: {connection.connection_note}</div>
                ) : null}

                {props.actionSlot ? props.actionSlot(connection) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function formatAuthorizedRecipientTypeLabel(recipient: AuthorizedHandoffRecipientRow) {
  const normalizedType = String(recipient.recipient_type ?? "").trim().toLowerCase();
  if (normalizedType === "internal_user") {
    return "Internal user";
  }
  if (normalizedType === "connected_account_future") {
    return "Connected account";
  }
  return "External/manual rater";
}

// ---------------------------------------------------------------------------
// Platform account display (read-only)
// ---------------------------------------------------------------------------

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
};

const STATUS_LABELS: Record<string, string> = {
  trial: "14-day trial",
  active: "Active",
  grace: "Grace period",
  suspended: "Suspended",
  cancelled: "Cancelled",
};

function PlatformAccountSection({
  entitlement,
  availability,
  seatAuditPreview,
}: {
  entitlement: AccountEntitlementContext;
  availability: ReturnType<typeof getPlatformBillingAvailability>;
  seatAuditPreview: Awaited<ReturnType<typeof resolvePlatformSeatAuditPreviewCounts>>;
}) {
  const isInternalComped = entitlement.isInternalComped;
  const planLabel = isInternalComped
    ? "Internal / Comped"
    : PLAN_LABELS[entitlement.planKey] ?? entitlement.planKey;
  const statusLabel = isInternalComped
    ? "Active"
    : STATUS_LABELS[entitlement.entitlementStatus] ?? entitlement.entitlementStatus;
  const seatLimitLabel = formatSeatAuditSeatLimitLabel(entitlement);
  const inactiveUserCountLabel =
    seatAuditPreview.inactiveInternalUserCount == null
      ? "Unavailable"
      : String(seatAuditPreview.inactiveInternalUserCount);
  const externalRecordCountLabel =
    seatAuditPreview.contractorDirectoryCount == null
      ? "Unavailable"
      : String(seatAuditPreview.contractorDirectoryCount);

  const trialEndsLabel =
    entitlement.entitlementStatus === "trial" && entitlement.trialEndsAt
      ? entitlement.trialEndsAt.toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;

  const billingStatusLabel = entitlement.billingSubscriptionStatus
    ? entitlement.billingSubscriptionStatus
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    : "Not connected";

  const billingCustomerLabel = isInternalComped
    ? "Not required"
    : entitlement.billingCustomerLinked
      ? "Linked"
      : "Not linked";

  const subscriptionLabel = isInternalComped
    ? "Not required"
    : entitlement.billingSubscriptionLinked
      ? billingStatusLabel
      : "Not connected";

  const billingPeriodEndLabel = entitlement.billingCurrentPeriodEnd
    ? entitlement.billingCurrentPeriodEnd.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div id="account-billing" className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_18px_38px_-30px_rgba(15,23,42,0.24)] scroll-mt-24">
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-4">
        <div className="text-sm font-semibold text-slate-950">Account &amp; Billing</div>
        <div className="mt-1 text-sm text-slate-600">
          Review your plan and trial dates. Focus first on running work from customer to invoice.
        </div>
        <div className="mt-2 text-xs leading-5 text-slate-500">
          This subscription is for Compliance Matters access. Customer invoice payments are managed
          separately through invoice payment settings.
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-px bg-slate-100/70 sm:grid-cols-3">
        <PlatformAccountField label="Plan" value={planLabel} />
        <PlatformAccountField label="Account status" value={statusLabel} />
        <PlatformAccountField label="Active users" value={String(entitlement.activeSeatCount)} />
        <PlatformAccountField label="Seat limit" value={seatLimitLabel} />
        <PlatformAccountField label="Billing profile" value={billingCustomerLabel} />
        <PlatformAccountField label="Subscription status" value={subscriptionLabel} />
      </dl>
      {billingPeriodEndLabel || trialEndsLabel ? (
        <div className="border-t border-slate-100 bg-white px-5 py-3 text-sm leading-6 text-slate-700">
          {trialEndsLabel ? (
            <div>
              14-day trial ends:{" "}
              <span className="font-medium text-slate-900">{trialEndsLabel}</span>
            </div>
          ) : null}
          {billingPeriodEndLabel ? (
            <div>
              Current period ends:{" "}
              <span className="font-medium text-slate-900">{billingPeriodEndLabel}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {entitlement.billingCancelAtPeriodEnd && !isInternalComped ? (
        <div className="border-t border-amber-100 bg-amber-50/70 px-5 py-3 text-sm leading-6 text-amber-900">
          Subscription is set to cancel at the end of the current billing period.
        </div>
      ) : null}
      <div className="border-t border-slate-100 px-5 py-4">
        {isInternalComped ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
            This internal account is comped and does not require Stripe billing.
          </div>
        ) : availability.checkoutAvailable || availability.portalAvailable ? (
          <div className="flex flex-wrap gap-2">
            <form action="/api/stripe/checkout" method="post">
              <button
                type="submit"
                className="inline-flex min-h-10 items-center rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
              >
                Open billing setup
              </button>
            </form>
            <form action="/api/stripe/portal" method="post">
              <button
                type="submit"
                className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50"
              >
                Manage subscription
              </button>
            </form>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            Platform subscription setup is unavailable until Stripe server configuration is added.
          </div>
        )}
      </div>
      <details className="group border-t border-slate-100 bg-white px-5 py-3">
        <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 transition-colors hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="transition-transform group-open:rotate-90">›</span>
            Billing details (this can wait)
          </span>
        </summary>
        <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
          <div className="text-xs text-slate-500">
            These details are for support review only and do not change billing automatically.
          </div>
          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-100/70 sm:grid-cols-2">
            <PlatformAccountField
              label="Active users counted"
              value={String(entitlement.activeSeatCount)}
            />
            <PlatformAccountField
              label="Inactive users excluded"
              value={inactiveUserCountLabel}
            />
            <PlatformAccountField
              label="External/contractor records excluded"
              value={externalRecordCountLabel}
            />
            <PlatformAccountField
              label="Pending invites"
              value="Not counted yet"
            />
          </dl>
        </div>
      </details>
    </div>
  );
}

function TenantStripePaymentsSection({
  readiness,
}: {
  readiness: Awaited<ReturnType<typeof resolveTenantStripeConnectReadiness>>;
}) {
  const hasConnectedAccountId = Boolean(String(readiness.connectedAccountId ?? "").trim());
  const setupActionLabel = readiness.isReady
    ? "Manage Stripe Account"
    : hasConnectedAccountId
      ? "Continue Stripe Setup"
      : "Connect Stripe Account";

  return (
    <div id="accept-payments" className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_18px_38px_-30px_rgba(15,23,42,0.24)] scroll-mt-24">
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-4">
        <div className="text-sm font-semibold text-slate-950">Tenant customer invoice payments</div>
        <div className="mt-1 text-sm text-slate-600">
          Stripe Connect setup controls online invoice payment readiness for this company. This can wait until you are ready to collect invoice payments online.
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        {readiness.isReady ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm leading-6 text-emerald-900">
            <div className="font-semibold">Online invoice payments ready</div>
            <div>Stripe Connect requirements are complete for direct-charge tenant payments.</div>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm leading-6 text-amber-900">
            <div className="font-semibold">Online invoice payments not ready</div>
            <div>
              Online invoice payments require Stripe Connect setup for this company before payment collection can go live.
            </div>
          </div>
        )}

        <dl className="grid grid-cols-1 gap-px rounded-2xl border border-slate-200 bg-slate-100/70 sm:grid-cols-2 lg:grid-cols-3">
          <PlatformAccountField label="Connected account" value={readiness.connectedAccountId ?? "Not connected"} />
          <PlatformAccountField label="Onboarding status" value={readiness.onboardingStatus} />
          <PlatformAccountField label="Charges enabled" value={readiness.chargesEnabled ? "Yes" : "No"} />
          <PlatformAccountField label="Payouts enabled" value={readiness.payoutsEnabled ? "Yes" : "No"} />
          <PlatformAccountField label="Details submitted" value={readiness.detailsSubmitted ? "Yes" : "No"} />
          <PlatformAccountField label="Disabled reason" value={readiness.disabledReason ?? "-"} />
        </dl>

        <div className="text-xs text-slate-500">
          Last synced: {readiness.lastSyncedAt ? new Date(readiness.lastSyncedAt).toLocaleString() : "Never"}
        </div>

        <div className="flex flex-wrap gap-2">
          <form action={startTenantStripeConnectOnboardingFromForm}>
            <button
              type="submit"
              className="inline-flex min-h-10 items-center rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white transition-[background-color,box-shadow,transform] hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 active:translate-y-[0.5px]"
            >
              {setupActionLabel}
            </button>
          </form>

          <form action={refreshTenantStripeConnectReadinessFromForm}>
            <button
              type="submit"
              className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 transition-[background-color,box-shadow,transform] hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 active:translate-y-[0.5px]"
            >
              Refresh Stripe Status
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-600">
          Customer payment links are available from issued invoice workspaces when Stripe setup is ready.
        </div>
      </div>
    </div>
  );
}

function PlatformAccountField({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-5 py-4">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}