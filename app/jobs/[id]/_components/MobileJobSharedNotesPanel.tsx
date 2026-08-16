import InPlaceSharedNoteForm from "./InPlaceSharedNoteForm";

type MobileJobSharedNotesPanelProps = Record<string, any>;

export default function MobileJobSharedNotesPanel(props: MobileJobSharedNotesPanelProps) {
  const {
    ChatIcon,
    DeferredSharedNotesBody,
    FlashBanner,
    job,
    NarrativeNotesBodyFallback,
    narrativeScopeJobIds,
    hasDirectNarrativeChain,
    secondaryButtonClass,
    sharedNoteBannerMessage,
    sharedNoteBannerType,
    sharedNotesMeta,
    Suspense,
    tab,
    workspaceEmptyStateClass,
    workspaceTextareaClass,
  } = props;
  const presentation = props.presentation ?? "current";

  const sharedNotesList = (
    <Suspense fallback={<NarrativeNotesBodyFallback />}>
      <DeferredSharedNotesBody
        jobId={String(job.id)}
        timelineJobIds={narrativeScopeJobIds}
        hasDirectNarrativeChain={hasDirectNarrativeChain}
        emptyStateClassName={workspaceEmptyStateClass}
      />
    </Suspense>
  );

  const sharedNotesBody = (
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
      {sharedNoteBannerMessage ? (
        <FlashBanner
          type={sharedNoteBannerType as "success" | "warning" | "error"}
          message={sharedNoteBannerMessage}
        />
      ) : null}
      {/* Piloted in-place surface: saves without a navigation and renders its
          own feedback, so no ?banner= round trip is needed. */}
      <InPlaceSharedNoteForm
        jobId={String(job.id)}
        tab={String(tab)}
        textareaClassName={workspaceTextareaClass}
        buttonClassName={secondaryButtonClass}
      />
      {sharedNotesList}
    </div>
  );

  if (presentation === "v2TargetPanel") {
    return (
      <section
        id="mobile-shared-notes"
        className="hidden scroll-mt-4 rounded-2xl border border-slate-200/90 bg-white px-3.5 py-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.3)] target:block min-[390px]:px-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex min-w-0 items-center gap-2 text-base font-semibold text-slate-950">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <ChatIcon className="h-4 w-4" />
            </span>
            <span>Shared Notes</span>
          </div>
          <a
            href="#mobile-shared-notes-row"
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
          >
            Close
          </a>
        </div>
        <div className="mt-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
          {sharedNotesMeta || "Shared"}
        </div>
        {sharedNotesBody}
      </section>
    );
  }

  return (
    <details
      id="mobile-shared-notes"
      className="rounded-xl border border-slate-200/80 bg-white px-3 py-3 shadow-[0_10px_22px_-24px_rgba(15,23,42,0.22)]"
      open={Boolean(sharedNoteBannerMessage)}
    >
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-base font-semibold text-slate-950">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <ChatIcon className="h-3.5 w-3.5" />
            </span>
            <span>Shared Notes</span>
          </div>
          <div className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
            {sharedNotesMeta || "Shared"}
          </div>
        </div>
      </summary>
      {sharedNotesBody}
    </details>
  );
}
