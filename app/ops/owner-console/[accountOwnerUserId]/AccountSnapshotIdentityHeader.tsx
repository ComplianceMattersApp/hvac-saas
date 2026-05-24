import Link from "next/link";
import { notFound } from "next/navigation";
import {
  isHiddenTestAccountRow,
  isPlatformInternalAccountRow,
  loadPlatformOwnerDashboardModel,
  parseHiddenAccountEmails,
  parseInternalAccountEmails,
  type PlatformOwnerDashboardRow,
} from "@/lib/business/platform-owner-dashboard";
import { createAdminClient } from "@/lib/supabase/server";

type BadgeTone = "slate" | "emerald" | "blue" | "amber";

function Badge(props: { children: React.ReactNode; tone: BadgeTone }) {
  const classes = {
    slate: "bg-slate-100 text-slate-700",
    emerald: "bg-emerald-100 text-emerald-800",
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-800",
  }[props.tone];

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${classes}`}>
      {props.children}
    </span>
  );
}

function resolveAccountBadges(params: {
  row: PlatformOwnerDashboardRow;
  hiddenEmails: Set<string>;
  internalEmails: Set<string>;
}) {
  const badges: { label: string; tone: BadgeTone }[] = [];

  if (isPlatformInternalAccountRow(params.row, params.internalEmails)) {
    badges.push({ label: "Platform / Internal", tone: "emerald" });
  }

  if (isHiddenTestAccountRow(params.row, params.hiddenEmails)) {
    badges.push({ label: "Hidden / Test", tone: "blue" });
  }

  if (!params.row.productMode) {
    badges.push({ label: "Product Not Set", tone: "amber" });
  }

  if (badges.length === 0) {
    badges.push({ label: "Customer Account", tone: "slate" });
  }

  return badges;
}

export default async function AccountSnapshotIdentityHeader({
  accountOwnerUserId,
}: {
  accountOwnerUserId: string;
}) {
  const admin = createAdminClient();
  const model = await loadPlatformOwnerDashboardModel({ admin });
  const row = model.rows.find((candidate) => candidate.accountOwnerUserId === accountOwnerUserId);

  if (!row) {
    notFound();
  }

  const badges = resolveAccountBadges({
    row,
    hiddenEmails: parseHiddenAccountEmails(process.env),
    internalEmails: parseInternalAccountEmails(process.env),
  });

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-4 text-slate-900 sm:p-6">
      <section className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Platform Owner</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-slate-950">Account Support Snapshot</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Read-only owner support view. This page does not impersonate users, edit tenant data, start support sessions, or run tenant actions.
            </p>
          </div>
          <Link
            href="/ops/owner-console"
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Back to Owner Console
          </Link>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {badges.map((badge) => (
                <Badge key={badge.label} tone={badge.tone}>{badge.label}</Badge>
              ))}
            </div>
            <h2 className="mt-3 text-xl font-semibold text-slate-950">{row.company}</h2>
            <p className="mt-1 text-sm text-slate-500">Owner: {row.ownerName ?? "-"} · {row.ownerEmail ?? "-"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-700">Account owner user id</p>
            <p className="mt-1 break-all font-mono text-slate-800">{row.accountOwnerUserId}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
