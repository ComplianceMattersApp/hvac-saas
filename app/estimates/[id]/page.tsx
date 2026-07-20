// app/estimates/[id]/page.tsx
// Compliance Matters: Internal-only estimate detail page.
// Account-owner scoped via getEstimateById. Draft-only line management.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Eye, Link2 } from "lucide-react";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  requireInternalUser,
  isInternalAccessError,
} from "@/lib/auth/internal-user";
import {
  buildEstimateDocumentViewModel,
} from "@/lib/estimates/estimate-document";
import { buildEstimateCoachReport } from "@/lib/estimates/estimate-coach";
import { getEstimateById } from "@/lib/estimates/estimate-read";
import { isEstimateCoachAiEnabled, isEstimateCoachEnabled, isEstimatesEnabled } from "@/lib/estimates/estimate-exposure";
import { readActiveEstimateProposalLinkForInternal } from "@/lib/estimates/estimate-proposal-links";
import {
  removeLineItemFromForm,
  updateLineItemFromForm,
  updateEstimateOptionLineItemFromForm,
  transitionEstimateStatusFromForm,
  recordEstimateApprovalResponseFromForm,
  convertEstimateToJobFromForm,
  convertEstimateToInvoiceDraftFromForm,
  saveManualEstimateLineToPricebookFromForm,
} from "./actions";
import AddLineItemForm from "./AddLineItemForm";
import EstimateCoachPanel from "./EstimateCoachPanel";
import EstimateStatusActionForm from "./EstimateStatusActionForm";
import EstimateApprovalResponseForm from "./EstimateApprovalResponseForm";
import CreateDefaultOptionsForm from "./CreateDefaultOptionsForm";
import EditEstimateOptionForm from "./EditEstimateOptionForm";
import AddEstimateOptionLineForm from "./AddEstimateOptionLineForm";
import ProposalEmailControls from "./ProposalEmailControls";
import FinalizeAndSendProposalForm from "./FinalizeAndSendProposalForm";
import EstimatePhotos from "./EstimatePhotos";
import { listEstimatePhotos } from "@/lib/estimates/estimate-photos";
import { getDraftCustomerDeliveryHelperCopy } from "./status-copy";
import { removeEstimateOptionLineItemFromForm } from "./actions";

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
  if (!s) return "-";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function statusGuidanceMessage(status: string) {
  switch (status) {
    case "draft":
      return "Editable Proposal";
    case "sent":
      return "Awaiting Decision";
    case "approved":
      return "Approved";
    case "declined":
      return "Declined";
    case "expired":
      return "Expired";
    case "cancelled":
      return "Cancelled";
    case "converted":
      return "Converted";
    default:
      return null;
  }
}

function resolveEstimateRevenueWorkflowRail(params: {
  status: string;
  isMultiOptionProposal: boolean;
  canConvertToJob: boolean;
  canConvertToInvoiceDraft: boolean;
  hasConvertedJob: boolean;
  hasConvertedInvoice: boolean;
}) {
  if (params.hasConvertedInvoice) {
    return {
      stage: "Invoice draft linked",
      next: "Open Invoice Workspace to issue, send, and collect payment when ready.",
    };
  }

  if (params.hasConvertedJob) {
    return params.canConvertToInvoiceDraft
      ? {
          stage: "Job linked",
          next: "Create Draft Invoice when billed scope is ready.",
        }
      : {
          stage: "Job linked",
          next: "Open the linked job to continue operations, then return here for invoice conversion steps.",
        };
  }

  if (params.status === "approved") {
    return params.canConvertToJob
      ? {
          stage: "Approved",
          next: "Convert to Job when operations should begin.",
        }
      : {
          stage: "Approved",
          next: "Review approval details and selected option snapshot before downstream conversion.",
        };
  }

  if (params.status === "sent") {
    return {
      stage: "Awaiting customer decision",
      next: "Record approval, decline, expiration, or cancellation based on customer response.",
    };
  }

  if (params.status === "draft") {
    return {
      stage: params.isMultiOptionProposal ? "Draft with options" : "Draft proposal",
      next: "Finish proposal content, then finalize customer delivery.",
    };
  }

  if (params.status === "converted") {
    return {
      stage: "Converted",
      next: "Use linked job and invoice records as the active workflow surface.",
    };
  }

  return {
    stage: statusLabel(params.status),
    next: "Review estimate status and choose the next documented revenue step.",
  };
}

