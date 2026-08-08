import { resolveVisitScopeItemPriceDisplay } from "@/lib/business/visit-scope-billing";

type MobileJobWorkScopePanelProps = Record<string, any>;

// Pricebook items copy their name into the description, so title and details land
// on screen as the same sentence twice. Only render details when they add something.
function isEchoOf(candidate: unknown, source: unknown) {
  const normalize = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const normalizedCandidate = normalize(candidate);
  return normalizedCandidate.length > 0 && normalizedCandidate === normalize(source);
}

function MobileJobWorkScopeBody(props: MobileJobWorkScopePanelProps) {
  const {
    formatVisitScopeItemKindLabel,
    hasVisitScopeDefined,
    isInternalUser,
    job,
    jobTitleText,
    primaryButtonClass,
    SubmitButton,
    tab,
    updateJobVisitScopeFromForm,
    unlinkedInvoiceCharges,
    visitReasonText,
    visitScopeBilledLines,
    visitScopeItems,
    visitScopeItemsJsonForInlineEdit,
    VisitScopeJobDetailForm,
    visitScopePricebookTemplates,
    visitScopeSummary,
  } = props;
  const normalizedStatus = String(job?.status ?? "").trim().toLowerCase();
  const normalizedOpsStatus = String(job?.ops_status ?? "").trim().toLowerCase();
  const showWorkSummary = Boolean(
    job?.field_complete || normalizedStatus === "completed" || normalizedOpsStatus === "closed",
  );

  return (
    <>
      {String(job?.service_visit_reason ?? "").trim() && !isEchoOf(visitReasonText, jobTitleText) ? (
        <div id="mobile-visit-reason-card" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <div className="text-sm font-semibold text-slate-500">Visit Reason</div>
          <div className="mt-1 whitespace-pre-wrap break-words text-base leading-6 text-slate-800">{visitReasonText}</div>
        </div>
      ) : null}

      {visitScopeItems.length > 0 ? (
        <div className="space-y-2">
          {visitScopeItems.map((item: any, index: number) => {
            // Once this Work Item has been imported onto an invoice, the charge is the
            // money truth and the row shows it — the captured price on the job is a
            // frozen snapshot that invoice edits never write back to.
            const priceDisplay = resolveVisitScopeItemPriceDisplay({
              itemId: item.id,
              expectedUnitPrice: item.expected_unit_price,
              expectedQuantity: item.expected_quantity,
              billedLines: visitScopeBilledLines,
            });
            // Slice B cleanup (Fix 4): removal re-saves visit_scope_items without this row
            // through the same updateJobVisitScopeFromForm action the Adjust Work builder uses.
            const remainingItemsJson = JSON.stringify(
              visitScopeItems.filter((_: any, idx: number) => idx !== index),
            );
            return (
              <div key={`mobile-primary-${index}-${item.title}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_10px_22px_-24px_rgba(15,23,42,0.24)]">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 text-base font-semibold leading-6 text-slate-950">{item.title}</div>
                  {priceDisplay.state !== "none" ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      {priceDisplay.badgeLabel ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                          {priceDisplay.badgeLabel}
                        </span>
                      ) : null}
                      <span
                        className={
                          priceDisplay.state === "billed"
                            ? "rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-900"
                            : "rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500"
                        }
                      >
                        {priceDisplay.amountText}
                      </span>
                    </div>
                  ) : null}
                </div>
                {priceDisplay.mathText ? (
                  <div
                    className={`mt-1 text-sm font-semibold ${
                      priceDisplay.state === "billed" ? "text-slate-700" : "text-slate-500"
                    }`}
                  >
                    {priceDisplay.mathText}
                  </div>
                ) : null}
                {item.kind === "companion_service" ? (
                  <div className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {formatVisitScopeItemKindLabel(item.kind)}
                  </div>
                ) : null}
                {item.details && !isEchoOf(item.details, item.title) ? (
                  <div className="mt-1 whitespace-pre-wrap break-words text-base leading-6 text-slate-700">{item.details}</div>
                ) : null}
                {isInternalUser ? (
                  <form action={updateJobVisitScopeFromForm} className="mt-2 flex justify-end">
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="tab" value={tab} />
                    <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#mobile-work-scope`} />
                    <input type="hidden" name="visit_scope_summary" value={visitScopeSummary ?? ""} />
                    <input type="hidden" name="visit_scope_items_json" value={remainingItemsJson} />
                    <button type="submit" className="text-xs font-semibold text-rose-600 hover:text-rose-700">
                      Remove
                    </button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Charges added straight onto the invoice have no Work Item to hang off, but
          the tech still needs to see them — without these the list reads as the whole
          job while the billing total below it says something larger. */}
      {(unlinkedInvoiceCharges ?? []).length > 0 ? (
        <div className="space-y-2">
          {(unlinkedInvoiceCharges ?? []).map((charge: any, index: number) => (
            <div
              key={`mobile-invoice-charge-${index}-${charge.title}`}
              className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-3 py-2.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 text-base font-semibold leading-6 text-slate-950">{charge.title}</div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                    Billed
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-900">
                    {charge.amountText}
                  </span>
                </div>
              </div>
              {charge.mathText ? (
                <div className="mt-1 text-sm font-semibold text-slate-700">{charge.mathText}</div>
              ) : null}
              <div className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                {charge.sourceLabel}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {showWorkSummary && (visitScopeSummary || isInternalUser) ? (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          {/* Was a collapsed disclosure that swapped the saved summary out for the
              form on open, so neither the text nor the field was visible without a
              tap. The textarea carries the saved text, so showing it outright covers
              both reading it and adding to it. */}
          {isInternalUser ? (
            <form action={updateJobVisitScopeFromForm}>
              <input type="hidden" name="job_id" value={job.id} />
              <input type="hidden" name="tab" value={tab} />
              <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#mobile-work-scope`} />
              <input type="hidden" name="visit_scope_items_json" value={visitScopeItemsJsonForInlineEdit} />
              <label className="block text-base font-semibold text-slate-900">Work Summary</label>
              {/* The guidance lives in the field itself: it was a separate paragraph
                  under a heading that already said "Work Summary", so the block spent
                  three lines before reaching anywhere you could type. */}
              <textarea
                name="visit_scope_summary"
                defaultValue={visitScopeSummary ?? ""}
                rows={4}
                maxLength={600}
                placeholder="Briefly describe what happened, what you found, and what work was completed."
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base leading-6 text-slate-900 shadow-sm"
              />
              <SubmitButton loadingText="Saving..." className={`${primaryButtonClass} mt-3`}>Save Work Summary</SubmitButton>
            </form>
          ) : (
            <>
              <div className="text-base font-semibold text-slate-900">Work Summary</div>
              <div className="mt-2 whitespace-pre-wrap break-words text-base leading-6 text-slate-700">
                {visitScopeSummary || "No work summary saved yet."}
              </div>
            </>
          )}
        </div>
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
  } = props;
  const presentation = props.presentation ?? "current";

  if (presentation === "v2DisclosurePanel") {
    return (
      // The card this renders inside is already headed "Work Performed", so the
      // second header restated it. The body is the content.
      <div id="mobile-work-scope" className="space-y-3 px-3 py-3">
        <MobileJobWorkScopeBody {...props} />
      </div>
    );
  }

  if (presentation === "v2InlineBody") {
    return (
      <div id="mobile-work-scope" className="space-y-3 rounded-2xl border border-slate-200 px-3 py-3">
        <MobileJobWorkScopeBody {...props} />
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
              <Link href={`/jobs/${job.id}/invoice?invoice_id=${encodeURIComponent(String(internalInvoiceTruth.id))}#invoice-workspace`} className={`${mobileFieldActionClass} mt-3 w-full`}>
                <span className="inline-flex items-center gap-2">
                  <ReceiptIcon className="h-4.5 w-4.5" />
                  <span>View Invoice</span>
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
