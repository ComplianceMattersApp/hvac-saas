import Link from "next/link";
import { listContractorBilledInvoices } from "@/lib/portal/contractor-invoice-center";
import { portalPageClass, portalPanelClass, portalPrimaryButtonClass, portalSecondaryButtonClass } from "@/components/portal/PortalChrome";

function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }

export default async function ContractorInvoicesPage() {
  const invoices = await listContractorBilledInvoices();
  const openCents = invoices.reduce((sum, invoice) => sum + invoice.balanceDueCents, 0);
  return <main className={portalPageClass}>
    <section className={portalPanelClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Contractor billing</div><h1 className="mt-1 text-2xl font-semibold text-slate-950">Invoices billed to your company</h1><p className="mt-2 text-sm text-slate-600">Only invoices where your company is the billing recipient appear here.</p></div><Link href="/portal" className={portalSecondaryButtonClass}>Back to portal</Link></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs uppercase text-slate-500">Invoices</div><div className="mt-1 text-2xl font-semibold">{invoices.length}</div></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="text-xs uppercase text-amber-700">Open balance</div><div className="mt-1 text-2xl font-semibold text-amber-950">{money(openCents)}</div></div></div>
      <div className="mt-5 divide-y divide-slate-200 rounded-xl border border-slate-200">
        {invoices.length ? invoices.map((invoice) => <div key={invoice.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-semibold text-slate-950">Invoice #{invoice.reference}</div><div className="mt-1 text-sm text-slate-600">{invoice.billing_name || "Your company"} · {invoice.paymentStatus === "paid" ? "Paid" : invoice.paymentStatus === "partial" ? "Partially paid" : "Unpaid"}</div></div><div className="flex items-center gap-3"><div className="text-right"><div className="font-semibold">{money(invoice.total_cents)}</div><div className="text-xs text-slate-500">Due {money(invoice.balanceDueCents)}</div></div><Link href={`/portal/invoices/${invoice.id}`} className={portalPrimaryButtonClass}>View invoice</Link></div></div>) : <div className="p-6 text-center text-sm text-slate-500">No invoices are billed to your company.</div>}
      </div>
    </section>
  </main>;
}
