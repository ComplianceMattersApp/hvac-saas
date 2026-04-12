import Link from "next/link";
import { redirect } from "next/navigation";
import { isInternalAccessError, requireInternalRole } from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";

async function requireAdminOrRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  try {
    await requireInternalRole("admin", { supabase, userId: user.id });
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
  await requireAdminOrRedirect();

  const cards: AdminCard[] = [
    {
      section: "people",
      eyebrow: "People",
      title: "People & Access",
      description: "Cross-role lookup, onboarding recovery, password operations, and access visibility.",
      href: "/ops/admin/users",
      ctaLabel: "Open workspace",
      enabled: true,
    },
    {
      section: "people",
      eyebrow: "People",
      title: "Internal Team",
      description: "Manage internal roles, membership, and practical profile details for admins, office staff, and techs.",
      href: "/ops/admin/internal-users",
      ctaLabel: "Open workspace",
      enabled: true,
    },
    {
      section: "people",
      eyebrow: "Contractors",
      title: "Contractors",
      description: "Manage contractor companies, primary contacts, and organization-scoped member access.",
      href: "/ops/admin/contractors",
      ctaLabel: "Open workspace",
      enabled: true,
    },
    {
      section: "people",
      eyebrow: "Contractors",
      title: "Intake Proposals",
      description: "Review pending contractor-submitted customer/location proposals and finalize them into canonical jobs.",
      href: "/ops/admin/contractor-intake-submissions",
      ctaLabel: "Review proposals",
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
  ];

  const peopleCards = cards.filter((card) => card.section === "people");
  const organizationCards = cards.filter((card) => card.section === "organization");

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 text-gray-900 sm:space-y-8 sm:p-6">
      <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98)_58%,rgba(226,232,240,0.65))] p-6 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.28)]">
        <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-slate-200/70 blur-3xl" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Admin Center</p>
            <h1 className="text-[2rem] font-semibold tracking-[-0.03em] text-slate-950">Run the admin side of the business</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Move between people, contractors, and company settings without leaving one streamlined control center.
            </p>
            <div className="inline-flex items-center rounded-full border border-white/80 bg-white/85 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
              Live workspaces are grouped below. Future tools stay clearly separated.
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
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">People</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-950">Access and account management</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Start here for user lookup and recovery, then step into the focused team and contractor workspaces when you need deeper control.
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