// app/jobs/[id]/_components/MobileJobDetailV2Preview

import MobileJobStatusActionSurface from "./MobileJobStatusActionSurface";
import MobileJobSchedulePanel from "./MobileJobSchedulePanel";
import MobileJobTeamNotesPanel from "./MobileJobTeamNotesPanel";
import MobileJobSharedNotesPanel from "./MobileJobSharedNotesPanel";
import MobileJobWorkScopePanel from "./MobileJobWorkScopePanel";
import MobileJobServiceFollowUpTool from "./MobileJobServiceFollowUpTool";

function buildLifecyclePreview(props: {
  job: any;
  isFieldComplete: boolean;
  billingState: any;
  closeoutNeeds: any;
  hasScheduleInformation: boolean;
  activeWaitingState: any;
  isHistoricalServiceFollowUpContinued: boolean;
  showLinkedRetestCreated: boolean;
}) {
  const status = String(props.job?.status ?? "").trim().toLowerCase();
  const opsStatus = String(props.job?.ops_status ?? "").trim().toLowerCase();
  const isEcc = String(props.job?.job_type ?? "").trim().toLowerCase() === "ecc";
  const exceptionLabel = getLifecycleExceptionLabel({
    job: props.job,
    activeWaitingState: props.activeWaitingState,
    isHistoricalServiceFollowUpContinued: props.isHistoricalServiceFollowUpContinued,
    showLinkedRetestCreated: props.showLinkedRetestCreated,
  });
  const isClosed =
    opsStatus === "closed" ||
    status === "cancelled" ||
    opsStatus === "archived" ||
    Boolean(props.billingState?.billedTruthSatisfied && (!isEcc || props.job?.certs_complete));
  const attentionStatuses = new Set([
    "pending_info",
    "waiting",
    "on_hold",
    "failed",
    "pending_office_review",
    "retest_needed",
    "need_to_schedule",
    "cancelled",
    "archived",
  ]);
  const activeKey = isClosed
    ? "closeout"
    : props.isFieldComplete || status === "completed"
    ? "field_done"
    : status === "in_process" || opsStatus === "in_process"
    ? "in_progress"
    : status === "on_the_way" || opsStatus === "on_the_way"
    ? "on_the_way"
    : "scheduled";
  const isActiveFieldState = ["on_the_way", "in_progress", "field_done", "closeout"].includes(activeKey);
  const hasSchedulingAttention =
    (opsStatus === "need_to_schedule" || status === "need_to_schedule") &&
    !props.hasScheduleInformation &&
    !isActiveFieldState;
  const hasAttentionState = Boolean(exceptionLabel) || attentionStatuses.has(opsStatus) || attentionStatuses.has(status);

  const stages = [
    { key: "scheduled", label: "Scheduled" },
    { key: "on_the_way", label: "On the way" },
    { key: "in_progress", label: "In progress" },
    { key: "field_done", label: "Field done" },
    { key: "closeout", label: "Closeout" },
  ];
  const activeIndex = stages.findIndex((stage) => stage.key === activeKey);

  const attentionLabel = exceptionLabel
    ? exceptionLabel
    : hasAttentionState
    ? opsStatus === "pending_info" || opsStatus === "waiting"
      ? "Paused for information"
      : opsStatus === "on_hold"
      ? "On hold"
      : opsStatus === "need_to_schedule" && hasSchedulingAttention
      ? "Needs scheduling"
      : status === "cancelled"
      ? "Cancelled"
      : opsStatus === "archived"
      ? "Archived"
      : "Needs attention"
    : "";

  return {
    stages,
    activeIndex,
    attentionLabel,
  };
}

function getLifecycleExceptionLabel(props: {
  job: any;
  activeWaitingState: any;
  isHistoricalServiceFollowUpContinued: boolean;
  showLinkedRetestCreated: boolean;
}) {
  const status = String(props.job?.status ?? "").trim().toLowerCase();
  const opsStatus = String(props.job?.ops_status ?? "").trim().toLowerCase();
  const waitingLabel = getWaitingStateLabel(props.activeWaitingState, props.job);

  if (props.isHistoricalServiceFollowUpContinued || props.showLinkedRetestCreated) return "Linked active job";
  if (opsStatus === "archived" || props.job?.deleted_at) return "Archived";
  if (status === "cancelled") return "Job cancelled";
  if (opsStatus === "closed") return "Job closed";
  if (waitingLabel) return waitingLabel;
  if (opsStatus === "failed") return "Correction needed";
  if (opsStatus === "pending_office_review") return "Review needed";
  if (opsStatus === "retest_needed") return "Retest needed";

  return "";
}

function getWaitingStateLabel(activeWaitingState: any, job: any) {
  const opsStatus = String(job?.ops_status ?? "").trim().toLowerCase();
  const blockerType = String(activeWaitingState?.blockerType ?? "").trim().toLowerCase();
  const reason = String(
    activeWaitingState?.blockerReason ?? job?.pending_info_reason ?? job?.on_hold_reason ?? "",
  )
    .trim()
    .toLowerCase();

  if (blockerType.includes("approval") || reason.includes("approval")) return "Approval needed";
  if (blockerType.includes("part") || blockerType.includes("material") || reason.includes("part") || reason.includes("material")) {
    return "Waiting on part";
  }
  if (opsStatus === "pending_info" || opsStatus === "waiting" || blockerType.includes("information")) return "Waiting on info";
  if (opsStatus === "on_hold") return "Paused";

  return activeWaitingState ? "Waiting" : "";
}

function getCountBadgeFromMeta(meta: string | undefined) {
  const trimmed = String(meta ?? "").trim();
  if (!trimmed) return "";

  const match = trimmed.match(/^(\d+)\s+/);
  const count = match ? Number.parseInt(match[1] ?? "", 10) : Number.NaN;

  if (!Number.isFinite(count) || count <= 0) return "";

  return trimmed;
}

function getNoteSignalLabel(message: string | undefined) {
  return String(message ?? "").trim() ? "New" : "";
}

function hasCompletedEccTestRun(job: any) {
  const runs = Array.isArray(job?.ecc_test_runs) ? job.ecc_test_runs : [];
  return runs.some((run: any) => run?.is_completed === true);
}

function getVisitScopeItemTitle(item: any) {
  return String(item?.title ?? "").trim();
}

function getVisitScopeItemDetails(item: any) {
  return String(item?.details ?? "").trim();
}

function getVisitScopeCountLabel(count: number) {
  return `${count} item${count === 1 ? "" : "s"}`;
}

