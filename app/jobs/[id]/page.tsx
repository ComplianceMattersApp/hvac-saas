// app/jobs/[id]/page
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import SubmitButton from "@/components/SubmitButton";
import ImmediateSubmitButton from "@/components/ImmediateSubmitButton";
import FlashBanner from "@/components/ui/FlashBanner";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { Disclosure } from "@/components/ui/Disclosure";
import { archiveJobFromForm } from "@/lib/actions/job-actions";
import JobLocationPreview from "@/components/jobs/JobLocationPreview";
import {
  getContractors,
  changeJobServiceLocationFromForm,
  updateJobCustomerFromForm,
  updateJobContractorFromForm,
  updateJobScheduleFromForm,
  advanceJobStatusFromForm,
  updateJobServiceContractFromForm,
  updateJobVisitScopeFromForm,
  updateJobTitleFromForm,
  createNextServiceVisitFromForm,
  createCallbackVisitFromForm,
  completeDataEntryFromForm,
  confirmEccRetestReadyFromForm,
  createRetestJobFromForm,
  scheduleRetestNowFromForm,
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
  markServicePartOrderedFromForm,
  markServicePartArrivedFromForm,
  markServiceApprovalReceivedFromForm,
  markJobFieldCompleteFromForm,
  markCertsCompleteFromForm,
  markEccPermitAvailableFromForm,
  markInvoiceCompleteFromForm,
  resolveFailureByCorrectionReviewFromForm,
} from "@/lib/actions/job-ops-actions";

import { logCustomerContactAttemptFromForm } from "@/lib/actions/job-contact-actions";

import ServiceStatusActions from "./_components/ServiceStatusActions";
import EquipmentEditCard from "./_components/EquipmentEditCard";
import EquipmentCreateForm from "./_components/EquipmentCreateForm";
import { displayDateLA, formatBusinessDateUS, formatDateOnlyDisplay, formatTimestampDateDisplayLA, formatTimestampDateTimeDisplayLA } from "@/lib/utils/schedule-la";
import { formatPersonNamePart } from "@/lib/utils/identity-display";
import { formatInvoiceDisplayReference, formatJobDisplayReference } from "@/lib/utils/display-references";
import type { JobStatus } from "@/lib/types/job";
import { JobFieldActionButton } from "./_components/JobFieldActionButton";
import PendingRouteLink from "./_components/PendingRouteLink";
import UnscheduleButton from "./_components/UnscheduleButton";
import {
  getCloseoutNeeds,
  getJobDetailCloseoutReadinessMessage,
  isInCloseoutQueue,
} from "@/lib/utils/closeout";
import ContractorReportPanel from "./_components/ContractorReportPanel";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import {
  getActiveJobAssignmentDisplayMap,
} from "@/lib/staffing/human-layer";
import { type BillingMode } from "@/lib/business/internal-business-profile";
import {
  getCachedBillingMode,
  getCachedInternalBusinessIdentity,
  getCachedProductMode,
} from "@/lib/business/tenant-reference-cache";
import { type ProductMode } from "@/lib/business/product-mode-defaults";
import { resolveProductSurfaceProfile } from "@/lib/business/product-surface-profile";
import { buildJobBillingStateReadModel, formatJobBillingDispositionLabel, normalizeJobBillingDisposition } from "@/lib/business/job-billing-state";
import { buildServiceFollowUpProgressState } from "@/lib/jobs/service-follow-up-progress";
import { isEccPermitNeededBlocker, isValidEccPermitNumber } from "@/lib/ecc/permit-needed";
import { buildComplianceWorkSummary } from "@/lib/jobs/compliance-work-summary";
import { formatEccOpsStatusLabel, isEccJobType as isEccWorkflowJobType } from "@/lib/ecc/ecc-workflow-display";
import {
  resolveInternalInvoiceEmailDeliveries,
  type InternalInvoiceEmailDeliveryRecord,
} from "@/lib/business/internal-invoice-delivery";
import {
  normalizeInternalInvoiceStatus,
  type InternalInvoiceItemType,
  resolveLatestVoidedInternalInvoiceByJobId,
  resolveInternalInvoiceByJobId,
  resolveInternalInvoiceJobShareCents,
  resolveJobAddOnInvoicesWithLines,
  resolveInternalInvoiceFamilySummaryByJobId,
  type InternalInvoiceStatus,
} from "@/lib/business/internal-invoice";
import {
  buildInvoiceFamilyBillingView,
  formatAddOnInvoiceLabel,
  type UnlinkedInvoiceCharge,
  type VisitScopeBilledLine,
} from "@/lib/business/visit-scope-billing";
import {
  resolveInvoiceCollectedPaymentLedger,
  resolveInvoiceCollectedPaymentSummary,
  type InternalInvoiceCollectedPaymentSummary,
  type InternalInvoicePaymentRow,
} from "@/lib/business/internal-invoice-payments";
import {
  resolveJobInvoiceActionLabel,
  resolveJobInvoiceStateLabel,
} from "@/lib/jobs/job-invoice-action";
import { shouldShowInternalInvoiceRequiredBanner } from "@/lib/jobs/job-detail-invoice-banner";
import { listFieldChargeProposalsForJob } from "@/lib/business/field-charge-proposals";
import { buildReviewAskLinks } from "@/lib/utils/review-ask-links";
import { listAccountWorkshareConnectionsForAccount } from "@/lib/workflows/account-workshare-connections-read";
import { listAccountWorkshareRequestsForSourceJob } from "@/lib/workflows/account-workshare-requests-read";
import {
  cancelAccountWorkshareRequestFromForm,
  createAccountWorkshareRequestFromJobForm,
} from "@/lib/workflows/account-workshare-requests-actions";
import {
  addInternalInvoiceLineItemFromForm,
  addInternalInvoiceLineItemFromPricebookForm,
  addInternalInvoiceLineItemsFromVisitScopeForm,
  createInternalInvoiceDraftFromForm,
  issueInternalInvoiceFromForm,
  markInternalInvoiceExternallyBilledFromForm,
  markInternalInvoiceNoChargeFromForm,
  removeInternalInvoiceLineItemFromForm,
  saveInternalInvoiceDraftFromForm,
  updateInternalInvoiceLineItemFromForm,
  voidInternalInvoiceFromForm,
} from "@/lib/actions/internal-invoice-actions";
import { recordInternalInvoicePaymentFromForm } from "@/lib/actions/internal-invoice-payment-actions";
import { canManageInvoiceLifecycle } from "@/lib/auth/financial-access";
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
import { updateJobChecklistItemCompletionFromForm } from "@/lib/maintenance-agreements/agreement-actions";

import DeferredJobAttachmentsInternal from "./_components/DeferredJobAttachmentsInternal";
import DeferredCustomerAttemptsHistory from "./_components/DeferredCustomerAttemptsHistory";
import DeferredServiceChainPanelBody from "./_components/DeferredServiceChainPanelBody";
import DeferredWorkflowMilestonesPanelBody from "./_components/DeferredWorkflowMilestonesPanelBody";
import AssignedTeamControls from "./_components/AssignedTeamControls";
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
import ChangeServiceLocationForm from "./_components/ChangeServiceLocationForm";
import ActiveRescheduleWarning from "@/components/jobs/ActiveRescheduleWarning";
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
// Slice B: MobileJobDetailCurrent is retired (no longer rendered). The file is
// intentionally left in place but unreferenced pending later removal.
import MobileJobDetailV2Preview from "./_components/MobileJobDetailV2Preview";
import DesktopJobDetailV2Page from "./v2/page";
import { formatRecentAttemptDateTime } from "@/lib/ops/recent-attempt-display";
import { isMissingJobsBillingDispositionColumnError } from "@/lib/supabase/jobs-billing-disposition-compat";
import { OPERATIONAL_WORKSPACE_MAX_WIDTH_CLASS } from "@/lib/ui/page-widths";

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

function isStripeSourcedPayment(payment: InternalInvoicePaymentRow) {
  return (
    String(payment.payment_method ?? "").trim() === "card_stripe_online" ||
    String(payment.processor_name ?? "").trim().toLowerCase() === "stripe" ||
    String(payment.stripe_event_id ?? "").trim().length > 0 ||
    String(payment.stripe_checkout_session_id ?? "").trim().length > 0 ||
    String(payment.stripe_payment_intent_id ?? "").trim().length > 0
  );
}

