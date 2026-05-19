import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import SubmitButton from "@/components/SubmitButton";
import { createClient } from "@/lib/supabase/server";
import { resolveJobDetailActor } from "@/lib/actions/internal-job-detail-read-boundary";
import { loadScopedInternalJobDetailReadBoundary } from "@/lib/actions/internal-job-detail-read-boundary";
import {
  type BillingMode,
  resolveBillingModeByAccountOwnerId,
} from "@/lib/business/internal-business-profile";
import {
  normalizeInternalInvoiceStatus,
  resolveInternalInvoiceByJobId,
  resolveLatestVoidedInternalInvoiceByJobId,
  type InternalInvoiceItemType,
  type InternalInvoiceStatus,
} from "@/lib/business/internal-invoice";
import {
  resolveInternalInvoiceEmailDeliveries,
  type InternalInvoiceEmailDeliveryRecord,
} from "@/lib/business/internal-invoice-delivery";
import {
  resolveInvoiceCollectedPaymentLedger,
  type InternalInvoicePaymentRow,
} from "@/lib/business/internal-invoice-payments";
import {
  addInternalInvoiceLineItemFromForm,
  addInternalInvoiceLineItemFromPricebookForm,
  addInternalInvoiceLineItemsFromVisitScopeForm,
  createInternalInvoiceDraftFromForm,
  issueInternalInvoiceFromForm,
  removeInternalInvoiceLineItemFromForm,
  saveInternalInvoiceDraftFromForm,
  sendInternalInvoiceEmailFromForm,
  updateInternalInvoiceLineItemFromForm,
  voidInternalInvoiceFromForm,
} from "@/lib/actions/internal-invoice-actions";
import { recordInternalInvoicePaymentFromForm } from "@/lib/actions/internal-invoice-payment-actions";
import InternalInvoiceLineItemsTable, {
  InternalInvoiceDraftSaveForm,
} from "../_components/InternalInvoiceLineItemsTable";
import {
  sanitizeVisitScopeItemId,
  sanitizeVisitScopeItems,
} from "@/lib/jobs/visit-scope";
import { formatTimestampDateDisplayLA } from "@/lib/utils/schedule-la";
import { formatPersonNamePart } from "@/lib/utils/identity-display";

type SearchParams = Record<string, string | string[] | undefined>;

const panelClass =
  "rounded-3xl border border-slate-300/80 bg-white shadow-[0_22px_48px_-38px_rgba(15,23,42,0.34)] ring-1 ring-slate-200/70";
const labelClass =
  "mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500";
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,box-shadow,background-color] focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 [color-scheme:light]";
const primaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_28px_-20px_rgba(37,99,235,0.42)] transition-[background-color,box-shadow,transform] hover:bg-blue-700 hover:shadow-[0_18px_30px_-20px_rgba(37,99,235,0.48)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px]";
const secondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]";
const darkButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_28px_-22px_rgba(15,23,42,0.55)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_16px_30px_-22px_rgba(15,23,42,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:translate-y-[0.5px]";
const chipClass =
  "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600";

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

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

function formatDecimalInput(value?: number | null) {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized)) return "0.00";
  return normalized.toFixed(2);
}

function formatInternalInvoiceStatus(status?: InternalInvoiceStatus | null) {
  if (status === "issued") return "Issued";
  if (status === "void") return "Void";
  return "Draft";
}

