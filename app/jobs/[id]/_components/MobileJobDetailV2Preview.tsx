// app/jobs/[id]/_components/MobileJobDetailV2Preview

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

function buildExceptionNextStepPreview(props: {
  job: any;
  activeWaitingState: any;
  failedReasonBannerText: string;
  isHistoricalServiceFollowUpContinued: boolean;
  linkedRetestPassiveCopy: string;
  linkedRetestPassiveHeading: string;
  showLinkedRetestCreated: boolean;
}) {
  const status = String(props.job?.status ?? "").trim().toLowerCase();
  const opsStatus = String(props.job?.ops_status ?? "").trim().toLowerCase();
  const waitingLabel = getWaitingStateLabel(props.activeWaitingState, props.job);
  const waitingReason = String(
    props.activeWaitingState?.blockerReason ?? props.job?.pending_info_reason ?? props.job?.on_hold_reason ?? "",
  ).trim();

  if (props.isHistoricalServiceFollowUpContinued || props.showLinkedRetestCreated) {
    return {
      eyebrow: "Linked work",
      title: props.linkedRetestPassiveHeading || "Linked active job",
      summary:
        props.linkedRetestPassiveCopy ||
        "This job has linked follow-up work. Review the current job tools before taking action here.",
      anchor: "mobile-tools",
      actionLabel: "Review job history",
      isSafeInlineLifecycleAction: false,
    };
  }

  if (opsStatus === "archived" || props.job?.deleted_at) {
    return {
      eyebrow: "Read-only",
      title: "Archived",
      summary: "This job is archived. Review history or tools from the standard job view.",
      anchor: "mobile-tools",
      actionLabel: "Review job history",
      isSafeInlineLifecycleAction: false,
    };
  }

  if (status === "cancelled") {
    return {
      eyebrow: "Read-only",
      title: "Job cancelled",
      summary: "This job is cancelled. Review history or tools from the standard job view.",
      anchor: "mobile-tools",
      actionLabel: "Review job history",
      isSafeInlineLifecycleAction: false,
    };
  }

  if (opsStatus === "closed") {
    return {
      eyebrow: "Read-only",
      title: "Job closed",
      summary: "This job is closed. Review history, notes, or closeout details from the standard job view.",
      anchor: "mobile-tools",
      actionLabel: "Review job history",
      isSafeInlineLifecycleAction: false,
    };
  }

  if (waitingLabel) {
    return {
      eyebrow: "Waiting",
      title: waitingLabel,
      summary: waitingReason || "This job is paused until the waiting item is resolved.",
      anchor: "mobile-tools",
      actionLabel: "Open waiting tools",
      isSafeInlineLifecycleAction: false,
    };
  }

  if (opsStatus === "failed" || opsStatus === "pending_office_review") {
    return {
      eyebrow: "Review",
      title: opsStatus === "pending_office_review" ? "Review needed" : "Correction needed",
      summary: props.failedReasonBannerText || "Review the failed or pending review state before continuing.",
      anchor: "mobile-next-service-action",
      actionLabel: "Review next action",
      isSafeInlineLifecycleAction: false,
    };
  }

  if (opsStatus === "retest_needed") {
    return {
      eyebrow: "Retest",
      title: "Retest needed",
      summary: "Review the retest workflow from the standard job view.",
      anchor: "mobile-next-service-action",
      actionLabel: "Review retest",
      isSafeInlineLifecycleAction: false,
    };
  }

  return null;
}

