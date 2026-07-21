import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import ReadyToBillSelection from "./ReadyToBillSelection";
import { requireInternalUser } from "@/lib/auth/internal-user";
import { requireFinancialRegisterAccessOrRedirect } from "@/lib/auth/financial-access";
import { resolveBillingModeByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { listReadyToBillContractorGroups } from "@/lib/business/ready-to-bill";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Ready to Bill" };

export default async function ReadyToBillPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient();
  const { userId, internalUser } = await requireInternalUser({ supabase });
  requireFinancialRegisterAccessOrRedirect({
    actorUserId: userId,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    redirectTo: "/reports/invoices?banner=not_authorized",
  });
  const billingMode = await resolveBillingModeByAccountOwnerId({ supabase, accountOwnerUserId: internalUser.account_owner_user_id });
  if (billingMode !== "internal_invoicing") redirect("/reports/invoices");

  const query = (searchParams ? await searchParams : {}) ?? {};
  const contractorParam = Array.isArray(query.contractor) ? query.contractor[0] : query.contractor;
  const { groups, truncated } = await listReadyToBillContractorGroups({ supabase, accountOwnerUserId: internalUser.account_owner_user_id });
  const selectedGroup = groups.find((group) => group.contractorId === contractorParam) ?? null;

  return (
    <main className="mx-auto min-h-screen max-w-7xl space-y-6 bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <Link href="/reports/invoices" className="text-sm font-semibold text-blue-700 hover:underline">← Invoices</Link>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">Ready to Bill</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">Choose one contractor, then deliberately select the completed jobs to combine. Creation makes one editable draft only—it does not issue, send, charge, or sync the invoice.</p>
        {truncated ? <p className="text-sm font-semibold text-amber-700">The readiness list is capped at 250 jobs. Narrow the operational backlog before batching older work.</p> : null}
      </header>

      {!selectedGroup ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">No contractor-billed jobs are ready for consolidated invoicing.</div> : groups.map((group) => (
            <Link key={group.contractorId} href={`/billing/ready-to-bill?contractor=${encodeURIComponent(group.contractorId)}`} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md">
              <h2 className="text-lg font-semibold text-slate-950">{group.contractorName}</h2>
              <p className="mt-2 text-sm text-slate-600">{group.readyJobCount} {group.readyJobCount === 1 ? "job" : "jobs"} ready to bill</p>
              {group.invoiceDetailsJobCount ? <p className="mt-1 text-sm font-semibold text-amber-700">{group.invoiceDetailsJobCount} {group.invoiceDetailsJobCount === 1 ? "job needs" : "jobs need"} invoice details</p> : null}
              <p className="mt-1 text-xl font-bold text-slate-950">{group.expectedTotalDisplay}</p>
              {group.blockedJobCount ? <p className="mt-2 text-xs font-semibold text-amber-700">{group.blockedJobCount} additional {group.blockedJobCount === 1 ? "job has" : "jobs have"} a blocker</p> : null}
            </Link>
          ))}
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><Link href="/billing/ready-to-bill" className="text-sm font-semibold text-blue-700 hover:underline">← All contractors</Link><h2 className="mt-1 text-2xl font-bold text-slate-950">{selectedGroup.contractorName}</h2><p className="text-sm text-slate-600">Select at least two compatible jobs.</p></div></div>
          <ReadyToBillSelection group={selectedGroup} requestKey={`consolidated-${randomUUID()}`} />
        </section>
      )}
    </main>
  );
}