function formatInternalInvoiceItemType(type?: InternalInvoiceItemType | string | null) {
  const normalized = String(type ?? "").trim().toLowerCase();
  if (!normalized) return "Service";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
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

function bannerMessage(value?: string | null) {
  const key = String(value ?? "").trim().toLowerCase();
  const messages: Record<string, string> = {
    internal_invoice_draft_created: "Draft invoice created.",
    internal_invoice_draft_exists: "A draft invoice already exists for this job.",
    internal_invoice_issued: "Invoice issued. Send it to the billing recipient when ready.",
    internal_invoice_issue_blocked: "Invoice cannot be issued until job and field work are complete.",
    internal_invoice_issue_incomplete: "Review recipient, charges, and total before issuing.",
    internal_invoice_email_sent: "Invoice email sent.",
    internal_invoice_email_resent: "Invoice email resent.",
    internal_invoice_email_failed: "Invoice email failed to send.",
    internal_invoice_send_recipient_required: "Billing recipient email is required before sending.",
    internal_invoice_send_recipient_invalid: "Enter a valid billing recipient email before sending.",
    internal_invoice_payment_recorded: "Tracking-only payment recorded.",
    internal_invoice_payment_overpay_denied: "Payment amount cannot exceed the remaining balance.",
    internal_invoice_voided: "Invoice voided.",
    internal_invoice_missing: "Invoice was not found.",
  };
  return messages[key] ?? null;
}

function readinessRow(label: string, ready: boolean, detail: string) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5">
      <div>
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        <div className="mt-0.5 text-xs leading-5 text-slate-600">{detail}</div>
      </div>
      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
        {ready ? "Ready" : "Needed"}
      </span>
    </div>
  );
}

