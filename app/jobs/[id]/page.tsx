// app/jobs/[id]/page
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import SubmitButton from "@/components/SubmitButton";
import FlashBanner from "@/components/ui/FlashBanner";
import { archiveJobFromForm } from "@/lib/actions/job-actions";
import JobLocationPreview from "@/components/jobs/JobLocationPreview";
import {
  getContractors,
  assignJobAssigneeFromForm,
  setPrimaryJobAssigneeFromForm,
  removeJobAssigneeFromForm,
  updateJobCustomerFromForm,
  updateJobContractorFromForm,
  updateJobScheduleFromForm,
  advanceJobStatusFromForm,
  updateJobTypeFromForm,
  updateJobServiceContractFromForm,
  createNextServiceVisitFromForm,
  completeDataEntryFromForm,
  type JobStatus,
  createRetestJobFromForm,
  promoteCompanionScopeToServiceJobFromForm,
  addPublicNoteFromForm,
  addInternalNoteFromForm,
  getOnTheWayUndoEligibility,
  revertOnTheWayFromForm,
} from "@/lib/actions/job-actions";
import CancelJobButton from "@/components/jobs/CancelJobButton";

import {
  updateJobOpsFromForm,
  updateJobOpsDetailsFromForm,
  releaseAndReevaluateFromForm,
  markJobFieldCompleteFromForm,
  markCertsCompleteFromForm,
  markInvoiceCompleteFromForm,
  resolveFailureByCorrectionReviewFromForm,
} from "@/lib/actions/job-ops-actions";

import { logCustomerContactAttemptFromForm } from "@/lib/actions/job-contact-actions";

import ServiceStatusActions from "./_components/ServiceStatusActions";
import { displayDateLA, formatBusinessDateUS } from "@/lib/utils/schedule-la";
import { JobFieldActionButton } from "./_components/JobFieldActionButton";
import UnscheduleButton from "./_components/UnscheduleButton";
import { getCloseoutNeeds, isInCloseoutQueue } from "@/lib/utils/closeout";
import ContractorReportPanel from "./_components/ContractorReportPanel";
import { resolveContractorResponseTracking } from "@/lib/portal/resolveContractorIssues";
import { extractFailureReasons } from "@/lib/portal/resolveContractorIssues";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import {
  getAssignableInternalUsers,
  getActiveJobAssignmentDisplayMap,
  resolveUserDisplayMap,
} from "@/lib/staffing/human-layer";
import {
  type BillingMode,
  resolveBillingModeByAccountOwnerId,
  resolveInternalBusinessIdentityByAccountOwnerId,
} from "@/lib/business/internal-business-profile";
import { buildJobBillingStateReadModel } from "@/lib/business/job-billing-state";
import {
  resolveInternalInvoiceEmailDeliveries,
  type InternalInvoiceEmailDeliveryRecord,
} from "@/lib/business/internal-invoice-delivery";
import {
  type InternalInvoiceItemType,
  resolveLatestVoidedInternalInvoiceByJobId,
  resolveInternalInvoiceByJobId,
  type InternalInvoiceStatus,
} from "@/lib/business/internal-invoice";
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
import {
  loadScopedInternalJobDetailReadBoundary,
  resolveJobDetailActor,
} from "@/lib/actions/internal-job-detail-read-boundary";

import DeferredJobAttachmentsInternal from "./_components/DeferredJobAttachmentsInternal";
import DeferredCustomerAttemptsHistory from "./_components/DeferredCustomerAttemptsHistory";
import InternalInvoiceLineItemsTable, {
  InternalInvoiceDraftSaveForm,
} from "./_components/InternalInvoiceLineItemsTable";
import VisitScopeJobDetailForm from "@/components/jobs/VisitScopeJobDetailForm";
import {
  buildPromotedCompanionReadModel,
  buildVisitScopeReadModel,
  formatVisitScopeItemKindLabel,
  isVisitScopeItemPromoted,
  sanitizeVisitScopeItemId,
  sanitizeVisitScopeItems,
  sanitizeVisitScopeSummary,
} from "@/lib/jobs/visit-scope";
import {
  getActiveWaitingState,
  getInterruptClearActionLabel,
} from "@/lib/utils/ops-status";
import InterruptStateFields from "./_components/InterruptStateFields";

function dateToDateInput(value?: string | null) {
  if (!value) return "";

  const s = String(value).trim();
  if (!s) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}


function formatDateLAFromIso(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function formatDateTimeLAFromIso(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";

  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);

  return `${date} ${time}`;
}


function formatDateDisplay(date?: string | null) {
  if (!date) return "";
  return date;
}

function formatTimeDisplay(time?: string | null) {
  if (!time) return "";
  const s = String(time);
  return s.slice(0, 5);
}

function formatCurrencyFromCents(cents?: number | null) {
  const amount = Number(cents ?? 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatCentsForInput(cents?: number | null) {
  const amount = Number(cents ?? 0);
  if (!Number.isFinite(amount)) return "0.00";
  return (amount / 100).toFixed(2);
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

function finalRunPass(run: any): boolean | null {
  if (!run) return null;
  // Photo attestation is pending human review — it is not a pass or a fail
  if (run.computed?.status === "photo_evidence") return null;
  if (run.override_pass != null) return Boolean(run.override_pass);
  if (run.computed_pass != null) return Boolean(run.computed_pass);
  return null;
}

function isFailedFamilyOpsStatus(value?: string | null) {
  return ["failed", "retest_needed", "pending_office_review"].includes(
    String(value ?? "").toLowerCase()
  );
}

function serviceChainVisitLabel(visit: any, idx: number) {
  if (idx === 0 && !visit?.parent_job_id) return "Original visit";
  if (visit?.parent_job_id) return "Retest visit";
  return `Visit ${idx + 1}`;
}


function timeToTimeInput(value?: string | null) {
  if (!value) return "";

  const s = String(value).trim();
  if (!s) return "";

  if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    return s.slice(0, 5);
  }

  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toISOString().slice(11, 16);
}

function getEventNoteText(meta?: any) {
  if (!meta) return "";
  return String(
    meta.note ??
      meta.message ??
      meta.caption ??
      ""
  ).trim();
}

function getEventAttachmentCount(meta?: any) {
  if (!meta) return 0;
  const explicitCount = Number(meta.count ?? 0);
  if (Number.isFinite(explicitCount) && explicitCount > 0) return explicitCount;
  if (Array.isArray(meta.attachment_ids) && meta.attachment_ids.length > 0) {
    return meta.attachment_ids.length;
  }
  if (Array.isArray(meta.file_names) && meta.file_names.length > 0) {
    return meta.file_names.length;
  }
  if (typeof meta.file_name === "string" && meta.file_name.trim()) {
    return 1;
  }
  return 0;
}

function JobAttachmentsSectionFallback() {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-14 animate-pulse rounded-xl border border-slate-200/70 bg-slate-50"
        />
      ))}
    </div>
  );
}

function FollowUpHistorySectionFallback() {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-20 animate-pulse rounded-xl border border-slate-200/70 bg-slate-50"
        />
      ))}
    </div>
  );
}

function getEventAttachmentLabel(meta?: any) {
  const count = getEventAttachmentCount(meta);
  return count > 0 ? `${count} attachment${count === 1 ? "" : "s"}` : "";
}

function summarizePlainText(value?: string | null, maxLength = 140) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function formatSharedHistoryHeading(type?: string | null, meta?: any) {
  const attachmentLabel = getEventAttachmentLabel(meta);

  if (type === "public_note") {
    return attachmentLabel ? "Update shared with contractor" : "Note shared with contractor";
  }
  if (type === "contractor_note") {
    return attachmentLabel ? "Contractor response received" : "Contractor note received";
  }
  if (type === "contractor_correction_submission") {
    return "Correction submission received";
  }

  return formatTimelineEvent(type, meta);
}

function formatTimelineDetail(type?: string | null, meta?: any, message?: string | null) {
  const noteSummary = summarizePlainText(getEventNoteText(meta), 160);
  const attachmentLabel = getEventAttachmentLabel(meta);
  const cleanMessage = summarizePlainText(message, 160);

  if (type === "customer_attempt") {
    const method = summarizePlainText(String(meta?.method ?? "").replace(/_/g, " "), 40);
    const result = summarizePlainText(String(meta?.result ?? "").replace(/_/g, " "), 60);
    return [method, result].filter(Boolean).join(" - ");
  }

  if (type === "status_changed") {
    const from = summarizePlainText(String(meta?.from ?? "").replace(/_/g, " "), 40);
    const to = summarizePlainText(String(meta?.to ?? "").replace(/_/g, " "), 40);
    if (from && to) return `${from} -> ${to}`;
    return to || from || cleanMessage;
  }

  if (type === "attachment_added") {
    const actor =
      meta?.source === "internal"
        ? "Internal upload"
        : meta?.source === "contractor"
        ? "Contractor upload"
        : "Upload";
    if (attachmentLabel && noteSummary) return `${actor} - ${attachmentLabel} - ${noteSummary}`;
    if (attachmentLabel) return `${actor} - ${attachmentLabel}`;
    return noteSummary || cleanMessage;
  }

  if (["public_note", "contractor_note", "internal_note", "contractor_correction_submission"].includes(String(type ?? ""))) {
    if (noteSummary && attachmentLabel) return `${noteSummary} - ${attachmentLabel}`;
    if (noteSummary) return noteSummary;
    if (attachmentLabel) return `Included ${attachmentLabel}`;
    return "";
  }

  if (["internal_invoice_drafted", "internal_invoice_issued", "internal_invoice_voided"].includes(String(type ?? ""))) {
    const invoiceNumber = summarizePlainText(String(meta?.invoice_number ?? ""), 48);
    const totalDisplay = summarizePlainText(String(meta?.total_display ?? ""), 24);
    const voidReason = summarizePlainText(String(meta?.void_reason ?? ""), 120);
    return [invoiceNumber, totalDisplay, voidReason].filter(Boolean).join(" - ");
  }

  if (["internal_invoice_email_sent", "internal_invoice_email_resent", "internal_invoice_email_failed"].includes(String(type ?? ""))) {
    const invoiceNumber = summarizePlainText(String(meta?.invoice_number ?? ""), 48);
    const recipientEmail = summarizePlainText(String(meta?.recipient_email ?? ""), 72);
    const errorDetail = summarizePlainText(String(meta?.error_detail ?? ""), 120);
    return [invoiceNumber, recipientEmail, errorDetail].filter(Boolean).join(" - ");
  }

  if (type === "payment_recorded") {
    const amountDisplay = summarizePlainText(String(meta?.amount_display ?? ""), 24);
    const paymentMethod = summarizePlainText(String(meta?.payment_method ?? "").replace(/_/g, " "), 48);
    const invoiceNumber = summarizePlainText(String(meta?.invoice_number ?? ""), 48);
    return [amountDisplay ? `$${amountDisplay}` : "", paymentMethod, invoiceNumber].filter(Boolean).join(" - ");
  }

  if (type === "companion_scope_promoted") {
    const itemTitle = summarizePlainText(String(meta?.source_item_title ?? ""), 80);
    return itemTitle ? `${itemTitle} - promoted into its own Service job` : "Companion scope promoted into its own Service job";
  }

  if (type === "created_from_companion_scope") {
    const itemTitle = summarizePlainText(String(meta?.source_item_title ?? ""), 80);
    return itemTitle ? `${itemTitle} - created from ECC companion scope` : "Created from ECC companion scope";
  }

  return cleanMessage;
}



function formatTimelineEvent(type?: string | null, meta?: any, message?: string | null) {
  const eventType = String(type ?? "");
  if (eventType === "attachment_added") {
  const count = Number(
    meta?.count ??
      meta?.attachment_ids?.length ??
      meta?.file_names?.length ??
      0
  );

  const actor =
    meta?.source === "internal"
      ? "Internal user"
      : meta?.source === "contractor"
      ? "Contractor"
      : "User";

  return `${actor} uploaded ${count} attachment${count === 1 ? "" : "s"}`;
}

 const map: Record<string, string> = {
  job_created: "Job created",
  intake_submitted: "Intake submitted",
  scheduled: "Job scheduled",
  unscheduled: "Schedule removed",
  schedule_updated:
    meta?.source === "auto_schedule_on_the_way"
      ? "Schedule auto-filled from field action"
      : "Schedule updated",

  on_my_way: "Technician marked On the Way",
  on_the_way_reverted: "On the Way was reverted",
  job_started: "Technician started work",
  job_completed: "Technician completed the visit",

  job_failed: "Job failed",
  job_passed: "Job passed",

  retest_created: "Retest created",
  retest_scheduled: "Retest scheduled",
  retest_started: "Retest started",
  retest_passed: "Retest passed",
  retest_failed: "Retest failed",
  failure_resolved_by_correction_review: "Failure resolved by correction review",

  customer_attempt: "Customer contact attempt",
  status_changed: "Status changed",

  contractor_note: "Contractor note added",
  contractor_correction_submission: "Contractor submitted corrections",
  ops_update: "Ops updated",
  internal_invoice_drafted: "Internal invoice drafted",
  internal_invoice_issued: "Internal invoice issued",
  internal_invoice_voided: "Internal invoice voided",
  internal_invoice_email_sent: "Internal invoice emailed",
  internal_invoice_email_resent: "Internal invoice emailed again",
  internal_invoice_email_failed: "Internal invoice email failed",
  payment_recorded: "Payment recorded",
  companion_scope_promoted: "Companion scope promoted",
  created_from_companion_scope: "Service job created from companion scope",
};

if (eventType === "ops_update") {
  return String(
    message ??
    meta?.message ??
    meta?.note ??
    "Ops updated"
  ).trim();
}

return map[eventType] ?? eventType.replaceAll("_", " ");

}


function formatStatus(status?: string | null) {
  const s = (status ?? "").toString();
  const map: Record<JobStatus, string> = {
    open: "Open",
    on_the_way: "On The Way",
    in_process: "In Process",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
  };
  return (map as any)[s] ?? (s ? s : "—");
}

function nextStatusLabel(status?: string | null) {
  const s = (status ?? "open") as JobStatus;
  const nextMap: Record<JobStatus, string> = {
    open: "On The Way",
    on_the_way: "In Process",
    in_process: "Completed",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
  };
  return nextMap[s] ?? "—";
}

function CollapsibleHeader(props: {
  title: string;
  subtitle?: string;
  meta?: string;
  metaTone?: "default" | "note-highlight";
}) {
  const { title, subtitle, meta, metaTone = "default" } = props;
  const metaClassName =
    metaTone === "note-highlight"
      ? "mt-0.5 shrink-0 rounded-lg border border-amber-200/80 bg-amber-50/85 px-2.5 py-[0.3125rem] text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800 shadow-[0_10px_24px_-24px_rgba(217,119,6,0.35)]"
      : "mt-0.5 shrink-0 rounded-lg border border-slate-200/70 bg-slate-50/72 px-2.5 py-[0.3125rem] text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500";
  return (
    <div className="flex min-w-0 items-start justify-between gap-4 py-0.5">
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          aria-hidden
          className="disclosure-icon mt-0.5 inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border border-slate-200/70 bg-white/80 text-[9px] text-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-transform duration-150 group-open:rotate-90"
        >
          ▶
        </span>
        <div className="min-w-0 pt-0.5">
          <div className="text-[14.5px] font-semibold tracking-[-0.02em] text-slate-950">{title}</div>
          {subtitle ? <div className="mt-1 max-w-[42rem] text-[11.5px] leading-[1.45] text-slate-500">{subtitle}</div> : null}
        </div>
      </div>
      {meta ? <div className={metaClassName}>{meta}</div> : null}
    </div>
  );
}

function truncateSummaryText(value: string, maxLength = 84) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}


