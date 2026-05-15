import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveAccountReadiness } from "@/lib/business/account-readiness";
import { isPlatformOwnerActor } from "@/lib/business/platform-owner-access";
import { resolveProductModeForAccountOwnerId, type ProductMode } from "@/lib/business/product-mode-defaults";
import { getPlatformBillingAvailability } from "@/lib/business/platform-billing-stripe";
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

export default async function OpsAdminPage() {
  const { supabase, internalUser, user } = await requireAdminOrRedirect();
  const readiness = await resolveAccountReadiness(internalUser.account_owner_user_id, supabase);
  const productMode = await resolveProductModeForAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });
  const platformBillingAvailability = getPlatformBillingAvailability();
  const requiredItems = readiness.items.filter((item) => item.status !== "optional");
  const incompleteRequiredItems = requiredItems.filter((item) => item.status === "incomplete");
  const optionalItems = readiness.items.filter((item) => item.status === "optional");

  const modeContextByProductMode: Record<ProductMode, { badge: string; heroHint: string; peopleCopy: string }> = {
    hvac_service: {
      badge: "HVAC Service",
      heroHint: "Service/work-order-first workspace. Contractor tools remain optional and unchanged.",
      peopleCopy:
        "Start here for user lookup and internal team workspaces. Contractor tools remain available as optional collaboration workspaces when this service account needs them.",
    },
    ecc_hers: {
      badge: "ECC/HERS",
      heroHint: "Compliance and contractor collaboration remain relevant in this workspace.",
      peopleCopy:
        "Start here for user lookup and recovery, then step into team workspaces and contractor/compliance collaboration tools when needed.",
    },
    hybrid: {
      badge: "All-in-One",
      heroHint: "Owner all-in-one workspace. Service and compliance tools remain available together.",
      peopleCopy:
        "Start here for user lookup and recovery, then step into team workspaces and optional contractor tools when needed.",
    },
  };

  const modeContext = modeContextByProductMode[productMode];

  const cards: AdminCard[] = [
    {
      section: "people",
      eyebrow: "People",
      title: "People & Access",
      description: "Manage access, invites, and account-level permissions.",
      href: "/ops/admin/users",
      ctaLabel: "Open workspace",
      enabled: true,
    },
    {
      section: "people",
      eyebrow: "People",
      title: "Internal Team",
      description: "Manage internal team members who perform office or field work.",
      href: "/ops/admin/internal-users",
      ctaLabel: "Open workspace",
      enabled: true,
    },
    {
      section: "people",
      eyebrow: productMode === "hvac_service" ? "Optional Contractor Tools" : "Contractors",
      title: productMode === "hvac_service" ? "Contractors (Optional)" : "Contractors",
      description:
        productMode === "hvac_service"
          ? "Optional subcontractor and vendor directory for service accounts that still coordinate outside collaboration work."
          : "Optional contractor workflows for ECC or contractor-collaboration accounts.",
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
          ? "Optional subcontractor/vendor-submitted work review for service accounts that use outside collaboration lanes."
          : "Optional contractor-submitted work review for accounts that use contractor intake.",
      href: "/ops/admin/contractor-intake-submissions",
      ctaLabel: productMode === "hvac_service" ? "Optional workspace" : "Review proposals",
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
    if (productMode !== "hvac_service") return true;
    return !collaborationCardHrefs.has(card.href);
  });
  const collaborationCards =
    productMode === "hvac_service"
      ? cards.filter((card) => card.section === "people" && collaborationCardHrefs.has(card.href))
      : [];
  const organizationCards = cards.filter((card) => card.section === "organization");
  const peopleSectionTitle =
    productMode === "hvac_service" ? "Service team and account access" : "Access and account management";
  const peopleSectionDescription =
    productMode === "hvac_service"
      ? "Start with internal team access and account controls. Optional outside collaboration tools are moved below so this page stays service/work-order first."
      : modeContext.peopleCopy;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 text-gray-900 sm:space-y-8 sm:p-6">
      <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98)_58%,rgba(226,232,240,0.65))] p-6 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.28)]">
        <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-slate-200/70 blur-3xl" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Admin Center</p>
            <h1 className="text-[2rem] font-semibold tracking-[-0.03em] text-slate-950">Run the admin side of the business</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Manage people, company settings, and your operational workspace in one place.
            </p>
            <div className="inline-flex items-center rounded-full border border-white/80 bg-white/85 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
              Live workspaces are grouped below. Future tools stay clearly separated.
            </div>
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50/90 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
              {modeContext.badge}: {modeContext.heroHint}
            </div>
          </div>
          <Link
            href="/ops"
            className="inline-flex items-center rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px]"
          >
            Back to Operations
          </Link>
        </div>
      </div>

      <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Account setup</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-950">
              {readiness.isOperationallyReady ? "Ready for operations" : "Needs setup"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Required: {readiness.completedRequiredCount} of {readiness.totalRequiredCount} complete
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Readiness tracks setup confirmations, not just whether a field has text.
            </p>
          </div>
        </div>

        {incompleteRequiredItems.length > 0 ? (
          <div className="mt-4 space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-900">Required</p>
            {incompleteRequiredItems.map((item) => (
              <div key={item.key} className="flex flex-wrap items-center justify-between gap-2 text-sm text-amber-900">
                <div>
                  <span className="font-semibold">Needs confirmation</span>: {item.label}
                </div>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="inline-flex items-center rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    Open
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
            Complete
          </div>
        )}

        <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Optional</p>
          {optionalItems.map((item) => (
            <div key={item.key} className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-700">
              <div>{item.label}</div>
              {item.href ? (
                <Link
                  href={item.href}
                  className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900 hover:bg-slate-100"
                >
                  Open
                </Link>
              ) : null}
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2 text-sm text-slate-700">
            <div>
              Platform billing setup {platformBillingAvailability.checkoutAvailable ? "is available." : "is not configured yet."}
            </div>
            <Link
              href="/ops/admin/company-profile"
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900 hover:bg-slate-100"
            >
              Open
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">People</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-950">{peopleSectionTitle}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            {peopleSectionDescription}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {peopleCards.map((card) => (
            <div
              key={card.title}
              className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,1))] p-5 shadow-[0_20px_34px_-28px_rgba(15,23,42,0.28)]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{card.eyebrow}</p>
              <h2 className="mt-3 text-lg font-semibold tracking-[-0.02em] text-slate-950">{card.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
              <div className="mt-5">
                <Link
                  href={card.href}
                  className="inline-flex items-center rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_16px_28px_-18px_rgba(15,23,42,0.45)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_20px_30px_-18px_rgba(15,23,42,0.5)] active:translate-y-[0.5px]"
                >
                  {card.ctaLabel}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {productMode === "hvac_service" && collaborationCards.length > 0 ? (
        <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
          <details className="group rounded-2xl border border-slate-200 bg-slate-50/70 p-4" name="optional-collaboration-tools">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Advanced</p>
                  <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-slate-950">Optional Collaboration Tools</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                    Use these only when this service account coordinates subcontractor or vendor collaboration.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 group-open:hidden">
                  Expand
                </span>
                <span className="hidden items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 group-open:inline-flex">
                  Collapse
                </span>
              </div>
            </summary>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {collaborationCards.map((card) => (
                <div
                  key={card.title}
                  className="rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-[0_14px_24px_-20px_rgba(15,23,42,0.35)]"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{card.eyebrow}</p>
                  <h3 className="mt-3 text-base font-semibold tracking-[-0.01em] text-slate-950">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
                  <div className="mt-5">
                    <Link
                      href={card.href}
                      className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 transition-[background-color,box-shadow,transform] hover:bg-slate-100 hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.4)] active:translate-y-[0.5px]"
                    >
                      {card.ctaLabel}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </details>
        </section>
      ) : null}

      <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Organization</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-950">Business identity and settings</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Keep the company presentation current so internal teams see a polished, familiar workspace.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {organizationCards.map((card) => (
            <div
              key={card.title}
              className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(240,253,250,0.55),rgba(255,255,255,1))] p-5 shadow-[0_20px_34px_-28px_rgba(15,23,42,0.28)]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{card.eyebrow}</p>
              <h2 className="mt-3 text-lg font-semibold tracking-[-0.02em] text-slate-950">{card.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
              <div className="mt-5">
                <Link
                  href={card.href}
                  className="inline-flex items-center rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_16px_28px_-18px_rgba(15,23,42,0.45)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_20px_30px_-18px_rgba(15,23,42,0.5)] active:translate-y-[0.5px]"
                >
                  {card.ctaLabel}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/90 px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Future modules</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Access policy and system diagnostics tools will appear here once they have a clear owned home inside the Admin Center.
        </p>
      </div>
    </div>
  );
}