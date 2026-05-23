// app/estimates/[id]/page.tsx
// Compliance Matters: Internal-only estimate detail page.
// Account-owner scoped via getEstimateById. Draft-only line management.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ClipboardList, Eye, Layers3, Link2, ListChecks, Shield, Sparkles, Workflow } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  requireInternalUser,
  isInternalAccessError,
} from "@/lib/auth/internal-user";
import {
  formatEstimateEventLabel,
  formatEstimateEventSummary,
} from "@/lib/estimates/estimate-activity";
import {
  buildEstimateDocumentViewModel,
  buildEstimateQuoteReadinessChecklist,
  ESTIMATE_DOCUMENT_DISCLAIMERS,
  ESTIMATE_DOCUMENT_READINESS_GUIDANCE,
  ESTIMATE_REVISION_PLANNING_DEFAULTS,
} from "@/lib/estimates/estimate-document";
import { getEstimateById } from "@/lib/estimates/estimate-read";
import { isEstimatesEnabled } from "@/lib/estimates/estimate-exposure";
import {
  removeLineItemFromForm,
  transitionEstimateStatusFromForm,
  sendEstimateFromForm,
  recordEstimateApprovalResponseFromForm,
  convertEstimateToJobFromForm,
  convertEstimateToInvoiceDraftFromForm,
} from "./actions";
import AddLineItemForm from "./AddLineItemForm";
import EstimateStatusActionForm from "./EstimateStatusActionForm";
import EstimateApprovalResponseForm from "./EstimateApprovalResponseForm";
import SendEstimateForm from "./SendEstimateForm";
import CreateDefaultOptionsForm from "./CreateDefaultOptionsForm";
import EditEstimateOptionForm from "./EditEstimateOptionForm";
import AddEstimateOptionLineForm from "./AddEstimateOptionLineForm";
import { removeEstimateOptionLineItemFromForm } from "./actions";
import { isEstimateEmailSendEnabled } from "@/lib/estimates/estimate-exposure";

export const metadata = { title: "Estimate" };

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100
  );
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "draft": return "bg-slate-100 text-slate-700";
    case "sent": return "bg-blue-100 text-blue-700";
    case "approved": return "bg-emerald-100 text-emerald-700";
    case "declined": return "bg-red-100 text-red-700";
    case "expired": return "bg-amber-100 text-amber-700";
    case "cancelled": return "bg-slate-200 text-slate-600";
    case "converted": return "bg-violet-100 text-violet-700";
    default: return "bg-slate-100 text-slate-700";
  }
}