type JobSearchParams = {
  tab?: "info" | "ops" | "tests";
  banner?: string;
  notice?: string;
  schedule_required?: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

const workspacePanelClass =
  "rounded-2xl border border-slate-200/90 bg-white shadow-[0_16px_36px_-28px_rgba(15,23,42,0.28)]";
const workspaceSectionClass = `${workspacePanelClass} p-5 sm:p-6`;
const workspaceInsetClass =
  "rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-3";
const workspaceSubtleCardClass =
  "rounded-xl border border-slate-200/80 bg-white/88 px-4 py-3";
const workspaceFieldLabelClass =
  "mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500";
const workspaceInputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,box-shadow,background-color] focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 [color-scheme:light]";
const workspaceTextareaClass = `${workspaceInputClass} min-h-[7rem]`;
const primaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_28px_-20px_rgba(37,99,235,0.42)] transition-[background-color,box-shadow,transform] hover:bg-blue-700 hover:shadow-[0_18px_30px_-20px_rgba(37,99,235,0.48)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px]";
const secondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]";
const compactSecondaryButtonClass =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px] sm:min-h-10 sm:px-4";
const darkButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_28px_-22px_rgba(15,23,42,0.55)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_16px_30px_-22px_rgba(15,23,42,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:translate-y-[0.5px]";
const infoChipClass =
  "inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700";
const compactUtilityButtonClass =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200/90 bg-white/78 px-3 py-2 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.02)] transition-[border-color,background-color,box-shadow,transform] hover:border-slate-300 hover:bg-white hover:shadow-[0_8px_18px_-18px_rgba(15,23,42,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]";
const compactWorkspaceActionButtonClass =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-blue-200/90 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900 shadow-[0_10px_22px_-20px_rgba(37,99,235,0.35)] transition-[border-color,background-color,box-shadow,transform,color] hover:border-blue-300 hover:bg-blue-100 hover:text-blue-950 hover:shadow-[0_14px_26px_-20px_rgba(37,99,235,0.42)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px]";
const workspaceDetailsClass =
  `${workspaceSectionClass} group border-emerald-200/90 text-gray-900 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.28)] transition-[border-color,box-shadow,transform] duration-150 hover:border-emerald-300/90 hover:shadow-[0_18px_38px_-30px_rgba(15,23,42,0.32)] [&[open]_.disclosure-icon]:rotate-90`;
const workspaceDetailsDividerClass = "mt-3 border-t border-slate-200/90 pt-4";
const workspaceSoftCardClass =
  "rounded-xl border border-slate-200/80 bg-slate-50/72 p-4";
const workspaceEmptyStateClass =
  "rounded-lg border border-dashed border-slate-300 bg-slate-50/72 px-4 py-4 text-sm text-slate-600";
const workspaceUtilityControlClass =
  "rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200";

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id: jobId } = await params;

  if (!jobId) {
    throw new Error("Missing route param: id");
  }

  const sp: SearchParams = (searchParams ? await searchParams : {}) ?? {};

  const tabRaw = sp.tab;
  const tab =
    Array.isArray(tabRaw)
      ? tabRaw[0]
      : typeof tabRaw === "string"
      ? tabRaw
      : "info";

  const noticeRaw = sp.notice;
  const notice =
    Array.isArray(noticeRaw)
      ? noticeRaw[0]
      : typeof noticeRaw === "string"
      ? noticeRaw
      : "";

  const bannerRaw = sp.banner;
  const banner =
    Array.isArray(bannerRaw)
      ? bannerRaw[0]
      : typeof bannerRaw === "string"
      ? bannerRaw
      : "";

  const timingEnabled = process.env.JOB_DETAIL_TIMING_DEBUG === "true";
  const renderStartMs = Date.now();
  let phaseStartMs = renderStartMs;
  const phaseDurationsMs: Record<string, number> = {};

  const completePhase = (phaseName: string) => {
    if (!timingEnabled) return;
    const nowMs = Date.now();
    phaseDurationsMs[phaseName] = nowMs - phaseStartMs;
    phaseStartMs = nowMs;
  };

  const setPhaseValue = (phaseName: string, durationMs: number) => {
    if (!timingEnabled) return;
    phaseDurationsMs[phaseName] = durationMs;
  };

  const emitTimingLog = (details: {
    invoicePanelActive: boolean;
    serviceCaseExists: boolean;
    timelineChainExists: boolean;
  }) => {
    if (!timingEnabled) return;
    console.info(
      "[job-detail-timing]",
      JSON.stringify({
        jobId,
        tab,
        invoicePanelActive: details.invoicePanelActive,
        serviceCaseExists: details.serviceCaseExists,
        timelineChainExists: details.timelineChainExists,
        totalRenderMs: Date.now() - renderStartMs,
        phasesMs: {
          authInternalResolution: phaseDurationsMs.authInternalResolution ?? 0,
          billingModeBusinessIdentity: phaseDurationsMs.billingModeBusinessIdentity ?? 0,
          scopedJobDetailReadBoundary: phaseDurationsMs.scopedJobDetailReadBoundary ?? 0,
          mainJobLoad: phaseDurationsMs.mainJobLoad ?? 0,
          internalInvoiceRead: phaseDurationsMs.internalInvoiceRead ?? 0,
          invoiceLedgerDeliveryReads: phaseDurationsMs.invoiceLedgerDeliveryReads ?? 0,
          pricebookPickerRead: phaseDurationsMs.pricebookPickerRead ?? 0,
          assignmentDisplayMapAssignableUsers: phaseDurationsMs.assignmentDisplayMapAssignableUsers ?? 0,
          serviceCaseServiceChainReads: phaseDurationsMs.serviceCaseServiceChainReads ?? 0,
          timelineChainEventsActorMapReads: phaseDurationsMs.timelineChainEventsActorMapReads ?? 0,
          customerAttemptSummaryReads: phaseDurationsMs.customerAttemptSummaryReads ?? 0,
          remainingCompositionPrep: phaseDurationsMs.remainingCompositionPrep ?? 0,
        },
      }),
    );
  };

  const showEccNotice = notice === "ecc_test_required";

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

  if (actorResolution.kind === "unauthorized") {
    redirect("/login");
  }
  completePhase("authInternalResolution");

  const internalUser = actorResolution.internalUser;
  const contractors = await getContractors(internalUser.account_owner_user_id);

  let isInternalUser = true;
  let isInternalAdmin = false;
  let internalBusinessDisplayName = "";
  let billingMode: BillingMode = "external_billing";

  isInternalAdmin = internalUser.role === "admin";
  const internalBusinessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });
  internalBusinessDisplayName = internalBusinessIdentity.display_name;
  billingMode = await resolveBillingModeByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });
  completePhase("billingModeBusinessIdentity");

  // Explicit same-account internal scoped-job preflight: deny before main job-detail read assembly
  const scopedReadJob = await loadScopedInternalJobDetailReadBoundary({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
  });
  if (!scopedReadJob?.id) {
    return notFound();
  }
  completePhase("scopedJobDetailReadBoundary");

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(`
      customer_id,
      location_id,
       service_case_id,
      job_type,
      service_visit_type,
      service_visit_reason,
      service_visit_outcome,
      visit_scope_summary,
      visit_scope_items,
      project_type,
      id,
      parent_job_id,
      title,
      city,
      job_address,
      status,
      scheduled_date,
      created_at,
      deleted_at,
      contractor_id,
      ops_status,
      field_complete,
      certs_complete,
      invoice_complete,
      invoice_number,
      pending_info_reason,
      on_hold_reason,
      follow_up_date,
      next_action_note,
      action_required_by,
      permit_number,
      jurisdiction,
      permit_date,
      window_start,
      window_end,
      customer_phone,
      on_the_way_at,
      customer_first_name,
      customer_last_name,
      customer_email,
      job_notes,
      billing_recipient,
      billing_name,
      billing_email,
      billing_phone,
      billing_address_line1,
      billing_address_line2, 
      billing_city,
      billing_state,
      billing_zip,
      locations:location_id (
        id,
        address_line1,
        address_line2,
        city,
        state,
        zip
      ),
      job_equipment (
        id,
        equipment_role,
        manufacturer,
        model,
        serial,
        tonnage,
        heating_capacity_kbtu,
        refrigerant_type,
        notes,
        created_at,
        updated_at
      ),
      ecc_test_runs (
        id,
        test_type,
        data,
        computed,
        computed_pass,
        override_pass,
        override_reason,
        created_at,
        updated_at
      )
    `)
    .eq("id", jobId)

    .single();

  if (jobError) throw jobError;
  if (!job) return notFound();
  if (job.deleted_at) redirect("/ops?saved=job_archived");
  completePhase("mainJobLoad");

  const internalInvoice =
    isInternalUser && billingMode === "internal_invoicing"
      ? await resolveInternalInvoiceByJobId({ supabase, jobId })
      : null;

  const latestVoidedInternalInvoice =
    isInternalUser && billingMode === "internal_invoicing" && !internalInvoice
      ? await resolveLatestVoidedInternalInvoiceByJobId({ supabase, jobId })
      : null;
  completePhase("internalInvoiceRead");

  const internalInvoiceEmailDeliveries: InternalInvoiceEmailDeliveryRecord[] =
    isInternalUser && internalInvoice
      ? await resolveInternalInvoiceEmailDeliveries({
          supabase,
          jobId,
          invoiceId: internalInvoice.id,
        })
      : [];

  const internalInvoicePaymentLedger =
    isInternalUser && internalInvoice
      ? await resolveInvoiceCollectedPaymentLedger(
          internalUser.account_owner_user_id,
          internalInvoice.id,
          supabase,
        )
      : null;
  completePhase("invoiceLedgerDeliveryReads");

  let pricebookPickerItems: Array<{
    id: string;
    item_name: string;
    item_type: string;
    category: string | null;
    default_description: string | null;
    default_unit_price: number;
    unit_label: string | null;
  }> = [];

  if (
    isInternalUser &&
    billingMode === "internal_invoicing" &&
    internalInvoice?.status === "draft"
  ) {
    const { data: pricebookRows, error: pricebookRowsErr } = await supabase
      .from("pricebook_items")
      .select("id, item_name, item_type, category, default_description, default_unit_price, unit_label")
      .eq("account_owner_user_id", internalUser.account_owner_user_id)
      .eq("is_active", true)
      .in("item_type", ["service", "material", "diagnostic"])
      .gte("default_unit_price", 0)
      .order("item_name", { ascending: true });

    if (pricebookRowsErr) throw pricebookRowsErr;

    pricebookPickerItems = (pricebookRows ?? []).map((row: any) => ({
      id: String(row?.id ?? "").trim(),
      item_name: String(row?.item_name ?? "").trim(),
      item_type: String(row?.item_type ?? "").trim(),
      category: String(row?.category ?? "").trim() || null,
      default_description: String(row?.default_description ?? "").trim() || null,
      default_unit_price: Number(row?.default_unit_price ?? 0) || 0,
      unit_label: String(row?.unit_label ?? "").trim() || null,
    }));
  }
  completePhase("pricebookPickerRead");

  const activeAssignmentDisplayMap = await getActiveJobAssignmentDisplayMap({
    supabase,
    jobIds: [String(job.id ?? jobId)],
  });

  const assignedTeam =
    activeAssignmentDisplayMap[String(job.id ?? jobId)] ?? [];

  const assignableInternalUsers = isInternalUser
    ? await getAssignableInternalUsers({ supabase })
    : [];

  const assignedUserIds = new Set(
    assignedTeam
      .map((row) => String(row.user_id ?? "").trim())
      .filter(Boolean),
  );

  const assignmentCandidates = assignableInternalUsers.filter(
    (row) => !assignedUserIds.has(String(row.user_id ?? "").trim()),
  );
  completePhase("assignmentDisplayMapAssignableUsers");

  // --- Linked Jobs (Parent + Children) ---
const parentJobId = (job as any).parent_job_id as string | null;
const retestRootId = parentJobId ?? jobId;

// --- Service Chain (full case history) ---
const serviceCaseId = (job as any).service_case_id as string | null;

const { data: serviceCase, error: serviceCaseErr } = serviceCaseId
  ? await supabase
      .from("service_cases")
      .select("id, case_kind")
      .eq("id", serviceCaseId)
      .maybeSingle()
  : { data: null, error: null };

if (serviceCaseErr) throw new Error(serviceCaseErr.message);

const { data: serviceChainJobs, error: serviceChainErr } = serviceCaseId
  ? await supabase
      .from("jobs")
      .select(
        "id, title, status, ops_status, job_type, created_at, scheduled_date, window_start, window_end, parent_job_id"
      )
      .eq("service_case_id", serviceCaseId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(50)
  : { data: [], error: null };

if (serviceChainErr) throw new Error(serviceChainErr.message);

const serviceChainJobIds = (serviceChainJobs ?? []).map((j: any) => j.id);

const { data: serviceChainRuns, error: serviceChainRunsErr } =
  serviceChainJobIds.length > 0
    ? await supabase
        .from("ecc_test_runs")
        .select(
          "id, job_id, created_at, test_type, computed, computed_pass, override_pass, is_completed"
        )
        .in("job_id", serviceChainJobIds)
        .eq("is_completed", true)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

if (serviceChainRunsErr) throw new Error(serviceChainRunsErr.message);

const latestServiceChainRunByJob = new Map<string, any>();
const latestFailedServiceChainRunByJob = new Map<string, any>();

for (const run of serviceChainRuns ?? []) {
  // because we ordered newest first,
  // the first run we see for a job is the newest one
  const rowJobId = String(run.job_id ?? "").trim();
  if (!rowJobId) continue;
  if (!latestServiceChainRunByJob.has(rowJobId)) {
    latestServiceChainRunByJob.set(rowJobId, run);
  }
  if (finalRunPass(run) === false && !latestFailedServiceChainRunByJob.has(rowJobId)) {
    latestFailedServiceChainRunByJob.set(rowJobId, run);
  }
}

const serviceChainFailureReasonByJob = new Map<string, string>();
for (const [rowJobId, run] of latestFailedServiceChainRunByJob.entries()) {
  const primaryReason = String(extractFailureReasons(run)[0] ?? "").trim();
  if (primaryReason) serviceChainFailureReasonByJob.set(rowJobId, primaryReason);
}
completePhase("serviceCaseServiceChainReads");

const { data: timelineJobs, error: timelineJobsErr } = await supabase
  .from("jobs")
  .select("id")
  .is("deleted_at", null)
  .or(`id.eq.${retestRootId},parent_job_id.eq.${retestRootId}`)
  .limit(50);

if (timelineJobsErr) throw new Error(timelineJobsErr.message);

const timelineJobIds = (timelineJobs ?? []).map((j: any) => String(j.id ?? "")).filter(Boolean);
const hasDirectNarrativeChain = timelineJobIds.some((id) => id !== jobId);

// --- Unified Timeline (job_events) ---
const { data: timelineEvents, error: tlErr } = await supabase
  .from("job_events")
  .select("id, job_id, created_at, event_type, message, meta, user_id")
  .in("job_id", timelineJobIds.length ? timelineJobIds : [jobId])
  .order("created_at", { ascending: false })
  .limit(200);
if (tlErr) throw new Error(tlErr.message);

const timelineActorIds = Array.from(
  new Set(
    (timelineEvents ?? [])
      .flatMap((e: any) => {
        const meta = e?.meta && typeof e.meta === "object" && !Array.isArray(e.meta) ? e.meta : null;
        return [
          String(e?.user_id ?? "").trim(),
          String(meta?.actor_user_id ?? "").trim(),
        ];
      })
      .filter(Boolean),
  ),
);

const actorDisplayMap = await resolveUserDisplayMap({
  supabase,
  userIds: timelineActorIds,
});
completePhase("timelineChainEventsActorMapReads");

const eventsForCurrentJob = (timelineEvents ?? []).filter(
  (e: any) => String(e?.job_id ?? "") === String(job.id ?? "")
);

const contractorResponseTracking = resolveContractorResponseTracking(eventsForCurrentJob as any[]);

const contractorResponseLabel = contractorResponseTracking.latestReportSentAt
  ? contractorResponseTracking.waitingOnContractor
    ? "Waiting on contractor"
    : contractorResponseTracking.hasContractorResponse && contractorResponseTracking.lastResponseType === "note"
    ? "Contractor responded"
    : contractorResponseTracking.hasContractorResponse && contractorResponseTracking.lastResponseType === "correction"
    ? "Correction submitted"
    : contractorResponseTracking.hasContractorResponse && contractorResponseTracking.lastResponseType === "retest"
    ? "Retest requested"
    : contractorResponseTracking.hasContractorResponse
    ? "Contractor responded"
    : null
  : null;

const contractorResponseSubLabel =
  contractorResponseTracking.latestReportSentAt &&
  contractorResponseTracking.hasContractorResponse &&
  contractorResponseTracking.awaitingInternalReview
    ? "Awaiting internal review"
    : null;

const onTheWayUndoEligibility = await getOnTheWayUndoEligibility(jobId);

  const sharedNotes = (timelineEvents ?? []).filter((e: any) =>
    ["contractor_note", "public_note", "contractor_correction_submission"].includes(
      String(e?.event_type ?? "")
    )
  );

  const internalNotes = (timelineEvents ?? []).filter(
    (e: any) => String(e?.event_type ?? "") === "internal_note"
  );

  const { count: customerAttemptCount, error: attemptCountErr } = await supabase
    .from("job_events")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("event_type", "customer_attempt");

  if (attemptCountErr) throw new Error(attemptCountErr.message);

  const { data: latestCustomerAttempt, error: latestAttemptErr } = await supabase
    .from("job_events")
    .select("created_at")
    .eq("job_id", jobId)
    .eq("event_type", "customer_attempt")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestAttemptErr) throw new Error(latestAttemptErr.message);
  completePhase("customerAttemptSummaryReads");

const contractorId = job.contractor_id ?? null;
const customerId = job.customer_id ?? null;

const { data: contractorBilling } = contractorId
  ? await supabase
      .from("contractors")
      .select(
        "id, name, billing_name, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip"
      )
      .eq("id", contractorId)
      .maybeSingle()
  : { data: null };

const { data: customerBilling } = customerId
  ? await supabase
      .from("customers")
      .select(
        "id, full_name, first_name, last_name, phone, email, billing_name, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip"
      )
      .eq("id", customerId)
      .maybeSingle()
  : { data: null };


  const attemptCount = customerAttemptCount ?? 0;
  const lastAttemptIso = latestCustomerAttempt?.created_at
    ? String(latestCustomerAttempt.created_at)
    : null;

  const lastAttemptLabel = lastAttemptIso ? formatDateLAFromIso(lastAttemptIso) : "—";

  const customerName =
  (customerBilling?.full_name ||
    [customerBilling?.first_name, customerBilling?.last_name].filter(Boolean).join(" ").trim() ||
    [job.customer_first_name, job.customer_last_name].filter(Boolean).join(" ").trim() ||
    "—");

const customerPhone =
  customerBilling?.phone ?? job.customer_phone ?? "—";

const customerEmail =
  customerBilling?.email ?? job.customer_email ?? "—";

  const contractorName =
    contractors?.find((c: any) => c.id === job.contractor_id)?.name ?? internalBusinessDisplayName;

  const firstNonEmpty = (...values: Array<unknown>) => {
    for (const v of values) {
      const s = String(v ?? "").trim();
      if (s) return s;
    }
    return null;
  };

  const serviceLocation = Array.isArray((job as any).locations)
    ? (job as any).locations.find((location: any) => location) ?? null
    : (job as any).locations ?? null;

  const serviceAddressLine1 =
    firstNonEmpty(
      serviceLocation?.address_line1,
      (job as any).address_line1,
      job.job_address
    );

  const serviceAddressLine2 =
    firstNonEmpty(
      serviceLocation?.address_line2,
      (job as any).address_line2
    );

  const serviceCity =
    firstNonEmpty(
      serviceLocation?.city,
      job.city
    );

  const serviceState =
    firstNonEmpty(
      serviceLocation?.state,
      (job as any).state
    );

  const serviceZip =
    firstNonEmpty(
      serviceLocation?.zip,
      (job as any).zip
    );

  const serviceAddressParts = [
    serviceAddressLine1,
    serviceAddressLine2,
    [serviceCity, serviceState, serviceZip].filter(Boolean).join(" "),
  ].filter((x) => String(x ?? "").trim().length > 0);

  const serviceAddressDisplay =
    serviceAddressParts.length > 0 ? serviceAddressParts.join(", ") : "No address set";

    const hasFullSchedule =
    !!job.scheduled_date &&
    !!job.window_start &&
    !!job.window_end;

  const appointmentDateLabel = job.scheduled_date
    ? formatBusinessDateUS(String(job.scheduled_date))
    : "No appointment scheduled";
  const appointmentTimeLabel =
    job.window_start && job.window_end
      ? `${formatTimeDisplay(job.window_start)}–${formatTimeDisplay(job.window_end)}`
      : job.window_start
      ? `Starts ${formatTimeDisplay(job.window_start)}`
      : job.window_end
      ? `Ends ${formatTimeDisplay(job.window_end)}`
      : job.scheduled_date
      ? "Time window TBD"
      : "Use the schedule controls below to assign a visit time.";

