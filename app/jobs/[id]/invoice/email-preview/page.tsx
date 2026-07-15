import Link from "next/link";
import { notFound } from "next/navigation";
import { loadInternalInvoiceCustomerEmailPreview } from "@/lib/actions/internal-invoice-actions";
import CustomerEmailFrame from "./CustomerEmailFrame";

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InternalInvoiceCustomerEmailPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id: jobId } = await params;
  const query = await searchParams;
  const invoiceId = String(firstValue(query.invoice_id) ?? "").trim();
  if (!jobId || !invoiceId) notFound();

  const previewFormData = new FormData();
  previewFormData.set("job_id", jobId);
  previewFormData.set("invoice_id", invoiceId);
  previewFormData.set("tab", "info");
  const preview = await loadInternalInvoiceCustomerEmailPreview(previewFormData);
  const backHref = `/jobs/${jobId}/invoice?invoice_id=${encodeURIComponent(invoiceId)}#invoice-workspace`;

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">Customer Email Preview</div>
              <h1 className="mt-1 text-xl font-semibold text-slate-950">{preview.invoiceReference}</h1>
              <dl className="mt-3 grid gap-2 text-sm text-slate-700">
                <div><dt className="inline font-semibold text-slate-950">To:</dt> <dd className="inline">{preview.recipientEmail || "Recipient unavailable"}</dd></div>
                <div><dt className="inline font-semibold text-slate-950">Subject:</dt> <dd className="inline">{preview.subject}</dd></div>
              </dl>
            </div>
            <Link
              href={backHref}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Back to Invoice
            </Link>
          </div>
          <div className={`mt-4 rounded-xl border px-3 py-2 text-sm ${preview.paymentUrl ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
            {preview.paymentUrl
              ? "Online payment is included. The email below contains the active Pay Invoice button."
              : "Online payment is not included. Do not send until the payment configuration is reviewed."}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Exact email body
          </div>
          <CustomerEmailFrame html={preview.html} title={`${preview.invoiceReference} customer email`} />
        </section>
      </div>
    </main>
  );
}