function getActionOrientedWorkLabel(label: string | undefined) {
  const trimmed = String(label ?? "").trim();

  if (trimmed.toLowerCase() === "work completed") {
    return "Complete work";
  }

  return trimmed || "Finish Visit";
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

function buildNextStepPreview(props: {
  job: any;
  isFieldComplete: boolean;
  isEccPermitNeededActive: boolean;
  showPrimaryCloseoutBlockers: boolean;
  showConfirmRetestReady: boolean;
  showRetestSection: boolean;
  isServiceFieldFollowUpPendingInfo: boolean;
  showMobileServiceInvoiceFieldAction: boolean;
  showMobileEccTestAction: boolean;
  primaryCloseoutMessage: string;
  serviceFollowUpProgressState: any;
  surfaceProfile: any;
  closeoutNeeds: any;
  hasRequiredEccTestAttention: boolean;
  activeWaitingState: any;
  failedReasonBannerText: string;
  isHistoricalServiceFollowUpContinued: boolean;
  linkedRetestPassiveCopy: string;
  linkedRetestPassiveHeading: string;
  showLinkedRetestCreated: boolean;
}) {
  const status = String(props.job?.status ?? "").trim().toLowerCase();
  const opsStatus = String(props.job?.ops_status ?? "").trim().toLowerCase();
  const isService = String(props.job?.job_type ?? "").trim().toLowerCase() === "service";
  const isEcc = String(props.job?.job_type ?? "").trim().toLowerCase() === "ecc";
  const finishWorkLabel = getActionOrientedWorkLabel(props.surfaceProfile?.labels?.finishComplete);
  const isActiveEccWork =
    isEcc &&
    (!props.isFieldComplete ||
      props.hasRequiredEccTestAttention ||
      props.isEccPermitNeededActive ||
      Boolean(props.closeoutNeeds?.needsCerts));

  const exceptionNextStep = buildExceptionNextStepPreview({
    job: props.job,
    activeWaitingState: props.activeWaitingState,
    failedReasonBannerText: props.failedReasonBannerText,
    isHistoricalServiceFollowUpContinued: props.isHistoricalServiceFollowUpContinued,
    linkedRetestPassiveCopy: props.linkedRetestPassiveCopy,
    linkedRetestPassiveHeading: props.linkedRetestPassiveHeading,
    showLinkedRetestCreated: props.showLinkedRetestCreated,
  });

  if (
    exceptionNextStep &&
    !props.showConfirmRetestReady &&
    !props.showRetestSection &&
    !props.isServiceFieldFollowUpPendingInfo
  ) {
    return exceptionNextStep;
  }

  if (props.isEccPermitNeededActive && !props.showPrimaryCloseoutBlockers) {
    return {
      eyebrow: "Closeout blocker",
      title: "Add permit information",
      summary: "Add the permit details so cert closeout can continue.",
      anchor: "mobile-ecc-permit-needed-action",
      actionLabel: "Add permit details",
      isSafeInlineLifecycleAction: false,
    };
  }

  if (props.showConfirmRetestReady) {
    return {
      eyebrow: "Retest review",
      title: "Confirm retest readiness",
      summary: "Confirm that corrections are ready before scheduling the retest.",
      anchor: "mobile-next-service-action",
      actionLabel: "Confirm retest ready",
      isSafeInlineLifecycleAction: false,
    };
  }

  if (props.showRetestSection) {
    return {
      eyebrow: "Retest scheduling",
      title: "Schedule the retest",
      summary: "Schedule the linked retest now or move it to the scheduling queue.",
      anchor: "mobile-next-service-action",
      actionLabel: "Schedule retest",
      isSafeInlineLifecycleAction: false,
    };
  }

  if (props.isServiceFieldFollowUpPendingInfo && props.serviceFollowUpProgressState?.reason) {
    return {
      eyebrow: "Follow-up",
      title: String(props.serviceFollowUpProgressState.reason.display ?? "Follow-up needed"),
      summary: "Update follow-up progress or create the return visit when ready.",
      anchor: "mobile-next-service-action",
      actionLabel: "Update follow-up",
      isSafeInlineLifecycleAction: false,
    };
  }

  if (props.showPrimaryCloseoutBlockers) {
    return {
      eyebrow: "Closeout",
      title: isService ? "Closeout responsibility" : "Finish compliance closeout",
      summary: props.primaryCloseoutMessage || "Finish the remaining closeout responsibility.",
      anchor: "mobile-next-service-action",
      actionLabel: "Continue closeout",
      isSafeInlineLifecycleAction: false,
    };
  }

  if (isActiveEccWork && props.showMobileEccTestAction && props.hasRequiredEccTestAttention) {
    return {
      eyebrow: "Compliance work",
      title: "Complete required tests",
      summary: "Open the test workflow and finish the required compliance checks.",
      href: `/jobs/${props.job.id}/tests`,
      anchor: "",
      actionLabel: "Open tests",
      isSafeInlineLifecycleAction: false,
    };
  }

  if (isActiveEccWork && props.isEccPermitNeededActive) {
    return {
      eyebrow: "Compliance closeout",
      title: "Add permit information",
      summary: "Add the permit details so cert closeout can continue.",
      anchor: "mobile-ecc-permit-needed-action",
      actionLabel: "Add permit details",
      isSafeInlineLifecycleAction: false,
    };
  }

  if (isActiveEccWork && props.closeoutNeeds?.needsCerts) {
    return {
      eyebrow: "Compliance closeout",
      title: "Finish certification items",
      summary: "Review the remaining certification items before billing closeout.",
      anchor: "mobile-next-service-action",
      actionLabel: "Review closeout",
      isSafeInlineLifecycleAction: false,
    };
  }

  if (props.showMobileServiceInvoiceFieldAction) {
    return {
      eyebrow: "Billing",
      title: "Review billing",
      summary: "Build or review the invoice so closeout can continue.",
      anchor: "mobile-invoice-summary-card",
      actionLabel: "Review billing",
      isSafeInlineLifecycleAction: false,
    };
  }

  if (!props.isFieldComplete && status === "completed") {
    return {
      eyebrow: "Field status",
      title: "Mark field complete",
      summary: "Finish the field handoff before office closeout continues.",
      anchor: "",
      actionLabel: "Mark Field Complete",
      isSafeInlineLifecycleAction: true,
    };
  }

  if (!props.isFieldComplete) {
    const title =
      status === "on_the_way" || opsStatus === "on_the_way"
        ? "Start the visit"
        : status === "in_process" || opsStatus === "in_process"
        ? finishWorkLabel
        : "Head to the job";
    const summary =
      status === "on_the_way" || opsStatus === "on_the_way"
        ? "When you arrive, start field work."
        : status === "in_process" || opsStatus === "in_process"
        ? "Complete the field visit when the work is done."
        : "Mark yourself on the way when you are ready to go.";

    return {
      eyebrow: "Next step",
      title,
      summary,
      anchor: "",
      actionLabel: "",
      isSafeInlineLifecycleAction: true,
    };
  }

  return {
    eyebrow: "Status",
    title: isEcc ? "Review compliance closeout" : "Review remaining closeout",
    summary: "Field work is complete. Continue with any closeout, notes, or billing responsibilities below.",
    anchor: "mobile-tools",
    actionLabel: "Open job tools",
    isSafeInlineLifecycleAction: false,
  };
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
  isFieldComplete: boolean;
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
  const isEccWorkStillActive =
    props.isEcc &&
    !props.isFieldComplete &&
    !props.showMobileServiceInvoiceFieldAction &&
    !props.showMobileInvoiceOpenAttention &&
    !props.showInternalInvoicingPlaceholder &&
    !props.showInternalInvoicePanel &&
    !props.internalInvoiceTruth &&
    !props.showExternalDataEntryPrompt;

  if (isEccWorkStillActive) {
    return {
      title: "Billing / Closeout",
      summary: "No billing action needed yet.",
      actionLabel: "",
      hrefAnchor: "",
      statusLabel: "No action",
    };
  }

  if (hasInvoiceAttention) {
    return {
      title: props.jobPageInvoiceStateLabel || "Billing review",
      summary:
        props.jobPageInvoiceSummaryText ||
        "Review the invoice or billing requirements for this job.",
      actionLabel: props.jobPageInvoiceNextAction || "Review billing",
      hrefAnchor: "mobile-invoice-summary-card",
      statusLabel: props.internalInvoiceTruth ? "Invoice active" : "Invoice needed",
    };
  }

  if (hasExternalBillingAttention) {
    return {
      title: "External billing needed",
      summary: "Mark external billing complete when billing is finished.",
      actionLabel: "Open billing action",
      hrefAnchor: "mobile-next-service-action",
      statusLabel: "Action needed",
    };
  }

  if (hasCloseoutAttention) {
    return {
      title: "Closeout attention",
      summary: "Review the remaining closeout items for this job.",
      actionLabel: "Open closeout",
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

export default function MobileJobDetailV2Preview(props: any) {
  const {
    activeWaitingState,
    appointmentDateLabel,
    assignedTeam,
    billingState,
    ChatIcon,
    ChevronRightIcon,
    ClipboardIcon,
    ClockIcon,
    closeoutNeeds,
    contractorName,
    failedReasonBannerText,
    FolderIcon,
    hasFullSchedule,
    headerJobTypeLabel,
    internalInvoiceTruth,
    internalNoteBannerMessage,
    internalNotesMeta,
    isEccPermitNeededActive,
    isFieldComplete,
    isHistoricalServiceFollowUpContinued,
    isInternalUser,
    isServiceFieldFollowUpPendingInfo,
    job,
    JobFieldActionButton,
    jobHeaderReference,
    jobPageInvoiceNextAction,
    jobPageInvoiceStateLabel,
    jobPageInvoiceSummaryText,
    jobWorkbenchAccountLabel,
    jobWorkbenchTitle,
    Link,
    linkedRetestPassiveCopy,
    linkedRetestPassiveHeading,
    LockIcon,
    MapPinIcon,
    MessageIcon,
    markJobFieldCompleteFromForm,
    mobileAppointmentTimeLabel,
    mobileCallHref,
    mobileCustomerHref,
    mobileTextHref,
    mobileToolLinkClass,
    onTheWayUndoEligibility,
    PhoneIcon,
    primaryCloseoutMessage,
    recordBlockingPhase,
    serviceAddressDisplay,
    serviceAddressLine1,
    serviceAddressLine2,
    serviceCity,
    serviceFollowUpProgressState,
    serviceLocationEditHref,
    serviceState,
    serviceZip,
    showConfirmRetestReady,
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
    SubmitButton,
    surfaceProfile,
    Suspense,
    tab,
    TimedJobLocationPreview,
    timingEnabled,
    ToolIcon,
    hasVisitScopeDefined,
    visitReasonText,
    visitScopeCount,
    visitScopeItems,
    visitScopeSummary,
    WarningIcon,
    JobLocationPreviewFallback,
    sharedNoteBannerMessage,
    sharedNotesMeta,
  } = props;

  const lifecycle = buildLifecyclePreview({
    job,
    isFieldComplete,
    billingState,
    closeoutNeeds,
    hasScheduleInformation: hasFullSchedule || Boolean(appointmentDateLabel || mobileAppointmentTimeLabel),
    activeWaitingState,
    isHistoricalServiceFollowUpContinued,
    showLinkedRetestCreated,
  });
  const nextStep = buildNextStepPreview({
    job,
    isFieldComplete,
    isEccPermitNeededActive,
    showPrimaryCloseoutBlockers,
    showConfirmRetestReady,
    showRetestSection,
    isServiceFieldFollowUpPendingInfo,
    showMobileServiceInvoiceFieldAction,
    showMobileEccTestAction,
    primaryCloseoutMessage,
    serviceFollowUpProgressState,
    surfaceProfile,
    closeoutNeeds,
    hasRequiredEccTestAttention:
      String(sp?.notice ?? "").trim() === "ecc_test_required" && !hasCompletedEccTestRun(job),
    activeWaitingState,
    failedReasonBannerText,
    isHistoricalServiceFollowUpContinued,
    linkedRetestPassiveCopy,
    linkedRetestPassiveHeading,
    showLinkedRetestCreated,
  });
  const standardJobHref = `/jobs/${job.id}?tab=${tab}`;
  const standardJobAnchorHref = (anchor: string) => `${standardJobHref}#${anchor}`;
  const currentActionHref = nextStep.anchor
    ? standardJobAnchorHref(nextStep.anchor)
    : "href" in nextStep && nextStep.href
    ? nextStep.href
    : standardJobHref;
  const isEcc = String(job?.job_type ?? "").trim().toLowerCase() === "ecc";
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
    isFieldComplete,
  });
  const heroPreviewClassName =
    "px-0 pb-0 [&_a:first-child]:rounded-none [&_a:first-child]:border-0 [&_a:first-child]:shadow-none [&_img]:h-52 [&_img]:rounded-none [&_img]:object-cover min-[390px]:[&_img]:h-56";
  const lifecycleActionClass =
    "inline-flex min-h-14 w-full items-center justify-center rounded-2xl border border-blue-500 bg-blue-600 px-5 py-3 text-base font-semibold text-white shadow-[0_20px_42px_-24px_rgba(37,99,235,0.7)] transition-colors hover:bg-blue-700";
  const finishWorkLabel = getActionOrientedWorkLabel(surfaceProfile.labels.finishComplete);
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
  const serviceWorkSummary = String(visitScopeSummary || visitReasonText || "").trim();
  const showServiceWorkLane = isEcc ? companionServiceItems.length > 0 : Boolean(hasVisitScopeDefined || serviceWorkSummary);
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
              <Link
                href={standardJobHref}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
              >
                Standard view
              </Link>
            </div>

            <h1 className="mt-4 break-words text-[1.8rem] font-semibold leading-[1.08] tracking-normal text-[#071225] min-[390px]:text-[2rem]">
              {jobWorkbenchTitle}
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
                <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500">
                  <ClockIcon className="h-4 w-4" />
                  <span>Schedule</span>
                </div>
                <div className="mt-1 break-words text-lg font-semibold leading-tight text-slate-950">
                  {appointmentDateLabel}
                </div>
                {mobileAppointmentTimeLabel ? (
                  <div className="mt-1 text-sm font-semibold text-slate-700">{mobileAppointmentTimeLabel}</div>
                ) : null}
              </div>
            </div>
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
            <div className="pointer-events-none absolute inset-x-2 bottom-2 rounded-2xl border border-white/30 bg-slate-950/78 p-2.5 text-white shadow-[0_18px_36px_-18px_rgba(15,23,42,0.78)] backdrop-blur-md min-[390px]:inset-x-3 min-[390px]:bottom-3 min-[390px]:p-3">
              <div className="flex items-start gap-2">
                <MapPinIcon className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="min-w-0 break-words text-base font-semibold leading-tight min-[390px]:text-lg">{serviceAddressDisplay}</div>
              </div>
              <div className="pointer-events-auto mt-3 grid grid-cols-3 gap-2">
                {mobileCallHref ? (
                  <a href={mobileCallHref} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-white/25 bg-white/10 px-1.5 text-xs font-semibold text-white min-[390px]:gap-1.5 min-[390px]:px-2 min-[390px]:text-sm">
                    <PhoneIcon className="h-4 w-4" />
                    <span>Call</span>
                  </a>
                ) : (
                  <span className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/5 px-1.5 text-xs font-semibold text-white/45 min-[390px]:gap-1.5 min-[390px]:px-2 min-[390px]:text-sm">
                    <PhoneIcon className="h-4 w-4" />
                    <span>Call</span>
                  </span>
                )}
                {mobileTextHref ? (
                  <a href={mobileTextHref} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-white/25 bg-white/10 px-1.5 text-xs font-semibold text-white min-[390px]:gap-1.5 min-[390px]:px-2 min-[390px]:text-sm">
                    <ChatIcon className="h-4 w-4" />
                    <span>Text</span>
                  </a>
                ) : (
                  <span className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/5 px-1.5 text-xs font-semibold text-white/45 min-[390px]:gap-1.5 min-[390px]:px-2 min-[390px]:text-sm">
                    <ChatIcon className="h-4 w-4" />
                    <span>Text</span>
                  </span>
                )}
                {serviceAddressDisplay !== "No address set" ? (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(serviceAddressDisplay)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-white/25 bg-white/10 px-1.5 text-xs font-semibold text-white min-[390px]:gap-1.5 min-[390px]:px-2 min-[390px]:text-sm"
                  >
                    <MapPinIcon className="h-4 w-4" />
                    <span>Navigate</span>
                  </a>
                ) : (
                  <span className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/5 px-1.5 text-xs font-semibold text-white/45 min-[390px]:gap-1.5 min-[390px]:px-2 min-[390px]:text-sm">
                    <MapPinIcon className="h-4 w-4" />
                    <span>Navigate</span>
                  </span>
                )}
              </div>
            </div>
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
                        <span className="absolute inset-0 rounded-full bg-blue-500/15 motion-safe:animate-ping motion-reduce:animate-none" />
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

        <section className="rounded-2xl border border-[#071225] bg-[#071225] px-3.5 py-4 text-white shadow-[0_22px_46px_-28px_rgba(15,23,42,0.7)] min-[390px]:px-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#071225]">
              <ToolIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold uppercase tracking-[0.1em] text-blue-100/80">{nextStep.eyebrow}</div>
              <h2 className="mt-1 break-words text-[1.45rem] font-semibold leading-tight tracking-normal min-[390px]:text-2xl">{nextStep.title}</h2>
              <p className="mt-2 text-base leading-6 text-slate-200">{nextStep.summary}</p>
            </div>
          </div>
          <div className="mt-4">
            {nextStep.isSafeInlineLifecycleAction ? (
              !isFieldComplete && String(job.status ?? "").trim().toLowerCase() === "completed" ? (
                <form action={markJobFieldCompleteFromForm}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <SubmitButton loadingText="Completing..." className={lifecycleActionClass}>
                    Mark Field Complete
                  </SubmitButton>
                </form>
              ) : (
                <JobFieldActionButton
                  jobId={job.id}
                  currentStatus={job.status}
                  tab={tab}
                  hasFullSchedule={hasFullSchedule}
                  variant="fieldMode"
                  completeLabel={finishWorkLabel}
                  completedLabel={finishWorkLabel}
                />
              )
            ) : (
              <Link href={currentActionHref} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-blue-500 bg-blue-600 px-4 py-3 text-base font-semibold leading-tight text-white shadow-[0_20px_42px_-24px_rgba(37,99,235,0.7)] transition-colors hover:bg-blue-700 min-[390px]:px-5">
                <span className="min-w-0 break-words text-center">{nextStep.actionLabel}</span>
                <ChevronRightIcon className="h-5 w-5" />
              </Link>
            )}
          </div>
          {onTheWayUndoEligibility?.eligible ? (
            <Link href={standardJobHref} className="mt-3 inline-flex w-full justify-center text-sm font-semibold text-blue-100 underline underline-offset-4">
              Undo On the Way is available from job tools
            </Link>
          ) : null}
        </section>

        <section className={previewSectionClass}>
          <div className="flex flex-col gap-3 min-[390px]:flex-row min-[390px]:items-start min-[390px]:justify-between">
            <div className="min-w-0">
              <div className="inline-flex min-w-0 items-start gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  {isEcc ? <ClipboardIcon className="h-5 w-5" /> : <ToolIcon className="h-5 w-5" />}
                </span>
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold leading-tight text-[#071225]">
                    {isEcc ? "Compliance Work" : serviceWorkLaneTitle}
                  </h2>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {isEcc ? "Equipment, tests, permits, and closeout readiness." : serviceWorkLaneHelper}
                  </p>
                </div>
              </div>
            </div>
            <Link href={standardJobAnchorHref("mobile-work-scope")} className={previewHeaderActionClass}>
              {isEcc ? "Compliance details" : "View work details"}
            </Link>
          </div>

          <div className="mt-4 divide-y divide-slate-200 rounded-2xl border border-slate-200">
            {isEcc ? (
              <>
                <Link href={`/jobs/${job.id}/info?f=equipment`} className={previewRowClass}>
                  <span className={previewRowTextClass}>
                    <span className="block font-semibold text-slate-950">Equipment</span>
                    <span className="block text-sm text-slate-600">Manage equipment and furnace details</span>
                  </span>
                  <span className={previewPillClass}>Open</span>
                </Link>
                {showMobileEccTestAction ? (
                  <Link href={`/jobs/${job.id}/tests`} className={previewRowClass}>
                    <span className={previewRowTextClass}>
                      <span className="block font-semibold text-slate-950">ECC Tests</span>
                      <span className="block text-sm text-slate-600">Open test workflow</span>
                    </span>
                    <span className={previewPillClass}>Open</span>
                  </Link>
                ) : null}
                <Link href={standardJobAnchorHref("mobile-tools")} className={previewRowClass}>
                  <span className={previewRowTextClass}>
                    <span className="block font-semibold text-slate-950">Permit Info</span>
                    <span className="block text-sm text-slate-600">Review permit details and actions</span>
                  </span>
                  <span className={previewPillClass}>Status</span>
                </Link>
              </>
            ) : (
              <>
                {serviceWorkSummary ? (
                  <div className="px-3 py-3">
                    <div className="text-sm font-semibold text-slate-500">Visit reason / summary</div>
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
                <Link href={standardJobAnchorHref("mobile-work-scope")} className={previewRowClass}>
                  <span className={previewRowTextClass}>
                    <span className="block font-semibold text-slate-950">{surfaceProfile.labels.workItems}</span>
                    <span className="block text-sm text-slate-600">
                      {serviceWorkCount > 0 ? `${getVisitScopeCountLabel(serviceWorkCount)} recorded` : "View details"}
                    </span>
                  </span>
                  <span className={previewPillClass}>Details</span>
                </Link>
              </>
            )}
          </div>
        </section>

        {isEcc && showServiceWorkLane ? (
          <section className={previewSectionClass}>
            <div className="flex flex-col gap-3 min-[390px]:flex-row min-[390px]:items-start min-[390px]:justify-between">
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
              <Link href={standardJobAnchorHref("mobile-work-scope")} className={previewHeaderActionClass}>
                View work details
              </Link>
            </div>
            <div className="mt-4 divide-y divide-slate-200 rounded-2xl border border-slate-200">
              {serviceWorkSummary ? (
                <div className="px-3 py-3">
                  <div className="text-sm font-semibold text-slate-500">Visit reason / summary</div>
                  <p className="mt-1 text-base leading-6 text-slate-800">{serviceWorkSummary}</p>
                </div>
              ) : null}
              {serviceWorkPreviewItems.map((item: any, index: number) => (
                <div key={`${item.title}-${index}`} className="px-3 py-3">
                  <div className="font-semibold text-slate-950">{item.title}</div>
                  {item.details ? <div className="mt-1 text-sm leading-5 text-slate-600">{item.details}</div> : null}
                </div>
              ))}
              <Link href={standardJobAnchorHref("mobile-work-scope")} className={previewRowClass}>
                <span className={previewRowTextClass}>
                  <span className="block font-semibold text-slate-950">Service Work</span>
                  <span className="block text-sm text-slate-600">{getVisitScopeCountLabel(serviceWorkCount)} recorded</span>
                </span>
                <span className={previewPillClass}>Details</span>
              </Link>
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
            <Link href={standardJobAnchorHref("mobile-internal-notes")} className={evidenceActionClass}>
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
            </Link>
            {showSharedNotesCard ? (
              <Link href={standardJobAnchorHref("mobile-shared-notes")} className={evidenceActionClass}>
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
              </Link>
            ) : null}
            <Link href={`/jobs/${job.id}/attachments`} className={evidenceActionClass}>
              <span className={evidenceActionTopClass}>
                <span className={evidenceIconClass}>
                  <FolderIcon className="h-4 w-4" />
                </span>
                <span className={evidenceLabelClass}>Files & Attachments</span>
              </span>
              <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400" />
            </Link>
          </div>
        </section>

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
          {billingPreview.hrefAnchor ? (
            <Link
              href={standardJobAnchorHref(billingPreview.hrefAnchor)}
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold leading-tight text-slate-700"
            >
              <span className="min-w-0 break-words text-center">{billingPreview.actionLabel}</span>
              <ChevronRightIcon className="h-5 w-5" />
            </Link>
          ) : null}
        </section>

        <details className={`${previewSectionClass} group`}>
          <summary className="cursor-pointer list-none">
            <div className={`${mobileToolLinkClass} min-h-14 justify-between`}>
              <span className="min-w-0 break-words">More Details / Tools</span>
              <ChevronRightIcon className="h-5 w-5 shrink-0 transition-transform group-open:rotate-90" />
            </div>
          </summary>
          <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
            <Link href={standardJobAnchorHref("mobile-tools")} className="flex min-h-16 min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-sm font-semibold text-slate-700">
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600 ring-1 ring-slate-200">
                  <ToolIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-950">Job Tools</span>
                  <span className="block text-sm text-slate-600">Open tools area</span>
                </span>
              </span>
              <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400" />
            </Link>
            {isInternalUser && serviceLocationEditHref ? (
              <Link href={serviceLocationEditHref} className="flex min-h-16 min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-sm font-semibold text-slate-700">
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600 ring-1 ring-slate-200">
                    <MapPinIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-950">Location & Address</span>
                    <span className="block text-sm text-slate-600">Edit service location</span>
                  </span>
                </span>
                <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400" />
              </Link>
            ) : null}
          </div>
        </details>
      </div>
    </div>
  );
}