function formatOpsStatusLabel(value?: string | null) {
  const v = String(value ?? "").trim();
  if (!v) return "—";

  const labelMap: Record<string, string> = {
    need_to_schedule: "Need to Schedule",
    scheduled: "Scheduled",
    on_the_way: "On the Way",
    in_process: "In Progress",
    pending_info: "Pending Info",
    pending_office_review: "Pending Office Review",
    on_hold: "On Hold",
    failed: "Failed",
    retest_needed: "Retest Needed",
    paperwork_required: "Paperwork Required",
    invoice_required: "Invoice Required",
    closed: "Closed",
  };

  const mapped = labelMap[v.toLowerCase()];
  if (mapped) return mapped;

  return v
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function serviceChainBadgeClass(opsStatus?: string | null, isCurrent?: boolean) {
  const v = String(opsStatus ?? "").toLowerCase();

  if (isCurrent) {
    return "bg-black text-white";
  }

  if (v === "failed" || v === "retest_needed" || v === "pending_office_review") {
    return "bg-red-100 text-red-800";
  }

  if (v === "pending_info") {
    return "bg-amber-100 text-amber-800";
  }

  if (v === "scheduled" || v === "ready") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (v === "paperwork_required" || v === "invoice_required" || v === "field_complete") {
    return "bg-blue-100 text-blue-800";
  }

  if (v === "closed") {
    return "bg-gray-200 text-gray-800";
  }

  return "bg-gray-100 text-gray-700";
}
    
function formatBillingAddress(a: {
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
}) {
  const line1 = a.billing_address_line1 ?? "";
  const line2 = a.billing_address_line2 ?? "";
  const city = a.billing_city ?? "";
  const state = a.billing_state ?? "";
  const zip = a.billing_zip ?? "";

  const parts = [
    line1,
    line2,
    [city, state, zip].filter(Boolean).join(" "),
  ].filter((x) => String(x || "").trim().length > 0);

  return parts;
}

const isFieldComplete = !!job.field_complete;

const isFailedUnresolved =
  ["failed", "retest_needed", "pending_office_review"].includes(String(job.ops_status ?? ""));

const billingState = buildJobBillingStateReadModel({
  billingMode,
  invoiceComplete: job.invoice_complete,
  internalInvoice,
});

const closeoutProjectionJob = {
  field_complete: job.field_complete,
  job_type: job.job_type,
  ops_status: job.ops_status,
  invoice_complete: billingState.billedTruthSatisfied,
  certs_complete: job.certs_complete,
};

const isAdminComplete =
  (job.job_type === "service" && billingState.billedTruthSatisfied) ||
  (job.job_type === "ecc" && billingState.billedTruthSatisfied && job.certs_complete);

const closeoutNeeds = getCloseoutNeeds(closeoutProjectionJob);
const isCloseoutPending = isInCloseoutQueue(closeoutProjectionJob);

const canShowCertsButton =
  job.job_type === "ecc" &&
  !job.certs_complete &&
  !isFailedUnresolved;

const canShowInvoiceButton =
  job.job_type === "ecc" &&
  !billingState.billedTruthSatisfied &&
  billingState.lightweightBillingAllowed &&
  String(job.ops_status ?? "") !== "closed";

const billingModeBlocksLightweightBilling = !billingState.lightweightBillingAllowed;

const showInternalInvoicingPlaceholder =
  isInternalUser &&
  billingModeBlocksLightweightBilling &&
  !billingState.billedTruthSatisfied &&
  (
    job.job_type === "service" ||
    (job.job_type === "ecc" && String(job.ops_status ?? "").toLowerCase() !== "closed")
  );

const showCloseoutRow =
  isInternalUser &&
  job.status === "completed" &&
  isFieldComplete &&
  !isAdminComplete &&
  (
    !isFailedUnresolved
      ? (canShowCertsButton || canShowInvoiceButton)
      : canShowInvoiceButton
  );

const showExternalDataEntryPrompt =
  billingState.lightweightBillingAllowed &&
  ["data_entry", "invoice_required"].includes(String(job.ops_status ?? "").toLowerCase());

const showInternalInvoicePanel =
  isInternalUser &&
  billingState.internalInvoicePanelEnabled;

const showReplacementInvoicePrompt =
  showInternalInvoicePanel &&
  !internalInvoice &&
  !!latestVoidedInternalInvoice;

const visitScopeSummary = sanitizeVisitScopeSummary((job as any).visit_scope_summary);
let visitScopeItems = [] as Array<{
  id?: string;
  title: string;
  details: string | null;
  kind: "primary" | "companion_service";
  promoted_service_job_id?: string | null;
  promoted_at?: string | null;
  promoted_by_user_id?: string | null;
}>;
try {
  visitScopeItems = sanitizeVisitScopeItems((job as any).visit_scope_items ?? []);
} catch {
  visitScopeItems = [];
}
  completePhase("remainingCompositionPrep");
const visitScopeCount = visitScopeItems.length;
const hasVisitScopeDefined = Boolean(visitScopeSummary) || visitScopeCount > 0;
const visitScopeHeaderPreview = buildVisitScopeReadModel(visitScopeSummary, visitScopeItems, {
  leadMaxLength: 110,
  previewItemCount: 1,
  previewItemMaxLength: 34,
});
const promotedCompanionHeader = buildPromotedCompanionReadModel(visitScopeItems);
const primaryVisitScopeItems = visitScopeItems.filter((item) => item.kind === "primary");
const companionVisitScopeItems = visitScopeItems.filter((item) => item.kind === "companion_service");
const visitScopeLeadText = visitScopeSummary || visitScopeHeaderPreview.lead;
const visitScopeBadgeItems = primaryVisitScopeItems.length > 0 ? primaryVisitScopeItems : visitScopeItems;
const visitScopeBadgeItemCount = visitScopeBadgeItems.length;
const visitScopeBadgeFirstTitle = visitScopeBadgeItems[0]?.title ?? "";
const visitScopeBadgeMainText = visitScopeBadgeItemCount > 0
  ? `${visitScopeBadgeItemCount} item${visitScopeBadgeItemCount === 1 ? "" : "s"} · ${visitScopeBadgeFirstTitle}${visitScopeBadgeItemCount > 1 ? ` + ${visitScopeBadgeItemCount - 1} more` : ""}`
  : visitScopeSummary
    ? "Summary added"
    : "No work details yet";
const visitScopeBadgeSubtext = visitScopeBadgeItemCount > 0
  ? visitScopeSummary
    ? "Summary added"
    : null
  : visitScopeHeaderPreview.lead || null;

const internalInvoiceBillingAddress = internalInvoice
  ? formatBillingAddress({
      billing_address_line1: internalInvoice.billing_address_line1,
      billing_address_line2: internalInvoice.billing_address_line2,
      billing_city: internalInvoice.billing_city,
      billing_state: internalInvoice.billing_state,
      billing_zip: internalInvoice.billing_zip,
    })
  : [];

const internalInvoiceLineItemCount = internalInvoice?.line_items?.length ?? 0;
const existingVisitScopeInvoiceSourceIds = new Set(
  (internalInvoice?.line_items ?? [])
    .filter((lineItem) => lineItem.source_kind === "visit_scope")
    .map((lineItem) => sanitizeVisitScopeItemId(lineItem.source_visit_scope_item_id))
    .filter(Boolean) as string[],
);
const rawVisitScopeRows = Array.isArray((job as any).visit_scope_items)
  ? (job as any).visit_scope_items
  : [];
const visitScopeInvoicePickerItems = rawVisitScopeRows
  .map((rawRow: any) => {
    const persistedItemId = sanitizeVisitScopeItemId(rawRow?.id);
    if (!persistedItemId) return null;

    let sanitizedRowItems: Array<{
      title: string;
      details: string | null;
      kind: "primary" | "companion_service";
    }> = [];
    try {
      sanitizedRowItems = sanitizeVisitScopeItems([rawRow]);
    } catch {
      return null;
    }

    const sanitizedRow = sanitizedRowItems[0];
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
const internalInvoiceRecipientName = String(internalInvoice?.billing_name ?? "").trim() || "Billing recipient not set";
const internalInvoiceRecipientContact = [
  String(internalInvoice?.billing_email ?? "").trim(),
  String(internalInvoice?.billing_phone ?? "").trim(),
].filter(Boolean);
const internalInvoiceHasNotes = String(internalInvoice?.notes ?? "").trim().length > 0;
const latestInternalInvoiceEmailDelivery = internalInvoiceEmailDeliveries[0] ?? null;
const latestSuccessfulInternalInvoiceEmailDelivery =
  internalInvoiceEmailDeliveries.find((delivery) => delivery.status === "sent") ?? null;
const lastInternalInvoiceSentLabel = latestSuccessfulInternalInvoiceEmailDelivery?.sentAt
  ? formatDateTimeLAFromIso(String(latestSuccessfulInternalInvoiceEmailDelivery.sentAt))
  : "";
const internalInvoiceEmailButtonLabel = latestSuccessfulInternalInvoiceEmailDelivery ? "Send Again" : "Send Invoice Email";
const internalInvoiceSendTargetDefault =
  String(latestInternalInvoiceEmailDelivery?.recipientEmail ?? internalInvoice?.billing_email ?? "").trim();
const internalInvoiceSendTargetMissing = internalInvoiceSendTargetDefault.length === 0;
const internalInvoicePaymentRows: InternalInvoicePaymentRow[] = internalInvoicePaymentLedger?.rows ?? [];
const internalInvoicePaymentSummary = internalInvoicePaymentLedger?.summary ?? {
  invoiceId: String(internalInvoice?.id ?? ""),
  invoiceTotalCents: Number(internalInvoice?.total_cents ?? 0) || 0,
  amountPaidCents: 0,
  balanceDueCents: Number(internalInvoice?.total_cents ?? 0) || 0,
  paymentStatus: "unpaid" as const,
};
const internalInvoicePaymentStatusLabel =
  internalInvoicePaymentSummary.paymentStatus === "paid"
    ? "Paid"
    : internalInvoicePaymentSummary.paymentStatus === "partial"
      ? "Partially Paid"
      : "Unpaid";
const internalInvoicePaymentStatusChipClass =
  internalInvoicePaymentSummary.paymentStatus === "paid"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : internalInvoicePaymentSummary.paymentStatus === "partial"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-slate-200 bg-slate-50 text-slate-700";

const internalInvoiceReadyToIssue =
  internalInvoice != null &&
  internalInvoice.status === "draft" &&
  String(job.status ?? "").toLowerCase() === "completed" &&
  isFieldComplete &&
  internalInvoiceLineItemCount > 0 &&
  String(internalInvoice.billing_name ?? "").trim().length > 0 &&
  Number(internalInvoice.total_cents ?? 0) > 0;

const internalInvoiceStatusChipClass =
  billingState.statusTone === "emerald"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : billingState.statusTone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : billingState.statusTone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-slate-50 text-slate-700";

const issuedInvoiceStatusMessage =
  internalInvoice?.status === "issued"
    ? job.job_type === "ecc" && !job.certs_complete
      ? `Issued ${internalInvoice.issued_at ? displayDateLA(internalInvoice.issued_at) : ""}. Billing is satisfied, but certs are still open before this job can fully close.`
      : `Issued ${internalInvoice.issued_at ? displayDateLA(internalInvoice.issued_at) : ""}. The job's billing-closeout requirement is currently satisfied.`
    : "";

const canShowReleaseAndReevaluate = [
  "pending_info",
  "on_hold",
  "failed",
  "retest_needed",
  "paperwork_required",
  "invoice_required",
].includes(String(job.ops_status ?? "").toLowerCase());

const currentOpsStatus = String(job.ops_status ?? "").toLowerCase();
const pendingInfoReasonText = String((job as any).pending_info_reason ?? "").trim();
const onHoldReasonText = String((job as any).on_hold_reason ?? "").trim();
const explicitPendingInfoActive = currentOpsStatus === "pending_info";
const onHoldActive = currentOpsStatus === "on_hold";
const activeWaitingState = getActiveWaitingState({
  ops_status: job.ops_status ?? null,
  pending_info_reason: (job as any).pending_info_reason ?? null,
  on_hold_reason: (job as any).on_hold_reason ?? null,
});
const canShowWaitingReleaseQuickAction = Boolean(activeWaitingState) && canShowReleaseAndReevaluate;
const actionablePendingInfo = explicitPendingInfoActive;
const hasFollowUpReminder =
  Boolean((job as any).follow_up_date) ||
  Boolean(String((job as any).next_action_note ?? "").trim()) ||
  Boolean(String((job as any).action_required_by ?? "").trim());
const currentStatusReasonLabel = explicitPendingInfoActive
  ? "Pending Info blocker"
  : onHoldActive
  ? "On Hold reason"
  : null;
const currentStatusReasonText = explicitPendingInfoActive
  ? pendingInfoReasonText
  : onHoldActive
  ? onHoldReasonText
  : "";
const currentInterruptState = activeWaitingState
  ? "waiting"
  : explicitPendingInfoActive
  ? "pending_info"
  : onHoldActive
  ? "on_hold"
  : "";
const currentInterruptReasonText = activeWaitingState
  ? activeWaitingState.blockerReason
  : explicitPendingInfoActive
  ? pendingInfoReasonText
  : onHoldReasonText;
const interruptReleaseActionLabel = currentInterruptState
  ? getInterruptClearActionLabel(currentInterruptState)
  : "Release & Re-evaluate";
const initialWaitingReasonType = activeWaitingState?.blockerType ?? "waiting_on_information";
const initialWaitingOtherReason = activeWaitingState?.blockerType === "other"
  ? activeWaitingState.blockerReason
  : "";
const initialInterruptReason = activeWaitingState
  ? ""
  : explicitPendingInfoActive
  ? pendingInfoReasonText
  : onHoldReasonText;

const locationId = serviceLocation?.id ?? null;

const digitsOnly = (v?: string | null) => String(v ?? "").replace(/\D/g, "");

const telLink =
  customerPhone !== "—" && digitsOnly(customerPhone)
    ? `tel:${digitsOnly(customerPhone)}`
    : "";

const serviceMapsLink =
  serviceAddressDisplay && serviceAddressDisplay !== "No address set"
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(serviceAddressDisplay)}`
    : "";

const permitNumber = String(job.permit_number ?? "").trim();
const permitJurisdiction = String((job as any).jurisdiction ?? "").trim();
const permitDateValue = String((job as any).permit_date ?? "").trim();
const permitDateLabel = permitDateValue ? displayDateLA(permitDateValue) : "";
const permitDetailCount = Number(Boolean(permitNumber)) + Number(Boolean(permitJurisdiction)) + Number(Boolean(permitDateValue));
const hasPermitDetails = permitDetailCount > 0;

const serviceCaseVisitCount = serviceChainJobs?.length ?? 0;
const equipmentItems = Array.isArray(job.job_equipment) ? job.job_equipment : [];
const equipmentCount = equipmentItems.length;
const outdoorEquipment = equipmentItems.find((eq: any) => {
  const role = String(eq?.equipment_role ?? "").toLowerCase();
  return role.includes("condenser") || role.includes("outdoor") || role.includes("package");
});
const indoorEquipment = equipmentItems.find((eq: any) => {
  const role = String(eq?.equipment_role ?? "").toLowerCase();
  return role.includes("air_handler") || role.includes("furnace") || role.includes("indoor") || role.includes("coil");
});
const equipmentSummaryLabel =
  equipmentCount > 0
    ? `${equipmentCount} item(s) linked to this job`
    : "No equipment on file yet.";

const timelineItems = timelineEvents ?? [];
const timelinePreviewItems = timelineItems.slice(0, 3);
const timelineOverflowItems = timelineItems.slice(3);

const followUpOwnerLabel = String((job as any).action_required_by ?? "").trim();
const followUpDateValue = String((job as any).follow_up_date ?? "").trim();
const followUpDateSummary = followUpDateValue ? displayDateLA(followUpDateValue) : "";
const nextActionPreview = truncateSummaryText(String((job as any).next_action_note ?? ""), 78);
const jobStatusSummaryText = activeWaitingState
  ? `Waiting${activeWaitingState.blockerReason ? ` • ${truncateSummaryText(activeWaitingState.blockerReason, 72)}` : ""}`
  : explicitPendingInfoActive
  ? `Pending Info${pendingInfoReasonText ? ` • ${truncateSummaryText(pendingInfoReasonText, 72)}` : ""}`
  : onHoldActive
  ? `On Hold${onHoldReasonText ? ` • ${truncateSummaryText(onHoldReasonText, 72)}` : ""}`
  : `Current lifecycle: ${formatOpsStatusLabel(job.ops_status)}`;
const followUpSummaryText = hasFollowUpReminder
  ? [
      followUpOwnerLabel ? `For ${followUpOwnerLabel}` : null,
      followUpDateSummary ? `Due ${followUpDateSummary}` : null,
      nextActionPreview || null,
    ]
      .filter(Boolean)
      .join(" • ")
  : "No follow-up reminder set yet.";
const followUpHistorySummaryText = attemptCount
  ? `Last contact logged ${lastAttemptLabel}.`
  : "No contact attempts logged yet.";
const serviceChainSummaryText = serviceCaseId
  ? "Visit history across the linked service case."
  : "No linked service case yet.";
const eccSummaryText = job.ecc_test_runs?.length
  ? "Recorded test history with direct workspace access."
  : "No ECC runs recorded yet.";
const latestSharedNoteAt = sharedNotes[0]?.created_at ? formatDateLAFromIso(String(sharedNotes[0].created_at)) : "";
const latestInternalNoteAt = internalNotes[0]?.created_at ? formatDateLAFromIso(String(internalNotes[0].created_at)) : "";
const latestTimelineAt = timelineItems[0]?.created_at ? formatDateTimeLAFromIso(String(timelineItems[0].created_at)) : "";
const sharedNotesTitle = hasDirectNarrativeChain ? "Shared Notes Across Job Chain" : "Shared Notes";
const internalNotesTitle = hasDirectNarrativeChain ? "Internal Notes Across Job Chain" : "Internal Notes";
const timelineTitle = hasDirectNarrativeChain ? "Job Chain Timeline" : "Timeline";
const sharedNotesSummaryText = latestSharedNoteAt
  ? hasDirectNarrativeChain
    ? `Latest shared chain activity ${latestSharedNoteAt}.`
    : `Latest shared activity ${latestSharedNoteAt}.`
  : hasDirectNarrativeChain
  ? "No shared note activity in this direct retest chain yet."
  : "No shared note activity yet.";
const internalNotesSummaryText = latestInternalNoteAt
  ? hasDirectNarrativeChain
    ? `Latest internal chain note ${latestInternalNoteAt}.`
    : `Latest internal note ${latestInternalNoteAt}.`
  : hasDirectNarrativeChain
  ? "No internal note activity in this direct retest chain yet."
  : "No internal note activity yet.";
const timelineSummaryText = latestTimelineAt
  ? hasDirectNarrativeChain
    ? `Latest chain activity ${latestTimelineAt}.`
    : `Latest activity ${latestTimelineAt}.`
  : hasDirectNarrativeChain
  ? "No activity recorded in this direct retest chain yet."
  : "No activity recorded yet.";

const showRetestSection =
  ["failed", "retest_needed", "pending_office_review"].includes(String(job.ops_status ?? ""));
const showCorrectionReviewResolution =
  isInternalUser &&
  job.job_type === "ecc" &&
  ["failed", "retest_needed", "pending_office_review"].includes(String(job.ops_status ?? ""));
const failureResolutionSummaryText = showRetestSection && showCorrectionReviewResolution
  ? "Choose between retest creation and correction review resolution."
  : showRetestSection
  ? "Create a retest visit when a physical return is required."
  : "Resolve this failure through correction review only when a return visit is not needed.";
const failureResolutionPathCount = Number(showRetestSection) + Number(showCorrectionReviewResolution);

const renderTimelineItem = (e: any, key: string) => {
  const when = e?.created_at ? formatDateTimeLAFromIso(String(e.created_at)) : "—";
  const type = String(e?.event_type ?? "");
  const meta = e?.meta ?? {};
  const actorUserId = String(meta?.actor_user_id ?? e?.user_id ?? "").trim();
  const actorDisplayName = actorUserId ? actorDisplayMap[actorUserId] ?? "User" : "";
  const detailText = formatTimelineDetail(type, meta, e?.message);
  const title = ["public_note", "contractor_note", "contractor_correction_submission"].includes(type)
    ? formatSharedHistoryHeading(type, meta)
    : formatTimelineEvent(type, meta, e?.message);

  const icon =
    type === "job_created" ? "🆕" :
    type === "intake_submitted" ? "📥" :
    type === "retest_created" ? "🔁" :
    type === "customer_attempt" ? "📞" :
    type === "status_changed" ? "🔄" :
    type === "on_my_way" ? "🚗" :
    type === "on_the_way_reverted" ? "↩️" :
    type === "job_started" ? "🛠️" :
    type === "job_completed" ? "🏁" :
    type === "job_failed" ? "❌" :
    type === "job_passed" ? "✅" :
    type === "scheduled" ? "📅" :
    type === "unscheduled" ? "🗓️" :
    type === "retest_scheduled" ? "📅" :
    type === "retest_started" ? "🛠️" :
    type === "retest_passed" ? "✅" :
    type === "retest_failed" ? "❌" :
    type === "schedule_updated" ? "🕒" :
    type === "contractor_note" ? "💬" :
    type === "public_note" ? "💬" :
    type === "internal_note" ? "📝" :
    type === "internal_invoice_drafted" ? "🧾" :
    type === "internal_invoice_issued" ? "🧾" :
    type === "internal_invoice_voided" ? "⛔" :
    type === "internal_invoice_email_sent" ? "✉️" :
    type === "internal_invoice_email_resent" ? "📨" :
    type === "internal_invoice_email_failed" ? "⚠️" :
    type === "payment_recorded" ? "💵" :
    type === "companion_scope_promoted" ? "🔀" :
    type === "created_from_companion_scope" ? "🧰" :
    type === "failure_resolved_by_correction_review" ? "✅" :
    type === "contractor_correction_submission" ? "📎" :
    "📝";

  emitTimingLog({
    invoicePanelActive: showInternalInvoicePanel,
    serviceCaseExists: Boolean(serviceCaseId),
    timelineChainExists: hasDirectNarrativeChain,
  });

  return (
    <div key={key} className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 text-sm shadow-[0_10px_24px_-24px_rgba(15,23,42,0.35)]">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium text-slate-500">{when}</div>
        <div className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs text-slate-500">{icon}</div>
      </div>

      <div className="mt-2 font-medium text-slate-950">
        {title}
      </div>

      {detailText ? (
        <div className="mt-1 text-sm leading-6 text-slate-700">
          {detailText}
        </div>
      ) : null}

      {actorDisplayName ? (
        <div className="mt-1 text-xs text-slate-500">By {actorDisplayName}</div>
      ) : null}

      {type === "retest_created" && meta?.child_job_id ? (
        <div className="mt-1 text-sm">
          Retest:{" "}
          <Link className="underline" href={`/jobs/${String(meta.child_job_id)}?tab=ops`}>
            View linked retest
          </Link>
        </div>
      ) : null}

      {type === "retest_created" && meta?.parent_job_id ? (
        <div className="mt-1 text-sm">
          Original:{" "}
          <Link className="underline" href={`/jobs/${String(meta.parent_job_id)}?tab=ops`}>
            View original job
          </Link>
        </div>
      ) : null}

      {type === "retest_passed" && meta?.child_job_id ? (
        <div className="mt-1 text-sm">
          Resolved by retest:{" "}
          <Link className="underline" href={`/jobs/${String(meta.child_job_id)}?tab=ops`}>
            View retest job
          </Link>
        </div>
      ) : null}

      {type === "retest_scheduled" && meta?.child_job_id ? (
        <div className="mt-1 text-sm">
          Retest scheduled:{" "}
          <Link className="underline" href={`/jobs/${String(meta.child_job_id)}?tab=ops`}>
            View retest job
          </Link>
        </div>
      ) : null}

      {type === "retest_started" && meta?.child_job_id ? (
        <div className="mt-1 text-sm">
          Active retest:{" "}
          <Link className="underline" href={`/jobs/${String(meta.child_job_id)}?tab=ops`}>
            View retest job
          </Link>
        </div>
      ) : null}

      {type === "retest_failed" && meta?.child_job_id ? (
        <div className="mt-1 text-sm">
          Retest failed again:{" "}
          <Link className="underline" href={`/jobs/${String(meta.child_job_id)}?tab=ops`}>
            View retest job
          </Link>
        </div>
      ) : null}

      {type === "companion_scope_promoted" && meta?.promoted_service_job_id ? (
        <div className="mt-1 text-sm">
          Service follow-up:{" "}
          <Link className="underline" href={`/jobs/${String(meta.promoted_service_job_id)}?tab=info`}>
            View service job
          </Link>
        </div>
      ) : null}

      {type === "created_from_companion_scope" && meta?.source_job_id ? (
        <div className="mt-1 text-sm">
          Source ECC job:{" "}
          <Link className="underline" href={`/jobs/${String(meta.source_job_id)}?tab=info`}>
            View source job
          </Link>
        </div>
      ) : null}
    </div>
  );
};

  return (
    <div className="mx-auto w-full min-w-0 max-w-[88rem] space-y-5 overflow-x-hidden p-4 sm:p-6">

<section className={`${workspaceSectionClass} mb-6 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.95))] shadow-[0_20px_44px_-34px_rgba(15,23,42,0.26)]`}>
  <div className="mb-4 border-b border-slate-200/80 pb-4">
    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
      <span>Job Workspace</span>
      <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/88 px-2.5 py-1 text-[10px] tracking-[0.12em] text-slate-500 shadow-[0_8px_18px_-22px_rgba(15,23,42,0.2)]">
        <span className="text-slate-400">ID</span>
        <span className="font-mono text-[11px] text-slate-700">{job.id}</span>
      </span>
    </div>

    <div className="mt-3 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0 max-w-3xl">
        <h1 className="text-[clamp(1.35rem,2vw,1.85rem)] font-semibold tracking-[-0.02em] text-slate-950">
          {normalizeRetestLinkedJobTitle(job.title) || "Operational job workspace"}
        </h1>
        <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-600">
          Single-job control center for scheduling, field progress, closeout, and record history.
        </p>
        {visitScopeHeaderPreview.hasContent ? (
          <div className="mt-2 flex max-w-2xl flex-wrap items-center gap-1.5 text-xs text-slate-600">
            <span className="font-semibold uppercase tracking-[0.1em] text-slate-500">Visit</span>
            <span className="font-medium text-slate-700">{visitScopeHeaderPreview.lead}</span>
            {visitScopeHeaderPreview.itemCount > 0 ? (
              <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                {visitScopeHeaderPreview.itemCount} item{visitScopeHeaderPreview.itemCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        ) : null}
        {isInternalUser && String(job.job_type ?? "").toLowerCase() === "ecc" && promotedCompanionHeader.hasPromotedCompanion ? (
          <div className="mt-2 flex max-w-2xl flex-wrap items-center gap-1.5 text-xs text-emerald-700">
            <span className="font-semibold uppercase tracking-[0.1em] text-emerald-600">Follow-up</span>
            <span className="font-medium">{promotedCompanionHeader.label}</span>
          </div>
        ) : null}
      </div>
      <div className="flex w-full flex-col gap-2.5 xl:w-auto xl:min-w-[24rem] xl:items-end">
        {!isFieldComplete ? (
          <div className="flex w-full flex-col items-start gap-2 xl:items-end">
            <div className="flex w-full flex-wrap justify-start gap-2 xl:justify-end">
              <JobFieldActionButton
                jobId={job.id}
                currentStatus={job.status}
                tab={tab}
                hasFullSchedule={hasFullSchedule}
              />

              {onTheWayUndoEligibility.eligible ? (
                <form action={revertOnTheWayFromForm} className="w-full sm:w-auto">
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="tab" value={tab} />
                  <SubmitButton
                    loadingText="Undoing..."
                    className="w-full rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 active:translate-y-[0.5px] sm:w-auto"
                  >
                    Undo On the Way
                  </SubmitButton>
                </form>
              ) : null}
            </div>

            {onTheWayUndoEligibility.eligible ? (
              <div className="text-xs text-slate-500 xl:text-right">
                Available only until any later job activity occurs.
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex w-full justify-start xl:justify-end">
            <span className="inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_24px_-18px_rgba(37,99,235,0.55)]">
              Field Complete
            </span>
          </div>
        )}

        <div className="flex w-full flex-wrap gap-2 xl:justify-end">
          <Link
            href="/ops"
            className={compactUtilityButtonClass}
          >
            Back to Ops
          </Link>

          {job.customer_id ? (
            <Link
              href={`/customers/${job.customer_id}`}
              className={compactUtilityButtonClass}
            >
              Open Customer
            </Link>
          ) : null}

          {job.job_type === "ecc" ? (
            <Link
              href={`/jobs/${job.id}/tests`}
              className={compactWorkspaceActionButtonClass}
            >
              Open Tests Workspace
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  </div>

  <div className={`${workspaceInsetClass} mb-4 border-slate-200/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.82),rgba(255,255,255,0.99))] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]`}>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)] lg:items-center">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Appointment</div>
        <div className="mt-1 text-[1.32rem] font-semibold tracking-[-0.02em] text-slate-950">{appointmentDateLabel}</div>
        <div className="mt-1 text-sm leading-6 text-slate-600">{appointmentTimeLabel}</div>

        {job.job_type === "service" ? (
          <div className="mt-4 border-t border-slate-200/60 pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Work Needed</div>
            <div className="mt-1 text-sm font-semibold leading-5 text-slate-900">{visitScopeBadgeMainText}</div>
            {visitScopeBadgeSubtext ? (
              <div className="mt-0.5 text-xs leading-5 text-slate-600">{visitScopeBadgeSubtext}</div>
            ) : null}
            <a
              href="#visit-scope-section"
              className="mt-1.5 inline-block text-xs font-semibold text-slate-600 underline-offset-2 transition-colors hover:text-slate-900 hover:underline"
            >
              {hasVisitScopeDefined ? "View work details" : "Add work details"}
            </a>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/76 px-3.5 py-3 shadow-[0_12px_28px_-30px_rgba(15,23,42,0.3)] backdrop-blur-[2px]">
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Schedule</div>
            <div className={`mt-1 text-[15px] font-semibold tracking-[-0.01em] ${job.scheduled_date ? "text-emerald-800" : "text-slate-700"}`}>
              {job.scheduled_date ? "Scheduled" : "Unscheduled"}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Time Window</div>
            <div className="mt-1 text-[15px] font-semibold tracking-[-0.01em] text-slate-800">
              {job.scheduled_date ? (hasFullSchedule ? "Confirmed" : "Pending") : "Not set"}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Field</div>
            <div className={`mt-1 text-[15px] font-semibold tracking-[-0.01em] ${isFieldComplete ? "text-emerald-800" : "text-blue-700"}`}>
              {formatStatus(job.status)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Ops</div>
            <div className="mt-1 text-[15px] font-semibold tracking-[-0.01em] text-slate-800">{formatOpsStatusLabel(job.ops_status)}</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div className={`mb-4 grid items-stretch gap-4${job.job_type === "ecc" ? " xl:grid-cols-[minmax(300px,0.94fr)_minmax(420px,1.22fr)_minmax(250px,0.74fr)]" : " xl:grid-cols-[minmax(320px,0.96fr)_minmax(440px,1.28fr)]"}`}>
    {/* Left: customer / contact info */}
    <div className={`${workspaceSubtleCardClass} border-slate-200/70 bg-white/92 p-4 sm:p-5`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {(job.job_type ? String(job.job_type).toUpperCase() : "SERVICE")}
        {serviceCity ? ` • ${serviceCity}` : ""}
      </div>

      {job.customer_id ? (
        <Link
          href={`/customers/${job.customer_id}`}
          className="mt-2 block text-[1.55rem] font-semibold tracking-[-0.02em] text-slate-950 hover:underline"
        >
          {customerName}
        </Link>
      ) : (
        <h1 className="mt-2 text-[1.55rem] font-semibold tracking-[-0.02em] text-slate-950">{customerName}</h1>
      )}

      <div className="mt-4 grid gap-x-6 gap-y-3 border-t border-slate-200/70 pt-4 text-sm sm:grid-cols-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Contractor</div>
          <div className="mt-1 font-semibold text-slate-800">{contractorName}</div>
        </div>
        {customerPhone !== "—" ? (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Phone</div>
            <div className="mt-1 font-semibold text-slate-800">{customerPhone}</div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 sm:gap-1.5 lg:gap-2">
        {telLink ? (
          <a
            href={telLink}
            className={compactSecondaryButtonClass}
          >
            Call
          </a>
        ) : null}

        {customerPhone !== "—" ? (
          <a
            href={`sms:${digitsOnly(customerPhone)}`}
            className={compactSecondaryButtonClass}
          >
            Text
          </a>
        ) : null}

        {serviceMapsLink ? (
          <a
            href={serviceMapsLink}
            target="_blank"
            rel="noreferrer"
            className={compactSecondaryButtonClass}
          >
            Open Map
          </a>
        ) : null}
      </div>

      <div className="mt-4 border-t border-slate-200/80 pt-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Contact Logging</div>
        <div className="flex flex-wrap gap-2">
          <form action={logCustomerContactAttemptFromForm}>
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="method" value="call" />
            <input type="hidden" name="result" value="no_answer" />
            <SubmitButton loadingText="Recording..." className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50">
              No Answer
            </SubmitButton>
          </form>

          <form action={logCustomerContactAttemptFromForm}>
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="method" value="text" />
            <input type="hidden" name="result" value="sent" />
            <SubmitButton loadingText="Recording..." className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50">
              Sent Text
            </SubmitButton>
          </form>
        </div>
        <div className="mt-2 text-[11px] text-slate-500">
          {attemptCount} attempt{attemptCount === 1 ? "" : "s"} • last: {lastAttemptLabel}
        </div>
      </div>

      <div className="mt-4 border-t border-slate-200/80 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Assigned Team</div>
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{assignedTeam.length > 0 ? `${assignedTeam.length} assigned` : "Awaiting assignment"}</div>
        </div>
        {assignedTeam.length > 0 ? (
          <div className="mt-3 flex min-w-0 flex-wrap gap-2">
            {assignedTeam.map((assignee) => (
              <div
                key={`${assignee.job_id}-${assignee.user_id}`}
                className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/72 px-3 py-2 text-sm text-slate-800 shadow-[0_8px_20px_-24px_rgba(15,23,42,0.22)]"
              >
                <span className="max-w-full break-words">{assignee.display_name}</span>
                {assignee.is_primary ? (
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    Primary
                  </span>
                ) : null}

                {isInternalUser && !assignee.is_primary ? (
                  <form action={setPrimaryJobAssigneeFromForm} className="shrink-0">
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="user_id" value={assignee.user_id} />
                    <input type="hidden" name="tab" value={tab} />
                    <SubmitButton
                      loadingText="Updating..."
                      className={workspaceUtilityControlClass}
                    >
                      Make Primary
                    </SubmitButton>
                  </form>
                ) : null}

                {isInternalUser ? (
                  <form action={removeJobAssigneeFromForm} className="shrink-0">
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="user_id" value={assignee.user_id} />
                    <input type="hidden" name="tab" value={tab} />
                    <SubmitButton
                      loadingText="Removing..."
                      className="rounded-md border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
                    >
                      Remove
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className={`mt-3 ${workspaceEmptyStateClass}`}>
            No team assigned yet.
          </div>
        )}

        {isInternalUser ? (
          <form action={assignJobAssigneeFromForm} className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="tab" value={tab} />
            <select
              name="user_id"
              className={`${workspaceInputClass} w-full min-w-0 sm:w-auto sm:min-w-[14rem]`}
              required
              defaultValue=""
              disabled={assignmentCandidates.length === 0}
            >
              <option value="" disabled>
                {assignmentCandidates.length === 0 ? "No available assignees" : "Select assignee"}
              </option>
              {assignmentCandidates.map((candidate) => (
                <option key={candidate.user_id} value={candidate.user_id}>
                  {candidate.display_name}
                </option>
              ))}
            </select>

            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <input type="checkbox" name="make_primary" value="1" className="h-3.5 w-3.5" />
              Set as primary
            </label>

            <SubmitButton
              loadingText="Assigning..."
              disabled={assignmentCandidates.length === 0}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              Assign
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </div>

    {/* Center: destination panel */}
    <div className="relative flex min-h-[20rem] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_18px_38px_-30px_rgba(15,23,42,0.28)]">
      <div className="absolute left-3 top-3 z-10">
        <div className="rounded-full border border-white/70 bg-white/76 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.3)] backdrop-blur-sm">
          Service Location
        </div>
      </div>
      <div className="w-full flex-1 overflow-hidden bg-slate-100">
        <JobLocationPreview
          addressLine1={serviceAddressLine1}
          addressLine2={serviceAddressLine2}
          city={serviceCity}
          state={serviceState}
          zip={serviceZip}
          showAddressFooter
          className="flex h-full flex-col [&>div:last-child]:!mt-auto [&>div:last-child]:pt-3"
        />
      </div>
    </div>

    {/* Right: ECC permit reference panel (ECC only) */}
    {job.job_type === "ecc" ? (
      <div className={`${workspaceSubtleCardClass} border-slate-200/70 p-4 sm:p-5 ${hasPermitDetails ? "bg-white/92" : "bg-slate-50/88"}`}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Permit</div>
            <div className="mt-1 text-sm text-slate-600">
              {hasPermitDetails
                ? `${permitDetailCount} of 3 reference field${permitDetailCount === 1 ? "" : "s"} available`
                : "Permit information pending"}
            </div>
          </div>
          <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            ECC
          </span>
        </div>

        {hasPermitDetails ? (
          <div className="space-y-2.5">
            <div className="rounded-lg border border-slate-200/80 bg-slate-50/72 px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Permit #</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{permitNumber || "Not added"}</div>
            </div>
            <div className="rounded-lg border border-slate-200/80 bg-slate-50/72 px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Jurisdiction</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{permitJurisdiction || "Not added"}</div>
            </div>
            <div className="rounded-lg border border-slate-200/80 bg-slate-50/72 px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Permit Date</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{permitDateLabel || "Not added"}</div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/90 px-4 py-4 text-sm text-slate-600">
            No permit details recorded yet.
          </div>
        )}
      </div>
    ) : null}
  </div>

  {isInternalUser && job.job_type === "service" ? (
    <div className="mt-3.5 rounded-xl border border-slate-200/80 bg-white/96 px-4 py-3 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.28)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Next Service Action</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">Track what happens next for this service case.</div>
        </div>
        {serviceCaseVisitCount > 1 ? (
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600">
            {serviceCaseVisitCount} visits linked
          </span>
        ) : null}
      </div>

      {canShowWaitingReleaseQuickAction ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-3">
          <div className="text-sm font-semibold text-amber-900">Ready to resume this service visit?</div>
          <p className="mt-1 text-xs leading-5 text-amber-900/90">
            Use this when the part, approval, access, or missing information is no longer blocking the job.
          </p>
          <form action={releaseAndReevaluateFromForm} className="mt-2">
            <input type="hidden" name="job_id" value={job.id} />
            <SubmitButton loadingText="Updating..." className={`${secondaryButtonClass} w-full sm:w-auto`}>
              Mark Ready to Continue
            </SubmitButton>
          </form>
        </div>
      ) : null}

      <form action={createNextServiceVisitFromForm} className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <input type="hidden" name="job_id" value={job.id} />
        <input type="hidden" name="tab" value={tab} />
        <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}`} />

        <div className="space-y-1">
          <label className={workspaceFieldLabelClass}>Reason for next visit</label>
          <input
            type="text"
            name="next_visit_reason"
            required
            maxLength={220}
            placeholder="Example: install ordered part, return to complete repair, customer approved follow-up work"
            className={workspaceInputClass}
          />
          <p className="text-xs leading-5 text-slate-600">
            Use this when this problem needs another trip, return visit, part install, callback, or follow-up repair.
          </p>
        </div>

        <SubmitButton loadingText="Creating..." className={darkButtonClass}>
          Create Next Visit
        </SubmitButton>
      </form>
    </div>
  ) : null}

