import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveJobDetailActor } from "@/lib/actions/internal-job-detail-read-boundary";
import { loadScopedInternalJobDetailReadBoundary } from "@/lib/actions/internal-job-detail-read-boundary";
import { type BillingMode, resolveBillingModeByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { resolveInternalInvoiceById, resolveInternalInvoiceByJobId } from "@/lib/business/internal-invoice";
import { resolveInvoiceCollectedPaymentLedger } from "@/lib/business/internal-invoice-payments";
import { resolveOperationalTenantIdentity } from "@/lib/email/operational-tenant-branding";
import {
  buildInternalInvoiceDocumentModel,
  formatInvoiceDocumentCurrencyFromAmount,
  formatInvoiceDocumentCurrencyFromCents,
} from "@/lib/business/internal-invoice-document";
import PrintToolbar from "./PrintToolbar";

export default async function InternalInvoicePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: jobId } = await params;
  const requestedInvoiceIdValue = (searchParams ? await searchParams : {})?.invoice_id;
  const requestedInvoiceId = String(Array.isArray(requestedInvoiceIdValue) ? requestedInvoiceIdValue[0] : requestedInvoiceIdValue ?? "").trim();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const actorResolution = await resolveJobDetailActor({
    supabase,
    userId: user.id,
  });

  if (actorResolution.kind === "contractor") {
    redirect(`/portal/jobs/${jobId}`);
  }

  if (actorResolution.kind !== "internal" || !actorResolution.internalUser) {
    redirect("/login");
  }

  const internalUser = actorResolution.internalUser;
  const scopedReadJob = await loadScopedInternalJobDetailReadBoundary({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
  });

  if (!scopedReadJob?.id) notFound();

  const billingMode: BillingMode = await resolveBillingModeByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  if (billingMode !== "internal_invoicing") {
    redirect(`/jobs/${jobId}?tab=info&banner=internal_invoicing_billing_pending#internal-invoice-panel`);
  }

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select(`
      id,
      title,
      status,
      customer_first_name,
      customer_last_name,
      billing_recipient,
      location_id,
      locations:location_id (
        address_line1,
        address_line2,
        city,
        state,
        zip
      )
    `)
    .eq("id", jobId)
    .single();

  if (jobErr) throw jobErr;
  if (!job?.id) notFound();

  const requestedInvoice = requestedInvoiceId
    ? await resolveInternalInvoiceById({ supabase, invoiceId: requestedInvoiceId })
    : null;
  const canUseRequestedInvoice = Boolean(
    requestedInvoice
    && requestedInvoice.job_id === jobId
    && requestedInvoice.account_owner_user_id === internalUser.account_owner_user_id,
  );
  const invoice = canUseRequestedInvoice
    ? requestedInvoice
    : await resolveInternalInvoiceByJobId({ supabase, jobId });
  if (!invoice?.id) notFound();

  const paymentLedger = await resolveInvoiceCollectedPaymentLedger(
    internalUser.account_owner_user_id,
    invoice.id,
    supabase,
  );
  const paymentSummary = paymentLedger.summary;

  const tenantIdentity = await resolveOperationalTenantIdentity({
    accountOwnerUserId: internalUser.account_owner_user_id,
    supabase,
  });

  const jobWithLocations = job as typeof job & {
    locations?: Array<{ address_line1?: string | null; address_line2?: string | null; city?: string | null; state?: string | null; zip?: string | null }> | {
      address_line1?: string | null; address_line2?: string | null; city?: string | null; state?: string | null; zip?: string | null;
    } | null;
  };
  const location = Array.isArray(jobWithLocations.locations)
    ? jobWithLocations.locations.find(Boolean)
    : jobWithLocations.locations;
  const documentModel = buildInternalInvoiceDocumentModel({
    invoice,
    job,
    location,
    paymentSummary,
    tenantIdentity,
  });
  const customerFacingStatus = documentModel.statusLabel;
  const serviceLocationLabel = documentModel.serviceLocation;
  const customerName = documentModel.customerName;
  const billingName = documentModel.billing.name;
  const billingEmail = documentModel.billing.email;
  const billingPhone = documentModel.billing.phone;
  const billingAddress = documentModel.billing.addressLines;
  const hasLogo = Boolean(documentModel.business.logoUrl);
  const invoiceReference = documentModel.invoiceReference;

  return (
    <div className="mx-auto max-w-5xl space-y-4 bg-slate-50/40 p-4 text-slate-900 sm:p-6 print:max-w-none print:bg-white print:p-0">
      <PrintToolbar backHref={`/jobs/${jobId}/invoice${invoice ? `?invoice_id=${encodeURIComponent(invoice.id)}` : ""}#invoice-workspace`} />

      <section className="overflow-hidden rounded-2xl border border-slate-300/80 bg-white shadow-[0_22px_48px_-38px_rgba(15,23,42,0.34)] print:rounded-none print:border-slate-300 print:shadow-none">
        <div className="border-b border-slate-200/90 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.98))] px-6 py-5 print:px-4 print:py-4">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between sm:gap-6 print:flex-row print:justify-between">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-800">Invoice</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 print:text-2xl">{invoiceReference}</h1>
              <p className="mt-2 text-sm text-slate-600">{job.title || "Service visit"}</p>
            </div>
            <div className="flex min-w-0 shrink-0 justify-start text-left sm:min-w-[9rem] sm:justify-end sm:text-right print:min-w-[9rem] print:justify-end print:text-right">
              {hasLogo ? (
                <img
                  src={String(tenantIdentity.logoUrl)}
                  alt={tenantIdentity.displayName}
                  className="block max-h-16 max-w-[180px] object-contain"
                />
              ) : (
                <div className="text-xl font-semibold tracking-tight text-slate-950">{tenantIdentity.displayName}</div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-5 print:px-4 print:py-4">
          <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2 print:gap-x-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 print:border-slate-300 print:bg-white">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Summary</div>
              <dl className="mt-2 space-y-1.5 text-sm text-slate-700">
                <div className="flex items-center justify-between gap-4">
                  <dt>Invoice</dt>
                  <dd className="font-semibold text-slate-900">{invoiceReference}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt>Invoice Date</dt>
                  <dd className="font-semibold text-slate-900">{documentModel.invoiceDateLabel}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt>Status</dt>
                  <dd className={`font-semibold ${paymentSummary.paymentStatus === "paid" ? "text-emerald-700" : "text-slate-900"}`}>{customerFacingStatus}</dd>
                </div>
                {paymentSummary.amountPaidCents > 0 ? (
                  <div className="flex items-center justify-between gap-4">
                    <dt>Amount Paid</dt>
                    <dd className="font-semibold text-emerald-700">{documentModel.amountPaidLabel}</dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-2 text-base print:border-slate-300">
                  <dt className="font-semibold text-slate-900">Balance Due</dt>
                  <dd className={`font-bold ${paymentSummary.paymentStatus === "paid" ? "text-emerald-700" : "text-slate-950"}`}>{documentModel.balanceDueLabel}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 print:border-slate-300 print:bg-white">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Billing Recipient</div>
              <div className="mt-2 text-sm font-semibold text-slate-950">{billingName}</div>
              {billingEmail ? <div className="mt-1 text-sm text-slate-600">{billingEmail}</div> : null}
              {billingPhone ? <div className="mt-1 text-sm text-slate-600">{billingPhone}</div> : null}
              {billingAddress.length > 0 ? (
                <div className="mt-2 space-y-0.5 text-sm text-slate-600">
                  {billingAddress.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 border-t border-slate-200 pt-2 text-sm text-slate-700 print:border-slate-300">
                Service details are listed by line item below.
              </div>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 print:rounded-none print:border-slate-300">
            <div className="divide-y divide-slate-200 md:hidden print:hidden">
              {invoice.line_items.length === 0 ? (
                <div className="px-4 py-4 text-sm text-slate-600">No billed line items were recorded.</div>
              ) : invoice.line_items.map((lineItem, index) => (
                <article key={lineItem.id} className="bg-white px-4 py-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Line {index + 1}</div>
                  <div className="mt-1 font-semibold text-slate-950">{lineItem.item_name_snapshot}</div>
                  {lineItem.description_snapshot ? (
                    <div className="mt-1 text-sm leading-5 text-slate-600">{lineItem.description_snapshot}</div>
                  ) : null}
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div className="col-span-2">
                      <dt className="text-xs text-slate-500">Service Location</dt>
                      <dd className="mt-0.5 break-words text-slate-800">{serviceLocationLabel || "Service location unavailable"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Quantity</dt>
                      <dd className="mt-0.5 font-medium text-slate-900">{Number(lineItem.quantity ?? 0).toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Unit Price</dt>
                      <dd className="mt-0.5 font-medium text-slate-900">{formatInvoiceDocumentCurrencyFromAmount(lineItem.unit_price)}</dd>
                    </div>
                    <div className="col-span-2 border-t border-slate-100 pt-2">
                      <dt className="text-xs text-slate-500">Subtotal</dt>
                      <dd className="mt-0.5 text-base font-semibold text-slate-950">{formatInvoiceDocumentCurrencyFromAmount(lineItem.line_subtotal)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
            <div className="hidden md:block print:block">
            <div className="grid grid-cols-[minmax(0,1.65fr)_minmax(0,1.35fr)_minmax(0,0.9fr)_minmax(4.5rem,0.5fr)_minmax(6.5rem,0.65fr)_minmax(6.5rem,0.65fr)] gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500 print:border-slate-300 print:bg-white">
              <div>Description</div>
              <div>Service Location</div>
              <div>Customer</div>
              <div className="text-right">Qty</div>
              <div className="text-right">Unit Price</div>
              <div className="text-right">Subtotal</div>
            </div>
            {invoice.line_items.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-600">No billed line items were recorded.</div>
            ) : (
              <div className="divide-y divide-slate-200 print:divide-slate-300">
                {invoice.line_items.map((lineItem) => (
                  <div
                    key={lineItem.id}
                    className="grid break-inside-avoid grid-cols-[minmax(0,1.65fr)_minmax(0,1.35fr)_minmax(0,0.9fr)_minmax(4.5rem,0.5fr)_minmax(6.5rem,0.65fr)_minmax(6.5rem,0.65fr)] gap-3 bg-white px-4 py-3 text-sm"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{lineItem.item_name_snapshot}</div>
                      {lineItem.description_snapshot ? (
                        <div className="mt-0.5 text-xs leading-5 text-slate-600">{lineItem.description_snapshot}</div>
                      ) : null}
                    </div>
                    <div className="text-slate-700">{serviceLocationLabel || "Service location unavailable"}</div>
                    <div className="text-slate-700">{customerName}</div>
                    <div className="text-right text-slate-700">{Number(lineItem.quantity ?? 0).toFixed(2)}</div>
                    <div className="text-right text-slate-700">{formatInvoiceDocumentCurrencyFromAmount(lineItem.unit_price)}</div>
                    <div className="text-right font-semibold text-slate-900">{formatInvoiceDocumentCurrencyFromAmount(lineItem.line_subtotal)}</div>
                  </div>
                ))}
              </div>
            )}
            </div>
            <div className="flex items-center justify-end gap-6 border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-semibold text-slate-900 print:border-slate-300 print:bg-white">
              <span>{paymentSummary.paymentStatus === "paid" ? "Paid in Full" : "Balance Due"}</span>
              <span className={paymentSummary.paymentStatus === "paid" ? "text-emerald-700" : undefined}>{formatInvoiceDocumentCurrencyFromCents(paymentSummary.balanceDueCents)}</span>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500 print:border-slate-300">
            <p>
              Questions? Contact {tenantIdentity.displayName}
              {[tenantIdentity.supportEmail, tenantIdentity.supportPhone].filter(Boolean).length > 0
                ? ` at ${[tenantIdentity.supportEmail, tenantIdentity.supportPhone].filter(Boolean).join(" or ")}`
                : ""}
              .
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
