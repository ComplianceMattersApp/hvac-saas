import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { loadContractorBilledInvoice } from "@/lib/portal/contractor-invoice-center";
import { createTenantInvoicePaymentLink } from "@/lib/business/internal-invoice-payments";
import { portalPageClass, portalPanelClass, portalPrimaryButtonClass, portalSecondaryButtonClass } from "@/components/portal/PortalChrome";

function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }

export default async function ContractorInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();
  const detail = await loadContractorBilledInvoice({ invoiceId: id, admin });
  if (!detail) notFound();
  const { invoice, lineItems, summary, portal } = detail;
  let paymentHref: string | null = null;
  if (summary.balanceDueCents > 0) {
    try {
      paymentHref = (await createTenantInvoicePaymentLink({ accountOwnerUserId: portal.accountOwnerUserId, jobId: invoice.job_id, invoiceId: invoice.id, supabase: admin })).paymentLinkUrl;
    } catch { paymentHref = null; }
  }
  const reference = String(invoice.invoice_display_number || invoice.invoice_number || invoice.id);
  return <main className={portalPageClass}><section className={portalPanelClass}>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Contractor invoice</div><h1 className="mt-1 text-2xl font-semibold text-slate-950">Invoice #{reference}</h1><p className="mt-2 text-sm text-slate-600">Billed to {invoice.billing_name || portal.contractorName || "your company"}</p></div><div className="flex flex-wrap gap-2"><Link href="/portal/invoices" className={portalSecondaryButtonClass}>All invoices</Link><Link href={`/portal/invoices/${invoice.id}/print`} className={portalSecondaryButtonClass}>Print / Save PDF</Link>{paymentHref ? <a href={paymentHref} className={portalPrimaryButtonClass}>Pay {money(summary.balanceDueCents)}</a> : null}</div></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs uppercase text-slate-500">Total</div><div className="mt-1 text-xl font-semibold">{money(summary.invoiceTotalCents)}</div></div><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="text-xs uppercase text-emerald-700">Paid</div><div className="mt-1 text-xl font-semibold text-emerald-950">{money(summary.amountPaidCents)}</div></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="text-xs uppercase text-amber-700">Balance due</div><div className="mt-1 text-xl font-semibold text-amber-950">{money(summary.balanceDueCents)}</div></div></div>
    <div className="mt-5 overflow-hidden rounded-xl border border-slate-200"><div className="grid grid-cols-[minmax(0,1fr)_80px_110px] gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-500"><span>Description</span><span className="text-right">Qty</span><span className="text-right">Amount</span></div>{lineItems.map((item: any) => <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_80px_110px] gap-3 border-t border-slate-200 px-4 py-4 text-sm"><div><div className="font-semibold text-slate-900">{item.item_name_snapshot}</div>{item.description_snapshot ? <div className="mt-1 text-xs text-slate-500">{item.description_snapshot}</div> : null}</div><div className="text-right">{Number(item.quantity)}</div><div className="text-right font-semibold">{money(Number(item.line_subtotal))}</div></div>)}</div>
    {!paymentHref && summary.balanceDueCents > 0 ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Online payment is not available for this invoice. Please contact the billing company.</p> : null}
  </section></main>;
}