</section>
      {/* Header */}

      {/* Always-visible Top Actions */}

      {/* Closeout Actions (Internal Only) */}
    {showCloseoutRow && (
      <div className="mt-3 min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 shadow-[0_12px_28px_-26px_rgba(15,23,42,0.35)]">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm font-medium text-gray-700">Closeout</div>

      <div className="flex flex-wrap items-center gap-2">
        {/* ECC only: Certs */}
          {canShowCertsButton && (
            <form action={markCertsCompleteFromForm}>
              <input type="hidden" name="job_id" value={job.id} />
              <SubmitButton
                loadingText="Saving..."
                className={darkButtonClass}
              >
                ✓ Certs Complete
              </SubmitButton>
            </form>
          )}

        {canShowInvoiceButton && (
          <form action={markInvoiceCompleteFromForm}>
            <input type="hidden" name="job_id" value={job.id} />
            <SubmitButton
              loadingText="Saving..."
              className={darkButtonClass}
            >
              ✓ Mark Invoice Sent
            </SubmitButton>
          </form>
        )}
      </div>
    </div>

    <div className="mt-2 text-xs leading-5 text-slate-600">
      Scope first: confirm the work for this visit, then complete closeout and billing.
    </div>

    {showInternalInvoicingPlaceholder && String(job.ops_status ?? "").toLowerCase() !== "closed" ? (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs leading-5 text-amber-900">
        Internal invoicing mode is enabled for this company. Lightweight invoice-complete controls are hidden so
        this job uses the job-linked internal invoice panel instead of the external billing actions.
      </div>
    ) : null}
  </div>
)}

      {/* ✅ Friendly guard-rail message (shows after redirect) */}
      {showEccNotice && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <div className="font-semibold">One step missing</div>
          <div className="mt-1">
            This is an <span className="font-semibold">ECC</span> job. Go to the{" "}
            <span className="font-semibold">Tests</span> tab and complete at least{" "}
            <span className="font-semibold">one ECC test run</span> before marking{" "}
            <span className="font-semibold">Field Work Complete</span>.
          </div>
        </div>
      )}

      {banner === "job_created" && (
        <FlashBanner
          type="success"
          message="Job created and ready for next steps."
        />
      )}

      {banner === "intake_existing_job_selected" && (
        <FlashBanner
          type="success"
          message="Existing active job opened from intake. No new job was created."
        />
      )}

      {banner === "contractor_intake_finalized" && (
        <FlashBanner
          type="success"
          message="Contractor intake finalized. Job created from submitted intake details."
        />
      )}

      {banner === "job_already_created" && (
        <FlashBanner
          type="warning"
          message="Job already created."
        />
      )}

      {banner === "schedule_saved" && (
        <FlashBanner
          type="success"
          message="Schedule updated."
        />
      )}

      {banner === "schedule_already_saved" && (
        <FlashBanner
          type="warning"
          message="Schedule was already up to date."
        />
      )}

      {banner === "status_updated" && (
        <FlashBanner
          type="success"
          message="Saved."
        />
      )}

      {banner === "on_the_way_reverted" && (
        <FlashBanner
          type="success"
          message="On the Way was reverted."
        />
      )}

      {banner === "on_the_way_revert_unavailable" && (
        <FlashBanner
          type="warning"
          message="Undo On the Way is no longer available for this job."
        />
      )}

      {banner === "status_already_updated" && (
        <FlashBanner
          type="warning"
          message="This was already processed."
        />
      )}

      {banner === "service_closeout_saved" && (
        <FlashBanner
          type="success"
          message="Saved."
        />
      )}

      {banner === "service_closeout_already_saved" && (
        <FlashBanner
          type="warning"
          message="This was already processed."
        />
      )}

      {banner === "service_closeout_locked" && (
        <FlashBanner
          type="warning"
          message="Could not save changes."
        />
      )}

      {banner === "internal_invoicing_billing_pending" && (
        <FlashBanner
          type="warning"
          message="Internal invoicing mode is enabled. Use the job-linked internal invoice panel instead of the external billing actions."
        />
      )}

      {banner === "internal_invoice_draft_created" && (
        <FlashBanner
          type="success"
          message="Internal invoice draft created."
        />
      )}

      {banner === "internal_invoice_draft_exists" && (
        <FlashBanner
          type="warning"
          message="A job-linked internal invoice draft already exists."
        />
      )}

      {banner === "internal_invoice_draft_saved" && (
        <FlashBanner
          type="success"
          message="Internal invoice draft saved."
        />
      )}

      {banner === "internal_invoice_required_fields" && (
        <FlashBanner
          type="warning"
          message="Invoice number, subtotal, and total must be valid before saving this draft."
        />
      )}

      {banner === "internal_invoice_number_taken" && (
        <FlashBanner
          type="warning"
          message="That invoice number is already in use for this company."
        />
      )}

      {banner === "internal_invoice_issue_blocked" && (
        <FlashBanner
          type="warning"
          message="Issue the internal invoice only after field work is complete and the job is completed."
        />
      )}

      {banner === "internal_invoice_issue_incomplete" && (
        <FlashBanner
          type="warning"
          message="Add a billing name and at least one invoice charge with a total greater than $0.00 before issuing this invoice."
        />
      )}

      {banner === "internal_invoice_issued" && (
        <FlashBanner
          type="success"
          message="Internal invoice issued and billing closeout satisfied."
        />
      )}

      {banner === "internal_invoice_email_sent" && (
        <FlashBanner
          type="success"
          message="Invoice email sent."
        />
      )}

      {banner === "internal_invoice_email_resent" && (
        <FlashBanner
          type="success"
          message="Invoice email sent again."
        />
      )}

      {banner === "internal_invoice_email_failed" && (
        <FlashBanner
          type="warning"
          message="Invoice email send failed. Review the delivery note and try again."
        />
      )}

      {banner === "internal_invoice_send_recipient_required" && (
        <FlashBanner
          type="warning"
          message="Add a recipient email before sending this invoice."
        />
      )}

      {banner === "internal_invoice_send_requires_issued" && (
        <FlashBanner
          type="warning"
          message="Issue the invoice before sending it. Resends are communication actions on the issued invoice record."
        />
      )}

      {banner === "internal_invoice_payment_recorded" && (
        <FlashBanner
          type="success"
          message="Payment recorded."
        />
      )}

      {banner === "internal_invoice_payment_requires_issued" && (
        <FlashBanner
          type="warning"
          message="Only issued internal invoices can receive recorded payments."
        />
      )}

      {banner === "internal_invoice_payment_invalid_amount" && (
        <FlashBanner
          type="warning"
          message="Payment amount must be greater than $0.00."
        />
      )}

      {banner === "internal_invoice_payment_method_required" && (
        <FlashBanner
          type="warning"
          message="Select a payment method before recording this payment."
        />
      )}

      {banner === "internal_invoice_payment_overpay_denied" && (
        <FlashBanner
          type="warning"
          message="Payment amount cannot exceed the current balance due."
        />
      )}

      {banner === "internal_invoice_already_issued" && (
        <FlashBanner
          type="warning"
          message="This internal invoice was already issued."
        />
      )}

      {banner === "internal_invoice_voided" && (
        <FlashBanner
          type="success"
          message="Internal invoice voided."
        />
      )}

      {banner === "internal_invoice_already_voided" && (
        <FlashBanner
          type="warning"
          message="This internal invoice is already void."
        />
      )}

      {banner === "internal_invoice_locked" && (
        <FlashBanner
          type="warning"
          message="Issued and void invoices are read-only."
        />
      )}

      {banner === "internal_invoice_missing" && (
        <FlashBanner
          type="warning"
          message="Create the job-linked internal invoice draft first."
        />
      )}

      {banner === "internal_invoice_line_item_added" && (
        <FlashBanner
          type="success"
          message="Invoice charge added."
        />
      )}

      {banner === "internal_invoice_line_item_saved" && (
        <FlashBanner
          type="success"
          message="Invoice charge saved."
        />
      )}

      {banner === "internal_invoice_line_item_removed" && (
        <FlashBanner
          type="success"
          message="Invoice charge removed."
        />
      )}

      {banner === "internal_invoice_line_item_invalid" && (
        <FlashBanner
          type="warning"
          message="Line item name, quantity, and unit price must all be valid."
        />
      )}

      {banner === "internal_invoice_line_item_missing" && (
        <FlashBanner
          type="warning"
          message="That invoice charge could not be found."
        />
      )}

      {banner === "internal_invoice_line_items_locked" && (
        <FlashBanner
          type="warning"
          message="Issued and void invoices keep frozen invoice charges and cannot be edited."
        />
      )}

      {banner === "internal_invoice_pricebook_line_item_added" && (
        <FlashBanner
          type="success"
          message="Pricebook service/charge added to the draft invoice."
        />
      )}

      {(banner === "internal_invoice_pricebook_item_missing" ||
        banner === "internal_invoice_pricebook_item_not_found") && (
        <FlashBanner
          type="warning"
          message="Select a valid Pricebook item from your active catalog."
        />
      )}

      {banner === "internal_invoice_pricebook_quantity_invalid" && (
        <FlashBanner
          type="warning"
          message="Pricebook quantity must be greater than zero."
        />
      )}

      {banner === "internal_invoice_pricebook_item_inactive" && (
        <FlashBanner
          type="warning"
          message="That Pricebook item is inactive and cannot be added to this draft invoice."
        />
      )}

      {banner === "internal_invoice_pricebook_negative_price_deferred" && (
        <FlashBanner
          type="warning"
          message="Credits/negative Pricebook items are deferred to a later adjustment policy pass and are not allowed in this add flow yet."
        />
      )}

      {banner === "internal_invoice_visit_scope_line_item_added" && (
        <FlashBanner
          type="success"
          message="Selected Work Items were added to the draft invoice as invoice charges."
        />
      )}

      {banner === "internal_invoice_visit_scope_line_item_partial_added" && (
        <FlashBanner
          type="warning"
          message="Some selected Work Items were already added. New selections were added to the draft invoice."
        />
      )}

      {banner === "internal_invoice_visit_scope_line_item_duplicate" && (
        <FlashBanner
          type="warning"
          message="Selected Work Items were already on this draft invoice."
        />
      )}

      {(banner === "internal_invoice_visit_scope_item_invalid" ||
        banner === "internal_invoice_visit_scope_item_missing" ||
        banner === "internal_invoice_visit_scope_item_not_found") && (
        <FlashBanner
          type="warning"
          message="Select valid Work Items from this job to add them to the draft invoice as invoice charges."
        />
      )}

      {banner === "internal_invoice_visit_scope_quantity_invalid" && (
        <FlashBanner
          type="warning"
          message="Work Item quantity must be greater than zero."
        />
      )}

      {banner === "service_contract_saved" && (
        <FlashBanner
          type="success"
          message="Service contract fields saved."
        />
      )}

      {banner === "service_contract_already_saved" && (
        <FlashBanner
          type="warning"
          message="Service contract fields were already up to date."
        />
      )}

      {banner === "service_contract_update_failed" && (
        <FlashBanner
          type="warning"
          message="Unable to update service contract fields."
        />
      )}

      {banner === "visit_scope_saved" && (
        <FlashBanner
          type="success"
          message="Work Items saved."
        />
      )}

      {banner === "visit_scope_already_saved" && (
        <FlashBanner
          type="warning"
          message="Work Items were already up to date."
        />
      )}

      {banner === "visit_scope_required" && (
        <FlashBanner
          type="warning"
          message="Service jobs require a Reason for Visit or at least one Work Item."
        />
      )}

      {banner === "visit_scope_payload_invalid" && (
        <FlashBanner
          type="warning"
          message="Work Items could not be read from the form submission."
        />
      )}

      {banner === "visit_scope_job_read_failed" && (
        <FlashBanner
          type="warning"
          message="Could not load the job before saving Work Items."
        />
      )}

      {banner === "visit_scope_job_update_failed" && (
        <FlashBanner
          type="warning"
          message="Work Items could not be saved to the job record."
        />
      )}

      {banner === "visit_scope_update_failed" && (
        <FlashBanner
          type="warning"
          message="Work Items could not be saved."
        />
      )}

      {banner === "note_added" && (
        <FlashBanner
          type="success"
          message="Note added."
        />
      )}

      {banner === "follow_up_note_added" && (
        <FlashBanner
          type="success"
          message="Follow-up note added."
        />
      )}

      {banner === "note_already_added" && (
        <FlashBanner
          type="warning"
          message="Note already added."
        />
      )}

      {banner === "follow_up_note_already_added" && (
        <FlashBanner
          type="warning"
          message="Note already added."
        />
      )}

      {banner === "note_add_failed" && (
        <FlashBanner
          type="error"
          message="Could not add note."
        />
      )}

      {banner === "ops_details_saved" && (
        <FlashBanner
          type="success"
          message="Saved."
        />
      )}

      {banner === "ops_details_already_saved" && (
        <FlashBanner
          type="warning"
          message="This was already processed."
        />
      )}

      {banner === "ops_status_saved" && (
        <FlashBanner
          type="success"
          message="Saved."
        />
      )}

      {banner === "ops_status_already_saved" && (
        <FlashBanner
          type="warning"
          message="This was already processed."
        />
      )}

      {banner === "pending_info_reason_required" && (
        <FlashBanner
          type="warning"
          message="Pending Info reason is required."
        />
      )}

      {banner === "on_hold_reason_required" && (
        <FlashBanner
          type="warning"
          message="On Hold reason is required."
        />
      )}

      {banner === "interrupt_state_required" && (
        <FlashBanner
          type="warning"
          message="Select an Interrupt State before saving."
        />
      )}

      {banner === "waiting_reason_required" && (
        <FlashBanner
          type="warning"
          message="Select a Waiting reason before saving."
        />
      )}

      {banner === "waiting_other_reason_required" && (
        <FlashBanner
          type="warning"
          message="Custom reason is required when Waiting reason is Other."
        />
      )}

      {banner === "contact_attempt_logged" && (
        <FlashBanner
          type="success"
          message="Saved."
        />
      )}

      {banner === "customer_reused" && (
        <FlashBanner
          type="warning"
          message="Existing customer matched by phone — reused (no duplicate created)."
        />
      )}

      {banner === "customer_created" && (
        <FlashBanner
          type="success"
          message="New customer created and linked to this job."
        />
      )}

      {banner === "assignment_added" && (
        <FlashBanner
          type="success"
          message="Team member assigned to this job."
        />
      )}

      {banner === "assignment_added_primary" && (
        <FlashBanner
          type="success"
          message="Team member assigned and set as primary."
        />
      )}

      {banner === "companion_scope_promoted" && (
        <FlashBanner
          type="success"
          message="Service follow-up created from the ECC companion scope item."
        />
      )}

      {banner === "companion_scope_already_promoted" && (
        <FlashBanner
          type="warning"
          message="That companion scope item already has a linked Service job."
        />
      )}

      {banner === "companion_scope_promotion_not_eligible" && (
        <FlashBanner
          type="warning"
          message="Only ECC companion-service scope items can be promoted from this workflow."
        />
      )}

      {banner === "companion_scope_promotion_failed" && (
        <FlashBanner
          type="warning"
          message="Unable to create the Service follow-up from that companion scope item. Please try again."
        />
      )}

      {banner === "assignment_primary_set" && (
        <FlashBanner
          type="success"
          message="Primary assignee updated."
        />
      )}

      {banner === "assignment_removed" && (
        <FlashBanner
          type="success"
          message="Assignee removed from this job."
        />
      )}

      {banner === "contractor_updated" && (
        <FlashBanner
          type="success"
          message="Contractor assignment updated."
        />
      )}

      {banner === "contractor_unchanged" && (
        <FlashBanner
          type="warning"
          message="Contractor assignment was unchanged."
        />
      )}

      {banner === "contractor_update_failed" && (
        <FlashBanner
          type="warning"
          message="Unable to update contractor assignment. Please try again or contact support if it continues."
        />
      )}

      {banner === "job_cancelled" && (
        <FlashBanner
          type="success"
          message="Job cancelled successfully. This job is no longer in active queues."
        />
      )}

      {sp?.schedule_required === "1" && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This job is missing a full schedule. If you continue, the system will auto-fill today with a
          2-hour window starting now.
        </div>
      )}  

      {job.status === "completed" && job.ops_status !== "closed" ? (() => {
      const ops = job.ops_status;

    const meta =
      ((job.job_type === "service" && billingState.billedTruthSatisfied) ||
        (job.job_type === "ecc" && billingState.billedTruthSatisfied && job.certs_complete))
        ? {
            title: "Admin Complete",
            body: "Field work, paperwork, and billing are complete for this job.",
          }
        : ops === "failed"
          ? {
              title: "Visit completed — failure still unresolved",
              body: "The field visit is complete, but this failed result still needs either correction review approval or a linked retest before certs can be completed.",
            }
          : ops === "retest_needed"
            ? {
                title: "Visit completed — retest required",
                body: "The original failed visit is complete. A physical retest is still required before certification can move forward.",
              }
          : isCloseoutPending
            ? {
                title: "Job completed — closeout still in progress",
                body: closeoutNeeds.needsInvoice && closeoutNeeds.needsCerts
                  ? "Field work is complete. Invoice and certs are still pending, so the job remains in closeout until both are finished."
                  : closeoutNeeds.needsCerts
                    ? "Field work is complete. Certs are still pending, so the job remains in closeout until closeout paperwork is finished."
                    : "Field work is complete. Invoice is still pending, so the job remains in closeout until billing is finished.",
              }
          : ops === "paperwork_required"
            ? {
                title: "Job completed — paperwork still required",
                body: "Upload/attach required documents (invoice/cert) to fully close out the job.",
              }
          : actionablePendingInfo
            ? {
                title: "Job completed — pending information",
                body: pendingInfoReasonText
                  ? `Blocker: ${pendingInfoReasonText}`
                  : "Some required info is still missing before closeout can finish.",
              }
            : ops === "on_hold"
              ? {
                  title: "Job completed — on hold",
                  body: onHoldReasonText
                    ? `Hold reason: ${onHoldReasonText}`
                    : "This job is on hold and is not in the closeout work queue until the hold is cleared.",
                }
          : ops === "need_to_schedule"
            ? {
                title: "Job completed — but still in Need to Schedule",
                body: "This job is marked completed, but ops status indicates scheduling is still needed. Review status flow.",
              }
          : job.job_type === "ecc"
            ? {
                title: "Job completed — but compliance is not fully resolved",
                body: "Complete remaining ECC items (tests, paperwork, invoice/cert) to fully close out the job.",
              }
            : null;

      if (!meta) return null;
                    
      return (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50/90 p-3.5 text-amber-900">
          <div className="text-sm font-semibold">{meta.title}</div>
          <div className="mt-1 text-sm">
            Current status: <span className="font-medium">{formatOpsStatusLabel(ops)}</span>. {meta.body}
          </div>
        </div>
      );
    })() : null}

      {/* Single-workspace context (tab query preserved for compatibility) */}
     
          <details className={`${workspaceDetailsClass} mb-6`}>
            <summary className="cursor-pointer list-none">
              <CollapsibleHeader
                title="Edit Job"
                subtitle="All editable controls for this job."
              />
            </summary>

            <div className={workspaceDetailsDividerClass}>
              <div className={`${workspaceInsetClass} p-4`}>
                <div className="mb-3 text-sm font-semibold text-slate-900">Scheduling</div>

                <form action={updateJobScheduleFromForm} className="space-y-4">
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="permit_number" value={job.permit_number ?? ""} />
                  <input type="hidden" name="jurisdiction" value={(job as any).jurisdiction ?? ""} />
                  <input type="hidden" name="permit_date" value={(job as any).permit_date ?? ""} />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-1">
                      <label className={workspaceFieldLabelClass}>
                        Scheduled Date
                      </label>
                      <input
                        type="date"
                        name="scheduled_date"
                        defaultValue={displayDateLA(job.scheduled_date)}
                        className={workspaceInputClass}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className={workspaceFieldLabelClass}>
                        Window Start
                      </label>
                      <input
                        type="time"
                        name="window_start"
                        defaultValue={timeToTimeInput(job.window_start)}
                        className={workspaceInputClass}
                      />
                      <div className="text-[11px] text-gray-500">08:00</div>
                    </div>

                    <div className="space-y-1">
                      <label className={workspaceFieldLabelClass}>
                        Window End
                      </label>
                      <input
                        type="time"
                        name="window_end"
                        defaultValue={timeToTimeInput(job.window_end)}
                        className={workspaceInputClass}
                      />
                      <div className="text-[11px] text-gray-500">10:00</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <SubmitButton
                      loadingText="Saving..."
                      className={primaryButtonClass}
                    >
                      Save Scheduling
                    </SubmitButton>

                    {(job.scheduled_date || job.window_start || job.window_end) ? (
                      <UnscheduleButton />
                    ) : null}

                    <Link
                      href="/ops"
                      className={secondaryButtonClass}
                    >
                      Back to Ops
                    </Link>
                  </div>
                </form>
              </div>

              {job.job_type === "ecc" ? (
                <details
                  open
                  className="group mt-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_28px_-26px_rgba(15,23,42,0.35)] [&[open]_.disclosure-icon]:rotate-90"
                >
                    <summary className="cursor-pointer list-none">
                      <CollapsibleHeader
                        title="Permit & Compliance"
                        subtitle="ECC permit fields and jurisdiction details."
                      />
                    </summary>
                    <form action={updateJobScheduleFromForm} className="mt-3 space-y-3">
                      <input type="hidden" name="job_id" value={job.id} />
                      <input type="hidden" name="scheduled_date" value={displayDateLA(job.scheduled_date) ?? ""} />
                      <input type="hidden" name="window_start" value={timeToTimeInput(job.window_start) ?? ""} />
                      <input type="hidden" name="window_end" value={timeToTimeInput(job.window_end) ?? ""} />

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className={workspaceFieldLabelClass}>Permit #</label>
                          <input
                            name="permit_number"
                            defaultValue={job.permit_number ?? ""}
                            placeholder="Optional"
                            className={workspaceInputClass}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className={workspaceFieldLabelClass}>Jurisdiction</label>
                          <input
                            name="jurisdiction"
                            defaultValue={(job as any).jurisdiction ?? ""}
                            placeholder="City or county permit office"
                            className={workspaceInputClass}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className={workspaceFieldLabelClass}>Permit Date</label>
                          <input
                            type="date"
                            name="permit_date"
                            defaultValue={(job as any).permit_date ?? ""}
                            className={workspaceInputClass}
                          />
                        </div>
                      </div>

                      <SubmitButton
                        loadingText="Saving..."
                        className={primaryButtonClass}
                      >
                        Save Permit Info
                      </SubmitButton>
                    </form>
                </details>
              ) : null}

              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <details className="group w-full rounded-xl border border-slate-200/80 bg-white p-4 text-sm shadow-[0_10px_28px_-26px_rgba(15,23,42,0.35)] [&[open]_.disclosure-icon]:rotate-90">
                  <summary className="cursor-pointer list-none">
                    <CollapsibleHeader
                      title="Change Job Type"
                      subtitle="Switch between service and ECC workflows."
                    />
                  </summary>

                  <form
                    action={updateJobTypeFromForm}
                    className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center"
                  >
                    <input type="hidden" name="job_id" value={job.id} />
                    <p className="text-xs text-slate-600">
                      Current type: {job.job_type ?? "service"}
                    </p>

                    <select
                      name="job_type"
                      defaultValue={job.job_type ?? "service"}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      <option value="service">Service</option>
                      <option value="ecc">ECC</option>
                    </select>

                    <SubmitButton
                      loadingText="Updating..."
                      className={primaryButtonClass}
                    >
                      Update
                    </SubmitButton>
                  </form>
                </details>

                <details className="group w-full rounded-xl border border-slate-200/80 bg-white p-4 text-sm shadow-[0_10px_28px_-26px_rgba(15,23,42,0.35)] [&[open]_.disclosure-icon]:rotate-90">
                  <summary className="cursor-pointer list-none">
                    <CollapsibleHeader
                      title="Change Contractor"
                      subtitle="Reassign job ownership to a different contractor."
                    />
                  </summary>

                  <div className="mt-3">
                    <form action={updateJobContractorFromForm} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <input type="hidden" name="job_id" value={job.id} />
                      <input type="hidden" name="tab" value="info" />
                      <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=info`} />

                      <div className="flex-1">
                        <label className={workspaceFieldLabelClass}>
                          Assigned contractor
                        </label>
                        <select
                          name="contractor_id"
                          defaultValue={job.contractor_id ?? ""}
                          className={workspaceInputClass}
                        >
                          <option value="">— No contractor ({internalBusinessDisplayName}) —</option>
                          {(contractors ?? []).map((contractor: any) => (
                            <option key={contractor.id} value={contractor.id}>
                              {contractor.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <SubmitButton
                        loadingText="Saving..."
                        className={secondaryButtonClass}
                      >
                        Save contractor
                      </SubmitButton>
                    </form>
                  </div>
                </details>

                {job.job_type === "service" ? (
                  <details className="group w-full rounded-xl border border-slate-200/80 bg-white p-4 text-sm shadow-[0_10px_28px_-26px_rgba(15,23,42,0.35)] [&[open]_.disclosure-icon]:rotate-90">
                    <summary className="cursor-pointer list-none">
                      <CollapsibleHeader
                        title="Service Details"
                        subtitle="Edit service type and visit classification fields."
                      />
                    </summary>

                    <form action={updateJobServiceContractFromForm} className="mt-3 space-y-3">
                      <input type="hidden" name="job_id" value={job.id} />
                      <input type="hidden" name="tab" value="info" />
                      <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=info`} />

                      <div className="rounded-lg border border-blue-200/80 bg-blue-50/70 px-3 py-2 text-xs leading-5 text-blue-900">
                        Service details classify the visit. Work Items tell the team what work belongs to this trip.
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className={workspaceFieldLabelClass}>Service Type</label>
                          <select
                            name="service_case_kind"
                            defaultValue={String((serviceCase as any)?.case_kind ?? "reactive")}
                            className={workspaceInputClass}
                          >
                            <option value="reactive">Standard Service</option>
                            <option value="callback">Callback</option>
                            <option value="warranty">Warranty</option>
                            <option value="maintenance">Maintenance</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className={workspaceFieldLabelClass}>Visit Type</label>
                          <select
                            name="service_visit_type"
                            defaultValue={String(job.service_visit_type ?? "diagnostic")}
                            className={workspaceInputClass}
                          >
                            <option value="diagnostic">Diagnostic</option>
                            <option value="repair">Repair</option>
                            <option value="return_visit">Return Visit</option>
                            <option value="callback">Callback</option>
                            <option value="maintenance">Maintenance</option>
                          </select>
                          <p className="text-[11px] leading-5 text-slate-500">
                            Category of visit, such as diagnostic, repair, return visit, callback, or maintenance.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className={workspaceFieldLabelClass}>Reason for Visit</label>
                        <textarea
                          name="service_visit_reason"
                          defaultValue={String(job.service_visit_reason ?? "")}
                          rows={3}
                          maxLength={500}
                          className={workspaceInputClass}
                          required
                        />
                        <p className="text-[11px] leading-5 text-slate-500">
                          Reason for Visit explains why this visit exists and gives dispatch context.
                        </p>
                      </div>

                      <div className="space-y-1">
                        <label className={workspaceFieldLabelClass}>Visit Outcome</label>
                        <select
                          name="service_visit_outcome"
                          defaultValue={String(job.service_visit_outcome ?? "follow_up_required")}
                          className={workspaceInputClass}
                        >
                          <option value="follow_up_required">Follow-up Required</option>
                          <option value="resolved">Resolved</option>
                          <option value="no_issue_found">No Issue Found</option>
                        </select>
                        <p className="text-[11px] leading-5 text-slate-500">
                          Current expected outcome or closeout direction.
                        </p>
                      </div>

                      <SubmitButton
                        loadingText="Saving..."
                        className={secondaryButtonClass}
                      >
                        Save service contract
                      </SubmitButton>
                    </form>
                  </details>
                ) : null}
              </div>

              {isInternalAdmin ? (
              <details className="group mt-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_28px_-26px_rgba(15,23,42,0.35)] [&[open]_.disclosure-icon]:rotate-90">
                <summary className="cursor-pointer list-none">
                  <CollapsibleHeader
                    title="Admin Archive Controls"
                    subtitle="Archive or cancel this job with admin-only actions."
                  />
                </summary>

                <div className="mt-3 space-y-3">
                  <div className="text-sm leading-6 text-slate-600">
                    Archive hides this job across Ops, portal, and searches. This can be undone later (by clearing deleted_at).
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <form action={archiveJobFromForm}>
                      <input type="hidden" name="job_id" value={job.id} />
                      <SubmitButton
                        loadingText="Archiving..."
                        className="inline-flex min-h-10 items-center justify-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700"
                      >
                        Archive Job
                      </SubmitButton>
                    </form>

                    {!['completed', 'failed', 'cancelled'].includes(job.status) && (
                      <CancelJobButton jobId={job.id} />
                    )}
                  </div>
                </div>
              </details>
              ) : null}
            </div>
          </details>


      {/* Info workspace */}

    
{showExternalDataEntryPrompt ? (
  <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-amber-950 shadow-[0_12px_24px_-22px_rgba(180,83,9,0.35)]">
    <div className="mb-2 font-semibold">
      Invoice sent tracking
    </div>

    <div className="mb-3 text-sm leading-6 text-amber-900">
      Record external invoice details for closeout tracking. This does not create an internal billed-truth invoice record.
    </div>

    <form action={completeDataEntryFromForm} className="flex flex-wrap gap-2 items-end">
      <input type="hidden" name="job_id" value={job.id} />

      <div className="flex flex-col">
        <label className="mb-1 text-sm font-medium text-amber-900">External Invoice # (optional)</label>
        <input
          name="invoice_number"
          defaultValue={String(job.invoice_number ?? "")}
          className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900"
        />
      </div>

      <SubmitButton
        loadingText="Saving..."
        className={darkButtonClass}
      >
        Mark Invoice Sent
      </SubmitButton>
    </form>
  </div>
) : null}

