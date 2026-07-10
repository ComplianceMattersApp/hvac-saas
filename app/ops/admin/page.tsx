import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveAccountReadiness } from "@/lib/business/account-readiness";
import { resolveAccountEntitlement, type AccountEntitlementContext } from "@/lib/business/platform-entitlement";
import { isPlatformOwnerActor } from "@/lib/business/platform-owner-access";
import { resolveProductModeForAccountOwnerId, type ProductMode } from "@/lib/business/product-mode-defaults";
import { resolveProductSurfaceProfile } from "@/lib/business/product-surface-profile";
import { AskComplianceMattersLauncher } from "@/components/help-assistant/AskComplianceMattersLauncher";
import { isInternalAccessError, requireInternalRole } from "@/lib/auth/internal-user";
import { resolveInternalAccessErrorRedirectPath } from "@/lib/auth/internal-access-redirect";
import { canViewFinancialRegister, isStructuralAccountOwner } from "@/lib/auth/financial-access";
import {
  hasFieldPaymentCollectionAccess,
  resolveFieldBillingCapabilities,
} from "@/lib/auth/field-billing-access";
import { buildHelpAssistantSafeContext } from "@/lib/help-assistant/help-assistant-context";
import {
  isAskComplianceMattersEnabled,
  isHelpGapReviewQueueEnabled,
} from "@/lib/help-assistant/help-assistant-flags";
import { isMaintenanceAgreementsEnabled } from "@/lib/maintenance-agreements/agreement-exposure";
import { createClient } from "@/lib/supabase/server";

async function requireAdminOrRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  try {
    const authz = await requireInternalRole("admin", { supabase, userId: user.id });
    return { supabase, internalUser: authz.internalUser, user };
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

type AdminCard = {
  eyebrow?: string;
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  enabled: boolean;
  secondaryLinks?: Array<{
    label: string;
    href: string;
  }>;
};

const pageClass = "mx-auto max-w-7xl space-y-6 p-4 text-gray-900 sm:p-6";
const panelClass =
  "rounded-lg border border-slate-200 bg-white p-5 shadow-[0_14px_34px_-28px_rgba(15,23,42,0.28)] sm:p-6";
const linkButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 transition-[background-color,border-color,transform] hover:border-slate-400 hover:bg-slate-50 active:translate-y-[0.5px]";
const primaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_-18px_rgba(15,23,42,0.5)] transition-[background-color,transform] hover:bg-slate-800 active:translate-y-[0.5px]";

function AdminSectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500">{eyebrow}</div>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">{title}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

