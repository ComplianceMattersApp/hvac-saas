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
import {
  acceptAccountWorkshareInviteFromForm,
  createAccountWorkshareInviteFromForm,
  disableAccountWorkshareConnectionFromForm,
  revokeAccountWorkshareConnectionFromForm,
} from "@/lib/workflows/account-workshare-connections-actions";
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
import { resolveInternalAccessErrorRedirectPath } from "@/lib/auth/internal-access-redirect";
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
import {
  listAccountWorkshareConnectionsForAccount,
  type AccountWorkshareConnectionRow,
} from "@/lib/workflows/account-workshare-connections-read";

type SearchParams = Promise<{ notice?: string }>;

const NOTICE_TEXT: Record<string, { tone: "success" | "warn" | "error"; message: string }> = {
  saved: { tone: "success", message: "Your company details have been saved." },
  display_name_required: { tone: "error", message: "Enter your company name before saving." },
  invalid_support_email: { tone: "error", message: "Enter a valid support email, or leave it blank." },
  invalid_logo_file: { tone: "error", message: "Upload an image file for your logo." },
  logo_too_large: { tone: "error", message: "Logo files must be 5 MB or smaller." },
  save_failed: { tone: "error", message: "We couldn't save your company details. Please try again." },
  invoice_settings_saved: { tone: "success", message: "Invoice settings were saved." },
  stripe_connect_status_refreshed: { tone: "success", message: "Online payment setup status was refreshed." },
  stripe_connect_onboarding_returned: {
    tone: "warn",
    message: "Returned from online payment setup. Refresh payment status to see the latest readiness.",
  },
  stripe_connect_onboarding_refresh: {
    tone: "warn",
    message: "Online payment setup was not completed. Continue setup when ready.",
  },
  stripe_connect_onboarding_failed: {
    tone: "error",
    message: "We couldn't start online payment setup. Please try again.",
  },
  stripe_connect_status_refresh_failed: {
    tone: "warn",
    message: "We couldn't refresh the latest online payment setup status just now. The last saved setup state is shown below.",
  },
  stripe_connect_status_refresh_failed_ready: {
    tone: "warn",
    message: "Online payments are ready. We couldn't refresh the latest status just now.",
  },
  stripe_connect_status_refresh_failed_unready: {
    tone: "warn",
    message: "We couldn't refresh the latest online payment setup status just now. The last saved setup state is shown below.",
  },
  authorized_ecc_rater_saved: {
    tone: "success",
    message: "Manual ECC rater tracking record saved.",
  },
  authorized_ecc_rater_display_name_required: {
    tone: "error",
    message: "Display name is required for a manual ECC rater tracking record.",
  },
  authorized_ecc_rater_save_failed: {
    tone: "error",
    message: "Could not save manual ECC rater tracking record. Please try again.",
  },
  authorized_ecc_rater_default_saved: {
    tone: "success",
    message: "Default connected ECC rater updated.",
  },
  authorized_ecc_rater_default_failed: {
    tone: "error",
    message: "Could not set default connected ECC rater.",
  },
  authorized_ecc_rater_archived: {
    tone: "success",
    message: "ECC rater archived.",
  },
  authorized_ecc_rater_archive_failed: {
    tone: "error",
    message: "Could not archive authorized ECC rater.",
  },
  connected_rater_added: {
    tone: "success",
    message: "Connected ECC rater added.",
  },
  connected_rater_exists: {
    tone: "warn",
    message: "Connected ECC rater is already configured.",
  },
  connected_rater_error: {
    tone: "error",
    message: "Could not add connected ECC rater.",
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
  workshare_connection_invited: {
    tone: "success",
    message: "ECC/HERS contractor sending connection invite created.",
  },
  workshare_connection_accepted: {
    tone: "success",
    message: "ECC/HERS contractor sending connection invite accepted.",
  },
  workshare_connection_disabled: {
    tone: "warn",
    message: "ECC/HERS contractor sending connection disabled.",
  },
  workshare_connection_revoked: {
    tone: "warn",
    message: "ECC/HERS contractor sending connection revoked.",
  },
  workshare_connection_error: {
    tone: "error",
    message: "Could not update ECC/HERS contractor sending connection.",
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
      redirect(
        await resolveInternalAccessErrorRedirectPath({
          supabase,
          user,
          fallbackPath: "/ops",
        }),
      );
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
    accountWorkshareConnections,
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
    listAccountWorkshareConnectionsForAccount(
      supabase,
      internalUser.account_owner_user_id,
      {
        serviceType: "ecc_hers",
        limit: 200,
      },
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
  const raterLinkId = internalUser.account_owner_user_id;
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
  const workshareAsReceiver = accountWorkshareConnections.filter((connection) =>
    connection.receiver_account_id === internalUser.account_owner_user_id,
  );
  const workshareAsSender = accountWorkshareConnections.filter((connection) =>
    connection.sender_account_id === internalUser.account_owner_user_id,
  );
  const workshareReceiverActive = workshareAsReceiver.filter((connection) =>
    connection.status === "active",
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 text-gray-900 sm:p-6">
      <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98)_55%,rgba(236,253,245,0.56))] p-6 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.28)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Admin Center</p>
            <h1 className="text-[2rem] font-semibold tracking-[-0.03em] text-slate-950">Company Profile</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Manage business identity, account settings, and customer-facing preferences.
            </p>
            <div className="inline-flex items-center rounded-full border border-white/80 bg-white/85 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
              Used on invoices, messages, and team screens
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

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_18px_38px_-30px_rgba(15,23,42,0.24)]">
          <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-4">
            <div className="text-sm font-semibold text-slate-950">Customer-facing identity</div>
            <div className="mt-1 text-sm text-slate-600">Preview the name, logo, and contact info customers see.</div>
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
                    Add business contact info so customers and your team see the right details.
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
              Edit the name, contact info, and logo shown across the app.
            </p>
          </div>

          <form action={saveInternalBusinessProfileFromForm} className="mt-6 space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-slate-950">Logo</div>
                  <div className="text-sm leading-6 text-slate-600">Shown on invoices, messages, and team screens.</div>
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
                  Business email
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
                  Business phone
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {incompleteRequiredItems.length > 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">Setup attention</div>
              <div className="text-xs font-semibold uppercase tracking-wide">
                {readiness.completedRequiredCount} of {readiness.totalRequiredCount} required complete
              </div>
            </div>
            <div className="mt-1 text-sm leading-6 text-amber-900">
              Finish only the items that need attention.
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {incompleteRequiredItems.map((item) => (
                <div key={item.key} className="rounded-lg border border-amber-200 bg-white/80 px-3 py-2 text-sm text-amber-950">
                  <div className="font-medium">
                    {item.key === "billing_mode" ? "Choose how invoices are handled" : `Finish: ${item.label}`}
                  </div>
                  {item.href ? (
                    <Link href={item.href} className="mt-1 inline-flex text-xs font-semibold text-amber-950 underline-offset-2 hover:underline">
                      Open
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
          <div className="font-semibold text-slate-900">First job training</div>
          <p className="mt-1 text-sm leading-5 text-slate-600">
            Open Training Room for the step-by-step first job path.
          </p>
          <Link href="/training" className="mt-3 inline-flex rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100">
            Open Training Room
          </Link>
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
            Choose where your company creates and manages invoices.
          </p>
        </div>

        <form action={saveInvoiceModeFromForm} className="mt-6 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="space-y-1.5">
              <label htmlFor="billing_mode" className="text-sm font-medium text-slate-700">
                Company invoice workflow
              </label>
              <select
                id="billing_mode"
                name="billing_mode"
                defaultValue={billingMode}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                <option value="external_billing">Track billing outside EveryStep FieldWorks</option>
                <option value="internal_invoicing">Use EveryStep FieldWorks invoices</option>
              </select>
            </div>

            <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              <p>
                <span className="font-medium text-slate-800">Track billing outside EveryStep FieldWorks</span>{" "}
                - use EveryStep for job workflow and closeout, while invoices are created in another system such
                as QuickBooks.
              </p>
              <p>
                <span className="font-medium text-slate-800">Use EveryStep FieldWorks invoices</span>{" "}
                - create, send, and track invoices from each job.
              </p>
            </div>

            {billingMode === "external_billing" ? (
              <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2 text-sm leading-6 text-blue-900">
                Billing is managed outside EveryStep FieldWorks. Jobs can still be closed out here while invoices
                are created in another system.
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm leading-6 text-emerald-900">
                EveryStep FieldWorks invoices are active. Online Payments can let customers pay those invoices
                online.
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

      <TenantStripePaymentsSection readiness={tenantStripeReadiness} billingMode={billingMode} />

      <div id="authorized-ecc-raters" className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] scroll-mt-24">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Default ECC/HERS Rater Details</h2>
          <p className="text-sm leading-6 text-slate-600">
            Optional rater contact details used for coordination. This does not create an account-to-account connection.
          </p>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-5 text-slate-700">
          <div className="font-semibold text-slate-900">
            {authorizedEccRecipients.length === 0
              ? "No default ECC/HERS rater details yet"
              : authorizedEccRecipients.length === 1
                ? "1 ECC/HERS rater detail record available"
                : `${authorizedEccRecipients.length} ECC/HERS rater detail records available`}
          </div>
          <div className="mt-1 text-slate-600">
            {authorizedEccSelection.mode === "none"
              ? "Add these details only when your team needs a default rater reference."
              : authorizedEccSelection.mode === "single"
                ? "This rater detail record is selected as the default."
                : "Your team can choose among these rater detail records."}
          </div>
        </div>

        <details className="group mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 transition-colors hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="transition-transform group-open:rotate-90">&gt;</span>
              Advanced ECC/HERS rater details
            </span>
          </summary>
          <div className="mt-4 space-y-5">
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
          <div className="text-sm font-semibold text-emerald-950">My ECC/HERS handoff ID</div>
          <p className="mt-1 text-sm leading-6 text-emerald-900">
            Share this ID with contractors who use Compliance Matters so they can connect to your rater account for ECC/HERS testing, corrections, retests, and cert closeout.
          </p>
          <div className="mt-3 space-y-1.5">
            <label htmlFor="my-rater-link-id" className="text-sm font-medium text-emerald-950">
              ECC/HERS handoff ID
            </label>
            <input
              id="my-rater-link-id"
              readOnly
              value={raterLinkId}
              aria-label="Copy ECC/HERS handoff ID"
              className="w-full select-all rounded-xl border border-emerald-200 bg-white px-3.5 py-2.5 font-mono text-sm text-slate-950 shadow-sm"
            />
          </div>
          <p className="mt-2 text-xs leading-5 text-emerald-900">
            Contractors can paste this ECC/HERS handoff ID when adding Compliance Matters or another connected rater account.
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm leading-6 text-slate-700">
          {authorizedEccSelection.mode === "none" ? (
            <span>Default ECC/HERS rater details are optional and can be added when needed.</span>
          ) : authorizedEccSelection.mode === "single" ? (
            <span>Default rater coordination will use this detail record.</span>
          ) : (
            <span>Your team can choose a rater detail record during coordination.</span>
          )}
        </div>

        <div className="mt-5 space-y-3">
          {authorizedEccRecipients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
              No default ECC/HERS rater details yet. Add a connected account reference or manual rater contact details for coordination.
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

        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">Add connected ECC rater</div>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            For Compliance Matters, use the ECC/HERS handoff ID provided by Compliance Matters. This lets jobs be shared for ECC testing, corrections, retests, and cert closeout.
          </p>

          {activeConnectedRecipientConnections.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-3 py-2 text-sm text-slate-600">
              No active connected rater accounts yet. <a href="#account-handoff-connections" className="font-semibold text-slate-900 underline-offset-2 hover:underline">Add an ECC/HERS handoff ID</a> from Compliance Matters or another connected rating company first.
            </div>
          ) : activeConnectedRecipientConnections.length === 1 ? (
            <form action={createConnectedAccountAuthorizedEccRaterFromForm} className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
              <input type="hidden" name="connection_id" value={activeConnectedRecipientConnections[0].id} />
              <div className="text-sm text-slate-700">
                Connect rater account {activeConnectedRecipientConnections[0].recipient_account_owner_user_id.slice(0, 8)} for ECC handoffs.
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="is_default" value="1" className="h-4 w-4 rounded border-slate-300 text-slate-900" />
                Set as default ECC rater
              </label>
              <button
                type="submit"
                className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50"
              >
                Connect ECC rater
              </button>
            </form>
          ) : (
            <form action={createConnectedAccountAuthorizedEccRaterFromForm} className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
              <div className="space-y-1.5">
                <label htmlFor="connected-rater-connection-id" className="text-sm font-medium text-slate-700">
                  ECC/HERS handoff ID
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
                <p className="text-xs leading-5 text-slate-500">
                  Choose an active ECC/HERS handoff ID that has already been connected below.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="is_default" value="1" className="h-4 w-4 rounded border-slate-300 text-slate-900" />
                Set as default ECC rater
              </label>
              <button
                type="submit"
                className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50"
              >
                Add connected rater
              </button>
            </form>
          )}
        </div>

        <form action={createAuthorizedEccRaterFromForm} className="mt-5 space-y-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">Track manual/external rater</div>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Use this only for tracking a rater that is not connected by ECC/HERS handoff ID yet. Manual tracking remains available, but connected rater accounts are preferred for ECC handoffs.
            </p>
          </div>
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
                placeholder="Compliance Matters ECC"
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
                placeholder="Compliance Matters"
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
                placeholder="Rater contact"
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
            Manual/external rater records are tracking only. Use connected account rater details when the rater provides an ECC/HERS handoff ID.
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex min-h-10 items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-[background-color,box-shadow,transform] hover:bg-slate-800"
            >
              Add manual rater record
            </button>
          </div>
        </form>
          </div>
        </details>
      </div>

      <div id="account-workshare-connections" className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] scroll-mt-24">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">ECC/HERS Rater Connections</h2>
          <p className="text-sm leading-6 text-slate-600">
            Rater accounts this company can send ECC/HERS requests to after a connection is accepted.
          </p>
        </div>

        <div className="mt-5">
          <WorkshareConnectionListSection
            title="Rater accounts this company can send to"
            description="Pending invites from rater accounts appear here for this contractor/sender account to accept."
            emptyMessage="No rater connections yet."
            secondaryEmptyMessage="No pending rater invites. A rater must invite this account before ECC/HERS requests can be sent."
            rows={workshareAsSender}
            currentAccountOwnerUserId={internalUser.account_owner_user_id}
            perspective="sender"
            actionSlot={(connection) => (
              <div className="mt-3 flex flex-wrap gap-2">
                {connection.status === "pending" && connection.sender_account_id === internalUser.account_owner_user_id ? (
                  <form action={acceptAccountWorkshareInviteFromForm}>
                    <input type="hidden" name="connection_id" value={connection.id} />
                    <button
                      type="submit"
                      className="inline-flex min-h-9 items-center rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
                    >
                      Accept connection
                    </button>
                  </form>
                ) : null}
                {(connection.status === "pending" || connection.status === "active") ? (
                  <form action={revokeAccountWorkshareConnectionFromForm}>
                    <input type="hidden" name="connection_id" value={connection.id} />
                    <button
                      type="submit"
                      className="inline-flex min-h-9 items-center rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                    >
                      Revoke
                    </button>
                  </form>
                ) : null}
              </div>
            )}
          />
        </div>

        <div className="mt-6 border-t border-slate-100 pt-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Contractor Sending Connections</h2>
          <p className="text-sm leading-6 text-slate-600">
            Invite contractor accounts that are allowed to send ECC/HERS requests to this rater account.
          </p>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-5 text-slate-700">
          <div className="font-semibold text-slate-900">
            {workshareReceiverActive.length === 0
              ? "No contractor sending connections yet"
              : workshareReceiverActive.length === 1
                ? "1 active contractor sending connection"
                : `${workshareReceiverActive.length} active contractor sending connections`}
          </div>
          <div className="mt-1 text-slate-600">
            Create an invite when a contractor account should be allowed to send ECC/HERS requests here.
          </div>
        </div>

        <form action={createAccountWorkshareInviteFromForm} className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">Invite contractor account</div>
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-2 text-xs leading-5 text-slate-600">
            Use either a known contractor account ID or an invite email. This only creates a connection invite. It does not share jobs, create portal users, or create ECC/HERS requests.
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs leading-5 text-slate-600">
            <div className="font-semibold text-slate-800">This account ID</div>
            <div className="mt-1 break-all font-mono text-slate-900">{internalUser.account_owner_user_id}</div>
            <div className="mt-1">Do not paste this ID into the contractor sender account ID field below.</div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="workshare-sender-account-id" className="text-sm font-medium text-slate-700">
                Contractor sender account ID
              </label>
              <input
                id="workshare-sender-account-id"
                name="sender_account_id"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                placeholder="Known contractor account ID"
              />
              <p className="text-xs leading-5 text-slate-500">
                Enter the contractor account ID, not this rater account ID.
                Use the contractor account owner ID. Do not use an individual employee user ID unless that user owns the account.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="workshare-invite-email" className="text-sm font-medium text-slate-700">
                Invite email
              </label>
              <input
                id="workshare-invite-email"
                name="invite_email"
                type="email"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                placeholder="contractor@example.com"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="workshare-invite-company" className="text-sm font-medium text-slate-700">
                Company name
              </label>
              <input
                id="workshare-invite-company"
                name="invite_company_name"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                placeholder="Contractor company"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex min-h-10 items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-[background-color,box-shadow,transform] hover:bg-slate-800"
            >
              Create connection invite
            </button>
          </div>
        </form>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <WorkshareConnectionListSection
            title="Contractor accounts allowed to send here"
            description="Contractor/sender accounts that are allowed to send ECC/HERS requests to this rater account after a connection is accepted."
            emptyMessage="No contractor sending connections yet."
            rows={workshareAsReceiver}
            currentAccountOwnerUserId={internalUser.account_owner_user_id}
            perspective="receiver"
            actionSlot={(connection) => (
              <div className="mt-3 flex flex-wrap gap-2">
                {connection.status === "active" ? (
                  <form action={disableAccountWorkshareConnectionFromForm}>
                    <input type="hidden" name="connection_id" value={connection.id} />
                    <button
                      type="submit"
                      className="inline-flex min-h-9 items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-50"
                    >
                      Disable
                    </button>
                  </form>
                ) : null}
                {(connection.status === "pending" || connection.status === "active") ? (
                  <form action={revokeAccountWorkshareConnectionFromForm}>
                    <input type="hidden" name="connection_id" value={connection.id} />
                    <button
                      type="submit"
                      className="inline-flex min-h-9 items-center rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                    >
                      Revoke
                    </button>
                  </form>
                ) : null}
              </div>
            )}
          />

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-sm font-semibold text-slate-900">Email invites</div>
            <div className="mt-1 text-xs leading-5 text-slate-600">
              Email-only invites require the invite email and token flow. Known contractor account ID invites can be accepted from the sender account section above.
            </div>
          </div>
        </div>
        </div>
      </div>

      <div id="account-handoff-connections" className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] scroll-mt-24">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Connected Handoff Accounts</h2>
          <p className="text-sm leading-6 text-slate-600">
            Manage trusted company-to-company connections for ECC/HERS handoffs.
          </p>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-5 text-slate-700">
          <div className="font-semibold text-slate-900">
            {activeConnections.length === 0
              ? "No handoff accounts connected yet"
              : activeConnections.length === 1
                ? "1 handoff account connected"
                : `${activeConnections.length} handoff accounts connected`}
          </div>
          <div className="mt-1 text-slate-600">
            {pendingIncomingConnections.length + pendingOutgoingConnections.length > 0
              ? `${pendingIncomingConnections.length + pendingOutgoingConnections.length} pending connection request${pendingIncomingConnections.length + pendingOutgoingConnections.length === 1 ? "" : "s"} need review.`
              : "Add connections only when ECC/HERS collaboration needs them."}
          </div>
        </div>

        <details className="group mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 transition-colors hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="transition-transform group-open:rotate-90">&gt;</span>
              Advanced ECC/HERS handoff details
            </span>
          </summary>
          <div className="mt-4 space-y-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs leading-5 text-slate-600">
              This only controls whether another account can be approved for future workflow handoffs. It does not share jobs, customers, service cases, or payment data.
            </div>
        <form action={requestAccountHandoffConnectionFromForm} className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">Request connection</div>
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-2 text-xs leading-5 text-slate-600">
            Enter the ECC/HERS handoff ID provided by the connected rating company. For Compliance Matters testing, use the ECC/HERS handoff ID provided by Compliance Matters.
          </div>
          <input type="hidden" name="handoff_kind" value="ecc" />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="connection-recipient-account-owner-id" className="text-sm font-medium text-slate-700">
                ECC/HERS handoff ID
              </label>
              <input
                id="connection-recipient-account-owner-id"
                name="recipient_account_owner_user_id"
                required
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                placeholder="Compliance Matters ECC/HERS handoff ID"
              />
              <p className="text-xs leading-5 text-slate-500">
                We'll match this to a connected account behind the scenes until dedicated handoff ID validation is available.
              </p>
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
        </details>
      </div>
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

function resolveWorkshareCounterpartyLabel(connection: AccountWorkshareConnectionRow, currentAccountOwnerUserId: string) {
  if (connection.receiver_account_id === currentAccountOwnerUserId) {
    return connection.sender_account_id || connection.invite_email || connection.invite_company_name || "Pending sender";
  }

  return connection.receiver_account_id;
}

function formatWorkshareStatus(value: AccountWorkshareConnectionRow["status"]) {
  if (value === "pending") return "Pending";
  if (value === "active") return "Active";
  if (value === "disabled") return "Disabled";
  return "Revoked";
}

function workshareStatusBadgeClass(value: AccountWorkshareConnectionRow["status"]) {
  if (value === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (value === "pending") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-slate-300 bg-slate-100 text-slate-700";
}

function WorkshareConnectionListSection(props: {
  title: string;
  description?: string;
  emptyMessage: string;
  secondaryEmptyMessage?: string;
  rows: AccountWorkshareConnectionRow[];
  currentAccountOwnerUserId: string;
  perspective?: "sender" | "receiver";
  actionSlot?: (connection: AccountWorkshareConnectionRow) => ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="text-sm font-semibold text-slate-900">{props.title}</div>
      {props.description ? (
        <div className="mt-1 text-xs leading-5 text-slate-600">{props.description}</div>
      ) : null}
      <div className="mt-3 space-y-3">
        {props.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-600">
            <div>{props.emptyMessage}</div>
            {props.secondaryEmptyMessage ? (
              <div className="mt-1 text-xs leading-5 text-slate-500">{props.secondaryEmptyMessage}</div>
            ) : null}
          </div>
        ) : (
          props.rows.map((connection) => {
            const createdAt = formatConnectionTimestamp(connection.created_at);
            const acceptedAt = formatConnectionTimestamp(connection.accepted_at);
            const disabledAt = formatConnectionTimestamp(connection.disabled_at);
            const revokedAt = formatConnectionTimestamp(connection.revoked_at);
            const isSenderPerspective = props.perspective === "sender";
            const isPendingSenderInvite = isSenderPerspective && connection.status === "pending";

            return (
              <div key={connection.id} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="break-all text-sm font-semibold text-slate-900">
                      {resolveWorkshareCounterpartyLabel(connection, props.currentAccountOwnerUserId)}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {isPendingSenderInvite
                        ? "Pending invite from rater account"
                        : connection.receiver_account_id === props.currentAccountOwnerUserId
                          ? "Contractor/sender account"
                          : "Rater account"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${workshareStatusBadgeClass(connection.status)}`}>
                      {formatWorkshareStatus(connection.status)}
                    </span>
                    <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      ECC/HERS
                    </span>
                  </div>
                </div>

                <div className="mt-2 space-y-1 text-xs text-slate-600">
                  {isPendingSenderInvite ? (
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-2 py-1.5 text-emerald-900">
                      Accept this connection to allow this company to send ECC/HERS requests to that rater account.
                    </div>
                  ) : null}
                  {connection.invite_company_name ? <div>Company: {connection.invite_company_name}</div> : null}
                  {connection.invite_email ? <div>Email: {connection.invite_email}</div> : null}
                  {createdAt ? <div>Created: {createdAt}</div> : null}
                  {acceptedAt ? <div>Accepted: {acceptedAt}</div> : null}
                  {disabledAt ? <div>Disabled: {disabledAt}</div> : null}
                  {revokedAt ? <div>Revoked: {revokedAt}</div> : null}
                </div>

                {props.actionSlot ? props.actionSlot(connection) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
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
                    <div className="mt-1 text-xs text-slate-600">Connected handoff account</div>
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
    return "Connected handoff account";
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
  trial: "30-day trial",
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
        <div className="text-sm font-semibold text-slate-950">Compliance Matters Subscription</div>
        <div className="mt-1 text-sm text-slate-600">
          Review app access and subscription billing.
        </div>
        <div className="mt-2 text-xs leading-5 text-slate-500">
          Customer invoice payments are managed separately under Online Payments.
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-px bg-slate-100/70 sm:grid-cols-3">
        <PlatformAccountField label="Plan" value={planLabel} />
        <PlatformAccountField label="Account status" value={statusLabel} />
        <PlatformAccountField label="Subscription status" value={subscriptionLabel} />
      </dl>
      {billingPeriodEndLabel || trialEndsLabel ? (
        <div className="border-t border-slate-100 bg-white px-5 py-3 text-sm leading-6 text-slate-700">
          {trialEndsLabel ? (
            <div>
              30-day trial ends:{" "}
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
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
            This internal account is comped and does not require app billing setup.
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
            App subscription setup is unavailable until billing configuration is added.
          </div>
        )}
      </div>
      <details className="group border-t border-slate-100 bg-white px-5 py-3">
        <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 transition-colors hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="transition-transform group-open:rotate-90">&gt;</span>
            Advanced subscription details
          </span>
        </summary>
        <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
          <div className="text-xs text-slate-500">
            These details are for support review only and do not change billing automatically.
          </div>
          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-100/70 sm:grid-cols-2">
            <PlatformAccountField
              label="Active users"
              value={String(entitlement.activeSeatCount)}
            />
            <PlatformAccountField
              label="Seat limit"
              value={seatLimitLabel}
            />
            <PlatformAccountField
              label="Payment method for subscription"
              value={billingCustomerLabel}
            />
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
  billingMode,
}: {
  readiness: Awaited<ReturnType<typeof resolveTenantStripeConnectReadiness>>;
  billingMode: string | null;
}) {
  const hasConnectedAccountId = Boolean(String(readiness.connectedAccountId ?? "").trim());
  const usesInternalInvoices = billingMode === "internal_invoicing";
  const setupActionLabel = readiness.isReady
    ? "Manage online payments"
    : hasConnectedAccountId
      ? "Finish online payment setup"
      : "Set up online payments";
  const statusCopy = (() => {
    if (!usesInternalInvoices) {
      return {
        tone: "slate" as const,
        title: "Online payments optional",
        body: "Online payments are optional here because invoices are managed outside EveryStep FieldWorks.",
      };
    }

    if (readiness.isReady) {
      return {
        tone: "success" as const,
        title: "Online payments are ready.",
        body: "Customers can pay eligible EveryStep FieldWorks invoices online.",
      };
    }

    if (hasConnectedAccountId) {
      return {
        tone: "warn" as const,
        title: readiness.disabledReason ? "Online payments need attention." : "Finish online payment setup.",
        body: "Finish setup before customers can pay EveryStep FieldWorks invoices online.",
      };
    }

    return {
      tone: "warn" as const,
      title: "Finish online payment setup.",
      body: "Set up customer online payments for EveryStep FieldWorks invoices.",
    };
  })();
  const statusClass =
    statusCopy.tone === "success"
      ? "border-slate-200 bg-slate-50/80 text-slate-700"
      : statusCopy.tone === "warn"
        ? "border-amber-200 bg-amber-50/70 text-amber-900"
        : "border-slate-200 bg-slate-50/80 text-slate-700";

  return (
    <div id="accept-payments" className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_18px_38px_-30px_rgba(15,23,42,0.24)] scroll-mt-24">
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-4">
        <div className="text-sm font-semibold text-slate-950">Online Payments</div>
        <div className="mt-1 text-sm text-slate-600">
          Let customers pay EveryStep FieldWorks invoices online.
        </div>
      </div>

      <div className="space-y-3 px-5 py-4">
        <div className={`rounded-2xl border px-4 py-3 text-sm leading-5 ${statusClass}`}>
          <div className="font-semibold">{statusCopy.title}</div>
          <div className="mt-1">{statusCopy.body}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
              Refresh payment status
            </button>
          </form>
        </div>

        <div className="text-xs text-slate-500">
          Last checked: {readiness.lastSyncedAt ? new Date(readiness.lastSyncedAt).toLocaleString() : "Never"}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-5 text-slate-600">
          {usesInternalInvoices
            ? "Online payments apply to invoices created in EveryStep FieldWorks."
            : "Online payments are optional here because invoices are managed outside EveryStep FieldWorks."}
        </div>

        <details className="group rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 transition-colors hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="transition-transform group-open:rotate-90">&gt;</span>
              Advanced payment details
            </span>
          </summary>
          <div className="mt-3 space-y-3">
            <div className="text-xs leading-5 text-slate-500">
              These details are for owner/admin support review and do not change payment setup automatically.
            </div>
            <dl className="grid grid-cols-1 gap-px rounded-2xl border border-slate-200 bg-slate-100/70 sm:grid-cols-2 lg:grid-cols-3">
              <PlatformAccountField label="Payment provider account" value={readiness.connectedAccountId ?? "Not connected"} />
              <PlatformAccountField label="Onboarding status" value={readiness.onboardingStatus} />
              <PlatformAccountField label="Charges enabled" value={readiness.chargesEnabled ? "Yes" : "No"} />
              <PlatformAccountField label="Payouts enabled" value={readiness.payoutsEnabled ? "Yes" : "No"} />
              <PlatformAccountField label="Details submitted" value={readiness.detailsSubmitted ? "Yes" : "No"} />
              <PlatformAccountField label="Disabled reason" value={readiness.disabledReason ?? "-"} />
            </dl>
          </div>
        </details>
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