{isInternalUser ? (
  <div id="visit-scope-section" className="mt-6 rounded-2xl border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.95))] p-4 shadow-[0_18px_36px_-30px_rgba(15,23,42,0.24)]">
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Work Items (Visit Scope)</div>
        {job.job_type === "service" ? (
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600">
            {visitScopeCount > 0 ? "Work items set" : "No work items yet"}
          </span>
        ) : null}
      </div>

      <div className="text-xs leading-5 text-slate-600">
        Work Items define what belongs to this visit. They can help build an invoice later, but they are not billing records.
      </div>

      <details className="group">
          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
          {hasVisitScopeDefined ? "Edit Work Items" : "Add Work Items"}
          </summary>

          <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
            <VisitScopeJobDetailForm
              jobId={job.id}
              jobType={job.job_type === "service" ? "service" : "ecc"}
              tab={tab}
              initialSummary={visitScopeSummary}
              initialItems={visitScopeItems}
              primaryButtonClass={primaryButtonClass}
            />
          </div>
      </details>

      <div className="rounded-xl border border-slate-200/70 bg-white/92 px-4 py-3.5 shadow-[0_10px_20px_-30px_rgba(15,23,42,0.18)]">
      <div className="space-y-3.5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Reason for Visit / Dispatch Notes</div>
          <div className="mt-1 text-sm leading-6 text-slate-900">
            {visitScopeLeadText || "No visit brief saved yet."}
          </div>
        </div>

        {primaryVisitScopeItems.length > 0 ? (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Work Items for this visit</div>
            <div className="mt-2 space-y-2.5">
              {primaryVisitScopeItems.map((item, index) => (
                <div key={`primary-${index}-${item.title}`} className="space-y-1 border-l-2 border-slate-200 pl-3">
                  <div className="text-sm font-semibold leading-5 text-slate-900">{item.title}</div>
                  {item.details ? (
                    <div className="text-sm leading-6 text-slate-600">{item.details}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : hasVisitScopeDefined ? (
          <div className="text-sm text-slate-600">No primary trip items are listed yet.</div>
        ) : null}

        {companionVisitScopeItems.length > 0 ? (
          <div className="border-t border-slate-200 pt-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Companion follow-up</div>
            <div className="mt-2 space-y-2.5">
              {companionVisitScopeItems.map((item, companionIndex) => {
                const itemIndex = visitScopeItems.findIndex((candidate) => candidate === item);

                return (
                  <div key={`companion-${companionIndex}-${item.title}`} className="space-y-1 border-l-2 border-slate-200 pl-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold leading-5 text-slate-900">{item.title}</div>
                      <div className="text-xs text-slate-500">{formatVisitScopeItemKindLabel(item.kind)}</div>
                      {isVisitScopeItemPromoted(item) ? (
                        <div className="text-xs font-medium text-emerald-700">Promoted</div>
                      ) : null}
                    </div>
                    {item.details ? (
                      <div className="text-sm leading-6 text-slate-600">{item.details}</div>
                    ) : null}
                    {job.job_type === "ecc" ? (
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                        {isVisitScopeItemPromoted(item) && item.promoted_service_job_id ? (
                          <>
                            <span>This companion scope now runs as its own Service job.</span>
                            <Link
                              href={`/jobs/${String(item.promoted_service_job_id)}?tab=info`}
                              className={secondaryButtonClass}
                            >
                              Open Service Job
                            </Link>
                          </>
                        ) : (
                          <>
                            <span>Promote when this companion work needs its own Service lifecycle.</span>
                            <form action={promoteCompanionScopeToServiceJobFromForm}>
                              <input type="hidden" name="job_id" value={job.id} />
                              <input type="hidden" name="item_index" value={String(itemIndex)} />
                              <input type="hidden" name="tab" value={tab} />
                              <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}`} />
                              <SubmitButton
                                loadingText="Creating..."
                                className={secondaryButtonClass}
                              >
                                Create Service Follow-Up
                              </SubmitButton>
                            </form>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
      </div>

    </div>
  </div>
) : null}

{showInternalInvoicePanel ? (
  <div id="internal-invoice-panel" className={`mt-6 scroll-mt-24 rounded-2xl p-5 ${hasVisitScopeDefined ? "border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-[0_20px_40px_-30px_rgba(15,23,42,0.28)]" : "border border-slate-200/70 bg-slate-50/75 shadow-[0_12px_24px_-28px_rgba(15,23,42,0.18)]"}`}>
    <div className={`rounded-xl p-4 ${hasVisitScopeDefined ? "border border-slate-200/80 bg-white/92 shadow-[0_10px_24px_-28px_rgba(15,23,42,0.22)]" : "border border-slate-200/70 bg-white/70"}`}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Invoice</div>
          <div className="mt-1 text-sm font-semibold text-slate-950">
            {internalInvoice ? internalInvoice.invoice_number : "Not started"}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Invoice Date</div>
          <div className="mt-1 text-sm font-semibold text-slate-950">
            {internalInvoice ? displayDateLA(internalInvoice.invoice_date) : "Will auto-fill on draft"}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Status</div>
          <div className="mt-1">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] ${internalInvoiceStatusChipClass}`}>
              {internalInvoice ? formatInternalInvoiceStatus(internalInvoice.status) : billingState.statusLabel}
            </span>
          </div>
        </div>

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Invoice Charges</div>
          <div className="mt-1 text-sm font-semibold text-slate-950">
            {internalInvoiceLineItemCount} item{internalInvoiceLineItemCount === 1 ? "" : "s"}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Derived Total</div>
          <div className="mt-1 text-sm font-semibold text-slate-950">
            {formatCurrencyFromCents(internalInvoice?.total_cents ?? 0)}
          </div>
        </div>
      </div>
    </div>

    {!internalInvoice ? (
      <div className={`mt-4 rounded-xl border border-dashed px-4 py-4 ${hasVisitScopeDefined ? "border-slate-300 bg-slate-50/80" : "border-slate-200 bg-white/65"}`}>
        {showReplacementInvoicePrompt ? (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50/80 px-3.5 py-3 text-sm leading-6 text-rose-800">
            <div className="font-semibold text-rose-900">Create Replacement Invoice</div>
            <div className="mt-1">
              The voided invoice remains in history. A replacement draft creates a new active invoice for this job.
            </div>
          </div>
        ) : null}

        <div className="text-sm leading-6 text-slate-700">
          {showReplacementInvoicePrompt
            ? "A previous invoice was voided. Start a replacement draft when the corrected billed scope is ready."
            : hasVisitScopeDefined
            ? "Create a draft invoice when the billed scope is ready."
            : "Work Items come first. Start an invoice later when billing is ready."}
        </div>
        <form action={createInternalInvoiceDraftFromForm} className="mt-3">
          <input type="hidden" name="job_id" value={job.id} />
          <input type="hidden" name="tab" value={tab} />
          <SubmitButton loadingText="Creating..." className={hasVisitScopeDefined ? primaryButtonClass : secondaryButtonClass}>
            {showReplacementInvoicePrompt ? "Create Replacement Invoice" : "Create Draft Invoice"}
          </SubmitButton>
        </form>
      </div>
    ) : (
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.28fr)_minmax(18rem,0.72fr)]">
        <div className="rounded-xl border border-slate-200/80 bg-white/96 p-4 shadow-[0_12px_24px_-28px_rgba(15,23,42,0.24)]">
          {internalInvoice.status === "draft" ? (
            <div className="space-y-5">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Invoice Charges</div>
                    <div className="mt-1 text-sm leading-6 text-slate-600">Build Invoice Charges here once billing is ready. These remain downstream commercial records rather than the visit-definition layer.</div>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {internalInvoiceLineItemCount} item{internalInvoiceLineItemCount === 1 ? "" : "s"}
                  </div>
                </div>

                {visitScopeInvoicePickerItems.length === 0 ? (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-xs text-slate-600">
                    No Work Items are available to add to this draft invoice.
                  </div>
                ) : null}

                <InternalInvoiceLineItemsTable
                  jobId={job.id}
                  tab={tab}
                  lineItems={internalInvoice.line_items}
                  totalCents={internalInvoice.total_cents}
                  addLineItemAction={addInternalInvoiceLineItemFromForm}
                  addPricebookLineItemAction={addInternalInvoiceLineItemFromPricebookForm}
                  addVisitScopeLineItemsAction={addInternalInvoiceLineItemsFromVisitScopeForm}
                  updateLineItemAction={updateInternalInvoiceLineItemFromForm}
                  removeLineItemAction={removeInternalInvoiceLineItemFromForm}
                  pricebookPickerItems={pricebookPickerItems}
                  visitScopePickerItems={visitScopeInvoicePickerItems}
                  workspaceFieldLabelClass={workspaceFieldLabelClass}
                  workspaceInputClass={workspaceInputClass}
                  primaryButtonClass={primaryButtonClass}
                  secondaryButtonClass={secondaryButtonClass}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Frozen Scope</div>
                <div className="mt-1 text-sm leading-6 text-slate-600">Issued and void invoices keep the final invoice charges as the billed record.</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className={workspaceSoftCardClass}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Invoice Number</div>
                  <div className="mt-1 text-sm font-semibold text-slate-950">{internalInvoice.invoice_number}</div>
                </div>
                <div className={workspaceSoftCardClass}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Invoice Date</div>
                  <div className="mt-1 text-sm font-semibold text-slate-950">{displayDateLA(internalInvoice.invoice_date)}</div>
                </div>
                <div className={workspaceSoftCardClass}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Subtotal</div>
                  <div className="mt-1 text-sm font-semibold text-slate-950">{formatCurrencyFromCents(internalInvoice.subtotal_cents)}</div>
                </div>
                <div className={workspaceSoftCardClass}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Total</div>
                  <div className="mt-1 text-sm font-semibold text-slate-950">{formatCurrencyFromCents(internalInvoice.total_cents)}</div>
                </div>
              </div>

              {internalInvoice.notes ? (
                <div className={workspaceSoftCardClass}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Notes</div>
                  <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{internalInvoice.notes}</div>
                </div>
              ) : null}

              <div className={workspaceSoftCardClass}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Frozen Invoice Charges</div>
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/75">
                  <div className="hidden grid-cols-[minmax(0,2.35fr)_minmax(8.5rem,0.9fr)_minmax(6.25rem,0.74fr)_minmax(7.25rem,0.84fr)_minmax(8rem,0.9fr)] gap-4 border-b border-slate-200/80 bg-white/85 px-5 py-3 md:grid">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Invoice Charge</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Type</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Qty</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Unit Price</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Subtotal</div>
                  </div>

                  {internalInvoiceLineItemCount > 0 ? (
                    <div className="divide-y divide-slate-200/80">
                      {internalInvoice.line_items.map((lineItem, index) => (
                        <div key={lineItem.id} className="bg-white/72 px-5 py-5">
                          <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                            Line {index + 1}
                          </div>

                          <div className="grid gap-4 md:grid-cols-[minmax(0,2.35fr)_minmax(8.5rem,0.9fr)_minmax(6.25rem,0.74fr)_minmax(7.25rem,0.84fr)_minmax(8rem,0.9fr)] md:items-start">
                            <div>
                              <div className={workspaceFieldLabelClass}>Item Name</div>
                              <div className="mt-1 text-sm font-semibold text-slate-950">{lineItem.item_name_snapshot}</div>
                            </div>

                            <div>
                              <div className={workspaceFieldLabelClass}>Type</div>
                              <div className="mt-1 text-sm text-slate-700">{formatInternalInvoiceItemType(lineItem.item_type_snapshot)}</div>
                            </div>

                            <div>
                              <div className={workspaceFieldLabelClass}>Quantity</div>
                              <div className="mt-1 text-sm text-slate-700">{formatDecimalInput(lineItem.quantity)}</div>
                            </div>

                            <div>
                              <div className={workspaceFieldLabelClass}>Unit Price</div>
                              <div className="mt-1 text-sm text-slate-700">{formatCurrencyFromAmount(lineItem.unit_price)}</div>
                            </div>

                            <div>
                              <div className={workspaceFieldLabelClass}>Subtotal</div>
                              <div className="mt-1 text-sm font-semibold text-slate-950">{formatCurrencyFromAmount(lineItem.line_subtotal)}</div>
                            </div>

                            <div className="md:col-span-5">
                              <div className={workspaceFieldLabelClass}>Description / Work Instruction</div>
                              <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                                {lineItem.description_snapshot ? lineItem.description_snapshot : "No additional work instruction recorded."}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-4 text-sm text-slate-600">No frozen invoice charges were recorded on this invoice.</div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 bg-white/88 px-5 py-3.5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Final Total</div>
                    <div className="text-sm font-semibold text-slate-950">{formatCurrencyFromCents(internalInvoice.total_cents)}</div>
                  </div>
                </div>
              </div>

              {internalInvoice.status === "void" && internalInvoice.void_reason ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm leading-6 text-rose-800">
                  <span className="font-semibold">Void reason:</span> {internalInvoice.void_reason}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/78 p-4 shadow-[0_10px_24px_-28px_rgba(15,23,42,0.24)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Billing Recipient</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{internalInvoiceRecipientName}</div>
            {internalInvoiceRecipientContact.length > 0 ? (
              <div className="mt-1 text-sm text-slate-600">{internalInvoiceRecipientContact.join(" • ")}</div>
            ) : null}
            {internalInvoiceBillingAddress.length > 0 ? (
              <div className="mt-2 text-sm leading-6 text-slate-600">{internalInvoiceBillingAddress.join(", ")}</div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white/96 p-4 shadow-[0_10px_24px_-28px_rgba(15,23,42,0.24)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Actions</div>
            <div className="mt-2 rounded-lg border border-blue-200/80 bg-blue-50/70 px-3.5 py-3 text-sm leading-6 text-blue-900">
              This invoice records billed work for this job. Payment entries are tracking-only and do not charge a card.
            </div>
            {internalInvoice.status === "draft" ? (
              <>
                  <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Issue Invoice</div>
                  <div className="mt-1 text-sm leading-6 text-slate-600">Review recipient, Invoice Charges, and total. Issue only when this billed invoice record is final. Sending happens after issue and is communication only.</div>
                  <div className="mt-1 text-sm leading-6 text-slate-600">Invoice Charges are billed records and should be reviewed before issue.</div>

                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm text-slate-700">
                  <div><span className="font-semibold text-slate-900">Review recipient:</span> {internalInvoiceRecipientName}</div>
                  <div className="mt-1"><span className="font-semibold text-slate-900">Review email:</span> {String(internalInvoice.billing_email ?? "").trim() || "Not set"}</div>
                  <div className="mt-1"><span className="font-semibold text-slate-900">Review total:</span> {formatCurrencyFromCents(internalInvoice.total_cents)}</div>
                  <div className="mt-1"><span className="font-semibold text-slate-900">Review charges:</span> {internalInvoiceLineItemCount} item{internalInvoiceLineItemCount === 1 ? "" : "s"}</div>
                </div>

                <form action={issueInternalInvoiceFromForm} className="mt-3">
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="tab" value={tab} />
                  <SubmitButton
                    loadingText="Issuing..."
                    className={darkButtonClass}
                    disabled={!internalInvoiceReadyToIssue}
                  >
                    Issue Invoice
                  </SubmitButton>
                </form>

                {!internalInvoiceReadyToIssue ? (
                  <div className="mt-2 text-xs leading-5 text-slate-500">
                    Cannot issue yet. Complete all of the following: job marked completed, field complete, billing name filled in, and at least one saved invoice charge with total above $0.00.
                  </div>
                ) : null}
              </>
            ) : internalInvoice.status === "issued" ? (
              <>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Issue Invoice</div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/75 px-3.5 py-3 text-sm leading-6 text-emerald-900">
                  {issuedInvoiceStatusMessage}
                </div>

                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm text-slate-700">
                  <div className="font-semibold text-slate-900">Payment Tracking</div>
                  <div className="mt-1 leading-6">
                    Off-platform payment recording only. This tracks collected payment history and does not charge a card or change billed invoice charges.
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-lg border border-slate-200/80 bg-white/90 px-3 py-2.5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Payment Status</div>
                      <div className="mt-1">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${internalInvoicePaymentStatusChipClass}`}>
                          {internalInvoicePaymentStatusLabel}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200/80 bg-white/90 px-3 py-2.5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Amount Paid</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {formatCurrencyFromCents(internalInvoicePaymentSummary.amountPaidCents)}
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200/80 bg-white/90 px-3 py-2.5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Balance Due</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {formatCurrencyFromCents(internalInvoicePaymentSummary.balanceDueCents)}
                      </div>
                    </div>
                  </div>

                  <form action={recordInternalInvoicePaymentFromForm} className="mt-3 space-y-3">
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="tab" value={tab} />

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className={workspaceFieldLabelClass}>Amount</label>
                        <input
                          name="payment_amount"
                          inputMode="decimal"
                          placeholder="0.00"
                          className={workspaceInputClass}
                          required
                        />
                      </div>

                      <div>
                        <label className={workspaceFieldLabelClass}>Payment Method</label>
                        <select name="payment_method" className={workspaceInputClass} defaultValue="" required>
                          <option value="" disabled>
                            Select method
                          </option>
                          <option value="cash">Cash</option>
                          <option value="check">Check</option>
                          <option value="ach_off_platform">ACH (Off-Platform)</option>
                          <option value="card_off_platform">Card (Off-Platform)</option>
                          <option value="bank_transfer">Bank Transfer</option>
                          <option value="other">Other</option>
                        </select>
                      </div>

                      <div>
                        <label className={workspaceFieldLabelClass}>Reference</label>
                        <input
                          name="received_reference"
                          placeholder="Check # or confirmation"
                          className={workspaceInputClass}
                        />
                      </div>

                      <div>
                        <label className={workspaceFieldLabelClass}>Payment recorded note</label>
                        <input
                          name="notes"
                          placeholder="Optional note"
                          className={workspaceInputClass}
                        />
                      </div>
                    </div>

                    <SubmitButton
                      loadingText="Recording..."
                      className={darkButtonClass}
                      disabled={internalInvoicePaymentSummary.balanceDueCents <= 0}
                    >
                      Record Payment
                    </SubmitButton>
                  </form>

                  {internalInvoicePaymentRows.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {internalInvoicePaymentRows.slice(0, 6).map((payment) => (
                        <div key={payment.id} className="rounded-lg border border-slate-200/80 bg-white/90 px-3 py-2.5 text-sm text-slate-700">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-semibold text-slate-900">Payment recorded</div>
                            <div className="text-xs text-slate-500">{formatDateTimeLAFromIso(payment.paid_at)}</div>
                          </div>
                          <div className="mt-1">
                            {formatCurrencyFromCents(payment.amount_cents)} • {String(payment.payment_method).replace(/_/g, " ")}
                          </div>
                          {payment.received_reference ? (
                            <div className="mt-1 text-xs text-slate-500">Reference: {payment.received_reference}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm text-slate-700">
                  <div className="font-semibold text-slate-900">Send / Resend</div>
                  <div className="mt-1 leading-6">Send the already-issued invoice to the billing recipient. Resending is communication only and does not create a second invoice or alter billed truth.</div>

                  <form action={sendInternalInvoiceEmailFromForm} className="mt-3 space-y-3">
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="tab" value={tab} />

                    <div>
                      <label className={workspaceFieldLabelClass}>Send To</label>
                      <input
                        type="email"
                        name="recipient_email"
                        defaultValue={internalInvoiceSendTargetDefault}
                        placeholder="billing@example.com"
                        className={workspaceInputClass}
                      />
                    </div>

                    <SubmitButton
                      loadingText="Sending..."
                      className={darkButtonClass}
                    >
                      {internalInvoiceEmailButtonLabel}
                    </SubmitButton>
                  </form>

                  {internalInvoiceSendTargetMissing ? (
                    <div className="mt-2 text-xs leading-5 text-amber-700">
                      Add a billing email first. Sending is available only after issue and with a recipient email.
                    </div>
                  ) : lastInternalInvoiceSentLabel ? (
                    <div className="mt-2 text-xs leading-5 text-slate-500">
                      Last sent {lastInternalInvoiceSentLabel} to {latestSuccessfulInternalInvoiceEmailDelivery?.recipientEmail ?? internalInvoiceSendTargetDefault}.
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-rose-200 bg-rose-50/75 px-3.5 py-3 text-sm leading-6 text-rose-800">
                This invoice is void and no longer satisfies billing closeout.
              </div>
            )}

            {internalInvoice.status !== "void" ? (
              <form action={voidInternalInvoiceFromForm} className="mt-4 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Void Invoice</div>
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="tab" value={tab} />
                <div>
                  <label className={workspaceFieldLabelClass}>Void Reason</label>
                  <textarea name="void_reason" className={`${workspaceInputClass} min-h-[5rem]`} />
                </div>
                <SubmitButton
                  loadingText="Voiding..."
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 active:translate-y-[0.5px]"
                >
                  Void Invoice
                </SubmitButton>
              </form>
            ) : null}
          </div>

          {internalInvoiceEmailDeliveries.length > 0 ? (
            <div className="rounded-xl border border-slate-200/80 bg-white/96 p-4 shadow-[0_10px_24px_-28px_rgba(15,23,42,0.24)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Delivery History</div>
                  <div className="mt-1 text-sm leading-6 text-slate-600">Operator-facing send attempts for this invoice.</div>
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {internalInvoiceEmailDeliveries.length} attempt{internalInvoiceEmailDeliveries.length === 1 ? "" : "s"}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {internalInvoiceEmailDeliveries.map((delivery) => (
                  <div key={delivery.id} className="rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-3 text-sm text-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-slate-900">
                        {delivery.attemptKind === "resent" ? "Resent" : "Sent"} attempt #{delivery.attemptNumber}
                      </div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${delivery.status === "sent" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : delivery.status === "failed" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                        {delivery.status}
                      </span>
                    </div>
                    <div className="mt-1">Recipient: {delivery.recipientEmail || "Not recorded"}</div>
                    <div className="mt-1">Recorded: {delivery.sentAt ? formatDateTimeLAFromIso(delivery.sentAt) : delivery.createdAt ? formatDateTimeLAFromIso(delivery.createdAt) : "—"}</div>
                    {delivery.errorDetail ? (
                      <div className="mt-1 text-rose-700">Delivery note: {delivery.errorDetail}</div>
                    ) : delivery.note ? (
                      <div className="mt-1 text-slate-500">{delivery.note}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {internalInvoice.status === "draft" ? (
            <details className="group rounded-xl border border-slate-200/80 bg-white/96 p-4 shadow-[0_10px_24px_-28px_rgba(15,23,42,0.24)] [&[open]_.disclosure-icon]:rotate-90">
              <summary className="cursor-pointer list-none">
                <CollapsibleHeader
                  title="Edit Billing Details"
                  subtitle={internalInvoiceHasNotes ? "Billing/contact details and notes." : "Billing/contact details are available here when you need them."}
                />
              </summary>

              <div className="mt-3 border-t border-slate-200/80 pt-4">
                <InternalInvoiceDraftSaveForm action={saveInternalInvoiceDraftFromForm} className="space-y-4">
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="tab" value={tab} />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={workspaceFieldLabelClass}>Invoice #</label>
                      <input
                        name="invoice_number"
                        defaultValue={String(internalInvoice.invoice_number ?? "")}
                        className={workspaceInputClass}
                        required
                      />
                    </div>

                    <div>
                      <label className={workspaceFieldLabelClass}>Invoice Date</label>
                      <input
                        type="date"
                        name="invoice_date"
                        defaultValue={dateToDateInput(internalInvoice.invoice_date)}
                        className={workspaceInputClass}
                        required
                      />
                    </div>

                    <div>
                      <label className={workspaceFieldLabelClass}>Billing Name</label>
                      <input
                        name="billing_name"
                        defaultValue={String(internalInvoice.billing_name ?? "")}
                        className={workspaceInputClass}
                      />
                    </div>

                    <div>
                      <label className={workspaceFieldLabelClass}>Billing Email</label>
                      <input
                        name="billing_email"
                        defaultValue={String(internalInvoice.billing_email ?? "")}
                        className={workspaceInputClass}
                      />
                    </div>

                    <div>
                      <label className={workspaceFieldLabelClass}>Billing Phone</label>
                      <input
                        name="billing_phone"
                        defaultValue={String(internalInvoice.billing_phone ?? "")}
                        className={workspaceInputClass}
                      />
                    </div>

                    <div>
                      <label className={workspaceFieldLabelClass}>Address Line 1</label>
                      <input
                        name="billing_address_line1"
                        defaultValue={String(internalInvoice.billing_address_line1 ?? "")}
                        className={workspaceInputClass}
                      />
                    </div>

                    <div>
                      <label className={workspaceFieldLabelClass}>Address Line 2</label>
                      <input
                        name="billing_address_line2"
                        defaultValue={String(internalInvoice.billing_address_line2 ?? "")}
                        className={workspaceInputClass}
                      />
                    </div>

                    <div>
                      <label className={workspaceFieldLabelClass}>City</label>
                      <input
                        name="billing_city"
                        defaultValue={String(internalInvoice.billing_city ?? "")}
                        className={workspaceInputClass}
                      />
                    </div>

                    <div>
                      <label className={workspaceFieldLabelClass}>State</label>
                      <input
                        name="billing_state"
                        defaultValue={String(internalInvoice.billing_state ?? "")}
                        className={workspaceInputClass}
                      />
                    </div>

                    <div>
                      <label className={workspaceFieldLabelClass}>ZIP</label>
                      <input
                        name="billing_zip"
                        defaultValue={String(internalInvoice.billing_zip ?? "")}
                        className={workspaceInputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={workspaceFieldLabelClass}>Notes</label>
                    <textarea
                      name="notes"
                      defaultValue={String(internalInvoice.notes ?? "")}
                      className={`${workspaceInputClass} min-h-[5.25rem]`}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <SubmitButton loadingText="Saving..." className={secondaryButtonClass}>
                      Save Billing Details
                    </SubmitButton>
                  </div>
                </InternalInvoiceDraftSaveForm>
              </div>
            </details>
          ) : null}
        </div>
      </div>
    )}
  </div>
) : null}


  <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.92fr)] xl:items-start">
  <div className="order-2 flex flex-col gap-5 xl:order-2">
    {/* Equipment */}
  <details className={`${workspaceDetailsClass} xl:order-2`}>
      <summary className="cursor-pointer list-none">
        <CollapsibleHeader
          title="Equipment"
          subtitle={equipmentSummaryLabel}
          meta={`${equipmentCount} item${equipmentCount === 1 ? "" : "s"}`}
        />
      </summary>

      <div className={workspaceDetailsDividerClass}>

      <div className={workspaceInsetClass}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Status
        </div>
        <div className="mt-1 text-sm font-semibold text-slate-950">
          {equipmentSummaryLabel}
        </div>
      </div>

      {equipmentCount > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
          <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Condenser</div>
            <div className="mt-1 font-medium text-slate-900">
              {outdoorEquipment
                ? `${outdoorEquipment.manufacturer ?? "—"} ${outdoorEquipment.model ?? ""}`.trim()
                : "—"}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Indoor Equipment</div>
            <div className="mt-1 font-medium text-slate-900">
              {indoorEquipment
                ? `${indoorEquipment.manufacturer ?? "—"} ${indoorEquipment.model ?? ""}`.trim()
                : "—"}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/jobs/${job.id}/info?f=equipment`}
          className={darkButtonClass}
        >
          {equipmentCount > 0 ? "View / Edit Equipment" : "Capture Equipment"}
        </Link>
      </div>
      </div>
    </details>

    {/* Attachments - moved up from bottom */}
    <details className={workspaceDetailsClass}>
      <summary className="cursor-pointer list-none">
        <CollapsibleHeader
          title="Attachments"
          subtitle="Uploaded files and shareable job records."
          meta="Deferred"
        />
      </summary>
      <div className={`${workspaceDetailsDividerClass} px-0 pb-0`}>
        <div className="mb-3 flex items-center justify-end">
          <Link
            href={`/jobs/${job.id}/attachments`}
            className={secondaryButtonClass}
          >
            View All Attachments
          </Link>
        </div>
        <Suspense fallback={<JobAttachmentsSectionFallback />}>
          <DeferredJobAttachmentsInternal
            jobId={String(job.id)}
            accountOwnerUserId={String(internalUser.account_owner_user_id)}
          />
        </Suspense>
      </div>
    </details>

    <details className={workspaceDetailsClass}>
      <summary className="cursor-pointer list-none">
        <CollapsibleHeader
          title="Follow-Up History"
          subtitle={followUpHistorySummaryText}
          meta={`${attemptCount} attempt${attemptCount === 1 ? "" : "s"}`}
        />
      </summary>

      <div className={`${workspaceDetailsDividerClass} rounded-xl border border-slate-200/80 bg-white/96 p-4`}>
        <Suspense fallback={<FollowUpHistorySectionFallback />}>
          <DeferredCustomerAttemptsHistory
            jobId={String(job.id)}
            emptyStateClassName={workspaceEmptyStateClass}
            infoChipClassName={infoChipClass}
          />
        </Suspense>
      </div>
    </details>



  <details id="service-chain" className={`${workspaceDetailsClass} xl:order-1`}>
      <summary className="cursor-pointer list-none">
        <CollapsibleHeader
          title="Service Chain"
          subtitle={serviceChainSummaryText}
          meta={`${serviceCaseVisitCount} visit${serviceCaseVisitCount === 1 ? "" : "s"}`}
        />
      </summary>

      <div className={workspaceDetailsDividerClass}>
        {serviceCaseId ? (
          <div className="mb-3 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Case: {serviceCaseId.slice(0, 8)}…
          </div>
        ) : null}

        {!serviceCaseId ? (
          <div className={workspaceEmptyStateClass}>
            This job is not attached to a service case yet.
          </div>
        ) : !serviceChainJobs || serviceChainJobs.length === 0 ? (
          <div className={workspaceEmptyStateClass}>
            No visits found in this service case.
          </div>
        ) : (
          <div className="max-h-96 space-y-2 overflow-auto pr-1 sm:max-h-none sm:overflow-visible sm:pr-0">
            {serviceChainJobs.map((visit: any, idx: number) => {
              const visitId = String(visit.id ?? "").trim();
              const isCurrent = visit.id === jobId;
              const visitLabel = serviceChainVisitLabel(visit, idx);
              const failureReason = serviceChainFailureReasonByJob.get(visitId) ?? "";
              const win =
                visit.scheduled_date && visit.window_start && visit.window_end
                  ? `${formatTimeDisplay(visit.window_start)}–${formatTimeDisplay(visit.window_end)}`
                  : null;

              return (
                <div
                  key={visit.id}
                  className={[
                    "rounded-xl border p-3.5 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.35)]",
                    isCurrent ? "border-slate-900/90 bg-slate-50" : "border-slate-200/80 bg-white",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-slate-950">
                          {visitLabel}
                          {isCurrent && (
                            <span className="text-blue-600"> • Active</span>
                          )}
                        </div>
                        <span
                          className={[
                            "inline-flex rounded-md px-2 py-1 text-xs font-semibold",
                            serviceChainBadgeClass(visit.ops_status, isCurrent),
                          ].join(" ")}
                        >
                          {formatOpsStatusLabel(visit.ops_status)}
                        </span>
                      </div>

                      <div className="mt-1 text-sm text-slate-800">
                        {normalizeRetestLinkedJobTitle(visit.title) || "Untitled Job"}
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        Created:{" "}
                        {visit.created_at ? formatDateLAFromIso(String(visit.created_at)) : "—"}
                        {visit.scheduled_date ? ` • Scheduled: ${formatBusinessDateUS(String(visit.scheduled_date))}` : ""}
                        {win ? ` • ${win}` : ""}
                      </div>
                      {isFailedFamilyOpsStatus(visit.ops_status) && failureReason ? (
                        <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-900">
                          <span className="font-semibold uppercase tracking-[0.08em] text-rose-700">Reason:</span>{" "}
                          {failureReason}
                        </div>
                      ) : null}
                    </div>

                    {!isCurrent ? (
                      <Link
                        href={`/jobs/${visit.id}?tab=ops`}
                        className="text-sm font-medium text-blue-700 underline decoration-blue-200 underline-offset-4"
                      >
                        View Job
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </details>

      {job.job_type === "ecc" ? (
      <details className={`${workspaceDetailsClass} xl:order-3`}>
        <summary className="cursor-pointer list-none">
          <CollapsibleHeader
            title="ECC Summary"
            subtitle={eccSummaryText}
            meta={`${job.ecc_test_runs?.length ?? 0} run${(job.ecc_test_runs?.length ?? 0) === 1 ? "" : "s"}`}
          />
        </summary>

        <div className={workspaceDetailsDividerClass}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className={`${job.ecc_test_runs?.length ? "rounded-xl border border-slate-200/80 bg-white/96" : workspaceEmptyStateClass} px-4 py-4 text-sm text-slate-600 sm:flex-1`}>
              {job.ecc_test_runs?.length ? (
                <span>{job.ecc_test_runs.length} test run(s) recorded.</span>
              ) : (
                <span>No tests recorded yet.</span>
              )}
            </div>

            <Link
              href={`/jobs/${job.id}/tests`}
              className={darkButtonClass}
            >
              Open Tests Workspace
            </Link>
          </div>
        </div>
      </details>
      ) : null}
    </div>

    <div className="order-1 flex flex-col gap-6 xl:order-1">
      {/* Unified operations workspace */}
  <div className="order-1 space-y-5 xl:order-1">
          {/* Job Status (ops_status) */}
<details className={workspaceDetailsClass}>
  <summary className="cursor-pointer list-none">
    <CollapsibleHeader
      title="Job Status"
      subtitle={jobStatusSummaryText}
    />
  </summary>

  <div className={workspaceDetailsDividerClass}>

  <form action={updateJobOpsFromForm} className="flex flex-col gap-3 sm:gap-2 sm:flex-row sm:items-end sm:flex-wrap">
    <input type="hidden" name="job_id" value={job.id} />

    <div className="flex-1 min-w-xs">
      {activeWaitingState ? (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-3 text-sm">
          <div className="inline-flex items-center rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-800">
            Waiting
          </div>
          {activeWaitingState.blockerReason ? (
            <div className="mt-2 text-sm text-amber-900">{activeWaitingState.blockerReason}</div>
          ) : null}
          {canShowWaitingReleaseQuickAction ? (
            <div className="mt-2 border-t border-amber-200/80 pt-2.5">
              <p className="text-xs leading-5 text-amber-900/90">
                Use this when the part, approval, access, or missing information is no longer blocking the job.
              </p>
              <form action={releaseAndReevaluateFromForm} className="mt-2">
                <input type="hidden" name="job_id" value={job.id} />
                <SubmitButton loadingText="Updating..." className={`${secondaryButtonClass} w-full sm:w-auto`}>
                  Mark Ready to Continue
                </SubmitButton>
              </form>
            </div>
          ) : null}
        </div>
      ) : null}

      {!["need_to_schedule", "scheduled", "pending_info", "on_hold"].includes(
        String(job.ops_status ?? "")
      ) ? (
        <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50/80 px-3.5 py-3 text-sm font-medium text-slate-900">
          Current lifecycle state:{" "}
          <span>
            {formatOpsStatusLabel(job.ops_status)}
          </span>
        </div>
      ) : null}

      <InterruptStateFields
        workspaceFieldLabelClass={workspaceFieldLabelClass}
        workspaceInputClass={workspaceInputClass}
        initialInterruptState={currentInterruptState as "" | "pending_info" | "on_hold" | "waiting"}
        initialStatusReason={initialInterruptReason}
        initialWaitingReasonType={initialWaitingReasonType}
        initialWaitingOtherReason={initialWaitingOtherReason}
      />
    </div>

    <SubmitButton loadingText="Saving..." className={`${primaryButtonClass} sm:shrink-0`}>
      Save Interrupt State
    </SubmitButton>
  </form>

  {currentInterruptState ? (
    <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3 text-sm text-slate-700">
      <div className="font-semibold text-slate-900">Current Interrupt Detail</div>
      <div className="mt-1">
        {currentInterruptReasonText
          ? (currentInterruptState === "waiting"
              ? `Waiting - ${currentInterruptReasonText}`
              : currentInterruptState === "pending_info"
              ? `Pending Info - ${currentInterruptReasonText}`
              : `On Hold - ${currentInterruptReasonText}`)
          : currentInterruptState === "waiting"
          ? "Waiting is active. Add or update the blocking reason if needed."
          : currentInterruptState === "pending_info"
          ? "Pending Info is active. Add the missing blocker detail if needed."
          : "On Hold is active. Add the pause reason if needed."}
      </div>
    </div>
  ) : null}

        {canShowReleaseAndReevaluate ? (
          <form action={releaseAndReevaluateFromForm} className="mt-2">
            <input type="hidden" name="job_id" value={job.id} />
            <SubmitButton loadingText="Updating..." className={`w-full ${secondaryButtonClass} sm:w-auto`}>
              {interruptReleaseActionLabel}
            </SubmitButton>
          </form>
        ) : null}
      </div>

      <ServiceStatusActions jobId={job.id} billingMode={billingMode} />

      {job.job_notes ? (
        <div className={`${workspacePanelClass} p-4 text-gray-900`}>
          <div className="mb-2 text-sm font-semibold text-slate-950">Job Notes</div>
          <div className="whitespace-pre-wrap rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-sm leading-6 text-slate-800">
            {job.job_notes}
          </div>
        </div>
      ) : null}
</details>

 </div>

    <section className="order-1 space-y-4 xl:order-5">
      <div className="space-y-4">
        {/* Shared Notes */}
        <details className={workspaceDetailsClass}>
          <summary className="cursor-pointer list-none">
            <CollapsibleHeader title={sharedNotesTitle} subtitle={sharedNotesSummaryText} meta={`${sharedNotes.length} note${sharedNotes.length === 1 ? "" : "s"}`} metaTone={sharedNotes.length > 0 ? "note-highlight" : "default"} />
          </summary>

          <div className={`${workspaceDetailsDividerClass} space-y-2`}>

  <form action={addPublicNoteFromForm} className="mb-4 space-y-3">
    <input type="hidden" name="job_id" value={job.id} />
    <input type="hidden" name="tab" value={tab} />

    <textarea
      name="note"
      rows={3}
      placeholder="Add a note visible to the contractor..."
      className={workspaceTextareaClass}
    />

    <div className="flex justify-end">
      <SubmitButton
        loadingText="Adding note..."
        className={secondaryButtonClass}
      >
        Save shared note
      </SubmitButton>
    </div>
  </form>

  <div className="space-y-3">
    {sharedNotes.length ? (
      sharedNotes.map((e: any, idx: number) => {
        const when = e?.created_at ? formatDateTimeLAFromIso(String(e.created_at)) : "—";
        const type = String(e?.event_type ?? "");
        const meta = e?.meta ?? {};
        const noteText = getEventNoteText(meta);
        const attachmentLabel = getEventAttachmentLabel(meta);

        return (
          <div key={idx} className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="text-xs text-slate-500">{when}</div>
              <div className="text-xs font-medium text-slate-500">
                {type === "contractor_note"
                  ? "Contractor"
                  : type === "public_note"
                  ? "Internal (shared)"
                  : type === "contractor_correction_submission"
                  ? "Correction submission"
                  : "Shared"}
              </div>
            </div>

            <div className="mt-2 text-sm font-medium text-slate-950">
              {formatSharedHistoryHeading(type, meta)}
            </div>

            {noteText ? (
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                {noteText}
              </div>
            ) : null}

            {attachmentLabel ? (
              <div className="mt-2 inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                {attachmentLabel}
              </div>
            ) : null}
          </div>
        );
      })
    ) : (
      <div className={workspaceEmptyStateClass}>{hasDirectNarrativeChain ? "No shared notes in this direct retest chain yet." : "No shared notes yet."}</div>
    )}
  </div>
          </div>
        </details>

        {/* Internal Notes */}
        <details className={workspaceDetailsClass}>
          <summary className="cursor-pointer list-none">
            <CollapsibleHeader title={internalNotesTitle} subtitle={internalNotesSummaryText} meta={`${internalNotes.length} note${internalNotes.length === 1 ? "" : "s"}`} metaTone={internalNotes.length > 0 ? "note-highlight" : "default"} />
          </summary>

          <div className={`${workspaceDetailsDividerClass} space-y-2`}>

  <form action={addInternalNoteFromForm} className="mb-4 space-y-3">
    <input type="hidden" name="job_id" value={job.id} />
    <input type="hidden" name="tab" value={tab} />

    <textarea
      name="note"
      rows={3}
      placeholder="Add an internal note visible only to your team..."
      className={workspaceTextareaClass}
    />

    <div className="flex justify-end">
      <SubmitButton
        loadingText="Adding note..."
        className={secondaryButtonClass}
      >
        Save internal note
      </SubmitButton>
    </div>
  </form>

  <div className="space-y-3">
    {internalNotes.length ? (
      internalNotes.map((e: any, idx: number) => {
        const when = e?.created_at ? formatDateTimeLAFromIso(String(e.created_at)) : "—";
        const meta = e?.meta ?? {};
        const noteText = getEventNoteText(meta);

        return (
          <div key={idx} className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
            <div className="text-xs text-slate-500">{when}</div>

            <div className="mt-2 text-sm font-medium text-slate-950">
              Internal note
            </div>

            {noteText ? (
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                {noteText}
              </div>
            ) : null}
          </div>
        );
      })
    ) : (
      <div className={workspaceEmptyStateClass}>{hasDirectNarrativeChain ? "No internal notes in this direct retest chain yet." : "No internal notes yet."}</div>
    )}
  </div>
          </div>
        </details>

        {/* Section A: Follow Up (Active Edit Area) */}
        <details className={workspaceDetailsClass}>
          <summary className="cursor-pointer list-none">
            <CollapsibleHeader
              title="Follow Up"
              subtitle={followUpSummaryText}
            />
          </summary>

          <div className={workspaceDetailsDividerClass}>
            <div className="rounded-xl border border-slate-200/80 bg-white/96 p-4">

            {hasFollowUpReminder ? (
              <div className="mb-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2.5 text-xs leading-5 text-slate-600">
                Follow Up stays separate from Pending Info. Use this area for reminder ownership, due date, and next-action notes.
              </div>
            ) : null}

            <form action={updateJobOpsDetailsFromForm} className="grid gap-3">
              <input type="hidden" name="job_id" value={job.id} />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={workspaceFieldLabelClass}>Action Required By</label>
                  <select
                    name="action_required_by"
                    defaultValue={job.action_required_by ?? ""}
                    className={workspaceInputClass}
                  >
                    <option value="">—</option>
                    <option value="rater">Rater</option>
                    <option value="contractor">Contractor</option>
                    <option value="customer">Customer</option>
                  </select>
                </div>

                <div>
                  <label className={workspaceFieldLabelClass}>Follow-up Date</label>
                  <input
                    type="date"
                    name="follow_up_date"
                    defaultValue={job.follow_up_date ? dateToDateInput(String(job.follow_up_date)) : ""}
                    className={workspaceInputClass}
                  />
                </div>
              </div>

              <div>
                <label className={workspaceFieldLabelClass}>Next Action Note</label>
                <textarea
                  name="next_action_note"
                  defaultValue={job.next_action_note ?? ""}
                  className={workspaceTextareaClass}
                  rows={4}
                />
              </div>

              <SubmitButton loadingText="Saving..." className={`${darkButtonClass} w-fit`}>
                Save Follow Up
              </SubmitButton>
            </form>
          </div>
        </div>
        </details>

        {/* Timeline - Activity/History */}
        <details className={workspaceDetailsClass}>
          <summary className="cursor-pointer list-none">
            <CollapsibleHeader
              title={timelineTitle}
              subtitle={timelineSummaryText}
              meta={`${timelineItems.length} event(s)`}
            />
          </summary>

          <div className={`${workspaceDetailsDividerClass} space-y-2`}>
    {timelineItems.length ? (
      <>
        {timelinePreviewItems.map((e: any, idx: number) =>
          renderTimelineItem(e, `timeline-preview-${idx}`)
        )}

        {timelineOverflowItems.length > 0 ? (
          <details className="pt-1">
            <summary className="cursor-pointer text-sm font-medium text-slate-700 underline decoration-slate-300 underline-offset-4">
              Show all timeline entries ({timelineItems.length})
            </summary>
            <div className="mt-2 space-y-2">
              {timelineOverflowItems.map((e: any, idx: number) =>
                renderTimelineItem(e, `timeline-overflow-${idx}`)
              )}
            </div>
          </details>
        ) : null}
      </>
    ) : (
      <div className={workspaceEmptyStateClass}>{hasDirectNarrativeChain ? "No timeline events in this direct retest chain yet." : "No timeline events yet."}</div>
    )}
          </div>
        </details>
      </div>
    </section>

          {/* Failure Resolution */}
{(showRetestSection || showCorrectionReviewResolution) ? (
<details className={`${workspaceDetailsClass} order-3 mb-5 xl:order-3`}>
  <summary className="cursor-pointer list-none">
    <CollapsibleHeader
      title="Failure Resolution"
      subtitle={failureResolutionSummaryText}
      meta={`${failureResolutionPathCount} path${failureResolutionPathCount === 1 ? "" : "s"} available`}
    />
  </summary>

  <div className={workspaceDetailsDividerClass}>
  <div className={`grid gap-4${showRetestSection && showCorrectionReviewResolution ? " lg:grid-cols-2" : ""}`}>
    {showRetestSection ? (
      <div className={workspaceSoftCardClass}>
        <div className="mb-2 text-sm font-semibold text-slate-950">Create Retest Job</div>
        <div className="mb-3 text-sm leading-6 text-slate-600">
          Create a new retest visit when this failure requires a physical return visit.
        </div>

        <form action={createRetestJobFromForm} className="space-y-3">
          <input type="hidden" name="parent_job_id" value={job.id} />

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="copy_equipment" value="1" defaultChecked />
            Copy equipment from original
          </label>

          <SubmitButton
            loadingText="Creating..."
            className={darkButtonClass}
          >
            Create Retest Job
          </SubmitButton>
        </form>
      </div>
    ) : null}

    {showCorrectionReviewResolution ? (
      <div className={workspaceSoftCardClass}>
        <div className="mb-2 text-sm font-semibold text-slate-950">Resolve by Correction Review</div>
        <div className="mb-3 text-sm leading-6 text-slate-600">
          Use this only when submitted correction notes/photos are sufficient to resolve the failure without sending a technician back out for a physical retest.
        </div>

        <form action={resolveFailureByCorrectionReviewFromForm} className="space-y-3">
          <input type="hidden" name="job_id" value={job.id} />

          <div>
            <label className={workspaceFieldLabelClass}>
              Review Note (optional)
            </label>
            <textarea
              name="review_note"
              rows={3}
              placeholder="Explain why the failure was resolved by correction review..."
              className={workspaceTextareaClass}
            />
          </div>

          <SubmitButton
            loadingText="Submitting..."
            className={darkButtonClass}
          >
            Resolve Failure by Correction Review
          </SubmitButton>
        </form>
      </div>
    ) : null}
  </div>
</div>
</details>
) : null}

{isInternalUser && ["failed", "pending_info"].includes(String(job.ops_status ?? "")) ? (
  <>
    <div className="order-4 xl:order-4">
      <ContractorReportPanel
        jobId={job.id}
        contractorResponseLabel={contractorResponseLabel}
        contractorResponseSubLabel={contractorResponseSubLabel}
      />
    </div>
  </>
) : null}
    </div>
  </div>
  </div>
  );
  
}