function buildBillingPreview(props: {
  billingState: any;
  closeoutNeeds: any;
  internalInvoiceTruth: any;
  jobPageInvoiceNextAction: string;
  jobPageInvoiceStateLabel: string;
  jobPageInvoiceSummaryText: string;
  showExternalDataEntryPrompt: boolean;
  showInternalInvoicePanel: boolean;
  showInternalInvoicingPlaceholder: boolean;
  showMobileInvoiceOpenAttention: boolean;
  showMobileServiceInvoiceFieldAction: boolean;
  showPrimaryCloseoutBlockers: boolean;
  isEcc: boolean;
  isEccComplianceActive: boolean;
  isFieldComplete: boolean;
  isReadOnlyState: boolean;
}) {
  const hasInvoiceAttention =
    props.showMobileServiceInvoiceFieldAction ||
    props.showInternalInvoicingPlaceholder ||
    props.showMobileInvoiceOpenAttention ||
    Boolean(props.internalInvoiceTruth) ||
    Boolean(props.showInternalInvoicePanel && props.closeoutNeeds?.needsInvoice);
  const hasExternalBillingAttention =
    props.showExternalDataEntryPrompt ||
    Boolean(props.closeoutNeeds?.needsInvoice && props.billingState?.lightweightBillingAllowed);
  const hasCloseoutAttention =
    props.showPrimaryCloseoutBlockers ||
    Boolean(props.closeoutNeeds?.needsInvoice || props.closeoutNeeds?.needsCerts);

  if (props.isReadOnlyState) {
    return {
      title: "Billing / Closeout",
      summary: "Review billing, closeout, and history from job records.",
      actionLabel: "",
      hrefAnchor: "",
      statusLabel: "Read-only",
    };
  }

  if (props.isEccComplianceActive) {
    return {
      title: "Billing / Closeout",
      summary: "No billing action needed yet.",
      actionLabel: "",
      hrefAnchor: "",
      statusLabel: "No action",
    };
  }

  if (hasExternalBillingAttention) {
    return {
      title: "External billing review",
      summary: "Confirm external billing before closeout.",
      actionLabel: "Review external billing",
      hrefAnchor: "mobile-next-service-action",
      statusLabel: "Action needed",
    };
  }

  if (hasInvoiceAttention) {
    return {
      title: props.internalInvoiceTruth ? "Review invoice" : props.jobPageInvoiceStateLabel || "Billing review",
      summary:
        props.jobPageInvoiceSummaryText ||
        "Review the invoice or billing requirements for this job.",
      actionLabel: props.jobPageInvoiceNextAction || "Review invoice",
      hrefAnchor: "mobile-invoice-summary-card",
      statusLabel: props.internalInvoiceTruth ? "Invoice active" : "Invoice needed",
    };
  }

  if (hasCloseoutAttention) {
    return {
      title: "Closeout review",
      summary: "Review the remaining closeout items for this job.",
      actionLabel: "Review closeout",
      hrefAnchor: "mobile-next-service-action",
      statusLabel: "Review",
    };
  }

  return {
    title: "Billing / Closeout",
    summary: "No billing action needed yet.",
    actionLabel: "",
    hrefAnchor: "",
    statusLabel: "No action",
  };
}

