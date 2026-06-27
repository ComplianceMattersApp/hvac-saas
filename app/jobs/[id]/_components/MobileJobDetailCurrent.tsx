// app/jobs/[id]/_components/MobileJobDetailCurrent

import MobileJobStatusActionSurface from "./MobileJobStatusActionSurface";
import MobileJobSchedulePanel from "./MobileJobSchedulePanel";
import MobileJobTeamNotesPanel from "./MobileJobTeamNotesPanel";
import MobileJobSharedNotesPanel from "./MobileJobSharedNotesPanel";
import MobileJobWorkScopePanel from "./MobileJobWorkScopePanel";

type MobileJobDetailCurrentProps = {
  activeWaitingState: any;
  addPublicNoteFromForm: any;
  appointmentDateLabel: any;
  assignedTeam: any;
  AssignedTeamControls: any;
  assignedUserIds: any;
  attemptCount: any;
  banner: any;
  billingMode: any;
  billingState: any;
  canShowCertsButton: any;
  canShowEccFailedReasonBanner: any;
  canShowInvoiceButton: any;
  canShowReleaseAndReevaluate: any;
  ChatIcon: any;
  ChevronRightIcon: any;
  ClipboardIcon: any;
  ClockIcon: any;
  closeoutNeeds: any;
  compactWorkspaceActionButtonClass: any;
  completeDataEntryFromForm: any;
  completionActionAttentionBanner: any;
  confirmEccRetestReadyFromForm: any;
  confirmedNextDueContext: any;
  ConfirmNextDueDateActionButton: any;
  ContactLoggingQuickActions: any;
  contractorName: any;
  createEstimateFromJobHref: any;
  createInternalInvoiceDraftFromForm: any;
  createNextServiceVisitFromForm: any;
  createRetestJobFromForm: any;
  currentInterruptState: any;
  darkButtonClass: any;
  DeferredInternalNoteMentionComposer: any;
  DeferredInternalNotesBody: any;
  DeferredSharedNotesBody: any;
  DeferredTimelineBody: any;
  displayDateLA: any;
  failedReasonBannerText: any;
  fieldHeaderTitle: any;
  FieldOutcomePanel: any;
  FlashBanner: any;
  FolderIcon: any;
  formatDateOnlyUs: any;
  formatVisitScopeItemKindLabel: any;
  hasDirectInvoiceWorkflowAccess: any;
  hasDirectNarrativeChain: any;
  hasFullSchedule: any;
  hasVisitScopeDefined: any;
  headerJobTypeLabel: any;
  ImmediateSubmitButton: any;
  initialInterruptReason: any;
  initialWaitingOtherReason: any;
  initialWaitingReasonType: any;
  internalInvoiceTruth: any;
  internalNoteBannerMessage: any;
  internalNoteBannerType: any;
  internalNotesMeta: any;
  internalUser: any;
  interruptReleaseActionLabel: any;
  InterruptStateFields: any;
  isCleaningMode: any;
  isEccPermitNeededActive: any;
  isFieldComplete: any;
  isHistoricalServiceFollowUpContinued: any;
  isInternalUser: any;
  isServiceFieldFollowUpPendingInfo: any;
  job: any;
  JobFieldActionButton: any;
  jobHeaderReference: any;
  JobLocationPreviewFallback: any;
  jobPageInvoiceNextAction: any;
  jobPageInvoiceStateLabel: any;
  jobPageInvoiceSummaryText: any;
  jobWorkbenchAccountLabel: any;
  jobWorkbenchTitle: any;
  lastAttemptLabel: any;
  Link: any;
  linkedRetestPassiveCopy: any;
  linkedRetestPassiveHeading: any;
  LockIcon: any;
  logCustomerContactAttemptFromForm: any;
  MapPinIcon: any;
  markCertsCompleteFromForm: any;
  markEccPermitAvailableFromForm: any;
  markInvoiceCompleteFromForm: any;
  markJobFieldCompleteFromForm: any;
  markServiceApprovalReceivedFromForm: any;
  markServicePartArrivedFromForm: any;
  markServicePartOrderedFromForm: any;
  MarkVisitCountedActionButton: any;
  markVisitCountedAgreementName: any;
  markVisitCountedLinkId: any;
  MessageIcon: any;
  mobileAppointmentTimeLabel: any;
  mobileAttentionActionClass: any;
  mobileAttentionStripClass: any;
  mobileCallHref: any;
  mobileCurrentStatusLabel: any;
  mobileCustomerHref: any;
  mobileDisabledActionClass: any;
  mobileFieldActionClass: any;
  mobileInvoiceActionRelevant: any;
  mobileMutedToolLinkClass: any;
  mobileSectionClass: any;
  mobileTextHref: any;
  mobileToolLinkClass: any;
  NarrativeNotesBodyFallback: any;
  narrativeScopeJobIds: any;
  NarrativeTimelineBodyFallback: any;
  onTheWayUndoEligibility: any;
  permitDateLabel: any;
  permitJurisdiction: any;
  permitNumber: any;
  permitSummaryLabel: any;
  PhoneIcon: any;
  primaryButtonClass: any;
  primaryCloseoutMessage: any;
  ReceiptIcon: any;
  recordBlockingPhase: any;
  releaseAndReevaluateFromForm: any;
  resolveFailureByCorrectionReviewFromForm: any;
  revertOnTheWayFromForm: any;
  scheduleRetestNowFromForm: any;
  secondaryButtonClass: any;
  serviceAddressDisplay: any;
  serviceAddressLine1: any;
  serviceAddressLine2: any;
  serviceCity: any;
  serviceFollowUpProgressState: any;
  serviceLocationUpdatedBannerMessage: any;
  serviceLocationEditHref: any;
  serviceState: any;
  serviceZip: any;
  SettingsIcon: any;
  sharedNoteBannerMessage: any;
  sharedNoteBannerType: any;
  sharedNotesMeta: any;
  shouldShowWorkSummary: any;
  showCertsPermitRequiredBlocker: any;
  showConfirmRetestReady: any;
  showCorrectionReviewResolution: any;
  showDifferentIssueFoundOutcome: any;
  showExternalDataEntryPrompt: any;
  showFieldOutcomePanel: any;
  showInternalInvoicePanel: any;
  showInternalInvoicingPlaceholder: any;
  showLinkedRetestCreated: any;
  showMobileContractorContext: any;
  showMobileEccTestAction: any;
  showMobileInvoiceOpenAttention: any;
  showMobileServiceInvoiceFieldAction: any;
  showPrimaryCloseoutBlockers: any;
  showRetestSection: any;
  showSharedNotesCard: any;
  sp: any;
  SubmitButton: any;
  suggestedNextDueProjection: any;
  surfaceProfile: any;
  Suspense: any;
  tab: any;
  TimedJobLocationPreview: any;
  TimedServiceStatusActions: any;
  timeToTimeInput: any;
  timingEnabled: any;
  ToolIcon: any;
  UnscheduleButton: any;
  updateJobOpsFromForm: any;
  updateJobScheduleFromForm: any;
  updateJobVisitScopeFromForm: any;
  visitReasonText: any;
  visitScopeCount: any;
  visitScopeItems: any;
  visitScopeItemsJsonForInlineEdit: any;
  VisitScopeJobDetailForm: any;
  visitScopePricebookTemplates: any;
  visitScopeSummary: any;
  WarningIcon: any;
  workspaceEmptyStateClass: any;
  workspaceFieldLabelClass: any;
  workspaceInputClass: any;
  workspaceTextareaClass: any;
};