export default async function InternalInvoiceWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id: jobId } = await params;
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const banner = firstSearchValue(sp.banner);
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
      field_complete,
      job_type,
      ops_status,
      customer_id,
      location_id,
      service_case_id,
      customer_first_name,
      customer_last_name,
      customer_email,
      customer_phone,
      visit_scope_items,
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
  const latestVoidedInternalInvoice = !invoice
    ? await resolveLatestVoidedInternalInvoiceByJobId({ supabase, jobId })
    : null;

  const [internalInvoiceEmailDeliveries, internalInvoicePaymentLedger, pricebookPickerItems] = invoice
    ? await Promise.all([
        resolveInternalInvoiceEmailDeliveries({
          supabase,
          jobId,
          invoiceId: invoice.id,
        }),
        resolveInvoiceCollectedPaymentLedger(
          internalUser.account_owner_user_id,
          invoice.id,
          supabase,
        ),
        invoice.status === "draft"
          ? (async () => {
              const { data: rows, error } = await supabase
                .from("pricebook_items")
                .select("id, item_name, item_type, category, default_description, default_unit_price, unit_label")
                .eq("account_owner_user_id", internalUser.account_owner_user_id)
                .eq("is_active", true)
                .in("item_type", ["service", "material", "diagnostic"])
                .gte("default_unit_price", 0)
                .order("item_name", { ascending: true });
              if (error) throw error;
              return (rows ?? []).map((row: any) => ({
                id: String(row?.id ?? "").trim(),
                item_name: String(row?.item_name ?? "").trim(),
                item_type: String(row?.item_type ?? "").trim() || "service",
                category: String(row?.category ?? "").trim() || null,
                default_description: String(row?.default_description ?? "").trim() || null,
                default_unit_price: Number(row?.default_unit_price ?? 0) || 0,
                unit_label: String(row?.unit_label ?? "").trim() || null,
              }));
            })()
          : Promise.resolve([]),
      ])
    : [[], null, []];

  const rawVisitScopeRows = Array.isArray((job as any).visit_scope_items)
    ? (job as any).visit_scope_items
    : [];
  const existingVisitScopeInvoiceSourceIds = new Set(
    (invoice?.line_items ?? [])
      .filter((lineItem) => lineItem.source_kind === "visit_scope")
      .map((lineItem) => sanitizeVisitScopeItemId(lineItem.source_visit_scope_item_id))
      .filter(Boolean) as string[],
  );
  const visitScopePickerItems = rawVisitScopeRows
    .map((rawRow: any) => {
      const persistedItemId = sanitizeVisitScopeItemId(rawRow?.id);
      if (!persistedItemId) return null;
      let sanitizedRows: ReturnType<typeof sanitizeVisitScopeItems> = [];
      try {
        sanitizedRows = sanitizeVisitScopeItems([rawRow]);
      } catch {
        return null;
      }
      const sanitizedRow = sanitizedRows[0];
      if (!sanitizedRow) return null;
      return {
        id: persistedItemId,
        title: sanitizedRow.title,
        details: sanitizedRow.details,
        kind: sanitizedRow.kind,
        alreadyAdded: existingVisitScopeInvoiceSourceIds.has(persistedItemId),
      };
    })
    .filter(Boolean) as Array<{
      id: string;
      title: string;
      details: string | null;
      kind: "primary" | "companion_service";
      alreadyAdded: boolean;
    }>;

  const customerName = formatPersonNamePart(
    [job.customer_first_name, job.customer_last_name].filter(Boolean).join(" ") || "Customer",
  );
  const location = Array.isArray((job as any).locations)
    ? (job as any).locations.find(Boolean)
    : (job as any).locations;
  const locationLabel = [
    location?.address_line1,
    [location?.city, location?.state, location?.zip].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
  const lineItemCount = invoice?.line_items?.length ?? 0;
  const billingAddress = invoice ? formatBillingAddress(invoice) : [];
  const recipientReady = Boolean(String(invoice?.billing_name ?? "").trim());
  const chargesReady = lineItemCount > 0;
  const totalReady = Number(invoice?.total_cents ?? 0) > 0;
  const jobReady = Boolean(job.field_complete) && String(job.status ?? "").toLowerCase() === "completed";
  const isDraft = invoice?.status === "draft";
  const canIssue = Boolean(invoice && isDraft && recipientReady && chargesReady && totalReady && jobReady);
  const latestSuccessfulInternalInvoiceEmailDelivery =
    (internalInvoiceEmailDeliveries as InternalInvoiceEmailDeliveryRecord[]).find((delivery) => delivery.status === "sent") ?? null;
  const internalInvoicePaymentRows: InternalInvoicePaymentRow[] = internalInvoicePaymentLedger?.rows ?? [];
  const paymentSummary = internalInvoicePaymentLedger?.summary ?? null;
  const paymentStatusLabel = paymentSummary?.paymentStatus === "paid"
    ? "Paid"
    : paymentSummary?.paymentStatus === "partial"
    ? "Partially Paid"
    : "Unpaid";
  const returnTo = `/jobs/${jobId}/invoice#invoice-workspace`;
  const bannerText = bannerMessage(banner);

  return (
    <div id="invoice-workspace" className="mx-auto max-w-[92rem] space-y-5 bg-slate-50/45 p-4 sm:p-5 lg:p-6">
      <section className={`${panelClass} overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.96))] p-5 sm:p-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-800">
              Invoice Workspace
            </div>
            <h1 className="mt-3 text-[clamp(1.45rem,2.2vw,2rem)] font-semibold tracking-[-0.02em] text-slate-950">
              {invoice ? `Invoice ${invoice.invoice_number}` : "Start Internal Invoice"}
            </h1>
            <div className="mt-1 text-sm leading-6 text-slate-600">
              {job.title || "Job"} / {customerName}{locationLabel ? ` / ${locationLabel}` : ""}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className={chipClass}>{invoice ? formatInternalInvoiceStatus(invoice.status) : "No draft"}</span>
              <span className={chipClass}>{lineItemCount} charge{lineItemCount === 1 ? "" : "s"}</span>
              <span className={chipClass}>{formatCurrencyFromCents(invoice?.total_cents ?? 0)}</span>
              {latestSuccessfulInternalInvoiceEmailDelivery ? <span className={chipClass}>Sent</span> : null}
              {paymentSummary ? <span className={chipClass}>{paymentStatusLabel}</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Link href={`/jobs/${jobId}?tab=info#internal-invoice-panel`} className={secondaryButtonClass}>
              Back to Job
            </Link>
            {invoice ? (
              <Link href="#invoice-charges" className={darkButtonClass}>
                Review Charges
              </Link>
            ) : null}
          </div>
        </div>

        {bannerText ? (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3 text-sm text-blue-900">
            {bannerText}
          </div>
        ) : null}

        {latestVoidedInternalInvoice ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-900">
            A previous invoice was voided. Start a replacement draft when the corrected billed scope is ready.
          </div>
        ) : null}
      </section>

      {!invoice ? (
        <section className={`${panelClass} p-5 sm:p-6`}>
          <div className="max-w-3xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Billing Start</div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">No draft invoice yet</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Create a draft invoice to build billed charges from Work Items, Pricebook items, or custom charges.
            </p>
            <form action={createInternalInvoiceDraftFromForm} className="mt-4">
              <input type="hidden" name="job_id" value={jobId} />
              <input type="hidden" name="tab" value="info" />
              <input type="hidden" name="return_to" value={returnTo} />
              <SubmitButton loadingText="Creating..." className={darkButtonClass}>
                Create Draft Invoice
              </SubmitButton>
            </form>
          </div>
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.32fr)_minmax(22rem,0.68fr)]">
          <main className="space-y-5">
            <section id="invoice-charges" className={`${panelClass} p-4 sm:p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">Build Charges</div>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Invoice Charges Review</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Invoice Charges are billed commercial scope. Work Items are operational scope and can be imported as draft charges.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
                  Total {formatCurrencyFromCents(invoice.total_cents)}
                </div>
              </div>

              {invoice.status === "draft" ? (
                <InternalInvoiceLineItemsTable
                  jobId={jobId}
                  tab="info"
                  lineItems={invoice.line_items}
                  totalCents={invoice.total_cents}
                  addLineItemAction={addInternalInvoiceLineItemFromForm}
                  addPricebookLineItemAction={addInternalInvoiceLineItemFromPricebookForm}
                  addVisitScopeLineItemsAction={addInternalInvoiceLineItemsFromVisitScopeForm}
                  updateLineItemAction={updateInternalInvoiceLineItemFromForm}
                  removeLineItemAction={removeInternalInvoiceLineItemFromForm}
                  pricebookPickerItems={pricebookPickerItems}
                  visitScopePickerItems={visitScopePickerItems}
                  workspaceFieldLabelClass={labelClass}
                  workspaceInputClass={inputClass}
                  primaryButtonClass={primaryButtonClass}
                  secondaryButtonClass={secondaryButtonClass}
                />
              ) : (
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/75">
                  {invoice.line_items.length === 0 ? (
                    <div className="px-4 py-4 text-sm text-slate-600">No frozen invoice charges were recorded on this invoice.</div>
                  ) : (
                    <div className="divide-y divide-slate-200/80">
                      {invoice.line_items.map((lineItem, index) => (
                        <div key={lineItem.id} className="bg-white/90 px-4 py-4">
                          <div className="grid gap-3 md:grid-cols-[minmax(0,1.7fr)_minmax(7rem,0.7fr)_minmax(7rem,0.7fr)_minmax(7rem,0.7fr)]">
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Line {index + 1}</div>
                              <div className="mt-1 text-sm font-semibold text-slate-950">{lineItem.item_name_snapshot}</div>
                              {lineItem.description_snapshot ? (
                                <div className="mt-1 text-sm leading-6 text-slate-600">{lineItem.description_snapshot}</div>
                              ) : null}
                            </div>
                            <div className="text-sm text-slate-700">{formatInternalInvoiceItemType(lineItem.item_type_snapshot)}</div>
                            <div className="text-sm text-slate-700">{formatDecimalInput(lineItem.quantity)} x {formatCurrencyFromAmount(lineItem.unit_price)}</div>
                            <div className="text-sm font-semibold text-slate-950">{formatCurrencyFromAmount(lineItem.line_subtotal)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            {invoice.status === "issued" ? (
              <section className={`${panelClass} p-4 sm:p-5`}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Payment Tracking</div>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Tracking-only payment record</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Payment entries are tracking-only and do not charge a card, run ACH, or open customer checkout.
                </p>

                {paymentSummary ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Payment Status</div>
                      <div className="mt-0.5 text-sm font-semibold text-slate-900">{paymentStatusLabel}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Paid</div>
                      <div className="mt-0.5 text-sm font-semibold text-slate-900">{formatCurrencyFromCents(paymentSummary.amountPaidCents)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Balance</div>
                      <div className="mt-0.5 text-sm font-semibold text-slate-900">{formatCurrencyFromCents(paymentSummary.balanceDueCents)}</div>
                    </div>
                  </div>
                ) : null}

                <form action={recordInternalInvoicePaymentFromForm} className="mt-4 space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                  <input type="hidden" name="job_id" value={jobId} />
                  <input type="hidden" name="tab" value="info" />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Amount</label>
                      <input name="payment_amount" inputMode="decimal" placeholder="0.00" className={inputClass} required />
                    </div>
                    <div>
                      <label className={labelClass}>Payment Method</label>
                      <select name="payment_method" className={inputClass} defaultValue="" required>
                        <option value="" disabled>Select method</option>
                        <option value="cash">Cash</option>
                        <option value="check">Check</option>
                        <option value="ach_off_platform">ACH (Off-Platform)</option>
                        <option value="card_off_platform">Card (Off-Platform)</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Reference</label>
                      <input name="received_reference" placeholder="Check # or confirmation" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Payment recorded note</label>
                      <input name="notes" placeholder="Optional note" className={inputClass} />
                    </div>
                  </div>
                  <SubmitButton
                    loadingText="Recording..."
                    className={darkButtonClass}
                    disabled={!paymentSummary || paymentSummary.balanceDueCents <= 0}
                  >
                    Record Payment
                  </SubmitButton>
                </form>

                {internalInvoicePaymentRows.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {internalInvoicePaymentRows.slice(0, 6).map((payment) => (
                      <div key={payment.id} className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm text-slate-700">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">{formatCurrencyFromCents(payment.amount_cents)}</span>
                          <span className="text-xs text-slate-500">{formatTimestampDateDisplayLA(payment.paid_at)}</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{String(payment.payment_method).replace(/_/g, " ")}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}
          </main>

          <aside className="space-y-5">
            <section className={`${panelClass} p-4 sm:p-5`}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Ready to Issue</div>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{canIssue ? "Ready to issue" : "Needs review"}</h2>
              <div className="mt-3 space-y-2">
                {readinessRow("Billing recipient", recipientReady, recipientReady ? String(invoice.billing_name) : "Add a billing name.")}
                {readinessRow("Charges", chargesReady, chargesReady ? `${lineItemCount} charge${lineItemCount === 1 ? "" : "s"} added.` : "Needs at least 1 charge.")}
                {readinessRow("Total", totalReady, totalReady ? formatCurrencyFromCents(invoice.total_cents) : "Total must be above $0.00.")}
                {readinessRow("Job closeout", jobReady, jobReady ? "Job and field work are complete." : "Job must be completed and field complete.")}
              </div>
              {invoice.status === "draft" ? (
                <form action={issueInternalInvoiceFromForm} className="mt-4">
                  <input type="hidden" name="job_id" value={jobId} />
                  <input type="hidden" name="tab" value="info" />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <SubmitButton loadingText="Issuing..." className={`${darkButtonClass} w-full`} disabled={!canIssue}>
                    Issue Invoice
                  </SubmitButton>
                </form>
              ) : (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/75 px-3 py-2.5 text-sm text-emerald-900">
                  This invoice is issued. Charges are frozen as the billed record.
                </div>
              )}
            </section>

            <section className={`${panelClass} p-4 sm:p-5`}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Billing Recipient</div>
              <div className="mt-2 text-sm font-semibold text-slate-950">{invoice.billing_name || "Billing recipient not set"}</div>
              <div className="mt-1 text-sm leading-6 text-slate-600">
                {[invoice.billing_email, invoice.billing_phone].filter(Boolean).join(" / ") || "No email or phone set"}
              </div>
              {billingAddress.length > 0 ? (
                <div className="mt-2 text-sm leading-6 text-slate-600">{billingAddress.join(", ")}</div>
              ) : null}

              {invoice.status === "draft" ? (
                <details className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-800">Edit Billing Details</summary>
                  <InternalInvoiceDraftSaveForm action={saveInternalInvoiceDraftFromForm} className="mt-3 space-y-3">
                    <input type="hidden" name="job_id" value={jobId} />
                    <input type="hidden" name="tab" value="info" />
                    <div>
                      <label className={labelClass}>Invoice #</label>
                      <input name="invoice_number" defaultValue={invoice.invoice_number} className={inputClass} required />
                    </div>
                    <div>
                      <label className={labelClass}>Billing Name</label>
                      <input name="billing_name" defaultValue={invoice.billing_name ?? ""} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Billing Email</label>
                      <input type="email" name="billing_email" defaultValue={invoice.billing_email ?? ""} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Billing Phone</label>
                      <input name="billing_phone" defaultValue={invoice.billing_phone ?? ""} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Address Line 1</label>
                      <input name="billing_address_line1" defaultValue={invoice.billing_address_line1 ?? ""} className={inputClass} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className={labelClass}>City</label>
                        <input name="billing_city" defaultValue={invoice.billing_city ?? ""} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>State</label>
                        <input name="billing_state" defaultValue={invoice.billing_state ?? ""} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>ZIP</label>
                        <input name="billing_zip" defaultValue={invoice.billing_zip ?? ""} className={inputClass} />
                      </div>
                    </div>
                    <SubmitButton loadingText="Saving..." className={secondaryButtonClass}>
                      Save Billing Details
                    </SubmitButton>
                  </InternalInvoiceDraftSaveForm>
                </details>
              ) : null}
            </section>

            {invoice.status === "issued" ? (
              <section className={`${panelClass} p-4 sm:p-5`}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Send / Resend</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Invoice issue and invoice send are separate steps. Sending is communication-only and does not create a second invoice or change charge lines.
                </p>
                <form action={sendInternalInvoiceEmailFromForm} className="mt-3 space-y-3">
                  <input type="hidden" name="job_id" value={jobId} />
                  <input type="hidden" name="tab" value="info" />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <div>
                    <label className={labelClass}>Send To</label>
                    <input type="email" name="recipient_email" defaultValue={invoice.billing_email ?? ""} placeholder="billing@example.com" className={inputClass} required />
                  </div>
                  <SubmitButton loadingText="Sending..." className={secondaryButtonClass}>
                    {latestSuccessfulInternalInvoiceEmailDelivery ? "Send Again" : "Send Invoice Email"}
                  </SubmitButton>
                </form>

                {internalInvoiceEmailDeliveries.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {(internalInvoiceEmailDeliveries as InternalInvoiceEmailDeliveryRecord[]).slice(0, 5).map((delivery) => (
                      <div key={delivery.id} className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-700">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">
                            {delivery.attemptKind === "resent" ? `Resend #${delivery.attemptNumber}` : `Send #${delivery.attemptNumber}`}
                          </span>
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                              delivery.status === "sent"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : delivery.status === "failed"
                                ? "border-rose-200 bg-rose-50 text-rose-800"
                                : "border-amber-200 bg-amber-50 text-amber-800"
                            }`}
                          >
                            {delivery.status}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {delivery.recipientEmail || "Recipient unavailable"}
                          {delivery.createdAt ? ` • ${formatTimestampDateDisplayLA(delivery.createdAt)}` : ""}
                        </div>
                        {delivery.status === "failed" && delivery.errorDetail ? (
                          <div className="mt-1 text-xs text-rose-700">{delivery.errorDetail}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className={`${panelClass} p-4 sm:p-5`}>
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-slate-800">More actions</summary>
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/70 p-3">
                  <div className="text-sm font-semibold text-rose-900">Danger zone</div>
                  <p className="mt-1 text-xs leading-5 text-rose-900/90">
                    Voiding keeps the invoice in history. Issued invoice voids also reopen billing closeout truth.
                  </p>
                  <form action={voidInternalInvoiceFromForm} className="mt-3 space-y-3">
                    <input type="hidden" name="job_id" value={jobId} />
                    <input type="hidden" name="tab" value="info" />
                    <input type="hidden" name="return_to" value={returnTo} />
                    <div>
                      <label className={labelClass}>Void Reason</label>
                      <textarea name="void_reason" rows={3} className={`${inputClass} min-h-[5rem]`} placeholder="Optional reason" />
                    </div>
                    <SubmitButton loadingText="Voiding..." className="inline-flex min-h-10 items-center justify-center rounded-lg border border-rose-600 bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700" disabled={invoice.status === "void"}>
                      Void Invoice
                    </SubmitButton>
                  </form>
                </div>
              </details>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