function getHeroDisplayTitle(title: unknown, city: unknown) {
  const titleText = String(title ?? "").trim();
  const cityText = String(city ?? "").trim();
  if (!titleText || !cityText) return titleText;

  for (const suffix of [` — ${cityText}`, ` - ${cityText}`, `, ${cityText}`]) {
    if (titleText.toLowerCase().endsWith(suffix.toLowerCase())) {
      return titleText.slice(0, -suffix.length).trim();
    }
  }

  return titleText;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getHeroAddressDisplay(address: unknown, state: unknown) {
  const addressText = String(address ?? "").trim();
  const stateText = String(state ?? "").trim();
  if (!addressText || !stateText) return addressText;

  return addressText
    .replace(new RegExp(`\\b${escapeRegExp(stateText)}\\s+${escapeRegExp(stateText)}\\b`, "gi"), stateText)
    .replace(/\s{2,}/g, " ")
    .trim();
}

function getHeroScheduleDateDisplay(scheduledDate: unknown, fallbackLabel: unknown) {
  const rawDate = String(scheduledDate ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    const [year, month, day] = rawDate.split("-");
    return `${month}/${day}/${year}`;
  }

  return String(fallbackLabel ?? "").trim() || "No appointment scheduled";
}

export default function MobileJobDetailV2Preview(props: any) {
  const {
    activeWaitingState,
    appointmentDateLabel,
    assignedTeam,
    AssignedTeamControls,
    assignedUserIds,
    attemptCount,
    billingState,
    canShowReleaseAndReevaluate,
    ChatIcon,
    ChevronRightIcon,
    ClipboardIcon,
    ClockIcon,
    closeoutNeeds,
    completeDataEntryFromForm,
    ConfirmNextDueDateActionButton,
    ContactLoggingQuickActions,
    contractorName,
    createEstimateFromJobHref,
    createInternalInvoiceDraftFromForm,
    darkButtonClass,
    DeferredTimelineBody,
    displayDateLA,
    FolderIcon,
    formatDateOnlyUs,
    currentInterruptState,
    hasFullSchedule,
    hasDirectNarrativeChain,
    hasDirectInvoiceWorkflowAccess,
    headerJobTypeLabel,
    internalInvoiceTruth,
    internalNoteBannerMessage,
    internalNotesMeta,
    initialInterruptReason,
    initialWaitingOtherReason,
    initialWaitingReasonType,
    interruptReleaseActionLabel,
    InterruptStateFields,
    isEccPermitNeededActive,
    isFieldComplete,
    isHistoricalServiceFollowUpContinued,
    isInternalUser,
    isServiceFieldFollowUpPendingInfo,
    job,
    jobHeaderReference,
    jobPageInvoiceNextAction,
    jobPageInvoiceStateLabel,
    jobPageInvoiceSummaryText,
    jobWorkbenchAccountLabel,
    jobWorkbenchTitle,
    lastAttemptLabel,
    Link,
    linkedRetestPassiveCopy,
    linkedRetestPassiveHeading,
    LockIcon,
    logCustomerContactAttemptFromForm,
    MapPinIcon,
    MailIcon,
    MarkVisitCountedActionButton,
    markVisitCountedAgreementName,
    markVisitCountedLinkId,
    MessageIcon,
    canShowReviewAsk,
    reviewAskMailtoHref,
    reviewAskSmsHref,
    mobileAppointmentTimeLabel,
    mobileCallHref,
    mobileCustomerHref,
    mobileTextHref,
    mobileToolLinkClass,
    narrativeScopeJobIds,
    NarrativeTimelineBodyFallback,
    permitDateLabel,
    permitJurisdiction,
    permitNumber,
    permitSummaryLabel,
    PhoneIcon,
    primaryButtonClass,
    primaryCloseoutMessage,
    recordBlockingPhase,
    releaseAndReevaluateFromForm,
    resolveFailureByCorrectionReviewFromForm,
    secondaryButtonClass,
    serviceAddressDisplay,
    serviceAddressLine1,
    serviceAddressLine2,
    serviceCity,
    serviceFollowUpProgressState,
    serviceLocationEditHref,
    serviceState,
    serviceZip,
    showConfirmRetestReady,
    showCorrectionReviewResolution,
    showExternalDataEntryPrompt,
    showInternalInvoicePanel,
    showInternalInvoicingPlaceholder,
    showLinkedRetestCreated,
    showMobileEccTestAction,
    showMobileInvoiceOpenAttention,
    showMobileServiceInvoiceFieldAction,
    showPrimaryCloseoutBlockers,
    showRetestSection,
    showSharedNotesCard,
    sp,
    suggestedNextDueProjection,
    surfaceProfile,
    Suspense,
    tab,
    SubmitButton,
    TimedJobLocationPreview,
    timeToTimeInput,
    timingEnabled,
    ToolIcon,
    hasVisitScopeDefined,
    visitReasonText,
    visitScopeCount,
    visitScopeItems,
    visitScopeSummary,
    WarningIcon,
    workspaceEmptyStateClass,
    workspaceFieldLabelClass,
    workspaceInputClass,
    workspaceTextareaClass,
    updateJobOpsFromForm,
    updateJobScheduleFromForm,
    JobLocationPreviewFallback,
    sharedNoteBannerMessage,
    sharedNotesMeta,
    attachmentCountMeta,
    confirmedNextDueContext,
  } = props;

  const normalizedStatus = String(job?.status ?? "").trim().toLowerCase();
  const normalizedOpsStatus = String(job?.ops_status ?? "").trim().toLowerCase();
  const isReadOnlyState =
    normalizedOpsStatus === "archived" ||
    normalizedOpsStatus === "closed" ||
    normalizedStatus === "cancelled" ||
    Boolean(job?.deleted_at);
  const isLifecycleClosedOut = Boolean(
    billingState?.billedTruthSatisfied &&
      (String(job?.job_type ?? "").trim().toLowerCase() !== "ecc" || job?.certs_complete),
  );
  const shouldPulseLifecycleActiveStage =
    !isReadOnlyState &&
    normalizedStatus !== "completed" &&
    !isLifecycleClosedOut &&
    !isHistoricalServiceFollowUpContinued &&
    !showLinkedRetestCreated;
  const hasRequiredEccTestAttention =
    String(sp?.notice ?? "").trim() === "ecc_test_required" && !hasCompletedEccTestRun(job);
  const hasScheduleInformation = Boolean(
    hasFullSchedule || job?.scheduled_date || job?.window_start || job?.window_end || mobileAppointmentTimeLabel,
  );

  const lifecycle = buildLifecyclePreview({
    job,
    isFieldComplete,
    billingState,
    closeoutNeeds,
    hasScheduleInformation,
    activeWaitingState,
    isHistoricalServiceFollowUpContinued,
    showLinkedRetestCreated,
  });
  const standardJobHref = `/jobs/${job.id}?tab=${tab}&mobileLayout=current`;
  const standardJobAnchorHref = (anchor: string) => `${standardJobHref}#${anchor}`;
  const v2AssignmentReturnTo = `/jobs/${job.id}?tab=${tab}&mobileLayout=v2#mobile-assigned-team`;
  const v2BillingReturnTo = `/jobs/${job.id}?tab=${tab}&mobileLayout=v2#mobile-invoice-summary-card`;
  const v2CorrectionReviewReturnTo = `/jobs/${job.id}?tab=${tab}&mobileLayout=v2#mobile-correction-review`;
  const v2PermitReturnTo = `/jobs/${job.id}?tab=${tab}&mobileLayout=v2#mobile-permit-info`;
  const v2ServicePlanReturnTo = `/jobs/${job.id}?tab=${tab}&mobileLayout=v2#mobile-service-plan-actions`;
  const v2StatusToolsReturnTo = `/jobs/${job.id}?tab=${tab}&mobileLayout=v2#mobile-tools`;
  const hasServicePlanToolContext = Boolean(
    markVisitCountedLinkId ||
      String(markVisitCountedAgreementName ?? "").trim() ||
      suggestedNextDueProjection ||
      confirmedNextDueContext,
  );
  const servicePlanFocusId = String(suggestedNextDueProjection?.agreementId ?? "").trim();
  const servicePlanToolHref = mobileCustomerHref
    ? `${mobileCustomerHref}?tab=service-plans${servicePlanFocusId ? `&maFocus=${encodeURIComponent(servicePlanFocusId)}` : ""}`
    : standardJobHref;
  const servicePlanToolHelper = hasServicePlanToolContext
    ? "View agreement, visits, and next due details"
    : "Sign customer up for a service plan";
  const canConfirmServicePlanNextDue = Boolean(
    suggestedNextDueProjection &&
      !confirmedNextDueContext &&
      !suggestedNextDueProjection.manualSchedulingRequired &&
      suggestedNextDueProjection.suggestedNextDueDate,
  );
  const isEcc = String(job?.job_type ?? "").trim().toLowerCase() === "ecc";
  const eccCompletionReportHref = `/jobs/${job.id}/tests?t=completion_report`;
  const isEccComplianceActive =
    isEcc &&
    !isReadOnlyState &&
    (!isFieldComplete || hasRequiredEccTestAttention || isEccPermitNeededActive || Boolean(closeoutNeeds?.needsCerts));
  const isEccFailedReviewState =
    isEcc && (normalizedOpsStatus === "failed" || normalizedOpsStatus === "pending_office_review");
  const isEccRetestNeededState = isEcc && normalizedOpsStatus === "retest_needed";
  const billingPreview = buildBillingPreview({
    billingState,
    closeoutNeeds,
    internalInvoiceTruth,
    jobPageInvoiceNextAction,
    jobPageInvoiceStateLabel,
    jobPageInvoiceSummaryText,
    showExternalDataEntryPrompt,
    showInternalInvoicePanel,
    showInternalInvoicingPlaceholder,
    showMobileInvoiceOpenAttention,
    showMobileServiceInvoiceFieldAction,
    showPrimaryCloseoutBlockers,
    isEcc,
    isEccComplianceActive,
    isFieldComplete,
    isReadOnlyState,
  });
  const canShowNativeInvoiceSummaryAction =
    billingPreview.hrefAnchor === "mobile-invoice-summary-card" && !isReadOnlyState && !isEccComplianceActive;
  const canShowNativeExternalBillingAction =
    Boolean(showExternalDataEntryPrompt) && !showPrimaryCloseoutBlockers && !isReadOnlyState && !isEccComplianceActive;
  const canShowNativeInvoiceWorkspaceLink =
    canShowNativeInvoiceSummaryAction && Boolean(internalInvoiceTruth);
  const canShowNativeInvoiceDraftAction =
    canShowNativeInvoiceSummaryAction &&
    !internalInvoiceTruth &&
    Boolean(hasDirectInvoiceWorkflowAccess) &&
    Boolean(showInternalInvoicePanel) &&
    !showPrimaryCloseoutBlockers;
  const canShowNativeStatusActionLink =
    billingPreview.hrefAnchor === "mobile-next-service-action" && showPrimaryCloseoutBlockers;
  const heroDisplayTitle = getHeroDisplayTitle(jobWorkbenchTitle, serviceCity);
  const heroAddressDisplay = getHeroAddressDisplay(serviceAddressDisplay, serviceState);
  const heroScheduleDateLabel = getHeroScheduleDateDisplay(job?.scheduled_date, appointmentDateLabel);
  const heroPreviewClassName =
    "px-0 pb-0 [&_a:first-child]:rounded-none [&_a:first-child]:border-0 [&_a:first-child]:shadow-none [&_img]:h-52 [&_img]:rounded-none [&_img]:object-cover min-[390px]:[&_img]:h-56";
  const heroContactActionClass =
    "inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 shadow-[0_12px_24px_-22px_rgba(15,23,42,0.45)] transition-colors hover:bg-slate-50 min-[390px]:gap-2 min-[390px]:px-3";
  const heroContactDisabledClass =
    "inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2 text-sm font-semibold text-slate-400 min-[390px]:gap-2 min-[390px]:px-3";
  const internalNotesBadge = getCountBadgeFromMeta(internalNotesMeta);
  const sharedNotesBadge = getCountBadgeFromMeta(sharedNotesMeta);
  const internalNotesSignal = getNoteSignalLabel(internalNoteBannerMessage);
  const sharedNotesSignal = getNoteSignalLabel(sharedNoteBannerMessage);
  const allVisitScopeItems = Array.isArray(visitScopeItems) ? visitScopeItems : [];
  const companionServiceItems = allVisitScopeItems.filter((item: any) => item?.kind === "companion_service");
  const serviceWorkItems = isEcc ? companionServiceItems : allVisitScopeItems;
  const serviceWorkCount = serviceWorkItems.length;
  const serviceWorkPreviewItems = serviceWorkItems
    .map((item: any) => ({
      title: getVisitScopeItemTitle(item),
      details: getVisitScopeItemDetails(item),
    }))
    .filter((item: any) => item.title)
    .slice(0, 3);
  const serviceWorkSummary = String(visitScopeSummary || "").trim();
  const showServiceWorkLane = isEcc ? companionServiceItems.length > 0 : Boolean(hasVisitScopeDefined || serviceWorkSummary);
  const showEccWorkScopeLane = isEcc && !showServiceWorkLane && Boolean(hasVisitScopeDefined || serviceWorkSummary);
  const showEccReviewSummary = isEcc && showLinkedRetestCreated;
  const eccReviewSummaryTitle = linkedRetestPassiveHeading || "Linked retest job exists";
  const eccReviewSummaryBody = showLinkedRetestCreated
    ? linkedRetestPassiveCopy ||
      "This original ECC job is historical while the linked retest job carries the active work."
    : "";
  const serviceWorkLaneTitle = isEcc
    ? "Companion Service Work"
    : isFieldComplete
    ? "Work Performed"
    : "Work to Do";
  const serviceWorkLaneHelper = isEcc
    ? "Service scope connected to this compliance visit."
    : "Visit scope and Work Items for this trip.";
  const previewSectionClass =
    "rounded-2xl border border-slate-200/90 bg-white px-3.5 py-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.3)] min-[390px]:px-4";
  const previewHeaderActionClass =
    "inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-semibold leading-tight text-blue-700";
  const previewRowClass =
    "flex min-h-16 min-w-0 items-center justify-between gap-3 px-3 py-3 text-left";
  const previewRowTextClass = "min-w-0 flex-1";
  const previewPillClass =
    "shrink-0 rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold leading-tight text-slate-600";
  const toolsGroupHeadingClass =
    "px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500";
  const toolsRowClass =
    "flex min-h-16 min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-sm font-semibold text-slate-700";
  const toolsRowIconClass =
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600 ring-1 ring-slate-200";
  const toolsRowTextClass = "min-w-0 flex-1";
  const contactLoggingButtonClass =
    "inline-flex w-full items-center justify-center rounded-xl border border-blue-100 bg-white px-3 py-3 text-sm font-semibold text-blue-800 shadow-[0_12px_24px_-22px_rgba(37,99,235,0.45)] transition-colors hover:bg-blue-50";
  const evidenceActionClass =
    "flex min-h-16 min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-base font-semibold text-slate-700";
  const evidenceActionTopClass = "flex min-w-0 flex-1 items-center gap-2";
  const evidenceIconClass = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600 ring-1 ring-slate-200";
  const evidenceLabelClass = "min-w-0 break-words leading-tight";
  const evidenceBadgeClass = "inline-flex max-w-full rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold leading-tight text-slate-600";
  const evidenceSignalClass = "inline-flex max-w-full rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-semibold leading-tight text-blue-700";

  return (
    <div className="block min-h-screen overflow-x-hidden bg-slate-100 px-2.5 py-3 text-slate-950 min-[390px]:px-3 min-[390px]:py-3.5 lg:hidden">
      <div className="mx-auto max-w-lg space-y-3.5">
        <section className="overflow-hidden rounded-[1.35rem] border border-slate-200/90 bg-white shadow-[0_24px_52px_-34px_rgba(15,23,42,0.38)]">
          <div className="px-3.5 pb-3.5 pt-4 min-[390px]:px-4">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="inline-flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-blue-700">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#0f1f35] text-blue-100">
                  <ToolIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0 break-words">Job Workbench</span>
              </div>
            </div>

            <h1 className="mt-4 break-words text-[1.8rem] font-semibold leading-[1.08] tracking-normal text-[#071225] min-[390px]:text-[2rem]">
              {heroDisplayTitle || jobWorkbenchTitle}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700">
                {jobHeaderReference}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700">
                {headerJobTypeLabel}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 min-[420px]:grid-cols-[minmax(0,1fr)_minmax(8rem,0.72fr)]">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-500">Customer</div>
                <div className="mt-1 break-words text-lg font-semibold leading-tight text-slate-950 min-[390px]:text-xl">
                  {mobileCustomerHref ? (
                    <Link href={mobileCustomerHref} className="underline decoration-slate-300 underline-offset-4">
                      {jobWorkbenchAccountLabel || "Customer"}
                    </Link>
                  ) : (
                    jobWorkbenchAccountLabel || "Customer"
                  )}
                </div>
                {contractorName ? (
                  <>
                    <div className="mt-3 text-sm font-semibold text-slate-500">Contractor</div>
                    <div className="mt-1 break-words text-base font-semibold text-slate-700">{contractorName}</div>
                  </>
                ) : null}
              </div>

              <div className="min-w-0 border-slate-200 min-[420px]:border-l min-[420px]:pl-4">
                <a
                  id="mobile-v2-schedule-summary"
                  href="#mobile-when-panel"
                  className="group block min-h-full rounded-lg py-0.5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <div className="inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-blue-900/70">
                        <ClockIcon className="h-4 w-4" />
                        <span>Schedule</span>
                      </div>
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100 transition-colors group-hover:bg-blue-100">
                        <ChevronRightIcon className="h-4 w-4" />
                      </span>
                    </div>
                    <div className="mt-1 break-words text-base font-semibold leading-tight text-[#0f1f35] min-[390px]:text-lg">
                      {heroScheduleDateLabel}
                    </div>
                    {mobileAppointmentTimeLabel ? (
                      <div className="mt-1 inline-flex max-w-full break-words rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold leading-tight text-blue-900 ring-1 ring-blue-100 min-[390px]:text-sm">
                        {mobileAppointmentTimeLabel}
                      </div>
                    ) : null}
                  </div>
                </a>
              </div>
            </div>

            <MobileJobSchedulePanel {...props} presentation="v2TargetPanel" />
          </div>

          <div className="relative overflow-hidden border-t border-slate-200 bg-slate-200">
            <Suspense
              fallback={
                <JobLocationPreviewFallback
                  addressLine1={serviceAddressLine1}
                  addressLine2={serviceAddressLine2}
                  city={serviceCity}
                  state={serviceState}
                  zip={serviceZip}
                  className="px-0 pb-0"
                />
              }
            >
              <TimedJobLocationPreview
                addressLine1={serviceAddressLine1}
                addressLine2={serviceAddressLine2}
                city={serviceCity}
                state={serviceState}
                zip={serviceZip}
                className={heroPreviewClassName}
                timingEnabled={timingEnabled}
                onPhaseTiming={recordBlockingPhase}
              />
            </Suspense>
            <div className="pointer-events-none absolute inset-x-2 bottom-2 flex justify-start min-[390px]:inset-x-3 min-[390px]:bottom-3">
              <div className="max-w-[92%] rounded-2xl border border-white/35 bg-slate-950/70 px-3 py-2 text-white shadow-[0_14px_28px_-16px_rgba(15,23,42,0.75)] backdrop-blur-sm">
                <div className="flex items-start gap-2">
                  <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0 break-words text-sm font-semibold leading-tight min-[390px]:text-base">
                    {heroAddressDisplay}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 border-t border-slate-200 bg-white px-3.5 py-3 min-[390px]:gap-2.5 min-[390px]:px-4">
            {mobileCallHref ? (
              <a href={mobileCallHref} className={heroContactActionClass}>
                <PhoneIcon className="h-4 w-4 shrink-0" />
                <span>Call</span>
              </a>
            ) : (
              <span className={heroContactDisabledClass}>
                <PhoneIcon className="h-4 w-4 shrink-0" />
                <span>Call</span>
              </span>
            )}
            {mobileTextHref ? (
              <a href={mobileTextHref} className={heroContactActionClass}>
                <ChatIcon className="h-4 w-4 shrink-0" />
                <span>Text</span>
              </a>
            ) : (
              <span className={heroContactDisabledClass}>
                <ChatIcon className="h-4 w-4 shrink-0" />
                <span>Text</span>
              </span>
            )}
            {heroAddressDisplay !== "No address set" ? (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(heroAddressDisplay)}`}
                target="_blank"
                rel="noreferrer"
                className={heroContactActionClass}
              >
                <MapPinIcon className="h-4 w-4 shrink-0" />
                <span>Navigate</span>
              </a>
            ) : (
              <span className={heroContactDisabledClass}>
                <MapPinIcon className="h-4 w-4 shrink-0" />
                <span>Navigate</span>
              </span>
            )}
          </div>
        </section>

        <section className={previewSectionClass}>
          <div className="relative grid grid-cols-5 gap-1">
            <div className="absolute left-[10%] right-[10%] top-3.5 h-px bg-slate-200 min-[390px]:top-4" />
            {lifecycle.stages.map((stage, index) => {
              const isPast = index < lifecycle.activeIndex;
              const isActive = index === lifecycle.activeIndex;
              return (
                <div key={stage.key} className="relative z-10 min-w-0 text-center">
                  <div
                    className={[
                      "relative mx-auto flex h-7 w-7 items-center justify-center rounded-full border min-[390px]:h-8 min-[390px]:w-8",
                      isActive
                        ? "border-blue-600 bg-white text-blue-600 shadow-[0_0_0_4px_rgba(37,99,235,0.14)]"
                        : isPast
                        ? "border-blue-500 bg-blue-500 text-white"
                        : "border-slate-300 bg-white text-slate-300",
                    ].join(" ")}
                  >
                    {isPast ? (
                      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                        <path
                          d="M5 10.5 8.2 13.7 15 6.5"
                          stroke="currentColor"
                          strokeWidth="2.25"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : isActive ? (
                      <>
                        {shouldPulseLifecycleActiveStage ? (
                          <span className="absolute inset-0 rounded-full bg-blue-500/15 motion-safe:animate-ping motion-reduce:animate-none" />
                        ) : null}
                        <span className="relative h-2.5 w-2.5 rounded-full bg-blue-600" />
                      </>
                    ) : null}
                  </div>
                  <div className={isActive ? "mt-2 text-[11px] font-semibold leading-tight text-slate-950 min-[390px]:text-xs" : "mt-2 text-[11px] font-medium leading-tight text-slate-500 min-[390px]:text-xs"}>
                    {stage.label}
                  </div>
                </div>
              );
            })}
          </div>
          {lifecycle.attentionLabel ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
              {lifecycle.attentionLabel}
            </div>
          ) : null}
        </section>

        <MobileJobStatusActionSurface {...props} />

        {showCorrectionReviewResolution ? (
          <section id="mobile-correction-review" className={previewSectionClass}>
            <div className="flex items-start gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
                <WarningIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold leading-tight text-[#071225]">Correction Review</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Use this only when submitted correction notes/photos are sufficient to resolve the failure without sending a {surfaceProfile.labels.fieldUser.toLowerCase()} back out for a physical retest.
                </p>
              </div>
            </div>

            <form action={resolveFailureByCorrectionReviewFromForm} className="mt-4 space-y-3">
              <input type="hidden" name="job_id" value={job.id} />
              <input type="hidden" name="return_to" value={v2CorrectionReviewReturnTo} />
              <div>
                <label className={workspaceFieldLabelClass}>Review Note (optional)</label>
                <textarea
                  name="review_note"
                  rows={3}
                  placeholder="Explain why the failure was resolved by correction review..."
                  className={workspaceTextareaClass}
                />
              </div>
              <SubmitButton loadingText="Submitting..." className={darkButtonClass}>
                Resolve Failure by Correction Review
              </SubmitButton>
            </form>
          </section>
        ) : null}

        <section id="mobile-work-scope-card" className={previewSectionClass}>
          <div
            className="flex flex-col gap-3 min-[390px]:flex-row min-[390px]:items-start min-[390px]:justify-between"
          >
            <div className="min-w-0">
              <div className="inline-flex min-w-0 items-start gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  {isEcc ? <ClipboardIcon className="h-5 w-5" /> : <ToolIcon className="h-5 w-5" />}
                </span>
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold leading-tight text-navy">
                    {isEcc ? "Compliance Work" : serviceWorkLaneTitle}
                  </h2>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {isEcc ? "Equipment, tests, permits, and closeout readiness." : serviceWorkLaneHelper}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {showEccReviewSummary ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-amber-950">
              <div className="text-sm font-semibold uppercase tracking-[0.1em] text-amber-700">ECC attention</div>
              <div className="mt-1 text-base font-semibold leading-tight">{eccReviewSummaryTitle}</div>
              {eccReviewSummaryBody ? <p className="mt-1 text-sm leading-5">{eccReviewSummaryBody}</p> : null}
            </div>
          ) : null}

          <div className="v2-work-scope-summary mt-4 divide-y divide-slate-200 rounded-2xl border border-slate-200">
            {isEcc ? (
              <>
                <Link href={`/jobs/${job.id}/info?f=equipment`} className={previewRowClass}>
                  <span className={previewRowTextClass}>
                    <span className="block font-semibold text-navy">Equipment</span>
                    <span className="block text-sm text-slate-600">Manage equipment and furnace details</span>
                  </span>
                  <span className={previewPillClass}>Open</span>
                </Link>
                <Link href={`/jobs/${job.id}/tests`} className={previewRowClass}>
                  <span className={previewRowTextClass}>
                    <span className="block font-semibold text-navy">ECC Tests</span>
                    <span className="block text-sm text-slate-600">Open test workflow</span>
                  </span>
                  <span className={previewPillClass}>Open</span>
                </Link>
                <details id="mobile-permit-info" className="group/permit">
                  <summary className="cursor-pointer list-none">
                    <div className={previewRowClass}>
                      <span className={previewRowTextClass}>
                        <span className="block font-semibold text-navy">Permit Information</span>
                        <span className="block text-sm text-slate-600">
                          {isEccPermitNeededActive ? "Permit needed before closeout" : "Review permit details and actions"}
                        </span>
                      </span>
                      <span className={previewPillClass}>Open</span>
                    </div>
                  </summary>
                  <div className="px-3 pb-3">
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

                      <details id="mobile-permit-edit" className="group/permit-edit mt-3">
                        <summary className="cursor-pointer list-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
                          Edit Permit Info
                        </summary>
                        <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
                          <form action={updateJobScheduleFromForm} className="space-y-3">
                            <input type="hidden" name="job_id" value={job.id} />
                            <input type="hidden" name="return_to" value={v2PermitReturnTo} />
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
                                href={v2PermitReturnTo}
                                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-base font-semibold text-slate-800"
                              >
                                Cancel
                              </Link>
                            </div>
                          </form>
                        </div>
                      </details>
                    </div>
                  </div>
                </details>
                <Link href={eccCompletionReportHref} className={previewRowClass}>
                  <span className={previewRowTextClass}>
                    <span className="block font-semibold text-slate-950">Completion Report</span>
                    <span className="block text-sm text-slate-600">Review test results and photo evidence</span>
                  </span>
                  <span className={previewPillClass}>Open</span>
                </Link>
              </>
            ) : (
              <>
                {serviceWorkSummary ? (
                  <div className="px-3 py-3">
                    <div className="text-sm font-semibold text-slate-500">Work Summary</div>
                    <p className="mt-1 text-base leading-6 text-slate-800">{serviceWorkSummary}</p>
                  </div>
                ) : null}
                {serviceWorkPreviewItems.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {serviceWorkPreviewItems.map((item: any, index: number) => (
                      <div key={`${item.title}-${index}`} className="px-3 py-3">
                        <div className="font-semibold text-slate-950">{item.title}</div>
                        {item.details ? <div className="mt-1 text-sm leading-5 text-slate-600">{item.details}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-3 text-sm leading-6 text-slate-600">
                    No Work Items saved yet.
                  </div>
                )}
                <MobileJobWorkScopePanel
                  {...props}
                  presentation="v2DisclosurePanel"
                  disclosureLabel={surfaceProfile.labels.workItems}
                  disclosureHelper={serviceWorkCount > 0 ? `${getVisitScopeCountLabel(serviceWorkCount)} recorded` : "View details"}
                  previewPillClass={previewPillClass}
                  previewRowClass={previewRowClass}
                  previewRowTextClass={previewRowTextClass}
                />
              </>
            )}
          </div>
        </section>

        {showEccWorkScopeLane ? (
          <section className={previewSectionClass}>
            <div id="mobile-work-scope-row" className="flex items-start gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-700 ring-1 ring-slate-200">
                <ToolIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold leading-tight text-[#071225]">Work Scope</h2>
                <p className="mt-0.5 text-sm text-slate-600">
                  Visit scope and Work Items for this job.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <MobileJobWorkScopePanel {...props} presentation="v2InlineBody" />
            </div>
          </section>
        ) : null}

        {isEcc && showServiceWorkLane ? (
          <section className={previewSectionClass}>
            <div
              id="mobile-work-scope-row"
              className="flex flex-col gap-3 min-[390px]:flex-row min-[390px]:items-start min-[390px]:justify-between"
            >
              <div className="min-w-0">
                <div className="inline-flex min-w-0 items-start gap-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-700 ring-1 ring-slate-200">
                    <ToolIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold leading-tight text-[#071225]">{serviceWorkLaneTitle}</h2>
                    <p className="mt-0.5 text-sm text-slate-600">{serviceWorkLaneHelper}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="v2-work-scope-summary mt-4 divide-y divide-slate-200 rounded-2xl border border-slate-200">
              {serviceWorkSummary ? (
                <div className="px-3 py-3">
                  <div className="text-sm font-semibold text-slate-500">Work Summary</div>
                  <p className="mt-1 text-base leading-6 text-slate-800">{serviceWorkSummary}</p>
                </div>
              ) : null}
              {serviceWorkPreviewItems.map((item: any, index: number) => (
                <div key={`${item.title}-${index}`} className="px-3 py-3">
                  <div className="font-semibold text-slate-950">{item.title}</div>
                  {item.details ? <div className="mt-1 text-sm leading-5 text-slate-600">{item.details}</div> : null}
                </div>
              ))}
              <MobileJobWorkScopePanel
                {...props}
                presentation="v2DisclosurePanel"
                disclosureLabel="Service Work"
                disclosureHelper={`${getVisitScopeCountLabel(serviceWorkCount)} recorded`}
                previewPillClass={previewPillClass}
                previewRowClass={previewRowClass}
                previewRowTextClass={previewRowTextClass}
              />
            </div>
          </section>
        ) : null}

        <section className={previewSectionClass}>
          <div className="flex items-start gap-3">
            <div className="inline-flex min-w-0 items-start gap-2 text-xl font-semibold text-[#071225]">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                <MessageIcon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block">Evidence & Notes</span>
                <span className="mt-0.5 block text-sm font-medium leading-5 text-slate-600">
                  Notes, photos, and shared job context.
                </span>
              </span>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <a id="mobile-team-notes-row" href="#mobile-internal-notes" className={evidenceActionClass}>
              <span className={evidenceActionTopClass}>
                <span className={evidenceIconClass}>
                  <LockIcon className="h-4 w-4" />
                </span>
                <span className={evidenceLabelClass}>Team Notes</span>
              </span>
              <span className="flex max-w-[52%] shrink-0 flex-wrap items-center justify-end gap-1.5">
                {internalNotesSignal ? <span className={evidenceSignalClass}>{internalNotesSignal}</span> : null}
                {internalNotesBadge ? <span className={evidenceBadgeClass}>{internalNotesBadge}</span> : null}
                <ChevronRightIcon className="h-5 w-5 text-slate-400" />
              </span>
            </a>
            {showSharedNotesCard ? (
              <a id="mobile-shared-notes-row" href="#mobile-shared-notes" className={evidenceActionClass}>
                <span className={evidenceActionTopClass}>
                  <span className={evidenceIconClass}>
                    <ChatIcon className="h-4 w-4" />
                  </span>
                  <span className={evidenceLabelClass}>Shared Notes</span>
                </span>
                <span className="flex max-w-[52%] shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {sharedNotesSignal ? <span className={evidenceSignalClass}>{sharedNotesSignal}</span> : null}
                  {sharedNotesBadge ? <span className={evidenceBadgeClass}>{sharedNotesBadge}</span> : null}
                  <ChevronRightIcon className="h-5 w-5 text-slate-400" />
                </span>
              </a>
            ) : null}
            <Link href={`/jobs/${job.id}/attachments`} className={evidenceActionClass}>
              <span className={evidenceActionTopClass}>
                <span className={evidenceIconClass}>
                  <FolderIcon className="h-4 w-4" />
                </span>
                <span className={evidenceLabelClass}>Files & Attachments</span>
              </span>
              <span className="flex max-w-[52%] shrink-0 items-center justify-end gap-1.5">
                {attachmentCountMeta ? <span className={evidenceBadgeClass}>{attachmentCountMeta}</span> : null}
                <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400" />
              </span>
            </Link>
          </div>
        </section>

        <MobileJobTeamNotesPanel {...props} presentation="v2TargetPanel" />
        {showSharedNotesCard ? <MobileJobSharedNotesPanel {...props} presentation="v2TargetPanel" /> : null}

        <section className={previewSectionClass}>
          <div className="flex flex-col gap-3 min-[390px]:flex-row min-[390px]:items-start min-[390px]:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-semibold uppercase tracking-[0.1em] text-slate-500">
                Billing / Closeout
              </div>
              <h2 className="mt-1 text-xl font-semibold leading-tight text-[#071225]">
                {billingPreview.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{billingPreview.summary}</p>
            </div>
            <span className="inline-flex min-h-8 w-fit shrink-0 items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold leading-tight text-slate-600">
              {billingPreview.statusLabel}
            </span>
          </div>
          {canShowNativeExternalBillingAction ? (
            <form action={completeDataEntryFromForm} className="mt-4">
              <input type="hidden" name="job_id" value={job.id} />
              <input type="hidden" name="return_to" value={v2BillingReturnTo} />
              <SubmitButton
                loadingText="Saving..."
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-3 text-base font-semibold leading-tight text-amber-950"
              >
                Mark External Billing Complete
              </SubmitButton>
            </form>
          ) : canShowNativeInvoiceWorkspaceLink ? (
            <Link
              href={`/jobs/${job.id}/invoice?mobileLayout=v2#invoice-workspace`}
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold leading-tight text-slate-700"
            >
              <span className="min-w-0 break-words text-center">{billingPreview.actionLabel}</span>
              <ChevronRightIcon className="h-5 w-5" />
            </Link>
          ) : canShowNativeInvoiceDraftAction ? (
            <form action={createInternalInvoiceDraftFromForm} className="mt-4">
              <input type="hidden" name="job_id" value={job.id} />
              <input type="hidden" name="tab" value={tab} />
              <input type="hidden" name="return_to" value={`/jobs/${job.id}/invoice?mobileLayout=v2#invoice-workspace`} />
              <input type="hidden" name="auto_import_visit_scope_items" value="1" />
              <SubmitButton
                loadingText="Starting..."
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold leading-tight text-slate-700"
              >
                <span className="min-w-0 break-words text-center">{billingPreview.actionLabel}</span>
                <ChevronRightIcon className="h-5 w-5" />
              </SubmitButton>
            </form>
          ) : canShowNativeStatusActionLink ? (
            <a
              href="#mobile-next-service-action"
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold leading-tight text-slate-700"
            >
              <span className="min-w-0 break-words text-center">{billingPreview.actionLabel}</span>
              <ChevronRightIcon className="h-5 w-5" />
            </a>
          ) : null}
        </section>

        {canShowReviewAsk ? (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-700">
              Request a Review
            </p>
            <p className="mb-3 text-sm text-stone-600">
              Job complete — ask your customer for a Google review while the experience is fresh.
            </p>
            <div className="flex flex-col gap-2">
              {reviewAskMailtoHref ? (
                <a
                  href={reviewAskMailtoHref}
                  className="flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50"
                >
                  <MailIcon className="h-4 w-4" />
                  Send Review Request by Email
                </a>
              ) : null}
              {reviewAskSmsHref ? (
                <a
                  href={reviewAskSmsHref}
                  className="flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50"
                >
                  <MessageIcon className="h-4 w-4" />
                  Send Review Request by Text
                </a>
              ) : null}
              {!reviewAskMailtoHref && !reviewAskSmsHref ? (
                <p className="text-xs text-stone-400">
                  No email or phone on file — add contact info to enable review requests.
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        <details className={`${previewSectionClass} group`}>
          <summary className="cursor-pointer list-none">
            <div className={`${mobileToolLinkClass} min-h-14 justify-between`}>
              <span className="min-w-0">
                <span className="block break-words">More Details / Tools</span>
                <span className="mt-0.5 block text-sm font-medium leading-5 text-slate-500">
                  Admin tools, permits, history, and follow-up.
                </span>
              </span>
              <ChevronRightIcon className="h-5 w-5 shrink-0 transition-transform group-open:rotate-90" />
            </div>
          </summary>
          <div className="mt-3 space-y-4 border-t border-slate-200 pt-3">
            <div className="space-y-2">
              <div className={toolsGroupHeadingClass}>Tools</div>
              <div className="grid gap-2">
                {createEstimateFromJobHref ? (
                  <Link href={createEstimateFromJobHref} className={toolsRowClass}>
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className={toolsRowIconClass}>
                        <ToolIcon className="h-4 w-4" />
                      </span>
                      <span className={toolsRowTextClass}>
                        <span className="block font-semibold text-slate-950">Create Estimate</span>
                        <span className="block text-sm font-medium text-slate-600">Open estimate workflow</span>
                      </span>
                    </span>
                    <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400" />
                  </Link>
                ) : null}
                {isInternalUser && String(job?.job_type ?? "").trim().toLowerCase() === "service" ? (
                  <MobileJobServiceFollowUpTool
                    {...props}
                    presentation="v2Tools"
                    toolsRowClass={toolsRowClass}
                    toolsRowIconClass={toolsRowIconClass}
                    toolsRowTextClass={toolsRowTextClass}
                  />
                ) : null}
                <details className="group/contact-log">
                  <summary className="cursor-pointer list-none">
                    <div className={toolsRowClass}>
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span className={toolsRowIconClass}>
                          <PhoneIcon className="h-4 w-4" />
                        </span>
                        <span className={toolsRowTextClass}>
                          <span className="block font-semibold text-slate-950">Contact Log</span>
                          <span className="block text-sm font-medium text-slate-600">
                            Record call, text, or no-answer attempt
                          </span>
                        </span>
                      </span>
                      <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open/contact-log:rotate-90" />
                    </div>
                  </summary>
                  <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50/35 px-3 py-3 shadow-[inset_3px_0_0_rgba(37,99,235,0.16)]">
                    <ContactLoggingQuickActions
                      jobId={String(job.id)}
                      attemptCount={attemptCount}
                      lastAttemptLabel={lastAttemptLabel}
                      action={logCustomerContactAttemptFromForm}
                      buttonClassName={contactLoggingButtonClass}
                    />
                  </div>
                </details>
                <details className="group/team-assignment">
                  <summary className="cursor-pointer list-none">
                    <div className={toolsRowClass}>
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span className={toolsRowIconClass}>
                          <ToolIcon className="h-4 w-4" />
                        </span>
                        <span className={toolsRowTextClass}>
                          <span className="block font-semibold text-slate-950">Team Assignment</span>
                          <span className="block text-sm font-medium text-slate-600">
                            View or change assigned field team
                          </span>
                        </span>
                      </span>
                      <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open/team-assignment:rotate-90" />
                    </div>
                  </summary>
                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
                    <AssignedTeamControls
                      jobId={String(job.id)}
                      tab={tab}
                      assignedTeam={assignedTeam}
                      assignedUserIds={assignedUserIds}
                      isInternalUser={isInternalUser}
                      fieldTeamLabel={surfaceProfile.labels.fieldTeam}
                      fieldUserLabel={surfaceProfile.labels.fieldUser}
                      emptyStateClassName="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-600"
                      variant="mobile"
                      returnTo={v2AssignmentReturnTo}
                    />
                  </div>
                </details>
                {hasServicePlanToolContext ? (
                  <details id="mobile-service-plan-actions" className="group/service-plan">
                    <summary className="cursor-pointer list-none">
                      <div className={toolsRowClass}>
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <span className={toolsRowIconClass}>
                            <ClockIcon className="h-4 w-4" />
                          </span>
                          <span className={toolsRowTextClass}>
                            <span className="block font-semibold text-slate-950">Service Plan</span>
                            <span className="block text-sm font-medium text-slate-600">{servicePlanToolHelper}</span>
                          </span>
                        </span>
                        <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open/service-plan:rotate-90" />
                      </div>
                    </summary>
                    <div className="mt-2 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {markVisitCountedAgreementName || suggestedNextDueProjection?.agreementName || confirmedNextDueContext?.agreementName || "Service Plan"}
                        </div>
                        <div className="mt-1 text-sm leading-5 text-slate-600">
                          Review agreement context or complete available visit-count and next-due actions.
                        </div>
                      </div>

                      {markVisitCountedLinkId ? (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm leading-5 text-emerald-950">
                          <div className="font-semibold">Visit count review</div>
                          <div className="mt-1 text-emerald-900">
                            This completed maintenance visit may count toward {markVisitCountedAgreementName || "the plan"}.
                          </div>
                          <div className="mt-3">
                            <MarkVisitCountedActionButton
                              jobId={String(job.id)}
                              linkId={markVisitCountedLinkId}
                              tab={tab}
                              returnTo={v2ServicePlanReturnTo}
                            />
                          </div>
                        </div>
                      ) : null}

                      {suggestedNextDueProjection ? (
                        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm leading-5 text-blue-950">
                          <div className="font-semibold">Suggested next due date</div>
                          {confirmedNextDueContext ? (
                            <>
                              <div className="mt-1 text-blue-900">
                                Next due date already confirmed for this counted visit.
                              </div>
                              <div className="mt-2 font-semibold text-blue-950">
                                Confirmed: {formatDateOnlyUs(confirmedNextDueContext.confirmedNextDueDate) || "Manual scheduling required."}
                              </div>
                              <div className="mt-1 text-blue-900">
                                Previous due date: {formatDateOnlyUs(confirmedNextDueContext.baselineNextDueDate) || "Not recorded."}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="mt-1 text-blue-900">
                                Suggestion only. Confirm updates the Service Plan next due date and does not create a job, schedule, invoice, or payment.
                              </div>
                              <div className="mt-2 font-semibold text-blue-950">
                                {suggestedNextDueProjection.manualSchedulingRequired
                                  ? "Manual scheduling required."
                                  : formatDateOnlyUs(suggestedNextDueProjection.suggestedNextDueDate) || "Manual scheduling required."}
                              </div>
                              {suggestedNextDueProjection.seasonalWindowPlaceholder ? (
                                <div className="mt-1 text-blue-900">
                                  {suggestedNextDueProjection.seasonalWindowPlaceholder}
                                </div>
                              ) : null}
                              {canConfirmServicePlanNextDue ? (
                                <div className="mt-3">
                                  <ConfirmNextDueDateActionButton
                                    jobId={String(job.id)}
                                    agreementId={suggestedNextDueProjection.agreementId}
                                    suggestedNextDueDate={suggestedNextDueProjection.suggestedNextDueDate}
                                    baselineNextDueDate={suggestedNextDueProjection.baselineNextDueDate || ""}
                                    displayDate={formatDateOnlyUs(suggestedNextDueProjection.suggestedNextDueDate) || suggestedNextDueProjection.suggestedNextDueDate}
                                    tab={tab}
                                    returnTo={v2ServicePlanReturnTo}
                                  />
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                      ) : null}

                      <Link
                        href={servicePlanToolHref}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                      >
                        Open Service Plan
                        <ChevronRightIcon className="h-4 w-4" />
                      </Link>
                    </div>
                  </details>
                ) : (
                  <Link href={servicePlanToolHref} className={toolsRowClass}>
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className={toolsRowIconClass}>
                        <ClockIcon className="h-4 w-4" />
                      </span>
                      <span className={toolsRowTextClass}>
                        <span className="block font-semibold text-slate-950">Service Plan</span>
                        <span className="block text-sm font-medium text-slate-600">{servicePlanToolHelper}</span>
                      </span>
                    </span>
                    <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400" />
                  </Link>
                )}
                <details id="mobile-tools" className="group/status-tools">
                  <summary className="cursor-pointer list-none">
                    <div className={toolsRowClass}>
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span className={toolsRowIconClass}>
                          <ToolIcon className="h-4 w-4" />
                        </span>
                        <span className={toolsRowTextClass}>
                          <span className="block font-semibold text-slate-950">Job Status Tools</span>
                          <span className="block text-sm font-medium text-slate-600">Set or clear waiting and hold blockers</span>
                        </span>
                      </span>
                      <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open/status-tools:rotate-90" />
                    </div>
                  </summary>
                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
                    <form action={updateJobOpsFromForm} className="space-y-3">
                      <input type="hidden" name="job_id" value={job.id} />
                      <input type="hidden" name="return_to" value={v2StatusToolsReturnTo} />
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
                        <input type="hidden" name="return_to" value={v2StatusToolsReturnTo} />
                        <SubmitButton loadingText="Updating..." className={secondaryButtonClass}>
                          {interruptReleaseActionLabel}
                        </SubmitButton>
                      </form>
                    ) : null}
                  </div>
                </details>
              </div>
            </div>

            <div className="space-y-2">
              <div className={toolsGroupHeadingClass}>Admin / Records</div>
              <div className="grid gap-2">
                <details id="mobile-tools-timeline" className="group/timeline">
                  <summary className="cursor-pointer list-none">
                    <div className={toolsRowClass}>
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span className={toolsRowIconClass}>
                          <FolderIcon className="h-4 w-4" />
                        </span>
                        <span className={toolsRowTextClass}>
                          <span className="block font-semibold text-slate-950">Timeline / History</span>
                          <span className="block text-sm font-medium text-slate-600">Review job history and activity</span>
                        </span>
                      </span>
                      <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open/timeline:rotate-90" />
                    </div>
                  </summary>
                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
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
            {isInternalUser && serviceLocationEditHref ? (
              <Link href={serviceLocationEditHref} className={toolsRowClass}>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className={toolsRowIconClass}>
                    <MapPinIcon className="h-4 w-4" />
                  </span>
                  <span className={toolsRowTextClass}>
                    <span className="block font-semibold text-slate-950">Location & Address</span>
                    <span className="block text-sm font-medium text-slate-600">Edit service location</span>
                  </span>
                </span>
                <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400" />
              </Link>
            ) : null}
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
