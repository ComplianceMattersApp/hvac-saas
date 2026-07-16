import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/request-identity";
import { requireInternalUser } from "@/lib/auth/internal-user";
import { requireFinancialRegisterAccessOrRedirect } from "@/lib/auth/financial-access";
import { buildAttentionCenterReadModel } from "@/lib/reports/attention-center-read-model";
import ReportCenterTabs from "@/components/reports/ReportCenterTabs";
import { reportPageClass } from "@/components/reports/ReportLedgerChrome";
import { syncAttentionPaymentToQboFromForm } from "@/lib/actions/qbo-sync-actions";
import SubmitButton from "@/components/SubmitButton";

function formatDate(value: string | null) { if (!value) return ""; const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date); }

export default async function AttentionCenterPage({ searchParams }: { searchParams: Promise<{ sync?: string }> }) {
  const supabase = await createClient(); const user = await getRequestUser(); if (!user) redirect("/login");
  const { internalUser } = await requireInternalUser({ supabase, userId: user.id });
  requireFinancialRegisterAccessOrRedirect({ actorUserId: user.id, internalUser, resourceAccountOwnerUserId: internalUser.account_owner_user_id, redirectTo: "/reports/invoices?banner=not_authorized" });
  const model = await buildAttentionCenterReadModel({ admin: supabase, accountOwnerUserId: internalUser.account_owner_user_id });
  const query = await searchParams;
  return <div className={reportPageClass}>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><AlertTriangle className="mt-1 h-6 w-6 text-rose-600" /><div><div className="text-xs font-semibold uppercase tracking-wider text-rose-700">Exception center</div><h1 className="mt-1 text-3xl font-semibold text-slate-950">Needs Attention</h1><p className="mt-2 text-sm text-slate-600">One place to find failed or stalled financial workflows. Each issue states whether money was actually collected and where to resolve it.</p></div></div></section>
    <ReportCenterTabs current="attention" />
    {query.sync ? <div className={`rounded-xl border p-4 text-sm font-semibold ${query.sync === "complete" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-rose-200 bg-rose-50 text-rose-950"}`}>QuickBooks payment sync {query.sync === "complete" ? "completed." : "failed. Review the issue details below."}</div> : null}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[{ label: "Total open", value: model.summaries.total }, { label: "System exceptions", value: model.summaries.systemExceptions }, { label: "Failed attempts", value: model.summaries.failedPaymentAttempts }, { label: "Awaiting confirmation", value: model.summaries.fieldPaymentsAwaitingConfirmation }].map(card => <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs font-semibold uppercase text-slate-500">{card.label}</div><div className="mt-2 text-3xl font-semibold text-slate-950">{card.value}</div></div>)}
    </div>
    {model.summaries.qboConnectionError ? <section className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-950"><div className="font-semibold">QuickBooks connection needs attention</div><p className="mt-1 text-sm">{model.summaries.qboConnectionError}</p><Link href="/ops/admin/company-profile#integrations" className="mt-3 inline-block text-sm font-semibold underline">Reconnect QuickBooks</Link></section> : null}
    <section className="space-y-3">
      {model.items.length ? model.items.map(item => <article key={item.id} className={`rounded-xl border p-4 ${item.severity === "critical" ? "border-rose-200 bg-rose-50/60" : "border-amber-200 bg-amber-50/60"}`}><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="font-semibold text-slate-950">{item.title}</div><div className="mt-1 text-sm text-slate-700">{item.detail}</div><div className="mt-2 rounded-lg border border-white/80 bg-white/70 px-3 py-2 text-xs font-medium text-slate-700">{item.truth}</div></div><div className="shrink-0 text-xs text-slate-500">{formatDate(item.occurredAt)}</div></div><div className="mt-3 flex flex-wrap gap-2">{item.category === "qbo_payment" && item.paymentId ? <form action={syncAttentionPaymentToQboFromForm}><input type="hidden" name="payment_id" value={item.paymentId} /><SubmitButton loadingText="Retrying…" className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white">Retry from hub</SubmitButton></form> : null}<Link href={item.href} className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800">Open details</Link></div></article>) : <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"><div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5" />No system exceptions need attention.</div></div>}
    </section>
    <div className="grid gap-3 md:grid-cols-2"><Link href="/reports/failed-payments" className="rounded-xl border border-slate-200 bg-white p-4"><div className="font-semibold">Failed payment attempts · {model.summaries.failedPaymentAttempts}</div><p className="mt-1 text-sm text-slate-600">Money was not collected. Review declines, authentication, and retry eligibility.</p></Link><Link href="/reports/payment-reconciliation" className="rounded-xl border border-slate-200 bg-white p-4"><div className="font-semibold">Payments awaiting confirmation · {model.summaries.fieldPaymentsAwaitingConfirmation}</div><p className="mt-1 text-sm text-slate-600">Field-reported cash, check, or other payments not yet counted as collected.</p></Link></div>
  </div>;
}
