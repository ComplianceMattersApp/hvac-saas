import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveAccountReadiness } from "@/lib/business/account-readiness";
import { resolveAccountEntitlement, type AccountEntitlementContext } from "@/lib/business/platform-entitlement";
import { isPlatformOwnerActor } from "@/lib/business/platform-owner-access";
import { resolveProductModeForAccountOwnerId, type ProductMode } from "@/lib/business/product-mode-defaults";
import { resolveProductSurfaceProfile } from "@/lib/business/product-surface-profile";
import { isInternalAccessError, requireInternalRole } from "@/lib/auth/internal-user";
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

type AdminCard = {
  section: "people" | "organization";
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  enabled: boolean;
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

function AdminCardLink({ card }: { card: AdminCard }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-semibold text-slate-500">{card.eyebrow}</div>
      <h3 className="mt-2 text-base font-semibold text-slate-950">{card.title}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">{card.description}</p>
      <div className="mt-4">
        <Link href={card.href} className={card.enabled ? primaryButtonClass : linkButtonClass}>
          {card.ctaLabel}
        </Link>
      </div>
    </div>
  );
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

  const modeContextByProductMode: Record<ProductMode, { badge: string; heroHint: string; peopleCopy: string }> = {
    hvac_service: {
      badge: "Service",
      heroHint: "Service-first workspace. Contractor tools stay optional.",
      peopleCopy:
        "Start with People & Access, then use Internal Team. Contractor tools stay optional for outside collaboration.",
    },
    cleaning_services: {
      badge: "Cleaning",
      heroHint: "Cleaning workspace. Service job tools stay primary while cleaning workflows mature.",
      peopleCopy: "Start with People & Access, then use Internal Team for office staff, cleaners, and crew setup.",
    },
    ecc_hers: {
      badge: "ECC/HERS",
      heroHint: "Compliance and contractor collaboration remain relevant in this workspace.",
      peopleCopy:
        "Start with People & Access, then use Internal Team and Contractor tools as needed.",
    },
    hybrid: {
      badge: "All-in-One workspace",
      heroHint: "Owner all-in-one workspace. Service and compliance tools remain available together.",
      peopleCopy: "Start with People & Access, then use Internal Team and optional contractor tools when needed.",
    },
  };

  const modeContext = modeContextByProductMode[productMode];

  const cards: AdminCard[] = [
    {
      section: "people",
      eyebrow: "People",
      title: "People & Access",
      description:
        productMode === "cleaning_services"
          ? "Find team members, invites, and account access recovery actions."
          : "Find internal staff, contractor users, invites, and portal recovery actions.",
      href: "/ops/admin/users",
      ctaLabel: "Open workspace",
      enabled: true,
    },
    {
      section: "people",
      eyebrow: "People",
      title: "Internal Team",
      description:
        productMode === "cleaning_services"
          ? "Manage employees, cleaners, and crew members inside your company."
          : "Manage employees, staff, and technicians inside your company.",
      href: "/ops/admin/internal-users",
      ctaLabel: "Open workspace",
      enabled: true,
    },
    {
      section: "people",
      eyebrow: "People",
      title: "Time Clock",
      description: "Review team time entries and missed clock-outs.",
      href: "/ops/admin/time-clock",
      ctaLabel: "Open workspace",
      enabled: true,
    },
    {
      section: "people",
      eyebrow: productMode === "hvac_service" ? "Optional Contractor Tools" : "Contractors",
      title: productMode === "hvac_service" ? "Contractors (Optional)" : "Contractors",
      description:
        productMode === "hvac_service"
          ? "Optional external partner workspace for service accounts."
          : "External contractor relationships and contractor portal users.",
      href: "/ops/admin/contractors",
      ctaLabel: productMode === "hvac_service" ? "Optional workspace" : "Open workspace",
      enabled: true,
    },
    {
      section: "people",
      eyebrow: productMode === "hvac_service" ? "Optional Contractor Tools" : "Contractors",
      title: productMode === "hvac_service" ? "Intake Proposals (Optional)" : "Intake Proposals",
      description:
        productMode === "hvac_service"
          ? "Optional review queue for outside collaboration proposals."
          : "Review contractor-submitted proposals before they become jobs.",
      href: "/ops/admin/contractor-intake-submissions",
      ctaLabel: productMode === "hvac_service" ? "Optional workspace" : "Review contractor proposals",
      enabled: true,
    },
    {
      section: "organization",
      eyebrow: "Organization",
      title: "Company Profile",
      description: "View and edit the internal business identity for your current owner scope.",
      href: "/ops/admin/company-profile",
      ctaLabel: "Open profile",
      enabled: true,
    },
    {
      section: "organization",
      eyebrow: "Organization",
      title: "Pricebook",
      description: "Manage your reusable catalog of service, material, diagnostic, and adjustment items.",
      href: "/ops/admin/pricebook",
      ctaLabel: "Open pricebook",
      enabled: true,
    },
    {
      section: "organization",
      eyebrow: "Organization",
      title: "Communications",
      description: "Review SMS/provider readiness. SMS is not enabled and live sends are disabled.",
      href: "/ops/admin/communications",
      ctaLabel: "Review readiness",
      enabled: true,
    },
  ];

  const platformOwnerAllowed = isPlatformOwnerActor({
    userId: user.id,
    email: user.email,
    env: process.env,
  });

  if (platformOwnerAllowed) {
    cards.push({
      section: "organization",
      eyebrow: "Platform Owner",
      title: "Owner Console",
      description: "Read-only platform-wide signup and account visibility for allowlisted platform owners.",
      href: "/ops/owner-console",
      ctaLabel: "Open owner console",
      enabled: true,
    });
  }

  const collaborationCardHrefs = new Set([
    "/ops/admin/contractors",
    "/ops/admin/contractor-intake-submissions",
  ]);
  const peopleCards = cards.filter((card) => {
    if (card.section !== "people") return false;
    return !collaborationCardHrefs.has(card.href);
  });
  const collaborationCards = showContractorCollaboration
    ? cards.filter((card) => card.section === "people" && collaborationCardHrefs.has(card.href))
    : [];
  const organizationCards = cards.filter((card) => card.section === "organization");
  const peopleSectionDescription =
    productMode === "hvac_service"
      ? "Use this area for account access and internal staff tools."
      : modeContext.peopleCopy;
  const lifecycleCopy = resolveLaunchRoomLifecycleCopy(entitlement);

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
              <a href="#people" className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50">
                People & Access
              </a>
              {collaborationCards.length > 0 ? (
                <a href="#collaboration" className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50">
                  Collaboration
                </a>
              ) : null}
              <a href="#organization" className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50">
                Organization
              </a>
              <a href="#future" className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50">
                Later tools
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

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-slate-900" style={{ width: `${readinessPercent}%` }} />
            </div>

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

            {incompleteRequiredItems.length > 0 ? (
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
                        {item.key === "app_subscription"
                          ? "Set up subscription"
                          : item.key === "accept_online_invoice_payments"
                            ? "Set up online payments"
                            : "Open"}
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
                Required setup is complete. Ready for operations.
              </div>
            )}

            {visibleOptionalItems.length > 0 ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold text-slate-600">Can Wait</div>
                <div className="mt-3 space-y-3">
                  {visibleOptionalItems.map((item) => (
                    <div key={item.key} className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
                      <div>
                        <div>{item.label}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{item.description}</div>
                      </div>
                      {item.href ? (
                        <Link href={item.href} className={linkButtonClass}>
                          Open
                        </Link>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section id="people" className={panelClass}>
            <AdminSectionHeader
              eyebrow="People"
              title="People & Access"
              description={peopleSectionDescription}
            />
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Use People & Access for broad user access workflows. Use Internal Team for company employee setup.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              {peopleCards.map((card) => (
                <AdminCardLink key={card.title} card={card} />
              ))}
            </div>
          </section>

          {collaborationCards.length > 0 ? (
            <section id="collaboration" className={panelClass}>
              <details className="group">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <AdminSectionHeader
                      eyebrow="Optional"
                      title="Contractor collaboration"
                      description="Open this area only when the service account coordinates subcontractor or vendor collaboration."
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
                  {collaborationCards.map((card) => (
                    <AdminCardLink key={card.title} card={card} />
                  ))}
                </div>
              </details>
            </section>
          ) : null}

          <section id="organization" className={panelClass}>
            <AdminSectionHeader
              eyebrow="Organization"
              title="Business identity and settings"
              description="Keep the company presentation, pricebook, communications readiness, and owner tools organized."
            />
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              {organizationCards.map((card) => (
                <AdminCardLink key={card.title} card={card} />
              ))}
            </div>
          </section>

          <section id="future" className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-4">
            <div className="text-xs font-semibold text-slate-500">Later tools</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Use this later for deeper account and support tools after your daily work rhythm is in place.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
