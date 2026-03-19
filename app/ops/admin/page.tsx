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
  title: string;
  description: string;
  href: string;
  enabled: boolean;
};

export default async function OpsAdminPage() {
  await requireAdminOrRedirect();

  const cards: AdminCard[] = [
    {
      title: "User Command Center",
      description: "Unified internal and contractor user lifecycle controls.",
      href: "/ops/admin/users",
      enabled: true,
    },
    {
      title: "Internal Users",
      description: "Manage admin, office, and tech membership for your internal account.",
      href: "/ops/admin/internal-users",
      enabled: true,
    },
    {
      title: "Contractors",
      description: "Manage contractor organizations and team membership.",
      href: "/ops/admin/contractors",
      enabled: true,
    },
    {
      title: "Access",
      description: "Future access and policy administration tools.",
      href: "#",
      enabled: false,
    },
    {
      title: "System",
      description: "Future system-level configuration and diagnostics.",
      href: "#",
      enabled: false,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 text-gray-900 sm:p-6">
      <div className="rounded-xl border border-gray-200 bg-gradient-to-b from-white to-slate-50/60 p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Operations</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Admin</h1>
            <p className="text-sm text-slate-600">
              Administrative tools for internal account governance and platform controls.
            </p>
          </div>
          <Link
            href="/ops"
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-100"
          >
            Back to Ops
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <div key={card.title} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">{card.title}</h2>
            <p className="mt-1 text-sm text-gray-600">{card.description}</p>
            <div className="mt-4">
              {card.enabled ? (
                <Link
                  href={card.href}
                  className="inline-flex items-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                >
                  Open
                </Link>
              ) : (
                <span className="inline-flex items-center rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-500">
                  Coming soon
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}