function statusLabel(status: string) {
  const s = String(status ?? "").trim();
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function statusGuidanceMessage(status: string) {
  switch (status) {
    case "draft":
      return "Draft is editable. Add or adjust items before marking this estimate as sent.";
    case "sent":
      return "Sent estimates are locked for editing until the status changes.";
    case "approved":
      return "Approved estimates are ready for conversion to a job when available.";
    case "declined":
      return "This estimate has been marked declined.";
    case "expired":
      return "This estimate has expired.";
    case "cancelled":
      return "This estimate has been cancelled.";
    case "converted":
      return "This estimate has already been converted to a job.";
    default:
      return null;
  }
}

type CustomerRow = { id: string; full_name: string | null; first_name: string | null; last_name: string | null; email: string | null };
type LocationRow = { id: string; address_line1: string | null; city: string | null; state: string | null; zip: string | null; nickname: string | null };
type EventRow = { id: string; event_type: string; meta: Record<string, unknown> | null; user_id: string | null; created_at: string };
type CommunicationRow = {
  id: string;
  recipient_email_snapshot: string;
  subject_snapshot: string;
  attempt_status: string;
  attempt_error: string | null;
  provider_name: string | null;
  attempted_at: string;
};
type PricebookPickerRow = {
  id: string;
  item_name: string;
  item_type: string;
  category: string | null;
  default_description: string | null;
  default_unit_price: number;
  unit_label: string | null;
};

export default async function EstimateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const search = searchParams ? await searchParams : undefined;
  const notice = String(search?.notice ?? "").trim();

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  let internalUser: Awaited<ReturnType<typeof requireInternalUser>>["internalUser"];
  try {
    const result = await requireInternalUser({ supabase, userId: userData.user.id });
    internalUser = result.internalUser;
  } catch (error) {
    if (isInternalAccessError(error)) redirect("/login");
    throw error;
  }

  if (!isEstimatesEnabled()) {
    redirect("/ops?notice=estimates_unavailable");
  }

  const estimate = await getEstimateById({ estimateId: id, internalUser, supabase });
  if (!estimate) notFound();

  const isMultiOptionProposal = estimate.proposalMode === "multi_option_packages";

  const isDraft = estimate.status === "draft";
  const isSent = estimate.status === "sent";
  const isApproved = estimate.status === "approved";
  const isConverted = estimate.status === "converted";
  const canConvertToJob =
    isApproved && estimate.conversionSchemaReady && !estimate.converted_job_id;
  let hasActiveNonVoidInvoiceForConvertedJob = false;

  async function submitRemoveOptionLine(formData: FormData) {
    "use server";
    await removeEstimateOptionLineItemFromForm(formData);
  }

  async function submitConvertEstimateToJob(formData: FormData) {
    "use server";
    const estimateId = String(formData.get("estimate_id") ?? "").trim();
    if (!estimateId) return;

    const result = await convertEstimateToJobFromForm(formData);
    if (!result?.success) {
      const encoded = encodeURIComponent(String(result?.error ?? "estimate_conversion_failed"));
      redirect(`/estimates/${estimateId}?notice=${encoded}`);
    }

    redirect(`/estimates/${estimateId}?notice=estimate_converted_to_job`);
  }

  async function submitConvertEstimateToInvoiceDraft(formData: FormData) {
    "use server";
    const estimateId = String(formData.get("estimate_id") ?? "").trim();
    if (!estimateId) return;

    const result = await convertEstimateToInvoiceDraftFromForm(formData);
    if (!result?.success) {
      const encoded = encodeURIComponent(String(result?.error ?? "estimate_invoice_conversion_failed"));
      redirect(`/estimates/${estimateId}?notice=${encoded}`);
    }

    redirect(`/estimates/${estimateId}?notice=estimate_converted_to_invoice_draft`);
  }

  const statusMessage = statusGuidanceMessage(estimate.status);
  const statusPanelTitle = isDraft
    ? "Editable proposal"
    : isSent
      ? "Sent and locked"
      : "Completed state";
  let pricebookItems: PricebookPickerRow[] = [];

  if (isDraft) {
    const { data: pricebookRaw, error: pricebookError } = await supabase
      .from("pricebook_items")
      .select("id, item_name, item_type, category, default_description, default_unit_price, unit_label")
      .eq("account_owner_user_id", internalUser.account_owner_user_id)
      .eq("is_active", true)
      .neq("item_type", "adjustment")
      .gte("default_unit_price", 0)
      .order("category", { ascending: true })
      .order("item_name", { ascending: true });
    if (pricebookError) throw pricebookError;

    pricebookItems = (pricebookRaw ?? []) as PricebookPickerRow[];
  }

  // Load customer and location names for context display
  let customerName: string | null = null;
  let customerEmail: string | null = null;
  let locationDisplay: string | null = null;

  if (estimate.customer_id) {
    const { data: cRow } = await supabase
      .from("customers")
      .select("id, full_name, first_name, last_name, email")
      .eq("id", estimate.customer_id)
      .maybeSingle();
    const c = cRow as CustomerRow | null;
    if (c) {
      customerName =
        String(c.full_name ?? "").trim() ||
        [c.first_name, c.last_name].filter(Boolean).join(" ") ||
        "Customer";
      customerEmail = String(c.email ?? "").trim() || null;
    }
  }

  if (estimate.location_id) {
    const { data: lRow } = await supabase
      .from("locations")
      .select("id, address_line1, city, state, zip, nickname")
      .eq("id", estimate.location_id)
      .maybeSingle();
    const l = lRow as LocationRow | null;
    if (l) {
      locationDisplay =
        l.nickname ||
        [l.address_line1, l.city, l.state].filter(Boolean).join(", ") ||
        "Location";
    }
  }

  // Load recent estimate events (last 10)
  const { data: eventsRaw } = await supabase
    .from("estimate_events")
    .select("id, event_type, meta, user_id, created_at")
    .eq("estimate_id", id)
    .order("created_at", { ascending: false })
    .limit(10);
  const events = (eventsRaw ?? []) as EventRow[];

  // Load recent communication attempts (last 10)
  const { data: commsRaw } = await supabase
    .from("estimate_communications")
    .select("id, recipient_email_snapshot, subject_snapshot, attempt_status, attempt_error, provider_name, attempted_at")
    .eq("estimate_id", id)
    .eq("account_owner_user_id", internalUser.account_owner_user_id)
    .order("attempted_at", { ascending: false })
    .limit(10);
  const communications = (commsRaw ?? []) as CommunicationRow[];

  const emailSendEnabled = isEstimateEmailSendEnabled();
  const documentView = buildEstimateDocumentViewModel({
    estimate,
    customerName,
    locationDisplay,
  });
  const readinessChecklist = buildEstimateQuoteReadinessChecklist({
    documentView,
    scopeSummary: estimate.notes,
    customerEmail,
    isEmailSendEnabled: emailSendEnabled,
  });

  let convertedJobTitle: string | null = null;
  let convertedInvoiceId: string | null =
    String(estimate.converted_invoice_id ?? "").trim() || null;
  let convertedInvoiceNumber: string | null = null;
  if (estimate.converted_job_id) {
    const { data: convertedJob } = await supabase
      .from("jobs")
      .select("id, title")
      .eq("id", estimate.converted_job_id)
      .maybeSingle();

    if (convertedJob?.id) {
      convertedJobTitle = String(convertedJob.title ?? "").trim() || "Converted Job";
    }

    const { data: activeInvoice } = await supabase
      .from("internal_invoices")
      .select("id, invoice_number, source_estimate_id, status")
      .eq("job_id", estimate.converted_job_id)
      .neq("status", "void")
      .maybeSingle();

    if (activeInvoice?.id) {
      hasActiveNonVoidInvoiceForConvertedJob = true;
      if (!convertedInvoiceId) {
        convertedInvoiceId = String(activeInvoice.id ?? "").trim() || null;
      }
      convertedInvoiceNumber = String(activeInvoice.invoice_number ?? "").trim() || null;
    }
  }

  const canConvertToInvoiceDraft =
    (isConverted || isApproved) &&
    Boolean(estimate.converted_job_id) &&
    Boolean(estimate.invoiceConversionSchemaReady) &&
    !convertedInvoiceId &&
    !hasActiveNonVoidInvoiceForConvertedJob;

  const invoiceWorkspaceHref = estimate.converted_job_id
    ? `/jobs/${estimate.converted_job_id}/invoice`
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 print:mx-0 print:max-w-none print:space-y-3 print:bg-white print:p-0 print:text-black">
      {notice && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 print:hidden">
          {notice === "estimate_converted_to_job"
            ? "Estimate converted to job successfully."
            : notice === "estimate_converted_to_invoice_draft"
              ? "Draft invoice created from this estimate successfully."
            : notice === "estimate_conversion_schema_unavailable"
              ? "Estimate conversion is unavailable until the conversion schema migration is applied."
              : notice === "invoice_conversion_schema_unavailable"
                ? "Invoice conversion is unavailable until the invoice conversion schema migration is applied."
              : notice === "selected_option_id is required before converting multi-option estimates."
                ? "Select an approved option before converting this multi-option estimate."
                : `Estimate conversion notice: ${notice}`}
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500 print:hidden">
        <div>
          <Link href="/estimates" className="hover:text-slate-900">
            Estimates
          </Link>
          <span className="mx-1.5">›</span>
          <span className="font-mono text-slate-700">{documentView.identity.estimateNumber}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/estimates/${estimate.id}/print`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-[background-color,border-color,transform] hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]"
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            Preview Proposal
          </Link>
          {estimate.customer_id && (
            <Link
              href={`/customers/${estimate.customer_id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-[background-color,border-color,transform] hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back to Customer
            </Link>
          )}
          <Link
            href="/estimates"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-[background-color,border-color,transform] hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to Estimates
          </Link>
        </div>
      </nav>

      {/* Header card */}
      <div className="rounded-[28px] border border-slate-200/85 bg-white p-5 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.42)] print:rounded-none print:border-slate-300 print:shadow-none">
        <div className="mb-3 hidden border-b border-slate-200 pb-3 print:block">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Estimate Builder
          </div>
          <div className="mt-1 text-sm text-slate-700">
            Proposed commercial scope prepared for customer presentation.
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
              Estimate Builder
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-500">
                {documentView.identity.estimateNumber}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadgeClass(documentView.identity.status)}`}
              >
                {documentView.identity.statusLabel}
              </span>
            </div>
            <h1 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-slate-950 sm:text-2xl">
              {documentView.identity.title}
            </h1>
            {estimate.notes && (
              <p className="mt-1.5 text-sm leading-6 text-slate-600">{estimate.notes}</p>
            )}
          </div>

          {/* Totals */}
          <div className="shrink-0 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-right print:min-w-[14rem] print:rounded-lg print:border-slate-300 print:bg-white">
            {isMultiOptionProposal ? (
              <>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Estimate type
                </div>
                <div className="mt-0.5 text-2xl font-bold tracking-[-0.02em] text-slate-950">
                  Options
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Totals are shown inside each option.
                </div>
              </>
            ) : (
              <>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Total
                </div>
                <div className="mt-0.5 text-2xl font-bold tracking-[-0.02em] text-slate-950">
                  {formatCents(documentView.totals.totalCents)}
                </div>
                {documentView.totals.subtotalCents !== documentView.totals.totalCents && (
                  <div className="text-xs text-slate-500">
                    Subtotal {formatCents(documentView.totals.subtotalCents)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Context */}
        <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 text-sm text-slate-600 sm:grid-cols-2 print:grid-cols-2 print:gap-x-6">
          <div>
            <span className="font-medium text-slate-700">Estimate Type:</span>{" "}
            {isMultiOptionProposal ? "Options" : "Single Estimate"}
          </div>
          {documentView.context.customerName && (
            <div>
              <span className="font-medium text-slate-700">Customer:</span> {documentView.context.customerName}
            </div>
          )}
          {documentView.context.locationDisplay && (
            <div>
              <span className="font-medium text-slate-700">Location:</span> {documentView.context.locationDisplay}
            </div>
          )}
          <div>
            <span className="font-medium text-slate-700">Created:</span>{" "}
            {formatDate(documentView.lifecycle.createdAt)}
          </div>
          {documentView.lifecycle.sentAt && (
            <div>
              <span className="font-medium text-slate-700">Sent:</span> {formatDate(documentView.lifecycle.sentAt)}
            </div>
          )}
          <div>
            <span className="font-medium text-slate-700">Status:</span> {documentView.identity.statusLabel}
          </div>
        </div>
      </div>

      {/* Create default option packages (if eligible for multi-option upgrade) */}
      <CreateDefaultOptionsForm
        estimateId={estimate.id}
        isDraft={isDraft}
        isMultiOptionProposal={isMultiOptionProposal}
        hasFlatLines={(estimate.line_items ?? []).length > 0}
        optionsUnavailable={false}
      />

      {/* Status actions */}
      <div className="rounded-[28px] border border-slate-200/85 bg-white shadow-[0_22px_60px_-42px_rgba(15,23,42,0.42)] print:hidden">
        <div className="border-b border-slate-200/85 bg-slate-50/80 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200/85 bg-white text-slate-600">
              <Workflow className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-950">Builder Workflow</h2>
              <p className="mt-1 text-sm text-slate-600">Keep the core path simple: build, preview, send, approve, and convert.</p>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-950">Builder Actions</h3>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              {statusPanelTitle}
            </p>
            {statusMessage ? (
              <p className="mt-1 text-sm text-slate-600">{statusMessage}</p>
            ) : (
              <p className="mt-1 text-sm text-slate-600">
                Use these actions to move this estimate through the builder workflow.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {isDraft && (
              <>
                <EstimateStatusActionForm
                  action={transitionEstimateStatusFromForm}
                  estimateId={estimate.id}
                  nextStatus="sent"
                  label="Mark Sent Manually"
                  helperText={
                    isMultiOptionProposal
                      ? "Marks this estimate as sent and locks edits."
                      : "Marks this estimate as sent and locks edits."
                  }
                  confirmMessage={
                    isMultiOptionProposal
                      ? "Mark this estimate as Sent? This locks line editing. No customer email or PDF will be sent, and no option will be selected or approved."
                      : "Mark this estimate as Sent? This locks line editing. No customer email or PDF will be sent."
                  }
                  className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition-[background-color,border-color,transform] hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px]"
                />
                <EstimateStatusActionForm
                  action={transitionEstimateStatusFromForm}
                  estimateId={estimate.id}
                  nextStatus="cancelled"
                  label="Cancel Estimate"
                  helperText="Closes this estimate without approval."
                  confirmMessage="Cancel this estimate? This is a terminal V1 action and no job, invoice, payment, or conversion record will be created."
                  className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition-[background-color,border-color,transform] hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 active:translate-y-[0.5px]"
                />
              </>
            )}

            {isSent && (
              <>
                <EstimateApprovalResponseForm
                  action={recordEstimateApprovalResponseFromForm}
                  estimateId={estimate.id}
                  proposalMode={estimate.proposalMode}
                  options={(estimate.options ?? []).map((o) => ({
                    id: o.id,
                    label: o.label,
                    total_cents: o.total_cents,
                  }))}
                />
                <EstimateStatusActionForm
                  action={transitionEstimateStatusFromForm}
                  estimateId={estimate.id}
                  nextStatus="declined"
                  label="Mark Declined"
                  helperText="Closes this estimate as declined."
                  confirmMessage="Decline this estimate? This is a terminal V1 action and no job, invoice, payment, or conversion record will be created."
                  className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition-[background-color,border-color,transform] hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 active:translate-y-[0.5px]"
                />
                <EstimateStatusActionForm
                  action={transitionEstimateStatusFromForm}
                  estimateId={estimate.id}
                  nextStatus="expired"
                  label="Mark Expired"
                  helperText="Marks this estimate as no longer active."
                  confirmMessage="Expire this estimate? This is a terminal V1 action and no job, invoice, payment, or conversion record will be created."
                  className="inline-flex items-center justify-center rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 transition-[background-color,border-color,transform] hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 active:translate-y-[0.5px]"
                />
                <EstimateStatusActionForm
                  action={transitionEstimateStatusFromForm}
                  estimateId={estimate.id}
                  nextStatus="cancelled"
                  label="Cancel Estimate"
                  helperText="Closes this estimate without approval."
                  confirmMessage="Cancel this estimate? This is a terminal V1 action and no job, invoice, payment, or conversion record will be created."
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-[background-color,border-color,transform] hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]"
                />
              </>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Estimate proposal rendering */}
      {/* Approval response panel — visible on approved terminal state */}
      {isApproved && (
        <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-[0_14px_30px_-30px_rgba(15,23,42,0.14)] print:hidden">
          <h2 className="text-base font-semibold text-emerald-900">Approval</h2>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-600">
            Approved
          </p>
          {estimate.approved_at && (
            <p className="mt-1 text-sm text-slate-600">
              Approved on {formatDateTime(estimate.approved_at)}.
            </p>
          )}
          {isMultiOptionProposal && estimate.selected_option_id ? (
            <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/60 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                Selected option
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {estimate.selected_option_label_snapshot ?? "—"}
              </p>
              {typeof estimate.selected_option_total_cents === "number" && (
                <p className="mt-0.5 text-sm text-slate-700">
                  Approval amount:{" "}
                  <span className="font-semibold">{formatCents(estimate.selected_option_total_cents)}</span>
                </p>
              )}
            </div>
          ) : isMultiOptionProposal ? (
            <p className="mt-2 text-sm text-slate-500">No selected option was recorded at approval time.</p>
          ) : null}
          {estimate.response_note && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Note</p>
              <p className="mt-1 text-sm text-slate-700">{estimate.response_note}</p>
            </div>
          )}

          {canConvertToJob && (
            <form action={submitConvertEstimateToJob} className="mt-4">
              <input type="hidden" name="estimate_id" value={estimate.id} />
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 transition-[background-color,border-color,transform] hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 active:translate-y-[0.5px]"
              >
                Convert to Job
              </button>
            </form>
          )}
        </div>
      )}

      {isConverted && estimate.converted_job_id && (
        <div className="rounded-2xl border border-violet-200 bg-white p-5 shadow-[0_14px_30px_-30px_rgba(15,23,42,0.14)] print:hidden">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-violet-900"><Link2 className="h-4 w-4" aria-hidden="true" />Linked Job</h2>
          <p className="mt-1 text-sm text-slate-700">
            This estimate is linked to job{" "}
            <Link href={`/jobs/${estimate.converted_job_id}`} className="font-semibold text-violet-700 hover:underline">
              {convertedJobTitle ?? estimate.converted_job_id}
            </Link>
            .
          </p>

          {canConvertToInvoiceDraft && (
            <form action={submitConvertEstimateToInvoiceDraft} className="mt-4">
              <input type="hidden" name="estimate_id" value={estimate.id} />
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 transition-[background-color,border-color,transform] hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 active:translate-y-[0.5px]"
              >
                Create Draft Invoice
              </button>
            </form>
          )}

          {convertedInvoiceId && invoiceWorkspaceHref && (
            <p className="mt-3 text-sm text-slate-700">
              Linked invoice draft: <Link href={invoiceWorkspaceHref} className="font-semibold text-violet-700 hover:underline">{convertedInvoiceNumber ?? convertedInvoiceId}</Link>
            </p>
          )}
        </div>
      )}

      {/* Estimate proposal rendering */}
      <div className="space-y-3 print:space-y-2">
        {isMultiOptionProposal ? (
          <>
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 print:border-slate-300 print:bg-white">
              <span className="inline-flex items-center gap-2 font-medium text-slate-800"><Layers3 className="h-4 w-4" aria-hidden="true" />Proposed commercial alternatives are grouped into options.</span>
              <span className="mt-1 block text-sm text-slate-700">Totals are shown per option below.</span>
            </div>

            <div className="space-y-4">
              {(estimate.options ?? []).map((option, optionIndex) => (
                <div
                  key={option.id}
                  className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_30px_-30px_rgba(15,23,42,0.18)] print:break-inside-avoid print:rounded-none print:border-slate-300 print:shadow-none"
                >
                  <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-3 print:border-slate-300 print:bg-white print:px-4 print:py-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Option {option.slot_index ?? optionIndex + 1}
                        </div>
                        <h3 className="mt-0.5 text-base font-semibold text-slate-950">{option.label}</h3>
                        {option.summary && (
                          <p className="mt-1 text-sm text-slate-600">{option.summary}</p>
                        )}
                        {isDraft && (
                          <EditEstimateOptionForm
                            estimateId={estimate.id}
                            estimateOptionId={option.id}
                            label={option.label}
                            summary={option.summary}
                          />
                        )}
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-xs text-slate-600 print:border-slate-300">
                        <div>
                          Subtotal: <span className="font-semibold text-slate-900">{formatCents(option.subtotal_cents)}</span>
                        </div>
                        <div>
                          Total: <span className="font-semibold text-slate-900">{formatCents(option.total_cents)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {option.line_items.length === 0 ? (
                    <div className="px-5 py-4 text-sm text-slate-500 print:px-4 print:py-3">
                      No line items in this option.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200/60">
                      {option.line_items.map((line) => (
                        <div key={line.id} className="px-5 py-4 print:px-4 print:py-3">
                          <div className={`grid gap-3 sm:items-center ${isDraft ? "sm:grid-cols-[minmax(0,2.5fr)_minmax(6rem,0.7fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)_auto]" : "sm:grid-cols-[minmax(0,2.5fr)_minmax(6rem,0.7fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)]"}`}>
                            <div>
                              <div className="font-semibold text-slate-950">{line.item_name_snapshot}</div>
                              {line.description_snapshot && (
                                <div className="mt-0.5 text-xs leading-5 text-slate-500">
                                  {line.description_snapshot}
                                </div>
                              )}
                            </div>

                            <div>
                              <div className="text-sm capitalize text-slate-700">{line.item_type_snapshot}</div>
                            </div>

                            <div>
                              <div className="text-sm text-slate-700">
                                {line.quantity % 1 === 0 ? line.quantity : line.quantity.toFixed(2)} × {formatCents(line.unit_price_cents)}
                              </div>
                            </div>

                            <div>
                              <div className="font-semibold text-slate-950">{formatCents(line.line_subtotal_cents)}</div>
                            </div>

                            {isDraft && (
                              <div className="flex justify-end print:hidden">
                                <form action={submitRemoveOptionLine}>
                                  <input type="hidden" name="estimate_id" value={estimate.id} />
                                  <input type="hidden" name="estimate_option_id" value={option.id} />
                                  <input type="hidden" name="line_item_id" value={line.id} />
                                  <button
                                    type="submit"
                                    className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition-[background-color,border-color,transform] hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 active:translate-y-[0.5px]"
                                  >
                                    Remove
                                  </button>
                                </form>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {isDraft && (
                    <div className="px-5 pb-4 print:hidden">
                      <AddEstimateOptionLineForm
                        estimateId={estimate.id}
                        estimateOptionId={option.id}
                        pricebookItems={pricebookItems}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
        <div className="flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-slate-950"><ListChecks className="h-4 w-4" aria-hidden="true" />Line Items</h2>
          <div className="text-sm text-slate-500 print:text-slate-700">
            {estimate.line_items.length}{" "}
            {estimate.line_items.length === 1 ? "item" : "items"}
          </div>
        </div>

        {documentView.lines.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-5 py-8 text-center text-sm text-slate-500">
            {isDraft
              ? "No line items yet. Add the first line item below."
              : "No line items on this estimate."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_30px_-30px_rgba(15,23,42,0.18)] print:rounded-none print:border-slate-300 print:shadow-none">
            {/* Column headers */}
            <div className="hidden grid-cols-[minmax(0,2.5fr)_minmax(6rem,0.7fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)_auto] gap-4 border-b border-slate-200/80 bg-white/88 px-5 py-3 sm:grid print:grid print:border-slate-300 print:bg-white print:px-4 print:py-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Item
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Type
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Qty × Price
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Subtotal
              </div>
              {isDraft && (
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500" />
              )}
            </div>

            <div className="divide-y divide-slate-200/60">
              {documentView.lines.map((line, idx) => (
                <div key={line.id} className="bg-white/80 px-5 py-4 print:break-inside-avoid print:px-4 print:py-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,2.5fr)_minmax(6rem,0.7fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)_auto] sm:items-center print:grid-cols-[minmax(0,2.5fr)_minmax(6rem,0.7fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)]">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:hidden">
                        Line {idx + 1}
                      </div>
                      <div className="font-semibold text-slate-950">
                        {line.itemName}
                      </div>
                      {line.description && (
                        <div className="mt-0.5 text-xs leading-5 text-slate-500">
                          {line.description}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:hidden">
                        Type
                      </div>
                      <div className="text-sm capitalize text-slate-700">
                        {line.itemType}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:hidden">
                        Qty × Price
                      </div>
                      <div className="text-sm text-slate-700">
                        {line.quantity % 1 === 0 ? line.quantity : line.quantity.toFixed(2)}{" "}
                        × {formatCents(line.unitPriceCents)}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:hidden">
                        Subtotal
                      </div>
                      <div className="font-semibold text-slate-950">
                        {formatCents(line.lineSubtotalCents)}
                      </div>
                    </div>

                    {isDraft && (
                      <div className="flex justify-end print:hidden">
                        <form action={removeLineItemFromForm}>
                          <input type="hidden" name="estimate_id" value={estimate.id} />
                          <input type="hidden" name="line_item_id" value={line.id} />
                          <button
                            type="submit"
                            className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition-[background-color,border-color,transform] hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 active:translate-y-[0.5px]"
                          >
                            Remove
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Total footer */}
            <div className="flex items-center justify-between border-t border-slate-200/80 bg-slate-50/80 px-5 py-3.5 print:border-slate-300 print:bg-white print:px-4 print:py-2.5">
              <div className="text-sm font-semibold text-slate-700">Total</div>
              <div className="text-lg font-bold tracking-[-0.02em] text-slate-950">
                {formatCents(documentView.totals.totalCents)}
              </div>
            </div>
          </div>
        )}

        {/* Add line item — draft only */}
        {isDraft && (
          <div className="pt-1 print:hidden">
            <AddLineItemForm estimateId={estimate.id} pricebookItems={pricebookItems} />
          </div>
        )}

        {!isDraft && (
          <p className="text-xs text-slate-400 print:hidden">
            {isSent
              ? "Sent estimates cannot be edited. Transition status from the actions panel."
              : "Line items can only be edited on draft estimates."}
          </p>
        )}
          </>
        )}
      </div>

      <details className="rounded-2xl border border-slate-200/80 bg-slate-50/70 text-sm text-slate-700 print:hidden">
        <summary className="cursor-pointer list-none px-4 py-3 font-semibold text-slate-900 marker:content-none">
          <span className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2"><Shield className="h-4 w-4 text-slate-500" aria-hidden="true" />Advanced / Internal</span>
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
              Expand
            </span>
          </span>
        </summary>
        <div className="space-y-5 border-t border-slate-200/80 px-4 pb-4 pt-3">
          <section className="rounded-xl border border-slate-200/80 bg-white p-4">
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900"><Sparkles className="h-4 w-4 text-slate-500" aria-hidden="true" />Internal Readiness Notes</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {ESTIMATE_DOCUMENT_READINESS_GUIDANCE.map((line) => (
                <li key={line}>{line}</li>
              ))}
              <li>
                {emailSendEnabled
                  ? "Send/email is explicitly enabled for this environment."
                  : "Send/email is currently disabled by feature flag in this environment."}
              </li>
            </ul>
            <h3 className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Boundary Disclaimers
            </h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs sm:text-sm">
              {ESTIMATE_DOCUMENT_DISCLAIMERS.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              Revision planning defaults: freeze trigger {ESTIMATE_REVISION_PLANNING_DEFAULTS.freezeTrigger}, history {ESTIMATE_REVISION_PLANNING_DEFAULTS.historyPolicy}, post-freeze edits {ESTIMATE_REVISION_PLANNING_DEFAULTS.postFreezeEditPolicy}.
            </p>
          </section>

          <section className="rounded-xl border border-slate-200/80 bg-white p-4">
            {isMultiOptionProposal ? (
              <>
                <h2 className="inline-flex items-center gap-2 text-base font-semibold text-slate-950"><ListChecks className="h-4 w-4 text-slate-500" aria-hidden="true" />Quote Readiness Checklist</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Multi-option readiness scoring is not defined in this slice. Flat checklist scoring remains unchanged for single-option estimates.
                </p>
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  This estimate is in options mode. Review option cards as proposed commercial alternatives.
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="inline-flex items-center gap-2 text-base font-semibold text-slate-950"><ListChecks className="h-4 w-4 text-slate-500" aria-hidden="true" />Quote Readiness Checklist</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Advisory checklist for internal review.
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs text-slate-600">
                    <div>
                      Ready: <span className="font-semibold text-slate-900">{readinessChecklist.readyCount}</span>
                    </div>
                    <div>
                      Needs attention: <span className="font-semibold text-slate-900">{readinessChecklist.attentionCount}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 divide-y divide-slate-200/70 overflow-hidden rounded-xl border border-slate-200/80">
                  {readinessChecklist.items.map((item) => (
                    <div key={item.key} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                        <div className="mt-0.5 text-xs leading-5 text-slate-600">{item.detail}</div>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] ${
                          item.status === "ready"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {item.status === "ready" ? "Ready" : "Attention"}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {(isDraft || isSent) && (
            <section className="rounded-xl border border-slate-200/80 bg-white p-4">
              <h2 className="text-base font-semibold text-slate-950">Record Send Attempt</h2>
              <p className="mt-1 text-sm text-slate-600">
                {isDraft
                  ? "This estimate is still in draft. You can record a send attempt before or after marking it sent."
                  : "This estimate is marked sent. Record a send attempt to log that you shared this estimate."}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Records an estimate communication attempt. This does not change the estimate lifecycle status.
              </p>
              <div className="mt-3">
                <SendEstimateForm
                  estimateId={estimate.id}
                  action={sendEstimateFromForm}
                  isEmailSendEnabled={emailSendEnabled}
                  isMultiOptionProposal={isMultiOptionProposal}
                  defaultRecipientEmail={customerEmail}
                />
              </div>
            </section>
          )}

          <section className="rounded-xl border border-slate-200/80 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-950">Communication History</h2>
            {communications.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No send attempts recorded for this estimate.</p>
            ) : (
              <div className="mt-3 divide-y divide-slate-200/60 overflow-hidden rounded-xl border border-slate-200/80">
                {communications.map((comm) => (
                  <div key={comm.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                              comm.attempt_status === "accepted"
                                ? "bg-emerald-100 text-emerald-700"
                                : comm.attempt_status === "blocked"
                                  ? "bg-slate-100 text-slate-600"
                                  : comm.attempt_status === "failed"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {comm.attempt_status}
                          </span>
                          {comm.provider_name && (
                            <span className="text-xs text-slate-500">via {comm.provider_name}</span>
                          )}
                        </div>
                        <div className="mt-1 text-sm text-slate-800">
                          {comm.recipient_email_snapshot}
                        </div>
                        {comm.attempt_error && (
                          <div className="mt-0.5 text-xs text-red-600">{comm.attempt_error}</div>
                        )}
                        {comm.attempt_status === "accepted" && (
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            Accepted by provider - not the same as delivered or read
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-xs text-slate-400">
                        {formatDateTime(comm.attempted_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-400">
              Delivery tracking is not available in V1H. Accepted by provider does not mean delivered or read.
            </p>
          </section>

          {events.length > 0 && (
            <section className="rounded-xl border border-slate-200/80 bg-white p-4">
              <h2 className="text-base font-semibold text-slate-950">Activity</h2>
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200/80 bg-white">
                <div className="divide-y divide-slate-200/60">
                  {events.map((event) => (
                    <div key={event.id} className="px-5 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-800">
                            {formatEstimateEventLabel(event.event_type)}
                          </div>
                          {formatEstimateEventSummary(event.event_type, event.meta) ? (
                            <div className="mt-1 text-xs leading-5 text-slate-500">
                              {formatEstimateEventSummary(event.event_type, event.meta)}
                            </div>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-xs text-slate-400">
                          {formatDateTime(event.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {(!estimate.conversionSchemaReady || !estimate.invoiceConversionSchemaReady) && (
            <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <p className="font-semibold uppercase tracking-[0.12em] text-amber-900">Schema readiness</p>
              {!estimate.conversionSchemaReady && (
                <p className="mt-1">
                  Job conversion action is hidden until the conversion schema migration is available in this environment.
                </p>
              )}
              {!estimate.invoiceConversionSchemaReady && (
                <p className="mt-1">
                  Draft invoice conversion action is hidden until the invoice conversion schema migration is available in this environment.
                </p>
              )}
            </section>
          )}
        </div>
      </details>

      {/* Non-goal confirmation: no approval/conversion/payment/email/PDF UI */}
    </div>
  );
}