function AdminWorkspaceCard({ card }: { card: AdminCard }) {
  return (
    <div className="flex min-h-[13rem] flex-col rounded-lg border border-slate-200 bg-slate-50 p-4">
      {card.eyebrow ? <div className="text-xs font-semibold text-slate-500">{card.eyebrow}</div> : null}
      <h3 className={card.eyebrow ? "mt-2 text-base font-semibold text-slate-950" : "text-base font-semibold text-slate-950"}>{card.title}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">{card.description}</p>
      {card.secondaryLinks && card.secondaryLinks.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
          {card.secondaryLinks.map((link) => (
            <Link key={`${card.title}:${link.href}`} href={link.href} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-100">
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
      <div className="mt-auto pt-4">
        <Link href={card.href} className={card.enabled ? primaryButtonClass : linkButtonClass}>
          {card.ctaLabel}
        </Link>
      </div>
    </div>
  );
}

function actionLabelForReadinessItem(key: string) {
  if (key === "app_subscription") return "Set up subscription";
  if (key === "accept_online_invoice_payments") return "Finish online payment setup";
  return "Review setup";
}

function formatLifecycleDate(value: Date | null) {
  if (!value || !Number.isFinite(value.getTime())) return null;

  return value.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function resolveLaunchRoomLifecycleCopy(entitlement: AccountEntitlementContext) {
  if (entitlement.isInternalComped) {
    return {
      headline: "Launch Room",
      statusLabel: "Internal account active",
      description:
        "Get your company ready, run your first job, and park the rest until later.",
      helper:
        "This internal account is active and does not require app billing setup.",
    };
  }

  if (entitlement.entitlementStatus === "trial") {
    const trialEndsLabel = formatLifecycleDate(entitlement.trialEndsAt);
    return {
      headline: "Launch Room",
      statusLabel: "Trial active",
      description:
        "Get your company ready, run your first job, and park the rest until later.",
      helper: trialEndsLabel
        ? `Your trial ends ${trialEndsLabel}. Use it to prove the daily routine from customer to invoice.`
        : "Use the trial to prove the daily routine from customer to invoice.",
    };
  }

  if (entitlement.entitlementStatus === "active" || entitlement.entitlementStatus === "grace") {
    return {
      headline: "Launch Room",
      statusLabel: "Account active",
      description:
        "Get your company ready, run your first job, and park the rest until later.",
      helper: "Your Compliance Matters account is active. Keep operations moving.",
    };
  }

  if (entitlement.entitlementStatus === "suspended" || entitlement.entitlementStatus === "cancelled") {
    return {
      headline: "Launch Room",
      statusLabel: "Account needs attention",
      description:
        "Get your company ready, run your first job, and park the rest until later.",
      helper: "App billing or account access needs review before normal operations continue.",
    };
  }

  return {
    headline: "Launch Room",
    statusLabel: "Account status needs review",
    description:
      "Get your company ready, run your first job, and park the rest until later.",
    helper: "We could not confirm account status. Review setup or contact support if blocked.",
  };
}

export default async function OpsAdminPage() {
  const { supabase, internalUser, user } = await requireAdminOrRedirect();
  const [readiness, entitlement, productMode] = await Promise.all([
    resolveAccountReadiness(internalUser.account_owner_user_id, supabase),
    resolveAccountEntitlement(internalUser.account_owner_user_id, supabase),
    resolveProductModeForAccountOwnerId({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
    }),
  ]);
  const surfaceProfile = resolveProductSurfaceProfile(productMode);
  const showContractorCollaboration = surfaceProfile.surfaces.contractorRaterHandoff;
  const requiredItems = readiness.items.filter((item) => item.status !== "optional");
  const incompleteRequiredItems = requiredItems.filter((item) => item.status === "incomplete");
  const optionalItems = readiness.items.filter((item) => item.status === "optional");
  const visibleOptionalItems = optionalItems.filter((item) => {
    if (item.key === "contractor_directory" && !showContractorCollaboration) return false;
    return true;
  });
  const readinessPercent =
    readiness.totalRequiredCount > 0
      ? Math.round((readiness.completedRequiredCount / readiness.totalRequiredCount) * 100)
      : 100;

  const modeContextByProductMode: Record<ProductMode, { badge: string }> = {
    hvac_service: {
      badge: "Service",
    },
    cleaning_services: {
      badge: "Cleaning",
    },
    ecc_hers: {
      badge: "ECC/HERS",
    },
    hybrid: {
      badge: "All-in-One workspace",
    },
  };

  const modeContext = modeContextByProductMode[productMode];

  const nextRequiredItem = incompleteRequiredItems[0] ?? null;
  const invoicesWorkspaceHref =
    requiredItems.some((item) => item.key === "accept_online_invoice_payments")
      ? "/ops/admin/company-profile#accept-payments"
      : "/ops/admin/company-profile#invoice-settings";

  const workspaceCards: AdminCard[] = [
    {
      title: "Company Profile",
      description:
        "Business name, logo, support email and phone, service identity, and account billing live here.",
      href: "/ops/admin/company-profile#company-details",
      ctaLabel: "Open workspace",
      enabled: true,
      secondaryLinks: [
        { label: "Account & Billing", href: "/ops/admin/company-profile#account-billing" },
        { label: "Invoice mode", href: "/ops/admin/company-profile#invoice-settings" },
      ],
    },
    {
      title: "Team & Access",
      description:
        productMode === "cleaning_services"
          ? "Invite users, manage roles, recover access, and keep office staff, cleaners, and crew organized."
          : "Invite users, manage roles, recover access, and keep office staff and technicians organized.",
      href: "/ops/admin/users",
      ctaLabel: "Open workspace",
      enabled: true,
      secondaryLinks: [
        { label: "Internal Team", href: "/ops/admin/internal-users" },
        { label: "Time Clock", href: "/ops/admin/time-clock" },
      ],
    },
    {
      title: "Invoices & Online Payments",
      description:
        "Choose invoice mode, review account billing, and set up Accept Online Invoice Payments when Compliance Matters invoices are used.",
      href: invoicesWorkspaceHref,
      ctaLabel: "Open workspace",
      enabled: true,
      secondaryLinks: [
        { label: "Invoice mode", href: "/ops/admin/company-profile#invoice-settings" },
        { label: "Check payment setup status", href: "/ops/admin/company-profile#accept-payments" },
      ],
    },
    {
      title: "Field Setup",
      description:
        "Pricebook starter items, job defaults, device setup, notifications, and field-ready basics.",
      href: "/ops/admin/pricebook",
      ctaLabel: "Open workspace",
      enabled: true,
      secondaryLinks: [
        { label: "Device setup", href: "/account" },
        { label: "Notifications", href: "/ops/notifications" },
      ],
    },
  ];

  if (showContractorCollaboration) {
    workspaceCards.push({
      title: "ECC/HERS Handoff",
      description:
        "Connected raters, connection codes, contractor relationships, and ECC/HERS handoff setup.",
      href: "/ops/admin/company-profile#authorized-ecc-raters",
      ctaLabel: "Open workspace",
      enabled: true,
      secondaryLinks: [
        { label: "Connection codes", href: "/ops/admin/company-profile#account-handoff-connections" },
        { label: "Contractors", href: "/ops/admin/contractors" },
        { label: "Intake proposals", href: "/ops/admin/contractor-intake-submissions" },
      ],
    });
    workspaceCards.push({
      title: "Partner Network",
      description:
        "Manage ECC/HERS company-to-company connections for work sharing.",
      href: "/ops/admin/connections",
      ctaLabel: "Manage connections",
      enabled: true,
    });
  }

  if (isMaintenanceAgreementsEnabled()) {
    workspaceCards.push({
      title: "Service plan templates",
      description:
        "Create and manage the plan templates your team uses when setting up new service plans.",
      href: "/ops/admin/service-plan-templates",
      ctaLabel: "Manage templates",
      enabled: true,
    });
  }

  workspaceCards.push({
    title: "Training Room",
    description:
      "Role-based training, daily rhythms, and the First Job Mission for learning how work moves.",
    href: "/training",
    ctaLabel: "Open workspace",
    enabled: true,
  });

  const advancedCards: AdminCard[] = [
    {
      title: "Communications",
      description: "Review SMS/provider readiness and future messaging wording. Live SMS sends remain disabled.",
      href: "/ops/admin/communications",
      ctaLabel: "Review setup",
      enabled: true,
    },
  ];

  if (isHelpGapReviewQueueEnabled()) {
    advancedCards.push({
      title: "Help Gap Review",
      description:
        "Review sanitized Ask Compliance Matters questions and feedback to improve setup, training, and support content.",
      href: "/ops/admin/help-gaps",
      ctaLabel: "Open review queue",
      enabled: true,
    });
  }

  const platformOwnerAllowed = isPlatformOwnerActor({
    userId: user.id,
    email: user.email,
    env: process.env,
  });

  if (platformOwnerAllowed) {
    advancedCards.push({
      title: "Owner Console",
      description: "Read-only platform-wide signup and account visibility for allowlisted platform owners.",
      href: "/ops/owner-console",
      ctaLabel: "Open owner console",
      enabled: true,
    });
  }
  const lifecycleCopy = resolveLaunchRoomLifecycleCopy(entitlement);
  const fieldBillingCapabilities = resolveFieldBillingCapabilities({
    actorUserId: user.id,
    internalUser,
  });
  const helpAssistantContext = buildHelpAssistantSafeContext({
    pathname: "/ops/admin",
    internalRole: internalUser.role,
    isAccountOwner: isStructuralAccountOwner({
      actorUserId: user.id,
      internalUser,
    }),
    productMode,
    canViewFinancialRegister: canViewFinancialRegister({
      actorUserId: user.id,
      internalUser,
    }),
    canCollectFieldPayment: hasFieldPaymentCollectionAccess(fieldBillingCapabilities),
  });

  return (
    <div className={pageClass}>
      <div className={panelClass}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500">Admin Center</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950 sm:text-3xl">
              {lifecycleCopy.headline}
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              {lifecycleCopy.description}
            </p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              {lifecycleCopy.helper}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex min-h-8 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
                {modeContext.badge}
              </span>
              <span className="inline-flex min-h-8 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
                {lifecycleCopy.statusLabel}
              </span>
            </div>
          </div>
          <Link href="/ops" className={linkButtonClass}>
            Back to Operations
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-[0_14px_34px_-30px_rgba(15,23,42,0.2)]">
            <div className="px-2 pb-2 text-xs font-semibold text-slate-500">Admin areas</div>
            <nav className="space-y-1 text-sm font-semibold">
              <a href="#setup" className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50">
                Launch Room
              </a>
              <a href="#workspaces" className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50">
                Admin workspaces
              </a>
              <a href="#advanced" className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50">
                Advanced / Technical
              </a>
            </nav>
          </div>
        </aside>
        <div className="space-y-6">
          <section id="setup" className={panelClass}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <AdminSectionHeader
                eyebrow="Launch Room"
                title={readiness.isOperationallyReady ? "Ready for operations" : "Needs setup"}
                description={
                  readiness.isOperationallyReady
                    ? "Required setup is complete. Keep this room for account changes and new-team refreshers."
                    : "Get your company ready, run your first job, and park the rest until later."
                }
              />
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                <div className="text-2xl font-semibold text-slate-950">{readinessPercent}%</div>
                <div className="mt-0.5 text-xs font-semibold text-slate-500">
                  {readiness.completedRequiredCount} of {readiness.totalRequiredCount} required
                </div>
              </div>
            </div>

            {readiness.isOperationallyReady ? (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="font-semibold">Required setup is complete. Ready for operations.</div>
                <p className="mt-1 leading-6">
                  Keep this room for account changes and new-team refreshers. Work from the focused admin workspaces below when you need to adjust setup.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href="/ops/admin/company-profile" className={linkButtonClass}>
                    Review setup
                  </Link>
                  <Link href="/jobs/new" className={primaryButtonClass}>
                    Create first job
                  </Link>
                  <Link href="/today" className={linkButtonClass}>
                    Open Today
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-slate-900" style={{ width: `${readinessPercent}%` }} />
                </div>

                {nextRequiredItem ? (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <div className="text-xs font-semibold">Next best action</div>
                    <div className="mt-1 font-semibold">{nextRequiredItem.label}</div>
                    <p className="mt-1 leading-6">{nextRequiredItem.description}</p>
                    {nextRequiredItem.href ? (
                      <Link href={nextRequiredItem.href} className={`${primaryButtonClass} mt-3`}>
                        {actionLabelForReadinessItem(nextRequiredItem.key)}
                      </Link>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                  <div className="text-xs font-semibold">First job path</div>
                  <p className="mt-1 leading-6">
                    Follow this path first: customer to job, then schedule, field notes, closeout, and invoice. Use Today/Ops each morning to keep work moving.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                    <Link href="/customers/new" className="rounded-md border border-sky-300 bg-white px-2.5 py-1 text-sky-900 hover:bg-sky-100">
                      Create first customer
                    </Link>
                    <Link href="/jobs/new" className="rounded-md border border-sky-300 bg-white px-2.5 py-1 text-sky-900 hover:bg-sky-100">
                      Create first job
                    </Link>
                    <Link href="/today" className="rounded-md border border-sky-300 bg-white px-2.5 py-1 text-sky-900 hover:bg-sky-100">
                      Open Today
                    </Link>
                  </div>
                </div>

                <div className="mt-5 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="text-xs font-semibold text-amber-900">Required Now</div>
                {incompleteRequiredItems.map((item) => (
                  <div key={item.key} className="flex flex-wrap items-center justify-between gap-3 text-sm text-amber-900">
                    <div>
                      <div>
                        <span className="font-semibold">Needs confirmation:</span> {item.label}
                      </div>
                      <div className="mt-0.5 text-xs text-amber-800">{item.description}</div>
                    </div>
                    {item.href ? (
                      <Link href={item.href} className={linkButtonClass}>
                        {actionLabelForReadinessItem(item.key)}
                      </Link>
                    ) : null}
                  </div>
                ))}
                </div>
              </>
            )}

            {visibleOptionalItems.length > 0 ? (
              <details className="group mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-slate-600 [&::-webkit-details-marker]:hidden">
                  <span>{readiness.isOperationallyReady ? "Recommended Next / Can Wait" : "Can Wait"}</span>
                  <span className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700 group-open:hidden">Expand</span>
                  <span className="hidden rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700 group-open:inline">Collapse</span>
                </summary>
                <div className="mt-3 space-y-3">
                {visibleOptionalItems.map((item) => (
                  <div key={item.key} className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
                    <div>
                      <div>{item.label}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{item.description}</div>
                    </div>
                    {item.href ? (
                      <Link href={item.href} className={linkButtonClass}>
                        Review setup
                      </Link>
                    ) : null}
                  </div>
                ))}
                </div>
              </details>
            ) : null}
          </section>

          <section id="workspaces" className={panelClass}>
            <AdminSectionHeader
              eyebrow="Admin workspaces"
              title="Choose a setup area"
              description="Each workspace has a focused job. Open one area, finish what you came for, then come back here when you need another admin section."
            />
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              {workspaceCards.map((card) => (
                <AdminWorkspaceCard key={card.title} card={card} />
              ))}
            </div>
          </section>

          <section id="advanced" className={panelClass}>
            <details className="group">
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <AdminSectionHeader
                    eyebrow="Secondary"
                    title="Advanced / Technical"
                    description="Provider readiness, support-only review areas, and technical status live here so primary setup stays focused."
                  />
                  <span className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 group-open:hidden">
                    Expand
                  </span>
                  <span className="hidden min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 group-open:inline-flex">
                    Collapse
                  </span>
                </div>
              </summary>
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                {advancedCards.map((card) => (
                  <AdminWorkspaceCard key={card.title} card={card} />
                ))}
              </div>
            </details>
          </section>
        </div>
      </div>
      {isAskComplianceMattersEnabled() ? (
        <AskComplianceMattersLauncher context={helpAssistantContext} />
      ) : null}
    </div>
  );
}