const SAVE_TO_PRICEBOOK_SUPPORTED_TYPES = new Set(["service", "material", "diagnostic"]);

function canShowSaveToPricebook(params: {
  isDraft: boolean;
  line: {
    source_pricebook_item_id: string | null;
    item_name_snapshot: string;
    item_type_snapshot: string;
    unit_price_cents: number;
  };
}) {
  if (!params.isDraft) return false;
  if (params.line.source_pricebook_item_id) return false;

  const itemName = String(params.line.item_name_snapshot ?? "").trim();
  if (!itemName) return false;

  const itemType = String(params.line.item_type_snapshot ?? "").trim().toLowerCase();
  if (!SAVE_TO_PRICEBOOK_SUPPORTED_TYPES.has(itemType)) return false;

  const unitPriceCents = Number(params.line.unit_price_cents);
  if (!Number.isFinite(unitPriceCents) || unitPriceCents < 0) return false;

  return true;
}

type CustomerRow = { id: string; full_name: string | null; first_name: string | null; last_name: string | null; email: string | null };
type LocationRow = { id: string; address_line1: string | null; city: string | null; state: string | null; zip: string | null; nickname: string | null };
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

  const estimatePhotos = await listEstimatePhotos({
    estimateId: estimate.id,
    accountOwnerUserId: internalUser.account_owner_user_id,
    admin: createAdminClient(),
  });

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

  async function submitUpdateLineItem(formData: FormData) {
    "use server";
    await updateLineItemFromForm(formData);
  }

  async function submitUpdateOptionLineItem(formData: FormData) {
    "use server";
    await updateEstimateOptionLineItemFromForm(formData);
  }

  async function submitConvertEstimateToJob(formData: FormData) {
    "use server";
    const estimateId = String(formData.get("estimate_id") ?? "").trim();
    if (!estimateId) return;

    const result = await convertEstimateToJobFromForm(formData);
    const encoded = encodeURIComponent(String(result?.error ?? "estimate_conversion_failed"));
    redirect(`/estimates/${estimateId}?notice=${encoded}`);
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

  async function submitSaveManualLineToPricebook(formData: FormData) {
    "use server";
    const estimateId = String(formData.get("estimate_id") ?? "").trim();
    if (!estimateId) return;

    const result = await saveManualEstimateLineToPricebookFromForm(formData);
    if (!result?.success) {
      const encoded = encodeURIComponent(String(result?.error ?? "manual_line_save_to_pricebook_failed"));
      redirect(`/estimates/${estimateId}?notice=${encoded}`);
    }

    if (result.duplicate) {
      redirect(`/estimates/${estimateId}?notice=estimate_manual_line_save_to_pricebook_duplicate`);
    }

    redirect(`/estimates/${estimateId}?notice=estimate_manual_line_saved_to_pricebook`);
  }

  const statusMessage = statusGuidanceMessage(estimate.status);
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

  const documentView = buildEstimateDocumentViewModel({
    estimate,
    customerName,
    locationDisplay,
  });
  const estimateCoachReport = isEstimateCoachEnabled()
    ? buildEstimateCoachReport({ estimate, customerEmail })
    : null;

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

  const estimateRevenueWorkflowRail = resolveEstimateRevenueWorkflowRail({
    status: estimate.status,
    isMultiOptionProposal,
    canConvertToJob,
    canConvertToInvoiceDraft,
    hasConvertedJob: Boolean(estimate.converted_job_id),
    hasConvertedInvoice: Boolean(convertedInvoiceId),
  });

  const proposalLinkRead = isSent
    ? await readActiveEstimateProposalLinkForInternal({
        estimateId: estimate.id,
        accountOwnerUserId: internalUser.account_owner_user_id,
        supabase,
      })
    : { schemaAvailable: true, activeLink: null };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 print:mx-0 print:max-w-none print:space-y-3 print:bg-white print:p-0 print:text-black">
      {notice && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 print:hidden">
          {notice === "estimate_converted_to_job"
            ? "Estimate converted to job successfully."
            : notice === "proposal_finalized_email_sent"
              ? "Proposal finalized and emailed successfully. The customer can review it using the secure link."
              : notice === "proposal_finalized_email_retry_needed"
                ? "Proposal finalized, but the email was not sent. Retry from Customer Delivery or copy the secure proposal link."
            : notice === "estimate_converted_to_invoice_draft"
              ? "Draft invoice created from this estimate successfully."
              : notice === "estimate_manual_line_saved_to_pricebook"
                ? "Saved to Pricebook for future reuse. This estimate line remains manual."
                : notice === "estimate_manual_line_save_to_pricebook_duplicate"
                  ? "Matching Pricebook item already exists. This estimate line remains manual."
            : notice === "estimate_conversion_schema_unavailable"
              ? "Estimate conversion is currently unavailable in this environment."
              : notice === "invoice_conversion_schema_unavailable"
                ? "Draft invoice conversion is currently unavailable in this environment."
              : notice === "selected_option_id is required before converting multi-option estimates."
                ? "Select an approved option before converting this multi-option estimate."
              : `Estimate notice: ${notice}`}
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500 print:hidden">
        <div>
          <Link href="/estimates" className="hover:text-slate-900">
            Estimates
          </Link>
          <span className="mx-1.5" aria-hidden="true">›</span>
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
            <p className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
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

        <div className="mt-4 rounded-xl border border-slate-200/85 bg-slate-50/85 px-4 py-3 text-sm text-slate-700 print:hidden">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Revenue Workflow Rail</p>
          <p className="mt-1">
            <span className="font-semibold text-slate-900">Stage:</span> {estimateRevenueWorkflowRail.stage}.
            <span className="ml-2 font-semibold text-slate-900">Next:</span> {estimateRevenueWorkflowRail.next}
          </p>
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
      <div className="print:hidden">
        {isSent ? (
          <div className="overflow-hidden rounded-[28px] border border-slate-200/85 bg-white shadow-[0_22px_60px_-42px_rgba(15,23,42,0.42)]">
            <div className="border-b border-slate-200/85 bg-slate-50/80 px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Status</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {statusMessage ? (
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(documentView.identity.status)}`}>
                        {statusMessage}
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="max-w-md text-sm text-slate-500">Sent estimates are locked for editing.</p>
              </div>
            </div>

            <div className="bg-slate-50/45 px-5 py-5">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(15rem,0.9fr)] lg:items-start">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Customer Decision</p>
                  <h2 className="mt-1 text-base font-semibold text-slate-950">Approval</h2>
                  <p className="mt-1 text-sm text-slate-600">Record approval for this estimate.</p>
                  <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-[0_18px_36px_-34px_rgba(15,23,42,0.28)]">
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
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Other Outcomes</p>
                  <p className="mt-1 text-sm text-slate-600">Choose one of the secondary actions below if the customer does not approve.</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <EstimateStatusActionForm
                      action={transitionEstimateStatusFromForm}
                      estimateId={estimate.id}
                      nextStatus="declined"
                      label="Mark Declined"
                      confirmMessage="Mark this estimate declined? No job or draft invoice will be created from this estimate."
                      className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-[background-color,border-color,transform] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]"
                    />
                    <EstimateStatusActionForm
                      action={transitionEstimateStatusFromForm}
                      estimateId={estimate.id}
                      nextStatus="expired"
                      label="Mark Expired"
                      confirmMessage="Mark this estimate expired? No job or draft invoice will be created from this estimate."
                      className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-[background-color,border-color,transform] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]"
                    />
                    <EstimateStatusActionForm
                      action={transitionEstimateStatusFromForm}
                      estimateId={estimate.id}
                      nextStatus="cancelled"
                      label="Cancel Estimate"
                      confirmMessage="Cancel this estimate? No job or draft invoice will be created from this estimate."
                      className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition-[background-color,border-color,transform] hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="border-y border-slate-200/80 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Customer Delivery</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {statusMessage ? (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(documentView.identity.status)}`}>
                      {statusMessage}
                    </span>
                  ) : null}
                </div>
                {isDraft ? (
                  <p className="mt-1 max-w-md text-sm text-slate-500">{getDraftCustomerDeliveryHelperCopy()}</p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2 lg:justify-end">
                {isDraft && (
                  <div className="space-y-2">
                    <FinalizeAndSendProposalForm estimateId={estimate.id} defaultRecipientEmail={customerEmail} />
                    <EstimateStatusActionForm
                      action={transitionEstimateStatusFromForm}
                      estimateId={estimate.id}
                      nextStatus="cancelled"
                      label="Cancel Estimate"
                      confirmMessage="Cancel this estimate? No job or draft invoice will be created from this estimate."
                      className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition-[background-color,border-color,transform] hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Estimate proposal rendering */}
      {isSent && (
        <div className="print:hidden">
          <ProposalEmailControls
            estimateId={estimate.id}
            defaultRecipientEmail={customerEmail}
            estimateStatus={estimate.status}
            activeLink={
              proposalLinkRead.activeLink
                ? {
                    proposalLinkId: proposalLinkRead.activeLink.proposalLinkId,
                    recipientEmailSnapshot: proposalLinkRead.activeLink.recipientEmailSnapshot,
                    expiresAt: proposalLinkRead.activeLink.expiresAt,
                  }
                : null
            }
            schemaUnavailable={!proposalLinkRead.schemaAvailable}
          />
        </div>
      )}

      {/* Approval response panel visible on approved terminal state */}
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
                {estimate.selected_option_label_snapshot ?? "Not recorded"}
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
              <span className="inline-flex items-center font-medium text-slate-800">Proposed commercial alternatives are grouped into options.</span>
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
                    <div className="px-5 py-4 print:px-4 print:py-3">
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-5 py-8 text-center text-sm text-slate-500">
                        No line items in this option.
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50/45 px-5 py-4 print:bg-white print:px-4 print:py-3">
                      <div className="divide-y divide-slate-200/70 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_18px_36px_-34px_rgba(15,23,42,0.28)] print:rounded-none print:border-slate-300 print:shadow-none">
                      {option.line_items.map((line) => (
                        <div key={line.id} className="px-5 py-4 print:px-4 print:py-3">
                          <div className="space-y-3">
                            <div className={`grid gap-3 lg:items-start ${isDraft ? "lg:grid-cols-[minmax(14rem,2.5fr)_minmax(6rem,0.7fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)_auto]" : "lg:grid-cols-[minmax(14rem,2.5fr)_minmax(6rem,0.7fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)]"}`}>
                            <div className="min-w-0">
                              <div className="text-pretty break-words font-semibold text-slate-950">{line.item_name_snapshot}</div>
                              {line.description_snapshot && (
                                <div className="mt-0.5 text-pretty break-words text-xs leading-5 text-slate-500">
                                  {line.description_snapshot}
                                </div>
                              )}
                            </div>

                            <div>
                              <div className="text-sm capitalize text-slate-700">{line.item_type_snapshot}</div>
                            </div>

                            <div>
                              <div className="text-sm text-slate-700 lg:whitespace-nowrap">
                                {line.quantity % 1 === 0 ? line.quantity : line.quantity.toFixed(2)} × {formatCents(line.unit_price_cents)}
                              </div>
                            </div>

                            <div>
                              <div className="font-semibold text-slate-950 lg:whitespace-nowrap">{formatCents(line.line_subtotal_cents)}</div>
                            </div>

                            {isDraft && (
                              <div className="flex flex-wrap justify-start gap-2 lg:justify-end print:hidden">
                                {canShowSaveToPricebook({ isDraft, line }) && (
                                  <form action={submitSaveManualLineToPricebook}>
                                    <input type="hidden" name="estimate_id" value={estimate.id} />
                                    <input type="hidden" name="line_scope" value="option" />
                                    <input type="hidden" name="line_item_id" value={line.id} />
                                    <input type="hidden" name="estimate_option_id" value={option.id} />
                                    <button
                                      type="submit"
                                      className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-[background-color,border-color,transform] hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]"
                                    >
                                      Save to Pricebook
                                    </button>
                                  </form>
                                )}
                                <div className="hidden lg:block" />
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
                          {isDraft && (
                            <details className="print:hidden">
                              <summary className="inline-flex cursor-pointer list-none items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-[background-color,border-color] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200">
                                Edit
                              </summary>
                              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.38)]">
                                <form action={submitUpdateOptionLineItem} className="space-y-2.5">
                                  <input type="hidden" name="estimate_id" value={estimate.id} />
                                  <input type="hidden" name="estimate_option_id" value={option.id} />
                                  <input type="hidden" name="line_item_id" value={line.id} />
                                  <input type="hidden" name="category" value={line.category_snapshot ?? ""} />
                                  <input type="hidden" name="unit_label" value={line.unit_label_snapshot ?? ""} />

                                  <div>
                                    <label htmlFor={`edit-option-name-${line.id}`} className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Item Name</label>
                                    <input id={`edit-option-name-${line.id}`} name="item_name" defaultValue={line.item_name_snapshot ?? ""} required className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
                                  </div>

                                  <div className="grid gap-2 sm:grid-cols-3">
                                    <div>
                                      <label htmlFor={`edit-option-type-${line.id}`} className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Type</label>
                                      <input id={`edit-option-type-${line.id}`} name="item_type" defaultValue={line.item_type_snapshot ?? "service"} required className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
                                    </div>
                                    <div>
                                      <label htmlFor={`edit-option-qty-${line.id}`} className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Qty</label>
                                      <input id={`edit-option-qty-${line.id}`} name="quantity" type="number" min="0.01" step="0.01" defaultValue={line.quantity} required className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
                                    </div>
                                    <div>
                                      <label htmlFor={`edit-option-price-${line.id}`} className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Unit Price ($)</label>
                                      <input id={`edit-option-price-${line.id}`} name="unit_price" type="number" min="0" step="0.01" defaultValue={(line.unit_price_cents / 100).toFixed(2)} required className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
                                    </div>
                                  </div>

                                  <div>
                                    <label htmlFor={`edit-option-description-${line.id}`} className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Description</label>
                                    <textarea id={`edit-option-description-${line.id}`} name="description" defaultValue={line.description_snapshot ?? ""} rows={2} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
                                  </div>

                                  <div className="flex justify-end">
                                    <button type="submit" className="inline-flex items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800">
                                      Save
                                    </button>
                                  </div>
                                </form>
                              </div>
                            </details>
                          )}
                          </div>
                        </div>
                      ))}
                      </div>
                    </div>
                  )}

                  {isDraft && (
                    <div className="border-t border-slate-200/80 bg-slate-50/45 px-5 pb-4 pt-4 print:bg-white print:px-4 print:pt-3 print:hidden">
                      <AddEstimateOptionLineForm
                        estimateId={estimate.id}
                        estimateOptionId={option.id}
                        pricebookItems={pricebookItems}
                        aiEnabled={isEstimateCoachAiEnabled()}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
        <div className="overflow-hidden rounded-[28px] border border-slate-200/85 bg-white shadow-[0_22px_60px_-42px_rgba(15,23,42,0.42)] print:rounded-none print:border-slate-300 print:shadow-none">
          <div className="border-b border-slate-200/85 bg-slate-50/80 px-5 py-4 print:bg-white print:px-4 print:py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Builder Workspace</p>
                <h2 className="mt-1 text-base font-semibold text-slate-950">Line Items</h2>
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600 print:border-slate-300">
                {estimate.line_items.length} {estimate.line_items.length === 1 ? "item" : "items"}
              </div>
            </div>
          </div>

        {documentView.lines.length === 0 ? (
          <div className="bg-slate-50/45 px-5 py-5 print:bg-white print:px-4 print:py-4">
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center shadow-[0_14px_30px_-34px_rgba(15,23,42,0.22)]">
              <div className="text-sm font-semibold text-slate-900">Start building this estimate</div>
              <div className="mt-1 text-sm text-slate-500">
                {isDraft
                  ? "No line items yet. Add the first line item below."
                  : "No line items on this estimate."}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50/45 px-5 py-5 print:bg-white print:px-4 print:py-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_18px_36px_-34px_rgba(15,23,42,0.28)] print:rounded-none print:border-slate-300 print:shadow-none">
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
              {estimate.line_items.map((line, idx) => (
                <div key={line.id} className="bg-white/80 px-5 py-4 print:break-inside-avoid print:px-4 print:py-3">
                  <div className="space-y-3">
                    <div className="grid gap-3 lg:grid-cols-[minmax(14rem,2.5fr)_minmax(6rem,0.7fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)_auto] lg:items-start print:grid-cols-[minmax(14rem,2.5fr)_minmax(6rem,0.7fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)]">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:hidden">
                        Line {idx + 1}
                      </div>
                      <div className="text-pretty break-words font-semibold text-slate-950">
                        {line.item_name_snapshot}
                      </div>
                      {line.description_snapshot && (
                        <div className="mt-0.5 text-pretty break-words text-xs leading-5 text-slate-500">
                          {line.description_snapshot}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:hidden">
                        Type
                      </div>
                      <div className="text-sm capitalize text-slate-700">{line.item_type_snapshot}</div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:hidden">
                        Qty × Price
                      </div>
                      <div className="text-sm text-slate-700 lg:whitespace-nowrap">
                        {line.quantity % 1 === 0 ? line.quantity : line.quantity.toFixed(2)}{" "}
                        × {formatCents(line.unit_price_cents)}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:hidden">
                        Subtotal
                      </div>
                      <div className="font-semibold text-slate-950 lg:whitespace-nowrap">{formatCents(line.line_subtotal_cents)}</div>
                    </div>

                    {isDraft && (
                      <div className="flex flex-wrap justify-start gap-2 lg:justify-end print:hidden">
                        {canShowSaveToPricebook({ isDraft, line }) && (
                          <form action={submitSaveManualLineToPricebook}>
                            <input type="hidden" name="estimate_id" value={estimate.id} />
                            <input type="hidden" name="line_scope" value="flat" />
                            <input type="hidden" name="line_item_id" value={line.id} />
                            <button
                              type="submit"
                              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-[background-color,border-color,transform] hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]"
                            >
                              Save to Pricebook
                            </button>
                          </form>
                        )}
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
                  {isDraft && (
                    <details className="print:hidden">
                      <summary className="inline-flex cursor-pointer list-none items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-[background-color,border-color] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200">
                        Edit
                      </summary>
                      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.38)]">
                        <form action={submitUpdateLineItem} className="space-y-2.5">
                          <input type="hidden" name="estimate_id" value={estimate.id} />
                          <input type="hidden" name="line_item_id" value={line.id} />
                          <input type="hidden" name="category" value={line.category_snapshot ?? ""} />
                          <input type="hidden" name="unit_label" value={line.unit_label_snapshot ?? ""} />

                          <div>
                            <label htmlFor={`edit-line-name-${line.id}`} className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Item Name</label>
                            <input id={`edit-line-name-${line.id}`} name="item_name" defaultValue={line.item_name_snapshot ?? ""} required className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
                          </div>

                          <div className="grid gap-2 sm:grid-cols-3">
                            <div>
                              <label htmlFor={`edit-line-type-${line.id}`} className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Type</label>
                              <input id={`edit-line-type-${line.id}`} name="item_type" defaultValue={line.item_type_snapshot ?? "service"} required className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
                            </div>
                            <div>
                              <label htmlFor={`edit-line-qty-${line.id}`} className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Qty</label>
                              <input id={`edit-line-qty-${line.id}`} name="quantity" type="number" min="0.01" step="0.01" defaultValue={line.quantity} required className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
                            </div>
                            <div>
                              <label htmlFor={`edit-line-price-${line.id}`} className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Unit Price ($)</label>
                              <input id={`edit-line-price-${line.id}`} name="unit_price" type="number" min="0" step="0.01" defaultValue={(line.unit_price_cents / 100).toFixed(2)} required className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
                            </div>
                          </div>

                          <div>
                            <label htmlFor={`edit-line-description-${line.id}`} className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Description</label>
                            <textarea id={`edit-line-description-${line.id}`} name="description" defaultValue={line.description_snapshot ?? ""} rows={2} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
                          </div>

                          <div className="flex justify-end">
                            <button type="submit" className="inline-flex items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800">
                              Save
                            </button>
                          </div>
                        </form>
                      </div>
                    </details>
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
          </div>
        )}

        {/* Add line item draft only */}
        {isDraft && (
          <div className="border-t border-slate-200/85 bg-slate-50/80 px-5 py-4 print:hidden">
            <AddLineItemForm estimateId={estimate.id} pricebookItems={pricebookItems} aiEnabled={isEstimateCoachAiEnabled()} />
          </div>
        )}

        {!isDraft && (
          <p className="px-5 py-4 text-xs text-slate-400 print:hidden">
            {isSent
              ? "Sent estimates cannot be edited. Transition status from the actions panel."
              : "Line items can only be edited on draft estimates."}
          </p>
        )}
        </div>
          </>
        )}
      </div>

      {estimateCoachReport ? (
        <EstimateCoachPanel
          report={estimateCoachReport}
          estimateId={estimate.id}
          aiEnabled={isEstimateCoachAiEnabled()}
        />
      ) : null}

      <EstimatePhotos estimateId={estimate.id} initialPhotos={estimatePhotos} editable={isDraft} />

      {/* Non-goal confirmation: no approval/conversion/payment/email/PDF UI */}
    </div>
  );
}
