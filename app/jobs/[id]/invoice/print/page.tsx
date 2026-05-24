import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveJobDetailActor } from "@/lib/actions/internal-job-detail-read-boundary";
import { loadScopedInternalJobDetailReadBoundary } from "@/lib/actions/internal-job-detail-read-boundary";
import { type BillingMode, resolveBillingModeByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { resolveInternalInvoiceByJobId } from "@/lib/business/internal-invoice";
import { resolveOperationalTenantIdentity } from "@/lib/email/operational-tenant-branding";
import { formatPersonNamePart } from "@/lib/utils/identity-display";
import PrintToolbar from "./PrintToolbar";

function formatCurrencyFromCents(cents?: number | null) {
  const amount = Number(cents ?? 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatCurrencyFromAmount(amount?: number | null) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(amount ?? 0) || 0);
}

function formatInvoiceDateMMDDYYYY(value?: string | null) {
  const normalized = String(value ?? "").trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return normalized || "N/A";
  return `${match[2]}-${match[3]}-${match[1]}`;
}

function formatInvoiceStatus(status?: string | null) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "issued") return "Issued";
  if (normalized === "void") return "Void";
  return "Draft";
}

function formatBillingAddress(a: {
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
}) {
  return [
    a.billing_address_line1,
    a.billing_address_line2,
    [a.billing_city, a.billing_state, a.billing_zip].filter(Boolean).join(" "),
  ].filter((value) => String(value ?? "").trim().length > 0);
}

export default async function InternalInvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: jobId } = await params;
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

  const invoice = await resolveInternalInvoiceByJobId({ supabase, jobId });
  if (!invoice?.id) notFound();

  const tenantIdentity = await resolveOperationalTenantIdentity({
    accountOwnerUserId: internalUser.account_owner_user_id,
    supabase,
  });

  const location = Array.isArray((job as any).locations)
    ? (job as any).locations.find(Boolean)
    : (job as any).locations;

  const serviceLocationLabel = [
    location?.address_line1,
    location?.address_line2,
    [location?.city, location?.state, location?.zip].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");

  const customerName = formatPersonNamePart(
    [job.customer_first_name, job.customer_last_name].filter(Boolean).join(" ") || "Customer",
  );

  const billingName = String(invoice.billing_name ?? "").trim() || customerName;
  const billingContact = [invoice.billing_email, invoice.billing_phone].filter(Boolean).join(" / ");
  const billingAddress = formatBillingAddress(invoice);
  const hasLogo = String(tenantIdentity.logoUrl ?? "").trim().length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-4 bg-slate-50/40 p-4 text-slate-900 sm:p-6 print:max-w-none print:bg-white print:p-0">
      <PrintToolbar backHref={`/jobs/${jobId}/invoice`} />

      <section className="overflow-hidden rounded-2xl border border-slate-300/80 bg-white shadow-[0_22px_48px_-38px_rgba(15,23,42,0.34)] print:rounded-none print:border-slate-300 print:shadow-none">
        <div className="border-b border-slate-200/90 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.98))] px-6 py-5 print:px-4 print:py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-800">Invoice</div>
          {hasLogo ? (
            <img
              src={String(tenantIdentity.logoUrl)}
              alt=""
              className="mt-2 block max-h-12 max-w-[180px] object-contain"
            />
          ) : (
            <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{tenantIdentity.displayName}</div>
          )}
        </div>

        <div className="px-6 py-5 print:px-4 print:py-4">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 print:text-2xl">Invoice {invoice.invoice_number}</h1>
          <p className="mt-2 text-sm text-slate-600">{job.title || "Service visit"}</p>

          <div className="mt-5 grid gap-4 md:grid-cols-2 print:grid-cols-2 print:gap-x-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 print:border-slate-300 print:bg-white">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Summary</div>
              <dl className="mt-2 space-y-1.5 text-sm text-slate-700">
                <div className="flex items-center justify-between gap-4">
                  <dt>Invoice #</dt>
                  <dd className="font-semibold text-slate-900">{invoice.invoice_number}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt>Invoice Date</dt>
                  <dd className="font-semibold text-slate-900">{formatInvoiceDateMMDDYYYY(invoice.invoice_date)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt>Status</dt>
                  <dd className="font-semibold text-slate-900">{formatInvoiceStatus(invoice.status)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-2 text-base print:border-slate-300">
                  <dt className="font-semibold text-slate-900">Total Due</dt>
                  <dd className="font-bold text-slate-950">{formatCurrencyFromCents(invoice.total_cents)}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 print:border-slate-300 print:bg-white">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Billing Recipient</div>
              <div className="mt-2 text-sm font-semibold text-slate-950">{billingName}</div>
              {billingContact ? <div className="mt-1 text-sm text-slate-600">{billingContact}</div> : null}
              {billingAddress.length > 0 ? <div className="mt-1 text-sm text-slate-600">{billingAddress.join(", ")}</div> : null}
              {serviceLocationLabel ? (
                <div className="mt-3 border-t border-slate-200 pt-2 text-sm text-slate-700 print:border-slate-300">
                  <span className="font-semibold text-slate-900">Service Location:</span> {serviceLocationLabel}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 print:rounded-none print:border-slate-300">
            <div className="grid grid-cols-[minmax(0,2.2fr)_minmax(5rem,0.7fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)] gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500 print:border-slate-300 print:bg-white">
              <div>Description</div>
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
                    className="grid break-inside-avoid grid-cols-[minmax(0,2.2fr)_minmax(5rem,0.7fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)] gap-3 bg-white px-4 py-3 text-sm"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{lineItem.item_name_snapshot}</div>
                      {lineItem.description_snapshot ? (
                        <div className="mt-0.5 text-xs leading-5 text-slate-600">{lineItem.description_snapshot}</div>
                      ) : null}
                    </div>
                    <div className="text-right text-slate-700">{Number(lineItem.quantity ?? 0).toFixed(2)}</div>
                    <div className="text-right text-slate-700">{formatCurrencyFromAmount(lineItem.unit_price)}</div>
                    <div className="text-right font-semibold text-slate-900">{formatCurrencyFromAmount(lineItem.line_subtotal)}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-end gap-6 border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-semibold text-slate-900 print:border-slate-300 print:bg-white">
              <span>Total Due</span>
              <span>{formatCurrencyFromCents(invoice.total_cents)}</span>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700 print:border-slate-300 print:bg-white">
            <p className="font-semibold text-slate-900">Payment + Billing Notice</p>
            <p className="mt-1">Payment entries include manual records and Stripe-confirmed online payments captured via webhook.</p>
            <p className="mt-1">Please contact {tenantIdentity.displayName} for billing questions or payment instructions.</p>
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
