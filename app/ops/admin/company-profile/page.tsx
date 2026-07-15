import Link from "next/link";
import { redirect } from "next/navigation";
import {
  refreshTenantStripeConnectReadinessFromForm,
  saveInvoiceModeFromForm,
  saveInternalBusinessProfileFromForm,
  startTenantStripeConnectOnboardingFromForm,
} from "@/lib/actions/internal-business-profile-actions";
import { resolveAccountReadiness } from "@/lib/business/account-readiness";
import {
  DEFAULT_BILLING_MODE,
  getInternalBusinessProfileByAccountOwnerId,
  resolveInternalBusinessIdentityByAccountOwnerId,
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
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/request-identity";
import { resolveTenantStripeConnectReadiness } from "@/lib/business/tenant-stripe-connect-readiness";
import { listAccountWorkshareConnectionsForAccount } from "@/lib/workflows/account-workshare-connections-read";
import { getQboAvailability } from "@/lib/qbo/qbo-env";
import { getQboConnectionForAccountIncludingInactive } from "@/lib/qbo/qbo-connection";
import { QboIntegrationSection } from "./_components/QboIntegrationSection";
import { ProfileConsole, type ConsoleSectionState } from "./_components/ProfileConsole";
import { SettingsSection } from "./_components/SettingsSection";
import { SectionForm } from "./_components/SectionForm";
import { TextField } from "./_components/fields";
import { Disclosure } from "@/components/ui/Disclosure";
import {
  formatTimestampDateDisplayLA,
  formatTimestampDateTimeDisplayLA,
} from "@/lib/utils/schedule-la";

type SearchParams = Promise<{ notice?: string }>;

const NOTICE_TEXT: Record<string, { tone: "success" | "warn" | "error"; message: string }> = {
  saved: { tone: "success", message: "Your company details have been saved." },
  display_name_required: { tone: "error", message: "Enter your company name before saving." },
  invalid_support_email: { tone: "error", message: "Enter a valid support email, or leave it blank." },
  invalid_google_review_url: { tone: "error", message: "Enter a Google review link starting with https://, or leave it blank." },
  invalid_logo_file: { tone: "error", message: "Upload a PNG, JPG, SVG, or WebP image for your logo." },
  unsafe_logo_file: { tone: "error", message: "That SVG contains embedded scripts and can't be used. Upload a plain image (PNG, JPG, or WebP) or a script-free SVG." },
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
  qbo_connected: { tone: "success", message: "QuickBooks Online connected successfully." },
  qbo_connect_failed: { tone: "error", message: "Could not connect to QuickBooks Online. Please try again." },
  qbo_disconnected: { tone: "success", message: "QuickBooks Online disconnected." },
  qbo_sync_complete: { tone: "success", message: "QuickBooks sync complete." },
  qbo_not_configured: { tone: "warn", message: "QuickBooks Online is not configured for this environment." },
};

function bannerClass(tone: "success" | "warn" | "error") {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
}

async function requireAdminOrRedirect() {
  const supabase = await createClient();
  const user = await getRequestUser();

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
  ]);

  const tenantStripeReadiness = await resolveTenantStripeConnectReadiness(
    internalUser.account_owner_user_id,
    supabase,
  );
  const readiness = await resolveAccountReadiness(internalUser.account_owner_user_id, supabase, {
    entitlement,
    tenantStripeReadiness,
  });
  const incompleteRequiredItems = readiness.items.filter((item) => item.status === "incomplete");
  const currentLogoUrl = await resolveInternalBusinessProfileLogoUrl({
    logoUrl: profile?.logo_url ?? null,
  });
  const companyName = String(profile?.display_name ?? "").trim() || "Your Company";
  const supportEmail = String(profile?.support_email ?? "").trim();
  const supportPhone = String(profile?.support_phone ?? "").trim();
  const billingMode = profile?.billing_mode ?? DEFAULT_BILLING_MODE;
  const companyInitial = companyName.charAt(0).toUpperCase() || "C";

  // ECC/HERS Partner Network live summary. The read helper returns [] if the
  // table is missing, so this is safe. Partner display names live in each
  // partner's own RLS-scoped profile, resolved with the service-role client —
  // same pattern as the connections page. We do NOT rebuild the connect UI.
  const ownerId = internalUser.account_owner_user_id;
  const eccConnections = await listAccountWorkshareConnectionsForAccount(supabase, ownerId, {
    serviceType: "ecc_hers",
    limit: 200,
  });
  const eccActive = eccConnections.filter((connection) => connection.status === "active");
  const eccPendingIncoming = eccConnections.filter(
    (connection) => connection.status === "pending" && connection.sender_account_id === ownerId,
  );
  const partnerIdFor = (connection: (typeof eccConnections)[number]) =>
    String(
      (connection.receiver_account_id === ownerId
        ? connection.sender_account_id
        : connection.receiver_account_id) ?? "",
    ).trim();
  const eccPartnerNameById = new Map<string, string>();
  const eccPartnerIds = Array.from(new Set(eccActive.map(partnerIdFor).filter(Boolean)));
  if (eccPartnerIds.length > 0) {
    const admin = createAdminClient();
    const resolved = await Promise.all(
      eccPartnerIds.map(async (partnerId) => {
        const identity = await resolveInternalBusinessIdentityByAccountOwnerId({
          accountOwnerUserId: partnerId,
          supabase: admin,
        });
        return [partnerId, String(identity?.display_name ?? "").trim()] as const;
      }),
    );
    for (const [partnerId, name] of resolved) {
      if (name) eccPartnerNameById.set(partnerId, name);
    }
  }
  const eccPartnerNames = eccActive.map(
    (connection) =>
      eccPartnerNameById.get(partnerIdFor(connection)) ||
      String(connection.invite_company_name ?? "").trim() ||
      String(connection.invite_email ?? "").trim() ||
      "Connected company",
  );
  const eccConnectedCount = eccActive.length;
  const eccState: ConsoleSectionState | undefined =
    eccPendingIncoming.length > 0
      ? { kind: "attention", count: eccPendingIncoming.length }
      : eccConnectedCount > 0
        ? { kind: "count", count: eccConnectedCount }
        : undefined;
  const platformBillingAvailability = getPlatformBillingAvailability();

  // QBO Integrations section. The read is defensive (returns null if the table
  // is missing or unreadable) so QBO never blocks the Company Profile page.
  const qboAvailable = getQboAvailability().available;
  let qboConnection: Awaited<ReturnType<typeof getQboConnectionForAccountIncludingInactive>> = null;
  try {
    qboConnection = await getQboConnectionForAccountIncludingInactive({ supabase, accountOwnerUserId: ownerId });
  } catch {
    qboConnection = null;
  }

  // Rail state at a glance (design turn 14a): green dot = complete,
  // amber + count = needs attention. Derived from readiness so the source of
  // truth stays account-readiness, not a second re-derivation.
  const incompleteKeys = new Set(
    readiness.items.filter((item) => item.status === "incomplete").map((item) => item.key),
  );
  const countIncompleteKeys = (keys: string[]) => keys.filter((key) => incompleteKeys.has(key)).length;
  const identityIncomplete = countIncompleteKeys(["company_name", "support_email", "support_phone"]);
  const billingIncomplete = countIncompleteKeys([
    "billing_mode",
    "app_subscription",
    "accept_online_invoice_payments",
  ]);
  const identityState: ConsoleSectionState =
    identityIncomplete > 0 ? { kind: "attention", count: identityIncomplete } : { kind: "complete" };
  const billingState: ConsoleSectionState =
    billingIncomplete > 0 ? { kind: "attention", count: billingIncomplete } : { kind: "complete" };
  const teamState: ConsoleSectionState = incompleteKeys.has("active_internal_users")
    ? { kind: "attention" }
    : { kind: "complete" };

  // Overview surfaces optional readiness items muted alongside the required
  // ones (the old page dropped optionals). Sourced from readiness.items, not
  // re-derived. Needs-attention "Open" links jump to the owning console
  // section via hash; items that live on another route keep their own href.
  const optionalItems = readiness.items.filter((item) => item.status === "optional");
  const overviewSectionHash: Record<string, string> = {
    company_name: "#identity",
    support_email: "#identity",
    support_phone: "#identity",
    company_logo: "#identity",
    billing_mode: "#billing",
    app_subscription: "#billing",
    accept_online_invoice_payments: "#billing",
    online_invoice_payments: "#billing",
    active_internal_users: "#team",
  };
  const overviewPlanLabel = entitlement.isInternalComped
    ? "Internal / Comped"
    : PLAN_LABELS[entitlement.planKey] ?? entitlement.planKey;
  const overviewAccountActive =
    entitlement.isInternalComped ||
    ["active", "grace", "trial"].includes(entitlement.entitlementStatus);
  const onlinePaymentsReady = tenantStripeReadiness.isReady;

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

      <ProfileConsole
        defaultSectionId="overview"
        sections={[
          {
            id: "overview",
            label: "Overview",
            content: (
              <div className="space-y-5">
                {/* Summary */}
                <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.24)]">
                  <div className="flex items-start gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      {currentLogoUrl ? (
                        <img src={currentLogoUrl} alt={`${companyName} logo`} className="max-h-full max-w-full object-contain" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-slate-100 text-xl font-semibold text-slate-500">
                          {companyInitial}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="break-words text-lg font-semibold tracking-[-0.02em] text-[#0f1f35]">{companyName}</div>
                      <div className="mt-0.5 text-sm text-slate-600">
                        {supportEmail || "No business email yet"}
                        {supportPhone ? ` · ${supportPhone}` : ""}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${overviewAccountActive ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                          {overviewAccountActive ? "Account active" : "Account needs attention"}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                          {overviewPlanLabel}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${onlinePaymentsReady ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {onlinePaymentsReady ? "Online payments ready" : "Online payments off"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Needs attention — required (amber) + optional (muted) */}
                {incompleteRequiredItems.length > 0 || optionalItems.length > 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-[#0f1f35]">Needs attention</div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {readiness.completedRequiredCount} of {readiness.totalRequiredCount} required complete
                      </div>
                    </div>
                    <ul className="mt-3 space-y-2">
                      {incompleteRequiredItems.map((item) => (
                        <li key={item.key} className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-amber-950">
                              {item.key === "billing_mode" ? "Choose how invoices are handled" : item.label}
                            </div>
                            <div className="text-xs leading-5 text-amber-800">{item.description}</div>
                          </div>
                          {item.href ? (
                            overviewSectionHash[item.key] ? (
                              <a href={overviewSectionHash[item.key]} className="mt-0.5 shrink-0 text-xs font-semibold text-amber-900 underline-offset-2 hover:underline">
                                Open
                              </a>
                            ) : (
                              <Link href={item.href} className="mt-0.5 shrink-0 text-xs font-semibold text-amber-900 underline-offset-2 hover:underline">
                                Open
                              </Link>
                            )
                          ) : null}
                        </li>
                      ))}
                      {optionalItems.map((item) => (
                        <li key={item.key} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-600">
                              {item.label}
                              <span className="ml-1.5 text-xs font-normal text-slate-400">Optional</span>
                            </div>
                            <div className="text-xs leading-5 text-slate-500">{item.description}</div>
                          </div>
                          {item.href ? (
                            overviewSectionHash[item.key] ? (
                              <a href={overviewSectionHash[item.key]} className="mt-0.5 shrink-0 text-xs font-semibold text-slate-600 underline-offset-2 hover:underline">
                                Open
                              </a>
                            ) : (
                              <Link href={item.href} className="mt-0.5 shrink-0 text-xs font-semibold text-slate-600 underline-offset-2 hover:underline">
                                Open
                              </Link>
                            )
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900">
                    Everything&apos;s set up. Nothing needs your attention right now.
                  </div>
                )}

                {/* First job training — slim banner */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#0f1f35]">First job training</div>
                    <div className="text-xs text-slate-600">Step-by-step first job path in Training Room.</div>
                  </div>
                  <Link href="/training" className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100">
                    Open Training Room
                  </Link>
                </div>

                {/* Jump cards */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { hash: "#identity", title: "Identity & Branding", sub: "Logo, name, contact, review link" },
                    { hash: "#billing", title: "Billing & Payments", sub: "Subscription, invoices, online payments" },
                    { hash: "#ecc-hers", title: "ECC/HERS", sub: "Partner Network connections" },
                    { hash: "#team", title: "Team & Roles", sub: "Members, roles, and seats" },
                  ].map((card) => (
                    <a
                      key={card.hash}
                      href={card.hash}
                      className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#0f1f35]">{card.title}</div>
                        <div className="text-xs text-slate-500">{card.sub}</div>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-blue-600 transition-transform group-hover:translate-x-0.5">
                        Edit &rarr;
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ),
          },
          {
            id: "identity",
            label: "Identity & Branding",
            state: identityState,
            content: (
              <SettingsSection
                eyebrow="Identity & Branding"
                title="Identity & Branding"
                description="The logo, name, and contact info shown across the app, on invoices, and on customer documents."
              >
                <SectionForm action={saveInternalBusinessProfileFromForm} saveLabel="Save changes">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
                          {currentLogoUrl ? (
                            <img src={currentLogoUrl} alt={`${companyName} logo`} className="max-h-full max-w-full object-contain" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-slate-100 text-lg font-semibold text-slate-500">
                              {companyInitial}
                            </div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-[#0f1f35]">Logo</div>
                          <div className="text-sm leading-6 text-slate-600">Shown on invoices, messages, and team screens.</div>
                        </div>
                      </div>

                      {currentLogoUrl ? (
                        <label className="inline-flex min-h-11 items-center gap-2 text-sm text-slate-700">
                          <input type="checkbox" name="remove_logo" value="1" className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                          Remove logo
                        </label>
                      ) : null}
                    </div>

                    <div className="mt-4">
                      <label htmlFor="logo_file" className="sr-only">
                        Upload company logo
                      </label>
                      <input
                        id="logo_file"
                        name="logo_file"
                        type="file"
                        accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
                        className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-700"
                      />
                      <p className="mt-2 text-xs text-slate-500">PNG, JPG, SVG, or WebP. Up to 5 MB.</p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      id="display_name"
                      name="display_name"
                      label="Company name"
                      requirement="required"
                      defaultValue={profile?.display_name ?? ""}
                      placeholder="Compliance Matters"
                      autoComplete="organization"
                      className="sm:col-span-2"
                    />
                    <TextField
                      id="support_email"
                      name="support_email"
                      type="email"
                      inputMode="email"
                      label="Business email"
                      requirement="recommended"
                      defaultValue={profile?.support_email ?? ""}
                      placeholder="support@company.com"
                      autoComplete="email"
                    />
                    <TextField
                      id="support_phone"
                      name="support_phone"
                      type="tel"
                      inputMode="tel"
                      label="Business phone"
                      requirement="recommended"
                      defaultValue={profile?.support_phone ?? ""}
                      placeholder="(209) 555-1234"
                      autoComplete="tel"
                    />
                    <TextField
                      id="google_review_url"
                      name="google_review_url"
                      type="url"
                      inputMode="url"
                      label="Google review link"
                      requirement="optional"
                      defaultValue={profile?.google_review_url ?? ""}
                      placeholder="https://g.page/r/your-place-id/review"
                      helper="Paste your Google Business review link. When set, a review-ask button appears on completed jobs so you can request reviews from satisfied customers."
                      className="sm:col-span-2"
                    />
                  </div>
                </SectionForm>
              </SettingsSection>
            ),
          },
          {
            id: "billing",
            label: "Billing & Payments",
            state: billingState,
            content: (
              <div className="space-y-6">
      <PlatformAccountSection
        entitlement={entitlement}
        availability={platformBillingAvailability}
        seatAuditPreview={seatAuditPreview}
      />

      <SettingsSection
        eyebrow="Invoice Settings"
        title="Invoice Settings"
        description="Choose where your company creates and manages invoices."
      >
        <SectionForm action={saveInvoiceModeFromForm} saveLabel="Save invoice settings">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="space-y-1.5">
              <label htmlFor="billing_mode" className="text-sm font-medium text-slate-700">
                Company invoice workflow
              </label>
              <select
                id="billing_mode"
                name="billing_mode"
                defaultValue={billingMode}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm text-[#0f1f35] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
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
        </SectionForm>
      </SettingsSection>

      <TenantStripePaymentsSection readiness={tenantStripeReadiness} billingMode={billingMode} />
              </div>
            ),
          },
          {
            id: "integrations",
            label: "Integrations",
            content: (
              <QboIntegrationSection qboConnection={qboConnection} qboAvailable={qboAvailable} />
            ),
          },
          {
            id: "ecc-hers",
            label: "ECC/HERS",
            state: eccState,
            content: (
              <SettingsSection
                eyebrow="ECC/HERS Partner Network"
                title="ECC/HERS Partner Network"
                description="Trusted company-to-company connections for ECC/HERS work sharing."
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                    {eccConnectedCount} connected
                  </span>
                  {eccPendingIncoming.length > 0 ? (
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
                      {eccPendingIncoming.length} invite{eccPendingIncoming.length === 1 ? "" : "s"} to accept
                    </span>
                  ) : null}
                </div>

                {eccConnectedCount > 0 ? (
                  <p className="text-sm leading-6 text-slate-600">
                    Connected with{" "}
                    <span className="font-medium text-[#0f1f35]">{eccPartnerNames.slice(0, 3).join(", ")}</span>
                    {eccPartnerNames.length > 3 ? ` +${eccPartnerNames.length - 3} more` : ""}.
                  </p>
                ) : (
                  <p className="text-sm leading-6 text-slate-600">
                    No connected companies yet. Connect a company to start sharing ECC/HERS work.
                  </p>
                )}

                <Link
                  href="/ops/admin/connections"
                  className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50"
                >
                  Manage connections &rarr;
                </Link>
              </SettingsSection>
            ),
          },
          {
            id: "team",
            label: "Team & Roles",
            state: teamState,
            content: (
              <SettingsSection
                eyebrow="Team & Roles"
                title="Team & Roles"
                description="People & Access — invite teammates, set roles, and manage seats. Managed on the dedicated Team & Access page."
              >
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Active users</dt>
                    <dd className="mt-1 text-sm font-semibold text-[#0f1f35]">{entitlement.activeSeatCount}</dd>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Seat limit</dt>
                    <dd className="mt-1 text-sm font-semibold text-[#0f1f35]">{formatSeatAuditSeatLimitLabel(entitlement)}</dd>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Contractor records</dt>
                    <dd className="mt-1 text-sm font-semibold text-[#0f1f35]">{seatAuditPreview.contractorDirectoryCount ?? "—"}</dd>
                  </div>
                </dl>
                <Link
                  href="/ops/admin/users"
                  className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50"
                >
                  Manage team &rarr;
                </Link>
              </SettingsSection>
            ),
          },
        ]}
      />
    </div>
  );
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
      ? formatTimestampDateDisplayLA(entitlement.trialEndsAt.toISOString())
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
    ? formatTimestampDateDisplayLA(entitlement.billingCurrentPeriodEnd.toISOString())
    : null;

  return (
    <div id="account-billing" className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_18px_38px_-30px_rgba(15,23,42,0.24)] scroll-mt-24">
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-4">
        <div className="text-sm font-semibold text-[#0f1f35]">Compliance Matters Subscription</div>
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
                className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Open billing setup
              </button>
            </form>
            <form action="/api/stripe/portal" method="post">
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50"
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
      <div className="border-t border-slate-100 px-5 py-3">
        <Disclosure variant="flush" title="Advanced subscription details">
          <div className="space-y-3 text-sm leading-6 text-slate-600">
            <div className="text-xs text-slate-500">
              These details are for support review only and do not change billing automatically.
            </div>
            <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-100/70 sm:grid-cols-2">
              <PlatformAccountField label="Active users" value={String(entitlement.activeSeatCount)} />
              <PlatformAccountField label="Seat limit" value={seatLimitLabel} />
              <PlatformAccountField label="Payment method for subscription" value={billingCustomerLabel} />
              <PlatformAccountField label="Inactive users excluded" value={inactiveUserCountLabel} />
              <PlatformAccountField label="External/contractor records excluded" value={externalRecordCountLabel} />
              <PlatformAccountField label="Pending invites" value="Not counted yet" />
            </dl>
          </div>
        </Disclosure>
      </div>
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

  const lastCheckedLabel = (() => {
    if (!readiness.lastSyncedAt) return "Never";
    const parsed = new Date(readiness.lastSyncedAt as string | number | Date);
    return Number.isFinite(parsed.getTime())
      ? formatTimestampDateTimeDisplayLA(parsed.toISOString())
      : "Never";
  })();

  return (
    <div id="accept-payments" className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_18px_38px_-30px_rgba(15,23,42,0.24)] scroll-mt-24">
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-4">
        <div className="text-sm font-semibold text-[#0f1f35]">Online Payments</div>
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
              className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition-[background-color,box-shadow,transform] hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 active:translate-y-[0.5px]"
            >
              {setupActionLabel}
            </button>
          </form>

          <form action={refreshTenantStripeConnectReadinessFromForm}>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 transition-[background-color,box-shadow,transform] hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 active:translate-y-[0.5px]"
            >
              Refresh payment status
            </button>
          </form>
        </div>

        <div className="text-xs text-slate-500">
          Last checked: {lastCheckedLabel}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-5 text-slate-600">
          {usesInternalInvoices
            ? "Online payments apply to invoices created in EveryStep FieldWorks."
            : "Online payments are optional here because invoices are managed outside EveryStep FieldWorks."}
        </div>

        <Disclosure title="Advanced payment details">
          <div className="space-y-3">
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
        </Disclosure>
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
      <dd className="mt-1 text-sm font-medium text-[#0f1f35]">{value}</dd>
    </div>
  );
}
