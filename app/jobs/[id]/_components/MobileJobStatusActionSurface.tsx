type MobileJobStatusActionSurfaceProps = Record<string, any>;

export default function MobileJobStatusActionSurface(props: MobileJobStatusActionSurfaceProps) {
  const {
    billingState,
    canShowCertsButton,
    canShowEccFailedReasonBanner,
    canShowInvoiceButton,
    ChevronRightIcon,
    closeoutNeeds,
    compactWorkspaceActionButtonClass,
    completeDataEntryFromForm,
    completionActionAttentionBanner,
    confirmEccRetestReadyFromForm,
    createInternalInvoiceDraftFromForm,
    createNextServiceVisitFromForm,
    createRetestJobFromForm,
    darkButtonClass,
    failedReasonBannerText,
    FieldOutcomePanel,
    hasFullSchedule,
    ImmediateSubmitButton,
    internalInvoiceTruth,
    isCleaningMode,
    isEccPermitNeededActive,
    isFieldComplete,
    isHistoricalServiceFollowUpContinued,
    isServiceFieldFollowUpPendingInfo,
    job,
    JobFieldActionButton,
    jobPageInvoiceNextAction,
    Link,
    markCertsCompleteFromForm,
    markEccPermitAvailableFromForm,
    markInvoiceCompleteFromForm,
    markJobFieldCompleteFromForm,
    markServiceApprovalReceivedFromForm,
    markServicePartArrivedFromForm,
    markServicePartOrderedFromForm,
    mobileCurrentStatusLabel,
    onTheWayUndoEligibility,
    primaryCloseoutMessage,
    revertOnTheWayFromForm,
    scheduleRetestNowFromForm,
    secondaryButtonClass,
    serviceFollowUpProgressState,
    showCertsPermitRequiredBlocker,
    showConfirmRetestReady,
    showDifferentIssueFoundOutcome,
    showExternalDataEntryPrompt,
    showFieldOutcomePanel,
    showPrimaryCloseoutBlockers,
    showRetestSection,
    SubmitButton,
    surfaceProfile,
    tab,
    updateJobOpsDetailsFromForm,
  } = props;

  return (
    <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_18px_36px_-30px_rgba(29,78,216,0.32)]">
      <div className="h-[3px] bg-[linear-gradient(90deg,#0f1f35,#2563eb)]" />
      <div className="px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 text-lg font-semibold text-[#0f1f35]">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#0f1f35] text-blue-100">
                <ChevronRightIcon className="h-4 w-4" />
              </span>
              <span>{mobileCurrentStatusLabel}</span>
            </div>
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

        {canShowEccFailedReasonBanner ? (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm leading-5 text-rose-950">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-rose-800">Failed reason</div>
            <div className="mt-1 font-semibold">{failedReasonBannerText}</div>
            <details id="mobile-failed-reason-editor" className="group mt-2 rounded-lg border border-rose-200 bg-white/80 p-2.5">
              <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-rose-800 underline-offset-2 hover:underline">
                <span>Edit failed reason</span>
                <span className="text-slate-500 group-open:hidden">Open</span>
                <span className="hidden text-slate-500 group-open:inline">Close</span>
              </summary>
              <form action={updateJobOpsDetailsFromForm} className="mt-3 grid gap-2">
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#mobile-failed-reason-editor`} />
                <label className="text-sm font-semibold text-slate-700">Failed reason banner</label>
                <textarea
                  name="next_action_note"
                  defaultValue={job.next_action_note ?? ""}
                  maxLength={240}
                  rows={3}
                  className="min-h-[6rem] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
                  placeholder="Waiting on correction photos"
                />
                <p className="text-xs leading-5 text-slate-600">
                  Shown on internal Failed queue cards so office users know what is needed without opening the job.
                </p>
                <SubmitButton loadingText="Saving..." className={`${darkButtonClass} min-h-11 w-full`}>
                  Save Failed Reason
                </SubmitButton>
              </form>
            </details>
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
                completeLabel={surfaceProfile.labels.finishComplete}
                completedLabel={surfaceProfile.labels.finishComplete}
              />
              {showFieldOutcomePanel ? (
                <FieldOutcomePanel
                  anchorId="field-outcome"
                  jobId={String(job.id)}
                  currentStatus={String(job.status ?? "")}
                  tab={tab}
                  isEccJob={job.job_type === "ecc"}
                  showDifferentIssueFoundOutcome={showDifferentIssueFoundOutcome}
                  labels={{
                    partsNeeded: surfaceProfile.labels.needParts,
                    approvalNeeded: isCleaningMode ? "Office / Client Approval Needed" : "Approval Needed",
                  }}
                />
              ) : null}
            </div>
          ) : isEccPermitNeededActive && !showPrimaryCloseoutBlockers ? (
            <div
              id="mobile-ecc-permit-needed-action"
              className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/90 px-3.5 py-3 text-sm text-amber-950"
            >
              <div>
                <div className="font-semibold">Permit Needed</div>
                <p className="mt-1 text-sm leading-6 text-amber-900/90">
                  Add the permit number to continue cert closeout. Invoice work remains separate.
                </p>
              </div>
              <details className="group rounded-xl border border-amber-200 bg-white/90 p-3.5 shadow-sm">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-base font-semibold text-slate-900">
                  <span>Permit Available</span>
                  <span className="text-sm font-medium text-slate-500 group-open:hidden">Add permit</span>
                  <span className="hidden text-sm font-medium text-slate-500 group-open:inline">Close</span>
                </summary>
                <form action={markEccPermitAvailableFromForm} className="mt-3 space-y-3.5">
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#mobile-ecc-permit-needed-action`} />
                  <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                    Permit Number
                    <input
                      type="text"
                      name="permit_number"
                      required
                      maxLength={80}
                      defaultValue={job.permit_number ?? ""}
                      className="min-h-12 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-base font-normal text-slate-900 shadow-sm"
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                    Jurisdiction
                    <input
                      type="text"
                      name="jurisdiction"
                      maxLength={120}
                      defaultValue={job.jurisdiction ?? ""}
                      className="min-h-12 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-base font-normal text-slate-900 shadow-sm"
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                    Permit Date
                    <input
                      type="date"
                      name="permit_date"
                      defaultValue={job.permit_date ?? ""}
                      className="min-h-12 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-base font-normal text-slate-900 shadow-sm"
                    />
                  </label>
                  <div className="border-t border-slate-100 pt-3">
                    <SubmitButton loadingText="Saving..." className={`${darkButtonClass} min-h-12 w-full`}>
                      Save Permit
                    </SubmitButton>
                  </div>
                </form>
              </details>
            </div>
          ) : showConfirmRetestReady ? (
            <div
              id="mobile-next-service-action"
              className="space-y-3 rounded-xl border border-orange-200 bg-orange-50/90 px-3.5 py-3 text-sm text-orange-950"
            >
              <div>
                <div className="font-semibold">Confirm Retest Ready</div>
                <p className="mt-1 text-sm leading-6 text-orange-900/90">
                  Confirm corrections are ready for another ECC test visit.
                </p>
              </div>
              <form action={confirmEccRetestReadyFromForm}>
                <input type="hidden" name="job_id" value={job.id} />
                <SubmitButton loadingText="Confirming..." className={`${darkButtonClass} min-h-12 w-full`}>
                  Confirm Retest Ready
                </SubmitButton>
              </form>
            </div>
          ) : showRetestSection ? (
            <div
              id="mobile-next-service-action"
              className="space-y-3 rounded-xl border border-orange-200 bg-orange-50/90 px-3.5 py-3 text-sm text-orange-950"
            >
              <div>
                <div className="font-semibold">Retest Ready</div>
                <p className="mt-1 text-sm leading-6 text-orange-900/90">
                  Schedule a linked retest now, or move it to the scheduling queue.
                </p>
              </div>
              <form action={scheduleRetestNowFromForm} className="space-y-3 rounded-xl border border-orange-200 bg-white/85 p-3">
                <input type="hidden" name="parent_job_id" value={job.id} />
                <label className="flex items-center gap-2 rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <input type="checkbox" name="copy_equipment" value="1" defaultChecked />
                  <span>Copy equipment from original</span>
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Date
                  <input
                    type="date"
                    name="scheduled_date"
                    required
                    className="min-h-12 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-base font-normal text-slate-900 shadow-sm"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Start
                  <input
                    type="time"
                    name="window_start"
                    className="min-h-12 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-base font-normal text-slate-900 shadow-sm"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  End
                  <input
                    type="time"
                    name="window_end"
                    className="min-h-12 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-base font-normal text-slate-900 shadow-sm"
                  />
                </label>
                <SubmitButton loadingText="Scheduling..." className={`${darkButtonClass} min-h-12 w-full`}>
                  Schedule Retest Now
                </SubmitButton>
                <SubmitButton
                  formNoValidate
                  formAction={async (formData: FormData) => {
                    "use server";
                    await createRetestJobFromForm(formData);
                  }}
                  loadingText="Creating..."
                  className={`${secondaryButtonClass} min-h-12 w-full`}
                >
                  Move to Needs Scheduling
                </SubmitButton>
              </form>
            </div>
          ) : isHistoricalServiceFollowUpContinued && serviceFollowUpProgressState.reason ? (
            <div
              id="mobile-next-service-action"
              className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/85 px-3.5 py-3 text-sm text-emerald-950"
            >
              <div className="font-semibold">Follow-up continued through linked return visit</div>
              <div className="text-sm leading-6 text-emerald-900/90">
                Outcome: {serviceFollowUpProgressState.reason.label}. Reason: {serviceFollowUpProgressState.reason.reason || serviceFollowUpProgressState.reason.display}
              </div>
              {serviceFollowUpProgressState.progressLabel ? (
                <div className="inline-flex w-fit rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-emerald-900">
                  Progress: {serviceFollowUpProgressState.progressLabel}
                </div>
              ) : null}
              {serviceFollowUpProgressState.continuedThroughChildJobId ? (
                <Link
                  href={`/jobs/${serviceFollowUpProgressState.continuedThroughChildJobId}?tab=ops`}
                  className={`${secondaryButtonClass} min-h-12 w-full`}
                >
                  Open Linked Return Visit
                </Link>
              ) : null}
            </div>
          ) : isServiceFieldFollowUpPendingInfo && serviceFollowUpProgressState.reason ? (
            <div
              id="mobile-next-service-action"
              className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-3 text-sm"
            >
              <div className="font-semibold text-amber-950">{serviceFollowUpProgressState.reason.display}</div>
              {serviceFollowUpProgressState.progressLabel ? (
                <div className="inline-flex w-fit rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-amber-900">
                  Progress: {serviceFollowUpProgressState.progressLabel}
                </div>
              ) : null}
              <div className="text-sm leading-6 text-amber-900/90">
                {serviceFollowUpProgressState.returnPromptLabel ?? "Keep the original follow-up reason visible while office progress is tracked here."}
              </div>
              {serviceFollowUpProgressState.nextActionLabel ? (
                <div className="space-y-2">
                  {serviceFollowUpProgressState.nextActionLabel === "Mark Part Ordered" ? (
                    <form action={markServicePartOrderedFromForm}>
                      <input type="hidden" name="job_id" value={job.id} />
                      <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#mobile-next-service-action`} />
                      <SubmitButton loadingText="Saving..." className={`${secondaryButtonClass} min-h-12 w-full`}>
                        Mark Part Ordered
                      </SubmitButton>
                    </form>
                  ) : null}
                  {serviceFollowUpProgressState.nextActionLabel === "Mark Part Arrived" ? (
                    <form action={markServicePartArrivedFromForm}>
                      <input type="hidden" name="job_id" value={job.id} />
                      <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#mobile-next-service-action`} />
                      <SubmitButton loadingText="Saving..." className={`${secondaryButtonClass} min-h-12 w-full`}>
                        Mark Part Arrived
                      </SubmitButton>
                    </form>
                  ) : null}
                  {serviceFollowUpProgressState.nextActionLabel === "Mark Approval Received" ? (
                    <form action={markServiceApprovalReceivedFromForm}>
                      <input type="hidden" name="job_id" value={job.id} />
                      <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#mobile-next-service-action`} />
                      <SubmitButton loadingText="Saving..." className={`${secondaryButtonClass} min-h-12 w-full`}>
                        Mark Approval Received
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              ) : null}
              {serviceFollowUpProgressState.bridgeActionLabel ? (
                <div className="space-y-3">
                  <form action={createNextServiceVisitFromForm}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="tab" value={tab} />
                    <input type="hidden" name="visit_intent" value="return_visit" />
                    <input type="hidden" name="return_creation_mode" value="needs_scheduling" />
                    <input type="hidden" name="follow_up_bridge_action" value="add_to_scheduling_queue" />
                    <input type="hidden" name="next_visit_reason" value={serviceFollowUpProgressState.reason.display} />
                    <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#mobile-next-service-action`} />
                    <SubmitButton loadingText="Adding..." className={`${darkButtonClass} min-h-12 w-full`}>
                      {serviceFollowUpProgressState.bridgeActionLabel}
                    </SubmitButton>
                  </form>
                  <details className="group rounded-xl border border-slate-200 bg-white/90 p-3.5 shadow-sm">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-base font-semibold text-slate-900">
                      <span>Schedule Return Visit Now</span>
                      <span className="text-sm font-medium text-slate-500 group-open:hidden">Choose date</span>
                      <span className="hidden text-sm font-medium text-slate-500 group-open:inline">Close</span>
                    </summary>
                    <form action={createNextServiceVisitFromForm} className="mt-3 space-y-3.5">
                      <input type="hidden" name="job_id" value={job.id} />
                      <input type="hidden" name="tab" value={tab} />
                      <input type="hidden" name="visit_intent" value="return_visit" />
                      <input type="hidden" name="return_creation_mode" value="schedule_now" />
                      <input type="hidden" name="follow_up_bridge_action" value="schedule_return_now" />
                      <input type="hidden" name="next_visit_reason" value={serviceFollowUpProgressState.reason.display} />
                      <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#mobile-next-service-action`} />
                      <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                        Date
                        <input
                          type="date"
                          name="scheduled_date"
                          required
                          className="min-h-12 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-base font-normal text-slate-900 shadow-sm"
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                        Start
                        <input
                          type="time"
                          name="window_start"
                          className="min-h-12 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-base font-normal text-slate-900 shadow-sm"
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                        End
                        <input
                          type="time"
                          name="window_end"
                          className="min-h-12 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-base font-normal text-slate-900 shadow-sm"
                        />
                      </label>
                      <div className="border-t border-slate-100 pt-3">
                        <SubmitButton loadingText="Scheduling..." className={`${secondaryButtonClass} min-h-12 w-full`}>
                          Schedule Return Visit Now
                        </SubmitButton>
                      </div>
                    </form>
                  </details>
                </div>
              ) : null}
            </div>
          ) : showPrimaryCloseoutBlockers ? (
            <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-3">
              <span className="inline-flex min-h-12 w-full items-center justify-start rounded-xl border border-amber-200 bg-white/90 px-4 py-2.5 text-left text-base font-semibold text-amber-950">
                {primaryCloseoutMessage}
              </span>
              <div className="grid gap-2">
                {closeoutNeeds.needsInvoice && billingState.internalInvoicePanelEnabled ? (
                  internalInvoiceTruth ? (
                    <Link
                      href={`/jobs/${job.id}/invoice#invoice-workspace`}
                      className={`${darkButtonClass} min-h-12 w-full`}
                    >
                      {jobPageInvoiceNextAction}
                    </Link>
                  ) : (
                    <form action={createInternalInvoiceDraftFromForm}>
                      <input type="hidden" name="job_id" value={job.id} />
                      <input type="hidden" name="tab" value={tab} />
                      <input type="hidden" name="return_to" value={`/jobs/${job.id}/invoice#invoice-workspace`} />
                      <input type="hidden" name="auto_import_visit_scope_items" value="1" />
                      <SubmitButton loadingText="Starting..." className={`${darkButtonClass} min-h-12 w-full`}>
                        {jobPageInvoiceNextAction}
                      </SubmitButton>
                    </form>
                  )
                ) : null}
                {closeoutNeeds.needsInvoice && showExternalDataEntryPrompt && !canShowInvoiceButton ? (
                  <form action={completeDataEntryFromForm}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <ImmediateSubmitButton
                      type="submit"
                      pendingText="Saving..."
                      className={`${darkButtonClass} min-h-12 w-full`}
                    >
                      Mark External Billing Complete
                    </ImmediateSubmitButton>
                  </form>
                ) : null}
                {closeoutNeeds.needsInvoice && canShowInvoiceButton ? (
                  <form action={markInvoiceCompleteFromForm}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#field-status-actions`} />
                    <ImmediateSubmitButton
                      type="submit"
                      pendingText="Saving..."
                      className={`${darkButtonClass} min-h-12 w-full`}
                    >
                      Mark External Billing Complete
                    </ImmediateSubmitButton>
                  </form>
                ) : null}
                {closeoutNeeds.needsCerts && canShowCertsButton ? (
                  <form action={markCertsCompleteFromForm}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#field-status-actions`} />
                    <ImmediateSubmitButton
                      type="submit"
                      pendingText="Saving..."
                      className={`${darkButtonClass} min-h-12 w-full`}
                    >
                      Certs Sent
                    </ImmediateSubmitButton>
                  </form>
                ) : null}
                {showCertsPermitRequiredBlocker ? (
                  <span className="inline-flex min-h-12 w-full items-center justify-start rounded-xl border border-amber-200 bg-white/90 px-4 py-2.5 text-left text-sm font-semibold text-amber-950">
                    Permit number required before certs can be sent
                  </span>
                ) : null}
              </div>
            </div>
          ) : isFieldComplete || job.status === "completed" ? (
            <div className="space-y-2">
              <span className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-center text-base font-semibold text-emerald-900">
                {primaryCloseoutMessage}
              </span>
              {surfaceProfile.surfaces.eccTests && job.job_type === "ecc" ? (
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
  );
}
