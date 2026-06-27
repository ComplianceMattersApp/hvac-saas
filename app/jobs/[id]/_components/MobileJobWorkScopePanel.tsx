type MobileJobWorkScopePanelProps = Record<string, any>;

function MobileJobWorkScopeBody(props: MobileJobWorkScopePanelProps) {
  const {
    formatVisitScopeItemKindLabel,
    hasVisitScopeDefined,
    isInternalUser,
    job,
    primaryButtonClass,
    shouldShowWorkSummary,
    SubmitButton,
    tab,
    updateJobVisitScopeFromForm,
    visitReasonText,
    visitScopeItems,
    visitScopeItemsJsonForInlineEdit,
    VisitScopeJobDetailForm,
    visitScopePricebookTemplates,
    visitScopeSummary,
  } = props;

  return (
    <>
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
          {visitScopeItems.map((item: any, index: number) => (
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
    </>
  );
}

export default function MobileJobWorkScopePanel(props: MobileJobWorkScopePanelProps) {
  const {
    createInternalInvoiceDraftFromForm,
    hasDirectInvoiceWorkflowAccess,
    internalInvoiceTruth,
    job,
    jobPageInvoiceNextAction,
    jobPageInvoiceStateLabel,
    jobPageInvoiceSummaryText,
    Link,
    mobileFieldActionClass,
    mobileSectionClass,
    ReceiptIcon,
    showInternalInvoicePanel,
    SubmitButton,
    tab,
    ToolIcon,
    visitScopeCount,
    disclosureHelper,
    disclosureLabel,
    previewPillClass,
    previewRowClass,
    previewRowTextClass,
  } = props;
  const presentation = props.presentation ?? "current";

  if (presentation === "v2DisclosurePanel") {
    return (
      <div id="mobile-work-scope">
        <div className={previewRowClass ?? ""}>
          <span className={previewRowTextClass ?? ""}>
            <span className="block font-semibold text-slate-950">{disclosureLabel ?? "Work details"}</span>
            <span className="block text-sm text-slate-600">
              {disclosureHelper ?? `${visitScopeCount} item${visitScopeCount === 1 ? "" : "s"} recorded`}
            </span>
          </span>
          <span className={previewPillClass ?? ""}>Details</span>
        </div>
        <div className="space-y-3 border-t border-slate-200 px-3 py-3">
          <MobileJobWorkScopeBody {...props} />
        </div>
      </div>
    );
  }

  if (presentation === "v2TargetPanel") {
    return (
      <div
        id="mobile-work-scope"
        className="hidden scroll-mt-4 border-t border-slate-200 pt-4 target:block"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-[#0f1f35]">Work details</div>
            <div className="mt-0.5 text-sm text-slate-600">
              {visitScopeCount} item{visitScopeCount === 1 ? "" : "s"} added
            </div>
          </div>
          <a
            href="#mobile-work-scope-row"
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
          >
            Close
          </a>
        </div>
        <div className="space-y-3 border-t border-slate-200 pt-3">
          <MobileJobWorkScopeBody {...props} />
        </div>
      </div>
    );
  }

  return (
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
        {showInternalInvoicePanel ? (
          <div id="mobile-invoice-summary-card" className="rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-3 shadow-[inset_3px_0_0_rgba(37,99,235,0.16)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-blue-700">Invoice</div>
                <div className="mt-1 text-base font-semibold leading-6 text-slate-950">{jobPageInvoiceStateLabel}</div>
                <div className="mt-1 break-words text-sm leading-5 text-slate-700">{jobPageInvoiceSummaryText}</div>
              </div>
              <ReceiptIcon className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
            </div>
            {internalInvoiceTruth ? (
              <Link href={`/jobs/${job.id}/invoice#invoice-workspace`} className={`${mobileFieldActionClass} mt-3 w-full`}>
                <span className="inline-flex items-center gap-2">
                  <ReceiptIcon className="h-4.5 w-4.5" />
                  <span>{jobPageInvoiceNextAction}</span>
                </span>
              </Link>
            ) : hasDirectInvoiceWorkflowAccess ? (
              <form action={createInternalInvoiceDraftFromForm} className="mt-3">
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="tab" value={tab} />
                <input type="hidden" name="return_to" value={`/jobs/${job.id}/invoice#invoice-workspace`} />
                <input type="hidden" name="auto_import_visit_scope_items" value="1" />
                <SubmitButton loadingText="Starting..." className={`${mobileFieldActionClass} w-full`}>
                  <span className="inline-flex items-center gap-2">
                    <ReceiptIcon className="h-4.5 w-4.5" />
                    <span>{jobPageInvoiceNextAction}</span>
                  </span>
                </SubmitButton>
              </form>
            ) : null}
          </div>
        ) : null}

        <MobileJobWorkScopeBody {...props} />
      </div>
    </section>
  );
}
