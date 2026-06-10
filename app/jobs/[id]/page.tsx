// app/jobs/[id]/page
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import SubmitButton from "@/components/SubmitButton";
import FlashBanner from "@/components/ui/FlashBanner";
import { archiveJobFromForm } from "@/lib/actions/job-actions";
import JobLocationPreview from "@/components/jobs/JobLocationPreview";
import {
  getContractors,
  setPrimaryJobAssigneeFromForm,
  removeJobAssigneeFromForm,
  updateJobCustomerFromForm,
  updateJobContractorFromForm,
  updateJobScheduleFromForm,
  advanceJobStatusFromForm,
  updateJobServiceContractFromForm,
  updateJobVisitScopeFromForm,
  createNextServiceVisitFromForm,
  createCallbackVisitFromForm,
  completeDataEntryFromForm,
  createRetestJobFromForm,
  getOnTheWayUndoEligibility,
  promoteCompanionScopeToServiceJobFromForm,
  addPublicNoteFromForm,
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
import { displayDateLA, formatBusinessDateUS, formatDateOnlyDisplay, formatTimestampDateDisplayLA, formatTimestampDateTimeDisplayLA } from "@/lib/utils/schedule-la";
import { formatPersonNamePart } from "@/lib/utils/identity-display";
import { formatInvoiceDisplayReference, formatJobDisplayReference } from "@/lib/utils/display-references";
import type { JobStatus } from "@/lib/types/job";
import { JobFieldActionButton } from "./_components/JobFieldActionButton";
import UnscheduleButton from "./_components/UnscheduleButton";
import { getCloseoutNeeds, isInCloseoutQueue } from "@/lib/utils/closeout";
import ContractorReportPanel from "./_components/ContractorReportPanel";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import {
  getActiveJobAssignmentDisplayMap,
} from "@/lib/staffing/human-layer";
import {
  type BillingMode,
  resolveBillingModeByAccountOwnerId,
  resolveInternalBusinessIdentityByAccountOwnerId,
} from "@/lib/business/internal-business-profile";
import { resolveProductModeForAccountOwnerId, type ProductMode } from "@/lib/business/product-mode-defaults";
import { buildJobBillingStateReadModel } from "@/lib/business/job-billing-state";
import {
  resolveInternalInvoiceEmailDeliveries,
  type InternalInvoiceEmailDeliveryRecord,
} from "@/lib/business/internal-invoice-delivery";
import {
  normalizeInternalInvoiceStatus,
  type InternalInvoiceItemType,
  resolveLatestVoidedInternalInvoiceByJobId,
  resolveInternalInvoiceByJobId,
  resolveInternalInvoiceFamilySummaryByJobId,
  type InternalInvoiceStatus,
} from "@/lib/business/internal-invoice";
import {
  resolveInvoiceCollectedPaymentLedger,
  type InternalInvoicePaymentRow,
} from "@/lib/business/internal-invoice-payments";
import { listFieldChargeProposalsForJob } from "@/lib/business/field-charge-proposals";
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
  loadScopedInternalJobDetailReadBoundaryOutcome,
  resolveJobDetailActor,
} from "@/lib/actions/internal-job-detail-read-boundary";
import { isEstimatesEnabled } from "@/lib/estimates/estimate-exposure";
import { isMaintenanceAgreementsEnabled } from "@/lib/maintenance-agreements/agreement-exposure";
import {
  hasMaintenanceAgreementVisitConfirmedNextDue,
  listMaintenanceAgreementLinksForJob,
  projectMaintenanceAgreementSuggestedNextDue,
  projectMaintenanceAgreementVisitCountReview,
} from "@/lib/maintenance-agreements/read-model";

import DeferredJobAttachmentsInternal from "./_components/DeferredJobAttachmentsInternal";
import DeferredCustomerAttemptsHistory from "./_components/DeferredCustomerAttemptsHistory";
import DeferredServiceChainPanelBody from "./_components/DeferredServiceChainPanelBody";
import DeferredWorkflowMilestonesPanelBody from "./_components/DeferredWorkflowMilestonesPanelBody";
import DeferredAddAssigneeForm from "./_components/DeferredAddAssigneeForm";
import ContactLoggingQuickActions from "./_components/ContactLoggingQuickActions";
import DeferredTimelineBody from "./_components/DeferredTimelineBody";
import DeferredSharedNotesBody from "./_components/DeferredSharedNotesBody";
import DeferredInternalNotesBody from "./_components/DeferredInternalNotesBody";
import DeferredInternalNoteMentionComposer from "./_components/DeferredInternalNoteMentionComposer";
import FieldOutcomePanel from "./_components/FieldOutcomePanel";
import FieldBillingSummary from "./_components/FieldBillingSummary";
import InternalInvoiceLineItemsTable, {
  InternalInvoiceDraftSaveForm,
} from "./_components/InternalInvoiceLineItemsTable";
import {
  hasDirectInvoiceDraftMutationAccess,
  hasInvoiceIssueAccess,
  hasInvoiceSendAccess,
  resolveFieldBillingCapabilities,
} from "@/lib/auth/field-billing-access";
import { loadFieldBillingExplicitCapabilitiesForUser } from "@/lib/auth/internal-user-access-capabilities";
import VisitScopeJobDetailForm from "@/components/jobs/VisitScopeJobDetailForm";
import {
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
import MarkVisitCountedActionButton from "./_components/MarkVisitCountedActionButton";
import ConfirmNextDueDateActionButton from "./_components/ConfirmNextDueDateActionButton";
import {
  listContactRecipientsForEntity,
  type ContactRecipientRow,
} from "@/lib/communications/contact-recipients-read";
import { buildInternalJobRoleContactSections } from "@/lib/communications/contact-recipients-display";
import RoleContactsCard from "@/components/RoleContactsCard";
import { equipmentRoleLabel } from "@/lib/utils/equipment-display";
import { formatRecentAttemptDateTime } from "@/lib/ops/recent-attempt-display";

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
  return formatTimestampDateDisplayLA(iso);
}

function formatDateTimeLAFromIso(iso: string) {
  return formatTimestampDateTimeDisplayLA(iso);
}

function formatDateDisplay(date?: string | null) {
  if (!date) return "";
  return date;
}