export default function MobileJobDetailCurrent(props: MobileJobDetailCurrentProps) {
  const {
    activeWaitingState,
    addPublicNoteFromForm,
    appointmentDateLabel,
    assignedTeam,
    AssignedTeamControls,
    assignedUserIds,
    attemptCount,
    banner,
    billingMode,
    billingState,
    canShowCertsButton,
    canShowEccFailedReasonBanner,
    canShowInvoiceButton,
    canShowReleaseAndReevaluate,
    ChatIcon,
    ChevronRightIcon,
    ClipboardIcon,
    ClockIcon,
    closeoutNeeds,
    compactWorkspaceActionButtonClass,
    completeDataEntryFromForm,
    completionActionAttentionBanner,
    confirmEccRetestReadyFromForm,
    confirmedNextDueContext,
    ConfirmNextDueDateActionButton,
    ContactLoggingQuickActions,
    contractorName,
    createEstimateFromJobHref,
    createInternalInvoiceDraftFromForm,
    createNextServiceVisitFromForm,
    createRetestJobFromForm,
    currentInterruptState,
    darkButtonClass,
    DeferredInternalNoteMentionComposer,
    DeferredInternalNotesBody,
    DeferredSharedNotesBody,
    DeferredTimelineBody,
    displayDateLA,
    failedReasonBannerText,
    fieldHeaderTitle,
    FieldOutcomePanel,
    FlashBanner,
    FolderIcon,
    formatDateOnlyUs,
    formatVisitScopeItemKindLabel,
    hasDirectInvoiceWorkflowAccess,
    hasDirectNarrativeChain,
    hasFullSchedule,
    hasVisitScopeDefined,
    headerJobTypeLabel,
    ImmediateSubmitButton,
    initialInterruptReason,
    initialWaitingOtherReason,
    initialWaitingReasonType,
    internalInvoiceTruth,
    internalNoteBannerMessage,
    internalNoteBannerType,
    internalNotesMeta,
    internalUser,
    interruptReleaseActionLabel,
    InterruptStateFields,
    isCleaningMode,
    isEccPermitNeededActive,
    isFieldComplete,
    isHistoricalServiceFollowUpContinued,
    isInternalUser,
    isServiceFieldFollowUpPendingInfo,
    job,
    JobFieldActionButton,
    jobHeaderReference,
    JobLocationPreviewFallback,
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
    markCertsCompleteFromForm,
    markEccPermitAvailableFromForm,
    markInvoiceCompleteFromForm,
    markJobFieldCompleteFromForm,
    markServiceApprovalReceivedFromForm,
    markServicePartArrivedFromForm,
    markServicePartOrderedFromForm,
    MarkVisitCountedActionButton,
    markVisitCountedAgreementName,
    markVisitCountedLinkId,
    MessageIcon,
    mobileAppointmentTimeLabel,
    mobileAttentionActionClass,
    mobileAttentionStripClass,
    mobileCallHref,
    mobileCurrentStatusLabel,
    mobileCustomerHref,
    mobileDisabledActionClass,
    mobileFieldActionClass,
    mobileInvoiceActionRelevant,
    mobileMutedToolLinkClass,
    mobileSectionClass,
    mobileTextHref,
    mobileToolLinkClass,
    NarrativeNotesBodyFallback,
    narrativeScopeJobIds,
    NarrativeTimelineBodyFallback,
    onTheWayUndoEligibility,
    permitDateLabel,
    permitJurisdiction,
    permitNumber,
    permitSummaryLabel,
    PhoneIcon,
    primaryButtonClass,
    primaryCloseoutMessage,
    ReceiptIcon,
    recordBlockingPhase,
    releaseAndReevaluateFromForm,
    resolveFailureByCorrectionReviewFromForm,
    revertOnTheWayFromForm,
    scheduleRetestNowFromForm,
    secondaryButtonClass,
    serviceAddressDisplay,
    serviceAddressLine1,
    serviceAddressLine2,
    serviceCity,
    serviceFollowUpProgressState,
    serviceLocationUpdatedBannerMessage,
    serviceLocationEditHref,
    serviceState,
    serviceZip,
    SettingsIcon,
    sharedNoteBannerMessage,
    sharedNoteBannerType,
    sharedNotesMeta,
    shouldShowWorkSummary,
    showCertsPermitRequiredBlocker,
    showConfirmRetestReady,
    showCorrectionReviewResolution,
    showDifferentIssueFoundOutcome,
    showExternalDataEntryPrompt,
    showFieldOutcomePanel,
    showInternalInvoicePanel,
    showInternalInvoicingPlaceholder,
    showLinkedRetestCreated,
    showMobileContractorContext,
    showMobileEccTestAction,
    showMobileInvoiceOpenAttention,
    showMobileServiceInvoiceFieldAction,
    showPrimaryCloseoutBlockers,
    showRetestSection,
    showSharedNotesCard,
    sp,
    SubmitButton,
    suggestedNextDueProjection,
    surfaceProfile,
    Suspense,
    tab,
    TimedJobLocationPreview,
    TimedServiceStatusActions,
    timeToTimeInput,
    timingEnabled,
    ToolIcon,
    UnscheduleButton,
    updateJobOpsFromForm,
    updateJobScheduleFromForm,
    updateJobVisitScopeFromForm,
    visitReasonText,
    visitScopeCount,
    visitScopeItems,
    visitScopeItemsJsonForInlineEdit,
    VisitScopeJobDetailForm,
    visitScopePricebookTemplates,
    visitScopeSummary,
    WarningIcon,
    workspaceEmptyStateClass,
    workspaceFieldLabelClass,
    workspaceInputClass,
    workspaceTextareaClass,
  } = props;

  return (
      <div className="block min-h-screen bg-slate-50 px-3 py-3.5 text-slate-950 lg:hidden">
        <div className="mx-auto max-w-lg space-y-4">
          <section className="overflow-visible rounded-2xl border border-slate-200/80 bg-white shadow-[0_20px_48px_-34px_rgba(15,23,42,0.36)] ring-1 ring-blue-100/35">
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
                  serviceLocationEditHref && isInternalUser ? (
                    <Link
                      href={serviceLocationEditHref}
                      aria-label={`Edit service address: ${serviceAddressDisplay}`}
                      className="mt-2 flex items-start gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-900"
                    >
                      <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                      <span className="min-w-0 flex-1 break-words">{serviceAddressDisplay}</span>
                      <ChevronRightIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                    </Link>
                  ) : (
                    <div className="mt-2 flex items-start gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-sm font-medium text-slate-700">
                      <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                      <span className="break-words">{serviceAddressDisplay}</span>
                    </div>
                  )
                ) : null}
              </div>
            </div>

            <MobileJobSchedulePanel {...props} />
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

          {banner === "service_location_updated" ? (
            <FlashBanner type="success" message={serviceLocationUpdatedBannerMessage} />
          ) : null}

          {banner === "service_location_already_selected" ? (
            <FlashBanner type="warning" message="That service location is already selected for this job." />
          ) : null}

          {banner === "service_location_change_invalid" ? (
            <FlashBanner type="error" message="Could not change service location. Select a saved location for this same customer account." />
          ) : null}

          {banner === "on_the_way_reverted" ? (
            <FlashBanner type="success" message="On the Way was reverted." />
          ) : null}

          {banner === "visit_scope_saved" ? (
            <FlashBanner type="success" message={`${surfaceProfile.labels.workItems} saved.`} />
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
              message={`Callback visit created. This is an unscheduled office/dispatch item and will not appear in ${surfaceProfile.labels.fieldUser.toLowerCase()} My Work until scheduled and assigned.`}
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

          {banner === "different_issue_found_saved" ? (
            <FlashBanner
              type="success"
              message="Different issue noted. This callback/return visit is complete and office review is next; the original job history was not changed."
            />
          ) : null}

          {banner === "different_issue_found_callback_revisit_only" ? (
            <FlashBanner
              type="warning"
              message="Different Issue Found is only for callback or return visits. Use the normal follow-up options for first visits."
            />
          ) : null}

          {banner === "different_issue_found_service_only" ? (
            <FlashBanner
              type="warning"
              message="Different Issue Found is only available for service callback or return visits."
            />
          ) : null}

          {banner === "different_issue_found_note_required" ? (
            <FlashBanner
              type="warning"
              message="Add a short note explaining the different issue before routing this callback/return visit to office review."
            />
          ) : null}

          {banner === "different_issue_found_invalid_status" || banner === "different_issue_found_already_completed" ? (
            <FlashBanner
              type="warning"
              message="This callback/return visit cannot be routed as Different Issue Found from its current state."
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

          <MobileJobStatusActionSurface {...props} />
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

              {surfaceProfile.surfaces.equipment ? (
                <Link href={`/jobs/${job.id}/info?f=equipment`} className={mobileFieldActionClass}>
                  <span className="inline-flex items-center gap-2">
                    <ToolIcon className="h-4.5 w-4.5" />
                    <span>Equipment</span>
                  </span>
                </Link>
              ) : (
                <a href="#mobile-work-scope" className={mobileFieldActionClass}>
                  <span className="inline-flex items-center gap-2">
                    <ToolIcon className="h-4.5 w-4.5" />
                    <span>{surfaceProfile.labels.visitScope}</span>
                  </span>
                </a>
              )}

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
                      <span>{jobPageInvoiceNextAction}</span>
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
                        <span>Create Invoice</span>
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
                    <span>Create Invoice</span>
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
                  <div className="text-xs text-slate-500">Location, contact, and team context.</div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
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

              {isCleaningMode ? (
                <div className="grid gap-2">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5 text-sm leading-6 text-emerald-950">
                    <div className="font-semibold">Checklist</div>
                    <p className="mt-0.5 text-emerald-900">Cleaning checklist support is coming next. Use Cleaning Tasks and notes for this rollout.</p>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm leading-6 text-slate-700">
                    <div className="font-semibold text-slate-900">Site Instructions</div>
                    <p className="mt-0.5">Use location notes and job notes for access, alarm, parking, and supply details.</p>
                  </div>
                  <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-3 py-2.5 text-sm leading-6 text-blue-950">
                    <div className="font-semibold">Quality Review</div>
                    <p className="mt-0.5 text-blue-900">Use notes/photos for quality issues until inspection support is added.</p>
                  </div>
                </div>
              ) : null}

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

              <div id="assigned-team" className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-3">
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
                />
              </div>
            </div>
          </section>

          {showMobileContractorContext ? (
            <section className="rounded-2xl border border-slate-200/90 bg-white px-4 py-3 shadow-[0_14px_26px_-28px_rgba(15,23,42,0.28)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Contractor</div>
              <div className="mt-1 text-base font-semibold text-slate-950">{contractorName || "Assigned contractor"}</div>
            </section>
          ) : null}

          {(sp?.schedule_required === "1" || activeWaitingState || showExternalDataEntryPrompt || showInternalInvoicingPlaceholder || showMobileInvoiceOpenAttention || markVisitCountedLinkId || suggestedNextDueProjection) ? (
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
                        <span>{internalInvoiceTruth ? jobPageInvoiceNextAction : "Create invoice"}</span>
                      </div>
                      {internalInvoiceTruth ? (
                        <Link href={`/jobs/${job.id}/invoice#invoice-workspace`} className="inline-flex min-h-9 items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-100">
                          {jobPageInvoiceNextAction}
                        </Link>
                      ) : (
                        <form action={createInternalInvoiceDraftFromForm} className="shrink-0">
                          <input type="hidden" name="job_id" value={job.id} />
                          <input type="hidden" name="tab" value={tab} />
                          <input type="hidden" name="return_to" value={`/jobs/${job.id}/invoice#invoice-workspace`} />
                          <input type="hidden" name="auto_import_visit_scope_items" value="1" />
                          <SubmitButton loadingText="Starting..." className="inline-flex min-h-9 items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-100">
                            Create invoice
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

          <MobileJobWorkScopePanel {...props} />

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
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_-20px_rgba(37,99,235,0.55)] transition-[background-color,box-shadow,transform] hover:bg-blue-800 hover:shadow-[0_16px_28px_-20px_rgba(37,99,235,0.65)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 active:translate-y-[0.5px]"
              >
                Attachments
              </Link>
            </div>
            <div className="mt-3 grid gap-3">
              <MobileJobTeamNotesPanel {...props} />

              {showSharedNotesCard ? <MobileJobSharedNotesPanel {...props} /> : null}
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
                  {surfaceProfile.surfaces.eccTests && job.job_type === "ecc" && !showMobileEccTestAction ? (
                    <Link href={`/jobs/${job.id}/tests`} className={mobileToolLinkClass}>ECC Test</Link>
                  ) : null}
                  {!showMobileServiceInvoiceFieldAction && showInternalInvoicePanel && mobileInvoiceActionRelevant ? (
                    internalInvoiceTruth ? (
                      <Link href={`/jobs/${job.id}/invoice#invoice-workspace`} className={mobileToolLinkClass}>
                        {jobPageInvoiceNextAction}
                      </Link>
                    ) : (
                      <form action={createInternalInvoiceDraftFromForm}>
                        <input type="hidden" name="job_id" value={job.id} />
                        <input type="hidden" name="tab" value={tab} />
                        <input type="hidden" name="return_to" value={`/jobs/${job.id}/invoice#invoice-workspace`} />
                        <input type="hidden" name="auto_import_visit_scope_items" value="1" />
                        <SubmitButton loadingText="Starting..." className={mobileToolLinkClass}>
                          Create Invoice
                        </SubmitButton>
                      </form>
                    )
                  ) : null}
                </div>
              </div>

              <div className="inline-flex items-center gap-1.5 pt-1 text-sm font-semibold tracking-[0.08em] text-slate-600"><SettingsIcon className="h-4 w-4" />Admin</div>

              {surfaceProfile.surfaces.permits ? (
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
              ) : null}

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

              {job.job_type === "ecc" && (showLinkedRetestCreated || showCorrectionReviewResolution) ? (
                <details className="group">
                  <summary className={`${mobileToolLinkClass} cursor-pointer list-none`}>
                    <span className="inline-flex items-center gap-2"><WarningIcon className="h-4.5 w-4.5" />Retest / Correction History</span>
                  </summary>
                  <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-3 space-y-3">
                    {showLinkedRetestCreated ? (
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                        <div className="font-semibold">{linkedRetestPassiveHeading}</div>
                        <div className="mt-1">{linkedRetestPassiveCopy}</div>
                      </div>
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
  );
}
