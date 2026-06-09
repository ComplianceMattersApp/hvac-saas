import Link from "next/link";
import { resolveCheckoutCompleteViewModel } from "@/lib/payments/checkout-complete";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default async function CheckoutCompletePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const jobId = String(Array.isArray(sp.job_id) ? sp.job_id[0] ?? "" : sp.job_id ?? "").trim();
  const invoiceId = String(Array.isArray(sp.invoice_id) ? sp.invoice_id[0] ?? "" : sp.invoice_id ?? "").trim();
  const hasInternalContext = isUuid(jobId) || isUuid(invoiceId);

  const viewModel = resolveCheckoutCompleteViewModel({
    status: String(sp.status ?? "success"),
    jobId,
    invoiceId,
    isInternalUser: hasInternalContext,
  });

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
          Invoice payment
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{viewModel.heading}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{viewModel.body}</p>
        {viewModel.secondaryBody ? (
          <p className="mt-3 text-sm leading-6 text-slate-600">{viewModel.secondaryBody}</p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          {viewModel.actions.map((action) => (
            <Link
              key={`${action.label}-${action.href}`}
              href={action.href}
              className={
                action.variant === "primary"
                  ? "inline-flex items-center rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  : "inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
              }
            >
              {action.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