function stripePaymentReceivedCopy(payment: InternalInvoicePaymentRow, invoiceReference: string) {
  const amount = formatCurrencyFromCents(payment.amount_cents);
  return {
    title: "Payment received",
    summary: `${amount} received for ${invoiceReference}.`,
    detail: "Stripe confirmed this payment. Payout timing is handled by Stripe.",
  };
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
  const visitType = String(visit?.service_visit_type ?? "").trim().toLowerCase();
  if (visit?.parent_job_id && visitType === "callback") return "Callback visit";
  if (visit?.parent_job_id && visitType === "return_visit") return "Return visit";
  if (visit?.parent_job_id && String(visit?.job_type ?? "").toLowerCase() === "service") return "Linked service visit";
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

const MAIN_JOB_SELECT_WITH_BILLING_DISPOSITION = `
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
      billing_disposition,
      billing_disposition_note,
      billing_disposition_at,
      billing_disposition_by_user_id,
      invoice_number,
      job_display_number,
      pending_info_reason,
      on_hold_reason,
      follow_up_date,
      next_action_note,
      action_required_by,
      ops_board_failure_note,
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
        system_location,
        manufacturer,
        model,
        serial,
        tonnage,
        heating_capacity_kbtu,
        heating_output_btu,
        heating_efficiency_percent,
        refrigerant_type,
        notes,
        created_at,
        updated_at
      ),
      ecc_test_runs (
        id,
        test_type,
        system_id,
        is_completed,
        computed,
        computed_pass,
        override_pass,
        override_reason,
        created_at,
        updated_at
      )
    `;

const MAIN_JOB_SELECT_COMPAT = `
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
      ops_board_failure_note,
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
        system_location,
        manufacturer,
        model,
        serial,
        tonnage,
        heating_capacity_kbtu,
        heating_output_btu,
        heating_efficiency_percent,
        refrigerant_type,
        notes,
        created_at,
        updated_at
      ),
      ecc_test_runs (
        id,
        test_type,
        system_id,
        is_completed,
        computed,
        computed_pass,
        override_pass,
        override_reason,
        created_at,
        updated_at
      )
    `;

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
    const paymentStatus = String(meta?.payment_status ?? "").trim().toLowerCase();
    const source = String(meta?.source ?? "").trim().toLowerCase();
    const isStripeReceived =
      paymentStatus === "recorded" &&
      (paymentMethod === "card stripe online" || source.includes("stripe"));
    const parts = [amountDisplay ? `$${amountDisplay}` : "", paymentMethod, invoiceNumber].filter(Boolean);
    if (isStripeReceived) {
      parts.push("Stripe confirmed this payment. Payout timing is handled by Stripe.");
    }
    return parts.join(" - ");
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

  if (eventType === "payment_recorded") {
    const paymentStatus = String(meta?.payment_status ?? "").trim().toLowerCase();
    const paymentMethod = String(meta?.payment_method ?? "").trim();
    const source = String(meta?.source ?? "").trim().toLowerCase();
    if (
      paymentStatus === "recorded" &&
      (paymentMethod === "card_stripe_online" || source.includes("stripe"))
    ) {
      return "Payment received";
    }
    if (paymentStatus === "failed") return "Payment failed";
    return "Payment recorded";
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

function MapPinIcon(props: { className?: string }) {
  return (
    <MobileLineIcon className={props.className}>
      <path d="M12 22s7-5.6 7-12a7 7 0 1 0-14 0c0 6.4 7 12 7 12Z" />
      <circle cx="12" cy="10" r="2.5" />
    </MobileLineIcon>
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

function MailIcon(props: { className?: string }) {
  return (
    <MobileLineIcon className={props.className}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
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
                className={showActionsOnMobile ? "inline-flex min-h-11 items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50" : "hidden min-h-11 items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 sm:inline-flex"}
              >
                Navigate
              </a>
            ) : null}
            {mapsSearchUrl ? (
              <a
                href={mapsSearchUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50"
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
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_28px_-22px_rgba(15,23,42,0.55)] transition-[background-color,box-shadow,transform] hover:bg-blue-700 hover:shadow-[0_16px_30px_-22px_rgba(15,23,42,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px]";
const infoChipClass =
  "inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700 sm:px-2.5 sm:py-1 sm:text-xs";
const compactUtilityButtonClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-200/90 bg-white/78 px-3 py-2 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.02)] transition-[border-color,background-color,box-shadow,transform] hover:border-slate-300 hover:bg-white hover:shadow-[0_8px_18px_-18px_rgba(15,23,42,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px] sm:min-h-9 sm:w-auto";
const compactWorkspaceActionButtonClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-blue-200/90 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900 shadow-[0_10px_22px_-20px_rgba(37,99,235,0.35)] transition-[border-color,background-color,box-shadow,transform,color] hover:border-blue-300 hover:bg-blue-100 hover:text-blue-950 hover:shadow-[0_14px_26px_-20px_rgba(37,99,235,0.42)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px] sm:min-h-9 sm:w-auto";
const workspaceDetailsClass =
  `${workspaceSectionClass} group text-slate-900 ring-1 ring-slate-200/60 transition-[border-color,box-shadow,transform] duration-150 hover:border-slate-300/90 hover:shadow-[0_20px_44px_-32px_rgba(15,23,42,0.34)] [&[open]_.disclosure-icon]:rotate-90`;
const workspaceDetailsDividerClass = "mt-3 border-t border-slate-200/90 pt-4";
const jobRecordsDetailsClass =
  `${workspacePanelClass} group rounded-2xl border-slate-200/80 bg-white p-2.5 text-slate-900 ring-1 ring-blue-100/40 transition-[border-color,background-color,box-shadow,transform] duration-150 hover:border-blue-200/80 hover:bg-white hover:shadow-[0_18px_40px_-34px_rgba(15,23,42,0.3)] sm:rounded-2xl sm:p-4 [&[open]_.disclosure-icon]:rotate-90 [&[open]]:border-blue-200/80 [&[open]]:xl:col-span-2 [&[open]]:2xl:col-span-3`;
const jobRecordsDetailsDividerClass = "mt-2 border-t border-slate-200/80 pt-2.5 sm:mt-3 sm:pt-4";
const recordLauncherClass =
  `${workspacePanelClass} group block rounded-2xl border-slate-200/80 bg-white p-2.5 text-left text-slate-900 ring-1 ring-blue-100/40 transition-[border-color,background-color,box-shadow,transform] duration-150 hover:border-blue-200/80 hover:bg-blue-50/20 hover:shadow-[0_18px_40px_-34px_rgba(15,23,42,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 sm:rounded-2xl sm:p-4`;
const recordPanelClass =
  "scroll-mt-24 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_18px_42px_-36px_rgba(15,23,42,0.3)] ring-1 ring-blue-100/40 sm:rounded-2xl sm:p-5";
const recordActionRowClass = "flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap sm:items-center";
const recordActionRowEndClass = `${recordActionRowClass} sm:justify-end`;
const recordPrimaryButtonClass = `${primaryButtonClass} w-full sm:w-auto`;
const recordSecondaryButtonClass = `${secondaryButtonClass} w-full sm:w-auto`;
const recordDarkButtonClass = `${darkButtonClass} w-full sm:w-auto`;
const recordCloseButtonClass = `${compactSecondaryButtonClass} w-full sm:w-auto`;
const recordDestructiveButtonClass =
  "inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-rose-600 bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-[background-color,box-shadow,transform] hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 active:translate-y-[0.5px] sm:w-auto";
const workspaceSoftCardClass =
  "rounded-xl border border-slate-200/80 bg-slate-50/72 p-4";
const workspaceEmptyStateClass =
  "rounded-lg border border-dashed border-slate-300 bg-slate-50/72 px-4 py-4 text-sm text-slate-600";

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
  // Slice B: the classic mobile surface (MobileJobDetailCurrent) is retired.
  // V2Preview is the only mobile surface; ?mobileLayout=current|classic no longer
  // switches components (the param is now inert for mobile selection).

  // Desktop V2 is the only desktop surface. The classic desktop layout and its
  // ?desktopLayout=current|classic / ?legacy=1 escape hatch have been removed;
  // those params are now inert.

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
      : banner === "assignment_team_updated"
      ? "Assigned team updated."
      : banner === "assignment_team_unchanged"
      ? "Assigned team was unchanged."
      : banner === "assignment_team_target_invalid"
      ? "One or more selected team members cannot be assigned to this job."
      : banner === "assignment_team_update_failed"
      ? "Could not update the assigned team."
      : banner === "assignment_primary_set"
      ? "Primary assignee updated."
      : banner === "assignment_primary_target_invalid"
      ? "That team member is not currently assigned to this job."
      : banner === "assignment_primary_failed"
      ? "Could not update the primary assignee."
      : banner === "assignment_removed"
      ? "Assignee removed from this job."
      : banner === "assignment_user_required"
      ? "Select a team member to assign."
      : "";
  const assignmentBannerType =
    banner === "assignment_primary_failed"
      ? "error"
      : banner === "assignment_user_required" ||
        banner === "assignment_primary_target_invalid" ||
        banner === "assignment_team_target_invalid" ||
        banner === "assignment_team_update_failed" ||
        banner === "assignment_team_unchanged"
      ? "warning"
      : "success";
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

  let supabase = await timedPhase("createClient", () => createClient());

  const {
    data: { user },
  } = await timedPhase("authGetUser", () => supabase.auth.getUser());

  if (!user) redirect("/login");

  // The actor resolution and the contractor shadow-membership read both depend
  // only on user.id, so they run concurrently instead of serially.
  const [actorResolution, contractorShadowMembershipResult] = await Promise.all([
    timedPhase("actorRoleResolution", () =>
      resolveJobDetailActor({
        supabase,
        userId: user.id,
      }),
    ),
    timedPhase(
      "contractorShadowMembershipRead",
      async () =>
        await supabase
          .from("contractor_users")
          .select("contractor_id")
          .eq("user_id", user.id)
          .maybeSingle(),
    ),
  ]);

  if (actorResolution.kind === "contractor") {
    redirect(`/portal/jobs/${jobId}`);
  }

  if (actorResolution.kind === "unauthorized") {
    redirect("/login");
  }

  const internalUser = actorResolution.internalUser;

  const { data: contractorShadowMembership, error: contractorShadowMembershipErr } =
    contractorShadowMembershipResult;

  if (contractorShadowMembershipErr) {
    throw contractorShadowMembershipErr;
  }

  const hasContractorShadowMembership =
    String(contractorShadowMembership?.contractor_id ?? "").trim().length > 0;

  const internalRole = String(internalUser.role ?? "").trim().toLowerCase();
  const canManageWorkflowGuidance = internalRole === "owner" || internalRole === "admin";

  let isInternalUser = true;
  let isInternalAdmin = false;
  let internalBusinessDisplayName = "";
  let billingMode: BillingMode = "external_billing";
  let productMode: ProductMode = "hybrid";

  isInternalAdmin = internalUser.role === "admin";

  // Same-account scoped-job preflight, fail-closed. Wrapped so a thrown error
  // resolves to null instead of rejecting the parallel group below.
  const loadScopedReadJobFailClosed = async (): Promise<{ id?: string | null } | null> => {
    try {
      const scopedReadOutcome = await timedPhase("sameAccountScopedJobBoundary", () =>
        loadScopedInternalJobDetailReadBoundaryOutcome({
          accountOwnerUserId: internalUser.account_owner_user_id,
          jobId,
        }),
      );

      if (scopedReadOutcome.status === "ok") {
        return scopedReadOutcome.job;
      }
      if (scopedReadOutcome.status === "query_error") {
        console.error("[job-detail:sameAccountScopedJobBoundary] query_error fail-closed", {
          jobId,
          accountOwnerUserId: internalUser.account_owner_user_id,
          code: scopedReadOutcome.error.code,
          message: scopedReadOutcome.error.message,
          details: scopedReadOutcome.error.details,
        });
      }
      return null;
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
      return null;
    }
  };

  // Everything here needs only internalUser + user.id, so it all runs as one
  // concurrent group instead of five sequential round-trips. The business
  // profile / product mode reads come from the cross-request tenant reference
  // cache, so they are usually free.
  const [
    contractors,
    internalBusinessIdentity,
    resolvedBillingMode,
    resolvedProductMode,
    explicitFieldBillingCapabilities,
    scopedReadJob,
  ] = await Promise.all([
    timedPhase("contractorsRead", () => getContractors(internalUser.account_owner_user_id)),
    timedPhase("businessProfileReads", () =>
      getCachedInternalBusinessIdentity(internalUser.account_owner_user_id),
    ),
    getCachedBillingMode(internalUser.account_owner_user_id),
    getCachedProductMode(internalUser.account_owner_user_id),
    timedPhase("fieldBillingExplicitCapabilitiesRead", () =>
      loadFieldBillingExplicitCapabilitiesForUser({
        supabase: supabase as any,
        accountOwnerUserId: internalUser.account_owner_user_id,
        internalUserId: user.id,
      }),
    ),
    loadScopedReadJobFailClosed(),
  ]);

  internalBusinessDisplayName = internalBusinessIdentity.display_name;
  billingMode = resolvedBillingMode;
  productMode = resolvedProductMode;
  const surfaceProfile = resolveProductSurfaceProfile(productMode);
  const fieldBillingCapabilities = resolveFieldBillingCapabilities({
    actorUserId: user.id,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    explicitCapabilities: explicitFieldBillingCapabilities,
  });

  if (!scopedReadJob?.id) {
    return notFound();
  }

  if (hasContractorShadowMembership) {
    // Internal users with a contractor membership can trip mutually exclusive RLS policies.
    // Only switch to admin reads after same-account boundary preflight succeeds.
    supabase = createAdminClient();
    console.warn("[job-detail:dual-role-read-client] switched to admin read client", {
      jobId,
      userId: user.id,
      accountOwnerUserId: internalUser.account_owner_user_id,
      contractorId: String(contractorShadowMembership?.contractor_id ?? "").trim() || null,
    });
  }

  const { data: job, error: jobError } = await timedPhase("mainJobRead", async () => {
    const primary = await supabase
      .from("jobs")
      .select(MAIN_JOB_SELECT_WITH_BILLING_DISPOSITION)
      .eq("id", jobId)
      .single();

    if (!primary.error || !isMissingJobsBillingDispositionColumnError(primary.error)) {
      return primary;
    }

    const compat = await supabase
      .from("jobs")
      .select(MAIN_JOB_SELECT_COMPAT)
      .eq("id", jobId)
      .single();

    if (compat.error) return compat;

    return {
      data: {
        ...(compat.data ?? {}),
        billing_disposition: null,
        billing_disposition_note: null,
        billing_disposition_at: null,
        billing_disposition_by_user_id: null,
      },
      error: null,
    };
  });

  if (jobError) {
    console.error("[job-detail:mainJobRead] query_error", {
      jobId,
      userId: user.id,
      accountOwnerUserId: internalUser.account_owner_user_id,
      hasContractorShadowMembership,
      code: (jobError as any)?.code ?? null,
      message: (jobError as any)?.message ?? String(jobError),
      details: (jobError as any)?.details ?? null,
      hint: (jobError as any)?.hint ?? null,
    });
    throw jobError;
  }
  if (!job) return notFound();
  if (job.deleted_at) redirect("/ops?saved=job_archived");
  setPhaseValue("eccPayloadReads", phaseDurationsMs.mainJobRead ?? 0);

  // Only consumed at render time — joins the grouped parallel await below
  // instead of blocking the promise-creation section behind a round-trip.
  const equipmentSystemsPromise = timedPhase("equipmentSystemsRead", async () => {
    const { data, error } = await supabase
      .from("job_systems")
      .select("id, name")
      .eq("job_id", jobId)
      .order("name", { ascending: true });

    if (error) throw error;
    return data as Array<{ id: string; name: string | null }> | null;
  });

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
          visit_scope_source_ids: string[];
          visit_scope_billed_lines: Record<string, VisitScopeBilledLine>;
          unlinked_invoice_charges: UnlinkedInvoiceCharge[];
          add_on_invoices: Array<{
            id: string;
            label: string;
            status: InternalInvoiceStatus;
            total_cents: number;
            total_text: string;
            balance_due_cents: number;
            supplemental_reason: string | null;
          }>;
          family_total_cents: number;
          family_balance_due_cents: number;
          member_job_count: number;
        } | null,
        internalInvoicePaymentSummaryTruth: null as InternalInvoiceCollectedPaymentSummary | null,
        internalInvoicePaymentRowsTruth: [] as InternalInvoicePaymentRow[],
      };
    }

    const invoiceTruthRow = await resolveInternalInvoiceByJobId({ supabase, jobId });

    if (!invoiceTruthRow) {
      return {
        internalInvoiceTruth: null,
        internalInvoicePaymentSummaryTruth: null,
        internalInvoicePaymentRowsTruth: [] as InternalInvoicePaymentRow[],
      };
    }

    const [
      internalInvoicePaymentLedger,
      addOnInvoiceRows,
    ] = await Promise.all([
      resolveInvoiceCollectedPaymentLedger(
        internalUser.account_owner_user_id,
        String(invoiceTruthRow.id),
        supabase,
      ),
      // Add-ons are the only way to bill work found after the primary was issued,
      // so the job screen has to account for them or that work reads as un-billed.
      resolveJobAddOnInvoicesWithLines({ supabase, jobId }),
    ]);

    const addOnPaymentSummaries = await Promise.all(
      addOnInvoiceRows.map((addOn) =>
        resolveInvoiceCollectedPaymentSummary(
          internalUser.account_owner_user_id,
          addOn.id,
          supabase,
        ),
      ),
    );

    const invoiceLineItems = invoiceTruthRow.line_items ?? [];
    const visitScopeSourceIds = invoiceLineItems
      .filter((lineItem: any) => lineItem?.source_kind === "visit_scope")
      .map((lineItem: any) => sanitizeVisitScopeItemId(lineItem?.source_visit_scope_item_id))
      .filter(Boolean) as string[];
    // Work Item rows read the billed charge back off this view so an imported item
    // reports what the invoice actually says instead of its own frozen capture price,
    // across the primary invoice and every add-on.
    const {
      billedLines: visitScopeBilledLines,
      unlinkedCharges: unlinkedInvoiceCharges,
    } = buildInvoiceFamilyBillingView({
      jobId,
      primaryLineItems: invoiceLineItems,
      isPrimaryConsolidated: (invoiceTruthRow.member_job_ids?.length ?? 1) > 1,
      addOnInvoices: addOnInvoiceRows,
    });

    const addOnInvoices = addOnInvoiceRows.map((addOn, index) => ({
      id: addOn.id,
      label: formatAddOnInvoiceLabel(addOn.invoice_display_number),
      status: addOn.status,
      total_cents: addOn.total_cents,
      total_text: formatCurrencyFromCents(addOn.total_cents),
      balance_due_cents: Number(addOnPaymentSummaries[index]?.balanceDueCents ?? 0) || 0,
      supplemental_reason: addOn.supplemental_reason,
    }));

    const primaryJobShareCents = resolveInternalInvoiceJobShareCents(invoiceTruthRow, jobId);
    const familyTotalCents = addOnInvoices.reduce(
      (total, addOn) => total + addOn.total_cents,
      primaryJobShareCents,
    );
    const familyBalanceDueCents = addOnInvoices.reduce(
      (total, addOn) => total + addOn.balance_due_cents,
      Number(internalInvoicePaymentLedger.summary?.balanceDueCents ?? 0) || 0,
    );

    return {
      internalInvoiceTruth: {
        id: String(invoiceTruthRow.id),
        status: normalizeInternalInvoiceStatus(invoiceTruthRow.status),
        invoice_display_number: String(invoiceTruthRow.invoice_display_number ?? "").trim() || null,
        invoice_number: String(invoiceTruthRow.invoice_number ?? "").trim(),
        issued_at: invoiceTruthRow.issued_at ?? null,
        total_cents: resolveInternalInvoiceJobShareCents(invoiceTruthRow, jobId),
        billing_name: String(invoiceTruthRow.billing_name ?? "").trim() || null,
        billing_email: String(invoiceTruthRow.billing_email ?? "").trim() || null,
        line_item_count: invoiceLineItems.length,
        visit_scope_source_ids: visitScopeSourceIds,
        visit_scope_billed_lines: visitScopeBilledLines,
        unlinked_invoice_charges: unlinkedInvoiceCharges,
        add_on_invoices: addOnInvoices,
        family_total_cents: familyTotalCents,
        family_balance_due_cents: familyBalanceDueCents,
        member_job_count: Math.max(1, invoiceTruthRow.member_job_ids?.length ?? 1),
      },
      internalInvoicePaymentSummaryTruth: internalInvoicePaymentLedger.summary,
      internalInvoicePaymentRowsTruth: internalInvoicePaymentLedger.rows,
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

  const attachmentCountPromise = timedPhase("attachmentCount", async () => {
    const { count, error } = await supabase
      .from("attachments")
      .select("id", { count: "exact", head: true })
      .eq("entity_type", "job")
      .eq("entity_id", jobId);

    if (error) return null;
    return Number(count ?? 0) || 0;
  });

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

  const serviceFollowUpProgressEventsPromise = timedPhase("serviceFollowUpProgressEvents", async () => {
    const pendingReason = String((job as any).pending_info_reason ?? "").trim();
    const isServiceFollowUp =
      String(job.job_type ?? "").trim().toLowerCase() === "service" &&
      String(job.ops_status ?? "").trim().toLowerCase() === "pending_info" &&
      /^(Materials Needed|Approval Needed|Other):/i.test(pendingReason);

    if (!isServiceFollowUp) {
      return [] as Array<{ created_at?: string | null; meta?: unknown }>;
    }

    const { data: rows, error: rowsErr } = await supabase
      .from("job_events")
      .select("created_at, meta")
      .eq("job_id", String(job.id ?? jobId))
      .eq("event_type", "ops_update")
      .order("created_at", { ascending: true })
      .limit(100);

    if (rowsErr) return [] as Array<{ created_at?: string | null; meta?: unknown }>;

    return (rows ?? []).map((row: any) => ({
      created_at: String(row?.created_at ?? "").trim() || null,
      meta: row?.meta ?? null,
    }));
  });

  const activeRetestChildPromise = timedPhase("activeRetestChildRead", async () => {
    if (String(job.job_type ?? "").trim().toLowerCase() !== "ecc" || parentJobId) return null;

    const { data, error } = await supabase
      .from("jobs")
      .select("id, status, ops_status, scheduled_date, window_start, window_end")
      .eq("parent_job_id", jobId)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ?? null;
  });

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

  // Depends on the invoice truth read, so it awaits that promise internally —
  // keeping the top-level flow non-blocking so the remaining promises below
  // start immediately instead of waiting on the invoice ledger round-trips.
  const fieldBillingSummaryDataPromise = timedPhase("fieldBillingSummaryRead", async () => {
    const { internalInvoiceTruth } = await immediateInvoiceTruthPromise;
    const showInternalInvoicePanelForFieldBillingRead =
      isInternalUser &&
      buildJobBillingStateReadModel({
        billingMode,
        invoiceComplete: job.invoice_complete,
        internalInvoice: internalInvoiceTruth,
        billingDisposition: (job as any).billing_disposition,
      }).internalInvoicePanelEnabled;

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

  const maintenanceAgreementsEnabled = isMaintenanceAgreementsEnabled();

  const maintenanceAgreementPromise = timedPhase("maintenanceAgreementRead", async () => {
    if (!(maintenanceAgreementsEnabled && job.job_type === "service")) {
      return {
        markVisitCountedLinkId: null as string | null,
        markVisitCountedAgreementName: null as string | null,
        planLinkContext: null as { agreementId: string; agreementName: string } | null,
        suggestedNextDueProjection: null as {
          agreementName: string;
          agreementId: string;
          suggestedNextDueDate: string | null;
          baselineNextDueDate: string | null;
          manualSchedulingRequired: boolean;
          seasonalWindowPlaceholder: string;
        } | null,
        confirmedNextDueContext: null as {
          agreementName: string;
          confirmedNextDueDate: string | null;
          baselineNextDueDate: string | null;
        } | null,
      };
    }

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
    let markVisitCountedLinkId: string | null = null;
    let markVisitCountedAgreementName: string | null = null;

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

    const firstNonReversedLink = maintenanceLinks.find(
      (link) => String(link.count_status ?? "").trim().toLowerCase() !== "reversed",
    );
    const planLinkContext = firstNonReversedLink
      ? {
          agreementId: String(firstNonReversedLink.agreement_id ?? "").trim(),
          agreementName: suggestedNextDueProjection?.agreementName ?? "Service Plan",
        }
      : null;

    return {
      markVisitCountedLinkId,
      markVisitCountedAgreementName,
      planLinkContext,
      suggestedNextDueProjection,
      confirmedNextDueContext,
    };
  });

  // Checklist items (Phase 1, desktop/admin only, gated on feature flag + isInternalUser)
  type JobChecklistItem = {
    id: string;
    item_label: string;
    sort_order: number;
    is_completed: boolean;
    notes: string | null;
    completed_by_user_id: string | null;
    completed_at: string | null;
  };
  const jobChecklistItemsPromise = timedPhase("jobChecklistItemsRead", async (): Promise<JobChecklistItem[]> => {
    if (!(isMaintenanceAgreementsEnabled() && isInternalUser)) return [];
    try {
      const { data: checklistRows } = await supabase
        .from("job_checklist_item_completions")
        .select("id, item_label, sort_order, is_completed, notes, completed_by_user_id, completed_at")
        .eq("job_id", String(job.id ?? ""))
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(50);
      if (!Array.isArray(checklistRows)) return [];
      return checklistRows.map((row: any) => ({
        id: String(row.id ?? ""),
        item_label: String(row.item_label ?? ""),
        sort_order: Number(row.sort_order ?? 0),
        is_completed: Boolean(row.is_completed),
        notes: row.notes ? String(row.notes) : null,
        completed_by_user_id: row.completed_by_user_id ? String(row.completed_by_user_id) : null,
        completed_at: row.completed_at ? String(row.completed_at) : null,
      }));
    } catch {
      return [];
    }
  });

  const savedCustomerServiceLocationsPromise = timedPhase("savedCustomerServiceLocationsRead", async () => {
    if (!(isInternalUser && customerId)) {
      return [] as Array<{
        id: string;
        nickname: string | null;
        label: string | null;
        address_line1: string | null;
        address_line2: string | null;
        city: string | null;
        state: string | null;
        zip: string | null;
        postal_code?: string | null;
      }>;
    }
    const { data, error } = await supabase
      .from("locations")
      .select("id, nickname, label, address_line1, address_line2, city, state, zip, postal_code")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Array<{
      id: string;
      nickname: string | null;
      label: string | null;
      address_line1: string | null;
      address_line2: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      postal_code?: string | null;
    }>;
  });

  const [
    activeAssignmentDisplayMap,
    serviceCaseSummary,
    timelineSummary,
    noteCountSummary,
    attachmentCount,
    latestJobNotesPreview,
    onTheWayUndoEligibility,
    billingPartyReads,
    visitScopePricebookTemplates,
    customerRoleContacts,
    locationRoleContacts,
    jobRoleContacts,
    customerAttemptSummary,
    fieldBillingSummaryData,
    serviceFollowUpProgressEvents,
    activeRetestChild,
    maintenanceAgreementResult,
    equipmentSystems,
    { internalInvoiceTruth, internalInvoicePaymentSummaryTruth, internalInvoicePaymentRowsTruth },
    jobChecklistItems,
    savedCustomerServiceLocations,
  ] = await Promise.all([
    assignmentDisplayPromise,
    serviceCaseSummaryPromise,
    timelineSummaryPromise,
    noteCountSummaryPromise,
    attachmentCountPromise,
    latestJobNotesPreviewPromise,
    onTheWayUndoEligibilityPromise,
    billingPartyReadsPromise(),
    visitScopePricebookTemplatesPromise,
    customerRoleContactsPromise,
    locationRoleContactsPromise,
    jobRoleContactsPromise,
    customerAttemptSummaryPromise,
    fieldBillingSummaryDataPromise,
    serviceFollowUpProgressEventsPromise,
    activeRetestChildPromise,
    maintenanceAgreementPromise,
    equipmentSystemsPromise,
    immediateInvoiceTruthPromise,
    jobChecklistItemsPromise,
    savedCustomerServiceLocationsPromise,
  ]);

  const {
    markVisitCountedLinkId,
    markVisitCountedAgreementName,
    planLinkContext,
    suggestedNextDueProjection,
    confirmedNextDueContext,
  } = maintenanceAgreementResult;

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
        billingName: internalInvoiceTruth.billing_name,
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
    billingName: invoice.billing_name,
    billToKind: invoice.bill_to_kind,
    workspaceHref: `/jobs/${job.id}/invoice?invoice_id=${encodeURIComponent(invoice.id)}#invoice-workspace`,
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

  const serviceLocationOptions = savedCustomerServiceLocations.map((loc) => {
    const locAddress = [
      loc.address_line1,
      loc.address_line2,
      [loc.city, loc.state, loc.zip ?? loc.postal_code].filter(Boolean).join(" "),
    ]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join(", ");
    const locName = String(loc.nickname ?? loc.label ?? "").trim();
    const label =
      [locName, locAddress].filter(Boolean).join(" - ") ||
      `Location ${loc.id.slice(0, 8)}`;

    return {
      id: loc.id,
      label,
    };
  });

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
  const mobileAppointmentTimeLabel = job.scheduled_date ? appointmentTimeLabel : "";

function formatOpsStatusLabel(value?: string | null, jobType?: string | null) {
  const v = String(value ?? "").trim();
  if (!v) return "—";

  const eccLabel = isEccWorkflowJobType(jobType) ? formatEccOpsStatusLabel(v, "internal") : null;
  if (eccLabel) return eccLabel;

  const labelMap: Record<string, string> = {
    need_to_schedule: "Need to Schedule",
    scheduled: "Scheduled",
    on_the_way: "On the Way",
    in_process: "In Progress",
    pending_info: "Pending Info",
    pending_office_review: "Office Review Needed",
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
    return "bg-slate-200 text-slate-800";
  }

  return "bg-slate-100 text-slate-700";
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

// Lane 4 — Google review ask (field-complete trigger + per-account review URL)
const googleReviewUrl = internalBusinessIdentity.google_review_url ?? null;
const canShowReviewAsk =
  isInternalUser &&
  isFieldComplete &&
  Boolean(googleReviewUrl) &&
  !isJobArchived &&
  !isJobCancelled;
const reviewAskLinks = canShowReviewAsk && googleReviewUrl
  ? buildReviewAskLinks({
      customerFirstName: job.customer_first_name ?? null,
      customerEmail: job.customer_email ?? null,
      customerPhone: job.customer_phone ?? null,
      googleReviewUrl,
      businessName: internalBusinessDisplayName || "our team",
    })
  : null;
const reviewAskMailtoHref = reviewAskLinks?.mailtoHref ?? null;
const reviewAskSmsHref = reviewAskLinks?.smsHref ?? null;

const showFieldOutcomePanel =
  job.job_type !== "ecc" &&
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
const currentOpsStatus = String(job.ops_status ?? "").toLowerCase();
const pendingInfoReasonText = String((job as any).pending_info_reason ?? "").trim();
const hasServiceFieldFollowUpPendingInfo =
  String(job.job_type ?? "").trim().toLowerCase() === "service" &&
  isFieldComplete &&
  currentOpsStatus === "pending_info" &&
  /^(Materials Needed|Approval Needed|Other):/i.test(pendingInfoReasonText);
const serviceFollowUpProgressState = buildServiceFollowUpProgressState({
  pendingInfoReason: pendingInfoReasonText,
  events: serviceFollowUpProgressEvents,
});
const isServiceFollowUpContinued = Boolean(serviceFollowUpProgressState.continuedThroughChildJobId);
const isServiceFieldFollowUpPendingInfo =
  hasServiceFieldFollowUpPendingInfo && !isServiceFollowUpContinued;
const isHistoricalServiceFollowUpContinued =
  hasServiceFieldFollowUpPendingInfo && isServiceFollowUpContinued;
const workflowChipLabel =
  isHistoricalServiceFollowUpContinued
    ? serviceFollowUpProgressState.continuedScheduledDate
      ? "Return Scheduled"
      : "Follow-Up Continued"
  : normalizedJobStatus === "in_process" && !isFieldComplete
    ? "In Process"
    : formatOpsStatusLabel(job.ops_status, job.job_type);

const isFailedUnresolved =
  ["failed", "retest_needed", "pending_office_review"].includes(
    String(job.ops_status ?? "").trim().toLowerCase(),
  );
const failedReasonBannerNote = String((job as any).ops_board_failure_note ?? "").replace(/\s+/g, " ").trim();
const canShowEccFailedReasonBanner =
  isInternalUser &&
  String(job.job_type ?? "").trim().toLowerCase() === "ecc" &&
  isFailedFamilyOpsStatus(job.ops_status);
const failedReasonBannerText = failedReasonBannerNote
  ? `Failed Test - ${failedReasonBannerNote}`
  : "Failed Test";
const isEccPermitNeededActive = isEccPermitNeededBlocker({
  job_type: job.job_type,
  ops_status: job.ops_status,
  pending_info_reason: (job as any).pending_info_reason ?? null,
}) && surfaceProfile.surfaces.permits;
const hasValidEccPermitNumber =
  !surfaceProfile.surfaces.permits || job.job_type !== "ecc" || isValidEccPermitNumber(job.permit_number);
const billingState = buildJobBillingStateReadModel({
  billingMode,
  invoiceComplete: job.invoice_complete,
  internalInvoice: internalInvoiceTruth,
  billingDisposition: (job as any).billing_disposition,
});
const jobBillingDisposition = normalizeJobBillingDisposition((job as any).billing_disposition);
const jobBillingDispositionLabel = formatJobBillingDispositionLabel(jobBillingDisposition);

const closeoutProjectionJob = {
  field_complete: job.field_complete,
  job_type: job.job_type,
  ops_status: job.ops_status,
  pending_info_reason: (job as any).pending_info_reason ?? null,
  on_hold_reason: (job as any).on_hold_reason ?? null,
  permit_number: job.permit_number ?? null,
  invoice_complete: billingState.billedTruthSatisfied,
  certs_complete: job.certs_complete,
};

const isAdminComplete =
  (job.job_type === "service" && billingState.billedTruthSatisfied) ||
  (job.job_type === "ecc" && billingState.billedTruthSatisfied && (!surfaceProfile.surfaces.certs || job.certs_complete));

const closeoutNeeds = getCloseoutNeeds(closeoutProjectionJob);
const isCloseoutPending = isInCloseoutQueue(closeoutProjectionJob);

const canShowCertsButton =
  surfaceProfile.surfaces.certs &&
  job.job_type === "ecc" &&
  !job.certs_complete &&
  !isFailedUnresolved &&
  !isEccPermitNeededActive &&
  hasValidEccPermitNumber;

const canShowInvoiceButton =
  job.job_type === "ecc" &&
  !billingState.billedTruthSatisfied &&
  billingState.lightweightBillingAllowed &&
  String(job.ops_status ?? "") !== "closed";

const billingModeBlocksLightweightBilling = !billingState.lightweightBillingAllowed;

const showInternalInvoicingPlaceholder = shouldShowInternalInvoiceRequiredBanner({
  isInternalUser,
  billingModeBlocksLightweightBilling,
  billedTruthSatisfied: billingState.billedTruthSatisfied,
  needsInvoice: closeoutNeeds.needsInvoice,
  isCloseoutPending,
  currentOpsStatus,
  jobType: job.job_type,
});

const showPrimaryCloseoutBlockers =
  isInternalUser &&
  (isFieldComplete || job.status === "completed") &&
  (isCloseoutPending || closeoutNeeds.isFailureFlow) &&
  !isServiceFieldFollowUpPendingInfo;

const showCertsPermitRequiredBlocker =
  surfaceProfile.surfaces.certs &&
  surfaceProfile.surfaces.permits &&
  job.job_type === "ecc" &&
  !job.certs_complete &&
  !isFailedUnresolved &&
  !hasValidEccPermitNumber;

const hasActionHeavyPrimaryNextAction =
  showPrimaryCloseoutBlockers ||
  isEccPermitNeededActive ||
  (surfaceProfile.surfaces.retest &&
    job.job_type === "ecc" &&
    !parentJobId &&
    !Boolean((activeRetestChild as any)?.id) &&
    ["failed", "pending_office_review", "retest_needed"].includes(String(job.ops_status ?? "").trim().toLowerCase())) ||
  (isServiceFieldFollowUpPendingInfo && Boolean(serviceFollowUpProgressState.reason));

const primaryCloseoutMessage =
  getJobDetailCloseoutReadinessMessage(closeoutProjectionJob);

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

const canManageFinancialInvoiceLifecycleOnJobDetail = canManageInvoiceLifecycle({
  actorUserId: user.id,
  internalUser,
  resourceAccountOwnerUserId: internalUser.account_owner_user_id,
});

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
const activeRaterWorkshareConnections = isInternalUser
  ? await listAccountWorkshareConnectionsForAccount(supabase as any, internalUser.account_owner_user_id, {
      serviceType: "ecc_hers",
      statuses: ["active"],
      limit: 100,
    }).then((rows) => rows.filter((row) => row.sender_account_id === internalUser.account_owner_user_id))
  : [];
const sourceJobWorkshareRequests = isInternalUser
  ? await listAccountWorkshareRequestsForSourceJob(
      supabase as any,
      internalUser.account_owner_user_id,
      String(job.id),
    )
  : [];
const hasActiveRaterWorkshareConnection = activeRaterWorkshareConnections.length > 0;
const visitScopeReadyTotalCents = visitScopeItems.reduce((sum, item) => {
  const unitPrice = Number(item.expected_unit_price ?? 0);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return sum;
  return sum + Math.round(unitPrice * 100);
}, 0);
const invoiceVisitScopeSourceIds = new Set(internalInvoiceTruth?.visit_scope_source_ids ?? []);
const visitScopeBilledLines = internalInvoiceTruth?.visit_scope_billed_lines ?? {};
const unlinkedInvoiceCharges = internalInvoiceTruth?.unlinked_invoice_charges ?? [];
const unaddedPricedVisitScopeItems = visitScopeItems.filter((item) => {
  const unitPrice = Number(item.expected_unit_price ?? 0);
  const itemId = sanitizeVisitScopeItemId(item.id);
  return Number.isFinite(unitPrice) && unitPrice > 0 && Boolean(itemId) && !invoiceVisitScopeSourceIds.has(itemId!);
});
const eligibleUnaddedPricedWorkItemsTotalCents = unaddedPricedVisitScopeItems.reduce((sum, item) => {
  const unitPrice = Number(item.expected_unit_price ?? 0);
  return Number.isFinite(unitPrice) && unitPrice > 0 ? sum + Math.round(unitPrice * 100) : sum;
}, 0);
const invoiceHasCharges = Number(internalInvoiceTruth?.line_item_count ?? 0) > 0;
// Any draft with priced Work Items still off it needs the prompt. This used to also
// require the draft to be empty, so adding a second Work Item to a draft that already
// had a charge went completely unannounced — the common case, since the first import
// creates one.
const hasUnaddedPricedWorkItemsForDraftInvoice =
  Boolean(internalInvoiceTruth) &&
  internalInvoiceTruth?.status === "draft" &&
  eligibleUnaddedPricedWorkItemsTotalCents > 0;
// Once the primary is issued its charges are locked, so newly captured work can only
// be billed on an add-on invoice.
const hasUnaddedPricedWorkItemsForIssuedInvoice =
  Boolean(internalInvoiceTruth) &&
  internalInvoiceTruth?.status === "issued" &&
  eligibleUnaddedPricedWorkItemsTotalCents > 0;
const hasEmptyDraftInvoiceWithoutPricedWorkItems =
  Boolean(internalInvoiceTruth) &&
  internalInvoiceTruth?.status === "draft" &&
  !invoiceHasCharges &&
  Number(internalInvoiceTruth?.total_cents ?? 0) === 0 &&
  eligibleUnaddedPricedWorkItemsTotalCents <= 0;
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
const jobPageInvoiceStateLabel = hasUnaddedPricedWorkItemsForDraftInvoice ? "Billing Review" : resolveJobInvoiceStateLabel({
  hasInvoice: Boolean(internalInvoiceTruth),
  invoiceStatus: internalInvoiceTruth?.status,
  invoiceTotalCents: internalInvoiceTruth?.total_cents,
  hasInvoiceCharges: invoiceHasCharges,
  paymentStatus: internalInvoicePaymentSummaryTruth?.paymentStatus,
  balanceDueCents: internalInvoicePaymentSummaryTruth?.balanceDueCents,
  billingDispositionLabel: jobBillingDispositionLabel,
  billedTruthSatisfied: billingState.billedTruthSatisfied,
  hasVisitScopeDefined,
});
const jobPageInvoiceNextAction = resolveJobInvoiceActionLabel({
  hasInvoice: Boolean(internalInvoiceTruth),
  invoiceStatus: internalInvoiceTruth?.status,
  invoiceTotalCents: internalInvoiceTruth?.total_cents,
  hasInvoiceCharges: invoiceHasCharges,
  paymentStatus: internalInvoicePaymentSummaryTruth?.paymentStatus,
  balanceDueCents: internalInvoicePaymentSummaryTruth?.balanceDueCents,
  billingDispositionLabel: jobBillingDispositionLabel,
  billedTruthSatisfied: billingState.billedTruthSatisfied,
  hasVisitScopeDefined,
  eligibleUnaddedPricedWorkItemsTotalCents,
});
const jobPageInvoicePaymentSummaryText =
  internalInvoiceTruth?.status === "issued" && internalInvoicePaymentSummaryTruth && !jobBillingDispositionLabel
    ? internalInvoicePaymentSummaryTruth.paymentStatus === "paid"
      ? `Paid ${formatCurrencyFromCents(internalInvoicePaymentSummaryTruth.amountPaidCents)}`
      : internalInvoicePaymentSummaryTruth.paymentStatus === "partial"
        ? `Paid ${formatCurrencyFromCents(internalInvoicePaymentSummaryTruth.amountPaidCents)} - Balance ${formatCurrencyFromCents(internalInvoicePaymentSummaryTruth.balanceDueCents)}`
        : `Balance ${formatCurrencyFromCents(internalInvoicePaymentSummaryTruth.balanceDueCents)}`
    : null;
const jobPageAddOnInvoices = internalInvoiceTruth?.add_on_invoices ?? [];
const jobPageAddOnSummaryText = jobPageAddOnInvoices.length > 0
  ? jobPageAddOnInvoices
      .map((addOn) => `${addOn.label}: ${formatCurrencyFromCents(addOn.total_cents)}`)
      .join(" - ")
  : null;
const jobPageInvoiceSummaryText = internalInvoiceTruth
  ? hasUnaddedPricedWorkItemsForIssuedInvoice
    ? [
        `Work captured since issuing: ${formatCurrencyFromCents(eligibleUnaddedPricedWorkItemsTotalCents)}`,
        `${jobPageInvoiceDisplayReference ?? "Invoice"} is issued, so its charges are locked.`,
        "Create an add-on invoice to bill the newly captured work.",
      ].join(" ")
    : hasUnaddedPricedWorkItemsForDraftInvoice
    ? [
        `Work captured: ${formatCurrencyFromCents(eligibleUnaddedPricedWorkItemsTotalCents)}`,
        `Draft invoice: ${formatCurrencyFromCents(internalInvoiceTruth.total_cents)} - ${internalInvoiceTruth.line_item_count} charges.`,
        "Work Item pricing is ready to add as editable draft invoice charges. Review and edit before issuing.",
      ].join(" ")
    : hasEmptyDraftInvoiceWithoutPricedWorkItems
      ? [
          `Draft invoice: ${formatCurrencyFromCents(internalInvoiceTruth.total_cents)} - ${internalInvoiceTruth.line_item_count} charges.`,
          "No invoice charges have been added yet. Add charges, mark external billing complete, or mark no charge as appropriate.",
        ].join(" ")
      : [
      jobPageInvoiceDisplayReference,
      internalInvoiceTruth.member_job_count > 1
        ? `Consolidated contractor invoice - included with ${internalInvoiceTruth.member_job_count - 1} additional ${internalInvoiceTruth.member_job_count === 2 ? "job" : "jobs"}`
        : null,
      `${internalInvoiceTruth.line_item_count} charge${internalInvoiceTruth.line_item_count === 1 ? "" : "s"}`,
      formatCurrencyFromCents(internalInvoiceTruth.total_cents),
      // Add-ons carry their own balance, so a family total that ignored them
      // understated what the customer still owes on this job.
      jobPageAddOnSummaryText,
      jobPageAddOnInvoices.length > 0
        ? `Job total ${formatCurrencyFromCents(internalInvoiceTruth.family_total_cents)} - Balance ${formatCurrencyFromCents(internalInvoiceTruth.family_balance_due_cents)}`
        : jobPageInvoicePaymentSummaryText,
    ].filter(Boolean).join(" - ")
  : hasVisitScopeDefined
    ? `${visitScopeCount} work item${visitScopeCount === 1 ? "" : "s"} ready to price and review.`
    : "Add work performed, then price it before building the invoice.";
const recordedInternalInvoicePaymentRows = internalInvoicePaymentRowsTruth.filter(
  (payment) => payment.payment_status === "recorded",
);
const latestStripeReceivedPayment =
  recordedInternalInvoicePaymentRows.find((payment) => isStripeSourcedPayment(payment)) ?? null;
const latestStripeReceivedCopy =
  latestStripeReceivedPayment && internalInvoiceTruth
    ? stripePaymentReceivedCopy(latestStripeReceivedPayment, jobPageInvoiceDisplayReference ?? "Internal Invoice")
    : null;
const showSeparateFieldBillingDetails =
  showInternalInvoicePanel &&
  (
    !hasDirectInvoiceWorkflowAccess ||
    fieldBillingSummaryData.fieldChargeProposals.length > 0 ||
    fieldBillingSupplementalInvoiceSnapshots.length > 0
  );

const canShowReleaseAndReevaluate = !hasServiceFieldFollowUpPendingInfo && [
  "pending_info",
  "on_hold",
  "failed",
  "retest_needed",
  "paperwork_required",
  "invoice_required",
].includes(currentOpsStatus);

const onHoldReasonText = String((job as any).on_hold_reason ?? "").trim();
const explicitPendingInfoActive = currentOpsStatus === "pending_info" && !isHistoricalServiceFollowUpContinued;
const onHoldActive = currentOpsStatus === "on_hold";
const activeWaitingState = isHistoricalServiceFollowUpContinued ? null : getActiveWaitingState({
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
const serviceLocationEditHref = locationId ? `/locations/${locationId}` : null;

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
const complianceWorkSummary = buildComplianceWorkSummary({
  equipmentCount,
  eccRuns,
  hasValidPermit: isValidEccPermitNumber(job.permit_number),
  permitNeeded: isEccPermitNeededActive,
});
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
const hasCompletedEccTestRun = eccRuns.some((run: any) => run?.is_completed === true);
const shouldShowEccMissingTestNotice = showEccNotice && isEccJobType && !hasCompletedEccTestRun;
const completionActionAttentionBanner =
  shouldShowEccMissingTestNotice
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
  : `Current lifecycle: ${formatOpsStatusLabel(job.ops_status, job.job_type)}`;
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
const isCleaningMode = productMode === "cleaning_services";
const jobTitleText = normalizeRetestLinkedJobTitle(job.title);
const serviceVisitReasonText = String(job.service_visit_reason ?? "").trim();
const jobNotesText = String(job.job_notes ?? "").trim();
const startedFromPermitWorkflow = /^Created from permit request\b/i.test(jobNotesText);
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
  firstNonEmpty(serviceVisitReasonText, jobTitleText) ??
  "No visit reason saved yet.";
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
const showSharedNotesCard = !isHvacServiceMode && !isCleaningMode;
const showEccSummaryCard = surfaceProfile.surfaces.eccTests && job.job_type === "ecc";
const showJobRecordsPermitCard = surfaceProfile.surfaces.permits && (showEccSummaryCard || hasPermitDetails);
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
const attachmentCountMeta = attachmentCount === null
  ? undefined
  : `${attachmentCount} file${attachmentCount === 1 ? "" : "s"}`;
const sharedNotesSummaryText = undefined;
const internalNotesSummaryText = undefined;
const timelineSummaryText = undefined;

const normalizedJobOpsStatus = String(job.ops_status ?? "").trim().toLowerCase();
const hasActiveRetestChild = Boolean((activeRetestChild as any)?.id);
const linkedRetestChildClosed =
  String((activeRetestChild as any)?.ops_status ?? "").trim().toLowerCase() === "closed" ||
  String((activeRetestChild as any)?.status ?? "").trim().toLowerCase() === "completed";
const activeRetestChildScheduled = Boolean(
  (activeRetestChild as any)?.scheduled_date ||
    (activeRetestChild as any)?.window_start ||
    (activeRetestChild as any)?.window_end,
);
const showLinkedRetestCreated = surfaceProfile.surfaces.retest && job.job_type === "ecc" && hasActiveRetestChild && !parentJobId;
const linkedRetestPassiveHeading = linkedRetestChildClosed
  ? "Linked Retest Completed"
  : activeRetestChildScheduled
  ? "Retest Scheduled"
  : "Linked Retest Created";
const linkedRetestPassiveCopy = linkedRetestChildClosed
  ? "The linked retest job is complete. Review that retest result and remaining closeout blockers before creating any additional retest work."
  : activeRetestChildScheduled
  ? "The linked retest job is scheduled and is now the active work item."
  : "The linked retest job is now the active scheduling item.";
const linkedRetestPassiveMeta = linkedRetestChildClosed
  ? "Linked retest completed"
  : activeRetestChildScheduled
  ? "Retest scheduled"
  : "Linked retest active";
const showConfirmRetestReady =
  isInternalUser &&
  surfaceProfile.surfaces.retest &&
  job.job_type === "ecc" &&
  !hasActiveRetestChild &&
  ["failed", "pending_office_review"].includes(normalizedJobOpsStatus);
const showRetestSection =
  isInternalUser &&
  surfaceProfile.surfaces.retest &&
  job.job_type === "ecc" &&
  !hasActiveRetestChild &&
  normalizedJobOpsStatus === "retest_needed";
const showCorrectionReviewResolution =
  isInternalUser &&
  surfaceProfile.surfaces.retest &&
  job.job_type === "ecc" &&
  !hasActiveRetestChild &&
  ["failed", "retest_needed", "pending_office_review"].includes(normalizedJobOpsStatus);
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

  const mobileLifecycleStatus = String(job.status ?? "").trim().toLowerCase();
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
  const mobileCustomerHref = job.customer_id ? `/customers/${job.customer_id}` : null;
  const showMobileEccTestAction = surfaceProfile.surfaces.eccTests && job.job_type === "ecc";
  const mobileInvoiceActionRelevant =
    job.job_type === "service" &&
    (showInternalInvoicingPlaceholder || Boolean(internalInvoiceTruth) || showExternalDataEntryPrompt || (isCloseoutPending && closeoutNeeds.needsInvoice));
  const showMobileServiceInvoiceFieldAction =
    job.job_type === "service" && showInternalInvoicePanel && mobileInvoiceActionRelevant;
  const showMobileInvoiceOpenAttention =
    job.job_type === "service" && Boolean(internalInvoiceTruth) && !showInternalInvoicingPlaceholder;
  const mobileCurrentStatusLabel = isFieldComplete ? "Field Complete" : mobileLifecycleStatusLabel;
  const showMobileContractorContext =
    surfaceProfile.surfaces.contractorRaterHandoff && job.job_type === "ecc" && Boolean(contractorId);
  const canShowContractorReportPanel =
    isInternalUser && Boolean(contractorId) && ["failed", "pending_info"].includes(String(job.ops_status ?? ""));
  // Slice B: unconditional V2 mobile surface. MobileJobDetailCurrent remains in
  // the tree as dead code (intentionally unreachable) pending later removal.
  const MobileJobDetailMobileComponent = MobileJobDetailV2Preview;
  const desktopV2Params = Promise.resolve({ id: jobId });
  const desktopV2SearchParams = Promise.resolve(sp);

  return (
    <div className={`mx-auto w-full min-w-0 ${OPERATIONAL_WORKSPACE_MAX_WIDTH_CLASS} space-y-5 overflow-x-hidden bg-slate-50/45 p-0 lg:overflow-x-visible lg:p-6`}>
      <div className="block lg:hidden">
        <MobileJobDetailMobileComponent
          activeWaitingState={activeWaitingState}
          addPublicNoteFromForm={addPublicNoteFromForm}
          appointmentDateLabel={appointmentDateLabel}
          assignedTeam={assignedTeam}
          AssignedTeamControls={AssignedTeamControls}
          assignedUserIds={assignedUserIds}
          attemptCount={attemptCount}
          banner={banner}
          billingMode={billingMode}
          billingState={billingState}
          canShowCertsButton={canShowCertsButton}
          canShowEccFailedReasonBanner={canShowEccFailedReasonBanner}
          canShowContractorReportPanel={canShowContractorReportPanel}
          canShowInvoiceButton={canShowInvoiceButton}
          canShowReleaseAndReevaluate={canShowReleaseAndReevaluate}
          ChatIcon={ChatIcon}
          ChevronRightIcon={ChevronRightIcon}
          ClipboardIcon={ClipboardIcon}
          ClockIcon={ClockIcon}
          closeoutNeeds={closeoutNeeds}
          compactWorkspaceActionButtonClass={compactWorkspaceActionButtonClass}
          completeDataEntryFromForm={completeDataEntryFromForm}
          completionActionAttentionBanner={completionActionAttentionBanner}
          confirmEccRetestReadyFromForm={confirmEccRetestReadyFromForm}
          confirmedNextDueContext={confirmedNextDueContext}
          ConfirmNextDueDateActionButton={ConfirmNextDueDateActionButton}
          ContactLoggingQuickActions={ContactLoggingQuickActions}
          contractorName={contractorName}
          createEstimateFromJobHref={createEstimateFromJobHref}
          createInternalInvoiceDraftFromForm={createInternalInvoiceDraftFromForm}
          createNextServiceVisitFromForm={createNextServiceVisitFromForm}
          createRetestJobFromForm={createRetestJobFromForm}
          currentInterruptState={currentInterruptState}
          darkButtonClass={darkButtonClass}
          DeferredInternalNoteMentionComposer={DeferredInternalNoteMentionComposer}
          DeferredInternalNotesBody={DeferredInternalNotesBody}
          DeferredSharedNotesBody={DeferredSharedNotesBody}
          DeferredTimelineBody={DeferredTimelineBody}
          displayDateLA={displayDateLA}
          failedReasonBannerText={failedReasonBannerText}
          fieldHeaderTitle={fieldHeaderTitle}
          FieldOutcomePanel={FieldOutcomePanel}
          FlashBanner={FlashBanner}
          FolderIcon={FolderIcon}
          formatDateOnlyUs={formatDateOnlyUs}
          formatVisitScopeItemKindLabel={formatVisitScopeItemKindLabel}
          hasDirectInvoiceWorkflowAccess={hasDirectInvoiceWorkflowAccess}
          hasDirectNarrativeChain={hasDirectNarrativeChain}
          hasFullSchedule={hasFullSchedule}
          hasVisitScopeDefined={hasVisitScopeDefined}
          headerJobTypeLabel={headerJobTypeLabel}
          ImmediateSubmitButton={ImmediateSubmitButton}
          initialInterruptReason={initialInterruptReason}
          initialWaitingOtherReason={initialWaitingOtherReason}
          initialWaitingReasonType={initialWaitingReasonType}
          internalInvoiceTruth={internalInvoiceTruth}
          internalNoteBannerMessage={internalNoteBannerMessage}
          internalNoteBannerType={internalNoteBannerType}
          internalNotesMeta={internalNotesMeta}
          internalUser={internalUser}
          interruptReleaseActionLabel={interruptReleaseActionLabel}
          InterruptStateFields={InterruptStateFields}
          isCleaningMode={isCleaningMode}
          isEccPermitNeededActive={isEccPermitNeededActive}
          isFieldComplete={isFieldComplete}
          isHistoricalServiceFollowUpContinued={isHistoricalServiceFollowUpContinued}
          isInternalUser={isInternalUser}
          canShowReviewAsk={canShowReviewAsk}
          reviewAskMailtoHref={reviewAskMailtoHref}
          reviewAskSmsHref={reviewAskSmsHref}
          MailIcon={MailIcon}
          isServiceFieldFollowUpPendingInfo={isServiceFieldFollowUpPendingInfo}
          job={job}
          JobFieldActionButton={JobFieldActionButton}
          jobHeaderReference={jobHeaderReference}
          JobLocationPreviewFallback={JobLocationPreviewFallback}
          jobPageInvoiceNextAction={jobPageInvoiceNextAction}
          jobPageInvoiceStateLabel={jobPageInvoiceStateLabel}
          jobPageInvoiceSummaryText={jobPageInvoiceSummaryText}
          jobWorkbenchAccountLabel={jobWorkbenchAccountLabel}
          jobWorkbenchTitle={jobWorkbenchTitle}
          lastAttemptLabel={lastAttemptLabel}
          Link={Link}
          PendingRouteLink={PendingRouteLink}
          linkedRetestPassiveCopy={linkedRetestPassiveCopy}
          linkedRetestPassiveHeading={linkedRetestPassiveHeading}
          LockIcon={LockIcon}
          logCustomerContactAttemptFromForm={logCustomerContactAttemptFromForm}
          MapPinIcon={MapPinIcon}
          markCertsCompleteFromForm={markCertsCompleteFromForm}
          markEccPermitAvailableFromForm={markEccPermitAvailableFromForm}
          markInvoiceCompleteFromForm={markInvoiceCompleteFromForm}
          markJobFieldCompleteFromForm={markJobFieldCompleteFromForm}
          markServiceApprovalReceivedFromForm={markServiceApprovalReceivedFromForm}
          markServicePartArrivedFromForm={markServicePartArrivedFromForm}
          markServicePartOrderedFromForm={markServicePartOrderedFromForm}
          MarkVisitCountedActionButton={MarkVisitCountedActionButton}
          markVisitCountedAgreementName={markVisitCountedAgreementName}
          markVisitCountedLinkId={markVisitCountedLinkId}
          MessageIcon={MessageIcon}
          mobileAppointmentTimeLabel={mobileAppointmentTimeLabel}
          mobileAttentionActionClass={mobileAttentionActionClass}
          mobileAttentionStripClass={mobileAttentionStripClass}
          mobileCallHref={mobileCallHref}
          mobileCurrentStatusLabel={mobileCurrentStatusLabel}
          mobileCustomerHref={mobileCustomerHref}
          mobileDisabledActionClass={mobileDisabledActionClass}
          mobileFieldActionClass={mobileFieldActionClass}
          mobileInvoiceActionRelevant={mobileInvoiceActionRelevant}
          mobileMutedToolLinkClass={mobileMutedToolLinkClass}
          mobileSectionClass={mobileSectionClass}
          mobileTextHref={mobileTextHref}
          mobileToolLinkClass={mobileToolLinkClass}
          NarrativeNotesBodyFallback={NarrativeNotesBodyFallback}
          narrativeScopeJobIds={narrativeScopeJobIds}
          NarrativeTimelineBodyFallback={NarrativeTimelineBodyFallback}
          onTheWayUndoEligibility={onTheWayUndoEligibility}
          permitDateLabel={permitDateLabel}
          permitJurisdiction={permitJurisdiction}
          permitNumber={permitNumber}
          permitSummaryLabel={permitSummaryLabel}
          complianceWorkSummary={complianceWorkSummary}
          PhoneIcon={PhoneIcon}
          primaryButtonClass={primaryButtonClass}
          primaryCloseoutMessage={primaryCloseoutMessage}
          ReceiptIcon={ReceiptIcon}
          recordBlockingPhase={recordBlockingPhase}
          releaseAndReevaluateFromForm={releaseAndReevaluateFromForm}
          resolveFailureByCorrectionReviewFromForm={resolveFailureByCorrectionReviewFromForm}
          revertOnTheWayFromForm={revertOnTheWayFromForm}
          scheduleRetestNowFromForm={scheduleRetestNowFromForm}
          secondaryButtonClass={secondaryButtonClass}
          serviceAddressDisplay={serviceAddressDisplay}
          serviceAddressLine1={serviceAddressLine1}
          serviceAddressLine2={serviceAddressLine2}
          serviceCity={serviceCity}
          serviceFollowUpProgressState={serviceFollowUpProgressState}
          serviceLocationUpdatedBannerMessage="Service location updated for this job."
          serviceLocationEditHref={serviceLocationEditHref}
          serviceState={serviceState}
          serviceZip={serviceZip}
          SettingsIcon={SettingsIcon}
          sharedNoteBannerMessage={sharedNoteBannerMessage}
          sharedNoteBannerType={sharedNoteBannerType}
          sharedNotesMeta={sharedNotesMeta}
          attachmentCount={attachmentCount}
          attachmentCountMeta={attachmentCountMeta}
          shouldShowWorkSummary={shouldShowWorkSummary}
          showCertsPermitRequiredBlocker={showCertsPermitRequiredBlocker}
          showConfirmRetestReady={showConfirmRetestReady}
          showCorrectionReviewResolution={showCorrectionReviewResolution}
          showDifferentIssueFoundOutcome={showDifferentIssueFoundOutcome}
          showExternalDataEntryPrompt={showExternalDataEntryPrompt}
          showFieldOutcomePanel={showFieldOutcomePanel}
          showInternalInvoicePanel={showInternalInvoicePanel}
          showInternalInvoicingPlaceholder={showInternalInvoicingPlaceholder}
          showLinkedRetestCreated={showLinkedRetestCreated}
          showMobileContractorContext={showMobileContractorContext}
          showMobileEccTestAction={showMobileEccTestAction}
          showMobileInvoiceOpenAttention={showMobileInvoiceOpenAttention}
          showMobileServiceInvoiceFieldAction={showMobileServiceInvoiceFieldAction}
          showPrimaryCloseoutBlockers={showPrimaryCloseoutBlockers}
          showRetestSection={showRetestSection}
          showSharedNotesCard={showSharedNotesCard}
          sp={sp}
          SubmitButton={SubmitButton}
          suggestedNextDueProjection={suggestedNextDueProjection}
          surfaceProfile={surfaceProfile}
          Suspense={Suspense}
          tab={tab}
          TimedJobLocationPreview={TimedJobLocationPreview}
          TimedServiceStatusActions={TimedServiceStatusActions}
          timeToTimeInput={timeToTimeInput}
          timingEnabled={timingEnabled}
          ToolIcon={ToolIcon}
          UnscheduleButton={UnscheduleButton}
          updateJobOpsDetailsFromForm={updateJobOpsDetailsFromForm}
          updateJobOpsFromForm={updateJobOpsFromForm}
          updateJobScheduleFromForm={updateJobScheduleFromForm}
          updateJobVisitScopeFromForm={updateJobVisitScopeFromForm}
          updateJobTitleFromForm={updateJobTitleFromForm}
          jobTitleText={jobTitleText}
          visitReasonText={visitReasonText}
          visitScopeCount={visitScopeCount}
          visitScopeBilledLines={visitScopeBilledLines}
          unlinkedInvoiceCharges={unlinkedInvoiceCharges}
          hasUnaddedPricedWorkItemsForIssuedInvoice={hasUnaddedPricedWorkItemsForIssuedInvoice}
          visitScopeItems={visitScopeItems}
          visitScopeItemsJsonForInlineEdit={visitScopeItemsJsonForInlineEdit}
          VisitScopeJobDetailForm={VisitScopeJobDetailForm}
          visitScopePricebookTemplates={visitScopePricebookTemplates}
          visitScopeSummary={visitScopeSummary}
          WarningIcon={WarningIcon}
          workspaceEmptyStateClass={workspaceEmptyStateClass}
          workspaceFieldLabelClass={workspaceFieldLabelClass}
          workspaceInputClass={workspaceInputClass}
          workspaceTextareaClass={workspaceTextareaClass}
        />
        {canShowContractorReportPanel ? (
          <div id="mobile-failed-report" className="mx-auto max-w-lg px-3 pb-4">
            <ContractorReportPanel
              jobId={job.id}
              contractorResponseLabel={contractorResponseLabel}
              contractorResponseSubLabel={contractorResponseSubLabel}
            />
          </div>
        ) : null}
      </div>

      <div className="hidden lg:block">
        <DesktopJobDetailV2Page
          params={desktopV2Params}
          searchParams={desktopV2SearchParams}
        />
      </div>

  </div>
  );

}