function formatYmdDisplay(value?: string | null) {
  const ymd = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${ymd}T00:00:00Z`));
  } catch {
    return ymd;
  }
}

function formatDateOnlyUs(value?: string | null) {
  return formatDateOnlyDisplay(value);
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

function formatLatestEccRunResultLabel(run: any): string {
  if (!run) return "";
  if (run.override_pass === true) return "PASS (override)";
  if (run.override_pass === false) return "FAIL (override)";
  if (run.computed?.status === "photo_evidence") return "Photo Taken (attestation)";
  if (run.computed?.status === "blocked") return "BLOCKED (conditions)";
  if (run.computed_pass === true) return "PASS";
  if (run.computed_pass === false) return "FAIL";
  if (run.is_completed === true) return "Verified";
  return "Draft";
}

function toTimestampMs(value?: string | null): number {
  if (!value) return -1;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : -1;
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

function ServiceChainPanelBodyFallback() {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-24 animate-pulse rounded-xl border border-slate-200/70 bg-slate-50"
        />
      ))}
    </div>
  );
}

function WorkflowMilestonesPanelBodyFallback() {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: 2 }).map((_, index) => (
        <div
          key={index}
          className="h-20 animate-pulse rounded-xl border border-slate-200/70 bg-slate-50"
        />
      ))}
    </div>
  );
}

function NarrativeNotesBodyFallback() {
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

function NarrativeTimelineBodyFallback() {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-28 animate-pulse rounded-xl border border-slate-200/70 bg-slate-50"
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

function MobileLineIcon(props: { children: ReactNode; className?: string }) {
  const { children, className } = props;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-4 w-4"}
      aria-hidden
    >
      {children}
    </svg>
  );
}

function UserIcon(props: { className?: string }) {
  return (
    <MobileLineIcon className={props.className}>
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </MobileLineIcon>
  );
}

function MapPinIcon(props: { className?: string }) {
  return (
    <MobileLineIcon className={props.className}>
      <path d="M12 22s7-5.6 7-12a7 7 0 1 0-14 0c0 6.4 7 12 7 12Z" />
      <circle cx="12" cy="10" r="2.5" />
    </MobileLineIcon>
  );
}

function PhoneIcon(props: { className?: string }) {
  return (
    <MobileLineIcon className={props.className}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 11.2 19a19.4 19.4 0 0 1-6.1-6.1A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.8 2.6a2 2 0 0 1-.5 2.2L8 9.9a16 16 0 0 0 6.1 6.1l1.4-1.4a2 2 0 0 1 2.2-.5c.8.4 1.7.7 2.6.8A2 2 0 0 1 22 16.9Z" />
    </MobileLineIcon>
  );
}

function MessageIcon(props: { className?: string }) {
  return (
    <MobileLineIcon className={props.className}>
      <path d="M21 12a8.5 8.5 0 0 1-8.5 8.5H7l-4 2 1.4-4.2A8.5 8.5 0 1 1 21 12Z" />
    </MobileLineIcon>
  );
}

function ToolIcon(props: { className?: string }) {
  return (
    <MobileLineIcon className={props.className}>
      <path d="m14 6 4 4" />
      <path d="m6 14 4 4" />
      <path d="m5 19 4-4" />
      <path d="m15 9 4-4" />
      <path d="m3 21 6-6" />
      <path d="m15 3 6 6" />
    </MobileLineIcon>
  );
}

function ClipboardIcon(props: { className?: string }) {
  return (
    <MobileLineIcon className={props.className}>
      <rect x="6" y="4" width="12" height="18" rx="2" />
      <path d="M9 4.5h6a1.5 1.5 0 0 0-3-1.5h0A1.5 1.5 0 0 0 9 4.5Z" />
      <path d="m9 13 2.2 2.2L15 11.4" />
    </MobileLineIcon>
  );
}

function ReceiptIcon(props: { className?: string }) {
  return (
    <MobileLineIcon className={props.className}>
      <path d="M6 3h12v18l-2.2-1.5L13 21l-2.8-1.5L7.4 21 6 19.8V3Z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
    </MobileLineIcon>
  );
}

function WarningIcon(props: { className?: string }) {
  return (
    <MobileLineIcon className={props.className}>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9v5" />
      <circle cx="12" cy="17" r="1" />
    </MobileLineIcon>
  );
}

function ClockIcon(props: { className?: string }) {
  return (
    <MobileLineIcon className={props.className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </MobileLineIcon>
  );
}

function LockIcon(props: { className?: string }) {
  return (
    <MobileLineIcon className={props.className}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" />
    </MobileLineIcon>
  );
}

function ChatIcon(props: { className?: string }) {
  return (
    <MobileLineIcon className={props.className}>
      <path d="M21 12a8.5 8.5 0 0 1-8.5 8.5H7l-4 2 1.4-4.2A8.5 8.5 0 1 1 21 12Z" />
      <path d="M8.5 12h7" />
      <path d="M8.5 15h4.5" />
    </MobileLineIcon>
  );
}

function SettingsIcon(props: { className?: string }) {
  return (
    <MobileLineIcon className={props.className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.2a1.8 1.8 0 0 0-1-1.6 1.8 1.8 0 0 0-2 .4l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.8 1.8 0 0 0 .4-2 1.8 1.8 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.2a1.8 1.8 0 0 0 1.6-1 1.8 1.8 0 0 0-.4-2l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.8 1.8 0 0 0 2 .4h0a1.8 1.8 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.2a1.8 1.8 0 0 0 1 1.6h0a1.8 1.8 0 0 0 2-.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.8 1.8 0 0 0-.4 2v0a1.8 1.8 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.2a1.8 1.8 0 0 0-1.4.8Z" />
    </MobileLineIcon>
  );
}

function FolderIcon(props: { className?: string }) {
  return (
    <MobileLineIcon className={props.className}>
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </MobileLineIcon>
  );
}

function PaperclipIcon(props: { className?: string }) {
  return (
    <MobileLineIcon className={props.className}>
      <path d="M21 11.5 11.8 20.7a5 5 0 0 1-7.1-7.1l9.2-9.2a3.5 3.5 0 1 1 5 5l-9.2 9.2a2 2 0 1 1-2.8-2.8l8.5-8.5" />
    </MobileLineIcon>
  );
}

function NavigateIcon(props: { className?: string }) {
  return (
    <MobileLineIcon className={props.className}>
      <path d="m3 11 18-8-8 18-2.5-7.5L3 11Z" />
    </MobileLineIcon>
  );
}

function ChevronRightIcon(props: { className?: string }) {
  return (
    <MobileLineIcon className={props.className}>
      <path d="m9 6 6 6-6 6" />
    </MobileLineIcon>
  );
}

function CollapsibleHeader(props: {
  title: string;
  subtitle?: string;
  meta?: string;
  metaTone?: "default" | "note-highlight";
  compactOnMobile?: boolean;
  icon?: ReactNode;
}) {
  const { title, subtitle, meta, metaTone = "default", compactOnMobile = false, icon } = props;
  const metaClassName = compactOnMobile
    ? metaTone === "note-highlight"
      ? "mt-0.5 shrink-0 rounded-md border border-amber-200/80 bg-amber-50/85 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-amber-800 shadow-[0_10px_24px_-24px_rgba(217,119,6,0.35)] sm:rounded-lg sm:px-2.5 sm:py-[0.3125rem] sm:text-[10px] sm:tracking-[0.12em]"
      : "mt-0.5 shrink-0 rounded-md border border-slate-200/70 bg-slate-50/72 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500 sm:rounded-lg sm:px-2.5 sm:py-[0.3125rem] sm:text-[10px] sm:tracking-[0.12em]"
    : metaTone === "note-highlight"
      ? "mt-0.5 shrink-0 rounded-lg border border-amber-200/80 bg-amber-50/85 px-2.5 py-[0.3125rem] text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800 shadow-[0_10px_24px_-24px_rgba(217,119,6,0.35)]"
      : "mt-0.5 shrink-0 rounded-lg border border-slate-200/70 bg-slate-50/72 px-2.5 py-[0.3125rem] text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500";
  return (
    <div className={compactOnMobile ? "flex min-h-8 min-w-0 items-start justify-between gap-2 py-0 sm:min-h-9 sm:gap-4 sm:py-0.5" : "flex min-w-0 items-start justify-between gap-4 py-0.5"}>
      <div className={compactOnMobile ? "flex min-w-0 items-start gap-1.5" : "flex min-w-0 items-start gap-2.5"}>
        <span
          aria-hidden
          className={compactOnMobile ? "disclosure-icon mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-md border border-slate-200/70 bg-white/80 text-[7px] text-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-transform duration-150 group-open:rotate-90 sm:h-4.5 sm:w-4.5 sm:text-[9px]" : "disclosure-icon mt-0.5 inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border border-slate-200/70 bg-white/80 text-[9px] text-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-transform duration-150 group-open:rotate-90"}
        >
          ▶
        </span>
        <div className={compactOnMobile ? "min-w-0 pt-0" : "min-w-0 pt-0.5"}>
          <div className={compactOnMobile ? "header-title inline-flex items-center gap-1.5 text-[13px] font-semibold tracking-[-0.015em] text-slate-950 sm:text-[14.5px]" : "header-title inline-flex items-center gap-1.5 text-[14.5px] font-semibold tracking-[-0.02em] text-slate-950"}>
            {icon ? <span className={compactOnMobile ? "header-icon-badge inline-flex h-4 w-4 items-center justify-center text-slate-500" : "header-icon-badge inline-flex h-4.5 w-4.5 items-center justify-center text-slate-500"}>{icon}</span> : null}
            <span>{title}</span>
          </div>
          {subtitle ? <div className={compactOnMobile ? "header-subtitle mt-0.5 hidden max-w-[42rem] text-[11px] leading-[1.4] text-slate-500 sm:mt-1 sm:block sm:text-[11.5px] sm:leading-[1.45]" : "header-subtitle mt-1 max-w-[42rem] text-[11.5px] leading-[1.45] text-slate-500"}>{subtitle}</div> : null}
        </div>
      </div>
      {meta ? <div className={`header-meta ${metaClassName}`}>{meta}</div> : null}
    </div>
  );
}

function truncateSummaryText(value: string, maxLength = 84) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function presentEquipmentText(value: unknown) {
  return String(value ?? "").trim();
}

function formatEquipmentTitle(eq: any) {
  const role = equipmentRoleLabel(eq?.equipment_role);
  const makeModel = [presentEquipmentText(eq?.manufacturer), presentEquipmentText(eq?.model)]
    .filter(Boolean)
    .join(" ");
  return makeModel ? `${role} - ${makeModel}` : role;
}

function formatEquipmentMeta(eq: any) {
  return [
    presentEquipmentText(eq?.serial) ? `Serial ${presentEquipmentText(eq?.serial)}` : "",
    presentEquipmentText(eq?.tonnage) ? `${presentEquipmentText(eq?.tonnage)} ton` : "",
    presentEquipmentText(eq?.refrigerant_type) ? presentEquipmentText(eq?.refrigerant_type) : "",
  ]
    .filter(Boolean)
    .join(" - ");
}


type JobSearchParams = {
  tab?: "info" | "ops" | "tests";
  banner?: string;
  notice?: string;
  schedule_required?: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

type TimingPhaseRecorder = (phaseName: string, durationMs: number) => void;

type JobLocationPreviewFallbackProps = {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  showAddressOverlay?: boolean;
  showAddressFooter?: boolean;
  showActionsOnMobile?: boolean;
  className?: string;
};

function JobLocationPreviewFallback({
  addressLine1,
  addressLine2,
  city,
  state,
  zip,
  showAddressOverlay,
  showAddressFooter,
  showActionsOnMobile,
  className,
}: JobLocationPreviewFallbackProps) {
  const parts = [addressLine1, addressLine2, [city, state, zip].filter(Boolean).join(" ")]
    .map((p) => String(p ?? "").trim())
    .filter(Boolean);
  const addressDisplay = parts.join(", ");
  const mapsQuery = encodeURIComponent(addressDisplay);
  const mapsSearchUrl = addressDisplay
    ? `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`
    : null;
  const mapsDirectionsUrl = addressDisplay
    ? `https://www.google.com/maps/dir/?api=1&destination=${mapsQuery}`
    : null;

  return (
    <div className={className}>
      <div className="relative">
        {addressDisplay ? (
          <div className="h-40 w-full animate-pulse rounded-lg border border-slate-200 bg-slate-200/60 sm:h-52 lg:h-56 xl:h-60" />
        ) : (
          <div className="flex h-40 w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-100 px-4 text-center text-sm font-medium text-slate-600 sm:h-52 lg:h-56 xl:h-60">
            Location preview unavailable
          </div>
        )}

        {showAddressOverlay && addressDisplay ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-2.5 sm:p-3">
            <div className="rounded-xl border border-white/70 bg-slate-950/52 px-3 py-2 text-sm font-semibold leading-6 text-white shadow-[0_14px_28px_-18px_rgba(15,23,42,0.75)] backdrop-blur-sm sm:px-3.5 sm:py-2.5 sm:text-base lg:text-lg">
              {addressDisplay}
            </div>
          </div>
        ) : null}
      </div>
      {addressDisplay ? (
        <div className={showActionsOnMobile ? "mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch sm:justify-between" : "mt-3 hidden flex-col gap-2 sm:flex sm:flex-row sm:items-stretch sm:justify-between"}>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {mapsDirectionsUrl ? (
              <a
                href={mapsDirectionsUrl}
                target="_blank"
                rel="noreferrer"
                className={showActionsOnMobile ? "inline-flex min-h-11 items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50" : "hidden min-h-11 items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 sm:inline-flex"}
              >
                Navigate
              </a>
            ) : null}
            {mapsSearchUrl ? (
              <a
                href={mapsSearchUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50"
              >
                Open in Maps
              </a>
            ) : null}
          </div>
          {!showAddressOverlay && showAddressFooter ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-sm font-medium leading-6 text-slate-700 sm:max-w-[20rem] sm:text-right">
              {addressDisplay}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type TimedJobLocationPreviewProps = {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  className?: string;
  showAddressOverlay?: boolean;
  showAddressFooter?: boolean;
  showActionsOnMobile?: boolean;
  timingEnabled: boolean;
  onPhaseTiming: TimingPhaseRecorder;
};

async function TimedJobLocationPreview({
  timingEnabled,
  onPhaseTiming,
  ...previewProps
}: TimedJobLocationPreviewProps) {
  const startedAt = timingEnabled ? Date.now() : 0;
  try {
    return await JobLocationPreview(previewProps);
  } finally {
    if (timingEnabled) {
      onPhaseTiming("jobLocationPreviewBlocking", Date.now() - startedAt);
    }
  }
}

function TimedServiceStatusActions({
  jobId,
  billingMode,
  jobType,
  opsStatus,
  timingEnabled,
  onPhaseTiming,
}: {
  jobId: string;
  billingMode: BillingMode;
  jobType?: string | null;
  opsStatus?: string | null;
  timingEnabled: boolean;
  onPhaseTiming: TimingPhaseRecorder;
}) {
  const startedAt = timingEnabled ? Date.now() : 0;
  try {
    return ServiceStatusActions({
      jobId,
      billingMode,
      jobType,
      opsStatus,
    });
  } finally {
    if (timingEnabled) {
      onPhaseTiming("serviceStatusActionsBlocking", Date.now() - startedAt);
    }
  }
}

const workspacePanelClass =
  "rounded-3xl border border-slate-200/90 bg-white shadow-[0_18px_42px_-32px_rgba(15,23,42,0.3)]";
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
  "inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700 sm:px-2.5 sm:py-1 sm:text-xs";
const compactUtilityButtonClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-200/90 bg-white/78 px-3 py-2 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.02)] transition-[border-color,background-color,box-shadow,transform] hover:border-slate-300 hover:bg-white hover:shadow-[0_8px_18px_-18px_rgba(15,23,42,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px] sm:min-h-9 sm:w-auto";
const compactWorkspaceActionButtonClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-blue-200/90 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900 shadow-[0_10px_22px_-20px_rgba(37,99,235,0.35)] transition-[border-color,background-color,box-shadow,transform,color] hover:border-blue-300 hover:bg-blue-100 hover:text-blue-950 hover:shadow-[0_14px_26px_-20px_rgba(37,99,235,0.42)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px] sm:min-h-9 sm:w-auto";
const workspaceDetailsClass =
  `${workspaceSectionClass} group text-gray-900 ring-1 ring-slate-200/60 transition-[border-color,box-shadow,transform] duration-150 hover:border-slate-300/90 hover:shadow-[0_20px_44px_-32px_rgba(15,23,42,0.34)] [&[open]_.disclosure-icon]:rotate-90`;
const workspaceDetailsDividerClass = "mt-3 border-t border-slate-200/90 pt-4";
const jobRecordsDetailsClass =
  `${workspacePanelClass} group rounded-2xl border-slate-200/80 bg-white p-2.5 text-gray-900 ring-1 ring-blue-100/40 transition-[border-color,background-color,box-shadow,transform] duration-150 hover:border-blue-200/80 hover:bg-white hover:shadow-[0_18px_40px_-34px_rgba(15,23,42,0.3)] sm:rounded-2xl sm:p-4 [&[open]_.disclosure-icon]:rotate-90 [&[open]]:border-blue-200/80 [&[open]]:xl:col-span-2 [&[open]]:2xl:col-span-3`;
const jobRecordsDetailsDividerClass = "mt-2 border-t border-slate-200/80 pt-2.5 sm:mt-3 sm:pt-4";
const recordLauncherClass =
  `${workspacePanelClass} group block rounded-2xl border-slate-200/80 bg-white p-2.5 text-left text-gray-900 ring-1 ring-blue-100/40 transition-[border-color,background-color,box-shadow,transform] duration-150 hover:border-blue-200/80 hover:bg-blue-50/20 hover:shadow-[0_18px_40px_-34px_rgba(15,23,42,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 sm:rounded-2xl sm:p-4`;
const recordPanelClass =
  "scroll-mt-24 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_18px_42px_-36px_rgba(15,23,42,0.3)] ring-1 ring-blue-100/40 sm:rounded-2xl sm:p-5";
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
  const mentionRecipientRaw = sp.mention_recipient;
  const mentionRecipientName =
    Array.isArray(mentionRecipientRaw)
      ? mentionRecipientRaw[0]
      : typeof mentionRecipientRaw === "string"
      ? mentionRecipientRaw
      : "";
  const mentionCountRaw = sp.mention_count;
  const mentionCountValue =
    Array.isArray(mentionCountRaw)
      ? mentionCountRaw[0]
      : typeof mentionCountRaw === "string"
      ? mentionCountRaw
      : "";
  const mentionCount = Number.parseInt(mentionCountValue, 10);
  const internalNoteBannerMessage =
    banner === "follow_up_note_added"
      ? "Follow-up note added."
      : banner === "internal_note_mention_alert_created"
      ? `Mention alert created for ${mentionRecipientName.trim() || "teammate"}.`
      : banner === "internal_note_mention_alerts_created"
      ? `Mention alerts created for ${Number.isFinite(mentionCount) && mentionCount > 0 ? mentionCount : 2} teammates.`
      : banner === "internal_note_mention_alert_failed"
      ? "Note saved, but mention alert could not be created."
      : banner === "note_add_failed"
      ? "Could not add note."
      : "";
  const internalNoteBannerType =
    banner === "note_add_failed"
      ? "error"
      : banner === "internal_note_mention_alert_failed"
      ? "warning"
      : "success";
  const assignmentBannerMessage =
    banner === "assignment_added"
      ? "Team member assigned to this job."
      : banner === "assignment_added_primary"
      ? "Team member assigned and set as primary."
      : banner === "assignment_primary_set"
      ? "Primary assignee updated."
      : banner === "assignment_removed"
      ? "Assignee removed from this job."
      : banner === "assignment_user_required"
      ? "Select a team member to assign."
      : "";
  const assignmentBannerType = banner === "assignment_user_required" ? "warning" : "success";
  const noteScopeRaw = sp.note_scope;
  const noteScope =
    Array.isArray(noteScopeRaw)
      ? noteScopeRaw[0]
      : typeof noteScopeRaw === "string"
      ? noteScopeRaw
      : "";
  const isSharedNoteBanner = noteScope === "shared";
  const sharedNoteBannerMessage =
    isSharedNoteBanner && banner === "note_added"
      ? "Shared note added."
      : isSharedNoteBanner && banner === "note_already_added"
      ? "That shared note was already added recently."
      : isSharedNoteBanner && banner === "note_add_failed"
      ? "Could not add shared note."
      : "";
  const sharedNoteBannerType = banner === "note_add_failed" ? "error" : "success";
  const workflowGuidanceBannerMessage =
    banner === "workflow_guidance_added"
      ? "Workflow guidance attached to this service case."
      : banner === "workflow_guidance_already_attached"
      ? "Workflow guidance is already attached to this service case."
      : banner === "workflow_guidance_service_case_required"
      ? "Workflow guidance requires a job attached to a service case."
      : banner === "workflow_guidance_permission_required"
      ? "Only owner/admin can attach workflow guidance."
      : banner === "workflow_guidance_add_failed"
      ? "Could not attach workflow guidance."
      : "";
  const workflowGuidanceBannerType =
    banner === "workflow_guidance_add_failed"
      ? "error"
      : banner === "workflow_guidance_permission_required" || banner === "workflow_guidance_service_case_required"
      ? "warning"
      : "success";

  const timingEnabled = process.env.JOB_DETAIL_TIMING_DEBUG === "true";
  const renderStartMs = Date.now();
  const phaseDurationsMs: Record<string, number> = {};

  const setPhaseValue = (phaseName: string, durationMs: number) => {
    if (!timingEnabled) return;
    phaseDurationsMs[phaseName] = durationMs;
  };

  const describePhaseError = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (error && typeof error === "object") {
      const candidate = error as {
        code?: unknown;
        message?: unknown;
        details?: unknown;
        hint?: unknown;
      };
      const code = String(candidate.code ?? "").trim();
      const message = String(candidate.message ?? "").trim();
      const details = String(candidate.details ?? "").trim();
      const hint = String(candidate.hint ?? "").trim();
      const parts = [
        code ? `code=${code}` : "",
        message ? `message=${message}` : "",
        details ? `details=${details}` : "",
        hint ? `hint=${hint}` : "",
      ].filter(Boolean);
      if (parts.length > 0) return parts.join(" | ");
      try {
        return JSON.stringify(error);
      } catch {
        return String(error);
      }
    }
    return String(error);
  };

  const timedPhase = async <T,>(phaseName: string, factory: () => Promise<T>) => {
    const startMs = timingEnabled ? Date.now() : 0;
    try {
      const value = await factory();
      if (timingEnabled) {
        setPhaseValue(phaseName, Date.now() - startMs);
      }
      return value;
    } catch (error) {
      if (timingEnabled) {
        setPhaseValue(phaseName, Date.now() - startMs);
      }
      const message = describePhaseError(error);
      const annotated = new Error(`[job-detail:${phaseName}] ${message}`);
      (annotated as any).cause = error;
      throw annotated;
    }
  };

  const recordBlockingPhase: TimingPhaseRecorder = (phaseName, durationMs) => {
    setPhaseValue(phaseName, durationMs);
  };

  const hasScheduleRequiredParam = (() => {
    const raw = sp.schedule_required;
    if (Array.isArray(raw)) return raw.some((v) => String(v ?? "").trim().length > 0);
    return String(raw ?? "").trim().length > 0;
  })();

  const tabLabel = ["info", "ops", "tests"].includes(String(tab)) ? String(tab) : "other";

  const emitTimingLog = (details: {
    invoicePanelActive: boolean;
    serviceCaseExists: boolean;
    timelineChainExists: boolean;
    actorKind: string;
  }) => {
    if (!timingEnabled) return;

    const totalRenderMs = Date.now() - renderStartMs;

    console.info(
      "[job-detail-timing]",
      JSON.stringify({
        jobId,
        routeLabels: {
          tab: tabLabel,
          hasNotice: Boolean(notice),
          hasBanner: Boolean(banner),
          hasScheduleRequired: hasScheduleRequiredParam,
          isEccNoticeBranch: showEccNotice,
          actorKind: details.actorKind,
          invoicePanelActive: details.invoicePanelActive,
          serviceCaseExists: details.serviceCaseExists,
          timelineChainExists: details.timelineChainExists,
        },
        phasesMs: {
          createClient: phaseDurationsMs.createClient ?? 0,
          authGetUser: phaseDurationsMs.authGetUser ?? 0,
          actorRoleResolution: phaseDurationsMs.actorRoleResolution ?? 0,
          sameAccountScopedJobBoundary: phaseDurationsMs.sameAccountScopedJobBoundary ?? 0,
          mainJobRead: phaseDurationsMs.mainJobRead ?? 0,
          contractorsRead: phaseDurationsMs.contractorsRead ?? 0,
          businessProfileReads: phaseDurationsMs.businessProfileReads ?? 0,
          assignmentDisplaySummary: phaseDurationsMs.assignmentDisplaySummary ?? 0,
          serviceChainSummary: phaseDurationsMs.serviceChainSummary ?? 0,
          timelineSummary: phaseDurationsMs.timelineSummary ?? 0,
          customerAttemptSummary: phaseDurationsMs.customerAttemptSummary ?? 0,
          undoEligibility: phaseDurationsMs.undoEligibility ?? 0,
          billingCustomerContractorReads: phaseDurationsMs.billingCustomerContractorReads ?? 0,
          immediateInvoiceTruthRead: phaseDurationsMs.immediateInvoiceTruthRead ?? 0,
          deferredInvoicePanelRead: phaseDurationsMs.deferredInvoicePanelRead ?? 0,
          eccPayloadReads: phaseDurationsMs.eccPayloadReads ?? 0,
          jobLocationPreviewBlocking: phaseDurationsMs.jobLocationPreviewBlocking ?? 0,
          serviceStatusActionsBlocking: phaseDurationsMs.serviceStatusActionsBlocking ?? 0,
          compositionPrep: phaseDurationsMs.compositionPrep ?? 0,
          totalServerRenderBeforeResponse: totalRenderMs,
        },
      }),
    );
  };

  const showEccNotice = notice === "ecc_test_required";
  const completionActionAttentionBanner =
    showEccNotice
      ? {
          title: "One step missing",
          message: (
            <>
              This is an <span className="font-semibold">ECC</span> job. Go to the{" "}
              <span className="font-semibold">Tests</span> tab and complete at least{" "}
              <span className="font-semibold">one ECC test run</span> before marking{" "}
              <span className="font-semibold">Field Work Complete</span>.
            </>
          ),
        }
      : banner === "status_update_failed"
      ? {
          title: "Could not complete field work",
          message: <>We could not update this job status. Refresh and try again.</>,
        }
      : null;

  const supabase = await timedPhase("createClient", () => createClient());

  const {
    data: { user },
  } = await timedPhase("authGetUser", () => supabase.auth.getUser());

  if (!user) redirect("/login");

  const actorResolution = await timedPhase("actorRoleResolution", () =>
    resolveJobDetailActor({
      supabase,
      userId: user.id,
    }),
  );

  if (actorResolution.kind === "contractor") {
    redirect(`/portal/jobs/${jobId}`);
  }

  if (actorResolution.kind === "unauthorized") {
    redirect("/login");
  }

  const internalUser = actorResolution.internalUser;
  const internalRole = String(internalUser.role ?? "").trim().toLowerCase();
  const canManageWorkflowGuidance = internalRole === "owner" || internalRole === "admin";
  const contractors = await timedPhase("contractorsRead", () =>
    getContractors(internalUser.account_owner_user_id),
  );

  let isInternalUser = true;
  let isInternalAdmin = false;
  let internalBusinessDisplayName = "";
  let billingMode: BillingMode = "external_billing";
  let productMode: ProductMode = "hybrid";

  isInternalAdmin = internalUser.role === "admin";
  const { internalBusinessIdentity, resolvedBillingMode, resolvedProductMode } = await timedPhase("businessProfileReads", async () => {
    const resolvedBusinessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });
    const resolvedBillingMode = await resolveBillingModeByAccountOwnerId({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });
    const resolvedProductMode = await resolveProductModeForAccountOwnerId({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });

    return {
      internalBusinessIdentity: resolvedBusinessIdentity,
      resolvedBillingMode,
      resolvedProductMode,
    };
  });
  internalBusinessDisplayName = internalBusinessIdentity.display_name;
  billingMode = resolvedBillingMode;
  productMode = resolvedProductMode;
  const explicitFieldBillingCapabilities = await timedPhase("fieldBillingExplicitCapabilitiesRead", () =>
    loadFieldBillingExplicitCapabilitiesForUser({
      supabase: supabase as any,
      accountOwnerUserId: internalUser.account_owner_user_id,
      internalUserId: user.id,
    }),
  );
  const fieldBillingCapabilities = resolveFieldBillingCapabilities({
    actorUserId: user.id,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    explicitCapabilities: explicitFieldBillingCapabilities,
  });

  // Explicit same-account internal scoped-job preflight: deny before main job-detail read assembly
  let scopedReadJob: { id?: string | null } | null = null;
  try {
    const scopedReadOutcome = await timedPhase("sameAccountScopedJobBoundary", () =>
      loadScopedInternalJobDetailReadBoundaryOutcome({
        accountOwnerUserId: internalUser.account_owner_user_id,
        jobId,
      }),
    );

    if (scopedReadOutcome.status === "ok") {
      scopedReadJob = scopedReadOutcome.job;
    } else if (scopedReadOutcome.status === "query_error") {
      console.error("[job-detail:sameAccountScopedJobBoundary] query_error fail-closed", {
        jobId,
        accountOwnerUserId: internalUser.account_owner_user_id,
        code: scopedReadOutcome.error.code,
        message: scopedReadOutcome.error.message,
        details: scopedReadOutcome.error.details,
      });
      scopedReadJob = null;
    } else {
      scopedReadJob = null;
    }
  } catch (error) {
    const boundaryErrorMessage =
      error instanceof Error
        ? error.message
        : (() => {
            try {
              return JSON.stringify(error);
            } catch {
              return String(error);
            }
          })();
    console.error("[job-detail:sameAccountScopedJobBoundary] fail-closed", {
      jobId,
      accountOwnerUserId: internalUser.account_owner_user_id,
      message: boundaryErrorMessage,
    });
    scopedReadJob = null;
  }
  if (!scopedReadJob?.id) {
    return notFound();
  }

  const { data: job, error: jobError } = await timedPhase("mainJobRead", async () =>
    supabase
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
      job_display_number,
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
        nickname,
        label,
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
        computed,
        computed_pass,
        override_pass,
        override_reason,
        created_at,
        updated_at
      )
    `)
      .eq("id", jobId)

      .single(),
  );

  if (jobError) throw jobError;
  if (!job) return notFound();
  if (job.deleted_at) redirect("/ops?saved=job_archived");
  setPhaseValue("eccPayloadReads", phaseDurationsMs.mainJobRead ?? 0);

  const parentJobId = (job as any).parent_job_id as string | null;
  const retestRootId = parentJobId ?? jobId;
  const serviceCaseId = (job as any).service_case_id as string | null;
  const contractorId = job.contractor_id ?? null;
  const customerId = job.customer_id ?? null;
  const estimatesEnabled = isEstimatesEnabled();
  const createEstimateFromJobHref = (() => {
    if (!estimatesEnabled || !customerId || !job.location_id || !job.id) return null;
    const params = new URLSearchParams({
      customer_id: String(customerId),
      location_id: String(job.location_id),
      origin_job_id: String(job.id),
    });
    if (serviceCaseId) {
      params.set("service_case_id", String(serviceCaseId));
    }
    return `/estimates/new?${params.toString()}`;
  })();

  const immediateInvoiceTruthPromise = timedPhase("immediateInvoiceTruthRead", async () => {
    if (!(isInternalUser && billingMode === "internal_invoicing")) {
      return {
        internalInvoiceTruth: null as {
          id: string;
          status: InternalInvoiceStatus;
          invoice_display_number: string | null;
          invoice_number: string;
          issued_at: string | null;
          total_cents: number;
          billing_name: string | null;
          billing_email: string | null;
          line_item_count: number;
        } | null,
      };
    }

    const { data: invoiceTruthRow, error: invoiceTruthErr } = await supabase
      .from("internal_invoices")
      .select("id, status, invoice_display_number, invoice_number, issued_at, total_cents, billing_name, billing_email")
      .eq("job_id", jobId)
      .eq("invoice_kind", "primary")
      .neq("status", "void")
      .maybeSingle();

    if (invoiceTruthErr) throw invoiceTruthErr;

    if (!invoiceTruthRow) {
      return {
        internalInvoiceTruth: null,
      };
    }

    const { count: lineItemCount, error: lineItemCountErr } = await supabase
      .from("internal_invoice_line_items")
      .select("id", { count: "exact", head: true })
      .eq("invoice_id", invoiceTruthRow.id);

    if (lineItemCountErr) throw lineItemCountErr;

    return {
      internalInvoiceTruth: {
        id: String(invoiceTruthRow.id),
        status: normalizeInternalInvoiceStatus(invoiceTruthRow.status),
        invoice_display_number: String(invoiceTruthRow.invoice_display_number ?? "").trim() || null,
        invoice_number: String(invoiceTruthRow.invoice_number ?? "").trim(),
        issued_at: invoiceTruthRow.issued_at ?? null,
        total_cents: Number(invoiceTruthRow.total_cents ?? 0) || 0,
        billing_name: String(invoiceTruthRow.billing_name ?? "").trim() || null,
        billing_email: String(invoiceTruthRow.billing_email ?? "").trim() || null,
        line_item_count: Number(lineItemCount ?? 0) || 0,
      },
    };
  });

  const assignmentDisplayPromise = timedPhase("assignmentDisplaySummary", async () => {
    return getActiveJobAssignmentDisplayMap({
      supabase,
      jobIds: [String(job.id ?? jobId)],
    });
  });

  const serviceCaseSummaryPromise = timedPhase("serviceChainSummary", async () => {
    const [{ data: serviceCase, error: serviceCaseErr }, { count: serviceCaseVisitCountRaw, error: serviceCaseVisitCountErr }] = await Promise.all([
      serviceCaseId
        ? supabase
            .from("service_cases")
            .select("id, case_kind")
            .eq("id", serviceCaseId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      serviceCaseId
        ? supabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("service_case_id", serviceCaseId)
            .is("deleted_at", null)
        : Promise.resolve({ count: 0, error: null }),
    ]);

    if (serviceCaseErr) throw new Error(serviceCaseErr.message);
    if (serviceCaseVisitCountErr) throw new Error(serviceCaseVisitCountErr.message);

    return {
      serviceCase,
      serviceCaseVisitCountRaw,
    };
  });

  // Slice 5D: only the cheap chain-job-ID discovery remains on the blocking path.
  // The 200-row job_events summary read has been removed from first-paint.
  // DeferredTimelineBody / DeferredSharedNotesBody / DeferredInternalNotesBody
  // remain authoritative and stream the full job_events corpus below the fold.
  const timelineSummaryPromise = timedPhase("timelineSummary", async () => {
    const { data: timelineJobs, error: timelineJobsErr } = await supabase
      .from("jobs")
      .select("id")
      .is("deleted_at", null)
      .or(`id.eq.${retestRootId},parent_job_id.eq.${retestRootId}`)
      .limit(50);

    if (timelineJobsErr) throw new Error(timelineJobsErr.message);

    const timelineJobIds = (timelineJobs ?? []).map((j: any) => String(j.id ?? "")).filter(Boolean);
    const hasDirectNarrativeChain = timelineJobIds.some((id) => id !== jobId);
    const narrativeScopeJobIds = timelineJobIds.length ? timelineJobIds : [jobId];

    return {
      timelineJobIds,
      hasDirectNarrativeChain,
      narrativeScopeJobIds,
    };
  });

  const noteCountSummaryPromise = timelineSummaryPromise.then((timelineSummary) =>
    timedPhase("noteCountSummary", async () => {
      const narrativeScopeJobIds = timelineSummary.narrativeScopeJobIds;

      const [sharedCountRes, internalCountRes] = await Promise.all([
        supabase
          .from("job_events")
          .select("id", { count: "exact", head: true })
          .in("job_id", narrativeScopeJobIds)
          .in("event_type", ["public_note", "contractor_note", "contractor_correction_submission"]),
        supabase
          .from("job_events")
          .select("id", { count: "exact", head: true })
          .in("job_id", narrativeScopeJobIds)
          .eq("event_type", "internal_note"),
      ]);

      if (sharedCountRes.error || internalCountRes.error) {
        return {
          sharedCount: 0,
          internalCount: 0,
          timelineNoteEventCount: 0,
        };
      }

      const sharedCount = Number(sharedCountRes.count ?? 0) || 0;
      const internalCount = Number(internalCountRes.count ?? 0) || 0;

      return {
        sharedCount,
        internalCount,
        timelineNoteEventCount: sharedCount + internalCount,
      };
    }),
  );

  const latestJobNotesPreviewPromise = timelineSummaryPromise.then((timelineSummary) =>
    timedPhase("latestJobNotesPreview", async () => {
      // Follow-up slice: Pinned Job Notes V1 (requires durable source-of-truth pin field).
      const narrativeScopeJobIds = timelineSummary.narrativeScopeJobIds;
      const previewEventTypes = job.job_type === "ecc"
        ? ["internal_note", "public_note", "contractor_note", "contractor_correction_submission"]
        : ["internal_note"];

      const { data: previewRows, error: previewRowsErr } = await supabase
        .from("job_events")
        .select("created_at, event_type, meta")
        .in("job_id", narrativeScopeJobIds)
        .in("event_type", previewEventTypes)
        .order("created_at", { ascending: false })
        .limit(3);

      if (previewRowsErr) return [] as Array<{ label: string; text: string; createdAt: string }>;

      return (previewRows ?? [])
        .map((row: any) => {
          const eventType = String(row?.event_type ?? "");
          const meta = row?.meta ?? {};
          const noteText = summarizePlainText(getEventNoteText(meta), 120);
          if (!noteText) return null;

          const label =
            job.job_type !== "ecc"
              ? "Note"
              : eventType === "internal_note"
              ? "Internal note"
              : eventType === "public_note"
              ? "Shared note"
              : eventType === "contractor_note"
              ? "Contractor note"
              : eventType === "contractor_correction_submission"
              ? "Correction note"
              : "Job note";

          return {
            label,
            text: noteText,
            createdAt: String(row?.created_at ?? "").trim(),
          };
        })
        .filter((item): item is { label: string; text: string; createdAt: string } => Boolean(item));
    }),
  );

  const customerAttemptSummaryPromise = timedPhase("customerAttemptSummary", async () => {
    try {
      const [attemptCountRes, latestAttemptRes] = await Promise.all([
        supabase
          .from("job_events")
          .select("id", { count: "exact", head: true })
          .eq("job_id", jobId)
          .eq("event_type", "customer_attempt"),
        supabase
          .from("job_events")
          .select("created_at")
          .eq("job_id", jobId)
          .eq("event_type", "customer_attempt")
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      if (attemptCountRes.error || latestAttemptRes.error) {
        return {
          attemptCount: null as number | null,
          lastAttemptLabel: "Recent attempts unavailable",
        };
      }

      const attemptCount = Number(attemptCountRes.count ?? 0) || 0;
      const latestAttempt = latestAttemptRes.data?.[0]?.created_at
        ? formatRecentAttemptDateTime(String(latestAttemptRes.data[0].created_at))
        : "";

      return {
        attemptCount,
        lastAttemptLabel: attemptCount > 0 && latestAttempt ? latestAttempt : "No recent attempts yet",
      };
    } catch {
      return {
        attemptCount: null as number | null,
        lastAttemptLabel: "Recent attempts unavailable",
      };
    }
  });

  const onTheWayUndoEligibilityPromise = timedPhase("undoEligibility", async () =>
    getOnTheWayUndoEligibility(jobId),
  );

  const jobRoleContactsPromise = listContactRecipientsForEntity({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    linkedEntityType: "job",
    linkedEntityId: jobId,
    limit: 100,
  }).catch(() => []);

  const customerRoleContactsPromise = customerId
    ? listContactRecipientsForEntity({
        supabase,
        accountOwnerUserId: internalUser.account_owner_user_id,
        linkedEntityType: "customer",
        linkedEntityId: customerId,
        limit: 100,
      }).catch(() => [])
    : Promise.resolve([]);

  const locationRoleContactsPromise = job.location_id
    ? listContactRecipientsForEntity({
        supabase,
        accountOwnerUserId: internalUser.account_owner_user_id,
        linkedEntityType: "location",
        linkedEntityId: String(job.location_id),
        limit: 100,
      }).catch(() => [])
    : Promise.resolve([]);

  const contractorBillingPromise = contractorId
    ? supabase
        .from("contractors")
        .select(
          "id, name, billing_name, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip"
        )
        .eq("id", contractorId)
        .maybeSingle()
    : Promise.resolve({ data: null });

  const customerBillingPromise = customerId
    ? supabase
        .from("customers")
        .select(
          "id, full_name, first_name, last_name, phone, email, billing_name, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip"
        )
        .eq("id", customerId)
        .maybeSingle()
    : Promise.resolve({ data: null });

  const billingPartyReadsPromise = () => timedPhase("billingCustomerContractorReads", async () => {
    const [contractorResult, customerResult] = await Promise.all([
      contractorBillingPromise,
      customerBillingPromise,
    ]);

    return {
      contractorBilling: contractorResult.data,
      customerBilling: customerResult.data,
    };
  });

  const visitScopePricebookTemplatesPromise = timedPhase("visitScopePricebookTemplatesRead", async () => {
    const { data: pricebookRows, error: pricebookRowsErr } = await supabase
      .from("pricebook_items")
      .select("id, item_name, item_type, category, default_description, default_unit_price, unit_label")
      .eq("account_owner_user_id", internalUser.account_owner_user_id)
      .eq("is_active", true)
      .order("item_name", { ascending: true });

    if (pricebookRowsErr) throw pricebookRowsErr;

    return (pricebookRows ?? [])
      .map((row: any) => ({
        id: String(row?.id ?? "").trim(),
        item_name: String(row?.item_name ?? "").trim(),
        item_type: String(row?.item_type ?? "").trim() || null,
        category: String(row?.category ?? "").trim() || null,
        default_description: String(row?.default_description ?? "").trim() || null,
        default_unit_price:
          row?.default_unit_price === null || row?.default_unit_price === undefined
            ? null
            : Number(row.default_unit_price),
        unit_label: String(row?.unit_label ?? "").trim() || null,
      }))
      .filter((row) => row.id && row.item_name);
  });

  const { internalInvoiceTruth } = await immediateInvoiceTruthPromise;
  const showInternalInvoicePanelForFieldBillingRead =
    isInternalUser &&
    buildJobBillingStateReadModel({
      billingMode,
      invoiceComplete: job.invoice_complete,
      internalInvoice: internalInvoiceTruth,
    }).internalInvoicePanelEnabled;

  const fieldBillingSummaryDataPromise = timedPhase("fieldBillingSummaryRead", async () => {
    if (!(showInternalInvoicePanelForFieldBillingRead && fieldBillingCapabilities.can_view_field_billing_summary)) {
      return {
        latestVoidedInternalInvoice: null as Awaited<ReturnType<typeof resolveLatestVoidedInternalInvoiceByJobId>> | null,
        supplementalInvoices: [] as Awaited<ReturnType<typeof resolveInternalInvoiceFamilySummaryByJobId>>["supplementalInvoices"],
        fieldChargeProposals: [] as Awaited<ReturnType<typeof listFieldChargeProposalsForJob>>,
      };
    }

    const fieldChargeProposals = await listFieldChargeProposalsForJob({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      jobId,
    }).catch((error) => {
      const wrapped = (error && typeof error === "object" ? error : {}) as {
        cause?: unknown;
        code?: unknown;
        details?: unknown;
        hint?: unknown;
      };
      const cause = (wrapped.cause && typeof wrapped.cause === "object" ? wrapped.cause : {}) as {
        code?: unknown;
        details?: unknown;
        hint?: unknown;
      };
      const message = error instanceof Error ? error.message : describePhaseError(error);
      const code = String(wrapped.code ?? cause.code ?? "").trim() || null;
      const details = String(wrapped.details ?? cause.details ?? "").trim() || null;
      const hint = String(wrapped.hint ?? cause.hint ?? "").trim() || null;

      console.error("[job-detail:fieldBillingSummaryRead] fieldChargeProposalsUnavailable", {
        jobId,
        accountOwnerUserId: internalUser.account_owner_user_id,
        code,
        message,
        details,
        hint,
      });

      return [] as Awaited<ReturnType<typeof listFieldChargeProposalsForJob>>;
    });

    const latestVoidedInternalInvoice = internalInvoiceTruth
      ? null
      : await resolveLatestVoidedInternalInvoiceByJobId({ supabase, jobId });
    const supplementalInvoices = await resolveInternalInvoiceFamilySummaryByJobId({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      jobId,
    }).then((family) => family.supplementalInvoices).catch((error) => {
      const wrapped = (error && typeof error === "object" ? error : {}) as {
        cause?: unknown;
        code?: unknown;
        details?: unknown;
        hint?: unknown;
      };
      const cause = (wrapped.cause && typeof wrapped.cause === "object" ? wrapped.cause : {}) as {
        code?: unknown;
        details?: unknown;
        hint?: unknown;
      };
      const message = error instanceof Error ? error.message : describePhaseError(error);
      const code = String(wrapped.code ?? cause.code ?? "").trim() || null;
      const details = String(wrapped.details ?? cause.details ?? "").trim() || null;
      const hint = String(wrapped.hint ?? cause.hint ?? "").trim() || null;

      console.error("[job-detail:fieldBillingSummaryRead] supplementalInvoicesUnavailable", {
        jobId,
        accountOwnerUserId: internalUser.account_owner_user_id,
        code,
        message,
        details,
        hint,
      });

      return [] as Awaited<ReturnType<typeof resolveInternalInvoiceFamilySummaryByJobId>>["supplementalInvoices"];
    });

    return {
      latestVoidedInternalInvoice,
      supplementalInvoices,
      fieldChargeProposals,
    };
  });

  const loadDeferredInvoicePanelData = async () => {
    const deferredStartMs = timingEnabled ? Date.now() : 0;
    try {
      if (!(isInternalUser && billingMode === "internal_invoicing")) {
        return {
          internalInvoice: null as Awaited<ReturnType<typeof resolveInternalInvoiceByJobId>>,
          latestVoidedInternalInvoice: null as Awaited<ReturnType<typeof resolveLatestVoidedInternalInvoiceByJobId>>,
          internalInvoiceEmailDeliveries: [] as InternalInvoiceEmailDeliveryRecord[],
          internalInvoicePaymentLedger: null as Awaited<ReturnType<typeof resolveInvoiceCollectedPaymentLedger>> | null,
          supplementalInvoices: [] as Awaited<ReturnType<typeof resolveInternalInvoiceFamilySummaryByJobId>>["supplementalInvoices"],
          fieldChargeProposals: [] as Awaited<ReturnType<typeof listFieldChargeProposalsForJob>>,
          pricebookPickerItems: [] as Array<{
            id: string;
            item_name: string;
            item_type: string;
            category: string | null;
            default_description: string | null;
            default_unit_price: number;
            unit_label: string | null;
          }>,
        };
      }

      const internalInvoice = await resolveInternalInvoiceByJobId({ supabase, jobId });
      const latestVoidedInternalInvoice = !internalInvoice
        ? await resolveLatestVoidedInternalInvoiceByJobId({ supabase, jobId })
        : null;
      const fieldChargeProposals = await listFieldChargeProposalsForJob({
        supabase,
        accountOwnerUserId: internalUser.account_owner_user_id,
        jobId,
      });
      const supplementalInvoices = await resolveInternalInvoiceFamilySummaryByJobId({
        supabase,
        accountOwnerUserId: internalUser.account_owner_user_id,
        jobId,
      }).then((family) => family.supplementalInvoices);

      if (!internalInvoice) {
        return {
          internalInvoice,
          latestVoidedInternalInvoice,
          internalInvoiceEmailDeliveries: [] as InternalInvoiceEmailDeliveryRecord[],
          internalInvoicePaymentLedger: null as Awaited<ReturnType<typeof resolveInvoiceCollectedPaymentLedger>> | null,
          supplementalInvoices,
          fieldChargeProposals,
          pricebookPickerItems: [] as Array<{
            id: string;
            item_name: string;
            item_type: string;
            category: string | null;
            default_description: string | null;
            default_unit_price: number;
            unit_label: string | null;
          }>,
        };
      }

      const [internalInvoiceEmailDeliveries, internalInvoicePaymentLedger, pricebookPickerItems] = await Promise.all([
        resolveInternalInvoiceEmailDeliveries({
          supabase,
          jobId,
          invoiceId: internalInvoice.id,
        }),
        resolveInvoiceCollectedPaymentLedger(
          internalUser.account_owner_user_id,
          internalInvoice.id,
          supabase,
        ),
        (async () => {
          if (!(billingMode === "internal_invoicing" && internalInvoice.status === "draft")) {
            return [] as Array<{
              id: string;
              item_name: string;
              item_type: string;
              category: string | null;
              default_description: string | null;
              default_unit_price: number;
              unit_label: string | null;
            }>;
          }

          const { data: pricebookRows, error: pricebookRowsErr } = await supabase
            .from("pricebook_items")
            .select("id, item_name, item_type, category, default_description, default_unit_price, unit_label")
            .eq("account_owner_user_id", internalUser.account_owner_user_id)
            .eq("is_active", true)
            .in("item_type", ["service", "material", "diagnostic"])
            .gte("default_unit_price", 0)
            .order("item_name", { ascending: true });

          if (pricebookRowsErr) throw pricebookRowsErr;

          return (pricebookRows ?? []).map((row: any) => ({
            id: String(row?.id ?? "").trim(),
            item_name: String(row?.item_name ?? "").trim(),
            item_type: String(row?.item_type ?? "").trim(),
            category: String(row?.category ?? "").trim() || null,
            default_description: String(row?.default_description ?? "").trim() || null,
            default_unit_price: Number(row?.default_unit_price ?? 0) || 0,
            unit_label: String(row?.unit_label ?? "").trim() || null,
          }));
        })(),
      ]);

      return {
        internalInvoice,
        latestVoidedInternalInvoice,
        internalInvoiceEmailDeliveries,
        internalInvoicePaymentLedger,
        supplementalInvoices,
        fieldChargeProposals,
        pricebookPickerItems,
      };
    } finally {
      if (timingEnabled) {
        const deferredElapsedMs = Date.now() - deferredStartMs;
        setPhaseValue("deferredInvoicePanelRead", deferredElapsedMs);
      }
    }
  };

  const [
    activeAssignmentDisplayMap,
    serviceCaseSummary,
    timelineSummary,
    noteCountSummary,
    latestJobNotesPreview,
    onTheWayUndoEligibility,
    billingPartyReads,
    visitScopePricebookTemplates,
    customerRoleContacts,
    locationRoleContacts,
    jobRoleContacts,
    customerAttemptSummary,
    fieldBillingSummaryData,
  ] = await Promise.all([
    assignmentDisplayPromise,
    serviceCaseSummaryPromise,
    timelineSummaryPromise,
    noteCountSummaryPromise,
    latestJobNotesPreviewPromise,
    onTheWayUndoEligibilityPromise,
    billingPartyReadsPromise(),
    visitScopePricebookTemplatesPromise,
    customerRoleContactsPromise,
    locationRoleContactsPromise,
    jobRoleContactsPromise,
    customerAttemptSummaryPromise,
    fieldBillingSummaryDataPromise,
  ]);

  const contractorBilling = billingPartyReads.contractorBilling;
  const customerBilling = billingPartyReads.customerBilling;
  const fieldBillingInvoiceSnapshot = internalInvoiceTruth
    ? {
        id: internalInvoiceTruth.id,
        status: internalInvoiceTruth.status as "draft" | "issued" | "void",
        invoiceNumber: internalInvoiceTruth.invoice_number,
        invoiceDisplayNumber: internalInvoiceTruth.invoice_display_number,
        totalCents: Number(internalInvoiceTruth.total_cents ?? 0) || 0,
        lineItemCount: Number(internalInvoiceTruth.line_item_count ?? 0) || 0,
      }
    : null;
  const fieldBillingLatestVoidedInvoiceSnapshot = fieldBillingSummaryData.latestVoidedInternalInvoice
    ? {
        id: fieldBillingSummaryData.latestVoidedInternalInvoice.id,
        status: "void" as const,
        invoiceNumber: fieldBillingSummaryData.latestVoidedInternalInvoice.invoice_number,
        invoiceDisplayNumber: fieldBillingSummaryData.latestVoidedInternalInvoice.invoice_display_number,
        totalCents: Number(fieldBillingSummaryData.latestVoidedInternalInvoice.total_cents ?? 0) || 0,
        lineItemCount: fieldBillingSummaryData.latestVoidedInternalInvoice.line_items?.length ?? 0,
      }
    : null;
  const fieldBillingSupplementalInvoiceSnapshots = fieldBillingSummaryData.supplementalInvoices.map((invoice) => ({
    id: invoice.id,
    invoiceDisplayNumber: invoice.invoice_display_number,
    invoiceNumber: invoice.invoice_number,
    status: invoice.status,
    totalCents: Number(invoice.total_cents ?? 0) || 0,
    balanceDueCents: Number(invoice.balance_due_cents ?? 0) || 0,
    supplementalReason: invoice.supplemental_reason,
    workspaceHref: `/jobs/${job.id}/invoice#supplemental-invoices`,
  }));
  const fieldChargeProposalPricebookItems = visitScopePricebookTemplates
    .filter((item) => {
      const itemType = String(item.item_type ?? "").trim().toLowerCase();
      const unitPrice = Number(item.default_unit_price ?? 0);
      return ["service", "material", "diagnostic"].includes(itemType) && Number.isFinite(unitPrice) && unitPrice >= 0;
    })
    .map((item) => ({
      id: item.id,
      item_name: item.item_name,
      item_type: item.item_type,
      category: item.category,
      default_description: item.default_description,
      default_unit_price: item.default_unit_price,
      unit_label: item.unit_label,
    }));
  const compositionPrepStartedAt = Date.now();

  const assignedTeam =
    activeAssignmentDisplayMap[String(job.id ?? jobId)] ?? [];

  const assignedUserIds = assignedTeam
    .map((row) => String(row.user_id ?? "").trim())
    .filter(Boolean);

  const { serviceCase, serviceCaseVisitCountRaw } = serviceCaseSummary;
  const {
    timelineJobIds,
    hasDirectNarrativeChain,
    narrativeScopeJobIds,
  } = timelineSummary;

  // Slice 5D: contractor response label is deferred — no first-paint job_events read.
  // ContractorReportPanel generate/send actions are unchanged.
  const contractorResponseLabel: string | null = null;
  const contractorResponseSubLabel: string | null = null;

  const attemptCount: number | null = customerAttemptSummary.attemptCount;
  const lastAttemptLabel = customerAttemptSummary.lastAttemptLabel;

  const customerName =
  (customerBilling?.full_name ||
    customerBilling?.billing_name ||
    [customerBilling?.first_name, customerBilling?.last_name].filter(Boolean).join(" ").trim() ||
    [job.customer_first_name, job.customer_last_name].filter(Boolean).join(" ").trim() ||
    "—");

  const customerDisplayName = formatPersonNamePart(customerName);
  const customerPhone =
    customerBilling?.phone ?? job.customer_phone ?? "—";

  const customerEmail =
    customerBilling?.email ?? job.customer_email ?? "—";

  const firstNonEmpty = (...values: Array<unknown>) => {
    for (const v of values) {
      const s = String(v ?? "").trim();
      if (s) return s;
    }
    return null;
  };

  const roleContactSections = buildInternalJobRoleContactSections({
    customerLinkedContacts: customerRoleContacts,
    jobLinkedContacts: jobRoleContacts,
  });

  const allRoleContacts = [...jobRoleContacts, ...locationRoleContacts, ...customerRoleContacts];
  const siteAccessRolePriority = new Map<string, number>([
    ["site_access_contact", 0],
    ["tenant_or_occupant", 1],
    ["responsible_party", 2],
    ["homeowner", 3],
  ]);
  const siteAccessEntityPriority = new Map<string, number>([
    ["job", 0],
    ["location", 1],
    ["customer", 2],
  ]);

  const siteAccessCandidates = allRoleContacts
    .filter((contact) => String(contact.status ?? "").trim().toLowerCase() !== "inactive")
    .filter((contact) => {
      const role = String(contact.recipient_role ?? "").trim().toLowerCase();
      return siteAccessRolePriority.has(role);
    })
    .sort((left, right) => {
      const leftRole = String(left.recipient_role ?? "").trim().toLowerCase();
      const rightRole = String(right.recipient_role ?? "").trim().toLowerCase();
      const leftRoleRank = siteAccessRolePriority.get(leftRole) ?? 99;
      const rightRoleRank = siteAccessRolePriority.get(rightRole) ?? 99;

      if (leftRoleRank !== rightRoleRank) return leftRoleRank - rightRoleRank;

      const leftEntity = String(left.linked_entity_type ?? "").trim().toLowerCase();
      const rightEntity = String(right.linked_entity_type ?? "").trim().toLowerCase();
      const leftEntityRank = siteAccessEntityPriority.get(leftEntity) ?? 99;
      const rightEntityRank = siteAccessEntityPriority.get(rightEntity) ?? 99;

      if (leftEntityRank !== rightEntityRank) return leftEntityRank - rightEntityRank;

      return String(left.display_name ?? "").localeCompare(String(right.display_name ?? ""));
    });

  const primarySiteAccessContact: ContactRecipientRow | null =
    siteAccessCandidates.find((contact) => String(contact.display_name ?? "").trim().length > 0) ??
    siteAccessCandidates[0] ??
    null;

  const primarySiteAccessName = String(primarySiteAccessContact?.display_name ?? "").trim();
  const primarySiteAccessPhone = String(primarySiteAccessContact?.phone_e164 ?? "").trim();
  const primarySiteAccessEmail = String(primarySiteAccessContact?.email ?? "").trim();
  const hasSeparateSiteAccessContact = Boolean(
    primarySiteAccessName || primarySiteAccessPhone || primarySiteAccessEmail,
  );
  const normalizeCompareText = (value?: string | null) => String(value ?? "").trim().toLowerCase();
  const normalizeComparePhone = (value?: string | null) => String(value ?? "").replace(/\D/g, "");
  const accountNameForCompare = normalizeCompareText(customerDisplayName);
  const accountPhoneForCompare = customerPhone === "—" ? "" : customerPhone;
  const accountEmailForCompare = customerEmail === "—" ? "" : customerEmail;
  const siteAccessMatchesAccount =
    hasSeparateSiteAccessContact &&
    (!primarySiteAccessName || normalizeCompareText(primarySiteAccessName) === accountNameForCompare) &&
    (!primarySiteAccessPhone ||
      normalizeComparePhone(primarySiteAccessPhone) === normalizeComparePhone(accountPhoneForCompare)) &&
    (!primarySiteAccessEmail || normalizeCompareText(primarySiteAccessEmail) === normalizeCompareText(accountEmailForCompare));
  const showSiteAccessCard = hasSeparateSiteAccessContact && !siteAccessMatchesAccount;

  const billingRecipientType = String((job as any).billing_recipient ?? "").trim().toLowerCase();
  const isContractorBillingRecipient = billingRecipientType === "contractor";
  const billingRecipientName = String((job as any).billing_name ?? "").trim();
  const billingRecipientEmail = String((job as any).billing_email ?? "").trim();
  const billingRecipientPhone = String((job as any).billing_phone ?? "").trim();
  const billingRecipientAddressParts = formatBillingAddress({
    billing_address_line1: (job as any).billing_address_line1,
    billing_address_line2: (job as any).billing_address_line2,
    billing_city: (job as any).billing_city,
    billing_state: (job as any).billing_state,
    billing_zip: (job as any).billing_zip,
  });
  const billingRecipientAddress = billingRecipientAddressParts.join(", ");
  const hasBillingSnapshotFields = Boolean(
    billingRecipientName || billingRecipientEmail || billingRecipientPhone || billingRecipientAddress,
  );
  const billingSnapshotDiffersFromAccount = Boolean(
    (billingRecipientName && normalizeCompareText(billingRecipientName) !== accountNameForCompare) ||
      (billingRecipientEmail &&
        normalizeCompareText(billingRecipientEmail) !== normalizeCompareText(accountEmailForCompare)) ||
      (billingRecipientPhone &&
        normalizeComparePhone(billingRecipientPhone) !== normalizeComparePhone(accountPhoneForCompare)) ||
      billingRecipientAddress,
  );
  const hasJobBillingRecipient = Boolean(
    isContractorBillingRecipient || hasBillingSnapshotFields || billingSnapshotDiffersFromAccount,
  );
  const accountBillingContact = customerRoleContacts.find((contact) => {
    const role = String(contact.recipient_role ?? "").trim().toLowerCase();
    const status = String(contact.status ?? "").trim().toLowerCase();
    if (role !== "billing_contact") return false;
    if (status === "inactive") return false;
    return true;
  }) ?? null;
  const accountBillingContactName = String(accountBillingContact?.display_name ?? "").trim();
  const accountBillingContactEmail = String(accountBillingContact?.email ?? "").trim();
  const accountBillingContactPhone = String(accountBillingContact?.phone_e164 ?? "").trim();
  const hasAccountBillingContact = Boolean(
    accountBillingContactName || accountBillingContactEmail || accountBillingContactPhone,
  );

  const resolvedContractorName =
    contractors?.find((c: any) => c.id === contractorId)?.name ??
    String(contractorBilling?.name ?? "").trim();

  const contractorName = contractorId
    ? (resolvedContractorName || "Assigned contractor")
    : null;
  const billingRecipientDisplayName = isContractorBillingRecipient
    ? (contractorName || "Contractor")
    : billingRecipientName;
  const showBillingRecipientCard = hasJobBillingRecipient || hasAccountBillingContact;
  const contractorNameForCompare = normalizeCompareText(contractorName);
  const billingRecipientNameForCompare = normalizeCompareText(billingRecipientDisplayName);
  const contractorBillingSameEntity = Boolean(
    contractorNameForCompare &&
    billingRecipientNameForCompare &&
    contractorNameForCompare === billingRecipientNameForCompare,
  );
  const showCombinedContractorBillingCard = Boolean(
    contractorId &&
    showBillingRecipientCard &&
    hasJobBillingRecipient &&
    contractorBillingSameEntity,
  );

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

  const mobilePrimaryPhone = customerPhone !== "—" ? customerPhone : primarySiteAccessPhone || "";
  const mobilePrimaryPhoneDigits = mobilePrimaryPhone.replace(/\D/g, "");
  const mobileCallHref = mobilePrimaryPhoneDigits ? `tel:${mobilePrimaryPhoneDigits}` : null;
  const mobileTextHref = mobilePrimaryPhoneDigits ? `sms:${mobilePrimaryPhoneDigits}` : null;
  const mobileNavigateHref =
    serviceAddressDisplay !== "No address set"
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(serviceAddressDisplay)}`
      : null;

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
      : "No time window set";

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
const normalizedJobStatus = String(job.status ?? "").trim().toLowerCase();
const normalizedOpsStatus = String(job.ops_status ?? "").trim().toLowerCase();
const isJobArchived = Boolean(job.deleted_at) || normalizedOpsStatus === "archived";
const isJobClosed = normalizedOpsStatus === "closed";
const isJobCancelled = normalizedJobStatus === "cancelled";
const showFieldOutcomePanel =
  !isJobClosed &&
  !isJobCancelled &&
  !isJobArchived &&
  !isFieldComplete &&
  normalizedJobStatus === "in_process";
const callbackIntakeHistoricalAnchorEligible =
  isFieldComplete ||
  normalizedJobStatus === "completed" ||
  normalizedOpsStatus === "closed";
const normalizedServiceVisitType = String(job.service_visit_type ?? "").trim().toLowerCase();
const showDifferentIssueFoundOutcome =
  normalizedServiceVisitType === "callback" || normalizedServiceVisitType === "return_visit";
const workflowChipLabel =
  normalizedJobStatus === "in_process" && !isFieldComplete
    ? "In Process"
    : formatOpsStatusLabel(job.ops_status);

const isFailedUnresolved =
  ["failed", "retest_needed", "pending_office_review"].includes(String(job.ops_status ?? ""));

const billingState = buildJobBillingStateReadModel({
  billingMode,
  invoiceComplete: job.invoice_complete,
  internalInvoice: internalInvoiceTruth,
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

const hasDirectInvoiceWorkflowAccess = hasDirectInvoiceDraftMutationAccess(fieldBillingCapabilities);
const canIssueInvoiceLifecycleAccess = hasInvoiceIssueAccess(fieldBillingCapabilities);
const canSendInvoiceLifecycleAccess = hasInvoiceSendAccess(fieldBillingCapabilities);
const hasProposalEntryWorkflowAccess =
  !hasDirectInvoiceWorkflowAccess
  && (fieldBillingCapabilities.can_select_pricebook_lines || fieldBillingCapabilities.can_convert_visit_scope_to_invoice_line);

const maintenanceAgreementsEnabled = isMaintenanceAgreementsEnabled();
let markVisitCountedLinkId: string | null = null;
let markVisitCountedAgreementName: string | null = null;
let suggestedNextDueProjection: {
  agreementName: string;
  agreementId: string;
  suggestedNextDueDate: string | null;
  baselineNextDueDate: string | null;
  manualSchedulingRequired: boolean;
  seasonalWindowPlaceholder: string;
} | null = null;
let confirmedNextDueContext: {
  agreementName: string;
  confirmedNextDueDate: string | null;
  baselineNextDueDate: string | null;
} | null = null;

if (maintenanceAgreementsEnabled && job.job_type === "service") {
  const maintenanceLinks = await listMaintenanceAgreementLinksForJob({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId: String(job.id ?? ""),
    limit: 25,
  });

  let suggestedAgreementId: string | null = null;
  let suggestedCompletionDate: string | null = null;
  let countedLinkConfirmedNextDueDate: string | null = null;
  let countedLinkBaselineNextDueDate: string | null = null;
  let countedLinkAlreadyConfirmed = false;

  if (maintenanceLinks.length > 0) {
    const newestCountedLink = maintenanceLinks.find((link) => {
      const countStatus = String(link.count_status ?? "").trim().toLowerCase();
      return countStatus === "counted" && Boolean(link.counts_toward_visit_balance);
    });

    if (newestCountedLink) {
      suggestedAgreementId = String(newestCountedLink.agreement_id ?? "").trim() || null;
      suggestedCompletionDate = String(newestCountedLink.counted_at ?? "").trim().slice(0, 10) || null;
      countedLinkConfirmedNextDueDate =
        String(newestCountedLink.confirmed_next_due_date ?? "").trim() || null;
      countedLinkBaselineNextDueDate =
        String(newestCountedLink.baseline_next_due_date ?? "").trim() || null;
      countedLinkAlreadyConfirmed = hasMaintenanceAgreementVisitConfirmedNextDue(newestCountedLink);
    }

    for (const link of maintenanceLinks) {
      if (suggestedAgreementId) {
        break;
      }

      const countStatus = String(link.count_status ?? "").trim().toLowerCase();
      const countReviewLabel = projectMaintenanceAgreementVisitCountReview({
        link: {
          count_status: link.count_status,
          counts_toward_visit_balance: link.counts_toward_visit_balance,
        },
        job: {
          id: String(job.id ?? ""),
          status: job.status,
          ops_status: job.ops_status,
          job_type: job.job_type,
          field_complete: job.field_complete,
          service_visit_type: job.service_visit_type,
          service_visit_outcome: job.service_visit_outcome,
        },
      });

      if (
        (countStatus === "linked" || countStatus === "eligible") &&
        !Boolean(link.counts_toward_visit_balance) &&
        countReviewLabel === "eligible_for_count_review"
      ) {
        markVisitCountedLinkId = String(link.id ?? "").trim() || null;
        markVisitCountedAgreementName = "Service Plan";
        break;
      }
    }
  }

  if (suggestedAgreementId) {
    const { data: suggestedAgreement } = await supabase
      .from("maintenance_agreements")
      .select("id, agreement_name, frequency, next_due_date")
      .eq("account_owner_user_id", internalUser.account_owner_user_id)
      .eq("id", suggestedAgreementId)
      .maybeSingle();

    if (suggestedAgreement?.id) {
      const projection = projectMaintenanceAgreementSuggestedNextDue({
        frequency: String(suggestedAgreement.frequency ?? ""),
        nextDueDate: String(suggestedAgreement.next_due_date ?? ""),
        countedCompletionDate: suggestedCompletionDate,
      });

      suggestedNextDueProjection = {
        agreementName: String(suggestedAgreement.agreement_name ?? "").trim() || "Service Plan",
        agreementId: String(suggestedAgreement.id ?? "").trim(),
        suggestedNextDueDate: projection.suggested_next_due_date,
        baselineNextDueDate: String(suggestedAgreement.next_due_date ?? "").trim(),
        manualSchedulingRequired: projection.manual_scheduling_required,
        seasonalWindowPlaceholder: projection.seasonal_window_placeholder,
      };

      if (countedLinkAlreadyConfirmed) {
        confirmedNextDueContext = {
          agreementName: suggestedNextDueProjection.agreementName,
          confirmedNextDueDate: countedLinkConfirmedNextDueDate,
          baselineNextDueDate: countedLinkBaselineNextDueDate,
        };
      }
    }
  }
}

const visitScopeSummary = sanitizeVisitScopeSummary((job as any).visit_scope_summary);
let visitScopeItems = [] as Array<{
  id?: string;
  title: string;
  details: string | null;
  kind: "primary" | "companion_service";
  source_pricebook_item_id?: string | null;
  expected_unit_price?: number | null;
  unit_label?: string | null;
  item_type?: string | null;
  category?: string | null;
  promoted_service_job_id?: string | null;
  promoted_at?: string | null;
  promoted_by_user_id?: string | null;
}>;
try {
  visitScopeItems = sanitizeVisitScopeItems((job as any).visit_scope_items ?? []);
} catch {
  visitScopeItems = [];
}
const fieldChargeProposalVisitScopeItems = visitScopeItems.map((item) => ({
  id: item.id,
  title: item.title,
  details: item.details,
}));
const visitScopeItemsJsonForInlineEdit = JSON.stringify(visitScopeItems);
  setPhaseValue("compositionPrep", Date.now() - compositionPrepStartedAt);
const visitScopeCount = visitScopeItems.length;
const hasVisitScopeDefined = Boolean(visitScopeSummary) || visitScopeCount > 0;
const visitScopeHeaderPreview = buildVisitScopeReadModel(visitScopeSummary, visitScopeItems, {
  leadMaxLength: 110,
  previewItemCount: 1,
  previewItemMaxLength: 34,
});
const primaryVisitScopeItems = visitScopeItems.filter((item) => item.kind === "primary");
const companionVisitScopeItems = visitScopeItems.filter((item) => item.kind === "companion_service");
const visitScopeReadyTotalCents = visitScopeItems.reduce((sum, item) => {
  const unitPrice = Number(item.expected_unit_price ?? 0);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return sum;
  return sum + Math.round(unitPrice * 100);
}, 0);
const visitScopeLeadText = visitScopeSummary || visitScopeHeaderPreview.lead;
const visitScopeBadgeItems = primaryVisitScopeItems.length > 0 ? primaryVisitScopeItems : visitScopeItems;
const visitScopeBadgeItemCount = visitScopeBadgeItems.length;
const visitScopeBadgeFirstTitle = visitScopeBadgeItems[0]?.title ?? "";
const visitScopeBadgeMainText = visitScopeBadgeItemCount > 0
  ? `${visitScopeBadgeItemCount} item${visitScopeBadgeItemCount === 1 ? "" : "s"} · ${visitScopeBadgeFirstTitle}${visitScopeBadgeItemCount > 1 ? ` + ${visitScopeBadgeItemCount - 1} more` : ""}`
  : "No work items yet";

const jobPageInvoiceDisplayReference = internalInvoiceTruth
  ? formatInvoiceDisplayReference({
      invoiceDisplayNumber: internalInvoiceTruth.invoice_display_number,
      invoiceNumber: internalInvoiceTruth.invoice_number,
      invoiceId: internalInvoiceTruth.id,
    })
  : null;
const jobPageInvoiceStateLabel = internalInvoiceTruth
  ? internalInvoiceTruth.status === "draft"
    ? "Draft Invoice"
    : internalInvoiceTruth.status === "issued"
      ? billingState.billedTruthSatisfied
        ? "Paid Invoice"
        : "Issued Invoice"
      : "Invoice"
  : hasVisitScopeDefined
    ? "Ready to build invoice"
    : "Add work items first";
const jobPageInvoiceNextAction = !internalInvoiceTruth
  ? "Build Invoice"
  : internalInvoiceTruth.status === "draft"
    ? "Review Invoice"
    : billingState.billedTruthSatisfied
      ? "View Invoice"
      : "Collect Payment";
const jobPageInvoiceSummaryText = internalInvoiceTruth
  ? `${jobPageInvoiceDisplayReference} - ${internalInvoiceTruth.line_item_count} charge${internalInvoiceTruth.line_item_count === 1 ? "" : "s"} - ${formatCurrencyFromCents(internalInvoiceTruth.total_cents)}`
  : hasVisitScopeDefined
    ? `${visitScopeCount} work item${visitScopeCount === 1 ? "" : "s"} ready to price and review.`
    : "Add work performed, then price it before building the invoice.";
const showSeparateFieldBillingDetails =
  showInternalInvoicePanel &&
  (
    !hasDirectInvoiceWorkflowAccess ||
    fieldBillingSummaryData.fieldChargeProposals.length > 0 ||
    fieldBillingSupplementalInvoiceSnapshots.length > 0
  );

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

const accountPhoneDigits = customerPhone !== "—" ? digitsOnly(customerPhone) : "";
const accessPhoneDigits = primarySiteAccessPhone ? digitsOnly(primarySiteAccessPhone) : "";
const hasSeparateAccessPhone = Boolean(accessPhoneDigits && accessPhoneDigits !== accountPhoneDigits);

const telLink =
  customerPhone !== "—" && accountPhoneDigits
    ? `tel:${accountPhoneDigits}`
    : "";

const accountEmailLink =
  customerEmail !== "—"
    ? `mailto:${customerEmail}`
    : "";

const accessTelLink = hasSeparateAccessPhone ? `tel:${accessPhoneDigits}` : "";

const permitNumber = String(job.permit_number ?? "").trim();
const permitJurisdiction = String((job as any).jurisdiction ?? "").trim();
const permitDateValue = String((job as any).permit_date ?? "").trim();
const permitDateLabel = permitDateValue ? formatTimestampDateDisplayLA(permitDateValue) : "";
const permitDetailCount = Number(Boolean(permitNumber)) + Number(Boolean(permitJurisdiction)) + Number(Boolean(permitDateValue));
const hasPermitDetails = permitDetailCount > 0;
const permitSummaryLabel = hasPermitDetails
  ? `${permitDetailCount} of 3 fields`
  : "Not recorded";

const serviceCaseVisitCount = serviceCaseVisitCountRaw ?? 0;
const equipmentItems = Array.isArray(job.job_equipment) ? job.job_equipment : [];
const equipmentCount = equipmentItems.length;
const eccRuns = Array.isArray(job.ecc_test_runs) ? job.ecc_test_runs : [];
const eccRunCount = eccRuns.length;
const latestEccRun = eccRuns.reduce((latest: any | null, run: any) => {
  if (!latest) return run;
  const latestMs = toTimestampMs(String(latest?.updated_at ?? latest?.created_at ?? ""));
  const runMs = toTimestampMs(String(run?.updated_at ?? run?.created_at ?? ""));
  return runMs > latestMs ? run : latest;
}, null);
const latestEccRunResultLabel = latestEccRun ? formatLatestEccRunResultLabel(latestEccRun) : "";
const latestEccRunDateLabel = latestEccRun
  ? formatTimestampDateDisplayLA(String(latestEccRun.updated_at ?? latestEccRun.created_at ?? ""))
  : "";


const followUpOwnerLabel = String((job as any).action_required_by ?? "").trim();
const followUpDateValue = String((job as any).follow_up_date ?? "").trim();
const followUpDateSummary = followUpDateValue ? formatTimestampDateDisplayLA(followUpDateValue) : "";
const nextActionPreview = truncateSummaryText(String((job as any).next_action_note ?? ""), 78);
const isEccJobType = job.job_type === "ecc";
const rightRailNoteCount = isEccJobType ? noteCountSummary.timelineNoteEventCount : noteCountSummary.internalCount;
const rightRailNotesTitle = isEccJobType ? "Shared Notes" : "Job Notes";
const rightRailNotesSubtitle = isEccJobType
  ? "Latest shared/internal note activity."
  : "Latest job note activity.";
const rightRailNotesEmptyText = isEccJobType ? "No shared or internal notes yet." : "No notes yet.";
const hasAnyRightRailNotes = latestJobNotesPreview.length > 0;
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
const followUpHistorySummaryText = undefined;
const serviceChainSummaryText = serviceCaseId
  ? "Visit history across the linked service case."
  : "No linked service case yet.";
// Slice 5D: section titles still use chain metadata (cheap); counts/dates deferred.
const sharedNotesTitle = hasDirectNarrativeChain ? "Shared Notes Across Job Chain" : "Shared Notes";
const internalNotesTitle = hasDirectNarrativeChain ? "Internal Notes Across Job Chain" : "Internal Notes";
const timelineTitle = hasDirectNarrativeChain ? "Job Chain Timeline" : "Timeline";
const isHvacServiceMode = productMode === "hvac_service";
const jobTitleText = normalizeRetestLinkedJobTitle(job.title);
const serviceVisitReasonText = String(job.service_visit_reason ?? "").trim();
const jobNotesText = String(job.job_notes ?? "").trim();
const fieldHeaderTitle =
  firstNonEmpty(
    customerDisplayName !== "—" ? customerDisplayName : "",
    primarySiteAccessName,
    jobTitleText,
  ) ?? "Job Detail";
const jobWorkbenchTitle = firstNonEmpty(jobTitleText, visitScopeLeadText, fieldHeaderTitle) ?? "Job Detail";
const jobWorkbenchAccountLabel =
  normalizeCompareText(fieldHeaderTitle) !== normalizeCompareText(jobWorkbenchTitle)
    ? fieldHeaderTitle
    : customerDisplayName !== "—"
    ? customerDisplayName
    : "";
const jobHeaderReference = formatJobDisplayReference({
  jobDisplayNumber: (job as { job_display_number?: string | null }).job_display_number,
  jobId: job.id,
});
const visitReasonText =
  firstNonEmpty(serviceVisitReasonText, jobTitleText, visitScopeLeadText) ??
  "No visit reason saved yet.";
const shouldShowCustomerConcern =
  Boolean(jobTitleText) && normalizeCompareText(jobTitleText) !== normalizeCompareText(visitReasonText);
const shouldShowWorkSummary =
  Boolean(visitScopeSummary) &&
  normalizeCompareText(visitScopeSummary) !== normalizeCompareText(visitReasonText) &&
  normalizeCompareText(visitScopeSummary) !== normalizeCompareText(jobNotesText);
const shouldShowIntakeNotes =
  Boolean(jobNotesText) &&
  normalizeCompareText(jobNotesText) !== normalizeCompareText(visitReasonText);
const headerJobTypeLabel = String(job.job_type ?? "service")
  .split("_")
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
  .join(" ");
const showSharedNotesCard = !isHvacServiceMode;
const showEccSummaryCard = job.job_type === "ecc";
const showJobRecordsPermitCard = showEccSummaryCard || hasPermitDetails;
const lowerGridCardCount =
  7 +
  (showSharedNotesCard ? 1 : 0) +
  1 +
  (showEccSummaryCard ? 1 : 0) +
  (showJobRecordsPermitCard ? 1 : 0);
const lowerGridHasOrphan = lowerGridCardCount % 2 === 1;
const sharedNotesCardClass = `${jobRecordsDetailsClass}${lowerGridHasOrphan && showSharedNotesCard && !showEccSummaryCard ? " xl:col-span-2" : ""}`;
const serviceChainCardClass = `${jobRecordsDetailsClass}${lowerGridHasOrphan && !showSharedNotesCard && !showEccSummaryCard ? " xl:col-span-2" : ""}`;
const sharedNotesMeta = noteCountSummary.sharedCount
  ? `${noteCountSummary.sharedCount} note${noteCountSummary.sharedCount === 1 ? "" : "s"}`
  : undefined;
const internalNotesMeta = noteCountSummary.internalCount
  ? `${noteCountSummary.internalCount} note${noteCountSummary.internalCount === 1 ? "" : "s"}`
  : undefined;
const timelineNotesMeta = noteCountSummary.timelineNoteEventCount
  ? `${noteCountSummary.timelineNoteEventCount} note${noteCountSummary.timelineNoteEventCount === 1 ? "" : "s"}`
  : undefined;
const sharedNotesSummaryText = undefined;
const internalNotesSummaryText = undefined;
const timelineSummaryText = undefined;

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

  const DeferredInternalInvoicePanel = async () => {
    const {
      internalInvoice,
      latestVoidedInternalInvoice,
      internalInvoiceEmailDeliveries,
      internalInvoicePaymentLedger,
      supplementalInvoices,
      fieldChargeProposals,
      pricebookPickerItems,
    } = await loadDeferredInvoicePanelData();

    const showReplacementInvoicePrompt =
      showInternalInvoicePanel &&
      !internalInvoice &&
      !!latestVoidedInternalInvoice;

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
          expected_unit_price?: number | null;
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
          expectedUnitPrice: sanitizedRow.expected_unit_price ?? null,
          alreadyAdded: existingVisitScopeInvoiceSourceIds.has(persistedItemId),
        };
      })
      .filter(Boolean) as Array<{
        id: string;
        title: string;
        details: string | null;
        kind: "primary" | "companion_service";
        expectedUnitPrice: number | null;
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
      internalInvoiceEmailDeliveries.find((delivery: InternalInvoiceEmailDeliveryRecord) => delivery.status === "sent") ?? null;
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
    const fieldBillingInvoiceSnapshot = internalInvoice
      ? {
          id: internalInvoice.id,
          status: internalInvoice.status as "draft" | "issued" | "void",
          invoiceNumber: internalInvoice.invoice_number,
          invoiceDisplayNumber: internalInvoice.invoice_display_number,
          totalCents: Number(internalInvoice.total_cents ?? 0) || 0,
          lineItemCount: internalInvoiceLineItemCount,
        }
      : null;
    const fieldBillingLatestVoidedInvoiceSnapshot = latestVoidedInternalInvoice
      ? {
          id: latestVoidedInternalInvoice.id,
          status: "void" as const,
          invoiceNumber: latestVoidedInternalInvoice.invoice_number,
          invoiceDisplayNumber: latestVoidedInternalInvoice.invoice_display_number,
          totalCents: Number(latestVoidedInternalInvoice.total_cents ?? 0) || 0,
          lineItemCount: latestVoidedInternalInvoice.line_items?.length ?? 0,
        }
      : null;
    const fieldBillingSupplementalInvoiceSnapshots = supplementalInvoices.map((invoice) => ({
      id: invoice.id,
      invoiceDisplayNumber: invoice.invoice_display_number,
      invoiceNumber: invoice.invoice_number,
      status: invoice.status,
      totalCents: Number(invoice.total_cents ?? 0) || 0,
      balanceDueCents: Number(invoice.balance_due_cents ?? 0) || 0,
      supplementalReason: invoice.supplemental_reason,
      workspaceHref: `/jobs/${job.id}/invoice#supplemental-invoices`,
    }));
    const fieldChargeProposalPricebookItems = visitScopePricebookTemplates
      .filter((item) => {
        const itemType = String(item.item_type ?? "").trim().toLowerCase();
        const unitPrice = Number(item.default_unit_price ?? 0);
        return ["service", "material", "diagnostic"].includes(itemType) && Number.isFinite(unitPrice) && unitPrice >= 0;
      })
      .map((item) => ({
        id: item.id,
        item_name: item.item_name,
        item_type: item.item_type,
        category: item.category,
        default_description: item.default_description,
        default_unit_price: item.default_unit_price,
        unit_label: item.unit_label,
      }));
    const fieldChargeProposalVisitScopeItems = visitScopeItems.map((item) => ({
      id: item.id,
      title: item.title,
      details: item.details,
    }));

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
    const internalInvoiceDisplayReference = internalInvoice
      ? formatInvoiceDisplayReference({
          invoiceDisplayNumber: internalInvoice.invoice_display_number,
          invoiceNumber: internalInvoice.invoice_number,
          invoiceId: internalInvoice.id,
        })
      : "Not started";

    const issuedInvoiceStatusMessage =
      internalInvoice?.status === "issued"
        ? job.job_type === "ecc" && !job.certs_complete
          ? `Issued ${internalInvoice.issued_at ? formatTimestampDateDisplayLA(internalInvoice.issued_at) : ""}. Billing is satisfied, but certs are still open before this job can fully close.`
          : `Issued ${internalInvoice.issued_at ? formatTimestampDateDisplayLA(internalInvoice.issued_at) : ""}. The job's billing-closeout requirement is currently satisfied.`
        : "";

    return (
      <div id="internal-invoice-panel" className={`mt-6 scroll-mt-24 rounded-2xl p-5 ${hasVisitScopeDefined ? "border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-[0_20px_40px_-30px_rgba(15,23,42,0.28)]" : "border border-slate-200/70 bg-slate-50/75 shadow-[0_12px_24px_-28px_rgba(15,23,42,0.18)]"}`}>
        <div className={`rounded-xl p-4 ${hasVisitScopeDefined ? "border border-slate-200/80 bg-white/92 shadow-[0_10px_24px_-28px_rgba(15,23,42,0.22)]" : "border border-slate-200/70 bg-white/70"}`}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Invoice</div>

              <div className="mt-1 text-sm font-semibold text-slate-950">
                {internalInvoiceDisplayReference}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Invoice Date</div>
              <div className="mt-1 text-sm font-semibold text-slate-950">
                {internalInvoice ? formatTimestampDateDisplayLA(internalInvoice.invoice_date) : "Will auto-fill on draft"}
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

        <FieldBillingSummary
          jobId={job.id}
          tab={tab}
          capabilities={fieldBillingCapabilities}
          invoice={fieldBillingInvoiceSnapshot}
          latestVoidedInvoice={fieldBillingLatestVoidedInvoiceSnapshot}
          paymentSummary={internalInvoice ? internalInvoicePaymentSummary : null}
          supplementalInvoices={fieldBillingSupplementalInvoiceSnapshots}
          fieldChargeProposals={fieldChargeProposals}
          pricebookProposalItems={fieldChargeProposalPricebookItems}
          visitScopeProposalItems={fieldChargeProposalVisitScopeItems}
        />

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
                ? "Build a draft invoice from the Work Items when billing is ready."
                : "Work Items come first. Build an invoice later when billing is ready."}
            </div>
            <form action={createInternalInvoiceDraftFromForm} className="mt-3">
              <input type="hidden" name="job_id" value={job.id} />
              <input type="hidden" name="tab" value={tab} />
              <input type="hidden" name="return_to" value={`/jobs/${job.id}/invoice#invoice-workspace`} />
              <input type="hidden" name="auto_import_visit_scope_items" value={showReplacementInvoicePrompt ? "0" : "1"} />
              <SubmitButton loadingText="Creating..." className={hasVisitScopeDefined ? primaryButtonClass : secondaryButtonClass}>
                {showReplacementInvoicePrompt ? "Create Replacement Invoice" : "Build Invoice"}
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
                        <div className="mt-1 text-sm leading-6 text-slate-600">Build Invoice Charges here when billing is ready. Work Items stay focused on the visit work, and these charge lines stay focused on billing for this invoice.</div>
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
                      selectedInvoiceId={internalInvoice.id}
                      tab={tab}
                      capabilities={fieldBillingCapabilities}
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
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Invoice</div>
                      <div className="mt-1 text-sm font-semibold text-slate-950">{internalInvoiceDisplayReference}</div>
                    </div>
                    <div className={workspaceSoftCardClass}>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Invoice Date</div>
                      <div className="mt-1 text-sm font-semibold text-slate-950">{formatTimestampDateDisplayLA(internalInvoice.invoice_date)}</div>
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
                <div className="mt-2 rounded-lg border border-slate-200/80 bg-slate-50/75 px-3.5 py-3 text-sm leading-6 text-slate-700">
                  Work Items capture visit work. Invoice Charges are the billing lines you review before issuing.
                </div>
                {internalInvoice.status === "draft" ? (
                  <>
                      <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Issue Invoice</div>
                      <div className="mt-1 text-sm leading-6 text-slate-600">Review charges, recipient, and total before issuing. Sending is communication-only and happens after issue.</div>

                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm text-slate-700">
                      <div><span className="font-semibold text-slate-900">Review recipient:</span> {internalInvoiceRecipientName}</div>
                      <div className="mt-1"><span className="font-semibold text-slate-900">Review email:</span> {String(internalInvoice.billing_email ?? "").trim() || "Not set"}</div>
                      <div className="mt-1"><span className="font-semibold text-slate-900">Review total:</span> {formatCurrencyFromCents(internalInvoice.total_cents)}</div>
                      <div className="mt-1"><span className="font-semibold text-slate-900">Review charges:</span> {internalInvoiceLineItemCount} item{internalInvoiceLineItemCount === 1 ? "" : "s"}</div>
                    </div>

                    {canIssueInvoiceLifecycleAccess ? (
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
                    ) : (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm text-slate-700">
                        Invoice issue authority is not available for your current role.
                      </div>
                    )}

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
                      <div className="mt-1 leading-6">Send the already-issued invoice to the billing recipient. Resending is communication only and does not create a second invoice or change the saved charge lines.</div>

                      {canSendInvoiceLifecycleAccess ? (
                        <>
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
                        </>
                      ) : (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-white/90 px-3 py-2.5 text-sm text-slate-600">
                          Invoice send authority is not available for your current role.
                        </div>
                      )}
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
                    {internalInvoiceEmailDeliveries.map((delivery: InternalInvoiceEmailDeliveryRecord) => (
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
    );
  };

  const JobDetailTimingLog = () => {
    emitTimingLog({
      invoicePanelActive: showInternalInvoicePanel,
      serviceCaseExists: Boolean(serviceCaseId),
      timelineChainExists: hasDirectNarrativeChain,
      actorKind: "internal",
    });
    return null;
  };

  const mobileFieldActionClass =
    "inline-flex min-h-14 items-center justify-center rounded-xl border border-slate-200/90 bg-white px-4 py-3 text-base font-semibold text-slate-950 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.3)] transition-[border-color,background-color,box-shadow,transform] hover:border-blue-200 hover:bg-blue-50/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px]";
  const mobileDisabledActionClass =
    "inline-flex min-h-14 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-base font-semibold text-slate-400";
  const mobileSectionClass =
    "rounded-2xl border border-slate-200/90 bg-white px-4 py-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.3)] ring-1 ring-blue-100/35";
  const mobileToolLinkClass =
    "inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 shadow-[0_10px_22px_-24px_rgba(15,23,42,0.28)] transition-[border-color,background-color,box-shadow,transform] hover:border-blue-200 hover:bg-blue-50/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px]";
  const mobileMutedToolLinkClass =
    "inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-semibold text-slate-600 shadow-[0_8px_18px_-24px_rgba(15,23,42,0.22)]";
  const mobileAttentionStripClass =
    "rounded-xl border-l-4 border-amber-400 bg-amber-50 px-3.5 py-2.5 text-base leading-6 text-amber-950";
  const mobileAttentionActionClass =
    "inline-flex min-h-10 items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-100";
  const mobileIconChipClass = "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600";

  const mobileLifecycleStatus = String(job.status ?? "").trim().toLowerCase();
  const mobileOpsStatus = String(job.ops_status ?? "").trim().toLowerCase();
  const mobileLifecycleStatusLabelMap: Record<string, string> = {
    open: "Open",
    on_the_way: "On The Way",
    in_process: "In Progress",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
  };
  const mobileLifecycleStatusLabel =
    mobileLifecycleStatusLabelMap[mobileLifecycleStatus] ?? formatStatus(job.status);
  const mobileOpsStatusLabel = formatOpsStatusLabel(job.ops_status);
  const mobileFieldLifecycleActive =
    mobileLifecycleStatus === "on_the_way" ||
    mobileLifecycleStatus === "in_process" ||
    (mobileLifecycleStatus === "completed" && !isFieldComplete);
  const mobilePrimaryStateLabel = mobileFieldLifecycleActive
    ? mobileLifecycleStatusLabel
    : mobileLifecycleStatus === "open" && (mobileOpsStatus === "on_the_way" || mobileOpsStatus === "in_process")
    ? mobileOpsStatus === "in_process"
      ? "In Progress"
      : "On The Way"
    : mobileOpsStatusLabel;
  const mobileSecondaryStateLabel =
    !mobileFieldLifecycleActive &&
    mobileOpsStatusLabel !== "—" &&
    mobileOpsStatusLabel !== mobilePrimaryStateLabel
      ? `Scheduling: ${mobileOpsStatusLabel}`
      : null;
  const mobileCustomerHref = job.customer_id ? `/customers/${job.customer_id}` : null;
  const showMobileEccTestAction = job.job_type === "ecc";
  const mobileInvoiceActionRelevant =
    job.job_type === "service" &&
    (showInternalInvoicingPlaceholder || Boolean(internalInvoiceTruth) || showExternalDataEntryPrompt || (isCloseoutPending && closeoutNeeds.needsInvoice));
  const showMobileServiceInvoiceFieldAction =
    job.job_type === "service" && showInternalInvoicePanel && mobileInvoiceActionRelevant;
  const showMobileInvoiceOpenAttention =
    job.job_type === "service" && Boolean(internalInvoiceTruth) && !showInternalInvoicingPlaceholder;
  const mobileCurrentStatusLabel = isFieldComplete ? "Field Complete" : mobileLifecycleStatusLabel;
  const showMobileContractorContext = job.job_type === "ecc" && Boolean(contractorId);

  return (
    <div className="mx-auto w-full min-w-0 max-w-[104rem] space-y-5 overflow-x-hidden bg-slate-50/45 p-0 lg:p-6">
      <div className="block min-h-screen bg-slate-50 px-3 py-3.5 text-slate-950 lg:hidden">
        <div className="mx-auto max-w-lg space-y-4">
          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_20px_48px_-34px_rgba(15,23,42,0.36)] ring-1 ring-blue-100/35">
            <div className="h-1 bg-[linear-gradient(90deg,#0f1f35,#2563eb)]" />
            <div className="px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-800">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#0f1f35] text-blue-100">
                    <ToolIcon className="h-3 w-3" />
                  </span>
                  <span>Job Workbench</span>
                </div>
                <h1 className="mt-2 break-words text-[1.35rem] font-semibold leading-tight text-[#0f1f35]">
                  {jobWorkbenchTitle}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold tracking-[0.06em] text-slate-700">
                    {jobHeaderReference}
                  </span>
                  <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                    {headerJobTypeLabel}
                  </span>
                </div>
                {jobWorkbenchAccountLabel ? (
                  <div className="mt-3 text-xs font-semibold text-slate-500">Customer / Account</div>
                ) : null}
                <div className="mt-1 break-words text-base font-semibold text-slate-950">
                  {mobileCustomerHref ? (
                    <Link
                      href={mobileCustomerHref}
                      className="inline-flex items-center gap-1.5 underline decoration-slate-300/90 underline-offset-4 transition-colors hover:text-blue-700 hover:decoration-blue-300"
                    >
                      <span>{jobWorkbenchAccountLabel || fieldHeaderTitle}</span>
                      <ChevronRightIcon className="h-4 w-4 text-slate-500" />
                    </Link>
                  ) : (
                    jobWorkbenchAccountLabel || fieldHeaderTitle
                  )}
                </div>
                {serviceAddressDisplay !== "No address set" ? (
                  <div className="mt-2 flex items-start gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-sm font-medium text-slate-700">
                    <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                    <span className="break-words">{serviceAddressDisplay}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="relative mt-3.5 grid grid-cols-2 items-stretch gap-2 overflow-visible border-t border-slate-200 pt-3">
                <details id="mobile-when-panel" className="group relative self-start overflow-hidden rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.24)]">
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-blue-600/70" />
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-900/70">
                          <ClockIcon className="h-4 w-4" />
                          <span>Schedule</span>
                        </div>
                        <div className="mt-1 text-base font-semibold">{appointmentDateLabel}</div>
                        <div className="text-sm text-slate-700">{appointmentTimeLabel}</div>
                      </div>
                      <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200/70 text-slate-600 transition-transform group-open:rotate-90">
                        <ChevronRightIcon className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </summary>

                  <div className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-[calc(200%+0.75rem)] max-w-[calc(100vw-1.5rem)] group-open:block">
                    <div className="pointer-events-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_24px_44px_-28px_rgba(15,23,42,0.38)] ring-1 ring-slate-200/70">
                      <form action={updateJobScheduleFromForm} className="space-y-3">
                        <input type="hidden" name="job_id" value={job.id} />
                        <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#mobile-when-panel`} />
                        <input type="hidden" name="permit_number" value={job.permit_number ?? ""} />
                        <input type="hidden" name="jurisdiction" value={(job as any).jurisdiction ?? ""} />
                        <input type="hidden" name="permit_date" value={(job as any).permit_date ?? ""} />

                        <div className="space-y-1">
                          <label className="text-sm font-semibold text-slate-700">Scheduled Date</label>
                          <input
                            type="date"
                            name="scheduled_date"
                            defaultValue={displayDateLA(job.scheduled_date)}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-sm font-semibold text-slate-700">Window Start</label>
                            <input
                              type="time"
                              name="window_start"
                              defaultValue={timeToTimeInput(job.window_start)}
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-semibold text-slate-700">Window End</label>
                            <input
                              type="time"
                              name="window_end"
                              defaultValue={timeToTimeInput(job.window_end)}
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                          <SubmitButton
                            loadingText="Saving..."
                            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-blue-700 bg-blue-700 px-4 py-2 text-base font-semibold text-white"
                          >
                            Save Scheduling
                          </SubmitButton>

                          {(job.scheduled_date || job.window_start || job.window_end) ? (
                            <UnscheduleButton className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-base font-semibold text-slate-800" />
                          ) : null}

                          <Link
                            href={`/jobs/${job.id}?tab=${tab}`}
                            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-base font-semibold text-slate-800"
                          >
                            Close
                          </Link>
                        </div>
                      </form>
                    </div>
                  </div>
                </details>
                <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.24)]">
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-blue-600/70" />
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-900/70">
                    <ToolIcon className="h-4 w-4" />
                    <span>Work</span>
                  </div>
                  <div className="mt-1 text-base font-semibold">{job.job_type === "service" ? "Service" : "ECC"}</div>
                  <div className="text-sm text-slate-600">{isFieldComplete ? "Field complete" : "Field active"}</div>
                </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 shadow-[inset_3px_0_0_rgba(37,99,235,0.16)]">
                <div className="text-xs font-semibold text-blue-900/70">Workflow</div>
                <div className="mt-0.5 text-sm font-semibold text-slate-950">{formatOpsStatusLabel(job.ops_status)}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 shadow-[inset_3px_0_0_rgba(37,99,235,0.16)]">
                <div className="text-xs font-semibold text-blue-900/70">Field</div>
                <div className={`mt-0.5 text-sm font-semibold ${isFieldComplete ? "text-emerald-800" : "text-blue-700"}`}>{formatStatus(job.status)}</div>
              </div>
            </div>
            </div>
          </section>

          {banner === "note_added" || banner === "follow_up_note_added" ? (
            <FlashBanner type="success" message="Note added." />
          ) : null}

          {banner === "field_complete" ? (
            <FlashBanner type="success" message="Field work marked complete." />
          ) : null}

          {banner === "status_updated" || banner === "ops_status_saved" || banner === "service_closeout_saved" ? (
            <FlashBanner type="success" message="Saved." />
          ) : null}

          {banner === "on_the_way_reverted" ? (
            <FlashBanner type="success" message="On the Way was reverted." />
          ) : null}

          {banner === "visit_scope_saved" ? (
            <FlashBanner type="success" message="Work Items saved." />
          ) : null}

          {banner === "callback_report_recorded" ? (
            <FlashBanner
              type="success"
              message="Callback report recorded in job history only. No visit was created or scheduled."
            />
          ) : null}

          {banner === "callback_visit_created" ? (
            <FlashBanner
              type="success"
              message="Callback visit created. This is an unscheduled office/dispatch item and will not appear in technician My Work until scheduled and assigned."
            />
          ) : null}

          {banner === "callback_visit_requires_historical_anchor" ? (
            <FlashBanner
              type="warning"
              message="Callback visit creation is available only for service jobs that are field-complete, completed, or closed."
            />
          ) : null}

          {banner === "callback_report_requires_historical_anchor" ? (
            <FlashBanner
              type="warning"
              message="Record Callback Report is available only for service jobs that are field-complete, completed, or closed."
            />
          ) : null}

          {banner === "internal_invoice_draft_created" || banner === "internal_invoice_draft_saved" || banner === "internal_invoice_issued" ? (
            <FlashBanner type="success" message="Invoice updated." />
          ) : null}

          {[
            "note_add_failed",
            "visit_scope_required",
            "visit_scope_update_failed",
            "internal_invoicing_billing_pending",
            "internal_invoice_issue_blocked",
            "internal_invoice_issue_incomplete",
            "on_the_way_revert_unavailable",
          ].includes(String(banner ?? "")) ? (
            <FlashBanner type="warning" message="This action needs attention. Review the details below." />
          ) : null}

          <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_18px_36px_-30px_rgba(29,78,216,0.32)]">
            <div className="h-[3px] bg-[linear-gradient(90deg,#0f1f35,#2563eb)]" />
            <div className="px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 text-lg font-semibold text-[#0f1f35]">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#0f1f35] text-blue-100">
                    <ChevronRightIcon className="h-4 w-4" />
                  </span>
                  <span>Next Field Action</span>
                </div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-blue-900/55">Current Status</div>
                <div className="mt-0.5 text-base font-semibold text-slate-800">{mobileCurrentStatusLabel}</div>
              </div>
            </div>

            {isFieldComplete || job.status === "completed" ? (
              <div className="mt-1 text-base text-slate-600">
                {isFieldComplete ? "Field work is complete." : "Finish field closeout."}
              </div>
            ) : null}

            {completionActionAttentionBanner ? (
              <div
                data-completion-action-banner="true"
                className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-900"
              >
                <div className="font-semibold">{completionActionAttentionBanner.title}</div>
                <div className="mt-1">{completionActionAttentionBanner.message}</div>
              </div>
            ) : null}

            <div className="mt-3.5">
              {!isFieldComplete && job.status === "completed" ? (
                <form action={markJobFieldCompleteFromForm}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <SubmitButton
                    loadingText="Completing..."
                    className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-700 px-5 py-2.5 text-base font-semibold text-white shadow-[0_18px_34px_-22px_rgba(29,78,216,0.5)] transition-colors hover:bg-blue-800"
                  >
                    Mark Field Complete
                  </SubmitButton>
                </form>
              ) : !isFieldComplete ? (
                <div className="space-y-2">
                  <JobFieldActionButton
                    jobId={job.id}
                    currentStatus={job.status}
                    tab={tab}
                    hasFullSchedule={hasFullSchedule}
                    variant="fieldMode"
                  />
                  {showFieldOutcomePanel ? (
                    <FieldOutcomePanel
                      anchorId="field-outcome"
                      jobId={String(job.id)}
                      currentStatus={String(job.status ?? "")}
                      tab={tab}
                      isEccJob={job.job_type === "ecc"}
                      showDifferentIssueFoundOutcome={showDifferentIssueFoundOutcome}
                    />
                  ) : null}
                  {job.job_type === "ecc" ? (
                    <Link
                      href={`/jobs/${job.id}/tests`}
                      className={`${compactWorkspaceActionButtonClass} min-h-12 w-full`}
                    >
                      Open Tests Workspace
                    </Link>
                  ) : null}
                </div>
              ) : isFieldComplete || job.status === "completed" ? (
                <div className="space-y-2">
                  <span className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-center text-base font-semibold text-emerald-900">
                    Field work complete - ready for closeout.
                  </span>
                  {job.job_type === "ecc" ? (
                    <Link
                      href={`/jobs/${job.id}/tests`}
                      className={`${compactWorkspaceActionButtonClass} min-h-12 w-full`}
                    >
                      Open Tests Workspace
                    </Link>
                  ) : null}
                </div>
              ) : null}

              {onTheWayUndoEligibility.eligible ? (
                <form action={revertOnTheWayFromForm} className="mt-2.5">
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="tab" value={tab} />
                  <SubmitButton
                    loadingText="Undoing..."
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-base font-semibold text-amber-900"
                  >
                    Undo On the Way
                  </SubmitButton>
                </form>
              ) : null}
            </div>
            </div>
          </section>

          <section className={mobileSectionClass}>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                <ToolIcon className="h-4 w-4" />
              </span>
              <div>
                <div className="text-lg font-semibold text-[#0f1f35]">Quick Field Actions</div>
                <div className="text-xs text-slate-500">Call, text, equipment, and billing shortcuts.</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {mobileCallHref ? (
                <a href={mobileCallHref} className={mobileFieldActionClass}>
                  <span className="inline-flex items-center gap-2">
                    <PhoneIcon className="h-4.5 w-4.5" />
                    <span>Call</span>
                  </span>
                </a>
              ) : (
                <span className={mobileDisabledActionClass}>
                  <span className="inline-flex items-center gap-2">
                    <PhoneIcon className="h-4.5 w-4.5" />
                    <span>Call</span>
                  </span>
                </span>
              )}

              {mobileTextHref ? (
                <a href={mobileTextHref} className={mobileFieldActionClass}>
                  <span className="inline-flex items-center gap-2">
                    <MessageIcon className="h-4.5 w-4.5" />
                    <span>Text</span>
                  </span>
                </a>
              ) : (
                <span className={mobileDisabledActionClass}>
                  <span className="inline-flex items-center gap-2">
                    <MessageIcon className="h-4.5 w-4.5" />
                    <span>Text</span>
                  </span>
                </span>
              )}

              <Link href={`/jobs/${job.id}/info?f=equipment`} className={mobileFieldActionClass}>
                <span className="inline-flex items-center gap-2">
                  <ToolIcon className="h-4.5 w-4.5" />
                  <span>Equipment</span>
                </span>
              </Link>

              {showMobileEccTestAction ? (
                <Link href={`/jobs/${job.id}/tests`} className={mobileFieldActionClass}>
                  <span className="inline-flex items-center gap-2">
                    <ClipboardIcon className="h-4.5 w-4.5" />
                    <span>ECC Test</span>
                  </span>
                </Link>
              ) : showMobileServiceInvoiceFieldAction ? (
                internalInvoiceTruth ? (
                  <Link href={`/jobs/${job.id}/invoice#invoice-workspace`} className={mobileFieldActionClass}>
                    <span className="inline-flex items-center gap-2">
                      <ReceiptIcon className="h-4.5 w-4.5" />
                      <span>View Invoice</span>
                    </span>
                  </Link>
                ) : (
                  <form action={createInternalInvoiceDraftFromForm}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="tab" value={tab} />
                    <input type="hidden" name="return_to" value={`/jobs/${job.id}/invoice#invoice-workspace`} />
                    <input type="hidden" name="auto_import_visit_scope_items" value="1" />
                    <SubmitButton loadingText="Starting..." className={mobileFieldActionClass}>
                      <span className="inline-flex items-center gap-2">
                        <ReceiptIcon className="h-4.5 w-4.5" />
                        <span>Build Invoice</span>
                      </span>
                    </SubmitButton>
                  </form>
                )
              ) : job.job_type === "service" ? (
                <a href="#mobile-work-scope" className={mobileFieldActionClass}>
                  <span className="inline-flex items-center gap-2">
                    <ToolIcon className="h-4.5 w-4.5" />
                    <span>Add Work</span>
                  </span>
                </a>
              ) : (
                <span className={mobileDisabledActionClass}>
                  <span className="inline-flex items-center gap-2">
                    <ReceiptIcon className="h-4.5 w-4.5" />
                    <span>Build Invoice</span>
                  </span>
                </span>
              )}
            </div>
          </section>

          <section className={mobileSectionClass}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#0f1f35] text-blue-100">
                  <ToolIcon className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-lg font-semibold text-[#0f1f35]">Field Operations Board</div>
                  <div className="text-xs text-slate-500">Customer, location, contact, and team context.</div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-3">
                <div className="text-sm font-semibold text-[#0f1f35]">Customer / Account</div>
                <div className="mt-1 break-words text-base font-semibold text-slate-950">
                  {mobileCustomerHref ? (
                    <Link href={mobileCustomerHref} className="underline-offset-2 hover:text-blue-800 hover:underline">
                      {jobWorkbenchAccountLabel || fieldHeaderTitle}
                    </Link>
                  ) : (
                    jobWorkbenchAccountLabel || fieldHeaderTitle
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {telLink ? (
                    <a href={telLink} className={`${compactSecondaryButtonClass} min-h-10 text-sm`}>
                      Call
                    </a>
                  ) : null}
                  {customerPhone !== "—" ? (
                    <a href={`sms:${accountPhoneDigits}`} className={`${compactSecondaryButtonClass} min-h-10 text-sm`}>
                      Text
                    </a>
                  ) : null}
                  {accountEmailLink ? (
                    <a href={accountEmailLink} className={`${compactSecondaryButtonClass} min-h-10 text-sm`}>
                      Email
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_14px_28px_-28px_rgba(15,23,42,0.26)]">
                <div className="flex items-center gap-2 border-b border-slate-200/80 px-3 py-3">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                    <MapPinIcon className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-[#0f1f35]">Service Location</div>
                    <div className="text-xs text-slate-500">Address and map preview.</div>
                  </div>
                </div>
            <Suspense
              fallback={
                <JobLocationPreviewFallback
                  addressLine1={serviceAddressLine1}
                  addressLine2={serviceAddressLine2}
                  city={serviceCity}
                  state={serviceState}
                  zip={serviceZip}
                  showAddressOverlay
                  showAddressFooter
                  showActionsOnMobile
                  className="px-4 pb-4"
                />
              }
            >
              <TimedJobLocationPreview
                addressLine1={serviceAddressLine1}
                addressLine2={serviceAddressLine2}
                city={serviceCity}
                state={serviceState}
                zip={serviceZip}
                showAddressOverlay
                showAddressFooter
                showActionsOnMobile
                className="px-4 pb-4 [&_a:first-child]:rounded-xl [&_img]:h-44"
                timingEnabled={timingEnabled}
                onPhaseTiming={recordBlockingPhase}
              />
            </Suspense>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-3 shadow-[0_14px_28px_-28px_rgba(15,23,42,0.24)]">
                <div className="mb-2 flex items-center gap-2 border-b border-slate-200/70 pb-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                    <PhoneIcon className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-[#0f1f35]">Contact Logging</div>
                    <div className="text-xs text-slate-500">Log attempts only.</div>
                  </div>
                </div>
                <div className="rounded-lg border border-blue-100 bg-blue-50/35 px-3 py-2.5 shadow-[inset_3px_0_0_rgba(37,99,235,0.16)]">
                  <ContactLoggingQuickActions
                    jobId={String(job.id)}
                    attemptCount={attemptCount}
                    lastAttemptLabel={lastAttemptLabel}
                    action={logCustomerContactAttemptFromForm}
                    buttonClassName={`${mobileMutedToolLinkClass} w-full text-sm`}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-[#0f1f35]">Team Assignment</div>
                    <div className="text-xs text-slate-500">Technicians assigned to the job.</div>
                  </div>
                  <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {assignedTeam.length > 0 ? `${assignedTeam.length} assigned` : "Awaiting assignment"}
                  </span>
                </div>
                {assignedTeam.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {assignedTeam.map((assignee) => (
                      <div key={`mobile-board-${assignee.job_id}-${assignee.user_id}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800">
                        {formatPersonNamePart(assignee.display_name)}
                        {assignee.is_primary ? <span className="ml-2 text-xs text-slate-500">Primary</span> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-600">No team assigned yet.</div>
                )}
              </div>
            </div>
          </section>

          {showMobileContractorContext ? (
            <section className="rounded-2xl border border-slate-200/90 bg-white px-4 py-3 shadow-[0_14px_26px_-28px_rgba(15,23,42,0.28)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Contractor</div>
              <div className="mt-1 text-base font-semibold text-slate-950">{contractorName || "Assigned contractor"}</div>
            </section>
          ) : null}

          {(sp?.schedule_required === "1" || activeWaitingState || showExternalDataEntryPrompt || showInternalInvoicingPlaceholder || showMobileInvoiceOpenAttention || markVisitCountedLinkId || suggestedNextDueProjection || isCloseoutPending) ? (
            <section className="space-y-2">

                {showExternalDataEntryPrompt ? (
                  <div className={mobileAttentionStripClass}>
                    <div className="flex items-center justify-between gap-3">
                      <div><span className="inline-flex items-center gap-1.5 font-semibold"><ReceiptIcon className="h-4 w-4" />Invoice required</span> / confirm external billing.</div>
                      <form action={completeDataEntryFromForm} className="shrink-0">
                        <input type="hidden" name="job_id" value={job.id} />
                        <SubmitButton loadingText="Saving..." className={mobileAttentionActionClass}>
                          Mark Done
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                ) : null}

                {showInternalInvoicingPlaceholder ? (
                  <div className="rounded-xl border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-sm leading-5 text-amber-950">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="inline-flex items-center gap-1.5 font-semibold"><ReceiptIcon className="h-4 w-4" />Invoice required</span>
                        <span className="text-amber-900/90"> · </span>
                        <span>{internalInvoiceTruth ? "Open invoice" : "Build invoice"}</span>
                      </div>
                      {internalInvoiceTruth ? (
                        <Link href={`/jobs/${job.id}/invoice#invoice-workspace`} className="inline-flex min-h-9 items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-100">
                          Open invoice
                        </Link>
                      ) : (
                        <form action={createInternalInvoiceDraftFromForm} className="shrink-0">
                          <input type="hidden" name="job_id" value={job.id} />
                          <input type="hidden" name="tab" value={tab} />
                          <input type="hidden" name="return_to" value={`/jobs/${job.id}/invoice#invoice-workspace`} />
                          <input type="hidden" name="auto_import_visit_scope_items" value="1" />
                          <SubmitButton loadingText="Starting..." className="inline-flex min-h-9 items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-100">
                            Build invoice
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </div>
                ) : null}

                {showMobileInvoiceOpenAttention ? (
                  <div className="rounded-xl border border-blue-300/70 bg-blue-50/70 px-3 py-2 text-sm leading-5 text-blue-950">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="inline-flex items-center gap-1.5 font-semibold"><ReceiptIcon className="h-4 w-4" />Invoice open</span>
                        <span className="text-blue-900/90"> · </span>
                        <span>View invoice</span>
                      </div>
                      <Link href={`/jobs/${job.id}/invoice#invoice-workspace`} className="inline-flex min-h-9 items-center justify-center rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-semibold text-blue-900 transition-colors hover:bg-blue-100">
                        View
                      </Link>
                    </div>
                  </div>
                ) : null}

                {isCloseoutPending ? (
                  <div className={mobileAttentionStripClass}>
                    <span className="inline-flex items-center gap-1.5 font-semibold"><WarningIcon className="h-4 w-4" />Closeout open</span>
                    <span>
                      {" / "}
                      {closeoutNeeds.needsInvoice && closeoutNeeds.needsCerts
                        ? "Invoice and certs are still pending."
                        : closeoutNeeds.needsCerts
                        ? "Certs are still pending."
                        : closeoutNeeds.needsInvoice
                        ? "Invoice is still pending."
                        : "Review closeout status."}
                    </span>
                  </div>
                ) : null}

                {markVisitCountedLinkId ? (
                  <div className={mobileAttentionStripClass}>
                    <div><span className="inline-flex items-center gap-1.5 font-semibold"><ClockIcon className="h-4 w-4" />Service Plan</span> / visit may count toward {markVisitCountedAgreementName || "the plan"}.</div>
                    <div className="mt-2">
                      <MarkVisitCountedActionButton jobId={String(job.id)} linkId={markVisitCountedLinkId} tab={tab} />
                    </div>
                  </div>
                ) : null}

                {suggestedNextDueProjection ? (
                  <div className={mobileAttentionStripClass}>
                    <div>
                      <span className="inline-flex items-center gap-1.5 font-semibold"><ClockIcon className="h-4 w-4" />Suggested next due</span>
                      <span> / </span>
                      {suggestedNextDueProjection.manualSchedulingRequired
                        ? "Manual scheduling required."
                        : formatDateOnlyUs(suggestedNextDueProjection.suggestedNextDueDate) || "Manual scheduling required."}
                    </div>
                    {!confirmedNextDueContext && !suggestedNextDueProjection.manualSchedulingRequired && suggestedNextDueProjection.suggestedNextDueDate ? (
                      <div className="mt-2">
                        <ConfirmNextDueDateActionButton
                          jobId={String(job.id)}
                          agreementId={suggestedNextDueProjection.agreementId}
                          suggestedNextDueDate={suggestedNextDueProjection.suggestedNextDueDate}
                          baselineNextDueDate={suggestedNextDueProjection.baselineNextDueDate || ""}
                          displayDate={formatDateOnlyUs(suggestedNextDueProjection.suggestedNextDueDate) || suggestedNextDueProjection.suggestedNextDueDate}
                          tab={tab}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
            </section>
          ) : null}

          <section id="mobile-work-scope" className={mobileSectionClass}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <ToolIcon className="h-4 w-4" />
                </span>
                <div>
                <div className="text-lg font-semibold text-[#0f1f35]">Work & Invoice</div>
                <div className="mt-0.5 text-sm text-slate-600">
                  {visitScopeCount} item{visitScopeCount === 1 ? "" : "s"} added
                </div>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div id="mobile-visit-reason-card" className="rounded-xl border border-slate-200/80 bg-slate-50/75 px-3 py-3 shadow-[inset_3px_0_0_rgba(37,99,235,0.14)]">
                {isInternalUser ? (
                  <details className="group">
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-semibold text-[#0f1f35]">Visit Reason</div>
                        <span className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition-colors group-hover:bg-slate-50">
                          Edit
                        </span>
                      </div>
                    </summary>
                    <form action={updateJobVisitScopeFromForm} className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <input type="hidden" name="job_id" value={job.id} />
                      <input type="hidden" name="tab" value={tab} />
                      <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#mobile-visit-reason-card`} />
                      <input type="hidden" name="visit_scope_items_json" value={visitScopeItemsJsonForInlineEdit} />
                      <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        Visit Reason / Visit Title
                      </label>
                      <textarea
                        name="visit_scope_summary"
                        defaultValue={visitScopeSummary ?? ""}
                        rows={3}
                        maxLength={600}
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
                      />
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <SubmitButton loadingText="Saving..." className={primaryButtonClass}>
                          Save
                        </SubmitButton>
                        <a href="#mobile-visit-reason-card" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                          Cancel
                        </a>
                      </div>
                    </form>
                  </details>
                ) : (
                  <div className="text-sm font-semibold text-[#0f1f35]">Visit Reason</div>
                )}
                <div className="mt-1 whitespace-pre-wrap break-words text-base font-semibold leading-6 text-slate-950">
                  {visitReasonText}
                </div>
              </div>

              {visitScopeItems.length > 0 ? (
                <div className="space-y-2">
                  {visitScopeItems.map((item, index) => (
                    <div key={`mobile-primary-${index}-${item.title}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_10px_22px_-24px_rgba(15,23,42,0.24)]">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 text-base font-semibold leading-6 text-slate-950">{item.title}</div>
                        {item.expected_unit_price !== null && item.expected_unit_price !== undefined ? (
                          <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            ${Number(item.expected_unit_price).toFixed(2)}
                          </span>
                        ) : null}
                      </div>
                      {item.kind === "companion_service" ? (
                        <div className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                          {formatVisitScopeItemKindLabel(item.kind)}
                        </div>
                      ) : null}
                      {item.details ? (
                        <div className="mt-1 whitespace-pre-wrap break-words text-base leading-6 text-slate-700">{item.details}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {shouldShowWorkSummary ? (
                <details className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                  <summary className="cursor-pointer list-none text-base font-semibold text-slate-900">
                    Work Summary
                  </summary>
                  <div className="mt-2 whitespace-pre-wrap break-words border-t border-slate-200 pt-2 text-base leading-6 text-slate-700">
                    {visitScopeSummary}
                  </div>
                </details>
              ) : null}

              {isInternalUser ? (
                <details className="group rounded-xl border border-blue-200 bg-blue-50/60 px-3 py-3 shadow-[0_12px_26px_-26px_rgba(37,99,235,0.28)]">
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-slate-950">
                          {hasVisitScopeDefined ? "Adjust Work" : "Add Work"}
                        </div>
                        <div className="mt-0.5 text-sm text-slate-600">Quick Add / Pricebook / Custom</div>
                      </div>
                      <span className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white">
                        Open
                      </span>
                    </div>
                  </summary>
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <VisitScopeJobDetailForm
                      jobId={job.id}
                      jobType={job.job_type === "service" ? "service" : "ecc"}
                      tab={tab}
                      initialSummary={visitScopeSummary}
                      initialItems={visitScopeItems}
                      pricebookTemplateItems={visitScopePricebookTemplates}
                      primaryButtonClass={primaryButtonClass}
                    />
                  </div>
                </details>
              ) : null}
            </div>
          </section>

          <section id="mobile-notes-hub" className={mobileSectionClass}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <FolderIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-[#0f1f35]">Notes & Attachments</div>
                  <div className="text-xs text-slate-500">Internal notes, shared notes, and files.</div>
                </div>
              </div>
              <Link
                href={`/jobs/${job.id}/attachments`}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-[0_8px_18px_-22px_rgba(15,23,42,0.24)] transition-colors hover:border-blue-200 hover:bg-blue-50/35"
              >
                Attachments
              </Link>
            </div>
            <div className="mt-3 grid gap-3">
              <details id="mobile-internal-notes" className="rounded-xl border border-slate-200/80 bg-slate-50/75 px-3 py-3 shadow-[0_10px_22px_-24px_rgba(15,23,42,0.22)]" open={Boolean(internalNoteBannerMessage)}>
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 text-base font-semibold text-slate-950">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-white text-slate-600 ring-1 ring-slate-200"><LockIcon className="h-3.5 w-3.5" /></span>
                      <span>Internal Notes</span>
                    </div>
                    <div className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">{internalNotesMeta || "Team only"}</div>
                  </div>
                </summary>
                <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                  {internalNoteBannerMessage ? (
                    <FlashBanner
                      type={internalNoteBannerType as "success" | "warning" | "error"}
                      message={internalNoteBannerMessage}
                    />
                  ) : null}
                  <Suspense fallback={<div className="h-12 animate-pulse rounded-xl bg-slate-100" />}>
                    <DeferredInternalNoteMentionComposer
                      jobId={String(job.id)}
                      tab={tab}
                      accountOwnerUserId={internalUser.account_owner_user_id}
                      textareaClassName={`${workspaceTextareaClass} text-base`}
                      selectClassName={workspaceInputClass}
                      helperTextClassName="text-sm leading-5 text-slate-500"
                      buttonClassName={secondaryButtonClass}
                      returnAnchor="mobile-internal-notes"
                    />
                  </Suspense>
                  <Suspense fallback={<NarrativeNotesBodyFallback />}>
                    <DeferredInternalNotesBody
                      jobId={String(job.id)}
                      timelineJobIds={narrativeScopeJobIds}
                      hasDirectNarrativeChain={hasDirectNarrativeChain}
                      emptyStateClassName={workspaceEmptyStateClass}
                    />
                  </Suspense>
                </div>
              </details>

              {showSharedNotesCard ? (
                <details id="mobile-shared-notes" className="rounded-xl border border-slate-200/80 bg-white px-3 py-3 shadow-[0_10px_22px_-24px_rgba(15,23,42,0.22)]" open={Boolean(sharedNoteBannerMessage)}>
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-2 text-base font-semibold text-slate-950">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100"><ChatIcon className="h-3.5 w-3.5" /></span>
                        <span>Shared Notes</span>
                      </div>
                      <div className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">{sharedNotesMeta || "Shared"}</div>
                    </div>
                  </summary>
                  <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                    {sharedNoteBannerMessage ? (
                      <FlashBanner
                        type={sharedNoteBannerType as "success" | "warning" | "error"}
                        message={sharedNoteBannerMessage}
                      />
                    ) : null}
                    <form action={addPublicNoteFromForm} className="space-y-3">
                      <input type="hidden" name="note_scope" value="shared" />
                      <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#mobile-shared-notes`} />
                      <input type="hidden" name="job_id" value={job.id} />
                      <input type="hidden" name="tab" value={tab} />
                      <textarea
                        name="note"
                        rows={3}
                        placeholder="Add a shared note..."
                        className={`${workspaceTextareaClass} text-base`}
                      />
                      <SubmitButton loadingText="Adding note..." className={secondaryButtonClass}>
                        Save shared note
                      </SubmitButton>
                    </form>
                    <Suspense fallback={<NarrativeNotesBodyFallback />}>
                      <DeferredSharedNotesBody
                        jobId={String(job.id)}
                        timelineJobIds={narrativeScopeJobIds}
                        hasDirectNarrativeChain={hasDirectNarrativeChain}
                        emptyStateClassName={workspaceEmptyStateClass}
                      />
                    </Suspense>
                  </div>
                </details>
              ) : null}
            </div>
          </section>

          <details id="mobile-tools" className="group rounded-2xl border border-slate-200/90 bg-white px-4 py-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.3)] ring-1 ring-blue-100/30">
            <summary className="cursor-pointer list-none">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700 ring-1 ring-slate-200">
                    <SettingsIcon className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-lg font-semibold text-[#0f1f35]">More Details / Tools</div>
                    <div className="text-xs text-slate-500">Admin tools, permits, history, and follow-up.</div>
                  </div>
                </div>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-90" />
              </div>
            </summary>
            <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 text-sm font-semibold tracking-[0.08em] text-slate-600"><ToolIcon className="h-4 w-4" />Tools</div>
                <div className="grid gap-3">
                  {createEstimateFromJobHref ? (
                    <Link href={createEstimateFromJobHref} className={mobileToolLinkClass}>Create Estimate</Link>
                  ) : null}
                  {isInternalUser && job.job_type === "service" ? (
                    <details id="mobile-follow-up-job" className="group">
                      <summary className={`${mobileToolLinkClass} cursor-pointer list-none`}>
                        <span className="inline-flex items-center gap-2"><ToolIcon className="h-4.5 w-4.5" />Create Return Visit</span>
                      </summary>
                      <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-3">
                        <form action={createNextServiceVisitFromForm} className="space-y-3">
                          <input type="hidden" name="job_id" value={job.id} />
                          <input type="hidden" name="tab" value={tab} />
                          <input type="hidden" name="visit_intent" value="return_visit" />
                          <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#mobile-follow-up-job`} />

                          <div className="space-y-1">
                            <label className="text-sm font-semibold text-slate-700">Why is a return visit needed?</label>
                            <input
                              type="text"
                              name="next_visit_reason"
                              required
                              maxLength={220}
                              placeholder="Example: return to complete repair"
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
                            />
                            <p className="text-xs leading-5 text-slate-600">This creates an unscheduled office/dispatch item.</p>
                          </div>

                          <SubmitButton loadingText="Creating..." className={mobileToolLinkClass}>
                            Create Return Visit
                          </SubmitButton>
                        </form>
                      </div>
                    </details>
                  ) : null}
                  {job.job_type === "ecc" && !showMobileEccTestAction ? (
                    <Link href={`/jobs/${job.id}/tests`} className={mobileToolLinkClass}>ECC Test</Link>
                  ) : null}
                  {!showMobileServiceInvoiceFieldAction && showInternalInvoicePanel && mobileInvoiceActionRelevant ? (
                    internalInvoiceTruth ? (
                      <Link href={`/jobs/${job.id}/invoice#invoice-workspace`} className={mobileToolLinkClass}>
                        Open Invoice Workspace
                      </Link>
                    ) : (
                      <form action={createInternalInvoiceDraftFromForm}>
                        <input type="hidden" name="job_id" value={job.id} />
                        <input type="hidden" name="tab" value={tab} />
                        <input type="hidden" name="return_to" value={`/jobs/${job.id}/invoice#invoice-workspace`} />
                        <input type="hidden" name="auto_import_visit_scope_items" value="1" />
                        <SubmitButton loadingText="Starting..." className={mobileToolLinkClass}>
                          Build Invoice
                        </SubmitButton>
                      </form>
                    )
                  ) : null}
                </div>
              </div>

              <div className="inline-flex items-center gap-1.5 pt-1 text-sm font-semibold tracking-[0.08em] text-slate-600"><SettingsIcon className="h-4 w-4" />Admin</div>

              <details id="mobile-permit-info" className="group">
                <summary className={`${mobileToolLinkClass} cursor-pointer list-none`}>
                  <span className="inline-flex items-center gap-2"><ClipboardIcon className="h-4.5 w-4.5" />Permit Information</span>
                </summary>
                <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="space-y-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                      <div className="font-semibold text-slate-600">Permit</div>
                      <div className="text-base font-semibold text-slate-900">{permitSummaryLabel}</div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                        <div className="font-semibold text-slate-600">Number</div>
                        <div className="text-base font-semibold text-slate-900">{permitNumber || "Not recorded"}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                        <div className="font-semibold text-slate-600">Jurisdiction</div>
                        <div className="text-base font-semibold text-slate-900">{permitJurisdiction || "Not recorded"}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm sm:col-span-2">
                        <div className="font-semibold text-slate-600">Permit Date</div>
                        <div className="text-base font-semibold text-slate-900">{permitDateLabel || "Not recorded"}</div>
                      </div>
                    </div>
                  </div>

                  <details id="mobile-permit-edit" className="group mt-3">
                    <summary className={`${mobileMutedToolLinkClass} cursor-pointer list-none`}>Edit Permit Info</summary>
                    <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
                      <form action={updateJobScheduleFromForm} className="space-y-3">
                        <input type="hidden" name="job_id" value={job.id} />
                        <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#mobile-permit-edit`} />
                        <input type="hidden" name="scheduled_date" value={displayDateLA(job.scheduled_date) ?? ""} />
                        <input type="hidden" name="window_start" value={timeToTimeInput(job.window_start) ?? ""} />
                        <input type="hidden" name="window_end" value={timeToTimeInput(job.window_end) ?? ""} />

                        <div className="space-y-1">
                          <label className="text-sm font-semibold text-slate-700">Permit Number</label>
                          <input
                            name="permit_number"
                            defaultValue={job.permit_number ?? ""}
                            placeholder="Optional"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-sm font-semibold text-slate-700">Jurisdiction</label>
                          <input
                            name="jurisdiction"
                            defaultValue={(job as any).jurisdiction ?? ""}
                            placeholder="City or county permit office"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-sm font-semibold text-slate-700">Permit Date</label>
                          <input
                            type="date"
                            name="permit_date"
                            defaultValue={(job as any).permit_date ?? ""}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
                          />
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                          <SubmitButton loadingText="Saving..." className={primaryButtonClass}>
                            Save Permit Info
                          </SubmitButton>
                          <Link
                            href={`/jobs/${job.id}?tab=${tab}#mobile-permit-info`}
                            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-base font-semibold text-slate-800"
                          >
                            Cancel
                          </Link>
                        </div>
                      </form>
                    </div>
                  </details>
                </div>
              </details>

              <details className="group">
                <summary className={`${mobileToolLinkClass} cursor-pointer list-none`}>
                  <span className="inline-flex items-center gap-2"><SettingsIcon className="h-4.5 w-4.5" />Job Status Tools</span>
                </summary>
                <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-3">
                  <form action={updateJobOpsFromForm} className="space-y-3">
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#mobile-tools`} />
                    <InterruptStateFields
                      workspaceFieldLabelClass={workspaceFieldLabelClass}
                      workspaceInputClass={workspaceInputClass}
                      initialInterruptState={currentInterruptState as "" | "pending_info" | "on_hold" | "waiting"}
                      initialStatusReason={initialInterruptReason}
                      initialWaitingReasonType={initialWaitingReasonType}
                      initialWaitingOtherReason={initialWaitingOtherReason}
                    />
                    <SubmitButton loadingText="Saving..." className={primaryButtonClass}>
                      Save Interrupt State
                    </SubmitButton>
                  </form>
                  {canShowReleaseAndReevaluate ? (
                    <form action={releaseAndReevaluateFromForm} className="mt-3">
                      <input type="hidden" name="job_id" value={job.id} />
                      <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#mobile-tools`} />
                      <SubmitButton loadingText="Updating..." className={secondaryButtonClass}>
                        {interruptReleaseActionLabel}
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              </details>

              {job.job_type !== "service" ? (
                <TimedServiceStatusActions
                  jobId={job.id}
                  billingMode={billingMode}
                  jobType={job.job_type}
                  opsStatus={job.ops_status}
                  timingEnabled={timingEnabled}
                  onPhaseTiming={recordBlockingPhase}
                />
              ) : null}

              <details className="group">
                <summary className={`${mobileToolLinkClass} cursor-pointer list-none`}>
                  <span className="inline-flex items-center gap-2"><UserIcon className="h-4.5 w-4.5" />Assigned Team</span>
                </summary>
                <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-3">
                  {assignedTeam.length > 0 ? (
                    <div className="space-y-2">
                      {assignedTeam.map((assignee) => (
                        <div key={`mobile-${assignee.job_id}-${assignee.user_id}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-base font-semibold text-slate-800">
                          {formatPersonNamePart(assignee.display_name)}
                          {assignee.is_primary ? <span className="ml-2 text-sm text-slate-500">Primary</span> : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={workspaceEmptyStateClass}>No team assigned yet.</div>
                  )}
                  {isInternalUser ? (
                    <Suspense fallback={<div className="h-12 animate-pulse rounded-xl bg-slate-100" />}>
                      <DeferredAddAssigneeForm
                        jobId={String(job.id)}
                        tab={tab}
                        assignedUserIds={assignedUserIds}
                      />
                    </Suspense>
                  ) : null}
                </div>
              </details>

              <details id="mobile-tools-timeline" className="group">
                <summary className={`${mobileToolLinkClass} cursor-pointer list-none`}>
                  <span className="inline-flex items-center gap-2"><FolderIcon className="h-4.5 w-4.5" />Timeline / History</span>
                </summary>
                <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-3">
                  <Suspense fallback={<NarrativeTimelineBodyFallback />}>
                    <DeferredTimelineBody
                      jobId={String(job.id)}
                      timelineJobIds={narrativeScopeJobIds}
                      hasDirectNarrativeChain={hasDirectNarrativeChain}
                      emptyStateClassName={workspaceEmptyStateClass}
                      jobSummary={{
                        id: String(job.id),
                        status: job.status ?? null,
                        ops_status: job.ops_status ?? null,
                        field_complete: Boolean(job.field_complete),
                        scheduled_date: job.scheduled_date ?? null,
                        window_start: job.window_start ?? null,
                        window_end: job.window_end ?? null,
                        parent_job_id: job.parent_job_id ?? null,
                        pending_info_reason: job.pending_info_reason ?? null,
                        on_hold_reason: job.on_hold_reason ?? null,
                      }}
                    />
                  </Suspense>
                </div>
              </details>

              {job.job_type === "ecc" && (showRetestSection || showCorrectionReviewResolution) ? (
                <details className="group">
                  <summary className={`${mobileToolLinkClass} cursor-pointer list-none`}>
                    <span className="inline-flex items-center gap-2"><WarningIcon className="h-4.5 w-4.5" />Failure Resolution</span>
                  </summary>
                  <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-3 space-y-3">
                    {showRetestSection ? (
                      <form action={createRetestJobFromForm} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                        <input type="hidden" name="parent_job_id" value={job.id} />
                        <label className="flex items-center gap-2 text-base text-slate-700">
                          <input type="checkbox" name="copy_equipment" value="1" defaultChecked />
                          Copy equipment
                        </label>
                        <SubmitButton loadingText="Creating..." className={darkButtonClass}>
                          Create Retest Job
                        </SubmitButton>
                      </form>
                    ) : null}
                    {showCorrectionReviewResolution ? (
                      <form action={resolveFailureByCorrectionReviewFromForm} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                        <input type="hidden" name="job_id" value={job.id} />
                        <label className={workspaceFieldLabelClass}>Review Note</label>
                        <textarea name="review_note" rows={3} className={workspaceTextareaClass} />
                        <SubmitButton loadingText="Submitting..." className={darkButtonClass}>
                          Resolve by Correction Review
                        </SubmitButton>
                      </form>
                    ) : null}
                  </div>
                </details>
              ) : null}
            </div>
          </details>
        </div>
      </div>

      <div className="hidden space-y-5 lg:block">

<section className={`${workspaceSectionClass} relative mb-6 overflow-hidden border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.96))] shadow-[0_26px_64px_-42px_rgba(15,23,42,0.44)] ring-1 ring-blue-100/70`}>
  <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0f1f35,#2563eb)]" />
  <div className="mb-3 grid gap-4 border-b border-slate-200/80 pb-4 xl:grid-cols-[minmax(0,1fr)_minmax(21rem,0.38fr)] xl:items-start">
    <div className="min-w-0">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-800">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#0f1f35] text-blue-100">
          <ToolIcon className="h-3 w-3" />
        </span>
        <span>Job Workbench</span>
      </div>
      <h1 className="max-w-5xl text-[clamp(1.3rem,1.75vw,1.75rem)] font-semibold leading-tight text-[#0f1f35]">
        {jobWorkbenchTitle}
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold tracking-[0.06em] text-slate-700">
          {jobHeaderReference}
        </div>
        <div className="inline-flex rounded-full border border-slate-200/90 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
          {headerJobTypeLabel}
        </div>
      </div>
    </div>
    <div id="field-status-actions" className="relative flex w-full flex-col gap-2.5 overflow-hidden rounded-2xl border border-blue-100 bg-white p-3 shadow-[0_20px_40px_-31px_rgba(29,78,216,0.36)] xl:items-stretch">
      <span className="absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,#0f1f35,#2563eb)]" />
      <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-900/55">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[#0f1f35] text-blue-100">
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </span>
        <span>Primary Next Action</span>
      </div>
        {completionActionAttentionBanner ? (
          <div
            data-completion-action-banner="true"
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-900"
          >
            <div className="font-semibold">{completionActionAttentionBanner.title}</div>
            <div className="mt-1">{completionActionAttentionBanner.message}</div>
          </div>
        ) : null}
        {!isFieldComplete && job.status !== "completed" ? (
          <div className="hidden w-full gap-2 sm:flex sm:items-stretch">
            <JobFieldActionButton
              jobId={job.id}
              currentStatus={job.status}
              tab={tab}
              hasFullSchedule={hasFullSchedule}
              variant="commandBar"
            />
            {job.job_type === "ecc" ? (
              <Link
                href={`/jobs/${job.id}/tests`}
                className={`${compactWorkspaceActionButtonClass} min-h-11 shrink-0 px-4 shadow-[0_12px_24px_-20px_rgba(15,31,53,0.35)]`}
              >
                Open Tests Workspace
              </Link>
            ) : null}
          </div>
        ) : null}
        {showFieldOutcomePanel ? (
          <FieldOutcomePanel
            jobId={String(job.id)}
            currentStatus={String(job.status ?? "")}
            tab={tab}
            isEccJob={job.job_type === "ecc"}
            showDifferentIssueFoundOutcome={showDifferentIssueFoundOutcome}
            className="hidden w-full sm:block"
          />
        ) : null}
        {isFieldComplete || job.status === "completed" ? (
          <div className="hidden w-full sm:flex">
            <span className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-sm font-semibold text-emerald-900">
              Field work complete - invoice/certs can be handled as needed.
            </span>
          </div>
        ) : null}
        {job.job_type === "ecc" && (isFieldComplete || job.status === "completed") ? (
          <div className="hidden w-full sm:flex">
            <Link
              href={`/jobs/${job.id}/tests`}
              className={`${compactWorkspaceActionButtonClass} min-h-11 w-full shadow-[0_12px_24px_-20px_rgba(15,31,53,0.35)]`}
            >
              Open Tests Workspace
            </Link>
          </div>
        ) : null}

        <div className="hidden w-full flex-wrap gap-2 border-t border-slate-200/80 pt-2.5 sm:flex">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/ops"
              className={`${compactUtilityButtonClass} shadow-[0_8px_18px_-18px_rgba(15,23,42,0.28)]`}
            >
              Back to Ops
            </Link>

            {job.customer_id ? (
              <Link
                href={`/customers/${job.customer_id}`}
                className={`${compactUtilityButtonClass} shadow-[0_8px_18px_-18px_rgba(15,23,42,0.28)]`}
              >
                Open Customer
              </Link>
            ) : null}

            {createEstimateFromJobHref ? (
              <Link
                href={createEstimateFromJobHref}
                className={`${compactUtilityButtonClass} shadow-[0_8px_18px_-18px_rgba(15,23,42,0.28)]`}
              >
                Create Estimate
              </Link>
            ) : null}
          </div>
        </div>

        <details className="sm:hidden">
          <summary className="mt-2 inline-flex min-h-12 w-full cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200">
            More job actions
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <Link href="/ops" className={compactUtilityButtonClass}>
              Back to Ops
            </Link>

            {job.customer_id ? (
              <Link href={`/customers/${job.customer_id}`} className={compactUtilityButtonClass}>
                Open Customer
              </Link>
            ) : null}

            {createEstimateFromJobHref ? (
              <Link href={createEstimateFromJobHref} className={compactUtilityButtonClass}>
                Create Estimate
              </Link>
            ) : null}

            {job.job_type === "ecc" ? (
              <Link href={`/jobs/${job.id}/tests`} className={compactWorkspaceActionButtonClass}>
                Open Tests Workspace
              </Link>
            ) : null}
          </div>
        </details>
    </div>
  </div>

  <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.99))] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_18px_36px_-34px_rgba(15,23,42,0.32)] sm:px-4">
    <div className="mb-2 flex items-center gap-2">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
        <ClockIcon className="h-3.5 w-3.5" />
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0f1f35]">Schedule & Workflow</span>
    </div>
    <div className="grid gap-2 lg:grid-cols-3">
      {/* Appointment — full card on all breakpoints */}
      <div className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.3)]">
        <span className="absolute inset-x-0 top-0 h-[2px] bg-blue-600/70" />
        <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-900/55"><ClockIcon className="h-3.5 w-3.5 text-blue-700" />Appointment</div>
        <div className="mt-0.5 min-w-0 text-[1rem] font-semibold tracking-[-0.01em] text-slate-950">
          {appointmentDateLabel}
        </div>
        <div className="mt-0.5 text-sm font-medium text-slate-600">
          {appointmentTimeLabel}
          {job.scheduled_date ? ` - ${hasFullSchedule ? "Confirmed window" : "Window pending"}` : ""}
        </div>
      </div>

      {/* Workflow — full card on lg+; compressed chip on mobile */}
      <div className="relative hidden overflow-hidden rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.3)] lg:block">
        <span className="absolute inset-x-0 top-0 h-[2px] bg-blue-600/70" />
        <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-900/55"><SettingsIcon className="h-3.5 w-3.5 text-blue-700" />Workflow</div>
        <div
          className={`mt-0.5 inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
            ["invoice_required", "pending_info"].includes(String(job.ops_status ?? "").toLowerCase())
              ? "border-amber-300 bg-amber-100 text-amber-800"
              : String(job.ops_status ?? "").toLowerCase() === "pending_office_review"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-blue-100 bg-blue-50 text-blue-800"
          }`}
        >
          {workflowChipLabel}
        </div>
        <div className="mt-3 flex w-full flex-col items-start gap-2">
          {onTheWayUndoEligibility.eligible ? (
            <div className="flex w-full flex-col items-start gap-2">
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

              <div className="text-xs text-slate-500 xl:text-right">
                Available only until any later job activity occurs.
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Field — full card on lg+; compressed chip on mobile */}
      <div className="relative hidden overflow-hidden rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.3)] lg:block">
        <span className="absolute inset-x-0 top-0 h-[2px] bg-blue-600/70" />
        <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-900/55"><ClipboardIcon className="h-3.5 w-3.5 text-blue-700" />Field</div>
        <div className={`mt-0.5 text-sm font-semibold ${isFieldComplete ? "text-emerald-800" : "text-blue-700"}`}>
          {formatStatus(job.status)}
        </div>
        <div className="mt-0.5 text-xs leading-5 text-slate-600">
          {isFieldComplete ? "Field work complete" : "Field work open"}
        </div>
      </div>
    </div>

    {/* Mobile-only: Workflow + Field chip summary row (hidden on lg+) */}
    <div className="mt-2 flex flex-wrap gap-2 lg:hidden">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-xs">
        <SettingsIcon className="h-3.5 w-3.5 text-blue-700" />
        <span className="font-semibold uppercase tracking-[0.08em] text-blue-900/55">Workflow</span>
        <span className="font-semibold text-slate-900">{formatOpsStatusLabel(job.ops_status)}</span>
      </div>
      <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-xs">
        <ClipboardIcon className="h-3.5 w-3.5 text-blue-700" />
        <span className="font-semibold uppercase tracking-[0.08em] text-blue-900/55">Field</span>
        <span className={`font-semibold ${isFieldComplete ? "text-emerald-800" : "text-blue-700"}`}>{formatStatus(job.status)}</span>
      </div>
    </div>

    {job.job_type === "service" ? (
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-blue-100 bg-blue-50/45 px-3 py-2 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-[0.1em] text-blue-800">
          <ToolIcon className="h-3.5 w-3.5" />
          <span>Work & Invoice</span>
        </span>
        <span className="font-semibold text-slate-900">{visitScopeBadgeMainText}</span>
        <a
          href="#visit-scope-section"
          className="text-xs font-semibold text-blue-700 underline-offset-2 transition-colors hover:text-blue-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
        >
          {hasVisitScopeDefined ? "View details" : "Add details"}
        </a>
      </div>
    ) : null}

  </div>

  <div className="mb-4 grid gap-2 sm:hidden">
    {mobileCallHref ? (
      <a
        href={mobileCallHref}
        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200/80 bg-white px-3 py-3 text-sm font-semibold text-slate-900 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.25)] transition-[border-color,box-shadow,transform,background-color] hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px]"
      >
        Call
      </a>
    ) : (
      <span className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-400">
        Call
      </span>
    )}

    {mobileTextHref ? (
      <a
        href={mobileTextHref}
        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200/80 bg-white px-3 py-3 text-sm font-semibold text-slate-900 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.25)] transition-[border-color,box-shadow,transform,background-color] hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px]"
      >
        Text
      </a>
    ) : (
      <span className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-400">
        Text
      </span>
    )}

    {mobileNavigateHref ? (
      <a
        href={mobileNavigateHref}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200/80 bg-white px-3 py-3 text-sm font-semibold text-slate-900 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.25)] transition-[border-color,box-shadow,transform,background-color] hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px]"
      >
        Navigate
      </a>
    ) : (
      <span className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-400">
        Navigate
      </span>
    )}
  </div>

  <div className="mb-3 mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-4 sm:mt-0 sm:border-t-0 sm:pt-0">
    <div className="flex items-center gap-2">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0f1f35] text-blue-100">
        <ToolIcon className="h-3.5 w-3.5" />
      </span>
      <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0f1f35]">
        <span>Field Operations Board</span>
      </div>
    </div>
    <div className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-blue-800 sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.1em]">
      {equipmentCount} equipment / {assignedTeam.length} assigned
    </div>
  </div>

  <div className="mb-4 grid items-start gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/55 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] xl:grid-cols-[minmax(300px,0.9fr)_minmax(420px,1.04fr)_minmax(360px,1.16fr)]">
    {/* Left: customer / contact info */}
    <div className={`${workspaceSubtleCardClass} relative overflow-hidden border-slate-200/70 bg-white p-3 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.28)] sm:p-4`}>
      <span className="absolute inset-x-0 top-0 h-[3px] bg-blue-600/70" />
      <div className="hidden text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-900/55 sm:block">
        {(job.job_type ? String(job.job_type).toUpperCase() : "SERVICE")}
        {serviceCity ? ` • ${serviceCity}` : ""}
      </div>
      <div className="mt-2 hidden items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0f1f35] sm:inline-flex"><UserIcon className="h-3.5 w-3.5 text-blue-700" />Customer / Account</div>

      {job.customer_id ? (
        <Link
          href={`/customers/${job.customer_id}`}
          className="mt-1.5 hidden text-[1.5rem] font-semibold leading-tight tracking-[-0.01em] text-slate-950 hover:underline sm:block"
        >
          {customerDisplayName}
        </Link>
      ) : (
        <div className="mt-1.5 hidden text-[1.5rem] font-semibold leading-tight tracking-[-0.01em] text-slate-950 sm:block">{customerDisplayName}</div>
      )}

      <div className="mt-2.5 space-y-2 border-t border-slate-200/70 pt-2.5 text-sm sm:mt-3 sm:space-y-2.5 sm:pt-3">
        <div className="rounded-lg border border-slate-200/70 bg-slate-50/70 px-2.5 py-2 shadow-[inset_3px_0_0_rgba(37,99,235,0.14)] sm:px-3 sm:py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-900/55">Account Contact</div>
          <div className="mt-1.5 space-y-2 text-sm text-slate-600">
            {customerPhone !== "—" ? (
              <div className="flex w-full items-center gap-1.5">
                <PhoneIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Phone</span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-6 text-slate-900" title={customerPhone}>{customerPhone}</span>
              </div>
            ) : null}
            {customerEmail !== "—" ? (
              <div className="flex w-full items-center gap-1.5">
                <MessageIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Email</span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-6 text-slate-900" title={customerEmail}>{customerEmail}</span>
              </div>
            ) : null}
          </div>

          <div className="mt-2 hidden flex-wrap gap-1.5 sm:flex">
            {telLink ? (
              <a href={telLink} className={`${compactSecondaryButtonClass} text-[13px]`}>
                Call
              </a>
            ) : null}
            {customerPhone !== "—" ? (
              <a href={`sms:${accountPhoneDigits}`} className={`${compactSecondaryButtonClass} text-[13px]`}>
                Text
              </a>
            ) : null}
            {accountEmailLink ? (
              <a href={accountEmailLink} className={`${compactSecondaryButtonClass} text-[13px]`}>
                Email
              </a>
            ) : null}
          </div>
        </div>

        {showSiteAccessCard ? (
          <div className="rounded-lg border border-slate-200/70 bg-slate-50/70 px-2.5 py-2 shadow-[inset_3px_0_0_rgba(37,99,235,0.14)] sm:px-3 sm:py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-900/55">Site / Access Contact</div>
            {primarySiteAccessName ? (
              <div className="mt-1 font-semibold text-slate-900">{primarySiteAccessName}</div>
            ) : null}
            <div className="mt-1 grid gap-x-4 gap-y-1 text-xs text-slate-600 sm:mt-1.5 sm:grid-cols-2">
              {primarySiteAccessPhone ? (
                <div>
                  <span className="font-semibold text-slate-500">Access phone:</span> {primarySiteAccessPhone}
                </div>
              ) : null}
              {primarySiteAccessEmail ? (
                <div className="break-all">
                  <span className="font-semibold text-slate-500">Access email:</span> {primarySiteAccessEmail}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {showCombinedContractorBillingCard ? (
          <div className="rounded-lg border border-slate-200/70 bg-slate-50/70 px-2.5 py-2 shadow-[inset_3px_0_0_rgba(37,99,235,0.14)] sm:px-3 sm:py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-900/55">Contractor / Billing</div>
            <div className="mt-1 font-semibold text-slate-900">{billingRecipientDisplayName || contractorName}</div>
            <div className="mt-1 grid gap-x-4 gap-y-1 text-xs text-slate-600 sm:mt-1.5 sm:grid-cols-2">
              {billingRecipientPhone ? (
                <div>
                  <span className="font-semibold text-slate-500">Phone:</span> {billingRecipientPhone}
                </div>
              ) : null}
              {billingRecipientEmail ? (
                <div className="break-all">
                  <span className="font-semibold text-slate-500">Email:</span> {billingRecipientEmail}
                </div>
              ) : null}
            </div>
            {billingRecipientAddress ? (
              <div className="mt-1 text-xs text-slate-600">
                <span className="font-semibold text-slate-500">Address:</span> {billingRecipientAddress}
              </div>
            ) : null}
          </div>
        ) : null}

        {showBillingRecipientCard && !showCombinedContractorBillingCard ? (
          <div className="rounded-lg border border-slate-200/70 bg-slate-50/70 px-2.5 py-2 shadow-[inset_3px_0_0_rgba(37,99,235,0.14)] sm:px-3 sm:py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-900/55">Billing</div>
            {hasJobBillingRecipient ? (
              <>
                {billingRecipientDisplayName ? (
                  <div className="mt-1 font-semibold text-slate-900">{billingRecipientDisplayName}</div>
                ) : null}
                <div className="mt-1 grid gap-x-4 gap-y-1 text-xs text-slate-600 sm:mt-1.5 sm:grid-cols-2">
                  {billingRecipientPhone ? (
                    <div>
                      <span className="font-semibold text-slate-500">Phone:</span> {billingRecipientPhone}
                    </div>
                  ) : null}
                  {billingRecipientEmail ? (
                    <div className="break-all">
                      <span className="font-semibold text-slate-500">Email:</span> {billingRecipientEmail}
                    </div>
                  ) : null}
                </div>
                {billingRecipientAddress ? (
                  <div className="mt-1 text-xs text-slate-600">
                    <span className="font-semibold text-slate-500">Address:</span> {billingRecipientAddress}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="mt-1 space-y-1 text-xs text-slate-600">
                <div>
                  <span className="font-semibold text-slate-500">Billing contact on account:</span>{" "}
                  {accountBillingContactName || "Saved billing contact"}
                  {accountBillingContactEmail ? ` - ${accountBillingContactEmail}` : ""}
                  {accountBillingContactPhone ? ` - ${accountBillingContactPhone}` : ""}
                </div>
                <div>Invoice routing still follows the job/invoice billing recipient fields.</div>
              </div>
            )}
          </div>
        ) : null}

        {contractorId && !showCombinedContractorBillingCard ? (
          <div className="rounded-lg border border-slate-200/70 bg-slate-50/70 px-2.5 py-2 shadow-[inset_3px_0_0_rgba(37,99,235,0.14)] sm:px-3 sm:py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-900/55">Contractor</div>
            <div className="mt-1 font-semibold text-slate-800">{contractorName}</div>
          </div>
        ) : null}
      </div>

      <div className="mt-3 hidden flex-wrap gap-2 sm:flex sm:gap-1.5 lg:gap-2">
        {accessTelLink ? (
          <a
            href={accessTelLink}
            className={compactSecondaryButtonClass}
          >
            Access Call
          </a>
        ) : null}

        {hasSeparateAccessPhone ? (
          <a
            href={`sms:${accessPhoneDigits}`}
            className={compactSecondaryButtonClass}
          >
            Access Text
          </a>
        ) : null}
      </div>

      <div className="mt-3 rounded-xl border border-slate-200/80 bg-white px-3 py-3 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.26)]">
        <div className="mb-2 flex items-center gap-2 border-b border-slate-200/70 pb-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
            <PhoneIcon className="h-3.5 w-3.5" />
          </span>
          <div>
            <div className="text-sm font-semibold text-[#0f1f35]">Contact Logging</div>
            <div className="text-xs text-slate-500">Customer account for this visit.</div>
          </div>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50/35 px-3 py-2.5 shadow-[inset_3px_0_0_rgba(37,99,235,0.16)]">
          <ContactLoggingQuickActions
            jobId={String(job.id)}
            attemptCount={attemptCount}
            lastAttemptLabel={lastAttemptLabel}
            action={logCustomerContactAttemptFromForm}
            buttonClassName={`${compactSecondaryButtonClass} inline-flex min-h-9 items-center justify-center w-full text-xs sm:w-auto`}
          />
        </div>
      </div>

      <div className="mt-4 border-t border-slate-200/80 pt-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-slate-700 ring-1 ring-slate-200">
            <UserIcon className="h-3.5 w-3.5" />
          </span>
          <div>
            <div className="text-sm font-semibold text-[#0f1f35]">Team Assignment</div>
            <div className="text-xs text-slate-500">Field ownership for this visit.</div>
          </div>
        </div>
      </div>

      <div id="assigned-team" className="rounded-lg border border-slate-200/70 bg-slate-50/70 px-2.5 py-2 sm:px-3 sm:py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-slate-900">Assigned Team</div>
            <div className="mt-0.5 text-xs text-slate-600">Technicians assigned to the job.</div>
          </div>
          <div className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[9.5px] font-semibold text-slate-600 sm:px-2.5 sm:py-1 sm:text-[10px]">{assignedTeam.length > 0 ? `${assignedTeam.length} assigned` : "Awaiting assignment"}</div>
        </div>
        {assignedTeam.length > 0 ? (
          <div className="mt-3 flex min-w-0 flex-wrap gap-2">
            {assignedTeam.map((assignee) => (
              <div
                key={`${assignee.job_id}-${assignee.user_id}`}
                className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/72 px-3 py-2 text-sm text-slate-800 shadow-[0_8px_20px_-24px_rgba(15,23,42,0.22)]"
              >
                <span className="max-w-full break-words">{formatPersonNamePart(assignee.display_name)}</span>
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
                    <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#assigned-team`} />
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
                    <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#assigned-team`} />
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
          <div className={`mt-3 ${workspaceEmptyStateClass}`}>No team assigned yet.</div>
        )}

        {isInternalUser ? (
          <Suspense
            fallback={
              <div className="mt-3 flex min-w-0 animate-pulse flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="h-10 w-full rounded-lg bg-slate-100 sm:w-56" />
                <div className="h-4 w-28 rounded bg-slate-100" />
                <div className="h-10 w-full rounded-lg bg-slate-100 sm:w-20" />
              </div>
            }
          >
            <DeferredAddAssigneeForm
              jobId={String(job.id)}
              tab={tab}
              assignedUserIds={assignedUserIds}
            />
          </Suspense>
        ) : null}
      </div>

      {roleContactSections.map((section, index) => (
        <RoleContactsCard
          key={section.title}
          title={section.title}
          recipients={section.recipients}
          className={index === 0 ? "mt-3 bg-white/70" : "mt-2 bg-white/65"}
        />
      ))}

    </div>

    {/* Center: destination panel */}
    <div className="space-y-4 sm:space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_20px_44px_-32px_rgba(15,23,42,0.32)] ring-1 ring-blue-100/50">
        <span className="absolute inset-x-0 top-0 z-10 h-[3px] bg-[linear-gradient(90deg,#0f1f35,#2563eb)]" />
        <div className="absolute left-3 top-3 z-10">
          <div className="rounded-full border border-blue-100/80 bg-white/88 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-900 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.3)] backdrop-blur-sm">
            Service Location
          </div>
        </div>
        <div className="bg-[linear-gradient(180deg,#f8fafc,#eef6ff)] p-3">
          <Suspense
            fallback={
              <JobLocationPreviewFallback
                addressLine1={serviceAddressLine1}
                addressLine2={serviceAddressLine2}
                city={serviceCity}
                state={serviceState}
                zip={serviceZip}
                showAddressOverlay
                className="[&>div:last-child]:pt-1"
              />
            }
          >
            <TimedJobLocationPreview
              addressLine1={serviceAddressLine1}
              addressLine2={serviceAddressLine2}
              city={serviceCity}
              state={serviceState}
              zip={serviceZip}
              showAddressOverlay
              className="[&>div:last-child]:pt-1"
              timingEnabled={timingEnabled}
              onPhaseTiming={recordBlockingPhase}
            />
          </Suspense>
        </div>
      </div>

      <div id="visit-reason-card" className={`${workspaceSubtleCardClass} relative overflow-hidden border-slate-200/70 bg-white p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.24)]`}>
        <span className="absolute inset-x-0 top-0 h-[3px] bg-blue-600/70" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0f1f35]">
              <ClipboardIcon className="h-3.5 w-3.5 text-blue-700" />
              <span>Visit Reason</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isInternalUser ? (
              <details className="group">
                <summary className="cursor-pointer list-none rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-[0_8px_18px_-18px_rgba(15,23,42,0.24)] transition-colors hover:border-blue-200 hover:bg-white hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200">
                  Edit
                </summary>
                <form action={updateJobVisitScopeFromForm} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:w-[22rem]">
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="tab" value={tab} />
                  <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#visit-reason-card`} />
                  <input type="hidden" name="visit_scope_items_json" value={visitScopeItemsJsonForInlineEdit} />
                  <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Visit Reason / Visit Title
                  </label>
                  <textarea
                    name="visit_scope_summary"
                    defaultValue={visitScopeSummary ?? ""}
                    rows={3}
                    maxLength={600}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <SubmitButton loadingText="Saving..." className={primaryButtonClass}>
                      Save
                    </SubmitButton>
                    <a href="#visit-reason-card" className="text-xs font-semibold text-slate-600 transition-colors hover:text-slate-900">
                      Cancel
                    </a>
                  </div>
                </form>
              </details>
            ) : null}
            {job.job_type === "service" ? (
              <a
                href="#visit-scope-section"
                className="hidden shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-[0_8px_18px_-18px_rgba(15,23,42,0.24)] transition-colors hover:border-blue-200 hover:bg-white hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 sm:inline-flex"
              >
                Work Items
              </a>
            ) : null}
          </div>
        </div>

        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-blue-100 bg-blue-50/35 px-3 py-2.5 whitespace-pre-wrap break-words text-base leading-7 text-slate-900 shadow-[inset_3px_0_0_rgba(37,99,235,0.18)]">
            {visitReasonText}
          </div>

          {shouldShowCustomerConcern ? (
            <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-900/55">
                Customer Concern
              </div>
              <div className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-800">
                {jobTitleText}
              </div>
            </div>
          ) : null}

          {shouldShowIntakeNotes ? (
            <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-900/55">
                Intake Notes
              </div>
              <div className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-800">
                {jobNotesText}
              </div>
            </div>
          ) : null}

          {shouldShowWorkSummary ? (
            <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-900/55">
                Work Summary
              </div>
              <div className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-800">
                {visitScopeSummary}
              </div>
            </div>
          ) : null}
        </div>
      </div>

    </div>

    {/* Visit scope workspace */}
    {isInternalUser ? (
      <div id="visit-scope-section" className="relative scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.26)] xl:order-4 xl:col-span-3">
        <span className="absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,#0f1f35,#2563eb)]" />
        <div className="space-y-3">
          {job.job_type === "service" && visitScopeCount === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 shadow-[inset_3px_0_0_rgba(217,119,6,0.22)]">
              Add Work Items before closeout or billing.
            </div>
          ) : null}

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0f1f35]"><span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100"><ToolIcon className="h-3.5 w-3.5" /></span>Work & Invoice</div>
                {job.job_type === "service" ? (
                  <span className="hidden rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-800 sm:inline-flex">
                    {visitScopeCount > 0 ? "Work Items Set" : "No Work Items Yet"}
                  </span>
                ) : null}
              </div>
            </div>

            <details className="group w-full">
              <summary className="inline-flex min-h-11 w-full cursor-pointer list-none items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold uppercase tracking-[0.08em] text-slate-700 shadow-[0_10px_22px_-22px_rgba(15,23,42,0.28)] transition-colors hover:border-blue-200 hover:bg-blue-50/40 hover:text-blue-800 active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 sm:min-h-9 sm:w-auto sm:py-1.5 sm:text-xs">
                {hasVisitScopeDefined ? "Add or Update Work" : "Add Work"}
              </summary>

              <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
                <VisitScopeJobDetailForm
                  jobId={job.id}
                  jobType={job.job_type === "service" ? "service" : "ecc"}
                  tab={tab}
                  initialSummary={visitScopeSummary}
                  initialItems={visitScopeItems}
                  pricebookTemplateItems={visitScopePricebookTemplates}
                  primaryButtonClass={primaryButtonClass}
                />
              </div>
            </details>

          </div>

          {showInternalInvoicePanel ? (
            <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-3.5 py-3 shadow-[inset_3px_0_0_rgba(37,99,235,0.16)]">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,0.45fr)_auto] lg:items-center">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700">Work performed - price - invoice status</div>
                  <div className="mt-1 text-sm font-semibold text-slate-950">{jobPageInvoiceStateLabel}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">{jobPageInvoiceSummaryText}</div>
                </div>
                <div className="rounded-xl border border-white/80 bg-white/82 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Ready-to-invoice total</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-950">{formatCurrencyFromCents(internalInvoiceTruth?.total_cents ?? visitScopeReadyTotalCents)}</div>
                  <div className="mt-0.5 text-[11px] leading-4 text-slate-500">
                    {internalInvoiceTruth ? "From invoice charges" : "From priced Work Items"}
                  </div>
                </div>
                <div className="flex flex-col gap-2 lg:items-end">
                  {hasDirectInvoiceWorkflowAccess ? (!internalInvoiceTruth ? (
                    <form action={createInternalInvoiceDraftFromForm}>
                      <input type="hidden" name="job_id" value={job.id} />
                      <input type="hidden" name="tab" value={tab} />
                      <input type="hidden" name="return_to" value={`/jobs/${job.id}/invoice#invoice-workspace`} />
                      <input type="hidden" name="auto_import_visit_scope_items" value="1" />
                      <SubmitButton loadingText="Starting..." className={darkButtonClass}>
                        {jobPageInvoiceNextAction}
                      </SubmitButton>
                    </form>
                  ) : (
                    <Link href={`/jobs/${job.id}/invoice#invoice-workspace`} className={darkButtonClass}>
                      {jobPageInvoiceNextAction}
                    </Link>
                  )) : hasProposalEntryWorkflowAccess ? (
                    <Link href="#field-billing-summary-title" className={darkButtonClass}>
                      Add Proposed Charge
                    </Link>
                  ) : null}
                  <div className="text-[11px] leading-4 text-slate-500 lg:text-right">
                    Invoice workspace handles official review, issue, send, and collection.
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {hasVisitScopeDefined ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-[0_14px_28px_-32px_rgba(15,23,42,0.24)]">
            <div className="space-y-3.5">
              {primaryVisitScopeItems.length > 0 ? (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-900/55">Work Items</div>
                  <div className="mt-2 space-y-2.5">
                    {primaryVisitScopeItems.map((item, index) => (
                      <div key={`primary-${index}-${item.title}`} className="space-y-1 rounded-xl border border-slate-200/80 bg-slate-50/72 px-3 py-2.5 shadow-[inset_3px_0_0_rgba(37,99,235,0.12)]">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold leading-5 text-slate-900">{item.title}</div>
                          {item.expected_unit_price !== null && item.expected_unit_price !== undefined ? (
                            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-700">
                              Price ${Number(item.expected_unit_price).toFixed(2)}
                            </span>
                          ) : null}
                        </div>
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
                        <div key={`companion-${companionIndex}-${item.title}`} className="space-y-1 rounded-xl border border-slate-200/80 bg-slate-50/72 px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold leading-5 text-slate-900">{item.title}</div>
                            <div className="text-xs text-slate-500">{formatVisitScopeItemKindLabel(item.kind)}</div>
                            {item.expected_unit_price !== null && item.expected_unit_price !== undefined ? (
                              <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-700">
                                Price ${Number(item.expected_unit_price).toFixed(2)}
                              </span>
                            ) : null}
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
          ) : (
            <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50/35 px-3 py-2.5 text-xs text-blue-900">
              No work items added yet.
            </div>
          )}

        </div>
      </div>
    ) : null}

    {/* Right: quick reference rail */}
    <div className="space-y-3 xl:order-3 xl:flex xl:h-full xl:self-stretch xl:flex-col xl:space-y-0 xl:gap-3">
      {job.job_type === "ecc" ? (
        <div className={`${workspaceSubtleCardClass} relative overflow-hidden border-slate-200/70 p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.24)] ${hasPermitDetails ? "bg-white" : "bg-slate-50/88"}`}>
          <span className="absolute inset-x-0 top-0 h-[3px] bg-blue-600/70" />
                <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0f1f35]"><ClipboardIcon className="h-3.5 w-3.5 text-blue-700" />Permit Quick Ref</div>
              <div className="mt-1 text-sm text-slate-600">
                Permit number
              </div>
            </div>
            <span className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-800">
              ECC
            </span>
          </div>

          <div className="rounded-lg border border-slate-200/80 bg-slate-50/72 px-3 py-2 shadow-[inset_3px_0_0_rgba(37,99,235,0.14)]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-blue-900/55">Number</div>
            <div className="mt-0.5 text-sm font-semibold text-slate-900">{permitNumber || "Not added"}</div>
          </div>
        </div>
      ) : null}

      <div id="internal-notes" className={`${workspaceSubtleCardClass} relative overflow-hidden border-slate-200/70 bg-white p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.24)] xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:justify-start`}>
        <span className="absolute inset-x-0 top-0 h-[3px] bg-blue-600/70" />
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0f1f35]"><ChatIcon className="h-3.5 w-3.5 text-blue-700" />{rightRailNotesTitle}</div>
            <div className="mt-1 text-[15px] leading-6 text-slate-600">{rightRailNotesSubtitle}</div>
          </div>
          <span className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-800">
            {rightRailNoteCount} notes
          </span>
        </div>
        <div className="space-y-2 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
          {latestJobNotesPreview.map((preview, index) => (
            <div
              key={`${preview.createdAt || "note"}-${preview.label}-${preview.text.slice(0, 40)}-${index}`}
              className="rounded-lg border border-slate-200/80 bg-slate-50/72 px-3 py-2 text-sm text-slate-700 shadow-[inset_3px_0_0_rgba(37,99,235,0.12)]"
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-blue-900/55">{preview.label}</div>
              <div className="mt-0.5 break-words leading-6">{preview.text}</div>
            </div>
          ))}
          {!hasAnyRightRailNotes ? (
            <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50/35 px-3 py-2 text-xs text-blue-900">
              {rightRailNotesEmptyText}
            </div>
          ) : null}
          {hasAnyRightRailNotes && rightRailNoteCount > latestJobNotesPreview.length ? (
            <div className="rounded-lg border border-slate-200/80 bg-slate-50/72 px-3 py-2 text-xs text-slate-600 shadow-[inset_3px_0_0_rgba(37,99,235,0.12)]">
              Showing latest {latestJobNotesPreview.length} of {rightRailNoteCount} notes.
            </div>
          ) : null}
        </div>
        <details className="mt-3 rounded-xl border border-slate-200/80 bg-white/88 px-3 py-2.5 shadow-[0_10px_22px_-24px_rgba(15,23,42,0.25)]">
          <summary className="cursor-pointer list-none text-sm font-semibold text-slate-800 transition-colors hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200">
            View / Add Notes
          </summary>
          <div className="mt-3 space-y-3 border-t border-slate-200/80 pt-3">
            {internalNoteBannerMessage ? (
              <FlashBanner
                type={internalNoteBannerType as "success" | "warning" | "error"}
                message={internalNoteBannerMessage}
              />
            ) : null}

            <Suspense fallback={<div className="h-12 animate-pulse rounded-xl bg-slate-100" />}>
              <DeferredInternalNoteMentionComposer
                jobId={String(job.id)}
                tab={tab}
                accountOwnerUserId={internalUser.account_owner_user_id}
                textareaClassName={workspaceTextareaClass}
                selectClassName={workspaceInputClass}
                helperTextClassName="text-xs text-slate-500"
                buttonClassName={secondaryButtonClass}
              />
            </Suspense>

            <Suspense fallback={<NarrativeNotesBodyFallback />}>
              <DeferredInternalNotesBody
                jobId={String(job.id)}
                timelineJobIds={narrativeScopeJobIds}
                hasDirectNarrativeChain={hasDirectNarrativeChain}
                emptyStateClassName={workspaceEmptyStateClass}
              />
            </Suspense>
          </div>
        </details>
      </div>
    </div>
  </div>

  {isInternalUser && job.job_type === "service" ? (
    <div id="next-service-action" className="mt-4 rounded-xl border border-slate-200/80 bg-white/96 px-4 py-3 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.28)] sm:mt-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"><ClockIcon className="h-3.5 w-3.5" />Next Service Action</div>

          <div className="mt-1 text-sm font-semibold text-slate-900">Create Return Visit</div>
        </div>
        {serviceCaseVisitCount > 1 ? (
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-slate-600 sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.08em]">
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
        <input type="hidden" name="visit_intent" value="return_visit" />
        <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}`} />

        <div className="space-y-1">
          <label className={workspaceFieldLabelClass}>Why is a return visit needed?</label>
          <input
            type="text"
            name="next_visit_reason"
            required
            maxLength={220}
            placeholder="Example: install ordered part, return to complete repair, customer approved work"
            className={workspaceInputClass}
          />
          <p className="text-xs leading-5 text-slate-600">
            Use when the original job is not finished yet and another visit is needed to complete it.
          </p>
          <p className="text-xs leading-5 text-slate-600">
            Examples: waiting on a part, customer approval, or more time needed to complete the same job.
          </p>
        </div>

        <SubmitButton loadingText="Creating..." className={`${darkButtonClass} w-full sm:w-auto`}>
          Create Return Visit
        </SubmitButton>
      </form>

      {callbackIntakeHistoricalAnchorEligible ? (
      <div className="mt-3 border-t border-slate-200 pt-3">
        <div className="text-sm font-semibold text-slate-900">Create Callback Visit</div>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          Use when the customer calls back after the job was believed complete.
        </p>
        <p className="text-xs leading-5 text-slate-600">
          This records the customer report and creates a new unscheduled office/dispatch callback item.
          It will not appear in technician My Work until it is scheduled and assigned.
        </p>

          <form action={createCallbackVisitFromForm} className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="tab" value={tab} />
            <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#next-service-action`} />

            <div className="space-y-1">
              <label className={workspaceFieldLabelClass}>What did the customer report?</label>
              <textarea
                name="callback_visit_reason"
                required
                maxLength={600}
                rows={3}
                placeholder="Example: customer says the same airflow issue returned after prior completion"
                className={workspaceTextareaClass}
              />
            </div>

            <SubmitButton loadingText="Creating..." className={`${darkButtonClass} w-full sm:w-auto`}>
              Create Callback Visit
            </SubmitButton>
          </form>
      </div>
      ) : null}
    </div>
  ) : null}

</section>
      {/* Header */}

      {/* Always-visible Top Actions */}

      {/* Closeout Actions (Internal Only) */}
    {showCloseoutRow && (
      <div id="closeout-actions" className="mt-3 min-w-0 scroll-mt-24 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 shadow-[0_12px_28px_-26px_rgba(15,23,42,0.35)]">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700"><SettingsIcon className="h-4 w-4" />Closeout</div>

      <div className="flex flex-wrap items-center gap-2">
        {/* ECC only: Certs */}
          {canShowCertsButton && (
            <form action={markCertsCompleteFromForm}>
              <input type="hidden" name="job_id" value={job.id} />
              <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#closeout-actions`} />
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
            <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#closeout-actions`} />
            <SubmitButton
              loadingText="Saving..."
              className={darkButtonClass}
            >
              ✓ Mark External Billing Complete
            </SubmitButton>
          </form>
        )}
      </div>
    </div>

    <div className="mt-2 text-xs leading-5 text-slate-600">
      Start with the Work Items for this visit. Closeout and billing come after the work is ready.
    </div>

    {showInternalInvoicingPlaceholder && String(job.ops_status ?? "").toLowerCase() !== "closed" ? (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs leading-5 text-amber-900">
        Internal invoicing mode is enabled for this company. Lightweight invoice-complete controls are hidden so
        this job uses the job-linked internal invoice panel instead of the external billing actions.
      </div>
    ) : null}
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

      {banner === "maintenance_visit_count_saved" && (
        <FlashBanner
          type="success"
          message="Visit counted. This service plan link now contributes one used visit."
        />
      )}

      {banner === "maintenance_visit_count_already_counted" && (
        <FlashBanner
          type="warning"
          message="This visit is already counted."
        />
      )}

      {banner === "maintenance_visit_count_unavailable" && (
        <FlashBanner
          type="warning"
          message="Maintenance Agreements are currently unavailable."
        />
      )}

      {banner === "maintenance_visit_count_missing_link" && (
        <FlashBanner
          type="warning"
          message="Missing service-plan link for this job."
        />
      )}

      {banner === "maintenance_visit_count_not_eligible" && (
        <FlashBanner
          type="warning"
          message="Not eligible to count from the current lifecycle state."
        />
      )}

      {banner === "maintenance_visit_count_excluded_or_reversed" && (
        <FlashBanner
          type="warning"
          message="This link is excluded or reversed and cannot be counted."
        />
      )}

      {banner === "maintenance_visit_count_out_of_scope" && (
        <FlashBanner
          type="warning"
          message="Out of scope for this account or customer."
        />
      )}

      {banner === "maintenance_visit_count_failed" && (
        <FlashBanner
          type="warning"
          message="Could not mark this visit counted."
        />
      )}

      {banner === "confirm_next_due_saved" && (
        <FlashBanner
          type="success"
          message="Service Plan next due date updated."
        />
      )}

      {banner === "confirm_next_due_already_confirmed" && (
        <FlashBanner
          type="warning"
          message="This visit has already confirmed the Service Plan next due date."
        />
      )}

      {banner === "confirm_next_due_stale_state" && (
        <FlashBanner
          type="warning"
          message="This suggestion is out of date. Refresh and review the latest next due date before confirming."
        />
      )}

      {banner === "confirm_next_due_not_counted" && (
        <FlashBanner
          type="warning"
          message="This visit must be counted before confirming the next due date."
        />
      )}

      {banner === "confirm_next_due_unavailable" && (
        <FlashBanner
          type="warning"
          message="Service Plan next due confirmation is currently unavailable."
        />
      )}

      {banner === "confirm_next_due_update_failed" && (
        <FlashBanner
          type="warning"
          message="Could not update the Service Plan next due date. Please try again."
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

      {banner === "callback_report_recorded" && (
        <FlashBanner
          type="success"
          message="Callback report recorded in job history only. No visit was created or scheduled."
        />
      )}

      {banner === "callback_visit_created" && (
        <FlashBanner
          type="success"
          message="Callback visit created. This is an unscheduled office/dispatch item and will not appear in technician My Work until scheduled and assigned."
        />
      )}

      {banner === "callback_visit_requires_historical_anchor" && (
        <FlashBanner
          type="warning"
          message="Callback visit creation is available only for service jobs that are field-complete, completed, or closed."
        />
      )}

      {banner === "callback_report_requires_historical_anchor" && (
        <FlashBanner
          type="warning"
          message="Record Callback Report is available only for service jobs that are field-complete, completed, or closed."
        />
      )}

      {banner === "internal_note_mention_alert_created" && (
        <FlashBanner
          type="success"
          message={`Mention alert created for ${mentionRecipientName.trim() || "teammate"}.`}
        />
      )}

      {banner === "internal_note_mention_alerts_created" && (
        <FlashBanner
          type="success"
          message={`Mention alerts created for ${Number.isFinite(mentionCount) && mentionCount > 0 ? mentionCount : 2} teammates.`}
        />
      )}

      {banner === "internal_note_mention_alert_failed" && (
        <FlashBanner
          type="warning"
          message="Note saved, but mention alert could not be created."
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
          message="Contact attempt logged."
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

      // When external billing closeout card is shown below, suppress this generic ribbon
      // to avoid a split problem-statement + disconnected action.
      if (showExternalDataEntryPrompt) return null;

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

{showExternalDataEntryPrompt ? (
  <div className="mt-4 rounded-2xl border border-amber-300/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.97),rgba(255,247,237,0.94))] px-4 py-3.5 text-amber-950 shadow-[0_14px_30px_-24px_rgba(146,64,14,0.34)] ring-1 ring-amber-200/80">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold text-amber-950">Billing closeout</div>
          <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-800">
            Invoice Required
          </span>
        </div>
        <div className="mt-1 text-sm leading-5 text-amber-900">
          Field work is complete. This job remains in closeout until external billing is confirmed complete.
        </div>
      </div>

      <form action={completeDataEntryFromForm} className="shrink-0">
        <input type="hidden" name="job_id" value={job.id} />
        <SubmitButton
          loadingText="Saving..."
          className={darkButtonClass}
        >
          Mark External Billing Complete
        </SubmitButton>
      </form>
    </div>
  </div>
) : null}

{showSeparateFieldBillingDetails ? (
  <div id="internal-invoice-panel" className="mt-6 scroll-mt-24 rounded-3xl border border-slate-300/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.96))] p-4 shadow-[0_20px_42px_-34px_rgba(15,23,42,0.32)] ring-1 ring-slate-200/70 sm:p-5">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"><ReceiptIcon className="h-3.5 w-3.5" />Billing</div>
        <div className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
          {internalInvoiceTruth ? formatInternalInvoiceStatus(internalInvoiceTruth.status) : "Invoice required"}
        </div>
        <div className="mt-1 text-sm leading-6 text-slate-600">
          {internalInvoiceTruth
            ? jobPageInvoiceSummaryText
            : "No draft invoice yet. Build charges in the Invoice Workspace when billing is ready."}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[28rem]">
        <div className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Closeout Billing</div>
          <div className="mt-0.5 text-sm font-semibold text-slate-900">{billingState.statusLabel}</div>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Recipient</div>
          <div className="mt-0.5 truncate text-sm font-semibold text-slate-900">
            {internalInvoiceTruth?.billing_name || internalInvoiceTruth?.billing_email || "Review needed"}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Next Step</div>
          <div className="mt-0.5 text-sm font-semibold text-slate-900">
            {!internalInvoiceTruth ? "Build invoice" : internalInvoiceTruth.status === "draft" ? (internalInvoiceTruth.line_item_count > 0 ? "Review invoice" : "Build charges") : "Open invoice"}
          </div>
        </div>
      </div>
    </div>

    <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200/80 pt-3">
      {hasDirectInvoiceWorkflowAccess ? (!internalInvoiceTruth ? (
        <form action={createInternalInvoiceDraftFromForm}>
          <input type="hidden" name="job_id" value={job.id} />
          <input type="hidden" name="tab" value={tab} />
          <input type="hidden" name="return_to" value={`/jobs/${job.id}/invoice#invoice-workspace`} />
          <input type="hidden" name="auto_import_visit_scope_items" value="1" />
          <SubmitButton loadingText="Starting..." className={darkButtonClass}>
            Build Invoice
          </SubmitButton>
        </form>
      ) : (
        <Link href={`/jobs/${job.id}/invoice#invoice-workspace`} className={darkButtonClass}>
          {internalInvoiceTruth.status === "draft" ? (internalInvoiceTruth.line_item_count > 0 ? "Review Invoice" : "Build Invoice") : "Open Invoice Workspace"}
        </Link>
      )) : hasProposalEntryWorkflowAccess ? (
        <Link href={`#field-billing-summary-title`} className={darkButtonClass}>
          Add Proposed Charge
        </Link>
      ) : null}
      <div className="flex min-h-10 items-center text-xs leading-5 text-slate-500">
        Invoice Charges are billed scope. Work Items remain operational scope.
      </div>
    </div>

    <FieldBillingSummary
      jobId={job.id}
      tab={tab}
      parentProvidesInvoiceCta={hasDirectInvoiceWorkflowAccess}
      capabilities={fieldBillingCapabilities}
      invoice={fieldBillingInvoiceSnapshot}
      latestVoidedInvoice={fieldBillingLatestVoidedInvoiceSnapshot}
      paymentSummary={null}
      supplementalInvoices={fieldBillingSupplementalInvoiceSnapshots}
      fieldChargeProposals={fieldBillingSummaryData.fieldChargeProposals}
      pricebookProposalItems={fieldChargeProposalPricebookItems}
      visitScopeProposalItems={fieldChargeProposalVisitScopeItems}
    />
  </div>
) : null}

  <div className="mb-8 space-y-5">
      {markVisitCountedLinkId && !suggestedNextDueProjection ? (
        <div id="service-plan-visit-count" className="mt-4 scroll-mt-24 rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-4 text-slate-900">
          <div className="text-sm font-semibold text-emerald-900">Service Plan Visit Count Review</div>
          <p className="mt-1 text-xs leading-5 text-emerald-900/90">
            This completed maintenance visit is eligible to count against
            {" "}
            <span className="font-semibold">{markVisitCountedAgreementName}</span>.
            Counting is manual and operator-confirmed.
          </p>
          <div className="mt-3">
            <MarkVisitCountedActionButton jobId={String(job.id)} linkId={markVisitCountedLinkId} tab={tab} />
          </div>
        </div>
      ) : null}

      {suggestedNextDueProjection ? (
        <div id="service-plan-next-due" className="mt-4 scroll-mt-24 rounded-xl border border-blue-200/80 bg-blue-50/60 p-4 text-slate-900">
          <div className="text-sm font-semibold text-blue-900">Suggested next due date</div>
          {confirmedNextDueContext ? (
            <>
              <p className="mt-1 text-xs leading-5 text-blue-900/90">
                Next due date already confirmed for this counted visit.
              </p>
              <div className="mt-2 text-sm font-semibold text-blue-900">
                Confirmed: {formatDateOnlyUs(confirmedNextDueContext.confirmedNextDueDate) || "Manual scheduling required."}
              </div>
              <div className="mt-1 text-xs leading-5 text-blue-900/90">
                Previous due date: {formatDateOnlyUs(confirmedNextDueContext.baselineNextDueDate) || "Not recorded."}
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-xs leading-5 text-blue-900/90">
                Suggestion only. Confirm updates the Service Plan next due date and does not create a job, schedule, invoice, or payment.
              </p>
              <div className="mt-2 text-sm font-semibold text-blue-900">
                {suggestedNextDueProjection.manualSchedulingRequired
                  ? "Manual scheduling required."
                  : formatDateOnlyUs(suggestedNextDueProjection.suggestedNextDueDate) || "Manual scheduling required."}
              </div>
              <p className="mt-1 text-xs leading-5 text-blue-900/90">
                {suggestedNextDueProjection.seasonalWindowPlaceholder}
              </p>
              {!suggestedNextDueProjection.manualSchedulingRequired && suggestedNextDueProjection.suggestedNextDueDate ? (
                <div className="mt-3">
                  <ConfirmNextDueDateActionButton
                    jobId={String(job.id)}
                    agreementId={suggestedNextDueProjection.agreementId}
                    suggestedNextDueDate={suggestedNextDueProjection.suggestedNextDueDate}
                    baselineNextDueDate={suggestedNextDueProjection.baselineNextDueDate || ""}
                    displayDate={formatDateOnlyUs(suggestedNextDueProjection.suggestedNextDueDate) || suggestedNextDueProjection.suggestedNextDueDate}
                    tab={tab}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

    <section id="job-details-records" className="rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.99))] p-3.5 shadow-[0_20px_46px_-38px_rgba(15,23,42,0.32)] ring-1 ring-blue-100/50 sm:rounded-2xl sm:p-5">
      <div className="mb-3 flex flex-col gap-2 border-b border-slate-200/80 pb-3 sm:mb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0f1f35]">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <FolderIcon className="h-3.5 w-3.5" />
            </span>
            <span>Job Records</span>
          </div>
          <div className="mt-0.5 text-lg font-semibold tracking-tight text-slate-950 sm:mt-1 sm:text-xl">Job Details & Records</div>
          <div className="mt-1 hidden text-base text-slate-600 sm:block">Details, status, equipment, attachments, follow-up, and history.</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800">{noteCountSummary.timelineNoteEventCount} notes</span>
          <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">{serviceCaseVisitCount} visits</span>
          {showEccSummaryCard ? <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">{eccRunCount} ECC runs</span> : null}
        </div>
      </div>
      <style>{`
        #job-record-detail-panel > [data-record-panel] { display: none; }
        #job-record-detail-panel > [data-record-panel]:target { display: block; }
        #job-details-records [data-record-launcher],
        #job-details-records details {
          position: relative;
          overflow: hidden;
        }
        #job-details-records [data-record-launcher]::before,
        #job-details-records details::before {
          content: "";
          position: absolute;
          inset: 0 auto 0 0;
          width: 3px;
          background: rgb(37 99 235 / 0.16);
        }
        #job-details-records [data-record-launcher]:hover::before,
        #job-details-records details:hover::before,
        #job-details-records details[open]::before {
          background: rgb(37 99 235 / 0.36);
        }
        #job-details-records .header-icon-badge {
          width: 1.875rem;
          height: 1.875rem;
          border-radius: 0.5rem;
          border: 1px solid rgb(219 234 254);
          background: rgb(239 246 255 / 0.82);
          color: rgb(29 78 216);
          box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.78);
        }
        #job-details-records .header-title {
          gap: 0.625rem;
          color: rgb(15 31 53);
        }
        #job-details-records .header-subtitle {
          color: rgb(71 85 105);
        }
        #job-details-records .header-meta {
          border-color: rgb(219 234 254);
          background: rgb(239 246 255 / 0.75);
          color: rgb(30 64 175);
          letter-spacing: 0.04em;
        }
        #job-details-records .disclosure-icon {
          border-color: rgb(226 232 240);
          background: rgb(248 250 252 / 0.9);
          color: rgb(100 116 139);
        }
        @media (max-width: 639px) {
          #job-details-records [data-record-launcher],
          #job-details-records details {
            padding: 0.875rem;
            border-radius: 1rem;
            box-shadow: 0 14px 30px -28px rgb(15 23 42 / 0.32);
          }
          #job-details-records .header-subtitle {
            display: block;
            margin-top: 0.25rem;
          }
          #job-details-records .header-title {
            font-size: 0.95rem;
            line-height: 1.25rem;
          }
          #job-details-records .header-meta {
            font-size: 0.68rem;
            text-transform: none;
          }
        }
        #job-details-records:has(#edit-job:target) [data-record-launcher="edit-job"],
        #job-details-records:has(#job-status:target) [data-record-launcher="job-status"],
        #job-details-records:has(#job-record-equipment:target) [data-record-launcher="job-record-equipment"],
        #job-details-records:has(#job-record-attachments:target) [data-record-launcher="job-record-attachments"],
        #job-details-records:has(#follow-up:target) [data-record-launcher="follow-up"],
        #job-details-records:has(#job-record-follow-up-history:target) [data-record-launcher="job-record-follow-up-history"],
        #job-details-records:has(#job-record-timeline:target) [data-record-launcher="job-record-timeline"],
        #job-details-records:has(#service-chain:target) [data-record-launcher="service-chain"] {
          border-color: rgb(37 99 235);
          background: rgb(239 246 255 / 0.88);
          box-shadow: 0 20px 44px -32px rgb(37 99 235 / 0.5);
        }
        #job-details-records:has(#edit-job:target) [data-record-launcher="edit-job"] .disclosure-icon,
        #job-details-records:has(#job-status:target) [data-record-launcher="job-status"] .disclosure-icon,
        #job-details-records:has(#job-record-equipment:target) [data-record-launcher="job-record-equipment"] .disclosure-icon,
        #job-details-records:has(#job-record-attachments:target) [data-record-launcher="job-record-attachments"] .disclosure-icon,
        #job-details-records:has(#follow-up:target) [data-record-launcher="follow-up"] .disclosure-icon,
        #job-details-records:has(#job-record-follow-up-history:target) [data-record-launcher="job-record-follow-up-history"] .disclosure-icon,
        #job-details-records:has(#job-record-timeline:target) [data-record-launcher="job-record-timeline"] .disclosure-icon,
        #job-details-records:has(#service-chain:target) [data-record-launcher="service-chain"] .disclosure-icon {
          color: rgb(37 99 235);
          transform: rotate(90deg);
        }
      `}</style>
      <div className="grid grid-cols-1 items-start gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <a href="#edit-job" data-record-launcher="edit-job" className={recordLauncherClass}>
          <CollapsibleHeader
                title="Job Details"
                subtitle="All editable controls for this job."
                icon={<SettingsIcon className="h-4 w-4" />}
                compactOnMobile
              />
        </a>

        <a href="#job-status" data-record-launcher="job-status" className={recordLauncherClass}>
          <CollapsibleHeader
      title="Job Status"
      subtitle={jobStatusSummaryText}
      icon={<SettingsIcon className="h-4 w-4" />}
      compactOnMobile
    />
        </a>

        {showEccSummaryCard ? (
          <details className={jobRecordsDetailsClass}>
            <summary className="cursor-pointer list-none">
              <CollapsibleHeader
                title="ECC Summary"
                subtitle="Test history and compliance context."
                meta={`${eccRunCount} run${eccRunCount === 1 ? "" : "s"}`}
                icon={<ClipboardIcon className="h-4 w-4" />}
                compactOnMobile
              />
            </summary>

            <div className={jobRecordsDetailsDividerClass}>
              {eccRunCount > 0 ? (
                <div className="rounded-lg border border-slate-200/80 bg-slate-50/72 px-3 py-2.5 text-sm leading-6 text-slate-700">
                  Latest result: <span className="font-semibold text-slate-900">{latestEccRunResultLabel}</span>
                  {latestEccRunDateLabel ? ` • ${latestEccRunDateLabel}` : ""}
                </div>
              ) : (
                <div className={workspaceEmptyStateClass}>No tests recorded yet.</div>
              )}
            </div>
          </details>
        ) : null}

        {showJobRecordsPermitCard ? (
          <details className={jobRecordsDetailsClass}>
            <summary className="cursor-pointer list-none">
              <CollapsibleHeader
                title="Permit Details"
                subtitle="Number, jurisdiction, and date."
                meta={permitSummaryLabel}
                icon={<ClipboardIcon className="h-4 w-4" />}
                compactOnMobile
              />
            </summary>

            <div className={`${jobRecordsDetailsDividerClass} grid grid-cols-1 gap-2 sm:grid-cols-3`}>
              <div className="rounded-lg border border-slate-200/80 bg-slate-50/72 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Number</div>
                <div className="mt-0.5 text-sm font-semibold text-slate-900">{permitNumber || "Not added"}</div>
              </div>
              <div className="rounded-lg border border-slate-200/80 bg-slate-50/72 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Jurisdiction</div>
                <div className="mt-0.5 text-sm font-semibold text-slate-900">{permitJurisdiction || "Not added"}</div>
              </div>
              <div className="rounded-lg border border-slate-200/80 bg-slate-50/72 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Date</div>
                <div className="mt-0.5 text-sm font-semibold text-slate-900">{permitDateLabel || "Not added"}</div>
              </div>
            </div>
          </details>
        ) : null}

                <a href="#job-record-equipment" data-record-launcher="job-record-equipment" className={recordLauncherClass}>
          <CollapsibleHeader
              title="Equipment"
              subtitle="Latest equipment items recorded for this job."
              meta={`${equipmentCount} item${equipmentCount === 1 ? "" : "s"}`}
              icon={<ToolIcon className="h-4 w-4" />}
              compactOnMobile
            />
        </a>

        {/* Attachments */}
                <a href="#job-record-attachments" data-record-launcher="job-record-attachments" className={recordLauncherClass}>
          <CollapsibleHeader
              title="Attachments"
              icon={<PaperclipIcon className="h-4 w-4" />}
              compactOnMobile
            />
        </a>

        {/* Section A: Follow Up (Active Edit Area) */}
                <a href="#follow-up" data-record-launcher="follow-up" className={recordLauncherClass}>
          <CollapsibleHeader
              title="Follow Up"
              subtitle={followUpSummaryText}
              icon={<ClockIcon className="h-4 w-4" />}
              compactOnMobile
            />
        </a>

                <a href="#job-record-follow-up-history" data-record-launcher="job-record-follow-up-history" className={recordLauncherClass}>
          <CollapsibleHeader
              title="Follow-Up History"
              subtitle={followUpHistorySummaryText}
              icon={<ClockIcon className="h-4 w-4" />}
              compactOnMobile
            />
        </a>

        {/* Timeline - Activity/History */}
                <a href="#job-record-timeline" data-record-launcher="job-record-timeline" className={recordLauncherClass}>
          <CollapsibleHeader
              title={timelineTitle}
              subtitle={timelineSummaryText}
              meta={timelineNotesMeta}
              icon={<ClockIcon className="h-4 w-4" />}
              compactOnMobile
            />
        </a>

                <a href="#service-chain" data-record-launcher="service-chain" className={recordLauncherClass}>
          <CollapsibleHeader
              title="Service Chain"
              subtitle={serviceChainSummaryText}
              meta={`${serviceCaseVisitCount} visit${serviceCaseVisitCount === 1 ? "" : "s"}`}
              icon={<ToolIcon className="h-4 w-4" />}
              compactOnMobile
            />
        </a>

        {showSharedNotesCard ? (
          <details id="shared-notes" className={sharedNotesCardClass} open={Boolean(sharedNoteBannerMessage)}>
            <summary className="cursor-pointer list-none">
              <CollapsibleHeader
                title={sharedNotesTitle}
                subtitle={sharedNotesSummaryText}
                meta={sharedNotesMeta}
                icon={<ChatIcon className="h-4 w-4" />}
                compactOnMobile
              />
            </summary>

            <div className={`${jobRecordsDetailsDividerClass} space-y-2`}>
              {sharedNoteBannerMessage ? (
                <FlashBanner
                  type={sharedNoteBannerType as "success" | "warning" | "error"}
                  message={sharedNoteBannerMessage}
                />
              ) : null}

  <form action={addPublicNoteFromForm} className="mb-4 space-y-3">
      <input type="hidden" name="note_scope" value="shared" />
      <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#shared-notes`} />
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

  <Suspense fallback={<NarrativeNotesBodyFallback />}>
    <DeferredSharedNotesBody
      jobId={String(job.id)}
      timelineJobIds={narrativeScopeJobIds}
      hasDirectNarrativeChain={hasDirectNarrativeChain}
      emptyStateClassName={workspaceEmptyStateClass}
    />
  </Suspense>
            </div>
          </details>
        ) : null}

      </div>
      <div id="job-record-detail-panel" className="mt-4 space-y-4" aria-live="polite">        <section id="edit-job" data-record-panel="edit-job" className={recordPanelClass} tabIndex={-1}>
          <div className="flex flex-col gap-2 border-b border-slate-200/80 pb-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Selected record panel</div>
              <div className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Job Details</div>
            </div>
            <a href="#job-details-records" className={compactSecondaryButtonClass}>Close</a>
          </div>
          <div className="mt-4">
            <div className={workspaceDetailsDividerClass}>
              <div className={`${workspaceInsetClass} p-4`}>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <span className="text-slate-400">Tech ID</span>
                  <span className="font-mono normal-case tracking-normal text-slate-700">{job.id}</span>
                </div>
                <div className="mb-3 text-sm font-semibold text-slate-900">Scheduling</div>

                <form action={updateJobScheduleFromForm} className="space-y-4">
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#edit-job`} />
                  <input type="hidden" name="permit_number" value={job.permit_number ?? ""} />
                  <input type="hidden" name="jurisdiction" value={(job as any).jurisdiction ?? ""} />
                  <input type="hidden" name="permit_date" value={(job as any).permit_date ?? ""} />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-1">
                      <label className={workspaceFieldLabelClass}>
                        Date
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

              <details
                open
                className="group mt-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_28px_-26px_rgba(15,23,42,0.35)] [&[open]_.disclosure-icon]:rotate-90"
              >
                  <summary className="cursor-pointer list-none">
                    <CollapsibleHeader
                      title="Permit Information"
                      subtitle="Number, jurisdiction, and date."
                      icon={<ClipboardIcon className="h-4 w-4" />}
                    />
                  </summary>
                  <form action={updateJobScheduleFromForm} className="mt-3 space-y-3">
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#edit-job`} />
                    <input type="hidden" name="scheduled_date" value={displayDateLA(job.scheduled_date) ?? ""} />
                    <input type="hidden" name="window_start" value={timeToTimeInput(job.window_start) ?? ""} />
                    <input type="hidden" name="window_end" value={timeToTimeInput(job.window_end) ?? ""} />

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label className={workspaceFieldLabelClass}>Number</label>
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
                        <label className={workspaceFieldLabelClass}>Date</label>
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

              <div
                className={`mt-4 grid grid-cols-1 gap-3 ${
                  !isHvacServiceMode && job.job_type === "service" ? "lg:grid-cols-2" : "lg:grid-cols-1"
                }`}
              >
                {!isHvacServiceMode ? (
                  <details className="group w-full rounded-xl border border-slate-200/80 bg-white p-4 text-sm shadow-[0_10px_28px_-26px_rgba(15,23,42,0.35)] [&[open]_.disclosure-icon]:rotate-90">
                    <summary className="cursor-pointer list-none">
                      <CollapsibleHeader
                        title="Change Contractor"
                        subtitle="Reassign job ownership."
                        icon={<UserIcon className="h-4 w-4" />}
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
                ) : null}

                {job.job_type === "service" ? (
                  <details className="group w-full rounded-xl border border-slate-200/80 bg-white p-4 text-sm shadow-[0_10px_28px_-26px_rgba(15,23,42,0.35)] [&[open]_.disclosure-icon]:rotate-90">
                    <summary className="cursor-pointer list-none">
                      <CollapsibleHeader
                        title="Service Details"
                        subtitle="Edit service type and visit classification."
                        icon={<ToolIcon className="h-4 w-4" />}
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
                            <option value="install">Install</option>
                            <option value="return_visit">Return Visit</option>
                            <option value="callback">Callback</option>
                            <option value="maintenance">Maintenance</option>
                          </select>
                          <p className="text-[11px] leading-5 text-slate-500">
                            Category of visit, such as diagnostic, repair, install, return visit, callback, or maintenance.
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
                          Why this visit exists.
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
                    icon={<WarningIcon className="h-4 w-4" />}
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
          </div>
        </section>
        <section id="job-status" data-record-panel="job-status" className={recordPanelClass} tabIndex={-1}>
          <div className="flex flex-col gap-2 border-b border-slate-200/80 pb-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Selected record panel</div>
              <div className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Job Status</div>
            </div>
            <a href="#job-details-records" className={compactSecondaryButtonClass}>Close</a>
          </div>
          <div className="mt-4">
            <div className={workspaceDetailsDividerClass}>

  <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/80 px-3.5 py-3 text-sm font-medium text-slate-900">
    <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-blue-800">
      Current lifecycle
    </div>
    <div className="mt-1 text-base font-semibold text-slate-950">
      {formatOpsStatusLabel(job.ops_status)}
    </div>
  </div>

  <form action={updateJobOpsFromForm} className="space-y-4 rounded-xl border border-slate-200/80 bg-white/96 p-4">
    <input type="hidden" name="job_id" value={job.id} />
    <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#job-status`} />

    <div className="space-y-4">
      {activeWaitingState ? (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-3 text-sm">
          <div className="inline-flex items-center rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-800">
            Waiting
          </div>
          <div className="mt-2 text-xs leading-5 text-amber-900/90">
            Waiting State explains why progress is paused. It does not replace Work Items / Visit Scope.
          </div>
          {activeWaitingState.blockerReason ? (
            <div className="mt-2 text-sm text-amber-900">{activeWaitingState.blockerReason}</div>
          ) : null}
          {canShowWaitingReleaseQuickAction ? (
            <div className="mt-2 border-t border-amber-200/80 pt-2.5">
              <p className="text-xs leading-5 text-amber-900/90">
                Use this when the part, approval, access, or missing information is no longer blocking the job.
              </p>
              <div className="mt-2">
                <SubmitButton formAction={releaseAndReevaluateFromForm} loadingText="Updating..." className={`${secondaryButtonClass} w-full sm:w-auto`}>
                  Mark Ready to Continue
                </SubmitButton>
              </div>
            </div>
          ) : null}
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

    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/80 pt-3">
      <SubmitButton loadingText="Saving..." className={primaryButtonClass}>
        Save Interrupt State
      </SubmitButton>
    </div>
  </form>

  {currentInterruptState ? (
    <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3 text-sm text-slate-700">
      <div className="font-semibold text-slate-900">Current Interrupt Detail</div>
      <div className="mt-1 text-xs leading-5 text-slate-600">
        This pause reason is operational context only and does not replace Work Items / Visit Scope.
      </div>
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
            <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#job-status`} />
            <SubmitButton loadingText="Updating..." className={`w-full ${secondaryButtonClass} sm:w-auto`}>
              {interruptReleaseActionLabel}
            </SubmitButton>
          </form>
        ) : null}
      </div>

          </div>
        </section>
        <section id="job-record-equipment" data-record-panel="job-record-equipment" className={recordPanelClass} tabIndex={-1}>
          <div className="flex flex-col gap-2 border-b border-slate-200/80 pb-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Selected record panel</div>
              <div className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Equipment</div>
            </div>
            <a href="#job-details-records" className={compactSecondaryButtonClass}>Close</a>
          </div>
          <div className="mt-4">
            <div className={jobRecordsDetailsDividerClass}>
            <div className="mb-3 flex items-center justify-end">
              <Link href={`/jobs/${job.id}/info?f=equipment`} className={secondaryButtonClass}>
                Manage Equipment
              </Link>
            </div>

            {equipmentCount > 0 ? (
              <div className="space-y-2">
                {equipmentItems.slice(0, 3).map((eq: any) => {
                  const meta = formatEquipmentMeta(eq);
                  return (
                    <div key={eq.id} className="rounded-lg border border-slate-200/80 bg-slate-50/72 px-3 py-2">
                      <div className="text-sm font-semibold leading-5 text-slate-900">{formatEquipmentTitle(eq)}</div>
                      {meta ? <div className="mt-0.5 text-xs leading-5 text-slate-600">{meta}</div> : null}
                    </div>
                  );
                })}
                {equipmentCount > 3 ? (
                  <div className="text-xs font-semibold text-slate-500">+{equipmentCount - 3} more in Equipment</div>
                ) : null}
              </div>
            ) : (
              <div className={workspaceEmptyStateClass}>No equipment recorded yet.</div>
            )}
          </div>
          </div>
        </section>
        <section id="job-record-attachments" data-record-panel="job-record-attachments" className={recordPanelClass} tabIndex={-1}>
          <div className="flex flex-col gap-2 border-b border-slate-200/80 pb-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Selected record panel</div>
              <div className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Attachments</div>
            </div>
            <a href="#job-details-records" className={compactSecondaryButtonClass}>Close</a>
          </div>
          <div className="mt-4">
            <div className={`${jobRecordsDetailsDividerClass} px-0 pb-0`}>
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
          </div>
        </section>
        <section id="follow-up" data-record-panel="follow-up" className={recordPanelClass} tabIndex={-1}>
          <div className="flex flex-col gap-2 border-b border-slate-200/80 pb-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Selected record panel</div>
              <div className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Follow Up</div>
            </div>
            <a href="#job-details-records" className={compactSecondaryButtonClass}>Close</a>
          </div>
          <div className="mt-4">
            <div className={jobRecordsDetailsDividerClass}>
            <div className="rounded-xl border border-slate-200/80 bg-white/96 p-4">

            {hasFollowUpReminder ? (
              <div className="mb-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2.5 text-xs leading-5 text-slate-600">
                Use this for reminder ownership, due date, and next steps.
              </div>
            ) : null}

            <form action={updateJobOpsDetailsFromForm} className="grid gap-3">
              <input type="hidden" name="job_id" value={job.id} />
              <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#follow-up`} />

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
          </div>
        </section>
        <section id="job-record-follow-up-history" data-record-panel="job-record-follow-up-history" className={recordPanelClass} tabIndex={-1}>
          <div className="flex flex-col gap-2 border-b border-slate-200/80 pb-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Selected record panel</div>
              <div className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Follow-Up History</div>
            </div>
            <a href="#job-details-records" className={compactSecondaryButtonClass}>Close</a>
          </div>
          <div className="mt-4">
            <div className={`${jobRecordsDetailsDividerClass} rounded-xl border border-slate-200/80 bg-white/96 p-4`}>
            <Suspense fallback={<FollowUpHistorySectionFallback />}>
              <DeferredCustomerAttemptsHistory
                jobId={String(job.id)}
                emptyStateClassName={workspaceEmptyStateClass}
                infoChipClassName={infoChipClass}
              />
            </Suspense>
          </div>
          </div>
        </section>
        <section id="job-record-timeline" data-record-panel="job-record-timeline" className={recordPanelClass} tabIndex={-1}>
          <div className="flex flex-col gap-2 border-b border-slate-200/80 pb-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Selected record panel</div>
              <div className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Timeline</div>
            </div>
            <a href="#job-details-records" className={compactSecondaryButtonClass}>Close</a>
          </div>
          <div className="mt-4">
            <div className={`${jobRecordsDetailsDividerClass} space-y-2`}>
    <Suspense fallback={<NarrativeTimelineBodyFallback />}>
      <DeferredTimelineBody
        jobId={String(job.id)}
        timelineJobIds={narrativeScopeJobIds}
        hasDirectNarrativeChain={hasDirectNarrativeChain}
        emptyStateClassName={workspaceEmptyStateClass}
        jobSummary={{
          id: String(job.id),
          status: job.status ?? null,
          ops_status: job.ops_status ?? null,
          field_complete: Boolean(job.field_complete),
          scheduled_date: job.scheduled_date ?? null,
          window_start: job.window_start ?? null,
          window_end: job.window_end ?? null,
          parent_job_id: job.parent_job_id ?? null,
          pending_info_reason: job.pending_info_reason ?? null,
          on_hold_reason: job.on_hold_reason ?? null,
        }}
      />
    </Suspense>
          </div>
          </div>
        </section>
        <section id="service-chain" data-record-panel="service-chain" className={recordPanelClass} tabIndex={-1}>
          <div className="flex flex-col gap-2 border-b border-slate-200/80 pb-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Selected record panel</div>
              <div className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Service Chain</div>
            </div>
            <a href="#job-details-records" className={compactSecondaryButtonClass}>Close</a>
          </div>
          <div className="mt-4">
            <div className={jobRecordsDetailsDividerClass}>
            {serviceCaseId ? (
              <div className="mb-3 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Case: {serviceCaseId.slice(0, 8)}…
              </div>
            ) : null}

            {!serviceCaseId ? (
              <div className={workspaceEmptyStateClass}>
                This job is not attached to a service case yet.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200/80 bg-white/96 p-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Workflow Guidance
                  </div>
                  {workflowGuidanceBannerMessage ? (
                    <div className="mb-2">
                      <FlashBanner
                        type={workflowGuidanceBannerType as "success" | "warning" | "error"}
                        message={workflowGuidanceBannerMessage}
                      />
                    </div>
                  ) : null}
                  <Suspense fallback={<WorkflowMilestonesPanelBodyFallback />}>
                    <DeferredWorkflowMilestonesPanelBody
                      accountOwnerUserId={String(internalUser.account_owner_user_id)}
                      currentJobId={String(jobId)}
                      serviceCaseId={String(serviceCaseId)}
                      canManageWorkflowGuidance={canManageWorkflowGuidance}
                      returnToPath={`/jobs/${job.id}?tab=${tab}#service-chain`}
                      emptyStateClassName={workspaceEmptyStateClass}
                    />
                  </Suspense>
                </div>

                <Suspense fallback={<ServiceChainPanelBodyFallback />}>
                  <DeferredServiceChainPanelBody
                    accountOwnerUserId={String(internalUser.account_owner_user_id)}
                    currentJobId={String(jobId)}
                    serviceCaseId={String(serviceCaseId)}
                    emptyStateClassName={workspaceEmptyStateClass}
                  />
                </Suspense>
              </div>
            )}
          </div>
          </div>
        </section>      </div>
    </section>
  </div>

          {/* Failure Resolution */}
{(showRetestSection || showCorrectionReviewResolution) ? (
<details className={`${workspaceDetailsClass} order-3 mb-5 xl:order-3`}>
  <summary className="cursor-pointer list-none">
    <CollapsibleHeader
      title="Failure Resolution"
      subtitle={failureResolutionSummaryText}
      meta={`${failureResolutionPathCount} path${failureResolutionPathCount === 1 ? "" : "s"} available`}
      icon={<WarningIcon className="h-4 w-4" />}
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

{isInternalUser && contractorId && ["failed", "pending_info"].includes(String(job.ops_status ?? "")) ? (
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

{timingEnabled ? <JobDetailTimingLog /> : null}

  </div>
  );

}
